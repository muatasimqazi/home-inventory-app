"use client";

import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Icon, type IconName } from "@/components/icon";
import { useCurrentHousehold } from "@/lib/store";
import { cn } from "@/lib/utils";

interface ScanChooserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Contextual inventory-capture destination (varies by where the FAB was tapped from — see contextualCaptureHref). */
  itemScanHref: string;
}

function ChooserRow({
  icon,
  label,
  description,
  iconClassName,
  onClick,
}: {
  icon: IconName;
  label: string;
  description: string;
  /** One role from the brand's 5-role FAB color wheel (globals.css's --color-fab-* tokens) — every role pairs with a white icon. See this file's own comment on the per-row assignment. */
  iconClassName: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="tap-target flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left">
      <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-full", iconClassName)}>
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

// Wardrobe capture (docs/Wardrobe Inventory.md, src/app/capture/wardrobe/)
// — same path-prefix-swap pattern as applianceScanHref/barcodeScanHref
// above.
function wardrobeScanHref(itemHref: string): string {
  const queryIndex = itemHref.indexOf("?");
  return queryIndex === -1 ? "/capture/wardrobe" : `/capture/wardrobe${itemHref.slice(queryIndex)}`;
}

/**
 * The bottom-nav camera FAB used to link straight to inventory capture —
 * with Finance now a real second domain, "scan" is ambiguous (an item for
 * inventory, or a receipt for Finance), so tapping it opens this chooser
 * instead of guessing which one the user meant.
 *
 * Four explicit, user-picked modes (Household Ledger PRD §17/§32), ordered
 * to group the three inventory-item modes — Scan Item, Scan Barcode, Scan
 * Appliance — together first, with Scan Receipt (the one Finance-domain
 * mode, not an inventory item at all) last. This is deliberately a chooser,
 * not a classifier — the user always taps a mode before the camera opens,
 * and each destination shows the AI's best guess with one-tap correction
 * before anything saves (src/app/capture/review/page.tsx's needsReview
 * gate; src/app/finance/scan/review/page.tsx's editable draft + explicit
 * Confirm). No mode here is auto-detected from the photo.
 */
export function ScanChooserSheet({ open, onOpenChange, itemScanHref }: ScanChooserSheetProps) {
  const router = useRouter();
  // Household-setup's domain choice (0033_household_domains.sql) — a
  // household that opted out of a domain shouldn't have this chooser
  // offer a mode leading straight into it.
  const household = useCurrentHousehold();

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
        {/* Each row a fixed, distinct role from the brand's 5-role FAB
            color wheel (globals.css's --color-fab-* tokens: Primary sage,
            Secondary gold, Accent terracotta, Neutral Dark charcoal,
            Neutral Light teal) — was bg-yellow (the brand/primary fill) on
            every row, indistinct from itself and from every other
            primary-colored button in the app; briefly used a hashed
            badge-color-wheel palette instead before settling on this exact
            5-role set. Hand-picked per action, not cycled — "Item"/
            "Receipt" reuse the same role as their CreateChooserSheet
            counterpart (Item/Transaction). Every role's white icon now
            (Secondary/Neutral Light deepened in globals.css so white
            stays legible on them too — see that token's own comment). */}
        <div className="flex flex-col gap-2 px-4 pb-6">
          {household.inventoryEnabled && (
            <>
              <ChooserRow
                icon="camera"
                label="Scan Item"
                description="Add something to your inventory"
                iconClassName="bg-fab-primary text-white"
                onClick={() => go(itemScanHref)}
              />
              <ChooserRow
                icon="scanBarcode"
                label="Scan Barcode"
                description="Look up a product by UPC/EAN"
                iconClassName="bg-fab-neutral-light text-white"
                onClick={() => go(barcodeScanHref(itemScanHref))}
              />
              <ChooserRow
                icon="zap"
                label="Scan Appliance"
                description="Read a model/serial label"
                iconClassName="bg-fab-neutral-dark text-white"
                onClick={() => go(applianceScanHref(itemScanHref))}
              />
              <ChooserRow
                icon="ai"
                label="Scan Wardrobe"
                description="Catalog a clothing item + generate studio photos"
                iconClassName="bg-fab-accent text-white"
                onClick={() => go(wardrobeScanHref(itemScanHref))}
              />
            </>
          )}
          {household.financeEnabled && (
            <ChooserRow
              icon="receipt"
              label="Scan Receipt"
              description="Auto-fill a Finance transaction"
              iconClassName="bg-fab-secondary text-white"
              onClick={() => go("/finance/scan")}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
