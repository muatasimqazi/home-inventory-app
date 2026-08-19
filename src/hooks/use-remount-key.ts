import { useCallback, useState } from "react";

/**
 * A monotonically increasing value to force a fresh remount of an
 * always-mounted "create new X" sheet/dialog each time it's freshly
 * opened. Same root cause as the edit-form staleness bug fixed earlier
 * (key={record.id} there) — these sheets stay mounted with `open` as a
 * plain prop rather than a conditional render, so their internal
 * useState(default) only ever seeds once. For an edit sheet that showed
 * up as "doesn't show the right record's data"; for a create sheet it
 * shows up differently: open "New X", type something, cancel without
 * saving, reopen "New X" — the abandoned text is still there, because
 * nothing ever forced the component to actually remount and re-run its
 * initializers.
 *
 * Call `bump()` in the same click handler that sets the sheet's `open`
 * state to true, and pass the returned key as that sheet's `key` prop —
 * bumping on open (not on close) means a normal close still gets its
 * full exit animation (the key doesn't change until the *next* open), but
 * every fresh open is guaranteed to be a genuinely fresh mount.
 */
export function useRemountKey(): [number, () => void] {
  const [key, setKey] = useState(0);
  const bump = useCallback(() => setKey((k) => k + 1), []);
  return [key, bump];
}
