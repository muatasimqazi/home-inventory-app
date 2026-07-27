"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
import { useInventoryStore, useCurrentHousehold } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const router = useRouter();
  const household = useCurrentHousehold();
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const members = useInventoryStore((s) => s.members);
  const households = useInventoryStore((s) => s.households);
  const tags = useInventoryStore((s) => s.tags);
  const me = members.find((m) => m.userId === currentUserId);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-screen-title font-semibold text-ink">Settings</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">Manage household preferences and data.</p>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
        <div className="flex size-12 items-center justify-center rounded-full bg-ink text-body font-medium text-white">
          {me?.displayName.slice(0, 1) ?? "?"}
        </div>
        <div>
          <p className="text-body font-medium text-ink">{me?.displayName}</p>
          <p className="text-caption text-muted-foreground">{me?.email}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SettingsRow icon="home" label="Household" sublabel={household.name} href="/settings/members" />
        <SettingsRow icon="users" label="My Households" sublabel={`${households.length} household${households.length === 1 ? "" : "s"}`} href="/settings/households" />
        <SettingsRow icon="user" label="Members" sublabel={`${members.length} active`} href="/settings/members" />
        <SettingsRow icon="printer" label="Label printing" sublabel="Bin ID labels" href="/desktop/labels" />
        <SettingsRow icon="upload" label="Import CSV" sublabel="Desktop recommended" href="/settings/import" />
        <SettingsRow icon="download" label="Data & Export" sublabel="CSV, PDF, JSON" href="/settings/export" />
        <SettingsRow icon="tag" label="Tags" sublabel={`${tags.length} tags`} href="/tags" />
        <SettingsRow icon="needsReview" label="Needs-Review Queue" href="/review" />
        <SettingsRow icon="activity" label="Activity Feed" href="/activity" />
        <SettingsRow icon="key" label="API Keys" href="/settings/api-keys" />
      </div>

      <Link href="/settings/trash" className="text-center text-caption font-medium text-muted-foreground">
        Trash and deleted items
      </Link>

      <button
        onClick={async () => {
          await getSupabaseBrowserClient().auth.signOut();
          router.push("/sign-in");
        }}
        className="tap-target flex items-center justify-center gap-2 rounded-2xl border border-border bg-white py-3 text-body font-medium text-danger"
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
}: {
  icon: IconName;
  label: string;
  sublabel?: string;
  href: string;
}) {
  return (
    <Link href={href} className="tap-target flex items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 shadow-sm">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-100">
        <Icon name={icon} size={18} className="text-yellow" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-ink">{label}</p>
        {sublabel && <p className="truncate text-caption text-muted-foreground">{sublabel}</p>}
      </div>
      <span className="shrink-0 text-caption font-semibold text-ink">Open</span>
    </Link>
  );
}
