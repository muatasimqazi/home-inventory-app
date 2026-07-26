"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { BreadcrumbTrail } from "@/components/breadcrumb-trail";
import { MoveSheet } from "@/components/move-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInventoryStore } from "@/lib/store";
import { buildBreadcrumb } from "@/lib/selectors";
import { CATEGORIES } from "@/lib/types";
import { extraFieldsForCategory } from "@/lib/category";

const SHARED_OWNER_VALUE = "shared";

const CATEGORY_EMOJI: Record<string, string> = {
  Tool: "🛠️",
  Electronics: "🔌",
  Document: "📄",
  Clothing: "🧥",
  Kitchen: "🍶",
  "Sporting Goods": "🏸",
  Toy: "🎲",
  Decor: "🖼️",
  Hardware: "🔩",
  Outdoor: "⛺",
  Miscellaneous: "📦",
};

export default function ManualAddItemPage() {
  return (
    <Suspense>
      <ManualAddItemInner />
    </Suspense>
  );
}

function ManualAddItemInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);
  const members = useInventoryStore((s) => s.members);
  const createItem = useInventoryStore((s) => s.createItem);
  const getOrCreateTag = useInventoryStore((s) => s.getOrCreateTag);
  const lastUsedDestination = useInventoryStore((s) => s.lastUsedDestination);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [extraDetails, setExtraDetails] = useState<Record<string, string>>({});
  const [ownerUserId, setOwnerUserId] = useState(SHARED_OWNER_VALUE);
  const [destination, setDestinationState] = useState<{ locationId: string | null; containerId: string | null }>(() => {
    const locationId = searchParams.get("locationId");
    const containerId = searchParams.get("containerId");
    return locationId ? { locationId, containerId: containerId ?? null } : lastUsedDestination ?? { locationId: null, containerId: null };
  });
  const [moveOpen, setMoveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const breadcrumb = buildBreadcrumb(destination.locationId, destination.containerId, locations, containers);

  function addTag() {
    const value = tagInput.trim();
    if (value && !tags.includes(value)) setTags((t) => [...t, value]);
    setTagInput("");
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Give this item a name.");
      return;
    }
    setSaving(true);
    const item = createItem({
      name: name.trim(),
      category,
      quantity: Math.max(0, Math.min(9999, Number(quantity) || 0)),
      notes: notes.trim(),
      photoEmoji: CATEGORY_EMOJI[category] ?? "📦",
      locationId: destination.locationId,
      containerId: destination.containerId,
      tagIds: tags.map((t) => getOrCreateTag(t).id),
      extraDetails,
      ownerUserId: ownerUserId === SHARED_OWNER_VALUE ? null : ownerUserId,
    });
    toast.success(`Added ${item.name}`);
    router.push(`/items/${item.id}`);
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-surface-muted"
          aria-label="Cancel"
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <div>
          <h1 className="text-body font-semibold text-ink">Add manually</h1>
          <p className="text-micro text-muted-foreground">Create one item without using a photo.</p>
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
            placeholder="e.g. Cordless Drill"
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
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Belongs to">
          <Select value={ownerUserId} onValueChange={setOwnerUserId}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SHARED_OWNER_VALUE}>Shared</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Location">
          <button
            type="button"
            onClick={() => setMoveOpen(true)}
            className="tap-target flex h-11 w-full items-center justify-between rounded-lg border border-border bg-white px-3 text-left"
          >
            <BreadcrumbTrail segments={breadcrumb} interactive={false} className="text-body text-ink" />
            <Icon name="chevronRight" size={16} className="text-muted-foreground" />
          </button>
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

        {extraFieldsForCategory(category).length > 0 && (
          <Field label="Details">
            <div className="flex flex-col gap-2">
              {extraFieldsForCategory(category).map((field) => (
                <Input
                  key={field.key}
                  value={extraDetails[field.key] ?? ""}
                  onChange={(e) => setExtraDetails((d) => ({ ...d, [field.key]: e.target.value }))}
                  placeholder={field.label}
                  className="h-11"
                />
              ))}
            </div>
          </Field>
        )}

        <Field label="Tags">
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add a tag and press Enter"
              className="h-11 flex-1"
            />
          </div>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTags((cur) => cur.filter((x) => x !== t))}
                  className="flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 text-caption text-ink"
                >
                  {t}
                  <Icon name="close" size={12} />
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes" />
        </Field>
      </div>

      <div className="sticky bottom-0 border-t border-border bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg gap-2">
          <Button variant="outline" size="lg" className="flex-1" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button size="lg" className="flex-1 bg-ink text-white hover:bg-ink/90" onClick={handleSave} disabled={saving}>
            {saving ? <Icon name="spinner" size={16} className="animate-spin" /> : "Save item"}
          </Button>
        </div>
      </div>

      <MoveSheet
        open={moveOpen}
        onOpenChange={setMoveOpen}
        currentLocationId={destination.locationId}
        currentContainerId={destination.containerId}
        onMove={setDestinationState}
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
