"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { PhotoThumb } from "@/components/photo-thumb";
import { BreadcrumbTrail } from "@/components/breadcrumb-trail";
import { MoveSheet } from "@/components/move-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCaptureSession, type DetectionRow } from "@/lib/capture-session-store";
import { useInventoryStore, type NewItemInput } from "@/lib/store";
import { buildBreadcrumb } from "@/lib/selectors";
import { CATEGORIES } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function CaptureReviewPage() {
  const router = useRouter();
  const photos = useCaptureSession((s) => s.photos);
  const destination = useCaptureSession((s) => s.destination);
  const detections = useCaptureSession((s) => s.detections);
  const detecting = useCaptureSession((s) => s.detecting);
  const updateDetection = useCaptureSession((s) => s.updateDetection);
  const toggleExcludeDetection = useCaptureSession((s) => s.toggleExcludeDetection);
  const setDestination = useCaptureSession((s) => s.setDestination);

  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);
  const createItem = useInventoryStore((s) => s.createItem);
  const createItemsBatch = useInventoryStore((s) => s.createItemsBatch);
  const getOrCreateTag = useInventoryStore((s) => s.getOrCreateTag);
  const saveNormalizationRule = useInventoryStore((s) => s.saveNormalizationRule);

  const [moveOpen, setMoveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rememberFlags, setRememberFlags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!detecting && detections === null && photos.length === 0) {
      router.replace("/capture");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detecting, detections, photos.length]);

  if (detecting || detections === null) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-white">
        <Icon name="spinner" size={28} className="animate-spin text-ink" />
        <p className="text-body text-muted-foreground">Looking at what you captured…</p>
      </div>
    );
  }

  const breadcrumb = buildBreadcrumb(destination?.locationId ?? null, destination?.containerId ?? null, locations, containers);
  const included = detections.filter((d) => !d.excluded);
  const isBulk = detections.length > 1;

  function buildInput(row: DetectionRow): NewItemInput {
    return {
      name: row.name.trim(),
      originalDetectedName: row.suggestedName || null,
      category: row.category,
      quantity: row.quantity,
      photoEmoji: row.photoEmoji,
      locationId: destination?.locationId ?? null,
      containerId: destination?.containerId ?? null,
      needsReview: row.needsReview && row.name.trim() === "",
      reviewReason: row.reviewReason,
      tagIds: row.suggestedTags.map((t) => getOrCreateTag(t).id),
    };
  }

  function persistNormalizationRules(rows: DetectionRow[]) {
    for (const row of rows) {
      if (rememberFlags[row.rowId] && row.suggestedName && row.name.trim() && row.name.trim() !== row.suggestedName) {
        saveNormalizationRule(row.suggestedName, row.name.trim(), row.category);
      }
    }
  }

  async function handleSave() {
    if (included.length === 0) return;
    setSaving(true);
    if (included.length === 1) {
      const item = createItem(buildInput(included[0]));
      persistNormalizationRules(included);
      toast.success(`Saved ${item.name}`);
      router.push(`/items/${item.id}`);
    } else {
      createItemsBatch(included.map(buildInput));
      persistNormalizationRules(included);
      toast.success(`Saved ${included.length} items`);
      router.push(destination?.containerId ? `/containers/${destination.containerId}` : "/");
    }
    setSaving(false);
  }

  return (
    <div className="min-h-dvh bg-surface-muted pb-28">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => router.push("/capture")}
          className="tap-target flex size-9 items-center justify-center rounded-full hover:bg-surface-muted"
          aria-label="Back to camera"
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <h1 className="text-body font-medium text-ink">{isBulk ? "Review items" : "Review item"}</h1>
        <div className="size-9" />
      </header>

      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-4">
        <div className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm">
          <div className="min-w-0">
            <p className="text-caption text-muted-foreground">Saving to</p>
            <BreadcrumbTrail segments={breadcrumb} interactive={false} className="text-body text-ink" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setMoveOpen(true)}>
            Change
          </Button>
        </div>

        {isBulk ? (
          <div className="flex flex-col gap-2">
            {detections.map((row) => (
              <BulkRow
                key={row.rowId}
                row={row}
                remember={!!rememberFlags[row.rowId]}
                onRemember={(v) => setRememberFlags((f) => ({ ...f, [row.rowId]: v }))}
                onChange={(patch) => updateDetection(row.rowId, patch)}
                onToggleExclude={() => toggleExcludeDetection(row.rowId)}
              />
            ))}
          </div>
        ) : (
          <SingleReviewForm
            row={detections[0]}
            photo={photos[0]}
            remember={!!rememberFlags[detections[0].rowId]}
            onRemember={(v) => setRememberFlags((f) => ({ ...f, [detections[0].rowId]: v }))}
            onChange={(patch) => updateDetection(detections[0].rowId, patch)}
          />
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl gap-2">
          <Button variant="outline" size="lg" className="flex-1" onClick={() => router.push("/capture")}>
            Add another photo
          </Button>
          <Button size="lg" className="flex-1" disabled={included.length === 0 || saving} onClick={handleSave}>
            {saving ? <Icon name="spinner" size={16} className="animate-spin" /> : isBulk ? `Save All (${included.length})` : "Save"}
          </Button>
        </div>
      </div>

      <MoveSheet
        open={moveOpen}
        onOpenChange={setMoveOpen}
        currentLocationId={destination?.locationId ?? null}
        currentContainerId={destination?.containerId ?? null}
        onMove={setDestination}
      />
    </div>
  );
}

function AiBadge() {
  return (
    <span className="flex items-center gap-1 rounded-full bg-yellow/20 px-2 py-0.5 text-micro font-medium text-ink">
      <Icon name="ai" size={11} /> AI suggested
    </span>
  );
}

function SingleReviewForm({
  row,
  photo,
  remember,
  onRemember,
  onChange,
}: {
  row: DetectionRow;
  photo?: string;
  remember: boolean;
  onRemember: (v: boolean) => void;
  onChange: (patch: Partial<DetectionRow>) => void;
}) {
  const edited = row.name !== row.suggestedName;
  const blankLowConfidence = row.needsReview && row.suggestedName !== "" && row.name === row.suggestedName && row.confidence < 0.75;

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="Captured item" className="h-48 w-full rounded-lg object-cover" />
      ) : (
        <PhotoThumb emoji={row.photoEmoji} className="h-48 w-full" emojiClassName="text-8xl" />
      )}

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-caption text-muted-foreground">Name</label>
          {!edited && row.suggestedName && <AiBadge />}
        </div>
        <Input
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={blankLowConfidence ? "Couldn't identify this — enter a name" : "Item name"}
          className={cn("h-11", !edited && row.suggestedName && "border-yellow bg-yellow/5")}
        />
        {row.needsReview && row.reviewReason && <p className="mt-1 text-caption text-muted-foreground">{row.reviewReason}</p>}
        {edited && row.suggestedName && (
          <label className="mt-2 flex items-center gap-2 text-caption text-muted-foreground">
            <input type="checkbox" checked={remember} onChange={(e) => onRemember(e.target.checked)} className="size-4" />
            Remember this? Save “{row.suggestedName}” → “{row.name}” for next time.
          </label>
        )}
      </div>

      <div>
        <label className="mb-1 block text-caption text-muted-foreground">Category</label>
        <Select value={row.category} onValueChange={(v) => onChange({ category: v })}>
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
      </div>

      <div>
        <label className="mb-1 block text-caption text-muted-foreground">Quantity</label>
        <Input
          type="number"
          min={0}
          max={9999}
          value={row.quantity}
          onChange={(e) => onChange({ quantity: Math.max(0, Math.min(9999, Number(e.target.value) || 0)) })}
          className="h-11 w-28"
        />
      </div>

      {row.suggestedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {row.suggestedTags.map((t) => (
            <span key={t} className="rounded-full bg-surface-muted px-2.5 py-1 text-caption text-ink">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BulkRow({
  row,
  remember,
  onRemember,
  onChange,
  onToggleExclude,
}: {
  row: DetectionRow;
  remember: boolean;
  onRemember: (v: boolean) => void;
  onChange: (patch: Partial<DetectionRow>) => void;
  onToggleExclude: () => void;
}) {
  const edited = row.name !== row.suggestedName;

  return (
    <div className={cn("flex flex-col gap-2 rounded-xl bg-white p-3 shadow-sm", row.excluded && "opacity-40")}>
      <div className="flex items-start gap-3">
        <PhotoThumb emoji={row.photoEmoji} className="size-14 shrink-0" emojiClassName="text-3xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={row.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="Item name"
              disabled={row.excluded}
              className={cn("h-9", !edited && row.suggestedName && !row.excluded && "border-yellow bg-yellow/5")}
            />
            {row.needsReview && <Icon name="needsReview" size={16} className="shrink-0 text-ink" />}
          </div>
          <div className="flex gap-2">
            <Select value={row.category} onValueChange={(v) => onChange({ category: v })} disabled={row.excluded}>
              <SelectTrigger className="h-8 flex-1 text-caption">
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
            <Input
              type="number"
              min={0}
              max={9999}
              value={row.quantity}
              disabled={row.excluded}
              onChange={(e) => onChange({ quantity: Math.max(0, Math.min(9999, Number(e.target.value) || 0)) })}
              className="h-8 w-16 text-caption"
              aria-label="Quantity"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleExclude}
          aria-label={row.excluded ? "Include item" : "Remove item"}
          className="tap-target flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-surface-muted"
        >
          <Icon name={row.excluded ? "restore" : "close"} size={16} />
        </button>
      </div>
      {edited && row.suggestedName && !row.excluded && (
        <label className="flex items-center gap-2 pl-[68px] text-caption text-muted-foreground">
          <input type="checkbox" checked={remember} onChange={(e) => onRemember(e.target.checked)} className="size-4" />
          Remember “{row.suggestedName}” → “{row.name}”?
        </label>
      )}
    </div>
  );
}
