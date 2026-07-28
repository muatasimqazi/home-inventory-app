"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon, type IconName } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useInventoryStore, useCurrentHousehold } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const router = useRouter();
  const household = useCurrentHousehold();
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const members = useInventoryStore((s) => s.members);
  const households = useInventoryStore((s) => s.households);
  const tags = useInventoryStore((s) => s.tags);
  const updateMyProfile = useInventoryStore((s) => s.updateMyProfile);
  const me = members.find((m) => m.userId === currentUserId);

  const [editOpen, setEditOpen] = useState(false);
  const [nameInput, setNameInput] = useState(me?.displayName ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSaveName() {
    if (!nameInput.trim()) {
      setNameError("Name is required.");
      return;
    }
    setSaving(true);
    const result = await updateMyProfile({ displayName: nameInput.trim() });
    setSaving(false);
    if (!result.ok) {
      setNameError(result.error ?? "Couldn't save your name.");
      return;
    }
    toast.success("Name updated");
    setEditOpen(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-screen-title font-semibold text-ink">Settings</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">Manage household preferences and data.</p>
      </div>

      <button
        type="button"
        onClick={() => {
          setNameInput(me?.displayName ?? "");
          setNameError(null);
          setEditOpen(true);
        }}
        className="tap-target flex items-center gap-3 rounded-2xl border border-border bg-white p-4 text-left shadow-sm"
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-ink text-body font-medium text-white">
          {me?.displayName.slice(0, 1) ?? "?"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-ink">{me?.displayName}</p>
          <p className="truncate text-caption text-muted-foreground">{me?.email}</p>
        </div>
        <Icon name="edit" size={16} className="shrink-0 text-muted-foreground" />
      </button>

      <div className="flex flex-col gap-2">
        <SettingsRow icon="home" label="Household" sublabel={household.name} href="/settings/members" />
        <SettingsRow icon="users" label="My Households" sublabel={`${households.length} household${households.length === 1 ? "" : "s"}`} href="/settings/households" />
        <SettingsRow icon="user" label="Members" sublabel={`${members.length} active`} href="/settings/members" />
        <SettingsRow icon="printer" label="Label printing" sublabel="Container ID labels" href="/desktop/labels" />
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
          useInventoryStore.getState().unsubscribeRealtime();
          await getSupabaseBrowserClient().auth.signOut();
          router.push("/sign-in");
        }}
        className="tap-target flex items-center justify-center gap-2 rounded-2xl border border-border bg-white py-3 text-body font-medium text-danger"
      >
        <Icon name="logOut" size={16} /> Sign out
      </button>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-section-title font-medium text-ink">Your name</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-6">
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Name</label>
              <Input
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  if (nameError) setNameError(null);
                }}
                className="h-11 bg-white"
                autoFocus
              />
              {nameError && <p className="mt-1 text-caption text-danger">{nameError}</p>}
            </div>
            <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleSaveName} disabled={saving}>
              {saving ? <Icon name="spinner" size={16} className="animate-spin" /> : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
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
