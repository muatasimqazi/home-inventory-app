import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { buildOpenUrlShortcutPlist, shortcutWorkflowName } from "@/lib/apple-shortcut";

export const runtime = "nodejs";

// Real, downloadable .shortcut file for a bin — bug #6's "Install Shohaz
// Shortcut" previously just marked the tag as linked without producing
// anything real. RLS on `containers` (same as /c/[token]) already scopes
// this to households the signed-in user belongs to.
export async function GET(request: NextRequest, { params }: { params: Promise<{ containerId: string }> }) {
  const { containerId } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: container } = await supabase.from("containers").select("id, tag_token, display_code, name").eq("id", containerId).maybeSingle();
  if (!container) return NextResponse.json({ error: "Bin not found." }, { status: 404 });

  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL;
  const origin = configuredOrigin
    ? configuredOrigin.startsWith("http://") || configuredOrigin.startsWith("https://")
      ? configuredOrigin
      : `https://${configuredOrigin}`
    : request.nextUrl.origin;
  const resolveUrl = `${origin}/c/${container.tag_token}`;

  const code = container.display_code ?? container.tag_token;
  const workflowName = shortcutWorkflowName(code);
  const plist = buildOpenUrlShortcutPlist({ name: workflowName, url: resolveUrl });

  // Content-Disposition's filename= is a raw HTTP header value (ByteString,
  // Latin-1 only) — the workflow name's em dash isn't valid there even
  // though it's fine inside the plist body itself. ASCII fallback plus the
  // RFC 5987 filename*= form covers both strict and UTF-8-aware clients.
  const asciiFilename = `${workflowName.replace(/[^\x20-\x7e]/g, "-")}.shortcut`;
  const utf8Filename = encodeURIComponent(`${workflowName}.shortcut`);

  return new NextResponse(plist, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${utf8Filename}`,
      "Cache-Control": "no-store",
    },
  });
}
