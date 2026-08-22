"use client";

import { Button } from "@/components/ui/button";

/** Shared "Load more" control for every usePaginated()-backed list — one look everywhere rather than each page inventing its own caption wording/styling. */
export function LoadMoreButton({ remaining, pageSize, onClick }: { remaining: number; pageSize: number; onClick: () => void }) {
  const count = Math.min(remaining, pageSize);
  return (
    <Button variant="outline" size="lg" className="w-full" onClick={onClick}>
      Load {count} more{remaining > pageSize ? ` (${remaining} remaining)` : ""}
    </Button>
  );
}
