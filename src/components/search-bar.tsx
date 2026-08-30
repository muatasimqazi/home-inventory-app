"use client";

import { forwardRef } from "react";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  onFocus?: () => void;
}

// forwardRef so callers that need to re-focus the underlying <input>
// imperatively (see the search page's mount-time refocus — plain
// `autoFocus` alone isn't reliable enough on iOS Safari after an SPA route
// change) have something to focus() beyond just setting the prop.
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  // Default reflects /search's real cross-domain scope (lib/search.ts
  // covers Finance transactions/accounts alongside Inventory items) — the
  // Overview page's redirect-to-/search bar and /search's own input both
  // rely on this default rather than setting their own. Callers scoped to
  // one real domain on purpose (e.g. Trash's Inventory-tab-only search)
  // still override it explicitly.
  { value, onChange, placeholder = "Search items, transactions, accounts…", autoFocus, className, onFocus },
  ref
) {
  return (
    <div
      className={cn(
        "relative flex h-13.5 items-center rounded-2xl border border-border bg-card shadow-sm",
        className
      )}
    >
      <Icon name="search" size={20} className="pointer-events-none absolute left-4 text-muted-foreground" />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label="Search"
        // text-base (16px), not text-body (14px), below md — iOS Safari
        // auto-zooms the whole page on focus for any input under 16px, and
        // its zoom-out-on-blur is unreliable enough (especially racing our
        // own focus/scroll handling in useAutoFocusVisible) that this read
        // as "the UI stays magnified after losing focus". 16px keeps iOS
        // from ever triggering the zoom in the first place; md:text-body
        // still shrinks it back to the intended size on desktop, where
        // this browser behavior doesn't apply anyway (same pattern as
        // ui/input.tsx's own text-base md:text-sm).
        className="tap-target h-full w-full rounded-2xl bg-transparent pr-4 pl-11 text-base text-ink outline-none placeholder:text-muted-foreground md:text-body"
      />
      {/* Keyboard shortcut hint — desktop only, per design (never shown on mobile). */}
      <span className="pointer-events-none absolute right-3 hidden items-center justify-center rounded-md bg-surface-muted px-1.5 py-0.5 text-micro text-muted-foreground md:flex">
        ⌘K
      </span>
    </div>
  );
});
