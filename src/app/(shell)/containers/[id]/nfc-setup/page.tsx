"use client";

import { useState, useSyncExternalStore } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { buildBreadcrumb, breadcrumbLabel } from "@/lib/selectors";
import { cn } from "@/lib/utils";

type Platform = "ios" | "android" | "other";
type Screen = "setup" | "writing" | "shortcutsInfo" | "shortcutsSteps" | "linked";

// Real (if simple) capability detection — this determines which options are
// offered, not whether the underlying write is simulated: no browser can
// actually write NFC here without physical hardware, so "writing" is a
// timed simulation on every platform (same mock-hardware boundary as the
// rest of the app, e.g. MockVisionProvider). iOS never supports Web NFC at
// all (no browser exposes it), which is exactly why Shortcuts exists as a
// real, separate fallback — not a lesser copy of the Android path.
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

const SHORTCUT_STEPS = [
  "Open Shortcuts and go to Automation",
  "Tap +, then choose NFC",
  "Scan the 25mm tag",
  "Choose Run Shortcut",
  "Select Open Shohaz Bin",
  "Pick this bin and turn off Ask Before Running",
];

export default function NfcSetupPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const containers = useInventoryStore((s) => s.containers);
  const locations = useInventoryStore((s) => s.locations);
  const linkNfcTag = useInventoryStore((s) => s.linkNfcTag);

  const container = containers.find((c) => c.id === params.id);
  const platform = usePlatform();

  const [screen, setScreen] = useState<Screen>(container?.nfcLinkedAt ? "linked" : "setup");
  const [writing, setWriting] = useState(false);

  if (!container) return notFound();

  const containerId = container.id;
  const breadcrumb = buildBreadcrumb(container.locationId, container.id, locations, containers);
  const code = container.displayCode ?? container.tagToken;
  const resolveUrl = `https://shohaz.app/c/${container.tagToken}`;

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

  function installShortcut() {
    linkNfcTag(containerId);
    toast.success("NFC tag linked via Shortcuts");
    setScreen("linked");
  }

  function goBack() {
    if (screen === "setup") {
      router.back();
    } else if (screen === "writing") {
      setScreen("setup");
    } else if (screen === "shortcutsInfo") {
      setScreen("setup");
    } else if (screen === "shortcutsSteps") {
      setScreen("shortcutsInfo");
    } else {
      router.push(`/containers/${containerId}`);
    }
  }

  const titles: Record<Screen, string> = {
    setup: platform === "android" ? "Android tag setup" : platform === "ios" ? "iOS tag setup" : "QR label",
    writing: "Write NFC",
    shortcutsInfo: "iOS fallback",
    shortcutsSteps: "Shortcut steps",
    linked: "Tag linked",
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-white px-4 py-3">
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
            onShortcutsFallback={() => setScreen("shortcutsInfo")}
          />
        )}

        {screen === "setup" && platform === "other" && (
          <QrOnlyScreen code={code} resolveUrl={resolveUrl} container={container} />
        )}

        {screen === "writing" && <WritingScreen code={code} resolveUrl={resolveUrl} writing={writing} />}

        {screen === "shortcutsInfo" && <ShortcutsInfoScreen code={code} onViewSteps={() => setScreen("shortcutsSteps")} />}

        {screen === "shortcutsSteps" && <ShortcutsStepsScreen code={code} />}

        {screen === "linked" && (
          <LinkedScreen code={code} resolveUrl={resolveUrl} breadcrumbText={breadcrumbLabel(breadcrumb)} container={container} />
        )}
      </div>

      <div className="sticky bottom-0 border-t border-border bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          {screen === "setup" && platform === "ios" && (
            <>
              <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={startWriting}>
                Write NFC tag
              </Button>
              <Button size="lg" variant="outline" onClick={() => setScreen("shortcutsInfo")}>
                Use Shortcuts instead
              </Button>
            </>
          )}
          {screen === "setup" && platform === "android" && (
            <>
              <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={startWriting}>
                Write NFC tag
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push(`/containers/${container.id}/label`)}>
                Print QR label instead
              </Button>
            </>
          )}
          {screen === "setup" && platform === "other" && (
            <>
              <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={() => router.push(`/containers/${container.id}/label`)}>
                Print QR label
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push(`/containers/${container.id}`)}>
                Back to bin
              </Button>
            </>
          )}
          {screen === "writing" && (
            <>
              <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={confirmWrite} disabled={writing}>
                {writing ? <Icon name="spinner" size={16} className="animate-spin" /> : "Start writing"}
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push(`/containers/${container.id}/label`)} disabled={writing}>
                Print QR instead
              </Button>
            </>
          )}
          {screen === "shortcutsInfo" && (
            <>
              <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={installShortcut}>
                Install Shohaz Shortcut
              </Button>
              <Button size="lg" variant="outline" onClick={() => setScreen("shortcutsSteps")}>
                View setup steps
              </Button>
            </>
          )}
          {screen === "shortcutsSteps" && (
            <>
              <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={installShortcut}>
                Done
              </Button>
              <Button size="lg" variant="outline" onClick={() => setScreen("shortcutsInfo")}>
                Back
              </Button>
            </>
          )}
          {screen === "linked" && (
            <>
              <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={() => router.push(`/containers/${container.id}/label`)}>
                Print labels
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push(`/containers/${container.id}`)}>
                Back to bin
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
      <div className="rounded-lg border border-border bg-white p-2">
        <QRCodeSVG value={resolveUrl} size={qrSize} bgColor="#ffffff" fgColor="#212121" />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <div className="flex size-20 items-center justify-center rounded-2xl border border-border bg-white">
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
  onShortcutsFallback,
}: {
  platform: "ios" | "android";
  code: string;
  resolveUrl: string;
  breadcrumbText: string;
  container: { name: string; nfcLinkedAt: string | null };
  onWriteNfc: () => void;
  onShortcutsFallback: () => void;
}) {
  return (
    <>
      <div>
        <h2 className="text-screen-title font-semibold text-ink">NFC tag</h2>
        <p className="mt-1 text-body text-muted-foreground">
          {platform === "ios" ? "Ready to write on this iPhone" : "Ready to write with Android NFC"} · {code}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <TagPreviewRow code={code} resolveUrl={resolveUrl} />
        <div className="mt-2 flex items-center justify-center gap-2">
          <StatusPill tone="neutral">QR ready</StatusPill>
          <StatusPill tone="green">NFC not linked</StatusPill>
        </div>
      </div>

      <h3 className="text-item-title font-semibold text-ink">Tag options</h3>

      {platform === "ios" && (
        <button
          type="button"
          onClick={onWriteNfc}
          className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4 text-left shadow-sm"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-100">
            <Icon name="nfc" size={20} className="text-brand-700" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-body font-semibold text-ink">Write NFC tag</span>
              <span className="rounded-md bg-ink px-1.5 py-0.5 text-micro font-semibold text-white">Best</span>
            </span>
            <span className="mt-1 block text-caption text-muted-foreground">Save {resolveUrl} to a writable tag.</span>
          </span>
        </button>
      )}

      <button
        type="button"
        onClick={platform === "ios" ? onShortcutsFallback : onWriteNfc}
        className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4 text-left shadow-sm"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-100">
          <Icon name={platform === "ios" ? "smartphone" : "nfc"} size={20} className="text-brand-700" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-body font-semibold text-ink">{platform === "ios" ? "Use Shortcuts fallback" : "Write bin link to tag"}</span>
          <span className="mt-1 block text-caption text-muted-foreground">
            {platform === "ios"
              ? "Fallback for this iPhone if writing fails. Other members set it up on their own device."
              : "Writes the bin link to a writable NFC tag."}
          </span>
        </span>
      </button>

      {platform === "android" && (
        <div className="flex items-center gap-3 rounded-2xl border border-badge-green-border bg-badge-green-bg p-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-badge-green-border bg-white">
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
          This device cannot link NFC tags. Use a QR label, or open Shohaz on a supported phone.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
        <span className="rounded-lg bg-brand-100 px-3 py-1.5 text-micro font-semibold text-brand-700">Web/Desktop · QR only</span>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-white p-6 shadow-sm">
        <QRCodeSVG value={resolveUrl} size={158} bgColor="#ffffff" fgColor="#212121" />
        <span className="rounded-lg bg-badge-red-bg px-3 py-1.5 font-mono text-caption font-semibold text-badge-red-text">{code}</span>
        <p className="text-center text-caption text-muted-foreground">Print this QR code for {container.name}.</p>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-100">
          <Icon name="smartphone" size={20} className="text-brand-700" />
        </span>
        <div>
          <p className="text-body font-semibold text-ink">Want NFC too?</p>
          <p className="mt-1 text-caption text-muted-foreground">Use Shohaz on a supported phone to write or link tags.</p>
        </div>
      </div>
    </>
  );
}

function WritingScreen({ code, resolveUrl, writing }: { code: string; resolveUrl: string; writing: boolean }) {
  return (
    <>
      <div>
        <h2 className="text-screen-title font-semibold text-ink">Write bin link to tag</h2>
        <p className="mt-1 text-body text-muted-foreground">This writes a direct Shohaz bin link onto a writable NFC tag.</p>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-border bg-white p-4 shadow-sm">
        <StepDot label="Review link" state="done" />
        <div className="h-px flex-1 bg-border" />
        <StepDot label="Hold tag" state={writing ? "active" : "pending"} />
        <div className="h-px flex-1 bg-border" />
        <StepDot label="Done" state="pending" />
      </div>

      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <p className="text-micro font-semibold text-muted-foreground">NDEF URL</p>
        <p className="mt-1 break-all text-body font-semibold text-ink">{resolveUrl}</p>
        <p className="mt-1 text-caption text-muted-foreground">Anyone with access can open this bin detail screen.</p>
      </div>

      <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-white p-6 shadow-sm">
        <div className={cn("flex size-20 items-center justify-center rounded-2xl border border-border bg-white", writing && "animate-pulse")}>
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

function ShortcutsInfoScreen({ code, onViewSteps }: { code: string; onViewSteps: () => void }) {
  return (
    <>
      <div>
        <h2 className="text-screen-title font-semibold text-ink">Set up with Shortcuts</h2>
        <p className="mt-1 text-body text-muted-foreground">
          Use this when direct NFC writing is not available. The tag is linked only on this iPhone.
        </p>
      </div>

      <span className="w-fit rounded-lg bg-brand-100 px-3 py-1.5 text-micro font-semibold text-brand-700">iOS · Shortcuts only</span>

      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <h3 className="text-item-title font-semibold text-ink">Personal automation</h3>
        <p className="mt-1 text-caption text-muted-foreground">Scanning {code} runs a Shohaz Shortcut that opens this bin.</p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
        <ChecklistItem label="Install the Shohaz Shortcut" />
        <ChecklistItem label="Create an NFC automation" />
        <ChecklistItem label={`Choose bin ${code}`} />
      </div>

      <div className="rounded-xl border border-yellow bg-brand-100 p-3">
        <p className="text-caption text-ink">This setup does not sync to other household members. They need to link the same tag on their own iPhone.</p>
      </div>

      <button type="button" onClick={onViewSteps} className="text-left text-caption font-medium text-yellow underline underline-offset-2">
        View setup steps →
      </button>
    </>
  );
}

function ChecklistItem({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
        <Icon name="check" size={13} />
      </span>
      <p className="text-body font-semibold text-ink">{label}</p>
    </div>
  );
}

function ShortcutsStepsScreen({ code }: { code: string }) {
  return (
    <>
      <div>
        <h2 className="text-screen-title font-semibold text-ink">Link {code} tag</h2>
        <p className="mt-1 text-body text-muted-foreground">
          Follow these steps in Apple Shortcuts. This links this physical tag to this bin on this iPhone.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {SHORTCUT_STEPS.map((step, i) => (
          <div key={step} className="flex items-center gap-3 rounded-lg border border-border bg-white p-3">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-micro font-bold",
                i === SHORTCUT_STEPS.length - 1 ? "bg-ink text-white" : "bg-brand-100 text-brand-700"
              )}
            >
              {i + 1}
            </span>
            <p className="text-caption font-semibold text-ink">{step}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-yellow bg-brand-100 p-3">
        <p className="text-caption text-ink">If iOS changes automation prompts, keep the same bin shortcut and tag scan trigger.</p>
      </div>
    </>
  );
}

function LinkedScreen({
  code,
  resolveUrl,
  breadcrumbText,
  container,
}: {
  code: string;
  resolveUrl: string;
  breadcrumbText: string;
  container: { name: string };
}) {
  return (
    <>
      <div>
        <h2 className="text-screen-title font-semibold text-ink">{code} is linked</h2>
        <p className="mt-1 text-body text-muted-foreground">
          Scanning the QR code or tapping the NFC tag opens {container.name}.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <TagPreviewRow code={code} resolveUrl={resolveUrl} qrSize={118} />
        <div className="mt-2 flex justify-center">
          <StatusPill tone="green">NFC linked on this device</StatusPill>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div>
          <p className="text-item-title font-semibold text-ink">Test the tag</p>
          <p className="mt-1 text-caption text-muted-foreground">Hold your phone near the tag to confirm it opens this bin.</p>
        </div>
        <Button
          size="sm"
          className="shrink-0 bg-yellow text-white hover:bg-yellow/90"
          onClick={() => toast.success(`Test scan resolved to ${container.name}`)}
        >
          Test scan
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <p className="text-body font-semibold text-ink">Need another label?</p>
        <p className="mt-1 text-caption text-muted-foreground">Print QR + {code} for your 25mm rounded tag.</p>
      </div>

      <p className="text-micro text-muted-foreground">{breadcrumbText}</p>
    </>
  );
}
