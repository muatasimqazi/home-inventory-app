import type { ActivityAction } from "@/lib/types";

/**
 * Shared human-readable phrasing for an ActivityAction, extracted from
 * activity-row.tsx (the in-app Activity feed) so the household-activity
 * push notification pipeline (src/app/api/v1/webhooks/activity-log/
 * route.ts) renders the exact same sentence instead of an independently
 * maintained copy that can drift out of wording from the feed over time.
 * Both read this one map; neither defines its own.
 *
 * Composed as "{actorDisplayName} {ACTION_LABEL[action]} {entityName}" —
 * "invited"/"joined"/"removed"/"left"/"ownership_transferred" read a little
 * loosely against that template for some entity types (e.g. member/person
 * actions), same as they already do in the existing Activity feed; not
 * worth a separate per-entity-type grammar system for a handful of
 * membership actions.
 */
export const ACTION_LABEL: Record<ActivityAction, string> = {
  created: "added",
  edited: "edited",
  moved: "moved",
  archived: "archived",
  trashed: "trashed",
  restored: "restored",
  deleted_forever: "permanently deleted",
  invited: "invited",
  joined: "joined the household",
  removed: "was removed",
  left: "left the household",
  ownership_transferred: "became the Owner",
  completed: "completed",
};
