"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { BreadcrumbTrail } from "@/components/breadcrumb-trail";
import { MoveSheet } from "@/components/move-sheet";
import { PhotoThumb } from "@/components/photo-thumb";
import { AddPersonSheet } from "@/components/add-person-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInventoryStore, uploadCoverPhotoFile } from "@/lib/store";
import { buildBreadcrumb, sortByLabel, suggestBetterContainer } from "@/lib/selectors";
import { SORTED_CATEGORIES } from "@/lib/types";
import { extraFieldsForCategory, CATEGORY_EMOJI } from "@/lib/category";
import { cn } from "@/lib/utils";
import { loadReferenceItems, matchReferenceLocation, suggestReferenceItems, type ReferenceInventoryItem } from "@/lib/reference/starter-inventory";

const HOUSEHOLD_OWNER_VALUE = "household";
const ADD_PERSON_VALUE = "__add_person__";

export default function ManualAddItemPage() {
  return (
    <Suspense>
      <ManualAddItemInner />
    </Suspense>
  );
}

function ManualAddItemInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);
  const items = useInventoryStore((s) => s.items);
  const people = sortByLabel(useInventoryStore((s) => s.people), (p) => p.displayName);
  const isOwner = useInventoryStore((s) => s.members.find((m) => m.userId === s.currentUserId)?.role === "owner");
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const createItem = useInventoryStore((s) => s.createItem);
  const getOrCreateTag = useInventoryStore((s) => s.getOrCreateTag);
  const lastUsedDestination = useInventoryStore((s) => s.lastUsedDestination);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  // Optional prefill from a reference-catalog pick (Search's "Common
  // items" results, and the reference catalog browse page) — same
  // lazy-initializer, read-only-on-mount convention as ?locationId=/
  // ?containerId= below, not live two-way sync with the URL. `category` is
  // validated against the real enum rather than trusted as-is: a stale or
  // hand-edited URL param naming a category that no longer exists would
  // otherwise silently set the Select to an unrenderable value.
  const [name, setName] = useState(() => searchParams.get("name") ?? "");
  const [category, setCategory] = useState<string>(() => {
    const param = searchParams.get("category");
    return param && (SORTED_CATEGORIES as readonly string[]).includes(param) ? param : SORTED_CATEGORIES[0];
  });
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [extraDetails, setExtraDetails] = useState<Record<string, string>>({});
  const [ownerPersonId, setOwnerPersonId] = useState(HOUSEHOLD_OWNER_VALUE);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [destination, setDestinationState] = useState<{ locationId: string | null; containerId: string | null }>(() => {
    const locationId = searchParams.get("locationId");
    const containerId = searchParams.get("containerId");
    return locationId ? { locationId, containerId: containerId ?? null } : lastUsedDestination ?? { locationId: null, containerId: null };
  });
  const [moveOpen, setMoveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // "There's a container that probably fits this item better" — tracks
  // which container's own suggestion the user has already dismissed, not
  // a blanket "stop suggesting anything" flag, so changing the Category
  // (or the destination) to something that points at a *different*
  // container's theme still surfaces that one. Reset implicitly just by
  // being keyed to the container id: the suggestion recomputes below on
  // every relevant change, and a dismissed id only suppresses itself.
  const [dismissedSuggestionContainerId, setDismissedSuggestionContainerId] = useState<string | null>(null);
  // Starter-inventory reference item-name typeahead (Household Ledger
  // Implementation Plan's deferred spreadsheet-import workstream). The full
  // ~2,662-row list is loaded lazily (loadReferenceItems caches it in
  // module scope after the first call) rather than up front, so opening
  // this form doesn't pay for it until the Name field is actually used.
  const [referenceItems, setReferenceItems] = useState<ReferenceInventoryItem[] | null>(null);
  const [nameSuggestionsOpen, setNameSuggestionsOpen] = useState(false);

  const breadcrumb = buildBreadcrumb(destination.locationId, destination.containerId, locations, containers);
  const currentLocationName = locations.find((l) => l.id === destination.locationId)?.name ?? null;
  const matchedReferenceLocation = currentLocationName ? matchReferenceLocation(currentLocationName) : null;
  const nameSuggestions =
    referenceItems && matchedReferenceLocation ? suggestReferenceItems(referenceItems, matchedReferenceLocation, name) : [];

  // "You already have a container full of these" — only once a name's
  // been typed (an untouched form defaulting to SORTED_CATEGORIES[0]
  // shouldn't surface a suggestion before the user's really started),
  // computed in a useMemo over the raw items/containers arrays rather than
  // inline inside a Zustand selector — a selector returning a freshly
  // computed object on every call breaks Zustand's snapshot comparison and
  // causes an infinite render loop (this app's own real production
  // incident, from getting exactly this wrong in create-chooser-sheet.tsx).
  const containerSuggestion = useMemo(() => {
    if (!name.trim()) return null;
    return suggestBetterContainer(items, containers, category, destination.containerId);
  }, [name, items, containers, category, destination.containerId]);
  const showContainerSuggestion = containerSuggestion !== null && containerSuggestion.container.id !== dismissedSuggestionContainerId;

  function acceptContainerSuggestion() {
    if (!containerSuggestion) return;
    setDestinationState({ locationId: containerSuggestion.container.locationId, containerId: containerSuggestion.container.id });
    setLocationError(null);
  }

  function addTag() {
    const value = tagInput.trim();
    if (value && !tags.includes(value)) setTags((t) => [...t, value]);
    setTagInput("");
  }

  function handlePhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Give this item a name.");
      return;
    }
    if (!destination.locationId) {
      setLocationError("Choose a location — otherwise this item can't be found later.");
      return;
    }
    setSaving(true);
    // Uploaded *before* createItem, not after — a separate post-create
    // setItemCoverPhoto update raced against createItem's own (also
    // fire-and-forget) insert reaching Postgres, and an update against a
    // row that doesn't exist yet silently affects zero rows: no error, no
    // photo, nothing surfaced to the user. Passing the path straight into
    // createItem's own insert avoids the race entirely — see
    // NewItemInput.coverPhotoPath's doc comment in lib/store.ts.
    let coverPhotoPath: string | null = null;
    if (photoFile && currentHouseholdId) {
      const uploaded = await uploadCoverPhotoFile(photoFile, currentHouseholdId);
      if (uploaded.ok) coverPhotoPath = uploaded.path;
      else toast.error(uploaded.error ?? "Item saved, but the photo couldn't be uploaded.");
    }
    const ownerPerson = ownerPersonId === HOUSEHOLD_OWNER_VALUE ? null : (people.find((p) => p.id === ownerPersonId) ?? null);
    const item = createItem({
      name: name.trim(),
      category,
      quantity: Math.max(0, Math.min(9999, Number(quantity) || 0)),
      notes: notes.trim(),
      photoEmoji: CATEGORY_EMOJI[category] ?? "📦",
      coverPhotoPath,
      locationId: destination.locationId,
      containerId: destination.containerId,
      tagIds: tags.map((t) => getOrCreateTag(t).id),
      extraDetails,
      ownerPersonId: ownerPerson?.id ?? null,
    });
    toast.success(`Added ${item.name}`);
    // replace, not push — this page can be reached one hop deep (capture's
    // camera-denied fallback), and either way the item page's back button
    // should return straight to wherever the flow actually started, not
    // step back through this now-empty form.
    router.replace(`/items/${item.id}`);
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.back()}
          className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-surface-muted"
          aria-label="Cancel"
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <div>
          <h1 className="text-body font-semibold text-ink">Add manually</h1>
          <p className="text-micro text-muted-foreground">Create one item without using a photo.</p>
        </div>
      </header>

      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-4">
        <Field label="Photo (optional)">
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChosen} />
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="flex size-28 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-white"
          >
            {photoPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreviewUrl} alt="" className="size-full object-contain" />
            ) : (
              <PhotoThumb emoji={CATEGORY_EMOJI[category] ?? "📦"} className="size-full" emojiClassName="text-5xl" />
            )}
          </button>
          {photoPreviewUrl && (
            <button
              type="button"
              onClick={() => {
                setPhotoFile(null);
                setPhotoPreviewUrl(null);
              }}
              className="mt-1 text-caption font-medium text-muted-foreground underline underline-offset-2"
            >
              Remove photo
            </button>
          )}
        </Field>

        <Field label="Name" required>
          <div className="relative">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
                setNameSuggestionsOpen(true);
              }}
              onFocus={() => {
                setNameSuggestionsOpen(true);
                // Lazy-load once, on first real interaction with this
                // field — not on page mount, and not re-fetched on every
                // focus once cached (loadReferenceItems's own module-scope
                // cache handles that).
                if (!referenceItems) void loadReferenceItems().then(setReferenceItems);
              }}
              onBlur={() => {
                // Deferred so a suggestion button's own onClick still
                // fires first — a plain synchronous close-on-blur would
                // unmount the list before the click below it registers.
                setTimeout(() => setNameSuggestionsOpen(false), 150);
              }}
              placeholder="e.g. Cordless Drill"
              className="h-11 bg-white"
              autoFocus
            />
            {nameSuggestionsOpen && nameSuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-white shadow-lg">
                {nameSuggestions.map((s) => (
                  <button
                    key={`${s.location}:${s.name}`}
                    type="button"
                    onClick={() => {
                      setName(s.name);
                      setCategory(s.category);
                      setNameSuggestionsOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-body text-ink hover:bg-surface-muted"
                  >
                    <span>{s.name}</span>
                    <span className="text-caption text-muted-foreground">{s.category}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {error && <p className="mt-1 text-caption text-danger">{error}</p>}
        </Field>

        <Field label="Category">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-11 w-full bg-white">
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
        </Field>

        <Field label="Belongs to">
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
            <SelectTrigger className="h-11 w-full bg-white">
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
        </Field>

        <Field label="Location" required>
          <button
            type="button"
            onClick={() => setMoveOpen(true)}
            className={cn(
              "tap-target flex h-11 w-full items-center justify-between rounded-lg border bg-white px-3 text-left",
              locationError ? "border-danger" : "border-border"
            )}
          >
            <BreadcrumbTrail segments={breadcrumb} interactive={false} className="text-body text-ink" />
            <Icon name="chevronRight" size={16} className="text-muted-foreground" />
          </button>
          {locationError && <p className="mt-1 text-caption text-danger">{locationError}</p>}
        </Field>

        {showContainerSuggestion && containerSuggestion && (
          <div className="flex items-start gap-2 rounded-lg border border-yellow/40 bg-yellow/10 p-3">
            <Icon name="ai" size={16} className="mt-0.5 shrink-0 text-yellow" />
            <div className="min-w-0 flex-1">
              <p className="text-caption text-ink">
                {containerSuggestion.matchingCount} {category} item{containerSuggestion.matchingCount === 1 ? " is" : "s are"} already in{" "}
                <span className="font-semibold">{containerSuggestion.container.name}</span>
                {containerSuggestion.container.displayCode ? ` (${containerSuggestion.container.displayCode})` : ""} — move this item there
                instead?
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={acceptContainerSuggestion}>
                  Move there
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDismissedSuggestionContainerId(containerSuggestion.container.id)}>
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        )}

        <Field label="Quantity">
          <Input
            type="number"
            min={0}
            max={9999}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="h-11 w-28 bg-white"
          />
        </Field>

        {extraFieldsForCategory(category).length > 0 && (
          <Field label="Details">
            <div className="flex flex-col gap-2">
              {extraFieldsForCategory(category).map((field) => (
                <Input
                  key={field.key}
                  value={extraDetails[field.key] ?? ""}
                  onChange={(e) => setExtraDetails((d) => ({ ...d, [field.key]: e.target.value }))}
                  placeholder={field.placeholder ? `${field.label} (${field.placeholder})` : field.label}
                  className="h-11 bg-white"
                />
              ))}
            </div>
          </Field>
        )}

        <Field label="Tags">
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add a tag and press Enter"
              className="h-11 flex-1 bg-white"
            />
          </div>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTags((cur) => cur.filter((x) => x !== t))}
                  className="flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 text-caption text-ink"
                >
                  {t}
                  <Icon name="close" size={12} />
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes" className="bg-white" />
        </Field>
      </div>

      <div className="sticky bottom-0 border-t border-border bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg gap-2">
          <Button variant="outline" size="lg" className="flex-1" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button size="lg" className="flex-1 bg-ink text-white hover:bg-ink/90" onClick={handleSave} disabled={saving}>
            {saving ? <Icon name="spinner" size={16} className="animate-spin" /> : "Save item"}
          </Button>
        </div>
      </div>

      <MoveSheet
        open={moveOpen}
        onOpenChange={setMoveOpen}
        currentLocationId={destination.locationId}
        currentContainerId={destination.containerId}
        onMove={(dest) => {
          setDestinationState(dest);
          if (dest.locationId) setLocationError(null);
        }}
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-caption text-muted-foreground">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
    </div>
  );
}
