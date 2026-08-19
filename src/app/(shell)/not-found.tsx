import { NotFoundView } from "@/components/not-found-view";

// Catches notFound() calls thrown by dynamic detail pages under this
// group (items/[id], locations/[id], containers/[id], tags/[id]) when a
// record has been deleted or the id is bogus. Already renders inside
// (shell)/layout.tsx's AppShell, so the bottom nav/sidebar stay on
// screen — no separate wrapper needed here.
export default function ShellNotFound() {
  return <NotFoundView />;
}
