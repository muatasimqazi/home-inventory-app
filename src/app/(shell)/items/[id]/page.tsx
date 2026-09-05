"use client";

import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { BreadcrumbTrail } from "@/components/breadcrumb-trail";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MoveSheet } from "@/components/move-sheet";
import { ActivityRow } from "@/components/activity-row";
import { ItemAttachments } from "@/components/item-attachments";
import { ItemPhotoGallery } from "@/components/item-photo-gallery";
import { ItemStudioPhotosSection } from "@/components/item-studio-photos-section";
import { ItemOwnershipSection } from "@/components/item-ownership-section";
import { ItemPurchaseSection } from "@/components/item-purchase-section";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { buildBreadcrumb, daysUntil } from "@/lib/selectors";
import { extraFieldsForCategory } from "@/lib/category";
import { relativeTime, formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function ItemDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const items = useInventoryStore((s) => s.items);
  const itemStudioPhotos = useInventoryStore((s) => s.itemStudioPhotos);
  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);
  const activity = useInventoryStore((s) => s.activity);
  const members = useInventoryStore((s) => s.members);
  // Selecting the isFavorite() action itself (a stable function reference)
  // wouldn't re-render this component when favorites change elsewhere —
  // e.g. another tab or a Realtime event — since Zustand only re-renders on
  // a change to the selected *value*, not on a call to a selected function.
  // Selecting the reactive fields it's derived from instead fixes that.
  const favorites = useInventoryStore((s) => s.favorites);
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const toggleFavorite = useInventoryStore((s) => s.toggleFavorite);
  const archiveItem = useInventoryStore((s) => s.archiveItem);
  const unarchiveItem = useInventoryStore((s) => s.unarchiveItem);
  const trashItem = useInventoryStore((s) => s.trashItem);
  const restoreItem = useInventoryStore((s) => s.restoreItem);
  const permanentlyDeleteItem = useInventoryStore((s) => s.permanentlyDeleteItem);
  const moveItem = useInventoryStore((s) => s.moveItem);
  const updateItem = useInventoryStore((s) => s.updateItem);

  const [moveOpen, setMoveOpen] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // permanentlyDeleteItem() removes the item from `items` optimistically,
  // before router.push away from this page has finished — without this,
  // that re-render would call notFound() (item genuinely missing) instead
  // of just rendering nothing while the navigation is already in flight.
  // Only a *never-seen* id (a bad URL) should actually 404. Adjusting
  // state directly during render (conditioned so it only fires once) is
  // React's own sanctioned pattern for this — a ref can't be read/written
  // during render.
  const [everHadItem, setEverHadItem] = useState(false);
  const item = items.find((it) => it.id === params.id);
  if (item && !everHadItem) {
    setEverHadItem(true);
  }
  if (!item) {
    if (!everHadItem) return notFound();
    return null;
  }

  const breadcrumb = buildBreadcrumb(item.locationId, item.containerId, locations, containers);
  const itemActivity = activity.filter((a) => a.entityId === item.id);
  const favorite = favorites.some((f) => f.itemId === item.id && f.userId === currentUserId);
  const extraFields = extraFieldsForCategory(item.category).filter((f) => item.extraDetails[f.key]);

  return (
    <div className="flex flex-col gap-5 pb-6">
      <button onClick={() => router.back()} className="tap-target flex size-9 items-center justify-center rounded-full bg-card shadow-sm">
        <Icon name="arrowLeft" size={18} />
      </button>

      {item.status !== "active" && (
        <div className={item.status === "trashed" ? "rounded-lg bg-danger/10 px-3 py-2 text-caption text-danger" : "rounded-lg bg-surface-muted px-3 py-2 text-caption text-muted-foreground"}>
          {item.status === "archived"
            ? "This item is archived — hidden from default search and browsing."
            : `In Trash — ${item.permanentlyDeleteAfter ? daysUntil(item.permanentlyDeleteAfter) : 0} days until permanent deletion.`}
        </div>
      )}

      <ItemPhotoGallery item={item} studioPhotos={itemStudioPhotos.filter((p) => p.itemId === item.id)} />

      {/* Right under the gallery, not down with the item's other detail
          cards — a caption for the photo above it (see this component's
          own doc comment), not a separate section of page content. */}
      {item.status === "active" && <ItemStudioPhotosSection item={item} />}

      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-screen-title font-semibold text-ink">{item.name}</h1>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1">
            {item.lowStockSince && (
              <span className="flex items-center gap-1.5 text-micro font-medium text-danger">
                <span className="size-1.5 rounded-full bg-danger" aria-hidden /> Running low
              </span>
            )}
            {item.needsReview && (
              <span className="flex items-center gap-1.5 text-micro font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-yellow" aria-hidden /> Needs review
              </span>
            )}
          </div>
        </div>
        <BreadcrumbTrail segments={breadcrumb} />
      </div>

      <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div>
          <dt className="text-caption text-muted-foreground">Quantity</dt>
          <dd className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateItem(item.id, { quantity: item.quantity - 1 })}
              disabled={item.status !== "active" || item.quantity <= 0}
              aria-label="Decrease quantity"
              className="tap-target flex size-7 items-center justify-center rounded-full border border-border text-ink disabled:opacity-40"
            >
              −
            </button>
            <span className="w-6 text-center text-body font-semibold text-ink">{item.quantity}</span>
            <button
              type="button"
              onClick={() => updateItem(item.id, { quantity: item.quantity + 1 })}
              disabled={item.status !== "active" || item.quantity >= 9999}
              aria-label="Increase quantity"
              className="tap-target flex size-7 items-center justify-center rounded-full border border-border text-ink disabled:opacity-40"
            >
              +
            </button>
          </dd>
          {item.minQuantity !== null && <p className="mt-1 text-micro text-muted-foreground">Minimum {item.minQuantity}</p>}
        </div>
        <Field label="Category" value={item.category} />
        {item.estimatedValue !== null && <Field label="Estimated value" value={formatCurrency(item.estimatedValue)} />}
        <ItemOwnershipSection itemId={item.id} />
        {item.description && (
          <div className="col-span-2">
            <dt className="text-caption text-muted-foreground">Description</dt>
            <dd className="mt-1 text-body text-ink">{item.description}</dd>
          </div>
        )}
        {item.tagIds.length > 0 && (
          <div className="col-span-2">
            <dt className="text-caption text-muted-foreground">Tags</dt>
            <dd className="mt-1.5 flex flex-wrap gap-1.5">
              <TagList itemId={item.id} />
            </dd>
          </div>
        )}
        <Field label="Updated" value={relativeTime(item.updatedAt)} />
        {item.notes && (
          <div className="col-span-2">
            <dt className="text-caption text-muted-foreground">Notes</dt>
            <dd className="mt-1 text-body text-ink">{item.notes}</dd>
          </div>
        )}
        {item.originalDetectedName && item.originalDetectedName !== item.name && (
          <div className="col-span-2 border-t border-border pt-3">
            <dt className="text-caption text-muted-foreground">Originally detected as</dt>
            <dd className="mt-1 text-caption text-ink">{item.originalDetectedName}</dd>
          </div>
        )}
      </dl>

      {extraFields.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-body font-semibold text-ink">Extra details</h2>
            <span className="rounded-full bg-brand-100 px-2.5 py-1 text-micro font-medium text-yellow">{item.category}</span>
          </div>
          <dl className="flex flex-col gap-2.5">
            {extraFields.map((field) => (
              <div key={field.key} className="flex items-center justify-between text-caption">
                <dt className="text-muted-foreground">{field.label}</dt>
                <dd className="font-medium text-ink">{item.extraDetails[field.key]}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <ItemPurchaseSection itemId={item.id} />

      <ItemAttachments itemId={item.id} />

      {item.status === "active" && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="lg" onClick={() => setMoveOpen(true)}>
              <Icon name="move" size={16} /> Move
            </Button>
            <Link
              href={`/items/${item.id}/edit`}
              className="tap-target flex items-center justify-center gap-1.5 rounded-lg border border-border text-body font-medium text-ink"
            >
              <Icon name="edit" size={16} /> Edit
            </Link>
            <button
              type="button"
              onClick={() => toggleFavorite(item.id)}
              aria-pressed={favorite}
              className={cn(
                "tap-target flex items-center justify-center gap-1.5 rounded-lg text-body font-medium",
                favorite ? "bg-ink-fill text-white" : "border border-border text-ink"
              )}
            >
              <Icon name="heart" size={16} className={favorite ? "fill-white" : undefined} /> Favorite
            </button>
          </div>
          <div className="flex items-center justify-center gap-2 text-caption font-medium text-muted-foreground">
            <button
              type="button"
              onClick={() => archiveItem(item.id)}
              className="tap-target flex items-center gap-1.5 rounded-lg px-3 hover:bg-muted hover:text-ink"
            >
              <Icon name="archive" size={14} /> Archive
            </button>
            <button
              type="button"
              onClick={() => setTrashConfirmOpen(true)}
              className="tap-target flex items-center gap-1.5 rounded-lg px-3 hover:bg-danger/10 hover:text-danger"
            >
              <Icon name="trash" size={14} /> Move to Trash
            </button>
          </div>
        </>
      )}

      {item.status === "archived" && (
        <Button variant="secondary" size="lg" onClick={() => unarchiveItem(item.id)}>
          <Icon name="restore" size={16} /> Restore from Archive
        </Button>
      )}

      {item.status === "trashed" && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={() => restoreItem(item.id)}>
            <Icon name="restore" size={16} /> Restore
          </Button>
          <Button variant="destructive" size="lg" onClick={() => setDeleteConfirmOpen(true)}>
            <Icon name="trash" size={16} /> Delete Forever
          </Button>
        </div>
      )}

      {itemActivity.length > 0 && (
        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-section-title font-medium text-ink">Activity</h2>
          <div className="divide-y divide-border">
            {itemActivity.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} members={members} />
            ))}
          </div>
        </div>
      )}

      <MoveSheet
        open={moveOpen}
        onOpenChange={setMoveOpen}
        currentLocationId={item.locationId}
        currentContainerId={item.containerId}
        onMove={(dest) => {
          moveItem(item.id, dest);
          toast.success(`Moved ${item.name}`);
        }}
      />

      <ConfirmDialog
        open={trashConfirmOpen}
        onOpenChange={setTrashConfirmOpen}
        tone="default"
        icon="trash"
        title="Move to Trash?"
        description="This item will be recoverable from Trash for 30 days before it's automatically deleted."
        confirmLabel="Move to Trash"
        onConfirm={() => {
          trashItem(item.id);
          toast("Moved to Trash", { description: "Recoverable for 30 days." });
        }}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        tone="danger"
        icon="danger"
        title="Delete forever?"
        description="This permanently deletes the item and its photo. This cannot be undone."
        confirmLabel="Delete Forever"
        onConfirm={() => {
          permanentlyDeleteItem(item.id);
          toast.success("Item permanently deleted");
          router.push("/trash");
        }}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 text-body text-ink">{value}</dd>
    </div>
  );
}

function TagList({ itemId }: { itemId: string }) {
  const items = useInventoryStore((s) => s.items);
  const tags = useInventoryStore((s) => s.tags);
  const item = items.find((it) => it.id === itemId);
  if (!item) return null;
  return (
    <>
      {item.tagIds.map((tagId) => {
        const tag = tags.find((t) => t.id === tagId);
        if (!tag) return null;
        return (
          <Link key={tagId} href={`/tags/${tag.id}`} className="rounded-full bg-surface-muted px-2.5 py-1 text-caption text-ink">
            {tag.name}
          </Link>
        );
      })}
    </>
  );
}
