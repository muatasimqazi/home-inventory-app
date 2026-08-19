import type { ReactNode } from "react";
import { DesktopSidebar } from "@/components/desktop-sidebar";
import { BottomNav } from "@/components/bottom-nav";
import { AskFab } from "@/components/ask-fab";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full bg-background">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* pt-6 alone was fine in a normal Safari tab (the status bar lives
            outside the page's viewport there) but not once installed to the
            home screen: appleWebApp's black-translucent status bar (see
            layout.tsx) makes the page draw *underneath* the clock/signal
            icons, and a flat 24px wasn't enough clearance — confirmed live,
            the clock overlapped the "Household" header. max() keeps the
            desktop/browser-tab padding unchanged (env() is 0 there) while
            clearing the real inset on a notch/Dynamic Island device. */}
        <main className="w-full flex-1 px-5 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] md:px-8 md:pb-10 md:pt-6">
          {children}
        </main>
      </div>
      <BottomNav />
      {/* Mounted once here, not under any one domain's routes — Ask covers
          both Finance and Inventory, and AppShell doesn't remount on
          navigation within the shell route group, so the floating widget
          (and its conversation) persists across pages the same way
          BottomNav/DesktopSidebar already do. */}
      <AskFab />
    </div>
  );
}
