"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
import { useInventoryStore } from "@/lib/store";

export default function SettingsPage() {
  const router = useRouter();
  const household = useInventoryStore((s) => s.household);
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const members = useInventoryStore((s) => s.members);
  const me = members.find((m) => m.userId === currentUserId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-screen-title font-medium text-ink">Settings</h1>

      <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex size-12 items-center justify-center rounded-full bg-ink text-body font-medium text-white">
          {me?.displayName.slice(0, 1) ?? "?"}
        </div>
        <div>
          <p className="text-body font-medium text-ink">{me?.displayName}</p>
          <p className="text-caption text-muted-foreground">{me?.email}</p>
        </div>
      </div>

      <div className="rounded-xl bg-white shadow-sm">
        <SettingsRow icon="users" label={household.name} sublabel="Household" href="/settings/members" />
        <SettingsRow icon="needsReview" label="Needs-Review Queue" href="/review" />
        <SettingsRow icon="activity" label="Activity Feed" href="/activity" />
        <SettingsRow icon="tag" label="Tags" href="/tags" />
        <SettingsRow icon="trash" label="Trash" href="/settings/trash" />
        <SettingsRow icon="upload" label="Import CSV" sublabel="Desktop recommended" href="/settings/import" />
        <SettingsRow icon="key" label="API Keys" href="/settings/api-keys" last />
      </div>

      <div className="rounded-xl bg-white shadow-sm">
        <SettingsRow icon="user" label="Members" sublabel={`${members.length} in this household`} href="/settings/members" last />
      </div>

      <button
        onClick={() => router.push("/sign-in")}
        className="tap-target flex items-center justify-center gap-2 rounded-xl bg-white py-3 text-body font-medium text-danger shadow-sm"
      >
        <Icon name="logOut" size={16} /> Sign out
      </button>
    </div>
  );
}

function SettingsRow({
  icon,
  label,
  sublabel,
  href,
  last,
}: {
  icon: IconName;
  label: string;
  sublabel?: string;
  href: string;
  last?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`tap-target flex items-center gap-3 px-4 py-3 ${last ? "" : "border-b border-border"}`}
    >
      <Icon name={icon} size={18} className="text-ink" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body text-ink">{label}</p>
        {sublabel && <p className="truncate text-caption text-muted-foreground">{sublabel}</p>}
      </div>
      <Icon name="chevronRight" size={16} className="text-muted-foreground" />
    </Link>
  );
}
