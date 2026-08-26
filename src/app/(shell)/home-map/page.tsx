"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PinnedLocationFormSheet } from "@/components/pinned-location-form-sheet";
import { PinnedLocationPhoto } from "@/components/pinned-location-photo";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { PINNED_LOCATION_CATEGORY_LABELS } from "@/lib/pinned-locations";
import { useRemountKey } from "@/hooks/use-remount-key";
import type { PinnedLocation } from "@/lib/types";

/**
 * Home Map (PRD §29, Household Ledger Implementation Plan Workstream 5) —
 * a handful of pinned critical locations (water shutoff, electrical panel,
 * gas shutoff, HVAC, network equipment) plus renovation wall photos, each
 * a simple record: name, category, photo, note. Deliberately one flat list
 * page, not a per-pin detail route or a floor-plan/schematic surface — see
 * the workstream's own non-scope line (Implementation Plan §6).
 */
export default function HomeMapPage() {
  const router = useRouter();
  const pinnedLocations = useInventoryStore((s) => s.pinnedLocations);
  const createPinnedLocation = useInventoryStore((s) => s.createPinnedLocation);
  const updatePinnedLocation = useInventoryStore((s) => s.updatePinnedLocation);
  const deletePinnedLocation = useInventoryStore((s) => s.deletePinnedLocation);

  const [createOpen, setCreateOpen] = useState(false);
  const [createKey, bumpCreateKey] = useRemountKey();
  const [editingPin, setEditingPin] = useState<PinnedLocation | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deletingPin, setDeletingPin] = useState<PinnedLocation | null>(null);

  function openCreate() {
    bumpCreateKey();
    setCreateOpen(true);
  }

  function openEdit(pin: PinnedLocation) {
    setEditingPin(pin);
    setEditOpen(true);
  }

  const sorted = [...pinnedLocations].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="flex flex-col gap-5 pb-6">
      <button onClick={() => router.back()} className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm md:hidden">
        <Icon name="arrowLeft" size={18} />
      </button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Home Map</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">
            Save important locations so anyone in your household can find them.
          </p>
        </div>
        <Button size="icon-lg" className="rounded-md" onClick={openCreate} aria-label="Add pinned location">
          <Icon name="plus" size={18} />
        </Button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon="pin"
          title="Start mapping your home"
          description="Suggested: main water shutoff, electrical panel, gas shutoff, HVAC, network equipment — or a photo of a wall before drywall goes up."
          action={
            <Button size="lg" onClick={openCreate}>
              Add a location
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {sorted.map((pin) => (
            // A <button> holding the delete/expand <button>s would be
            // invalid HTML (interactive elements can't nest) — a div with
            // role="button" instead, same "clickable row with real button
            // descendants" convention trash/page.tsx's own rows use.
            <div
              key={pin.id}
              role="button"
              tabIndex={0}
              onClick={() => openEdit(pin)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") openEdit(pin);
              }}
              className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-white text-left shadow-sm"
            >
              <PinnedLocationPhoto photoPath={pin.photoPath} category={pin.category} className="aspect-square w-full rounded-none" enableLightbox />
              <div className="flex flex-col gap-0.5 p-3">
                <p className="truncate text-body font-medium text-ink">{pin.name}</p>
                <p className="truncate text-caption text-muted-foreground">{PINNED_LOCATION_CATEGORY_LABELS[pin.category]}</p>
                {pin.locationNote && <p className="truncate text-caption text-muted-foreground">{pin.locationNote}</p>}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeletingPin(pin);
                }}
                aria-label={`Remove ${pin.name}`}
                className="tap-target absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-white/90 text-muted-foreground shadow-sm hover:text-danger"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <PinnedLocationFormSheet
        key={createKey}
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add Pinned Location"
        onSubmit={async ({ name, category, locationNote, photoFile }) => {
          const result = await createPinnedLocation({ name, category, locationNote, photoFile });
          if (result.ok) {
            toast.success(`Added ${name}`);
          } else {
            toast.error(result.error ?? "Couldn't add that location.");
          }
        }}
      />

      <PinnedLocationFormSheet
        // Keyed on the record being edited (entity-form-sheet.tsx's own
        // pattern) — `open` alone is just a visibility prop here, so
        // without this key, switching from editing one pin to another
        // within the same page session would keep showing the first pin's
        // stale initial values.
        key={editingPin?.id ?? "none"}
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit Pinned Location"
        initialName={editingPin?.name}
        initialCategory={editingPin?.category}
        initialLocationNote={editingPin?.locationNote ?? ""}
        initialPhotoPath={editingPin?.photoPath ?? null}
        onSubmit={async ({ name, category, locationNote, photoFile, removePhoto }) => {
          if (!editingPin) return;
          const result = await updatePinnedLocation(editingPin.id, { name, category, locationNote, photoFile, removePhoto });
          if (result.ok) {
            toast.success("Location updated");
          } else {
            toast.error(result.error ?? "Couldn't update that location.");
          }
        }}
      />

      <ConfirmDialog
        open={deletingPin !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingPin(null);
        }}
        title={`Remove ${deletingPin?.name ?? "this location"}?`}
        description="This removes the pin and its photo. This can't be undone."
        confirmLabel="Remove"
        tone="danger"
        icon="trash"
        onConfirm={() => {
          if (!deletingPin) return;
          deletePinnedLocation(deletingPin.id);
          toast("Location removed");
        }}
      />
    </div>
  );
}
