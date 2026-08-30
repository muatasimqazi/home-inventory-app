"use client";

import { useState, useSyncExternalStore } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { buildBreadcrumb, breadcrumbLabel } from "@/lib/selectors";
import { containerResolveUrl } from "@/lib/urls";
import { cn } from "@/lib/utils";

type Platform = "ios" | "android" | "other";
type Screen = "setup" | "writing" | "linked";

// Real (if simple) capability detection — this determines which options are
// offered, not whether the underlying write is simulated: no browser can
// actually write NFC here without physical hardware, so "writing" is a
// timed simulation on every platform (same mock-hardware boundary as the
// rest of the app, e.g. MockVisionProvider). iOS never supports Web NFC at
// all (no browser exposes it) — Safari can't write a tag itself, full
// stop. A prior version of this screen worked around that with a
// downloadable Apple Shortcuts file, but Apple blocks importing unsigned
// shortcuts from arbitrary URLs (only iCloud-shared, Shortcuts-app-signed
// ones import), so that path can never actually work. iOS instead points
// at writing the tag from elsewhere — any *other* NFC writer (this app on
// Android, or a third-party writer app) can write a plain NDEF URL record,
// and iOS's own OS-level NFC reading (since iOS 11) opens that URL
// natively on tap, with no app or setup step needed on the iPhone itself.
function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

const noSubscription = () => () => {};

/** SSR renders "other" (no navigator); the client snapshot swaps in the real
 * platform post-hydration. useSyncExternalStore is the React-sanctioned way
 * to do this without the cascading-render footgun of setState-in-an-effect. */
function usePlatform(): Platform {
  return useSyncExternalStore(noSubscription, detectPlatform, () => "other");
}

export default function NfcSetupPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const containers = useInventoryStore((s) => s.containers);
  const locations = useInventoryStore((s) => s.locations);
  const linkNfcTag = useInventoryStore((s) => s.linkNfcTag);
  const unlinkNfcTag = useInventoryStore((s) => s.unlinkNfcTag);

  const container = containers.find((c) => c.id === params.id);
  const platform = usePlatform();

  const [screen, setScreen] = useState<Screen>(container?.nfcLinkedAt ? "linked" : "setup");
  const [writing, setWriting] = useState(false);

  if (!container) return notFound();

  const containerId = container.id;
  const breadcrumb = buildBreadcrumb(container.locationId, container.id, locations, containers);
  const code = container.displayCode ?? container.tagToken;
  const resolveUrl = containerResolveUrl(container.tagToken);

  function startWriting() {
    setScreen("writing");
  }

  function confirmWrite() {
    setWriting(true);
    setTimeout(() => {
      setWriting(false);
      linkNfcTag(containerId);
      toast.success("NFC tag linked");
      setScreen("linked");
    }, 1400);
  }

  function markTagWritten() {
    linkNfcTag(containerId);
    toast.success("NFC tag linked");
    setScreen("linked");
  }

  function goBack() {
    if (screen === "setup") {
      router.back();
    } else if (screen === "writing") {
      setScreen("setup");
    } else {
      router.push(`/containers/${containerId}`);
    }
  }

  const titles: Record<Screen, string> = {
    setup: platform === "android" ? "Android tag setup" : platform === "ios" ? "iOS tag setup" : "QR label",
    writing: "Write NFC",
    linked: "Tag linked",
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <button
          type="button"
          onClick={goBack}
          className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-surface-muted"
          aria-label="Back"
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <h1 className="text-body font-semibold text-ink">{titles[screen]}</h1>
      </header>

      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-4 pb-28">
        {screen === "setup" && platform !== "other" && (
          <SetupScreen
            platform={platform}
            code={code}
            resolveUrl={resolveUrl}
            breadcrumbText={breadcrumbLabel(breadcrumb)}
            container={container}
            onWriteNfc={startWriting}
          />
        )}

        {screen === "setup" && platform === "other" && (
          <QrOnlyScreen code={code} resolveUrl={resolveUrl} container={container} />
        )}

        {screen === "writing" && <WritingScreen code={code} resolveUrl={resolveUrl} writing={writing} />}

        {screen === "linked" && (
          <LinkedScreen
            code={code}
            resolveUrl={resolveUrl}
            breadcrumbText={breadcrumbLabel(breadcrumb)}
            container={container}
            onWriteDifferentTag={() => {
              unlinkNfcTag(containerId);
              setScreen("setup");
            }}
          />
        )}
      </div>

      <div className="sticky bottom-0 border-t border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          {screen === "setup" && platform === "ios" && (
            <>
              <Button size="lg" className="bg-ink-fill text-white hover:bg-ink-fill/90" onClick={markTagWritten}>
                I&apos;ve written this tag
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push(`/containers/${container.id}/label`)}>
                Print QR label instead
              </Button>
            </>
          )}
          {screen === "setup" && platform === "android" && (
            <>
              <Button size="lg" className="bg-ink-fill text-white hover:bg-ink-fill/90" onClick={startWriting}>
                Write NFC tag
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push(`/containers/${container.id}/label`)}>
                Print QR label instead
              </Button>
            </>
          )}
          {screen === "setup" && platform === "other" && (
            <>
              <Button size="lg" className="bg-ink-fill text-white hover:bg-ink-fill/90" onClick={() => router.push(`/containers/${container.id}/label`)}>
                Print QR label
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push(`/containers/${container.id}`)}>
                Back to container
              </Button>
            </>
          )}
          {screen === "writing" && (
            <>
              <Button size="lg" className="bg-ink-fill text-white hover:bg-ink-fill/90" onClick={confirmWrite} disabled={writing}>
                {writing ? <Icon name="spinner" size={16} className="animate-spin" /> : "Start writing"}
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push(`/containers/${container.id}/label`)} disabled={writing}>
                Print QR instead
              </Button>
            </>
          )}
          {screen === "linked" && (
            <>
              <Button size="lg" className="bg-ink-fill text-white hover:bg-ink-fill/90" onClick={() => router.push(`/containers/${container.id}/label`)}>
                Print labels
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push(`/containers/${container.id}`)}>
                Back to container
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ tone, children }: { tone: "neutral" | "green"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-lg px-3 py-1.5 text-micro font-semibold",
        tone === "green" ? "bg-badge-green-bg text-badge-green-text" : "bg-brand-100 text-brand-700"
      )}
    >
      {children}
    </span>
  );
}

function TagPreviewRow({ code, resolveUrl, qrSize = 112 }: { code: string; resolveUrl: string; qrSize?: number }) {
  return (
    <div className="flex items-center justify-center gap-6 py-2">
      <div className="rounded-lg border border-border bg-card p-2">
        <QRCodeSVG value={resolveUrl} size={qrSize} bgColor="#ffffff" fgColor="#212121" />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex size-20 items-center justify-center rounded-2xl border border-border bg-card">
          <Icon name="nfc" size={32} className="text-ink" />
        </div>
        <p className="font-mono text-micro font-semibold text-ink">{code}</p>
      </div>
    </div>
  );
}

function SetupScreen({
  platform,
  code,
  resolveUrl,
  breadcrumbText,
  container,
  onWriteNfc,
}: {
  platform: "ios" | "android";
  code: string;
  resolveUrl: string;
  breadcrumbText: string;
  container: { name: string; nfcLinkedAt: string | null };
  onWriteNfc: () => void;
}) {
  return (
    <>
      <div>
        <h2 className="text-screen-title font-semibold text-ink">NFC tag</h2>
        <p className="mt-1 text-body text-muted-foreground">
          {platform === "ios" ? "Write this tag from another device" : "Ready to write with Android NFC"} · {code}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <TagPreviewRow code={code} resolveUrl={resolveUrl} />
        <div className="mt-2 flex items-center justify-center gap-2">
          <StatusPill tone="neutral">QR ready</StatusPill>
          <StatusPill tone="green">NFC not linked</StatusPill>
        </div>
      </div>

      <h3 className="text-item-title font-semibold text-ink">Tag options</h3>

      {/* No browser exposes Web NFC on iOS at all, and Apple blocks
          importing unsigned Shortcuts files from arbitrary URLs — there is
          no in-app path that can actually write a tag from an iPhone. iOS
          does read plain NDEF URL records natively (since iOS 11, no app
          needed), so the real answer is "write it from elsewhere". */}
      {platform === "ios" ? (
        <>
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-100">
              <Icon name="smartphone" size={20} className="text-brand-700" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body font-semibold text-ink">iPhone can&apos;t write NFC tags directly</p>
              <p className="mt-1 text-caption text-muted-foreground">
                Write this container&apos;s link using Schuaz on an Android phone, or any third-party NFC writer app — once
                written, tapping the tag opens it on any iPhone natively, no app or setup step needed.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(resolveUrl);
              toast.success("Link copied");
            }}
            className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm"
          >
            <div className="min-w-0">
              <p className="text-body font-semibold text-ink">Copy container link</p>
              <p className="mt-1 truncate text-caption text-muted-foreground">{resolveUrl}</p>
            </div>
            <Icon name="copy" size={18} className="shrink-0 text-muted-foreground" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onWriteNfc}
          className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-100">
            <Icon name="nfc" size={20} className="text-brand-700" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-body font-semibold text-ink">Write container link to tag</span>
              <span className="rounded-md bg-ink-fill px-1.5 py-0.5 text-micro font-semibold text-white">Best</span>
            </span>
            <span className="mt-1 block text-caption text-muted-foreground">Writes the container link to a writable NFC tag.</span>
          </span>
        </button>
      )}

      {platform === "android" && (
        <div className="flex items-center gap-3 rounded-2xl border border-badge-green-border bg-badge-green-bg p-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-badge-green-border bg-card">
            <Icon name="nfc" size={20} className="text-badge-green-text" />
          </span>
          <div>
            <p className="text-body font-semibold text-ink">NFC is on</p>
            <p className="text-caption text-muted-foreground">If NFC is off, show a Turn on NFC prompt before this screen.</p>
          </div>
        </div>
      )}

      <p className="text-caption text-muted-foreground">
        Breadcrumb: {breadcrumbText} · {container.name}
      </p>
    </>
  );
}

function QrOnlyScreen({ code, resolveUrl, container }: { code: string; resolveUrl: string; container: { name: string } }) {
  return (
    <>
      <div>
        <h2 className="text-screen-title font-semibold text-ink">Print QR label</h2>
        <p className="mt-1 text-body text-muted-foreground">
          This device cannot link NFC tags. Use a QR label, or open Schuaz on a supported phone.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <span className="rounded-lg bg-brand-100 px-3 py-1.5 text-micro font-semibold text-brand-700">Web/Desktop · QR only</span>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <QRCodeSVG value={resolveUrl} size={158} bgColor="#ffffff" fgColor="#212121" />
        <span className="rounded-lg bg-badge-red-bg px-3 py-1.5 font-mono text-caption font-semibold text-badge-red-text">{code}</span>
        <p className="text-center text-caption text-muted-foreground">Print this QR code for {container.name}.</p>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-100">
          <Icon name="smartphone" size={20} className="text-brand-700" />
        </span>
        <div>
          <p className="text-body font-semibold text-ink">Want NFC too?</p>
          <p className="mt-1 text-caption text-muted-foreground">Use Schuaz on a supported phone to write or link tags.</p>
        </div>
      </div>
    </>
  );
}

function WritingScreen({ code, resolveUrl, writing }: { code: string; resolveUrl: string; writing: boolean }) {
  return (
    <>
      <div>
        <h2 className="text-screen-title font-semibold text-ink">Write container link to tag</h2>
        <p className="mt-1 text-body text-muted-foreground">This writes a direct Schuaz container link onto a writable NFC tag.</p>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-sm">
        <StepDot label="Review link" state="done" />
        <div className="h-px flex-1 bg-border" />
        <StepDot label="Hold tag" state={writing ? "active" : "pending"} />
        <div className="h-px flex-1 bg-border" />
        <StepDot label="Done" state="pending" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="text-micro font-semibold text-muted-foreground">NDEF URL</p>
        <p className="mt-1 break-all text-body font-semibold text-ink">{resolveUrl}</p>
        <p className="mt-1 text-caption text-muted-foreground">Anyone with access can open this container detail screen.</p>
      </div>

      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className={cn("flex size-20 items-center justify-center rounded-2xl border border-border bg-card", writing && "animate-pulse")}>
          <Icon name="nfc" size={32} className="text-ink" />
        </div>
        <p className="font-mono text-micro font-semibold text-ink">{code}</p>
        <p className="text-center text-caption text-muted-foreground">
          {writing ? "Hold your phone near the tag…" : "Hold your phone near the 25mm tag until the write completes."}
        </p>
      </div>

      <div className="rounded-xl border border-brand-200 bg-brand-100 p-3">
        <p className="text-caption text-brand-700">If the tag is read-only, print a QR label instead.</p>
      </div>
    </>
  );
}

function StepDot({ label, state }: { label: string; state: "done" | "active" | "pending" }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div
        className={cn(
          "flex size-6 items-center justify-center rounded-full text-micro font-bold",
          state === "done" ? "bg-brand-100 text-brand-700" : state === "active" ? "bg-yellow text-white" : "bg-surface-muted text-muted-foreground"
        )}
      >
        {state === "done" ? <Icon name="check" size={12} /> : null}
      </div>
      <p className={cn("text-micro font-semibold", state === "pending" ? "text-muted-foreground" : "text-ink")}>{label}</p>
    </div>
  );
}

/** Minimal Web NFC typing — NDEFReader isn't in TS's DOM lib. */
interface NDEFReadingLike {
  onreading: ((this: NDEFReadingLike, ev: unknown) => void) | null;
  onreadingerror: ((this: NDEFReadingLike, ev: unknown) => void) | null;
  scan(): Promise<void>;
}

async function testNfcScan(binName: string) {
  const NDEFReaderCtor = (window as unknown as { NDEFReader?: new () => NDEFReadingLike }).NDEFReader;
  if (!NDEFReaderCtor) {
    toast.error("NFC scanning isn't supported on this device/browser.");
    return;
  }
  try {
    const reader = new NDEFReaderCtor();
    await reader.scan();
    toast("Hold your phone near the tag…");
    const timeout = setTimeout(() => toast.error("No tag detected within 10s — try again."), 10_000);
    reader.onreading = () => {
      clearTimeout(timeout);
      toast.success(`Test scan resolved to ${binName}`);
    };
    reader.onreadingerror = () => {
      clearTimeout(timeout);
      toast.error("Couldn't read that tag.");
    };
  } catch (err) {
    // Most commonly a user-denied permission prompt, or no NFC radio present.
    toast.error(err instanceof Error ? err.message : "Couldn't start NFC scan.");
  }
}

function LinkedScreen({
  code,
  resolveUrl,
  breadcrumbText,
  container,
  onWriteDifferentTag,
}: {
  code: string;
  resolveUrl: string;
  breadcrumbText: string;
  container: { name: string };
  onWriteDifferentTag: () => void;
}) {
  return (
    <>
      <div>
        <h2 className="text-screen-title font-semibold text-ink">{code} is linked</h2>
        <p className="mt-1 text-body text-muted-foreground">
          Scanning the QR code or tapping the NFC tag opens {container.name}.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <TagPreviewRow code={code} resolveUrl={resolveUrl} qrSize={118} />
        <div className="mt-2 flex justify-center">
          <StatusPill tone="green">NFC linked on this device</StatusPill>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div>
          <p className="text-item-title font-semibold text-ink">Test the tag</p>
          <p className="mt-1 text-caption text-muted-foreground">Hold your phone near the tag to confirm it opens this container.</p>
        </div>
        <Button size="sm" className="shrink-0 bg-yellow text-white hover:bg-yellow/90" onClick={() => testNfcScan(container.name)}>
          Test scan
        </Button>
      </div>

      <button
        type="button"
        onClick={onWriteDifferentTag}
        className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 text-left shadow-sm"
      >
        <div>
          <p className="text-body font-semibold text-ink">Write a different tag</p>
          <p className="mt-1 text-caption text-muted-foreground">Unlinks this one so you can set up a new physical tag instead.</p>
        </div>
        <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
      </button>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="text-body font-semibold text-ink">Need another label?</p>
        <p className="mt-1 text-caption text-muted-foreground">Print QR + {code} for your 25mm rounded tag.</p>
      </div>

      <p className="text-micro text-muted-foreground">{breadcrumbText}</p>
    </>
  );
}
