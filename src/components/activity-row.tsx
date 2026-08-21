import { Icon, type IconName } from "@/components/icon";
import { relativeTime } from "@/lib/format";
import { ACTION_LABEL } from "@/lib/activity-copy";
import type { ActivityLogAppend } from "@/lib/store";
import type { Member } from "@/lib/types";

const ACTION_ICON: Record<string, IconName> = {
  created: "plus",
  edited: "edit",
  moved: "move",
  archived: "archive",
  trashed: "trash",
  restored: "restore",
  deleted_forever: "trash",
  invited: "user",
  joined: "user",
  removed: "user",
  left: "user",
  ownership_transferred: "key",
};

export function ActivityRow({ entry, members }: { entry: ActivityLogAppend; members: Member[] }) {
  const actor = members.find((m) => m.userId === entry.actorUserId);
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted">
        <Icon name={ACTION_ICON[entry.action] ?? "check"} size={14} className="text-ink" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-body text-ink">
          <span className="font-medium">{actor?.displayName ?? "Someone"}</span> {ACTION_LABEL[entry.action] ?? entry.action}{" "}
          <span className="font-medium">{entry.entityName}</span>
        </p>
        {entry.detail && <p className="text-caption text-muted-foreground">{entry.detail}</p>}
      </div>
      <span className="shrink-0 text-caption text-muted-foreground">{relativeTime(entry.createdAt)}</span>
    </div>
  );
}
