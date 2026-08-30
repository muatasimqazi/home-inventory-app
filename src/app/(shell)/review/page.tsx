"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { BackButton } from "@/components/back-button";
import { PhotoThumb } from "@/components/photo-thumb";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInventoryStore } from "@/lib/store";
import { SORTED_CATEGORIES } from "@/lib/types";

export default function NeedsReviewPage() {
  const items = useInventoryStore((s) => s.items);
  const updateItem = useInventoryStore((s) => s.updateItem);
  const saveNormalizationRule = useInventoryStore((s) => s.saveNormalizationRule);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, { name: string; category: string }>>({});
  const [remember, setRemember] = useState<Record<string, boolean>>({});

  const queue = items.filter((it) => it.status === "active" && it.needsReview);

  function draftFor(itemId: string, name: string, category: string) {
    return drafts[itemId] ?? { name, category };
  }

  function resolve(itemId: string, originalDetectedName: string | null) {
    const draft = drafts[itemId];
    const patch = draft ? { name: draft.name, category: draft.category, needsReview: false } : { needsReview: false };
    updateItem(itemId, patch);
    if (remember[itemId] && draft && originalDetectedName && draft.name !== originalDetectedName) {
      saveNormalizationRule(originalDetectedName, draft.name, draft.category);
    }
    toast.success("Resolved");
  }

  function dismiss(itemId: string) {
    updateItem(itemId, { needsReview: false });
    toast("Dismissed — no changes made");
  }

  function toggleSelected(itemId: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function dismissSelected() {
    selected.forEach((itemId) => updateItem(itemId, { needsReview: false }));
    toast(`Dismissed ${selected.size} item${selected.size === 1 ? "" : "s"}`);
    setSelected(new Set());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackButton hideOnDesktop />
        <div>
          <h1 className="text-screen-title font-medium text-ink">Needs Review</h1>
          <p className="text-caption text-muted-foreground">{queue.length} item{queue.length === 1 ? "" : "s"} flagged by AI capture</p>
        </div>
      </div>

      {queue.length === 0 ? (
        <EmptyState icon="check" title="You're all caught up" description="Every AI-detected item has been reviewed. Nice work." />
      ) : (
        <div className="flex flex-col gap-2">
          {queue.map((item) => {
            const draft = draftFor(item.id, item.name, item.category);
            return (
              <div key={item.id} className="flex flex-col gap-3 rounded-xl bg-card p-3 shadow-sm md:flex-row md:items-start">
                <div className="flex items-start gap-3 md:w-64 md:shrink-0">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelected(item.id)}
                    aria-label={`Select ${item.name}`}
                    className="mt-1 size-4 shrink-0"
                  />
                  <PhotoThumb emoji={item.photoEmoji} coverPhotoPath={item.coverPhotoPath} className="size-14 shrink-0" emojiClassName="text-3xl" />
                  <div className="min-w-0">
                    <p className="text-caption text-muted-foreground">Originally detected</p>
                    <p className="truncate text-caption text-ink">{item.originalDetectedName ?? item.name}</p>
                    {item.reviewReason && <p className="mt-1 text-micro text-muted-foreground">{item.reviewReason}</p>}
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-2 md:flex-row">
                  <Input
                    value={draft.name}
                    onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: { ...draft, name: e.target.value } }))}
                    className="h-10 flex-1"
                  />
                  <Select value={draft.category} onValueChange={(v) => setDrafts((d) => ({ ...d, [item.id]: { ...draft, category: v } }))}>
                    <SelectTrigger className="h-10 w-full md:w-40">
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
                <div className="flex items-center gap-2 md:shrink-0">
                  <Button variant="outline" size="sm" onClick={() => dismiss(item.id)}>
                    Dismiss
                  </Button>
                  <Button size="sm" onClick={() => resolve(item.id, item.originalDetectedName)}>
                    <Icon name="check" size={14} /> Resolve
                  </Button>
                </div>
                {draft.name !== (item.originalDetectedName ?? item.name) && (
                  <label className="flex items-center gap-2 text-caption text-muted-foreground md:col-span-full">
                    <input
                      type="checkbox"
                      checked={!!remember[item.id]}
                      onChange={(e) => setRemember((r) => ({ ...r, [item.id]: e.target.checked }))}
                      className="size-4"
                    />
                    Remember this correction for next time?
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky bottom-4 flex items-center justify-between rounded-xl bg-ink-fill px-4 py-3 text-white shadow-lg">
          <span className="text-body">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-white/30 bg-transparent text-white hover:bg-white/10" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button size="sm" onClick={dismissSelected}>
              Dismiss selected
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
