import { useState } from "react";

export const DEFAULT_PAGE_SIZE = 25;

/**
 * Client-side "Load more" windowing over an already-fully-loaded array.
 * This app's Zustand store hydrates a household's full data set up front
 * (for Realtime sync — see store.ts), so there's no server page to
 * request; every list this hook backs is already sitting in memory, and
 * "pagination" here means limiting how much of it gets rendered/mapped
 * into the DOM at once, not limiting what's fetched.
 *
 * `resetKey` should change whenever the *set* of items being windowed
 * changes for a reason that should jump back to the first page — a new
 * search query, a changed date/filter scope — but must stay the SAME
 * value across a Realtime-driven update to the underlying list (a new row
 * arriving, one being edited or removed) so a scrolled-down user's
 * "Load more" progress isn't silently discarded out from under them just
 * because the store re-rendered. Pass `null` (the default) for a list
 * with no filters of its own.
 *
 * The reset itself happens during render via the prevResetKey-comparison
 * pattern already established elsewhere in this app for prop-driven state
 * resets (e.g. add-person-sheet.tsx), not a useEffect — this repo's
 * react-hooks/set-state-in-effect rule flags the effect-based version as
 * causing an extra, avoidable cascading render.
 */
export function usePaginated<T>(items: T[], resetKey: unknown = null, pageSize: number = DEFAULT_PAGE_SIZE) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setVisibleCount(pageSize);
  }

  const visible = items.slice(0, visibleCount);
  const remaining = Math.max(0, items.length - visibleCount);

  return {
    visible,
    hasMore: remaining > 0,
    remaining,
    /** Handed back so callers (LoadMoreButton) don't need to import/track the same constant separately. */
    pageSize,
    /** Reveals one more page. Caps at items.length rather than always adding a full pageSize, so a final "Load more" tap with fewer than pageSize items left doesn't leave the count sitting past the real total (harmless either way since slice() clamps, but this keeps `remaining` accurate). */
    loadMore: () => setVisibleCount((v) => Math.min(items.length, v + pageSize)),
  };
}
