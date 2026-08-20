"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { useCurrentHousehold } from "@/lib/store";

// Matches the domain the inbound webhook route (api/v1/webhooks/resend-
// inbound) checks incoming mail against — kept in sync manually, same
// reasoning as that file's own RECEIPTS_DOMAIN constant (changing it is a
// deliberate action requiring a newly-verified Resend domain, not
// something either file should read from a shared env var that could
// drift out of sync with what's actually configured there).
const RECEIPTS_DOMAIN = "receipts.shohaz.muatasim.com";

/**
 * Email Receipts (Bugs & Features backlog, item 8) — shows the
 * household's forwarding address for purchases with no physical receipt,
 * or no time to log one manually: forward (or CC) the confirmation email
 * here instead. Parsed automatically and landed in /finance/pending-
 * receipts for review, same as a photo scan.
 */
export default function EmailReceiptsSettingsPage() {
  const household = useCurrentHousehold();
  const address = `${household.receiptsToken}@${RECEIPTS_DOMAIN}`;
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success("Address copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select and copy the address manually.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-caption font-medium text-muted-foreground">
          <Icon name="arrowLeft" size={16} />
        </Link>
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Email Receipts</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">For purchases with no physical receipt, or no time to add one manually.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-5 shadow-sm">
        <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Your household&apos;s address</p>
        <div className="flex items-center gap-2 rounded-xl bg-surface-muted px-3 py-2.5">
          <p className="min-w-0 flex-1 truncate text-body font-medium text-ink">{address}</p>
          <Button size="icon-sm" variant="outline" onClick={handleCopy} aria-label="Copy address">
            <Icon name={copied ? "check" : "copy"} size={14} />
          </Button>
        </div>
        <p className="text-caption text-muted-foreground">
          Forward or CC a purchase confirmation, invoice, or receipt email to this address. It gets read automatically — store, date, total, and
          line items when available — and shows up in{" "}
          <Link href="/finance/pending-receipts" className="font-medium text-yellow-text">
            Pending Receipts
          </Link>{" "}
          for you to confirm, same as a photo scan.
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-border p-4 text-caption text-muted-foreground">
        Reads the details straight out of the email itself — order confirmations, subscription receipts, restaurant/delivery receipts, and
        anything similar with the purchase detail in the message body. A PDF or image attached instead of (or as well as) that isn&apos;t read yet.
        Emails that aren&apos;t clearly a purchase (shipping updates, newsletters) still show up in Pending Receipts for you to dismiss, rather than
        silently vanishing.
      </div>
    </div>
  );
}
