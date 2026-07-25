"use client";

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

export function SearchBar({ value, onChange, placeholder = "Search your home...", autoFocus, className, onFocus }: SearchBarProps) {
  return (
    <div className={cn("relative flex h-12 items-center rounded-full bg-white shadow-sm", className)}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label="Search your home"
        className="tap-target h-full w-full rounded-full bg-transparent pl-4 pr-11 text-body text-ink outline-none placeholder:text-muted-foreground"
      />
      <Icon name="search" size={20} className="pointer-events-none absolute right-4 text-ink" />
    </div>
  );
}
