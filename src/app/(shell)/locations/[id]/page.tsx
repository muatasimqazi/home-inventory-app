"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { EntityCard } from "@/components/entity-card";
import { EntityRow } from "@/components/entity-row";
import { ItemCard } from "@/components/item-card";
import { ItemRow } from "@/components/item-row";
import { PhotoThumb } from "@/components/photo-thumb";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { EmptyState } from "@/components/empty-state";
import { EntityFormSheet } from "@/components/entity-form-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { coverPhotoUrl } from "@/lib/cover-photo";
import { rotateStoredPhoto } from "@/lib/crop-image";
import { activeItemCountForContainer, buildBreadcrumb, breadcrumbLabel, directChildContainers, itemsIn } from "@/lib/selectors";
import { useRemountKey } from "@/hooks/use-remount-key";

export default function LocationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);
  const items = useInventoryStore((s) => s.items);
  const createContainer = useInventoryStore((s) => s.createContainer);
  const setContainerCoverPhoto = useInventoryStore((s) => s.setContainerCoverPhoto);
  const updateLocation = useInventoryStore((s) => s.updateLocation);
  const trashLocation = useInventoryStore((s) => s.trashLocation);
  const setLocationCoverPhoto = useInventoryStore((s) => s.setLocationCoverPhoto);
  const removeLocationCoverPhoto = useInventoryStore((s) => s.removeLocationCoverPhoto);

  const [addContainerOpen, setAddContainerOpen] = useState(false);
  const [addContainerKey, bumpAddContainerKey] = useRemountKey();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("grid");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [rotatingPhoto, setRotatingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const location = locations.find((l) => l.id === params.id);
  if (!location) return notFound();

  const childContainers = directChildContainers(containers, null, location.id);
  const directItems = itemsIn(items, location.id, null);

  async function handlePhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !location) return;
    setUploadingPhoto(true);
    const result = await setLocationCoverPhoto(location.id, file);
    setUploadingPhoto(false);
    if (!result.ok) {
      toast.error(result.error ?? "Couldn't set photo.");
      return;
    }
    toast.success("Photo updated");
  }

  async function handleRotatePhoto() {
    if (!location || !location.coverPhotoPath) return;
    setRotatingPhoto(true);
    try {
      const rotated = await rotateStoredPhoto(coverPhotoUrl(location.coverPhotoPath), 90);
      const result = await setLocationCoverPhoto(location.id, rotated);
      if (!result.ok) toast.error(result.error ?? "Couldn't rotate photo.");
    } catch {
      toast.error("Couldn't rotate photo.");
    } finally {
      setRotatingPhoto(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm">
          <Icon name="arrowLeft" size={18} />
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditOpen(true)} className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm">
            <Icon name="edit" size={18} />
          </button>
          <button onClick={() => setDeleteOpen(true)} className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm">
            <Icon name="trash" size={18} className="text-danger" />
          </button>
        </div>
      </div>

      <div className="relative">
        <PhotoThumb emoji={location.coverPhotoEmoji ?? "📦"} coverPhotoPath={location.coverPhotoPath} className="h-48 w-full" emojiClassName="text-8xl" />
        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChosen} />
        <div className="absolute bottom-2 right-2 flex gap-2">
          {location.coverPhotoPath && (
            <button
              type="button"
              onClick={handleRotatePhoto}
              disabled={rotatingPhoto}
              aria-label="Rotate photo"
              className="tap-target flex size-9 items-center justify-center rounded-full bg-white/90 shadow-sm disabled:opacity-60"
            >
              {rotatingPhoto ? <Icon name="spinner" size={16} className="animate-spin" /> : <Icon name="rotate" size={16} />}
            </button>
          )}
          {location.coverPhotoPath && (
            <button
              type="button"
              onClick={() => removeLocationCoverPhoto(location.id)}
              aria-label="Remove photo"
              className="tap-target flex size-9 items-center justify-center rounded-full bg-white/90 shadow-sm"
            >
              <Icon name="close" size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadingPhoto}
            aria-label={location.coverPhotoPath ? "Change photo" : "Add photo"}
            className="tap-target flex size-9 items-center justify-center rounded-full bg-white/90 shadow-sm disabled:opacity-60"
          >
            {uploadingPhoto ? <Icon name="spinner" size={16} className="animate-spin" /> : <Icon name="camera" size={16} />}
          </button>
        </div>
      </div>

      <div>
        <h1 className="text-screen-title font-medium text-ink">{location.name}</h1>
        {location.description && <p className="text-caption text-muted-foreground">{location.description}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link
          href={`/capture?locationId=${location.id}`}
          className="tap-target flex items-center justify-center gap-2 rounded-2xl bg-yellow py-3 text-body font-medium text-white shadow-lg"
        >
          <Icon name="camera" size={16} /> Add items
        </Link>
        <Link
          href={`/add?locationId=${location.id}`}
          className="tap-target flex items-center justify-center gap-2 rounded-2xl border border-border bg-white py-3 text-body font-medium text-ink shadow-sm"
        >
          <Icon name="edit" size={16} /> Add manually
        </Link>
      </div>

      <Button variant="secondary" size="lg" onClick={() => { bumpAddContainerKey(); setAddContainerOpen(true); }}>
        <Icon name="plus" size={16} /> Add Container
      </Button>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-section-title font-medium text-ink">Containers</h2>
          {childContainers.length > 0 && <ViewToggle mode={view} onChange={setView} />}
        </div>
        {childContainers.length === 0 ? (
          <EmptyState icon="archive" title="No containers yet" description="Group items into a bin, box, shelf, or nightstand." />
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {childContainers.map((c) => {
              const count = activeItemCountForContainer(items, containers, c.id);
              return (
                <EntityCard
                  key={c.id}
                  href={`/containers/${c.id}`}
                  emoji={c.coverPhotoEmoji ?? "📦"}
                  coverPhotoPath={c.coverPhotoPath}
                  title={c.name}
                  subtitle={`${count} item${count === 1 ? "" : "s"}`}
                  badge={c.displayCode ?? undefined}
                  badgeKey={c.id}
                />
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {childContainers.map((c) => {
              const count = activeItemCountForContainer(items, containers, c.id);
              return (
                <EntityRow
                  key={c.id}
                  href={`/containers/${c.id}`}
                  icon="archive"
                  emoji={c.coverPhotoEmoji ?? "📦"}
                  coverPhotoPath={c.coverPhotoPath}
                  title={c.name}
                  subtitle={`${count} item${count === 1 ? "" : "s"}${c.displayCode ? ` · ${c.displayCode}` : ""}`}
                />
              );
            })}
          </div>
        )}
      </section>

      {directItems.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium text-ink">Items directly here</h2>
          {view === "grid" ? (
            <div className="grid grid-cols-2 gap-3">
              {directItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  breadcrumbLabel={breadcrumbLabel(buildBreadcrumb(item.locationId, item.containerId, locations, containers))}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {directItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  breadcrumbLabel={breadcrumbLabel(buildBreadcrumb(item.locationId, item.containerId, locations, containers))}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <EntityFormSheet
        key={addContainerKey}
        open={addContainerOpen}
        onOpenChange={setAddContainerOpen}
        title="Add Container"
        namePlaceholder="e.g. Toolbox"
        onSubmit={async ({ name, description, photoFile }) => {
          const c = createContainer({ name, description, locationId: location.id });
          if (photoFile) {
            const result = await setContainerCoverPhoto(c.id, photoFile);
            if (!result.ok) toast.error(result.error ?? "Container saved, but the photo couldn't be uploaded.");
          }
          toast.success(`Added ${c.name}`);
        }}
      />

      <EntityFormSheet
        // Always mounted (open is just a prop here) — key on the record so
        // a rename-then-reopen-edit within the same page session reseeds
        // instead of showing the pre-rename values from first mount.
        key={location.id}
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit Location"
        namePlaceholder="e.g. Garage"
        initialName={location.name}
        initialDescription={location.description ?? ""}
        initialCoverPhotoPath={location.coverPhotoPath}
        initialCoverPhotoEmoji={location.coverPhotoEmoji ?? "📦"}
        onSubmit={async ({ name, description, photoFile }) => {
          updateLocation(location.id, { name, description });
          if (photoFile) {
            const result = await setLocationCoverPhoto(location.id, photoFile);
            if (!result.ok) toast.error(result.error ?? "Location updated, but the photo couldn't be uploaded.");
          }
          toast.success("Location updated");
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tone="default"
        icon="trash"
        title={`Move "${location.name}" to Trash?`}
        description="Its containers and items move to Trash together and are recoverable for 30 days."
        confirmLabel="Move to Trash"
        onConfirm={() => {
          trashLocation(location.id);
          toast("Moved to Trash", { description: "Recoverable for 30 days." });
          router.push("/locations");
        }}
      />
    </div>
  );
}
