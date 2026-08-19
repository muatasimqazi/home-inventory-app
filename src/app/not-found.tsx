import { AppShell } from "@/components/app-shell";
import { NotFoundView } from "@/components/not-found-view";

// Root catch-all for a URL that doesn't match any route at all (typo'd or
// stale bookmark, an old link into a page that's since moved). Lives
// outside (shell), so AppShell is wrapped explicitly here rather than
// inherited — same nav chrome either way. proxy.ts gates every non-public
// path on a real session before Next even resolves routing, so by the
// time this renders the visitor is already signed in; HydrationGate (in
// the root layout) has real household data loaded, same as any other page.
export default function NotFound() {
  return (
    <AppShell>
      <NotFoundView />
    </AppShell>
  );
}
