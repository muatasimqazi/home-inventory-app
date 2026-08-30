"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useAutoFocusVisible } from "@/hooks/use-autofocus-visible";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { AddPersonSheet } from "@/components/add-person-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInventoryStore } from "@/lib/store";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
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
  initial: {
    name: string;
    category: string;
    quantity: number;
    notes: string;
    description: string;
    estimatedValue: number | null;
    extraDetails: Record<string, string>;
    ownerPersonId: string | null;
    isShared: boolean;
    minQuantity: number | null;
  };
  people: Person[];
  canInvite: boolean;
  onSave: (
    id: string,
    patch: Partial<{
      name: string;
      category: string;
      quantity: number;
      notes: string;
      description: string;
      estimatedValue: number | null;
      extraDetails: Record<string, string>;
      ownerPersonId: string | null;
      isShared: boolean;
      minQuantity: number | null;
    }>
  ) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  // iOS Safari doesn't shrink the layout viewport when the keyboard opens
  // (see the hook's own comment) — without this, focusing any field above
  // pushes this sticky Save bar behind the keyboard. No-op on Chromium.
  const keyboardInset = useKeyboardInset();
  const [name, setName] = useState(initial.name);
  const nameInputRef = useRef<HTMLInputElement>(null);
  useAutoFocusVisible(nameInputRef);
  const [category, setCategory] = useState(initial.category);
  const [quantity, setQuantity] = useState(String(initial.quantity));
  const [notes, setNotes] = useState(initial.notes);
  const [description, setDescription] = useState(initial.description);
  const [estimatedValue, setEstimatedValue] = useState(initial.estimatedValue === null ? "" : String(initial.estimatedValue));
  const [extraDetails, setExtraDetails] = useState<Record<string, string>>(initial.extraDetails);
  const [ownerPersonId, setOwnerPersonId] = useState(initial.ownerPersonId ?? HOUSEHOLD_OWNER_VALUE);
  const [isShared, setIsShared] = useState(initial.isShared);
  const [minQuantity, setMinQuantity] = useState(initial.minQuantity === null ? "" : String(initial.minQuantity));
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!name.trim()) {
      setError("Give this item a name.");
      return;
    }
    const ownerPerson = ownerPersonId === HOUSEHOLD_OWNER_VALUE ? null : (people.find((p) => p.id === ownerPersonId) ?? null);
    const trimmedMinQuantity = minQuantity.trim();
    const trimmedEstimatedValue = estimatedValue.trim();
    onSave(itemId, {
      name: name.trim(),
      category,
      quantity: Math.max(0, Math.min(9999, Number(quantity) || 0)),
      notes: notes.trim(),
      description: description.trim(),
      estimatedValue: trimmedEstimatedValue === "" ? null : Math.max(0, Number(trimmedEstimatedValue) || 0),
      extraDetails,
      ownerPersonId: ownerPerson?.id ?? null,
      isShared: ownerPerson ? isShared : false,
      minQuantity: trimmedMinQuantity === "" ? null : Math.max(0, Math.min(9999, Number(trimmedMinQuantity) || 0)),
    });
    toast.success("Item updated");
    onDone();
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
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
            ref={nameInputRef}
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

        <div className="flex gap-3">
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

          <Field label="Minimum quantity">
            <Input
              type="number"
              min={0}
              max={9999}
              placeholder="Not tracked"
              value={minQuantity}
              onChange={(e) => setMinQuantity(e.target.value)}
              className="h-11 w-28"
            />
          </Field>
        </div>
        {minQuantity.trim() !== "" && (
          <p className="-mt-2 text-caption text-muted-foreground">You&apos;ll get a push notification once quantity drops to {minQuantity.trim() || 0} or below.</p>
        )}

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

        {ownerPersonId !== HOUSEHOLD_OWNER_VALUE && (
          <label className="flex items-start gap-2 text-caption text-ink">
            <Checkbox checked={isShared} onCheckedChange={(v) => setIsShared(v === true)} className="mt-0.5" />
            <span>
              Share with household
              <span className="block text-micro text-muted-foreground">Others can see this item. Off by default — a personal item stays visible only to you.</span>
            </span>
          </label>
        )}

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

        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Material, color, distinguishing details"
          />
        </Field>

        <Field label="Estimated value">
          <div className="relative w-32">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body text-muted-foreground">$</span>
            <Input
              type="number"
              min={0}
              step="1"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              placeholder="—"
              className="h-11 pl-6"
            />
          </div>
        </Field>

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes" />
        </Field>
      </div>

      <div className="sticky bottom-0 border-t border-border bg-card px-4 py-3" style={{ bottom: keyboardInset }}>
        <div className="mx-auto flex max-w-lg gap-2">
          <Button variant="outline" size="lg" className="flex-1" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button size="lg" className="flex-1 bg-ink-fill text-white hover:bg-ink-fill/90" onClick={handleSave}>
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
