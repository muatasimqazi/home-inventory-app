"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { PhotoThumb } from "@/components/photo-thumb";
import { BreadcrumbTrail } from "@/components/breadcrumb-trail";
import { MoveSheet } from "@/components/move-sheet";
import { AddPersonSheet } from "@/components/add-person-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCaptureSession, type DetectionRow } from "@/lib/capture-session-store";
import { useInventoryStore, type NewItemInput } from "@/lib/store";
import { stopCameraStream } from "@/lib/camera-stream";
import { cropToItem, dataUrlToFile } from "@/lib/crop-image";
import { buildBreadcrumb, sortByLabel } from "@/lib/selectors";
import { SORTED_CATEGORIES } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const HOUSEHOLD_OWNER_VALUE = "household";
const ADD_PERSON_VALUE = "__add_person__";

// A low-confidence AI suggestion (row.needsReview) left completely
// untouched shouldn't be savable as-is — that's how items end up
// permanently named "unidentified small appliance." Once the user has
// actually looked at and either edited the name or explicitly hit
// "Confirm" (row.confirmed — the AI can simply be right, and typing a
// no-op edit just to unblock Save was the whole complaint here), it's fine.
function needsCorrection(row: DetectionRow): boolean {
  return row.needsReview && !row.confirmed && row.suggestedName !== "" && row.name.trim() === row.suggestedName;
}

export default function CaptureReviewPage() {
  const router = useRouter();
  const photos = useCaptureSession((s) => s.photos);
  const destination = useCaptureSession((s) => s.destination);
  const detections = useCaptureSession((s) => s.detections);
  const detecting = useCaptureSession((s) => s.detecting);
  const updateDetection = useCaptureSession((s) => s.updateDetection);
  const toggleExcludeDetection = useCaptureSession((s) => s.toggleExcludeDetection);
  const setDestination = useCaptureSession((s) => s.setDestination);
  const linkTransactionId = useCaptureSession((s) => s.linkTransactionId);

  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);
  const transactions = useInventoryStore((s) => s.transactions);
  const people = sortByLabel(useInventoryStore((s) => s.people), (p) => p.displayName);
  const isOwner = useInventoryStore((s) => s.members.find((m) => m.userId === s.currentUserId)?.role === "owner");
  const createItem = useInventoryStore((s) => s.createItem);
  const createItemsBatch = useInventoryStore((s) => s.createItemsBatch);
  const setItemCoverPhoto = useInventoryStore((s) => s.setItemCoverPhoto);
  const getOrCreateTag = useInventoryStore((s) => s.getOrCreateTag);
  const saveNormalizationRule = useInventoryStore((s) => s.saveNormalizationRule);
  const linkItemPurchase = useInventoryStore((s) => s.linkItemPurchase);

  // Household Ledger PRD §26 — the transaction this session arrived
  // pre-linked to (if any), looked up for display only; the actual link is
  // written after Save via linkItemPurchase, same call shape as the
  // manual "Link to item" affordance (Workstream 3).
  const linkTransaction = linkTransactionId ? transactions.find((t) => t.id === linkTransactionId) ?? null : null;

  const [moveOpen, setMoveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rememberFlags, setRememberFlags] = useState<Record<string, boolean>>({});
  // One shared "Belongs to" for the whole session, same design as
  // `destination` above — a scan can produce several items at once (a
  // whole bin), and per-item ownership would be more configuration than
  // the "setup through action, not configuration" onboarding this page is
  // part of calls for (PRD `v4 - Enhanced Features` §14/§22). Mirrors
  // add/page.tsx's own "Belongs to" field exactly, including the inline
  // "+ Add someone" entry — this page previously had no ownership picker
  // at all, the last piece of the onboarding "who does this belong to"
  // moment that wasn't wired up (Household Ledger Implementation Plan §9).
  const [ownerPersonId, setOwnerPersonId] = useState(HOUSEHOLD_OWNER_VALUE);
  const [addPersonOpen, setAddPersonOpen] = useState(false);

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

  // A successful vision call that genuinely found nothing (not a
  // detectError — that's handled back on /capture, before this page is
  // ever reached) used to crash here: `isBulk` only checks `> 1`, so a
  // `length === 0` array still rendered SingleReviewForm with
  // `row={detections[0]}` — undefined, `row.rowId` throws. A real, empty
  // photo (accidental capture, or subject too unclear to recognize
  // anything) should show an empty state and a way forward, not crash.
  if (detections.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white px-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-surface-muted">
          <Icon name="camera" size={26} className="text-muted-foreground" />
        </div>
        <div>
          <p className="text-item-title font-semibold text-ink">We didn&apos;t spot anything</p>
          <p className="mt-1 text-body text-muted-foreground">Try a clearer or closer photo, or add this item manually instead.</p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Button size="lg" onClick={() => router.replace("/capture")}>
            Try again
          </Button>
          <Button size="lg" variant="outline" onClick={() => router.replace("/add")}>
            Add manually
          </Button>
        </div>
      </div>
    );
  }

  const breadcrumb = buildBreadcrumb(destination?.locationId ?? null, destination?.containerId ?? null, locations, containers);
  const included = detections.filter((d) => !d.excluded);
  const isBulk = detections.length > 1;
  const blockedCount = included.filter(needsCorrection).length;

  function buildInput(row: DetectionRow): NewItemInput {
    const ownerPerson = ownerPersonId === HOUSEHOLD_OWNER_VALUE ? null : (people.find((p) => p.id === ownerPersonId) ?? null);
    return {
      name: row.name.trim(),
      originalDetectedName: row.suggestedName || null,
      category: row.category,
      quantity: row.quantity,
      photoEmoji: row.photoEmoji,
      locationId: destination?.locationId ?? null,
      containerId: destination?.containerId ?? null,
      ownerPersonId: ownerPerson?.id ?? null,
      // Kept in lockstep here rather than left for the DB trigger
      // (0018_owner_sync.sql) to derive — same reasoning as add/page.tsx's
      // identical comment: a managed profile's linkedUserId is null, and a
      // stale derived value could otherwise trip the trigger's consistency
      // guard if this item is ever re-saved before a full page reload.
      ownerUserId: ownerPerson?.linkedUserId ?? null,
      // Bug fix: this used to be `row.needsReview && row.name.trim() === ""`
      // — since needsCorrection() (above) already blocks Save until every
      // flagged row has a non-empty name, that condition was never true in
      // practice, so items created here almost never carried needsReview
      // through to the saved record and the persistent Needs Review queue
      // silently stayed empty regardless of how many low-confidence
      // detections actually occurred. The real distinction that matters:
      // did the user actually correct the name away from the AI's raw
      // guess (safe to trust, no further review needed) or just accept it
      // as-is via Confirm/"Confirm all blocked" (still worth a second look
      // later, even though it wasn't blocking save) — same test
      // needsCorrection() already uses for the pre-save gate.
      needsReview: row.needsReview && row.name.trim() === row.suggestedName,
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

  function confirmAllBlocked() {
    for (const row of included.filter(needsCorrection)) updateDetection(row.rowId, { confirmed: true });
  }

  const missingDestination = !destination?.locationId;

  // Crops just this row's own item out of whichever photo it was detected
  // in (row.photoIndex), instead of every item in a photo sharing one full
  // copy of it. Falls back to the (resized) whole photo when there's no
  // usable box — see isUsableBoundingBox in lib/crop-image.ts — so a model
  // that can't localize an item, or a genuinely single-item photo, still
  // gets a real cover instead of none at all.
  async function buildCoverFile(row: DetectionRow): Promise<File | null> {
    const sourcePhoto = photos[row.photoIndex] ?? photos[0];
    if (!sourcePhoto) return null;
    const cropped = await cropToItem(sourcePhoto, row.boundingBox);
    return dataUrlToFile(cropped);
  }

  async function handleSave() {
    if (included.length === 0 || blockedCount > 0 || missingDestination) return;
    setSaving(true);
    const coverFiles = await Promise.all(included.map(buildCoverFile));
    // The capture flow is done at this point — release the camera for real
    // (it's kept alive across /capture <-> /capture/review round trips up
    // to now so "Add another photo" doesn't re-prompt for permission).
    stopCameraStream();
    if (included.length === 1) {
      const item = createItem(buildInput(included[0]));
      persistNormalizationRules(included);
      if (coverFiles[0]) await setItemCoverPhoto(item.id, coverFiles[0]);
      if (linkTransaction) {
        const linkRes = await linkItemPurchase({ itemId: item.id, transactionId: linkTransaction.id, source: "finance_nudge" });
        if (!linkRes.ok) toast.error(linkRes.error ?? "Saved, but couldn't link the purchase — link it manually from the item page.");
      }
      toast.success(`Saved ${item.name}`);
      // replace, not push — closes out the whole capture flow's single
      // history slot instead of adding yet another one on top of it, so
      // the item page's own back button returns straight to wherever the
      // flow was actually started from (a Container/Location page).
      router.replace(`/items/${item.id}`);
    } else {
      const created = createItemsBatch(included.map(buildInput));
      persistNormalizationRules(included);
      await Promise.all(created.map((it, i) => (coverFiles[i] ? setItemCoverPhoto(it.id, coverFiles[i]!) : null)));
      // A capture-nudge is keyed to one transaction, but the user may have
      // photographed more than one thing from that same purchase (e.g. a
      // multi-item Home Depot run) — link every item created in this batch
      // to it rather than only the first, since item_purchases has no
      // one-item-per-transaction constraint.
      if (linkTransaction) {
        const linkResults = await Promise.all(
          created.map((it) => linkItemPurchase({ itemId: it.id, transactionId: linkTransaction.id, source: "finance_nudge" }))
        );
        if (linkResults.some((r) => !r.ok)) toast.error("Saved, but couldn't link one or more items to the purchase — link them manually from the item page.");
      }
      toast.success(`Saved ${included.length} items`);
      router.replace(destination?.containerId ? `/containers/${destination.containerId}` : "/");
    }
    setSaving(false);
  }

  return (
    <div className="min-h-dvh bg-surface-muted pb-28">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => router.replace("/capture")}
          className="tap-target flex size-9 items-center justify-center rounded-full hover:bg-surface-muted"
          aria-label="Back to camera"
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <h1 className="text-body font-medium text-ink">{isBulk ? "Review items" : "Review item"}</h1>
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

        <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
          <p className="mb-1.5 text-caption text-muted-foreground">Belongs to</p>
          <Select
            value={ownerPersonId}
            onValueChange={(v) => {
              if (v === ADD_PERSON_VALUE) {
                setAddPersonOpen(true);
                return;
              }
              setOwnerPersonId(v);
            }}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={HOUSEHOLD_OWNER_VALUE}>Household</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.displayName}
                </SelectItem>
              ))}
              <SelectItem value={ADD_PERSON_VALUE}>+ Add someone</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {linkTransaction && (
          <div className="flex items-center gap-2 rounded-xl bg-brand-100 px-4 py-3 text-caption text-ink">
            <Icon name="link" size={14} className="shrink-0" />
            <span>
              Will link to your {formatCurrency(Math.abs(linkTransaction.amount))} purchase
              {linkTransaction.merchant ? ` at ${linkTransaction.merchant}` : ""} — no separate linking step needed.
            </span>
          </div>
        )}

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
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          {missingDestination && (
            <p className="text-center text-caption text-danger">Choose a location above before saving — otherwise these items can&apos;t be found later.</p>
          )}
          {blockedCount > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-danger/5 px-3 py-2">
              <p className="text-caption text-danger">
                Confirm or edit the highlighted name{blockedCount > 1 ? "s" : ""} above before saving.
              </p>
              {blockedCount > 1 && (
                <button type="button" onClick={confirmAllBlocked} className="shrink-0 text-caption font-semibold text-ink underline underline-offset-2">
                  Confirm all
                </button>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="flex-1" onClick={() => router.replace("/capture?continue=1")}>
              Add another photo
            </Button>
            <Button size="lg" className="flex-1" disabled={included.length === 0 || blockedCount > 0 || missingDestination || saving} onClick={handleSave}>
              {saving ? <Icon name="spinner" size={16} className="animate-spin" /> : isBulk ? `Save All (${included.length})` : "Save"}
            </Button>
          </div>
        </div>
      </div>

      <MoveSheet
        open={moveOpen}
        onOpenChange={setMoveOpen}
        currentLocationId={destination?.locationId ?? null}
        currentContainerId={destination?.containerId ?? null}
        onMove={setDestination}
      />

      <AddPersonSheet
        open={addPersonOpen}
        onOpenChange={setAddPersonOpen}
        onCreated={(person) => setOwnerPersonId(person.id)}
        canInvite={isOwner}
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
  const blocked = needsCorrection(row);

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="Captured item" className="h-48 w-full rounded-lg bg-surface-muted object-contain" />
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
          placeholder={blocked ? "Couldn't identify this — enter a name" : "Item name"}
          className={cn("h-11", !edited && row.suggestedName && "border-yellow bg-yellow/5")}
        />
        {blocked && (
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-caption text-danger">Low-confidence AI guess — please confirm or edit this name before saving.</p>
            <button
              type="button"
              onClick={() => onChange({ confirmed: true })}
              className="shrink-0 text-caption font-semibold text-ink underline underline-offset-2"
            >
              Confirm
            </button>
          </div>
        )}
        {row.needsReview && !blocked && row.reviewReason && <p className="mt-1 text-caption text-muted-foreground">{row.reviewReason}</p>}
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
            {SORTED_CATEGORIES.map((c) => (
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
  const blocked = needsCorrection(row) && !row.excluded;

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
          {blocked && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-caption text-danger">Low-confidence guess — confirm or edit this name before saving.</p>
              <button
                type="button"
                onClick={() => onChange({ confirmed: true })}
                className="shrink-0 text-caption font-semibold text-ink underline underline-offset-2"
              >
                Confirm
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <Select value={row.category} onValueChange={(v) => onChange({ category: v })} disabled={row.excluded}>
              <SelectTrigger className="h-8 flex-1 text-caption">
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
