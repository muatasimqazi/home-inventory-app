"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInventoryStore } from "@/lib/store";
import { CATEGORIES } from "@/lib/types";
import { extraFieldsForCategory } from "@/lib/category";

export default function EditItemPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const items = useInventoryStore((s) => s.items);
  const updateItem = useInventoryStore((s) => s.updateItem);

  const item = items.find((it) => it.id === params.id);
  if (!item) return notFound();

  return <EditItemForm key={item.id} itemId={item.id} initial={item} onSave={updateItem} onDone={() => router.push(`/items/${item.id}`)} />;
}

function EditItemForm({
  itemId,
  initial,
  onSave,
  onDone,
}: {
  itemId: string;
  initial: { name: string; category: string; quantity: number; notes: string; extraDetails: Record<string, string> };
  onSave: (id: string, patch: Partial<{ name: string; category: string; quantity: number; notes: string; extraDetails: Record<string, string> }>) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState(initial.category);
  const [quantity, setQuantity] = useState(String(initial.quantity));
  const [notes, setNotes] = useState(initial.notes);
  const [extraDetails, setExtraDetails] = useState<Record<string, string>>(initial.extraDetails);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!name.trim()) {
      setError("Give this item a name.");
      return;
    }
    onSave(itemId, {
      name: name.trim(),
      category,
      quantity: Math.max(0, Math.min(9999, Number(quantity) || 0)),
      notes: notes.trim(),
      extraDetails,
    });
    toast.success("Item updated");
    onDone();
  }

  return (
    <div className="min-h-dvh bg-surface-muted">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="tap-target flex size-9 items-center justify-center rounded-full hover:bg-surface-muted"
          aria-label="Cancel"
        >
          <Icon name="close" size={18} />
        </button>
        <h1 className="text-body font-medium text-ink">Edit Item</h1>
        <div className="size-9" />
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
              {CATEGORIES.map((c) => (
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

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes" />
        </Field>
      </div>

      <div className="sticky bottom-0 border-t border-border bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg gap-2">
          <Button variant="outline" size="lg" className="flex-1" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button size="lg" className="flex-1" onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
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
