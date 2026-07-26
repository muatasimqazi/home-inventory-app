"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { EntityCard } from "@/components/entity-card";
import { ItemCard } from "@/components/item-card";
import { EmptyState } from "@/components/empty-state";
import { EntityFormSheet } from "@/components/entity-form-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { activeItemCountForContainer, buildBreadcrumb, breadcrumbLabel, directChildContainers, itemsIn } from "@/lib/selectors";

export default function LocationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);
  const items = useInventoryStore((s) => s.items);
  const createContainer = useInventoryStore((s) => s.createContainer);
  const updateLocation = useInventoryStore((s) => s.updateLocation);
  const trashLocation = useInventoryStore((s) => s.trashLocation);

  const [addContainerOpen, setAddContainerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const location = locations.find((l) => l.id === params.id);
  if (!location) return notFound();

  const childContainers = directChildContainers(containers, null, location.id);
  const directItems = itemsIn(items, location.id, null);

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

      <div>
        <div className="flex items-center gap-3">
          <span className="text-4xl" aria-hidden>
            {location.coverPhotoEmoji ?? "📦"}
          </span>
          <div>
            <h1 className="text-screen-title font-medium text-ink">{location.name}</h1>
            {location.description && <p className="text-caption text-muted-foreground">{location.description}</p>}
          </div>
        </div>
      </div>

      <Button variant="secondary" size="lg" onClick={() => setAddContainerOpen(true)}>
        <Icon name="plus" size={16} /> Add Container
      </Button>

      <section className="flex flex-col gap-3">
        <h2 className="text-section-title font-medium text-ink">Containers</h2>
        {childContainers.length === 0 ? (
          <EmptyState icon="archive" title="No containers yet" description="Group items into a bin, box, or shelf." />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {childContainers.map((c) => {
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
        )}
      </section>

      {directItems.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-section-title font-medium text-ink">Items directly here</h2>
          <div className="grid grid-cols-2 gap-3">
            {directItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                breadcrumbLabel={breadcrumbLabel(buildBreadcrumb(item.locationId, item.containerId, locations, containers))}
              />
            ))}
          </div>
        </section>
      )}

      <EntityFormSheet
        open={addContainerOpen}
        onOpenChange={setAddContainerOpen}
        title="Add Container"
        namePlaceholder="e.g. Toolbox"
        onSubmit={({ name, description }) => {
          const c = createContainer({ name, description, locationId: location.id });
          toast.success(`Added ${c.name}`);
        }}
      />

      <EntityFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit Location"
        namePlaceholder="e.g. Garage"
        initialName={location.name}
        initialDescription={location.description ?? ""}
        onSubmit={({ name, description }) => {
          updateLocation(location.id, { name, description });
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
