import Link from "next/link";

/**
 * The capture-focused utility rail. Deliberately does NOT include Review —
 * Review is a workflow queue surfaced elsewhere (Dashboard status tile,
 * desktop sidebar), never a capture action.
 */
export function UtilityRail() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-ink px-4 py-3.5">
      <div className="flex size-9 items-center justify-center rounded-xl bg-yellow" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-white">Find it fast</p>
        <p className="text-caption text-border">Capture item or label</p>
      </div>
      <Link
        href="/capture"
        className="tap-target flex h-9 shrink-0 items-center justify-center rounded-full bg-yellow px-4 text-caption font-medium text-ink"
      >
        Scan item
      </Link>
    </div>
  );
}
