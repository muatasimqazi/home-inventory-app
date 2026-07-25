"use client";

import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { PhotoThumb } from "@/components/photo-thumb";
import { BreadcrumbTrail } from "@/components/breadcrumb-trail";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MoveSheet } from "@/components/move-sheet";
import { ActivityRow } from "@/components/activity-row";
import { ItemAttachments } from "@/components/item-attachments";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { buildBreadcrumb, daysUntil } from "@/lib/selectors";
import { extraFieldsForCategory } from "@/lib/category";

export default function ItemDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const items = useInventoryStore((s) => s.items);
  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);
  const activity = useInventoryStore((s) => s.activity);
  const members = useInventoryStore((s) => s.members);
  const isFavorite = useInventoryStore((s) => s.isFavorite);
  const toggleFavorite = useInventoryStore((s) => s.toggleFavorite);
  const archiveItem = useInventoryStore((s) => s.archiveItem);
  const unarchiveItem = useInventoryStore((s) => s.unarchiveItem);
  const trashItem = useInventoryStore((s) => s.trashItem);
  const restoreItem = useInventoryStore((s) => s.restoreItem);
  const permanentlyDeleteItem = useInventoryStore((s) => s.permanentlyDeleteItem);
  const moveItem = useInventoryStore((s) => s.moveItem);

  const [moveOpen, setMoveOpen] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const item = items.find((it) => it.id === params.id);
  if (!item) return notFound();

  const breadcrumb = buildBreadcrumb(item.locationId, item.containerId, locations, containers);
  const itemActivity = activity.filter((a) => a.entityId === item.id);
  const favorite = isFavorite(item.id);

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm">
          <Icon name="arrowLeft" size={18} />
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleFavorite(item.id)}
            aria-pressed={favorite}
            aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
            className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm"
          >
            <Icon name="heart" size={18} className={favorite ? "fill-danger text-danger" : "text-ink"} />
          </button>
          {item.status === "active" && (
            <Link href={`/items/${item.id}/edit`} className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm">
              <Icon name="edit" size={18} />
            </Link>
          )}
        </div>
      </div>

      {item.status !== "active" && (
        <div className={item.status === "trashed" ? "rounded-lg bg-danger/10 px-3 py-2 text-caption text-danger" : "rounded-lg bg-surface-muted px-3 py-2 text-caption text-muted-foreground"}>
          {item.status === "archived"
            ? "This item is archived — hidden from default search and browsing."
            : `In Trash — ${item.permanentlyDeleteAfter ? daysUntil(item.permanentlyDeleteAfter) : 0} days until permanent deletion.`}
        </div>
      )}

      <PhotoThumb emoji={item.photoEmoji} label={item.category} className="h-56 w-full" emojiClassName="text-6xl" />

      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-screen-title font-medium text-ink">{item.name}</h1>
          {item.needsReview && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-ink px-2 py-1 text-micro font-medium text-white">
              <Icon name="needsReview" size={12} /> Needs review
            </span>
          )}
        </div>
        <BreadcrumbTrail segments={breadcrumb} />
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-white p-4 shadow-sm">
        <Field label="Category" value={item.category} />
        <Field label="Quantity" value={String(item.quantity)} />
        {item.tagIds.length > 0 && (
          <div className="col-span-2">
            <dt className="text-caption text-muted-foreground">Tags</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              <TagList itemId={item.id} />
            </dd>
          </div>
        )}
        {extraFieldsForCategory(item.category).map((field) =>
          item.extraDetails[field.key] ? (
            <Field key={field.key} label={field.label} value={item.extraDetails[field.key]} />
          ) : null
        )}
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

      {item.status === "active" && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={() => setMoveOpen(true)}>
            <Icon name="move" size={16} /> Move
          </Button>
          <Button variant="outline" size="lg" onClick={() => archiveItem(item.id)}>
            <Icon name="archive" size={16} /> Archive
          </Button>
          <Button variant="outline" size="lg" className="col-span-2 text-danger hover:text-danger" onClick={() => setTrashConfirmOpen(true)}>
            <Icon name="trash" size={16} /> Move to Trash
          </Button>
        </div>
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

      <ItemAttachments itemId={item.id} />

      {itemActivity.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl bg-white p-4 shadow-sm">
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
          router.push("/settings/trash");
        }}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-body text-ink">{value}</dd>
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
