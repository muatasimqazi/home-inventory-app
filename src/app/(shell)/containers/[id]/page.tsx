"use client";

import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { EntityCard } from "@/components/entity-card";
import { EntityRow } from "@/components/entity-row";
import { ItemCard } from "@/components/item-card";
import { ItemRow } from "@/components/item-row";
import { PhotoThumb } from "@/components/photo-thumb";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { EmptyState } from "@/components/empty-state";
import { BreadcrumbTrail } from "@/components/breadcrumb-trail";
import { EntityFormSheet } from "@/components/entity-form-sheet";
import { MoveSheet } from "@/components/move-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DisplayCodeSheet } from "@/components/display-code-sheet";
import { LoadMoreButton } from "@/components/load-more-button";
import { Button } from "@/components/ui/button";
import { useRemountKey } from "@/hooks/use-remount-key";
import { containerNamingProvider } from "@/lib/ai";
import { usePaginated } from "@/hooks/use-paginated";
import { useInventoryStore } from "@/lib/store";
import { coverPhotoUrl } from "@/lib/cover-photo";
import { rotateStoredPhoto } from "@/lib/crop-image";
import { displayCodeBadgeClasses } from "@/lib/badge-color";
import { cn } from "@/lib/utils";
import { activeItemCountForContainer, buildBreadcrumb, breadcrumbLabel, collectDescendantIds, directChildContainers } from "@/lib/selectors";

export default function ContainerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);
  const items = useInventoryStore((s) => s.items);
  const createContainer = useInventoryStore((s) => s.createContainer);
  const updateContainer = useInventoryStore((s) => s.updateContainer);
  const moveContainer = useInventoryStore((s) => s.moveContainer);
  const trashContainer = useInventoryStore((s) => s.trashContainer);
  const trashItem = useInventoryStore((s) => s.trashItem);
  const moveItem = useInventoryStore((s) => s.moveItem);
  const setContainerCoverPhoto = useInventoryStore((s) => s.setContainerCoverPhoto);
  const removeContainerCoverPhoto = useInventoryStore((s) => s.removeContainerCoverPhoto);

  const [addSubOpen, setAddSubOpen] = useState(false);
  const [addSubKey, bumpAddSubKey] = useRemountKey();
  const [editOpen, setEditOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [displayCodeOpen, setDisplayCodeOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("grid");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [rotatingPhoto, setRotatingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [itemSelectMode, setItemSelectMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [bulkTrashOpen, setBulkTrashOpen] = useState(false);
  // Distinct from `moveOpen` above (that one moves this container itself)
  // — this one bulk-moves whichever items are currently selected.
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);

  const container = containers.find((c) => c.id === params.id);
  // Same double check itemsIn() itself enforces (containerId AND
  // locationId, not containerId alone) — computed inline here rather than
  // via that selector so it can run, and the pagination hook below can be
  // called, ahead of the `if (!container)` early return (hooks can't come
  // after a conditional return). `container` is already looked up above,
  // so this costs nothing extra; when it's undefined (not-found path),
  // `container?.locationId` is undefined and no item ever matches it,
  // same harmless empty result as before. Keeping both fields matters as
  // real defense-in-depth, not redundancy: every item's locationId is
  // *supposed* to stay in sync with its container's location, but this
  // page shouldn't silently trust that invariant any less than itemsIn()
  // itself does for the exact same query shape elsewhere in the app.
  const directItems = items.filter((it) => it.status === "active" && it.containerId === params.id && it.locationId === container?.locationId);
  const { visible: paginatedDirectItems, hasMore, remaining, pageSize, loadMore } = usePaginated(directItems, params.id);

  if (!container) return notFound();

  const breadcrumb = buildBreadcrumb(container.locationId, container.id, locations, containers);
  const subContainers = directChildContainers(containers, container.id, container.locationId);
  const isEmpty = subContainers.length === 0 && directItems.length === 0;

  async function handlePhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !container) return;
    setUploadingPhoto(true);
    const result = await setContainerCoverPhoto(container.id, file);
    setUploadingPhoto(false);
    if (!result.ok) {
      toast.error(result.error ?? "Couldn't set photo.");
      return;
    }
    toast.success("Photo updated");
  }

  async function handleRotatePhoto() {
    if (!container || !container.coverPhotoPath) return;
    setRotatingPhoto(true);
    try {
      const rotated = await rotateStoredPhoto(coverPhotoUrl(container.coverPhotoPath), 90);
      const result = await setContainerCoverPhoto(container.id, rotated);
      if (!result.ok) toast.error(result.error ?? "Couldn't rotate photo.");
    } catch {
      toast.error("Couldn't rotate photo.");
    } finally {
      setRotatingPhoto(false);
    }
  }

  function toggleItemSelected(itemId: string) {
    setSelectedItemIds((s) => {
      const next = new Set(s);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function exitItemSelectMode() {
    setItemSelectMode(false);
    setSelectedItemIds(new Set());
  }

  function bulkTrashItems() {
    const count = selectedItemIds.size;
    selectedItemIds.forEach((id) => trashItem(id));
    toast(`Moved ${count} item${count === 1 ? "" : "s"} to Trash`, { description: "Recoverable for 30 days." });
    exitItemSelectMode();
  }

  function bulkMoveItems(dest: { locationId: string | null; containerId: string | null }) {
    const count = selectedItemIds.size;
    selectedItemIds.forEach((id) => moveItem(id, dest));
    toast.success(`Moved ${count} item${count === 1 ? "" : "s"}`);
    exitItemSelectMode();
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm">
          <Icon name="arrowLeft" size={18} />
        </button>
        <div className="flex items-center gap-2">
          <Link href={`/containers/${container.id}/label`} className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm">
            <Icon name="qrCode" size={18} />
          </Link>
          <button onClick={() => setEditOpen(true)} className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm">
            <Icon name="edit" size={18} />
          </button>
          <button onClick={() => setDeleteOpen(true)} className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm">
            <Icon name="trash" size={18} className="text-danger" />
          </button>
        </div>
      </div>

      <div className="relative">
        <PhotoThumb emoji={container.coverPhotoEmoji ?? "📦"} coverPhotoPath={container.coverPhotoPath} className="h-48 w-full" emojiClassName="text-8xl" fit="cover" />
        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChosen} />
        <div className="absolute bottom-2 right-2 flex gap-2">
          {container.coverPhotoPath && (
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
          {container.coverPhotoPath && (
            <button
              type="button"
              onClick={() => removeContainerCoverPhoto(container.id)}
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
            aria-label={container.coverPhotoPath ? "Change photo" : "Add photo"}
            className="tap-target flex size-9 items-center justify-center rounded-full bg-white/90 shadow-sm disabled:opacity-60"
          >
            {uploadingPhoto ? <Icon name="spinner" size={16} className="animate-spin" /> : <Icon name="camera" size={16} />}
          </button>
        </div>
      </div>

      <div>
        <h1 className="text-screen-title font-medium text-ink">{container.name}</h1>
        <BreadcrumbTrail segments={breadcrumb.slice(0, -1)} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDisplayCodeOpen(true)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-semibold",
              container.displayCode ? displayCodeBadgeClasses(container.id) : "border-border bg-surface-muted text-ink"
            )}
          >
            {container.displayCode ?? "Assign Container ID"}
            <Icon name="edit" size={12} className="opacity-60" />
          </button>
          <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <Icon name="tag" size={12} /> {container.tagToken}
          </span>
        </div>
      </div>

      <Link
        href={`/capture?locationId=${container.locationId}&containerId=${container.id}`}
        className="tap-target flex items-center justify-center gap-2 rounded-2xl bg-yellow py-3.5 text-body font-medium text-white shadow-lg"
      >
        <Icon name="camera" size={18} /> Add items here
      </Link>

      <Link
        href={`/add?locationId=${container.locationId}&containerId=${container.id}`}
        className="tap-target flex items-center justify-center gap-2 rounded-2xl border border-border bg-white py-3 text-body font-medium text-ink shadow-sm"
      >
        <Icon name="edit" size={16} /> Add manually
      </Link>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="lg" onClick={() => setMoveOpen(true)}>
          <Icon name="move" size={16} /> Move
        </Button>
        <Button variant="outline" size="lg" onClick={() => { bumpAddSubKey(); setAddSubOpen(true); }}>
          <Icon name="plus" size={16} /> Sub-container
        </Button>
      </div>

      {isEmpty ? (
        <EmptyState
          icon="camera"
          title="This container is empty"
          description="Use “Add items here” to scan, or “Add manually” to type items in one at a time — the destination is already set."
        />
      ) : (
        <>
          <div className="flex items-center justify-end">
            <ViewToggle mode={view} onChange={setView} />
          </div>

          {subContainers.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-section-title font-medium text-ink">Sub-containers</h2>
              {view === "grid" ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {subContainers.map((c) => {
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
                  {subContainers.map((c) => {
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
          )}

          {directItems.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-section-title font-medium text-ink">Items</h2>
                <Button variant="outline" size="sm" onClick={() => (itemSelectMode ? exitItemSelectMode() : setItemSelectMode(true))}>
                  {itemSelectMode ? "Cancel" : "Select"}
                </Button>
              </div>
              {view === "grid" ? (
                <div className="grid grid-cols-2 gap-3">
                  {paginatedDirectItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      breadcrumbLabel={breadcrumbLabel(buildBreadcrumb(item.locationId, item.containerId, locations, containers))}
                      selected={selectedItemIds.has(item.id)}
                      onToggleSelect={itemSelectMode ? () => toggleItemSelected(item.id) : undefined}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {paginatedDirectItems.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      breadcrumbLabel={breadcrumbLabel(buildBreadcrumb(item.locationId, item.containerId, locations, containers))}
                      selected={selectedItemIds.has(item.id)}
                      onToggleSelect={itemSelectMode ? () => toggleItemSelected(item.id) : undefined}
                    />
                  ))}
                </div>
              )}
              {hasMore && <LoadMoreButton remaining={remaining} pageSize={pageSize} onClick={loadMore} />}
            </section>
          )}
        </>
      )}

      {itemSelectMode && selectedItemIds.size > 0 && (
        <div className="fixed inset-x-4 bottom-[calc(5.125rem+env(safe-area-inset-bottom))] z-40 flex items-center justify-between rounded-2xl bg-ink px-4 py-3 text-white shadow-lg md:bottom-4">
          {/* bottom-20 (80px) was tuned to clear the old floating pill nav,
              and wasn't safe-area-aware even then — bottom-nav.tsx is now a
              docked bar whose icon row is a fixed 70px (min-h-17.5)
              regardless of device, plus whatever the home indicator adds. */}
          <span className="text-body">{selectedItemIds.size} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-white/30 bg-transparent text-white hover:bg-white/10" onClick={exitItemSelectMode}>
              Cancel
            </Button>
            <Button variant="outline" size="sm" className="border-white/30 bg-transparent text-white hover:bg-white/10" onClick={() => setBulkMoveOpen(true)}>
              <Icon name="move" size={14} /> Move
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setBulkTrashOpen(true)}>
              <Icon name="trash" size={14} /> Trash
            </Button>
          </div>
        </div>
      )}

      <EntityFormSheet
        key={addSubKey}
        open={addSubOpen}
        onOpenChange={setAddSubOpen}
        title="Add Sub-container"
        namePlaceholder="e.g. Drawer 2"
        onSubmit={async ({ name, description, photoFile }) => {
          const c = createContainer({ name, description, locationId: container.locationId, parentContainerId: container.id });
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
        key={container.id}
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit Container"
        namePlaceholder="e.g. Toolbox"
        initialName={container.name}
        initialDescription={container.description ?? ""}
        initialCoverPhotoPath={container.coverPhotoPath}
        initialCoverPhotoEmoji={container.coverPhotoEmoji ?? "📦"}
        // Suggests a name from what's actually inside this container right
        // now (directItems, already computed above for the list below).
        // Only passed at all when there's something to suggest from —
        // EntityFormSheet's own affordance is conditional on this prop
        // being present, and its handler already shows a generic error
        // toast on any throw, so this stays a plain pass-through rather
        // than duplicating that handling here.
        onSuggestName={
          directItems.length > 0 ? () => containerNamingProvider.suggestContainerName(directItems.map((it) => it.name)) : undefined
        }
        onSubmit={async ({ name, description, photoFile }) => {
          updateContainer(container.id, { name, description });
          if (photoFile) {
            const result = await setContainerCoverPhoto(container.id, photoFile);
            if (!result.ok) toast.error(result.error ?? "Container updated, but the photo couldn't be uploaded.");
          }
          toast.success("Container updated");
        }}
      />

      <MoveSheet
        open={moveOpen}
        onOpenChange={setMoveOpen}
        currentLocationId={container.locationId}
        currentContainerId={container.id}
        excludeContainerIds={[container.id, ...collectDescendantIds(containers, container.id)]}
        onMove={(dest) => {
          if (!dest.locationId) return;
          moveContainer(container.id, { locationId: dest.locationId, parentContainerId: dest.containerId });
          toast.success(`Moved ${container.name}`);
        }}
      />

      <MoveSheet
        open={bulkMoveOpen}
        onOpenChange={setBulkMoveOpen}
        currentLocationId={container.locationId}
        currentContainerId={container.id}
        onMove={bulkMoveItems}
      />

      <DisplayCodeSheet open={displayCodeOpen} onOpenChange={setDisplayCodeOpen} container={container} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tone="default"
        icon="trash"
        title={`Move "${container.name}" to Trash?`}
        description="Its sub-containers and items move to Trash together and are recoverable for 30 days."
        confirmLabel="Move to Trash"
        onConfirm={() => {
          trashContainer(container.id);
          toast("Moved to Trash", { description: "Recoverable for 30 days." });
          router.push(`/locations/${container.locationId}`);
        }}
      />

      <ConfirmDialog
        open={bulkTrashOpen}
        onOpenChange={setBulkTrashOpen}
        tone="default"
        icon="trash"
        title={`Move ${selectedItemIds.size} item${selectedItemIds.size === 1 ? "" : "s"} to Trash?`}
        description="Recoverable for 30 days."
        confirmLabel="Move to Trash"
        onConfirm={bulkTrashItems}
      />
    </div>
  );
}
