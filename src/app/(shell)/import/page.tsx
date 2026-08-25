"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { BackButton } from "@/components/back-button";

/**
 * One shared "Import CSV" entry point, not two separate links scattered
 * across the nav — same shape as the mobile Scan FAB's chooser: the
 * action itself is genuinely ambiguous once there are two domains (import
 * inventory items, or import Finance transactions?), so this asks once
 * instead of making every nav surface pick one or list both. The two
 * wizards themselves stay exactly where they are (/settings/import,
 * /finance/import) — very different column-mapping targets (items vs.
 * transactions), not worth merging into one form.
 */
const OPTIONS: { href: string; icon: IconName; label: string; description: string }[] = [
  { href: "/settings/import", icon: "box", label: "Import Items", description: "Bring inventory in from a spreadsheet export" },
  { href: "/finance/import", icon: "receipt", label: "Import Transactions", description: "Bring transactions in from a bank export" },
];

export default function ImportChooserPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackButton hideOnDesktop />
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Import from CSV</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">What are you importing?</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {OPTIONS.map((o) => (
          <Link key={o.href} href={o.href} className="tap-target flex items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-yellow text-white">
              <Icon name={o.icon} size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body font-semibold text-ink">{o.label}</p>
              <p className="truncate text-caption text-muted-foreground">{o.description}</p>
            </div>
            <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
