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
import { useApplianceCapture } from "@/lib/appliance-capture-store";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { useInventoryStore, uploadCoverPhotoFile } from "@/lib/store";
import { stopCameraStream } from "@/lib/camera-stream";
import { dataUrlToFile } from "@/lib/crop-image";
import { buildBreadcrumb } from "@/lib/selectors";
import { REVIEW_THRESHOLD } from "@/lib/ai";
import { generateAutoStudioPhoto } from "@/lib/auto-studio-photo";
import { SORTED_CATEGORIES } from "@/lib/types";
import { cn } from "@/lib/utils";

// Review/confirm/save step for the appliance-label capture flow
// (Household Ledger PRD §27, Implementation Plan Workstream 7) — the
// appliance-specific counterpart to /capture/review, reading from
// useApplianceCapture instead of useCaptureSession. Saves a single item
// via the same createItem() the rest of the app uses, with
// manufacturer/modelNumber/serialNumber/manufactureDate written into
// extraDetails under the "Appliance" category's field keys (lib/category.ts)
// — the same generic Extra Details display on the item page (and the same
// warrantyEnd key item-purchase-section.tsx already reads for warranty
// status) picks these up with no further wiring.
//
// A low-confidence reading that the user hasn't edited or explicitly
// confirmed blocks Save — same needsCorrection gate capture/review/page.tsx
// uses for general item detections, applied here to a single field set
// instead of a list of rows.

export default function ApplianceReviewPage() {
  const router = useRouter();
  // iOS Safari doesn't shrink the layout viewport when the keyboard opens
  // (see the hook's own comment) — without this, focusing one of the
  // fields above pushes this fixed Save bar behind the keyboard. No-op on
  // Chromium, which already handles this natively.
  const keyboardInset = useKeyboardInset();
  const photo = useApplianceCapture((s) => s.photo);
  const detection = useApplianceCapture((s) => s.detection);
  const detecting = useApplianceCapture((s) => s.detecting);
  const fields = useApplianceCapture((s) => s.fields);
  const photoEmoji = useApplianceCapture((s) => s.photoEmoji);
  const destination = useApplianceCapture((s) => s.destination);
  const updateFields = useApplianceCapture((s) => s.updateFields);
  const setDestination = useApplianceCapture((s) => s.setDestination);

  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const createItem = useInventoryStore((s) => s.createItem);
  const updateItem = useInventoryStore((s) => s.updateItem);

  const [moveOpen, setMoveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // A separate phase from `saving` — the create itself is done by the time
  // this starts, this is purely the one-photo studio-generation step (see
  // lib/auto-studio-photo.ts) that now runs automatically before landing
  // on the item page, same blocking shape as the "Reading the label…" step
  // above it.
  const [generatingStudio, setGeneratingStudio] = useState(false);

  useEffect(() => {
    if (!detecting && !fields && !photo) {
      router.replace("/capture/appliance");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detecting, fields, photo]);

  if (detecting || !fields || !detection) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-card">
        <Icon name="spinner" size={28} className="animate-spin text-ink" />
        <p className="text-body text-muted-foreground">Reading the label…</p>
      </div>
    );
  }

  if (generatingStudio) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-card">
        <Icon name="spinner" size={28} className="animate-spin text-ink" />
        <p className="text-body text-muted-foreground">Generating studio photo…</p>
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
    if (fields.manufacturer.trim()) extraDetails.manufacturer = fields.manufacturer.trim();
    if (fields.modelNumber.trim()) extraDetails.modelNumber = fields.modelNumber.trim();
    if (fields.serialNumber.trim()) extraDetails.serialNumber = fields.serialNumber.trim();
    if (fields.manufactureDate.trim()) extraDetails.manufactureDate = fields.manufactureDate.trim();

    // Uploaded *before* createItem, not after — see NewItemInput.coverPhotoPath's
    // doc comment in lib/store.ts for why a separate post-create
    // setItemCoverPhoto update is a race against createItem's own insert.
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
    // One automatic studio photo, silently replacing the raw capture as
    // the item's cover photo — only when there's actually a source photo
    // to generate from (see lib/auto-studio-photo.ts). A generation
    // failure never blocks landing on the item page — it just keeps the
    // original photo, same "don't strand the user" posture the cover-photo
    // upload above already uses.
    if (coverPhotoPath && currentHouseholdId) {
      setGeneratingStudio(true);
      try {
        const studioPhoto = await generateAutoStudioPhoto({
          householdId: currentHouseholdId,
          itemId: item.id,
          originalPhotoPath: coverPhotoPath,
          category: fields.category,
        });
        if (studioPhoto.status === "complete" && studioPhoto.generatedPhotoPath) {
          updateItem(item.id, { coverPhotoPath: studioPhoto.generatedPhotoPath });
        } else {
          toast.error(studioPhoto.errorMessage ?? "Couldn't generate a studio photo — kept the original.");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't generate a studio photo — kept the original.");
      } finally {
        setGeneratingStudio(false);
      }
    }

    toast.success(`Saved ${item.name}`);
    router.replace(`/items/${item.id}`);
  }

  return (
    <div className="min-h-dvh bg-surface-muted pb-28">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.replace("/capture/appliance")}
          className="tap-target flex size-9 items-center justify-center rounded-full hover:bg-surface-muted"
          aria-label="Back to camera"
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <h1 className="text-body font-medium text-ink">Review appliance</h1>
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
            <img src={photo} alt="Appliance label" className="h-48 w-full rounded-lg bg-surface-muted object-contain" />
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
              placeholder={nameEmpty ? "Couldn't identify this — enter a name" : "Appliance name"}
              className={cn("h-11", !edited && detection.suggestedName && "border-yellow bg-yellow/5")}
            />
            {blocked && (
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="text-caption text-danger">Low-confidence label reading — please confirm or edit before saving.</p>
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

          <div className="grid grid-cols-2 gap-3">
            <Field label="Manufacturer">
              <Input value={fields.manufacturer} onChange={(e) => updateFields({ manufacturer: e.target.value })} placeholder="e.g. Samsung" className="h-11" />
            </Field>
            <Field label="Model number">
              <Input value={fields.modelNumber} onChange={(e) => updateFields({ modelNumber: e.target.value })} placeholder="Not read" className="h-11" />
            </Field>
            <Field label="Serial number">
              <Input value={fields.serialNumber} onChange={(e) => updateFields({ serialNumber: e.target.value })} placeholder="Not read" className="h-11" />
            </Field>
            <Field label="Manufacture date">
              <Input value={fields.manufactureDate} onChange={(e) => updateFields({ manufactureDate: e.target.value })} placeholder="Not read" className="h-11" />
            </Field>
          </div>

          <p className="text-caption text-muted-foreground">
            Warranty and purchase info aren&apos;t on the label — link a receipt or transaction from the item page once it&apos;s saved to fill those in.
          </p>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-caption text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
