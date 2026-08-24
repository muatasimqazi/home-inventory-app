"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useInventoryStore, useCurrentHousehold } from "@/lib/store";
import { useAutoFocusVisible } from "@/hooks/use-autofocus-visible";

/**
 * The household entity itself — currently just its name — as its own
 * page, split out from settings/members.tsx ("People," the household's
 * roster) so the main Settings page's "Household" row actually lands
 * somewhere named for what it is rather than reusing the People page's
 * destination under a different label. Also the first place a rename is
 * actually possible: household-setup's naming screen has said "You can
 * rename this later from Settings" since it shipped, with nowhere in
 * Settings that ever made that true until now.
 *
 * Owner-only edit (RLS: "household owner update" on households) — a
 * non-owner sees the name read-only with the same explanatory note
 * settings/domains uses for its own owner-gated toggles.
 */
export default function HouseholdDetailsPage() {
  const household = useCurrentHousehold();
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const members = useInventoryStore((s) => s.members);
  const renameHousehold = useInventoryStore((s) => s.renameHousehold);
  const isOwner = members.find((m) => m.userId === currentUserId)?.role === "owner";

  const [editOpen, setEditOpen] = useState(false);
  const [nameInput, setNameInput] = useState(household.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  useAutoFocusVisible(nameInputRef, [editOpen]);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const result = await renameHousehold(household.id, nameInput);
    setSaving(false);
    if (!result.ok) {
      setNameError(result.error ?? "Couldn't rename household.");
      return;
    }
    toast.success("Household renamed");
    setEditOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-screen-title font-semibold text-ink">Household</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">{isOwner ? "Only you, as owner, can rename it." : "Only the household owner can rename it."}</p>
      </div>

      {isOwner ? (
        <button
          type="button"
          onClick={() => {
            setNameInput(household.name);
            setNameError(null);
            setEditOpen(true);
          }}
          className="tap-target flex items-center gap-3 rounded-2xl border border-border bg-white p-4 text-left shadow-sm"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-ink text-white">
            <Icon name="home" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-caption text-muted-foreground">Name</p>
            <p className="truncate text-body font-medium text-ink">{household.name}</p>
          </div>
          <Icon name="edit" size={16} className="shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-ink text-white">
            <Icon name="home" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-caption text-muted-foreground">Name</p>
            <p className="truncate text-body font-medium text-ink">{household.name}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <SettingsLinkRow icon="users" label="People" sublabel="Members and managed profiles" href="/settings/members" />
        <SettingsLinkRow
          icon="grid"
          label="What this household tracks"
          sublabel={household.financeEnabled && household.inventoryEnabled ? "Inventory & Finance" : household.financeEnabled ? "Finance only" : "Inventory only"}
          href="/settings/domains"
        />
      </div>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-section-title font-medium text-ink">Rename household</SheetTitle>
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
                ref={nameInputRef}
              />
              {nameError && <p className="mt-1 text-caption text-danger">{nameError}</p>}
            </div>
            <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleSave} disabled={saving}>
              {saving ? <Icon name="spinner" size={16} className="animate-spin" /> : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SettingsLinkRow({ icon, label, sublabel, href }: { icon: "users" | "grid"; label: string; sublabel: string; href: string }) {
  return (
    <Link href={href} className="tap-target flex items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <Icon name={icon} size={18} className="shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-ink">{label}</p>
        <p className="truncate text-caption text-muted-foreground">{sublabel}</p>
      </div>
      <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
    </Link>
  );
}
