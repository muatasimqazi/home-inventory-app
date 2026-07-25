"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Icon } from "@/components/icon";
import { BreadcrumbTrail } from "@/components/breadcrumb-trail";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { buildBreadcrumb } from "@/lib/selectors";

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
      <div className="flex items-center justify-between print:hidden">
        <button onClick={() => router.back()} className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm">
          <Icon name="arrowLeft" size={18} />
        </button>
        <h1 className="text-body font-medium text-ink">Tag Label</h1>
        <div className="size-9" />
      </div>

      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-white p-8 print:border-0 print:shadow-none">
        <QRCodeSVG value={resolveUrl} size={180} bgColor="#ffffff" fgColor="#050505" />
        <div className="text-center">
          <p className="text-item-title font-medium text-ink">{container.name}</p>
          <BreadcrumbTrail segments={breadcrumb.slice(0, -1)} interactive={false} className="justify-center" />
          <p className="mt-2 font-mono text-caption tracking-widest text-muted-foreground">{container.tagToken}</p>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 text-caption text-muted-foreground shadow-sm print:hidden">
        <p className="mb-1 font-medium text-ink">Also works as an NFC tag</p>
        <p>
          Write this same code (<span className="font-mono">{container.tagToken}</span>) to a blank NFC tag using Shortcuts on iOS
          (“Write Tags”) or NFC Tools on Android — both resolve to this Container, same as scanning the QR code.
        </p>
      </div>

      <Button size="lg" onClick={() => window.print()} className="print:hidden">
        <Icon name="tag" size={16} /> Print label
      </Button>
    </div>
  );
}
