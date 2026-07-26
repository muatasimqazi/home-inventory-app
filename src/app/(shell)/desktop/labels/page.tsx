"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { LabelCard } from "@/components/label-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInventoryStore } from "@/lib/store";
import { activeContainers, activeLocations } from "@/lib/selectors";
import { LABEL_PRESETS, LABEL_TOGGLE_NAMES } from "@/lib/label-preset";
import type { LabelPaperPreset, LabelToggle } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { buildLabelPdfManifest, downloadFile } from "@/lib/export";

interface PreviewEntry {
  tagToken: string;
  displayCode: string | null;
  name: string | null;
  locationName: string | null;
}

export default function LabelPrintingPage() {
  const router = useRouter();
  const containers = useInventoryStore((s) => s.containers);
  const locations = useInventoryStore((s) => s.locations);
  const labelBatches = useInventoryStore((s) => s.labelBatches);
  const labelBatchEntries = useInventoryStore((s) => s.labelBatchEntries);
  const createLabelBatch = useInventoryStore((s) => s.createLabelBatch);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [unassignedCount, setUnassignedCount] = useState("0");
  const [paperPreset, setPaperPreset] = useState<LabelPaperPreset>("small-3up");
  const [toggle, setToggle] = useState<LabelToggle>("qr-code-name");
  const [includeLocation, setIncludeLocation] = useState(true);
  const [offsetX, setOffsetX] = useState("0");
  const [offsetY, setOffsetY] = useState("0");
  const [printEntries, setPrintEntries] = useState<PreviewEntry[] | null>(null);

  const containersByLocation = useMemo(() => {
    const active = activeContainers(containers);
    return activeLocations(locations).map((loc) => ({
      location: loc,
      containers: active.filter((c) => c.locationId === loc.id),
    }));
  }, [containers, locations]);

  const preset = LABEL_PRESETS[paperPreset];
  const parsedUnassignedCount = Math.max(0, Math.min(200, Number(unassignedCount) || 0));

  const previewEntries: PreviewEntry[] = useMemo(() => {
    const selected = Array.from(selectedIds)
      .map((id) => containers.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({
        tagToken: c.tagToken,
        displayCode: c.displayCode,
        name: c.name,
        locationName: locations.find((l) => l.id === c.locationId)?.name ?? null,
      }));
    // Unassigned entries don't have a real tagToken until the batch is actually created,
    // so the preview shows a placeholder — handlePrint swaps in the real generated ones.
    const unassigned: PreviewEntry[] = Array.from({ length: parsedUnassignedCount }, (_, i) => ({
      tagToken: `PREVIEW-${i}`,
      displayCode: null,
      name: null,
      locationName: null,
    }));
    return [...selected, ...unassigned];
  }, [selectedIds, containers, locations, parsedUnassignedCount]);

  function toggleContainer(id: string) {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function commitBatch() {
    if (previewEntries.length === 0) {
      toast.error("Select at least one container or add unassigned labels.");
      return null;
    }
    const { batch, entries } = createLabelBatch({
      paperPreset,
      toggle,
      includeLocation,
      offsetX: Number(offsetX) || 0,
      offsetY: Number(offsetY) || 0,
      containerIds: Array.from(selectedIds),
      unassignedCount: parsedUnassignedCount,
    });
    // Use the real, freshly-generated tagTokens from the created entries (not the
    // placeholder preview state) — each unassigned label needs a unique QR code.
    const resolved: PreviewEntry[] = entries.map((entry) => {
      const container = entry.containerId ? containers.find((c) => c.id === entry.containerId) : null;
      return {
        tagToken: entry.tagToken,
        displayCode: entry.displayCode,
        name: container?.name ?? null,
        locationName: container ? locations.find((l) => l.id === container.locationId)?.name ?? null : null,
      };
    });
    toast.success(`Batch created — ${resolved.length} label${resolved.length === 1 ? "" : "s"}`);
    return { batch, entries, resolved };
  }

  function handlePrint() {
    const committed = commitBatch();
    if (!committed) return;
    setPrintEntries(committed.resolved);
    // Wait for the print-only grid to repaint with the real entries before opening the print dialog.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  function handleExportPdf() {
    const committed = commitBatch();
    if (!committed) return;
    const result = buildLabelPdfManifest(committed.batch, committed.entries);
    downloadFile(result.fileName, result.content, result.mimeType);
    toast("Downloaded a mock PDF manifest — real PDF generation isn't wired up yet.");
  }

  return (
    <div className="flex flex-col gap-6 pb-10 print:pb-0">
      <div className="flex items-center gap-3 print:hidden">
        <button onClick={() => router.back()} className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
          <Icon name="arrowLeft" size={18} />
        </button>
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Print bin labels</h1>
          <p className="text-caption text-muted-foreground">Select bins, choose a label format, and preview before printing.</p>
        </div>
      </div>

      <div className="grid gap-6 print:hidden md:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-5 rounded-xl bg-white p-4 shadow-sm">
          <div>
            <p className="mb-2 text-caption font-medium text-ink">Select containers</p>
            <div className="flex max-h-64 flex-col gap-3 overflow-y-auto">
              {containersByLocation.map(({ location, containers: locContainers }) =>
                locContainers.length === 0 ? null : (
                  <div key={location.id}>
                    <p className="mb-1 text-micro text-muted-foreground">{location.name}</p>
                    <div className="flex flex-col gap-1.5">
                      {locContainers.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-caption text-ink">
                          <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleContainer(c.id)} />
                          {c.name}
                          {c.displayCode && <span className="text-micro font-semibold text-muted-foreground">{c.displayCode}</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-caption font-medium text-ink">Unassigned labels</label>
            <Input
              type="number"
              min={0}
              max={200}
              value={unassignedCount}
              onChange={(e) => setUnassignedCount(e.target.value)}
              className="h-9 w-24"
            />
            <p className="mt-1 text-micro text-muted-foreground">
              Preprinted blank labels — assign them to a container later from that container&apos;s Bin ID sheet.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-caption font-medium text-ink">Paper preset</label>
            <Select value={paperPreset} onValueChange={(v) => setPaperPreset(v as LabelPaperPreset)}>
              <SelectTrigger className="h-9 w-full text-caption">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LABEL_PRESETS) as LabelPaperPreset[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {LABEL_PRESETS[p].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-caption font-medium text-ink">Label contents</label>
            <Select value={toggle} onValueChange={(v) => setToggle(v as LabelToggle)}>
              <SelectTrigger className="h-9 w-full text-caption">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LABEL_TOGGLE_NAMES) as LabelToggle[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {LABEL_TOGGLE_NAMES[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-caption text-ink">
            <Checkbox checked={includeLocation} onCheckedChange={(v) => setIncludeLocation(v === true)} />
            Include location name
          </label>

          <div className="flex gap-3">
            <div>
              <label className="mb-1 block text-caption font-medium text-ink">Offset X (mm)</label>
              <Input type="number" value={offsetX} onChange={(e) => setOffsetX(e.target.value)} className="h-9 w-20" />
            </div>
            <div>
              <label className="mb-1 block text-caption font-medium text-ink">Offset Y (mm)</label>
              <Input type="number" value={offsetY} onChange={(e) => setOffsetY(e.target.value)} className="h-9 w-20" />
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="lg" variant="outline" className="flex-1" onClick={handleExportPdf}>
              <Icon name="download" size={16} /> Export as PDF
            </Button>
            <Button size="lg" className="flex-1 bg-ink text-white hover:bg-ink/90" onClick={handlePrint}>
              Print {previewEntries.length} label{previewEntries.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="mb-3 text-caption font-medium text-ink">Live preview</p>
            {previewEntries.length === 0 ? (
              <p className="text-caption text-muted-foreground">Select containers or add unassigned labels to preview the sheet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {previewEntries.map((entry, i) => (
                  <LabelCard
                    key={i}
                    tagToken={entry.tagToken}
                    displayCode={entry.displayCode}
                    name={entry.name}
                    locationName={entry.locationName}
                    toggle={toggle}
                    includeLocation={includeLocation}
                    widthMm={preset.widthMm}
                    heightMm={preset.heightMm}
                  />
                ))}
              </div>
            )}
          </div>

          {labelBatches.length > 0 && (
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="mb-3 text-caption font-medium text-ink">Recent batches</p>
              <div className="flex flex-col divide-y divide-border">
                {labelBatches.slice(0, 8).map((batch) => {
                  const count = labelBatchEntries.filter((e) => e.batchId === batch.id).length;
                  return (
                    <div key={batch.id} className="flex items-center justify-between py-2 text-caption text-ink">
                      <span>
                        {LABEL_PRESETS[batch.paperPreset].name} · {count} label{count === 1 ? "" : "s"}
                      </span>
                      <span className="text-muted-foreground">{formatDate(batch.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="hidden print:flex print:flex-wrap print:gap-2" style={{ marginLeft: `${Number(offsetX) || 0}mm`, marginTop: `${Number(offsetY) || 0}mm` }}>
        {(printEntries ?? []).map((entry, i) => (
          <LabelCard
            key={i}
            tagToken={entry.tagToken}
            displayCode={entry.displayCode}
            name={entry.name}
            locationName={entry.locationName}
            toggle={toggle}
            includeLocation={includeLocation}
            widthMm={preset.widthMm}
            heightMm={preset.heightMm}
          />
        ))}
      </div>
    </div>
  );
}
