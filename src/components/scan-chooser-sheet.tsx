"use client";

import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Icon, type IconName } from "@/components/icon";

interface ScanChooserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Contextual inventory-capture destination (varies by where the FAB was tapped from — see contextualCaptureHref). */
  itemScanHref: string;
}

function ChooserRow({ icon, label, description, onClick }: { icon: IconName; label: string; description: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="tap-target flex items-center gap-3 rounded-2xl border border-border bg-white p-4 text-left">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-yellow text-white">
        <Icon name={icon} size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-ink">{label}</p>
        <p className="truncate text-caption text-muted-foreground">{description}</p>
      </div>
      <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
    </button>
  );
}

// Household Ledger PRD §27's appliance-label capture lives at a dedicated
// route (src/app/capture/appliance/), not a mode flag on general item
// capture — see that page's own header comment. It accepts the same
// ?locationId=&containerId= context as /capture and /add. itemScanHref is
// already that context baked into a /capture URL (contextualCaptureHref in
// src/lib/selectors.ts), so the appliance row just swaps the path prefix
// and carries the same query string through, keeping all three rows
// consistently contextual without a second prop.
function applianceScanHref(itemHref: string): string {
  const queryIndex = itemHref.indexOf("?");
  return queryIndex === -1 ? "/capture/appliance" : `/capture/appliance${itemHref.slice(queryIndex)}`;
}

// Barcode-scan capture (src/app/capture/barcode/) accepts the same
// ?locationId=&containerId= context as the other three rows — same
// path-prefix swap as applianceScanHref above, added when that flow's own
// workstream (independent of the Categories Foundation cluster) wired up
// its route.
function barcodeScanHref(itemHref: string): string {
  const queryIndex = itemHref.indexOf("?");
  return queryIndex === -1 ? "/capture/barcode" : `/capture/barcode${itemHref.slice(queryIndex)}`;
}

/**
 * The bottom-nav camera FAB used to link straight to inventory capture —
 * with Finance now a real second domain, "scan" is ambiguous (an item for
 * inventory, or a receipt for Finance), so tapping it opens this chooser
 * instead of guessing which one the user meant.
 *
 * Four explicit, user-picked modes (Household Ledger PRD §17/§32): Scan
 * Item, Scan Receipt, Scan Appliance, and Scan Barcode. This is deliberately a chooser,
 * not a classifier — the user always taps a mode before the camera opens,
 * and each destination shows the AI's best guess with one-tap correction
 * before anything saves (src/app/capture/review/page.tsx's needsReview
 * gate; src/app/finance/scan/review/page.tsx's editable draft + explicit
 * Confirm). No mode here is auto-detected from the photo.
 */
export function ScanChooserSheet({ open, onOpenChange, itemScanHref }: ScanChooserSheetProps) {
  const router = useRouter();

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">Scan</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4 pb-6">
          <ChooserRow icon="camera" label="Scan Item" description="Add something to your inventory" onClick={() => go(itemScanHref)} />
          <ChooserRow icon="receipt" label="Scan Receipt" description="Auto-fill a Finance transaction" onClick={() => go("/finance/scan")} />
          <ChooserRow icon="zap" label="Scan Appliance" description="Read a model/serial label" onClick={() => go(applianceScanHref(itemScanHref))} />
          <ChooserRow icon="scanBarcode" label="Scan Barcode" description="Look up a product by UPC/EAN" onClick={() => go(barcodeScanHref(itemScanHref))} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
