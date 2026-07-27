"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { useInventoryStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_SIZE_BYTES, ATTACHMENT_MAX_SIZE_LABEL, isAttachmentTypeAllowed } from "@/lib/attachment-limits";
import type { Attachment, AttachmentKind } from "@/lib/types";

const KIND_LABELS: Record<AttachmentKind, string> = {
  receipt: "Receipt",
  manual: "Manual",
  warranty: "Warranty",
  other: "Other",
};

const KINDS = Object.keys(KIND_LABELS) as AttachmentKind[];

function fileTypeTag(contentType: string): string {
  if (contentType.includes("pdf")) return "PDF";
  if (contentType.startsWith("image/")) return "IMG";
  return "DOC";
}

/** Secondary/quiet section on Item Detail — one fixed tile per kind (Receipt/Manual/Warranty/Other). No OCR or reminders. */
export function ItemAttachments({ itemId }: { itemId: string }) {
  // Filter in a memo, not inline in the selector — a selector that returns a
  // new array every call breaks Zustand's useSyncExternalStore snapshot
  // comparison and causes an infinite render loop.
  const allAttachments = useInventoryStore((s) => s.attachments);
  const attachments = useMemo(() => allAttachments.filter((a) => a.itemId === itemId), [allAttachments, itemId]);
  const addAttachment = useInventoryStore((s) => s.addAttachment);
  const deleteAttachment = useInventoryStore((s) => s.deleteAttachment);
  const [uploadingKind, setUploadingKind] = useState<AttachmentKind | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function startUpload(kind: AttachmentKind) {
    setUploadingKind(kind);
    fileInputRef.current?.click();
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uploadingKind) return;
    const contentType = file.type || "application/octet-stream";
    // Same rules as the store's own check (lib/attachment-limits.ts) — this
    // is just an earlier, friendlier rejection before the file even loads.
    if (file.size > ATTACHMENT_MAX_SIZE_BYTES) {
      toast.error(`File is too large — max ${ATTACHMENT_MAX_SIZE_LABEL}.`);
      setUploadingKind(null);
      return;
    }
    if (!isAttachmentTypeAllowed(contentType)) {
      toast.error("Only images and PDFs can be attached.");
      setUploadingKind(null);
      return;
    }
    const result = await addAttachment(itemId, { kind: uploadingKind, file });
    if (result.ok) {
      toast.success(`Added ${file.name}`);
    } else {
      toast.error(result.error ?? "Couldn't add that file.");
    }
    setUploadingKind(null);
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <h2 className="text-body font-semibold text-ink">Attachments</h2>
      <div className="grid grid-cols-4 gap-2">
        {KINDS.map((kind) => (
          <AttachmentTile
            key={kind}
            kind={kind}
            attachment={attachments.find((a) => a.kind === kind)}
            onUpload={() => startUpload(kind)}
            onDelete={(id) => {
              deleteAttachment(id);
              toast("Attachment removed");
            }}
          />
        ))}
      </div>
      <input ref={fileInputRef} type="file" accept={ATTACHMENT_ACCEPT} className="hidden" onChange={handleFileChosen} />
    </div>
  );
}

function AttachmentTile({
  kind,
  attachment,
  onUpload,
  onDelete,
}: {
  kind: AttachmentKind;
  attachment: Attachment | undefined;
  onUpload: () => void;
  onDelete: (id: string) => void;
}) {
  if (!attachment) {
    return (
      <button
        type="button"
        onClick={onUpload}
        className="tap-target flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-muted-foreground hover:border-yellow hover:text-yellow"
      >
        <Icon name="plus" size={18} />
        <span className="text-micro">{KIND_LABELS[kind]}</span>
      </button>
    );
  }

  // Objects live in a private bucket — storagePath isn't a usable URL on
  // its own, so a signed URL (short-lived, just long enough for the
  // browser to navigate) is fetched on demand rather than kept around.
  const handleOpen = async () => {
    const { data, error } = await getSupabaseBrowserClient().storage.from("attachments").createSignedUrl(attachment.storagePath, 60);
    if (error || !data) {
      toast.error("Couldn't open that file.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noreferrer");
  };

  return (
    <div className="relative flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-border bg-white">
      <button type="button" onClick={handleOpen} className="flex flex-col items-center gap-1">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-micro font-semibold",
            attachment.contentType.includes("pdf") ? "bg-badge-green-bg text-badge-green-text" : "bg-badge-blue-bg text-badge-blue-text"
          )}
        >
          {fileTypeTag(attachment.contentType)}
        </span>
        <span className="text-micro text-muted-foreground">{KIND_LABELS[kind]}</span>
      </button>
      <button
        type="button"
        onClick={() => onDelete(attachment.id)}
        aria-label={`Remove ${attachment.fileName}`}
        className="tap-target absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border border-border bg-white text-muted-foreground hover:text-danger"
      >
        <Icon name="close" size={11} />
      </button>
    </div>
  );
}
