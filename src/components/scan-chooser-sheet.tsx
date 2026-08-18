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

/**
 * The bottom-nav camera FAB used to link straight to inventory capture —
 * with Finance now a real second domain, "scan" is ambiguous (an item for
 * inventory, or a receipt for Finance), so tapping it opens this chooser
 * instead of guessing which one the user meant.
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
