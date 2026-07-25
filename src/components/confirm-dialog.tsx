"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/icon";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  icon?: IconName;
  onConfirm: () => void | Promise<void>;
}

/**
 * Owner-only / destructive action confirmations. `tone="danger"` is
 * reserved for the one truly irreversible action in the product
 * (permanent delete) — everything recoverable (trash, remove member) uses
 * the default ink-styled confirm.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  icon,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-sm">
        <DialogHeader>
          {icon ? (
            <div
              className={
                tone === "danger" || icon === "trash"
                  ? "flex size-11 items-center justify-center rounded-full bg-danger/10 text-danger"
                  : "flex size-11 items-center justify-center rounded-full bg-brand-100 text-yellow"
              }
            >
              <Icon name={icon} size={20} />
            </div>
          ) : null}
          <DialogTitle className="text-section-title font-medium text-ink">{title}</DialogTitle>
          <DialogDescription className="text-body text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="lg" className="flex-1" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            size="lg"
            className={tone === "danger" ? "flex-1" : "flex-1 bg-ink text-white hover:bg-ink/90"}
            variant={tone === "danger" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={pending}
          >
            {pending ? <Icon name="spinner" size={16} className="animate-spin" /> : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
