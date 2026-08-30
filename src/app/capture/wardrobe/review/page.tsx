"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { PhotoThumb } from "@/components/photo-thumb";
import { BreadcrumbTrail } from "@/components/breadcrumb-trail";
import { MoveSheet } from "@/components/move-sheet";
import { WardrobeStudioSheet } from "@/components/wardrobe-studio-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWardrobeCapture } from "@/lib/wardrobe-capture-store";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { useInventoryStore, uploadCoverPhotoFile } from "@/lib/store";
import { stopCameraStream } from "@/lib/camera-stream";
import { dataUrlToFile } from "@/lib/crop-image";
import { buildBreadcrumb } from "@/lib/selectors";
import { REVIEW_THRESHOLD } from "@/lib/ai";
import { SORTED_CATEGORIES } from "@/lib/types";
import type { Item } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Review/confirm/save step for the wardrobe capture flow (docs/Wardrobe
 * Inventory.md) — the wardrobe-specific counterpart to /capture/
 * appliance/review, reading from useWardrobeCapture instead of
 * useApplianceCapture. Saves a real Item via the same createItem() every
 * other capture flow uses, then opens WardrobeStudioSheet right away —
 * the capture flow's natural continuation, not a second confirm step.
 */
export default function WardrobeReviewPage() {
  const router = useRouter();
  const keyboardInset = useKeyboardInset();
  const photo = useWardrobeCapture((s) => s.photo);
  const detection = useWardrobeCapture((s) => s.detection);
  const detecting = useWardrobeCapture((s) => s.detecting);
  const fields = useWardrobeCapture((s) => s.fields);
  const photoEmoji = useWardrobeCapture((s) => s.photoEmoji);
  const destination = useWardrobeCapture((s) => s.destination);
  const updateFields = useWardrobeCapture((s) => s.updateFields);
  const setDestination = useWardrobeCapture((s) => s.setDestination);

  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const createItem = useInventoryStore((s) => s.createItem);

  const [moveOpen, setMoveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedItem, setSavedItem] = useState<Item | null>(null);

  useEffect(() => {
    if (!detecting && !fields && !photo) {
      router.replace("/capture/wardrobe");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detecting, fields, photo]);

  if (detecting || !fields || !detection) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-card">
        <Icon name="spinner" size={28} className="animate-spin text-ink" />
        <p className="text-body text-muted-foreground">Cataloging item…</p>
      </div>
    );
  }

  const breadcrumb = buildBreadcrumb(destination?.locationId ?? null, destination?.containerId ?? null, locations, containers);
  const missingDestination = !destination?.locationId;
  const edited = fields.name.trim() !== detection.suggestedName;
  const lowConfidence = detection.confidence < REVIEW_THRESHOLD;
  const blocked = lowConfidence && !fields.confirmed && !edited && fields.name.trim() !== "";
  const nameEmpty = fields.name.trim() === "";
  const canSave = !nameEmpty && !blocked && !missingDestination && !saving;

  async function handleSave() {
    if (!canSave || !fields || !detection) return;
    setSaving(true);
    stopCameraStream();
    const extraDetails: Record<string, string> = {};
    if (fields.color.trim()) extraDetails.color = fields.color.trim();

    // Uploaded *before* createItem, not after — same sequencing every
    // other capture flow follows (see NewItemInput.coverPhotoPath's doc
    // comment in lib/store.ts).
    let coverPhotoPath: string | null = null;
    if (photo && currentHouseholdId) {
      const file = await dataUrlToFile(photo);
      const uploaded = await uploadCoverPhotoFile(file, currentHouseholdId);
      if (uploaded.ok) coverPhotoPath = uploaded.path;
      else toast.error(uploaded.error ?? "Item saved, but the photo couldn't be uploaded.");
    }

    const item = createItem({
      name: fields.name.trim(),
      originalDetectedName: detection.suggestedName || null,
      category: fields.category,
      quantity: 1,
      photoEmoji,
      coverPhotoPath,
      locationId: destination?.locationId ?? null,
      containerId: destination?.containerId ?? null,
      needsReview: lowConfidence && fields.name.trim() === detection.suggestedName,
      reviewReason: lowConfidence ? `Confidence ${detection.confidence.toFixed(2)} is below ${REVIEW_THRESHOLD}.` : undefined,
      extraDetails,
    });

    setSaving(false);
    if (coverPhotoPath) {
      // Studio-photo generation needs a real uploaded photo to work from
      // — skip straight to the item page when there isn't one (photo
      // upload failed above) rather than opening a sheet with nothing to
      // generate from.
      setSavedItem(item);
    } else {
      toast.success(`Saved ${item.name}`);
      router.replace(`/items/${item.id}`);
    }
  }

  return (
    <div className="min-h-dvh bg-surface-muted pb-28">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.replace("/capture/wardrobe")}
          className="tap-target flex size-9 items-center justify-center rounded-full hover:bg-surface-muted"
          aria-label="Back to camera"
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <h1 className="text-body font-medium text-ink">Review item</h1>
        <div className="size-9" />
      </header>

      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-4">
        <div className={cn("flex items-center justify-between rounded-xl bg-card px-4 py-3 shadow-sm", missingDestination && "ring-1 ring-danger")}>
          <div className="min-w-0">
            <p className="text-caption text-muted-foreground">Saving to</p>
            {missingDestination ? (
              <p className="text-body text-danger">Choose a location</p>
            ) : (
              <BreadcrumbTrail segments={breadcrumb} interactive={false} className="text-body text-ink" />
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => setMoveOpen(true)}>
            {missingDestination ? "Choose" : "Change"}
          </Button>
        </div>

        <div className="flex flex-col gap-4 rounded-xl bg-card p-4 shadow-sm">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="Wardrobe item" className="h-48 w-full rounded-lg bg-surface-muted object-contain" />
          ) : (
            <PhotoThumb emoji={photoEmoji} className="h-48 w-full" emojiClassName="text-8xl" />
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-caption text-muted-foreground">Name</label>
              {!edited && detection.suggestedName && <AiBadge />}
            </div>
            <Input
              value={fields.name}
              onChange={(e) => updateFields({ name: e.target.value })}
              placeholder={nameEmpty ? "Couldn't identify this — enter a name" : "Item name"}
              className={cn("h-11", !edited && detection.suggestedName && "border-yellow bg-yellow/5")}
            />
            {blocked && (
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-caption text-danger">Low-confidence reading — please confirm or edit before saving.</p>
                <button
                  type="button"
                  onClick={() => updateFields({ confirmed: true })}
                  className="shrink-0 text-caption font-semibold text-ink underline underline-offset-2"
                >
                  Confirm
                </button>
              </div>
            )}
            {lowConfidence && !blocked && (
              <p className="mt-1 text-caption text-muted-foreground">Confidence {detection.confidence.toFixed(2)} — worth a second look later.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Category</label>
            <Select value={fields.category} onValueChange={(v) => updateFields({ category: v })}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTED_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Color</label>
            <Input value={fields.color} onChange={(e) => updateFields({ color: e.target.value })} placeholder="e.g. Navy Blue" className="h-11" />
          </div>

          <p className="text-caption text-muted-foreground">Next, you&apos;ll be able to generate clean studio photos of this item for reselling or listing.</p>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card px-4 py-3" style={{ bottom: keyboardInset }}>
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          {missingDestination && (
            <p className="text-center text-caption text-danger">Choose a location above before saving — otherwise this can&apos;t be found later.</p>
          )}
          <Button size="lg" className="w-full" disabled={!canSave} onClick={handleSave}>
            {saving ? <Icon name="spinner" size={16} className="animate-spin" /> : "Save"}
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

      {savedItem && savedItem.coverPhotoPath && (
        <WardrobeStudioSheet
          open
          onOpenChange={(open) => {
            if (!open) router.replace(`/items/${savedItem.id}`);
          }}
          item={savedItem}
          sourcePhotoPath={savedItem.coverPhotoPath}
        />
      )}
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
