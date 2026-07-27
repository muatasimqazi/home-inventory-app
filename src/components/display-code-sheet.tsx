"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icon";
import { useInventoryStore } from "@/lib/store";
import type { Container } from "@/lib/types";

interface DisplayCodeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container: Container;
}

/** View / copy / edit / generate the container's Bin ID (displayCode), or claim a preprinted label. */
export function DisplayCodeSheet({ open, onOpenChange, container }: DisplayCodeSheetProps) {
  const assignDisplayCode = useInventoryStore((s) => s.assignDisplayCode);
  const claimUnassignedLabel = useInventoryStore((s) => s.claimUnassignedLabel);
  // Filter in a memo, not inline in the selector — a selector that returns a
  // new array every call breaks Zustand's useSyncExternalStore snapshot
  // comparison and causes an infinite render loop.
  const allLabelBatchEntries = useInventoryStore((s) => s.labelBatchEntries);
  const unassignedLabels = useMemo(() => allLabelBatchEntries.filter((e) => e.containerId === null), [allLabelBatchEntries]);
  const [value, setValue] = useState(container.displayCode ?? "");
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const result = await assignDisplayCode(container.id, value);
    if (!result.ok) {
      setError(result.error ?? "Couldn't save that Bin ID.");
      return;
    }
    toast.success("Bin ID saved");
    onOpenChange(false);
  }

  async function handleGenerateNext() {
    const result = await assignDisplayCode(container.id);
    if (!result.ok) {
      setError(result.error ?? "Couldn't generate a Bin ID.");
      return;
    }
    toast.success("Bin ID assigned");
    onOpenChange(false);
  }

  async function handleCopy() {
    if (!container.displayCode) return;
    await navigator.clipboard.writeText(container.displayCode);
    toast.success("Bin ID copied");
  }

  async function handleClaim(entryId: string) {
    const result = await claimUnassignedLabel(entryId, container.id);
    if (!result.ok) {
      setError(result.error ?? "Couldn't assign that label.");
      return;
    }
    toast.success("Preprinted label assigned");
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">Bin ID</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          <div className="flex items-center gap-2">
            <Input
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. GAR-234"
              className="h-11 font-semibold uppercase"
              autoFocus
            />
            {container.displayCode && (
              <Button type="button" variant="outline" size="icon-lg" onClick={handleCopy} aria-label="Copy Bin ID">
                <Icon name="copy" size={16} />
              </Button>
            )}
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
          <p className="text-caption text-muted-foreground">
            Bin IDs are unique per household and stay put when this container moves — separate from the QR/NFC tag.
          </p>
          <div className="flex flex-col gap-2">
            <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleSave}>
              Save Bin ID
            </Button>
            <Button variant="outline" size="lg" onClick={handleGenerateNext}>
              <Icon name="refresh" size={16} /> Generate next code
            </Button>
          </div>

          {unassignedLabels.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <p className="text-caption font-medium text-ink">Or assign a preprinted label</p>
              <p className="text-caption text-muted-foreground">
                Labels already printed from a batch, not yet stuck on a container.
              </p>
              <div className="flex flex-col gap-1.5">
                {unassignedLabels.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleClaim(entry.id)}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-caption text-ink hover:bg-surface-muted"
                  >
                    <span className="font-mono">{entry.displayCode ?? entry.tagToken}</span>
                    <span className="text-muted-foreground">Use this label</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
