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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBarcodeCapture } from "@/lib/barcode-capture-store";
import { useInventoryStore, uploadCoverPhotoFile } from "@/lib/store";
import { stopCameraStream } from "@/lib/camera-stream";
import { dataUrlToFile } from "@/lib/crop-image";
import { buildBreadcrumb } from "@/lib/selectors";
import { SORTED_CATEGORIES } from "@/lib/types";
import { cn } from "@/lib/utils";

// Review/confirm/save step for the barcode-scan capture flow — the
// barcode-specific counterpart to /capture/review and
// /capture/appliance/review, reading from useBarcodeCapture instead of
// useCaptureSession/useApplianceCapture. Saves a single item via the same
// createItem() the rest of the app uses.
//
// A barcode match is an exact database hit, not a probabilistic AI guess —
// but it's still a third-party service's word for what's in the user's
// hand, not the user's own, so the same "AI/lookup suggests, human confirms
// before saving" posture applies: an unconfirmed, unedited match blocks
// Save (needsCorrection-equivalent gate, matching capture/review/page.tsx's
// pattern) until the user either edits the name or explicitly hits
// Confirm. A barcode with no match in the lookup service instead falls
// back to a mostly-empty item form — no gate beyond a non-empty name — with
// the scanned code preserved in Notes so it isn't lost.

export default function BarcodeReviewPage() {
  const router = useRouter();
  const code = useBarcodeCapture((s) => s.code);
  const result = useBarcodeCapture((s) => s.result);
  const looking = useBarcodeCapture((s) => s.looking);
  const fields = useBarcodeCapture((s) => s.fields);
  const photoEmoji = useBarcodeCapture((s) => s.photoEmoji);
  const destination = useBarcodeCapture((s) => s.destination);
  const updateFields = useBarcodeCapture((s) => s.updateFields);
  const setDestination = useBarcodeCapture((s) => s.setDestination);

  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const createItem = useInventoryStore((s) => s.createItem);

  const [moveOpen, setMoveOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!looking && !fields && !code) {
      router.replace("/capture/barcode");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looking, fields, code]);

  if (looking || !fields || !result) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-white">
        <Icon name="spinner" size={28} className="animate-spin text-ink" />
        <p className="text-body text-muted-foreground">Looking up this barcode…</p>
      </div>
    );
  }

  const breadcrumb = buildBreadcrumb(destination?.locationId ?? null, destination?.containerId ?? null, locations, containers);
  const missingDestination = !destination?.locationId;
  const edited = fields.name.trim() !== result.suggestedName;
  const blocked = result.found && !fields.confirmed && !edited && fields.name.trim() !== "";
  const nameEmpty = fields.name.trim() === "";
  const canSave = !nameEmpty && !blocked && !missingDestination && !saving;

  async function handleSave() {
    if (!canSave || !fields || !result) return;
    setSaving(true);
    stopCameraStream();
    const extraDetails: Record<string, string> = { barcode: result.code };

    // Uploaded *before* createItem, not after — see NewItemInput.coverPhotoPath's
    // doc comment in lib/store.ts for why a separate post-create
    // setItemCoverPhoto update is a race against createItem's own insert.
    let coverPhotoPath: string | null = null;
    if (result.photo && currentHouseholdId) {
      const file = await dataUrlToFile(result.photo);
      const uploaded = await uploadCoverPhotoFile(file, currentHouseholdId);
      if (uploaded.ok) coverPhotoPath = uploaded.path;
      else toast.error(uploaded.error ?? "Item saved, but the photo couldn't be uploaded.");
    }

    const item = createItem({
      name: fields.name.trim(),
      originalDetectedName: result.found ? result.suggestedName || null : null,
      category: fields.category,
      quantity: 1,
      notes: fields.notes.trim(),
      photoEmoji,
      coverPhotoPath,
      locationId: destination?.locationId ?? null,
      containerId: destination?.containerId ?? null,
      // The only way to reach here with an unedited, found match is via
      // explicit Confirm (the `blocked` gate above requires it) — so a
      // found match is always either edited or user-verified by the time
      // Save runs, unlike the appliance flow's lowConfidence-gated
      // version of this same field (there is no confidence score from a
      // barcode lookup, just found/not-found). The real uncertainty here
      // is the opposite case: no match at all, meaning every field was
      // typed blind with nothing external to verify it against.
      needsReview: !result.found,
      reviewReason: result.found ? undefined : "No barcode match found — details entered manually, worth a second look.",
      extraDetails,
    });

    toast.success(`Saved ${item.name}`);
    router.replace(`/items/${item.id}`);
  }

  return (
    <div className="min-h-dvh bg-surface-muted pb-28">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.replace("/capture/barcode")}
          className="tap-target flex size-9 items-center justify-center rounded-full hover:bg-surface-muted"
          aria-label="Back to camera"
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <h1 className="text-body font-medium text-ink">Review item</h1>
        <div className="size-9" />
      </header>

      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-4">
        <div className={cn("flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm", missingDestination && "ring-1 ring-danger")}>
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

        {!result.found && (
          <div className="flex items-center gap-2 rounded-xl bg-brand-100 px-4 py-3 text-caption text-ink">
            <Icon name="needsReview" size={14} className="shrink-0" />
            <span>No product match for this barcode — the code is saved in Notes below. Fill in the rest by hand.</span>
          </div>
        )}

        <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm">
          {result.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.photo} alt="Matched product" className="h-48 w-full rounded-lg bg-surface-muted object-contain" />
          ) : (
            <PhotoThumb emoji={photoEmoji} className="h-48 w-full" emojiClassName="text-8xl" />
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-caption text-muted-foreground">Name</label>
              {!edited && result.found && <MatchBadge />}
            </div>
            <Input
              value={fields.name}
              onChange={(e) => updateFields({ name: e.target.value })}
              placeholder={nameEmpty ? "Not found — enter a name" : "Item name"}
              className={cn("h-11", !edited && result.found && "border-yellow bg-yellow/5")}
            />
            {blocked && (
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-caption text-danger">Confirm this is the right product, or edit the name, before saving.</p>
                <button
                  type="button"
                  onClick={() => updateFields({ confirmed: true })}
                  className="shrink-0 text-caption font-semibold text-ink underline underline-offset-2"
                >
                  Confirm
                </button>
              </div>
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
            <label className="mb-1 block text-caption text-muted-foreground">Notes</label>
            <Textarea
              value={fields.notes}
              onChange={(e) => updateFields({ notes: e.target.value })}
              rows={2}
              placeholder="Optional notes"
              className="bg-white"
            />
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-white px-4 py-3">
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
    </div>
  );
}

function MatchBadge() {
  return (
    <span className="flex items-center gap-1 rounded-full bg-yellow/20 px-2 py-0.5 text-micro font-medium text-ink">
      <Icon name="scan" size={11} /> Matched by barcode
    </span>
  );
}
