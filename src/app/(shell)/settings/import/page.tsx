"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInventoryStore } from "@/lib/store";
import { parseCsv } from "@/lib/csv";

type Stage = "upload" | "mapping" | "preview" | "importing" | "complete";

const SHOHAZ_FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "category", label: "Category", required: false },
  { key: "location", label: "Location", required: false },
  { key: "container", label: "Container", required: false },
  { key: "quantity", label: "Quantity", required: false },
  { key: "tags", label: "Tags (comma-separated)", required: false },
  { key: "notes", label: "Notes", required: false },
] as const;

type FieldKey = (typeof SHOHAZ_FIELDS)[number]["key"];

export default function CsvImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({
    name: "",
    category: "",
    location: "",
    container: "",
    quantity: "",
    tags: "",
    notes: "",
  });
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<{ locations: number; containers: number; items: number; flagged: string[] } | null>(null);

  const createLocation = useInventoryStore((s) => s.createLocation);
  const createContainer = useInventoryStore((s) => s.createContainer);
  const createItem = useInventoryStore((s) => s.createItem);
  const getOrCreateTag = useInventoryStore((s) => s.getOrCreateTag);
  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result));
      if (parsed.length === 0) return;
      const [head, ...body] = parsed;
      setHeaders(head);
      setRows(body);
      const guess: Record<FieldKey, string> = { name: "", category: "", location: "", container: "", quantity: "", tags: "", notes: "" };
      for (const field of SHOHAZ_FIELDS) {
        const match = head.find((h) => h.toLowerCase().includes(field.key));
        if (match) guess[field.key] = match;
      }
      setMapping(guess);
      setStage("mapping");
    };
    reader.readAsText(file);
  }

  function columnIndex(field: FieldKey) {
    return headers.indexOf(mapping[field]);
  }

  function rowValue(row: string[], field: FieldKey) {
    const idx = columnIndex(field);
    return idx >= 0 ? (row[idx] ?? "").trim() : "";
  }

  async function runImport() {
    setStage("importing");
    let locationsCreated = 0;
    let containersCreated = 0;
    let itemsCreated = 0;
    const flagged: string[] = [];

    const locationCache = new Map(locations.map((l) => [l.name.toLowerCase(), l.id]));
    const containerCache = new Map(containers.map((c) => [`${c.locationId}|${c.name.toLowerCase()}`, c.id]));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = rowValue(row, "name");
      if (!name) {
        flagged.push(`Row ${i + 2}: missing a name, skipped.`);
        setProgress(Math.round(((i + 1) / rows.length) * 100));
        continue;
      }

      let locationId: string | null = null;
      const locationName = rowValue(row, "location");
      if (locationName) {
        const key = locationName.toLowerCase();
        if (locationCache.has(key)) {
          locationId = locationCache.get(key)!;
        } else {
          const loc = createLocation({ name: locationName });
          locationCache.set(key, loc.id);
          locationId = loc.id;
          locationsCreated++;
        }
      }

      let containerId: string | null = null;
      const containerName = rowValue(row, "container");
      if (containerName && locationId) {
        const key = `${locationId}|${containerName.toLowerCase()}`;
        if (containerCache.has(key)) {
          containerId = containerCache.get(key)!;
        } else {
          const c = createContainer({ name: containerName, locationId });
          containerCache.set(key, c.id);
          containerId = c.id;
          containersCreated++;
        }
      }

      const tagsRaw = rowValue(row, "tags");
      const tagIds = tagsRaw
        ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean).map((t) => getOrCreateTag(t).id)
        : [];
      const quantityRaw = rowValue(row, "quantity");
      const quantity = Number(quantityRaw) > 0 ? Number(quantityRaw) : 1;

      createItem({
        name,
        category: rowValue(row, "category") || "Miscellaneous",
        quantity,
        notes: rowValue(row, "notes"),
        photoEmoji: "📦",
        locationId,
        containerId,
        tagIds,
      });
      itemsCreated++;

      setProgress(Math.round(((i + 1) / rows.length) * 100));
      await new Promise((r) => setTimeout(r, 15));
    }

    setSummary({ locations: locationsCreated, containers: containersCreated, items: itemsCreated, flagged });
    setStage("complete");
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm">
      <div className="flex items-center gap-2">
        <BackButton />
        <div>
          <h1 className="text-desktop-title font-semibold text-ink">CSV import</h1>
          <p className="mt-0.5 text-body text-muted-foreground">Map spreadsheet columns before importing inventory.</p>
        </div>
      </div>

      {stage === "upload" && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-12 text-center"
        >
          <Icon name="file" size={28} className="text-muted-foreground" />
          <p className="text-body font-semibold text-ink">Drop CSV file here</p>
          <Button onClick={() => fileInputRef.current?.click()}>Choose file</Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      )}

      {stage === "mapping" && (
        <div className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-sm">
          <p className="text-caption text-muted-foreground">{rows.length} rows found. Map your CSV columns to Schuaz fields.</p>
          <div className="grid grid-cols-2 gap-3">
            {SHOHAZ_FIELDS.map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-caption text-muted-foreground">
                  {field.label}
                  {field.required && <span className="text-danger"> *</span>}
                </label>
                <Select value={mapping[field.key] || "__none"} onValueChange={(v) => setMapping((m) => ({ ...m, [field.key]: v === "__none" ? "" : v }))}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Not mapped" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Not mapped</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <Button size="lg" disabled={!mapping.name} onClick={() => setStage("preview")} className="self-start">
            Preview import
          </Button>
        </div>
      )}

      {stage === "preview" && (
        <div className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-sm">
          <p className="text-caption text-muted-foreground">Showing the first 5 of {rows.length} rows.</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Container</TableHead>
                  <TableHead>Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 5).map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{rowValue(row, "name") || <span className="text-danger">missing</span>}</TableCell>
                    <TableCell className="text-muted-foreground">{rowValue(row, "category") || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{rowValue(row, "location") || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{rowValue(row, "container") || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{rowValue(row, "quantity") || "1"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="lg" onClick={() => setStage("mapping")}>
              Back
            </Button>
            <Button size="lg" onClick={runImport}>
              Confirm import
            </Button>
          </div>
        </div>
      )}

      {stage === "importing" && (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card p-12 shadow-sm">
          <Icon name="spinner" size={28} className="animate-spin text-ink" />
          <p className="text-body text-ink">Importing… {progress}%</p>
          <div className="h-2 w-64 overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full bg-yellow transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {stage === "complete" && summary && (
        <div className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-full bg-yellow/20 text-ink">
              <Icon name="check" size={20} />
            </div>
            <div>
              <p className="text-item-title font-medium text-ink">Import complete</p>
              <p className="text-caption text-muted-foreground">
                {summary.items} items · {summary.containers} containers · {summary.locations} locations created
              </p>
            </div>
          </div>
          {summary.flagged.length > 0 && (
            <div className="rounded-lg bg-surface-muted p-3 text-caption text-ink">
              <p className="mb-1 font-medium">Needs manual attention</p>
              {summary.flagged.map((f, i) => (
                <p key={i} className="text-muted-foreground">
                  {f}
                </p>
              ))}
            </div>
          )}
          <Button size="lg" className="self-start" onClick={() => setStage("upload")}>
            Import another file
          </Button>
        </div>
      )}
    </div>
  );
}
