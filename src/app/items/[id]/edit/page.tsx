"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { AddPersonSheet } from "@/components/add-person-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInventoryStore } from "@/lib/store";
import { sortByLabel } from "@/lib/selectors";
import { SORTED_CATEGORIES, type Person } from "@/lib/types";
import { extraFieldsForCategory } from "@/lib/category";

const HOUSEHOLD_OWNER_VALUE = "household";
const ADD_PERSON_VALUE = "__add_person__";

export default function EditItemPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const items = useInventoryStore((s) => s.items);
  const people = sortByLabel(useInventoryStore((s) => s.people), (p) => p.displayName);
  const isOwner = useInventoryStore((s) => s.members.find((m) => m.userId === s.currentUserId)?.role === "owner");
  const updateItem = useInventoryStore((s) => s.updateItem);

  const item = items.find((it) => it.id === params.id);
  if (!item) return notFound();

  return (
    <EditItemForm
      key={item.id}
      itemId={item.id}
      initial={item}
      people={people}
      canInvite={isOwner}
      onSave={updateItem}
      onDone={() => router.push(`/items/${item.id}`)}
    />
  );
}

function EditItemForm({
  itemId,
  initial,
  people,
  canInvite,
  onSave,
  onDone,
}: {
  itemId: string;
  initial: { name: string; category: string; quantity: number; notes: string; extraDetails: Record<string, string>; ownerPersonId: string | null };
  people: Person[];
  canInvite: boolean;
  onSave: (
    id: string,
    patch: Partial<{ name: string; category: string; quantity: number; notes: string; extraDetails: Record<string, string>; ownerPersonId: string | null }>
  ) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState(initial.category);
  const [quantity, setQuantity] = useState(String(initial.quantity));
  const [notes, setNotes] = useState(initial.notes);
  const [extraDetails, setExtraDetails] = useState<Record<string, string>>(initial.extraDetails);
  const [ownerPersonId, setOwnerPersonId] = useState(initial.ownerPersonId ?? HOUSEHOLD_OWNER_VALUE);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!name.trim()) {
      setError("Give this item a name.");
      return;
    }
    const ownerPerson = ownerPersonId === HOUSEHOLD_OWNER_VALUE ? null : (people.find((p) => p.id === ownerPersonId) ?? null);
    onSave(itemId, {
      name: name.trim(),
      category,
      quantity: Math.max(0, Math.min(9999, Number(quantity) || 0)),
      notes: notes.trim(),
      extraDetails,
      ownerPersonId: ownerPerson?.id ?? null,
    });
    toast.success("Item updated");
    onDone();
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.back()}
          className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-surface-muted"
          aria-label="Cancel"
        >
          <Icon name="chevronRight" size={18} className="rotate-180" />
        </button>
        <div>
          <h1 className="text-body font-semibold text-ink">Edit item</h1>
          <p className="text-micro text-muted-foreground">Update item details, tags, and location.</p>
        </div>
      </header>

      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-4">
        <Field label="Name" required>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            className="h-11"
            autoFocus
          />
          {error && <p className="mt-1 text-caption text-danger">{error}</p>}
        </Field>

        <Field label="Category">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTED_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Quantity">
          <Input
            type="number"
            min={0}
            max={9999}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="h-11 w-28"
          />
        </Field>

        <Field label="Belongs to">
          <Select
            value={ownerPersonId}
            onValueChange={(v) => {
              if (v === ADD_PERSON_VALUE) {
                setAddPersonOpen(true);
                return;
              }
              setOwnerPersonId(v);
            }}
          >
            <SelectTrigger className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={HOUSEHOLD_OWNER_VALUE}>Household</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.displayName}
                </SelectItem>
              ))}
              <SelectItem value={ADD_PERSON_VALUE}>+ Add someone</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {extraFieldsForCategory(category).length > 0 && (
          <Field label="Details">
            <div className="flex flex-col gap-2">
              {extraFieldsForCategory(category).map((field) => (
                <Input
                  key={field.key}
                  value={extraDetails[field.key] ?? ""}
                  onChange={(e) => setExtraDetails((d) => ({ ...d, [field.key]: e.target.value }))}
                  placeholder={field.placeholder ? `${field.label} (${field.placeholder})` : field.label}
                  className="h-11"
                />
              ))}
            </div>
          </Field>
        )}

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes" />
        </Field>
      </div>

      <div className="sticky bottom-0 border-t border-border bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg gap-2">
          <Button variant="outline" size="lg" className="flex-1" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button size="lg" className="flex-1 bg-ink text-white hover:bg-ink/90" onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>

      <AddPersonSheet
        open={addPersonOpen}
        onOpenChange={setAddPersonOpen}
        onCreated={(person) => setOwnerPersonId(person.id)}
        canInvite={canInvite}
      />
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-caption text-muted-foreground">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
    </div>
  );
}
