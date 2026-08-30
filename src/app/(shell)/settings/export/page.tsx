"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "@/components/icon";
import { useInventoryStore, useCurrentHousehold } from "@/lib/store";
import { itemsToCsv } from "@/lib/csv";
import { buildHouseholdExport, buildLabelPdfManifest, downloadFile, type FileExportResult } from "@/lib/export";

type Stage = "idle" | "running" | "complete" | "error";

type ExportResult = FileExportResult;

export default function DataExportPage() {
  const router = useRouter();
  const household = useCurrentHousehold();
  const items = useInventoryStore((s) => s.items);
  const containers = useInventoryStore((s) => s.containers);
  const locations = useInventoryStore((s) => s.locations);
  const tags = useInventoryStore((s) => s.tags);
  const members = useInventoryStore((s) => s.members);
  const favorites = useInventoryStore((s) => s.favorites);
  const attachments = useInventoryStore((s) => s.attachments);
  const labelBatches = useInventoryStore((s) => s.labelBatches);
  const labelBatchEntries = useInventoryStore((s) => s.labelBatchEntries);

  const dateStamp = new Date().toISOString().slice(0, 10);

  function buildInventoryCsv(): ExportResult {
    return {
      fileName: `schuaz-inventory-${dateStamp}.csv`,
      content: itemsToCsv(items, containers, locations, tags),
      mimeType: "text/csv",
    };
  }

  function buildPhotoArchiveManifest(): ExportResult {
    const manifest = {
      note: "Mock export — this mock/in-memory app stores photos as emoji stand-ins, not real image files. A real Supabase-backed build would zip actual photo storage objects here.",
      photoCount: items.filter((it) => it.status !== "trashed").length,
      items: items
        .filter((it) => it.status !== "trashed")
        .map((it) => ({ itemId: it.id, name: it.name, photoPlaceholder: it.photoEmoji })),
    };
    return {
      fileName: `schuaz-photo-archive-manifest-${dateStamp}.json`,
      content: JSON.stringify(manifest, null, 2),
      mimeType: "application/json",
      mock: true,
    };
  }

  function buildLatestLabelPdf(): ExportResult {
    const latestBatch = labelBatches[0] ?? null;
    const entries = latestBatch ? labelBatchEntries.filter((e) => e.batchId === latestBatch.id) : [];
    return buildLabelPdfManifest(latestBatch, entries);
  }

  function buildFullDataExport(): ExportResult {
    const snapshot = buildHouseholdExport({
      household,
      members,
      locations,
      containers,
      items,
      tags,
      favorites,
      attachments,
      labelBatches,
      labelBatchEntries,
    });
    return {
      fileName: `schuaz-household-export-${dateStamp}.json`,
      content: JSON.stringify(snapshot, null, 2),
      mimeType: "application/json",
    };
  }

  return (
    <div className="flex flex-col gap-5">
      <button onClick={() => router.back()} className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm">
        <Icon name="arrowLeft" size={18} />
      </button>
      <div>
        <h1 className="text-screen-title font-semibold text-ink">Data & export</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">Your household inventory is personal and portable.</p>
      </div>

      <ExportCard
        icon="download"
        title="Inventory CSV"
        description="Every item, its category, quantity, location, and Container ID — ready to open in Sheets or Excel."
        buildResult={buildInventoryCsv}
      />
      <ExportCard
        icon="gallery"
        title="Photo archive"
        description="A copy of every item photo in this household."
        buildResult={buildPhotoArchiveManifest}
      />
      <ExportCard
        icon="tag"
        title="Label PDF"
        description="A print-ready PDF of your most recent label batch."
        buildResult={buildLatestLabelPdf}
      />
      <ExportCard
        icon="box"
        title="Full household data"
        description="Everything — items, locations, containers, tags, members, activity — as a single JSON file."
        buildResult={buildFullDataExport}
      />
    </div>
  );
}

function ExportCard({
  icon,
  title,
  description,
  buildResult,
}: {
  icon: IconName;
  title: string;
  description: string;
  buildResult: () => ExportResult;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [lastResult, setLastResult] = useState<ExportResult | null>(null);

  function run() {
    setStage("running");
    setProgress(0);
    const failed = Math.random() < 0.1;
    const start = Date.now();
    const duration = 1200;

    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, Math.round((elapsed / duration) * 100));
      setProgress(pct);
      if (elapsed < duration) {
        requestAnimationFrame(tick);
        return;
      }
      if (failed) {
        setStage("error");
        return;
      }
      const result = buildResult();
      setLastResult(result);
      downloadFile(result.fileName, result.content, result.mimeType);
      setStage("complete");
    };
    requestAnimationFrame(tick);
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-100 text-yellow">
          <Icon name={icon} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium text-ink">{title}</p>
          <p className="text-caption text-muted-foreground">{description}</p>
        </div>
      </div>

      {stage === "idle" && (
        <button
          type="button"
          onClick={run}
          className="tap-target self-start rounded-lg border border-border px-3 py-1.5 text-caption font-medium text-ink hover:bg-surface-muted"
        >
          Export
        </button>
      )}

      {stage === "running" && (
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full bg-yellow transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-micro text-muted-foreground">Preparing export… {progress}%</p>
        </div>
      )}

      {stage === "complete" && lastResult && (
        <div className="flex items-center gap-2 text-caption text-ink">
          <span className="flex size-5 items-center justify-center rounded-full bg-yellow/20 text-ink">
            <Icon name="check" size={12} />
          </span>
          Downloaded {lastResult.fileName}
          {lastResult.mock && <span className="text-muted-foreground">(mock manifest)</span>}
          <button type="button" onClick={run} className="ml-auto text-muted-foreground hover:text-ink">
            Export again
          </button>
        </div>
      )}

      {stage === "error" && (
        <div className="flex items-center gap-2 text-caption text-danger">
          <Icon name="danger" size={14} />
          Export failed — try again.
          <button type="button" onClick={run} className="ml-auto font-medium text-ink hover:underline">
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
