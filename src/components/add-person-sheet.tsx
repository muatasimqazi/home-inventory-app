"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useInventoryStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { newId } from "@/lib/id";

const RELATIONSHIPS = [
  { value: "partner_spouse", label: "Partner / Spouse" },
  { value: "child", label: "Child" },
  { value: "parent", label: "Parent" },
  { value: "family_member", label: "Family member" },
  { value: "roommate", label: "Roommate" },
  { value: "other", label: "Other" },
] as const;

type Relationship = (typeof RELATIONSHIPS)[number]["value"];

export interface AddedPerson {
  id: string;
  displayName: string;
  relationship: Relationship;
}

interface AddPersonSheetProps {
  open: boolean;
  /**
   * Called with the created person on success, or with no argument at all
   * when the sheet is dismissed without creating one (backdrop click,
   * Escape, or a future explicit Cancel). Either way this is the caller's
   * signal to flip `open` back to false — there's no separate
   * onOpenChange in this contract.
   */
  onCreated: (person?: AddedPerson) => void;
}

/**
 * Stand-in for Workstream 2's real AddPersonSheet (Household Ledger
 * Implementation Plan §3, PRD `v4 - Enhanced Features` §22/§23) — same
 * two-prop contract (`{ open, onCreated }`) so Workstream 1 can ship the
 * contextual "+ Add someone" moment without waiting on that component to
 * land. This inserts a real `people` row (the Phase 0 schema already
 * supports it) but intentionally does none of Workstream 2's fuller scope
 * — no photo, no "Will this person use the app?" managed-profile-vs-invite
 * branch (§23), no generalized People settings surface. Workstream 2 is
 * expected to replace this file outright; per the plan's §7 merge order
 * (Onboarding merges before People & ownership), that replacement is the
 * intended outcome, not a conflict to avoid.
 */
export function AddPersonSheet({ open, onCreated }: AddPersonSheetProps) {
  const householdId = useInventoryStore((s) => s.currentHouseholdId);
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState<Relationship>("other");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setRelationship("other");
    setSaving(false);
  }

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed || !householdId) return;
    setSaving(true);
    const personId = newId();
    const { error } = await getSupabaseBrowserClient()
      .from("people")
      .insert({
        id: personId,
        household_id: householdId,
        display_name: trimmed,
        relationship,
        created_by_user_id: currentUserId,
      });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${trimmed} added`);
    const created: AddedPerson = { id: personId, displayName: trimmed, relationship };
    reset();
    onCreated(created);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onCreated();
        }
      }}
    >
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">Add someone</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sam"
              className="h-11 bg-white"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Relationship</label>
            <Select value={relationship} onValueChange={(v) => setRelationship(v as Relationship)}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIPS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleAdd} disabled={!name.trim() || saving}>
            {saving ? "Adding…" : "Add"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
