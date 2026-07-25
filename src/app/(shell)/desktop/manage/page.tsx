"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { MoveSheet } from "@/components/move-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInventoryStore } from "@/lib/store";
import { activeLocations, directChildContainers, itemsIn } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import type { Container } from "@/lib/types";

type Node = { type: "location"; id: string } | { type: "container"; id: string };

export default function DesktopManagementPage() {
  const locations = activeLocations(useInventoryStore((s) => s.locations));
  const containers = useInventoryStore((s) => s.containers);
  const items = useInventoryStore((s) => s.items);
  const moveItem = useInventoryStore((s) => s.moveItem);
  const archiveItem = useInventoryStore((s) => s.archiveItem);
  const trashItem = useInventoryStore((s) => s.trashItem);

  const [selectedNode, setSelectedNode] = useState<Node | null>(locations[0] ? { type: "location", id: locations[0].id } : null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);

  const locationId = selectedNode?.type === "location" ? selectedNode.id : containers.find((c) => c.id === selectedNode?.id)?.locationId ?? null;
  const containerId = selectedNode?.type === "container" ? selectedNode.id : null;
  const rows = locationId ? itemsIn(items, containerId ? null : locationId, containerId) : [];

  function toggleItem(itemId: string) {
    setSelectedItems((s) => {
      const next = new Set(s);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function bulkArchive() {
    selectedItems.forEach((id) => archiveItem(id));
    toast.success(`Archived ${selectedItems.size} item${selectedItems.size === 1 ? "" : "s"}`);
    setSelectedItems(new Set());
  }

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-4">
      <h1 className="text-desktop-title font-medium text-ink">Manage</h1>

      <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr] gap-4">
        <div className="overflow-y-auto rounded-xl bg-white p-3 shadow-sm">
          {locations.map((loc) => (
            <LocationBranch
              key={loc.id}
              locationId={loc.id}
              locationName={loc.name}
              emoji={loc.coverPhotoEmoji ?? "📦"}
              containers={containers}
              selectedNode={selectedNode}
              onSelect={setSelectedNode}
            />
          ))}
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl bg-white p-4 shadow-sm">
          {rows.length === 0 ? (
            <EmptyState icon="box" title="Nothing here yet" description="Select a Location or Container on the left, or add items via capture." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <input type="checkbox" checked={selectedItems.has(item.id)} onChange={() => toggleItem(item.id)} className="size-4" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span aria-hidden>{item.photoEmoji}</span>
                        {item.name}
                        {item.needsReview && <Icon name="needsReview" size={14} className="text-ink" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.category}</TableCell>
                    <TableCell className="text-muted-foreground">{item.quantity}</TableCell>
                    <TableCell>
                      <Link href={`/items/${item.id}`} className="text-caption font-medium text-ink hover:underline">
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {selectedItems.size > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-ink px-4 py-3 text-white shadow-lg">
          <span className="text-body">{selectedItems.size} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-white/30 bg-transparent text-white hover:bg-white/10" onClick={() => setSelectedItems(new Set())}>
              Clear
            </Button>
            <Button variant="outline" size="sm" className="border-white/30 bg-transparent text-white hover:bg-white/10" onClick={() => setMoveOpen(true)}>
              <Icon name="move" size={14} /> Move
            </Button>
            <Button variant="outline" size="sm" className="border-white/30 bg-transparent text-white hover:bg-white/10" onClick={bulkArchive}>
              <Icon name="archive" size={14} /> Archive
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setTrashConfirmOpen(true)}>
              <Icon name="trash" size={14} /> Trash
            </Button>
          </div>
        </div>
      )}

      <MoveSheet
        open={moveOpen}
        onOpenChange={setMoveOpen}
        currentLocationId={locationId}
        currentContainerId={containerId}
        onMove={(dest) => {
          selectedItems.forEach((id) => moveItem(id, dest));
          toast.success(`Moved ${selectedItems.size} item${selectedItems.size === 1 ? "" : "s"}`);
          setSelectedItems(new Set());
        }}
      />

      <ConfirmDialog
        open={trashConfirmOpen}
        onOpenChange={setTrashConfirmOpen}
        tone="default"
        icon="trash"
        title={`Move ${selectedItems.size} item${selectedItems.size === 1 ? "" : "s"} to Trash?`}
        description="Recoverable for 30 days."
        confirmLabel="Move to Trash"
        onConfirm={() => {
          selectedItems.forEach((id) => trashItem(id));
          toast("Moved to Trash");
          setSelectedItems(new Set());
        }}
      />
    </div>
  );
}

function LocationBranch({
  locationId,
  locationName,
  emoji,
  containers,
  selectedNode,
  onSelect,
}: {
  locationId: string;
  locationName: string;
  emoji: string;
  containers: Container[];
  selectedNode: Node | null;
  onSelect: (node: Node) => void;
}) {
  const active = selectedNode?.type === "location" && selectedNode.id === locationId;
  return (
    <div>
      <TreeRow label={locationName} icon={emoji} active={active} depth={0} onClick={() => onSelect({ type: "location", id: locationId })} />
      <ContainerTree locationId={locationId} parentId={null} depth={1} containers={containers} selectedNode={selectedNode} onSelect={onSelect} />
    </div>
  );
}

function ContainerTree({
  locationId,
  parentId,
  depth,
  containers,
  selectedNode,
  onSelect,
}: {
  locationId: string;
  parentId: string | null;
  depth: number;
  containers: Container[];
  selectedNode: Node | null;
  onSelect: (node: Node) => void;
}) {
  const children = directChildContainers(containers, parentId, locationId);
  return (
    <>
      {children.map((c) => (
        <div key={c.id}>
          <TreeRow
            label={c.name}
            icon={c.coverPhotoEmoji ?? "📦"}
            active={selectedNode?.type === "container" && selectedNode.id === c.id}
            depth={depth}
            onClick={() => onSelect({ type: "container", id: c.id })}
          />
          <ContainerTree locationId={locationId} parentId={c.id} depth={depth + 1} containers={containers} selectedNode={selectedNode} onSelect={onSelect} />
        </div>
      ))}
    </>
  );
}

function TreeRow({ label, icon, active, depth, onClick }: { label: string; icon: string; active: boolean; depth: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: 8 + depth * 18 }}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-body",
        active ? "bg-ink text-white" : "text-ink hover:bg-surface-muted"
      )}
    >
      <span aria-hidden>{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
