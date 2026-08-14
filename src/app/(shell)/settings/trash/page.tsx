"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon, type IconName } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SearchBar } from "@/components/search-bar";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { daysUntil } from "@/lib/selectors";
import { cn } from "@/lib/utils";

type EntityType = "item" | "container" | "location";

interface TrashRow {
  type: EntityType;
  id: string;
  name: string;
  emoji: string;
  trashedAt: string;
  purgeAfter: string;
}

const TYPE_LABEL: Record<EntityType, string> = { item: "Item", container: "Container", location: "Location" };
const TYPE_ICON: Record<EntityType, IconName> = { item: "tag", container: "archive", location: "box" };

function rowKey(row: Pick<TrashRow, "type" | "id">): string {
  return `${row.type}-${row.id}`;
}

export default function TrashPage() {
  const items = useInventoryStore((s) => s.items);
  const containers = useInventoryStore((s) => s.containers);
  const locations = useInventoryStore((s) => s.locations);
  const restoreItem = useInventoryStore((s) => s.restoreItem);
  const permanentlyDeleteItem = useInventoryStore((s) => s.permanentlyDeleteItem);
  const restoreContainer = useInventoryStore((s) => s.restoreContainer);
  const permanentlyDeleteContainer = useInventoryStore((s) => s.permanentlyDeleteContainer);
  const restoreLocation = useInventoryStore((s) => s.restoreLocation);
  const permanentlyDeleteLocation = useInventoryStore((s) => s.permanentlyDeleteLocation);

  const [filter, setFilter] = useState<EntityType | "all">("all");
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<TrashRow | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const rows: TrashRow[] = [
    ...items
      .filter((it) => it.status === "trashed")
      .map((it) => ({ type: "item" as const, id: it.id, name: it.name, emoji: it.photoEmoji, trashedAt: it.trashedAt!, purgeAfter: it.permanentlyDeleteAfter! })),
    ...containers
      .filter((c) => c.status === "trashed")
      .map((c) => ({ type: "container" as const, id: c.id, name: c.name, emoji: c.coverPhotoEmoji ?? "📦", trashedAt: c.trashedAt!, purgeAfter: c.permanentlyDeleteAfter! })),
    ...locations
      .filter((l) => l.status === "trashed")
      .map((l) => ({ type: "location" as const, id: l.id, name: l.name, emoji: l.coverPhotoEmoji ?? "📦", trashedAt: l.trashedAt!, purgeAfter: l.permanentlyDeleteAfter! })),
  ].sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));

  const typeFilteredRows = filter === "all" ? rows : rows.filter((r) => r.type === filter);
  const filteredRows = query.trim()
    ? typeFilteredRows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
    : typeFilteredRows;

  const selectedRows = filteredRows.filter((r) => selected.has(rowKey(r)));
  const allVisibleSelected = filteredRows.length > 0 && selectedRows.length === filteredRows.length;

  function restore(row: TrashRow) {
    if (row.type === "item") restoreItem(row.id);
    if (row.type === "container") restoreContainer(row.id);
    if (row.type === "location") restoreLocation(row.id);
    toast.success(`Restored ${row.name}`);
  }

  function deleteForever(row: TrashRow) {
    if (row.type === "item") permanentlyDeleteItem(row.id);
    if (row.type === "container") permanentlyDeleteContainer(row.id);
    if (row.type === "location") permanentlyDeleteLocation(row.id);
    toast.success(`Permanently deleted ${row.name}`);
  }

  function toggleSelected(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelected((s) => {
      if (allVisibleSelected) {
        const next = new Set(s);
        for (const r of filteredRows) next.delete(rowKey(r));
        return next;
      }
      return new Set([...s, ...filteredRows.map(rowKey)]);
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  function bulkRestore() {
    const count = selectedRows.length;
    for (const row of selectedRows) restore(row);
    toast.success(`Restored ${count} item${count === 1 ? "" : "s"}`);
    exitSelectMode();
  }

  function bulkDeleteForever() {
    const count = selectedRows.length;
    for (const row of selectedRows) deleteForever(row);
    toast.success(`Permanently deleted ${count} item${count === 1 ? "" : "s"}`);
    exitSelectMode();
  }

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Trash</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Restore items or remove them permanently.</p>
        </div>
        {rows.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}>
            {selectMode ? "Cancel" : "Select"}
          </Button>
        )}
      </div>

      {rows.length > 0 && <SearchBar value={query} onChange={setQuery} placeholder="Search items, containers, locations..." />}

      {rows.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(["all", "item", "container", "location"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilter(t)}
                className={cn(
                  "tap-target shrink-0 rounded-full border px-3 py-1.5 text-caption font-medium",
                  filter === t ? "border-ink bg-ink text-white" : "border-border bg-white text-ink"
                )}
              >
                {t === "all" ? "All" : `${TYPE_LABEL[t]}s`}
              </button>
            ))}
          </div>
          {selectMode && filteredRows.length > 0 && (
            <button type="button" onClick={toggleSelectAllVisible} className="shrink-0 text-caption font-medium text-ink underline underline-offset-2">
              {allVisibleSelected ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>
      )}

      {filteredRows.length === 0 ? (
        <EmptyState icon="trash" title="Trash is empty" description="Trashed items, containers, and locations show up here for 30 days before they're automatically deleted." />
      ) : (
        <div className="flex flex-col gap-2">
          {filteredRows.map((row) => {
            const key = rowKey(row);
            const isSelected = selected.has(key);
            return (
              <div
                key={key}
                role={selectMode ? "button" : undefined}
                tabIndex={selectMode ? 0 : undefined}
                onClick={selectMode ? () => toggleSelected(key) : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border bg-white p-3 shadow-sm",
                  isSelected ? "border-ink ring-1 ring-ink" : "border-border"
                )}
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(key)}
                    onClick={(e) => e.stopPropagation()}
                    className="size-4 shrink-0"
                    aria-label={`Select ${row.name}`}
                  />
                )}
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-brand-100 text-xl">{row.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-body text-ink">{row.name}</p>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-muted px-1.5 py-0.5 text-micro text-muted-foreground">
                      <Icon name={TYPE_ICON[row.type]} size={10} /> {TYPE_LABEL[row.type]}
                    </span>
                  </div>
                  <p className="text-caption text-muted-foreground">{daysUntil(row.purgeAfter)} days left</p>
                </div>
                {!selectMode && (
                  <>
                    <Button variant="secondary" size="icon-sm" aria-label="Restore" onClick={() => restore(row)} className="sm:hidden">
                      <Icon name="restore" size={14} />
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => restore(row)} className="hidden sm:inline-flex">
                      <Icon name="restore" size={14} /> Restore
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete forever" onClick={() => setPendingDelete(row)}>
                      <Icon name="trash" size={16} className="text-danger" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectMode && selected.size > 0 && (
        <div className="fixed inset-x-4 bottom-[calc(5.125rem+env(safe-area-inset-bottom))] z-40 flex items-center justify-between rounded-2xl bg-ink px-4 py-3 text-white shadow-lg md:bottom-4">
          {/* bottom-20 (80px) was tuned to clear the old floating pill nav,
              and wasn't safe-area-aware even then — bottom-nav.tsx is now a
              docked bar whose icon row is a fixed 70px (min-h-17.5)
              regardless of device, plus whatever the home indicator adds. */}
          <span className="text-body">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-white/30 bg-transparent text-white hover:bg-white/10" onClick={bulkRestore}>
              <Icon name="restore" size={14} /> Restore
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
              <Icon name="trash" size={14} /> Delete Forever
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        tone="danger"
        icon="danger"
        title="Delete forever?"
        description={`This permanently deletes "${pendingDelete?.name}" and its photo. This cannot be undone.`}
        confirmLabel="Delete Forever"
        onConfirm={() => {
          if (pendingDelete) deleteForever(pendingDelete);
        }}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        tone="danger"
        icon="danger"
        title={`Delete ${selected.size} item${selected.size === 1 ? "" : "s"} forever?`}
        description="This permanently deletes the selected items, containers, and/or locations (and their photos). This cannot be undone."
        confirmLabel="Delete Forever"
        onConfirm={bulkDeleteForever}
      />
    </div>
  );
}
