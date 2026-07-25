"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Icon } from "@/components/icon";
import { BreadcrumbTrail } from "@/components/breadcrumb-trail";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { buildBreadcrumb } from "@/lib/selectors";
import { binIdBadgeClasses } from "@/lib/badge-color";
import { cn } from "@/lib/utils";

export default function TagLabelPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const containers = useInventoryStore((s) => s.containers);
  const locations = useInventoryStore((s) => s.locations);

  const container = containers.find((c) => c.id === params.id);
  if (!container) return notFound();

  const breadcrumb = buildBreadcrumb(container.locationId, container.id, locations, containers);
  const resolveUrl = `https://shohaz.app/c/${container.tagToken}`;

  return (
    <div className="flex flex-col gap-5 pb-6 print:pb-0">
      <button onClick={() => router.back()} className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm print:hidden">
        <Icon name="arrowLeft" size={18} />
      </button>
      <div className="print:hidden">
        <h1 className="text-screen-title font-semibold text-ink">Print bin label</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">Generate a durable QR label for this bin.</p>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-white p-8 print:border-0 print:shadow-none">
        <QRCodeSVG value={resolveUrl} size={180} bgColor="#ffffff" fgColor="#212121" />
        <div className="text-center">
          <p className="text-item-title font-medium text-ink">{container.name}</p>
          <BreadcrumbTrail segments={breadcrumb.slice(0, -1)} interactive={false} className="justify-center" />
          <p className="mt-1 font-mono text-caption tracking-widest text-muted-foreground">{container.tagToken}</p>
        </div>
        {container.displayCode && (
          <span className={cn("rounded-full border px-3 py-1 font-mono text-caption font-semibold", binIdBadgeClasses(container.id))}>
            {container.displayCode}
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-white p-4 text-caption text-muted-foreground shadow-sm print:hidden">
        <p className="mb-1 font-medium text-ink">Also works as an NFC tag</p>
        <p>
          Write this same code (<span className="font-mono">{container.tagToken}</span>) to a blank NFC tag using Shortcuts on iOS
          (“Write Tags”) or NFC Tools on Android — both resolve to this Container, same as scanning the QR code.
        </p>
      </div>

      <Button size="lg" onClick={() => window.print()} className="bg-ink text-white hover:bg-ink/90 print:hidden">
        <Icon name="tag" size={16} /> Print label
      </Button>
    </div>
  );
}
