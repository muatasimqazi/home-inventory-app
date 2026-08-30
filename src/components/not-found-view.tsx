import Link from "next/link";
import { EmptyState } from "@/components/empty-state";

/**
 * Shared body for both not-found boundaries (app/not-found.tsx for a
 * genuinely unmatched URL, and (shell)/not-found.tsx for an in-app
 * notFound() call from a deleted/missing record — items/[id],
 * locations/[id], containers/[id], tags/[id]). Both render inside
 * AppShell (root not-found wraps it explicitly; the (shell) one gets it
 * for free from (shell)/layout.tsx), so the bottom nav/sidebar are always
 * on screen — "Go home" below is a fallback for the rare case someone
 * doesn't want to just tap a tab, not the only way back in.
 *
 * Deliberately a plain styled <Link>, not the shadcn/Radix Button:
 * confirmed via bisection that a Button here makes `next build` fail on
 * *unrelated* pages elsewhere in the app with "createContext is not a
 * function" — something about a Radix Slot import specifically reachable
 * from a not-found.tsx boundary breaks Next 16.2.11's chunk splitting for
 * every page's not-found reference, Turbopack and webpack alike. A plain
 * anchor styled to match the app's ink-CTA convention sidesteps it
 * entirely with no visual difference.
 */
export function NotFoundView() {
  return (
    <EmptyState
      icon="mapPinOff"
      title="Couldn't find that page"
      description="It may have been moved, deleted, or the link was off. Use the nav to get back to your household, or head home."
      className="min-h-[60vh]"
      action={
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-lg bg-ink-fill px-6 text-body font-medium text-white hover:bg-ink-fill/90"
        >
          Go home
        </Link>
      }
    />
  );
}
