"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon, type IconName } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useInventoryStore, useCurrentHousehold } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { listTimeZones, detectedTimeZone } from "@/lib/format";

// Sentinel for "no override, use this device's own zone" — Member.timezone
// itself stays null in that case; Select just can't bind a literal empty
// string reliably (same reasoning as HOUSEHOLD_OWNER_VALUE-style sentinels
// elsewhere in this app, e.g. entity-form-sheet.tsx).
const AUTO_TIMEZONE_VALUE = "__auto__";

export default function SettingsPage() {
  const router = useRouter();
  const household = useCurrentHousehold();
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const members = useInventoryStore((s) => s.members);
  const people = useInventoryStore((s) => s.people);
  const households = useInventoryStore((s) => s.households);
  const tags = useInventoryStore((s) => s.tags);
  const updateMyProfile = useInventoryStore((s) => s.updateMyProfile);
  const me = members.find((m) => m.userId === currentUserId);

  const [editOpen, setEditOpen] = useState(false);
  const [nameInput, setNameInput] = useState(me?.displayName ?? "");
  const [timezoneInput, setTimezoneInput] = useState(me?.timezone ?? AUTO_TIMEZONE_VALUE);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const timeZones = listTimeZones();

  async function handleSaveProfile() {
    if (!nameInput.trim()) {
      setNameError("Name is required.");
      return;
    }
    setSaving(true);
    const result = await updateMyProfile({
      displayName: nameInput.trim(),
      timezone: timezoneInput === AUTO_TIMEZONE_VALUE ? null : timezoneInput,
    });
    setSaving(false);
    if (!result.ok) {
      setNameError(result.error ?? "Couldn't save your profile.");
      return;
    }
    toast.success("Profile updated");
    setEditOpen(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-screen-title font-semibold text-ink">Settings</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">Household, members, and data.</p>
      </div>

      <button
        type="button"
        onClick={() => {
          setNameInput(me?.displayName ?? "");
          setTimezoneInput(me?.timezone ?? AUTO_TIMEZONE_VALUE);
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

      <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Settings</p>
      <div className="flex flex-col gap-2">
        <SettingsRow icon="home" label="Household" sublabel={household.name} href="/settings/members" />
        <SettingsRow icon="users" label="My Households" sublabel={`${households.length} household${households.length === 1 ? "" : "s"}`} href="/settings/households" />
        <SettingsRow icon="user" label="People" sublabel={`${people.length} in household`} href="/settings/members" />
        <SettingsRow icon="printer" label="Label printing" sublabel="Container ID labels" href="/desktop/labels" />
        <SettingsRow icon="upload" label="Import CSV" sublabel="Items or transactions" href="/import" />
        <SettingsRow icon="bell" label="Notifications" sublabel="Bill reminders and more" href="/settings/notifications" />
        <SettingsRow icon="attachment" label="Email Receipts" sublabel="Forward purchases with no physical receipt" href="/settings/email-receipts" />
        <SettingsRow icon="download" label="Data & Export" sublabel="CSV, PDF, JSON" href="/settings/export" />
        <SettingsRow icon="tag" label="Tags" sublabel={`${tags.length} tags`} href="/tags" />
        <SettingsRow icon="needsReview" label="Needs-Review Queue" href="/review" />
        <SettingsRow icon="activity" label="Activity Feed" href="/activity" />
        <SettingsRow icon="key" label="API Keys" href="/settings/api-keys" />
      </div>

      <Link href="/trash" className="text-center text-caption font-medium text-muted-foreground">
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

      <Link
        href="/settings/delete-account"
        className="tap-target flex items-center justify-center gap-2 py-1 text-caption font-medium text-muted-foreground"
      >
        <Icon name="danger" size={14} /> Delete account
      </Link>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-section-title font-medium text-ink">Your profile</SheetTitle>
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
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Time zone</label>
              <Select value={timezoneInput} onValueChange={setTimezoneInput}>
                <SelectTrigger className="h-11 w-full bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_TIMEZONE_VALUE}>Automatic ({detectedTimeZone()})</SelectItem>
                  {timeZones.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-micro text-muted-foreground">
                Used for “today” — e.g. a scanned receipt with no readable date, or the day a bill reminder fires. Leave on Automatic unless this device&apos;s own time zone is wrong or you want a fixed “home” zone while traveling.
              </p>
            </div>
            <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleSaveProfile} disabled={saving}>
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
