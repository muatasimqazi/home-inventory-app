import { NextResponse } from "next/server";
import type { Category } from "@/lib/types";

export const runtime = "nodejs";

// Barcode -> product lookup endpoint for the barcode-scan capture flow
// (src/app/capture/barcode/), server-side so the browser never touches the
// upstream service directly. This is a plain product-database lookup, not
// an AI/vision call, so it deliberately lives outside lib/ai.ts and its
// HttpVisionProvider — a different kind of external dependency with its own
// tiny contract, not worth folding into that abstraction for one call site.
//
// Provider: UPCitemdb's public "trial" endpoint
// (https://www.upcitemdb.com/api/, /prod/trial/lookup). Chosen per the
// Vercel Marketplace flow (`vercel integration categories` / `discover`) —
// there is no `commerce`/`payments`/`searching`/`dev-tools` marketplace
// product that is a UPC/EAN product-data lookup (discover was run against
// all of those; the closest categories return checkout platforms like
// Shopify or AI web-search products like Exa/Algolia, none of which serve
// this), so this follows the same "direct external API, no marketplace
// integration exists" path already established in this codebase for
// RESEND_API_KEY / ACTIVITY_NOTIFY_WEBHOOK_SECRET etc. The trial endpoint
// requires NO API key or account signup (rate-limited to ~100 lookups/day,
// shared across requests from this server's outbound IP) — chosen
// specifically so this feature works out of the box with no credential
// setup the user would have to complete by hand. If that limit becomes a
// real problem in production, UPCitemdb's paid tier (a `user_key` query
// param against /prod/v1/lookup) is a drop-in upgrade — swap the URL below
// and add the key as an env var — but isn't wired up since it isn't needed
// for this to work today.
const UPCITEMDB_TRIAL_URL = "https://api.upcitemdb.com/prod/trial/lookup";

interface UpcItemDbItem {
  title?: string;
  brand?: string;
  category?: string;
  description?: string;
  images?: string[];
}

interface UpcItemDbResponse {
  code: string;
  total?: number;
  items?: UpcItemDbItem[];
}

export interface BarcodeLookupResult {
  code: string;
  found: boolean;
  suggestedName: string;
  brand: string | null;
  category: Category;
  description: string | null;
  /** data: URL of the product photo, fetched and inlined server-side (avoids the client having to deal with an arbitrary third-party image host / CORS). Null if the lookup found nothing, or the photo couldn't be fetched. */
  photo: string | null;
}

// Loose keyword match from UPCitemdb's free-text category string (and the
// title as a fallback) onto this app's fixed CATEGORIES union — a genuine
// product-data API has no notion of our category set, so this is a
// best-effort guess the user can freely correct on the review screen, same
// as every other pre-fill in this flow.
const CATEGORY_KEYWORDS: [Category, RegExp][] = [
  ["Appliance", /appliance/i],
  ["Electronics", /electronics|computer|phone|camera|audio|video game|television/i],
  ["Tool", /\btool|power tool/i],
  ["Kitchen", /kitchen|cookware|grocery|food|beverage/i],
  ["Clothing", /clothing|apparel|shoe|shirt|jacket/i],
  ["Toy", /\btoy/i],
  ["Sporting Goods", /sport|fitness|exercise/i],
  ["Hardware", /hardware|plumbing|electrical supplies/i],
  ["Outdoor", /outdoor|lawn|garden/i],
  ["Decor", /home & garden|decor|furniture/i],
];

function guessCategory(rawCategory: string | undefined, title: string | undefined): Category {
  const haystack = `${rawCategory ?? ""} ${title ?? ""}`;
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(haystack)) return category;
  }
  return "Miscellaneous";
}

// Barcodes are digits-only (UPC-A/UPC-E/EAN-13/EAN-8); manual entry and
// camera OCR misfires can both introduce stray whitespace, so strip
// anything that isn't a digit rather than rejecting the scan outright.
function normalizeCode(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

async function fetchPhotoDataUrl(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > 5_000_000) return null;
    return `data:${contentType};base64,${Buffer.from(buffer).toString("base64")}`;
  } catch {
    // A photo is a nice-to-have pre-fill, not a requirement — a fetch
    // failure here shouldn't fail the whole lookup.
    return null;
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawCode = (body as { code?: unknown } | null)?.code;
  if (typeof rawCode !== "string" || rawCode.trim() === "") {
    return NextResponse.json({ error: "`code` must be a non-empty string." }, { status: 400 });
  }

  const code = normalizeCode(rawCode);
  if (code.length < 6) {
    // Too short to be any real UPC/EAN — treat it the same as "not found"
    // rather than bothering the upstream service, since even a valid
    // lookup response would have nothing to tell us.
    return NextResponse.json<BarcodeLookupResult>({
      code,
      found: false,
      suggestedName: "",
      brand: null,
      category: "Miscellaneous",
      description: null,
      photo: null,
    });
  }

  // Bounded the same way fetchPhotoDataUrl already is below — this is the
  // hot path every single scan blocks on, and a hanging/slow upstream
  // response would otherwise tie up the request indefinitely with the
  // client's "Looking up this barcode…" spinner stuck with no way out.
  let upstream: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      upstream = await fetch(`${UPCITEMDB_TRIAL_URL}?upc=${encodeURIComponent(code)}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach the barcode lookup service. Check your connection and try again.", retryable: true },
      { status: 502 }
    );
  }

  let payload: UpcItemDbResponse | null = null;
  try {
    payload = (await upstream.json()) as UpcItemDbResponse;
  } catch {
    payload = null;
  }

  // A real service outage / quota exhaustion (as opposed to "this
  // particular code isn't in the database") — surface it as a retryable
  // error so the review screen's error state (not a silent "not found") is
  // what the user sees, since telling them "not found" here would be
  // misleading: we didn't actually get to check.
  const serviceCode = payload?.code ?? "";
  if (!upstream.ok && /QUOTA|UNAUTHORIZED|UNAVAILABLE|LIMIT/i.test(serviceCode)) {
    return NextResponse.json(
      { error: "Barcode lookup is temporarily unavailable — you can still add the item manually.", retryable: true },
      { status: 503 }
    );
  }
  if (upstream.status >= 500) {
    return NextResponse.json(
      { error: "Barcode lookup is temporarily unavailable — you can still add the item manually.", retryable: true },
      { status: 503 }
    );
  }

  const item = payload?.items?.[0];
  if (!upstream.ok || serviceCode !== "OK" || !item) {
    return NextResponse.json<BarcodeLookupResult>({
      code,
      found: false,
      suggestedName: "",
      brand: null,
      category: "Miscellaneous",
      description: null,
      photo: null,
    });
  }

  const suggestedName = item.title?.trim() || [item.brand, item.category].filter(Boolean).join(" ").trim();
  const firstImage = item.images?.find((src) => typeof src === "string" && src.startsWith("http"));
  const photo = firstImage ? await fetchPhotoDataUrl(firstImage) : null;

  return NextResponse.json<BarcodeLookupResult>({
    code,
    found: suggestedName.length > 0,
    suggestedName,
    brand: item.brand?.trim() || null,
    category: guessCategory(item.category, item.title),
    description: item.description?.trim() || null,
    photo,
  });
}
