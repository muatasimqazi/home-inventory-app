"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Icon, type IconName } from "@/components/icon";
import { ContainerWizardSheet } from "@/components/container-wizard-sheet";
import { cn } from "@/lib/utils";

interface CreateChooserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  /** One role from the brand's 5-role FAB color wheel (globals.css's --color-fab-* tokens) — includes its own text color, since Secondary and Neutral Light don't have enough contrast for a white icon and need a dark one instead. See this file's own comment on the per-row assignment. */
  iconClassName: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="tap-target flex items-center gap-3 rounded-2xl border border-border bg-white p-4 text-left">
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

/**
 * The Overview page's top "+" used to link straight to /add (a new
 * inventory item) — with two real domains and five real "create" targets
 * now (item, location, container, transaction, account), that guess is
 * wrong more often than it's right. Same "explicit chooser, not a
 * classifier" posture as ScanChooserSheet (the camera FAB's own equivalent
 * sheet): the user always taps what they mean before landing on a form.
 *
 * Location and Transaction land straight on an already-open create sheet
 * (?open=new — the same deep-link convention finance/transactions/page.tsx
 * already established, now also wired into finance/accounts/page.tsx and
 * locations/page.tsx). Container is the one genuine exception: a container
 * always belongs to a real Location, so there's no context-free "create a
 * container" destination to deep-link into — instead it opens
 * ContainerWizardSheet, a real guided flow (pick or create a Location,
 * then create the container, then land on that container's own detail
 * page ready to add items) rather than just dropping the user on the
 * Locations list to find "Add Container" themselves.
 */
export function CreateChooserSheet({ open, onOpenChange }: CreateChooserSheetProps) {
  const router = useRouter();
  const [wizardOpen, setWizardOpen] = useState(false);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-section-title font-medium text-ink">Add</SheetTitle>
          </SheetHeader>
          {/* Same 5-role brand FAB color wheel as ScanChooserSheet, and
              the same role for the concepts the two sheets share — Item
              stays Primary, Transaction stays Secondary (Scan Receipt's
              role) — since a Scan Receipt and a manually-added
              Transaction are the same underlying thing. */}
          <div className="flex flex-col gap-2 px-4 pb-6">
            <ChooserRow
              icon="box"
              label="Item"
              description="Add something to your inventory"
              iconClassName="bg-fab-primary text-white"
              onClick={() => go("/add")}
            />
            <ChooserRow
              icon="pin"
              label="Location"
              description="A room or area you store things in"
              iconClassName="bg-fab-neutral-light text-fab-neutral-dark"
              onClick={() => go("/locations?open=new")}
            />
            <ChooserRow
              icon="archive"
              label="Container"
              description="A bin, box, or shelf inside a Location"
              iconClassName="bg-fab-accent text-white"
              onClick={() => {
                onOpenChange(false);
                setWizardOpen(true);
              }}
            />
            <ChooserRow
              icon="receipt"
              label="Transaction"
              description="A purchase, payment, or transfer"
              iconClassName="bg-fab-secondary text-fab-neutral-dark"
              onClick={() => go("/finance/transactions?open=new")}
            />
            <ChooserRow
              icon="wallet"
              label="Account"
              description="A bank, card, or investment account"
              iconClassName="bg-fab-neutral-dark text-white"
              onClick={() => go("/finance/accounts?open=new")}
            />
          </div>
        </SheetContent>
      </Sheet>

      <ContainerWizardSheet open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  );
}
