"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { useAiConsentStore } from "@/lib/ai-consent-store";
import { AI_DATA_SENT, AI_RECIPIENTS } from "@/lib/ai-consent";

/**
 * The permission prompt App Store Guideline 5.1.2(i) requires before any
 * user data goes to a third-party AI service: what is sent, who it goes
 * to, and an explicit choice. Mounted once in app/layout.tsx and opened by
 * ensureAiConsent() (lib/ai-consent-store.ts) from whichever feature is
 * about to make an AI call. Dismissing it (overlay tap, Escape) counts as
 * "Not now" — nothing is sent without a tap on "Allow".
 */
export function AiConsentDialog() {
  const open = useAiConsentStore((s) => s.open);
  const decide = useAiConsentStore((s) => s.decide);
  const [pending, setPending] = useState(false);

  async function handle(granted: boolean) {
    setPending(true);
    try {
      await decide(granted);
    } catch {
      toast.error("Couldn't save your choice. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && handle(false)}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-xl sm:max-w-md">
        <DialogHeader>
          <div className="flex size-11 items-center justify-center rounded-full bg-brand-100 text-yellow">
            <Icon name="ai" size={20} />
          </div>
          <DialogTitle className="text-section-title font-medium text-ink">Allow AI features to use your data?</DialogTitle>
          <DialogDescription className="text-body text-muted-foreground">
            Schuaz&apos;s AI features send some of your data to outside AI services to work. Nothing is sent unless you allow it.
          </DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-2">
          <h3 className="text-caption font-medium text-ink">What&apos;s sent, only when you use an AI feature</h3>
          <ul className="list-disc space-y-1 pl-5 text-caption text-muted-foreground">
            {AI_DATA_SENT.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-caption font-medium text-ink">Who receives it</h3>
          <ul className="space-y-1 text-caption text-muted-foreground">
            {AI_RECIPIENTS.map((r) => (
              <li key={r.name}>
                <span className="font-medium text-ink">{r.name}:</span> {r.role}
              </li>
            ))}
          </ul>
        </section>

        <p className="text-caption text-muted-foreground">
          It&apos;s used only to give you the result you asked for. You can turn this off anytime in Settings. See the{" "}
          <Link href="/privacy" className="font-medium text-yellow-text underline">
            Privacy Policy
          </Link>{" "}
          for details.
        </p>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="lg" className="flex-auto" onClick={() => handle(false)} disabled={pending}>
            Not now
          </Button>
          <Button size="lg" className="flex-auto bg-ink-fill text-white hover:bg-ink-fill/90" onClick={() => handle(true)} disabled={pending}>
            {pending ? <Icon name="spinner" size={16} className="animate-spin" /> : "Allow"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
