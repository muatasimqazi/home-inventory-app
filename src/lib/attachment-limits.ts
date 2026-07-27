// No PRD-specified number for attachment size/type — a reasonable cap for
// receipt/manual photos and PDFs before real Supabase Storage (with its own
// bucket-level limits) is wired up. Shared between the client-side file
// picker and the store's addAttachment() so the same rule applies whether
// or not the UI's own check ran first.

export const ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const ATTACHMENT_MAX_SIZE_LABEL = "10MB";
// Accept attribute for the file picker — kept in sync with isAttachmentTypeAllowed.
export const ATTACHMENT_ACCEPT = "image/*,application/pdf";

export function isAttachmentTypeAllowed(contentType: string): boolean {
  return contentType.startsWith("image/") || contentType === "application/pdf";
}
