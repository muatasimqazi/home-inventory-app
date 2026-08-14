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
  { value, onChange, placeholder = "Search items, containers, locations...", autoFocus, className, onFocus },
  ref
) {
  return (
    <div
      className={cn(
        "relative flex h-13.5 items-center rounded-2xl border border-border bg-white shadow-sm",
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
        className="tap-target h-full w-full rounded-2xl bg-transparent pr-4 pl-11 text-body text-ink outline-none placeholder:text-muted-foreground"
      />
      {/* Keyboard shortcut hint — desktop only, per design (never shown on mobile). */}
      <span className="pointer-events-none absolute right-3 hidden items-center justify-center rounded-md bg-surface-muted px-1.5 py-0.5 text-micro text-muted-foreground md:flex">
        ⌘K
      </span>
    </div>
  );
});
