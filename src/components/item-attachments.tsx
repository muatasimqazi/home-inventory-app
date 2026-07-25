"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInventoryStore } from "@/lib/store";
import { formatBytes } from "@/lib/format";
import type { AttachmentKind } from "@/lib/types";

const KIND_LABELS: Record<AttachmentKind, string> = {
  receipt: "Receipt",
  manual: "Manual",
  warranty: "Warranty",
  other: "Other file",
};

/** Secondary/quiet section on Item Detail — receipts, manuals, warranty docs, misc files. No OCR or reminders. */
export function ItemAttachments({ itemId }: { itemId: string }) {
  const attachments = useInventoryStore((s) => s.attachments.filter((a) => a.itemId === itemId));
  const addAttachment = useInventoryStore((s) => s.addAttachment);
  const deleteAttachment = useInventoryStore((s) => s.deleteAttachment);
  const [kind, setKind] = useState<AttachmentKind>("receipt");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    addAttachment(itemId, {
      kind,
      fileName: file.name,
      storagePath: URL.createObjectURL(file),
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });
    toast.success(`Added ${file.name}`);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-section-title font-medium text-ink">Attachments</h2>
        <span className="text-caption text-muted-foreground">Receipts, manuals, warranty docs</span>
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-col divide-y divide-border">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-3 py-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-muted text-ink">
                <Icon name="file" size={15} />
              </span>
              <a href={a.storagePath} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                <p className="truncate text-body text-ink">{a.fileName}</p>
                <p className="text-caption text-muted-foreground">
                  {KIND_LABELS[a.kind]} · {formatBytes(a.sizeBytes)}
                </p>
              </a>
              <button
                type="button"
                onClick={() => {
                  deleteAttachment(a.id);
                  toast("Attachment removed");
                }}
                aria-label={`Remove ${a.fileName}`}
                className="tap-target flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-muted hover:text-danger"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as AttachmentKind)}>
          <SelectTrigger className="h-9 flex-1 text-caption">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(KIND_LABELS) as AttachmentKind[]).map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="tap-target flex items-center gap-1.5 rounded-lg border border-border px-3 text-caption text-ink"
        >
          <Icon name="attachment" size={14} /> Add file
        </button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChosen} />
      </div>
    </div>
  );
}
