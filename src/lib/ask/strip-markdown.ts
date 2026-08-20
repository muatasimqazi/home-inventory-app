/**
 * Defense in depth alongside lib/ask/ask.ts's own "respond in plain prose,
 * never markdown" system-prompt instruction — instruction-following isn't
 * airtight, and a chat bubble showing literal `**Costco**` asterisks reads
 * as broken regardless of whose fault it was. No markdown-rendering
 * library — answers are meant to be one short sentence, so stripping the
 * common syntax back to plain text is enough; there's no real formatting
 * worth preserving as actual bold/lists here. Shared by every Ask-answer
 * renderer (ask-fab.tsx, the Search page's Ask fallback) rather than
 * duplicated per caller.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, "")) // fenced code blocks
    .replace(/(\*\*|__)(.*?)\1/g, "$2") // bold
    .replace(/(\*|_)(.*?)\1/g, "$2") // italics
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/^\s*[-*+]\s+/gm, "") // bullet list markers
    .replace(/^\s*\d+\.\s+/gm, ""); // numbered list markers
}
