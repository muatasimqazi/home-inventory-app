"use client";

import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { EntityCard } from "@/components/entity-card";
import { EntityRow } from "@/components/entity-row";
import { ItemCard } from "@/components/item-card";
import { ItemRow } from "@/components/item-row";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { EmptyState } from "@/components/empty-state";
import { BreadcrumbTrail } from "@/components/breadcrumb-trail";
import { EntityFormSheet } from "@/components/entity-form-sheet";
import { MoveSheet } from "@/components/move-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DisplayCodeSheet } from "@/components/display-code-sheet";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { binIdBadgeClasses } from "@/lib/badge-color";
import { cn } from "@/lib/utils";
import {
  activeItemCountForContainer,
  buildBreadcrumb,
  breadcrumbLabel,
  collectDescendantIds,
  directChildContainers,
  itemsIn,
} from "@/lib/selectors";

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

  const [addSubOpen, setAddSubOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [displayCodeOpen, setDisplayCodeOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("grid");

  const container = containers.find((c) => c.id === params.id);
  if (!container) return notFound();

  const breadcrumb = buildBreadcrumb(container.locationId, container.id, locations, containers);
  const subContainers = directChildContainers(containers, container.id, container.locationId);
  const directItems = itemsIn(items, container.locationId, container.id);
  const isEmpty = subContainers.length === 0 && directItems.length === 0;

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

      <div>
        <div className="flex items-center gap-3">
          <span className="text-4xl" aria-hidden>
            {container.coverPhotoEmoji ?? "📦"}
          </span>
          <div className="min-w-0">
            <h1 className="text-screen-title font-medium text-ink">{container.name}</h1>
            <BreadcrumbTrail segments={breadcrumb.slice(0, -1)} />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDisplayCodeOpen(true)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-semibold",
              container.displayCode ? binIdBadgeClasses(container.id) : "border-border bg-surface-muted text-ink"
            )}
          >
            {container.displayCode ?? "Assign Bin ID"}
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

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="lg" onClick={() => setMoveOpen(true)}>
          <Icon name="move" size={16} /> Move
        </Button>
        <Button variant="outline" size="lg" onClick={() => setAddSubOpen(true)}>
          <Icon name="plus" size={16} /> Sub-container
        </Button>
      </div>

      {isEmpty ? (
        <EmptyState
          icon="camera"
          title="This container is empty"
          description="Use “Add items here” above to start filling it — the destination is already set."
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
              <h2 className="text-section-title font-medium text-ink">Items</h2>
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
        </>
      )}

      <EntityFormSheet
        open={addSubOpen}
        onOpenChange={setAddSubOpen}
        title="Add Sub-container"
        namePlaceholder="e.g. Drawer 2"
        onSubmit={({ name, description }) => {
          const c = createContainer({ name, description, locationId: container.locationId, parentContainerId: container.id });
          toast.success(`Added ${c.name}`);
        }}
      />

      <EntityFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit Container"
        namePlaceholder="e.g. Toolbox"
        initialName={container.name}
        initialDescription={container.description ?? ""}
        onSubmit={({ name, description }) => {
          updateContainer(container.id, { name, description });
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
    </div>
  );
}
