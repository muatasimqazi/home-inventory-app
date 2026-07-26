import { QRCodeSVG } from "qrcode.react";
import type { LabelToggle } from "@/lib/types";

interface LabelCardProps {
  tagToken: string;
  displayCode: string | null;
  name: string | null;
  locationName?: string | null;
  toggle: LabelToggle;
  includeLocation: boolean;
  widthMm: number;
  heightMm: number;
}

/** One printable label — used for both the live preview grid and the print sheet, so what you see is what prints. */
export function LabelCard({ tagToken, displayCode, name, locationName, toggle, includeLocation, widthMm, heightMm }: LabelCardProps) {
  const resolveUrl = `https://shohaz.app/c/${tagToken}`;
  const qrSize = Math.round(Math.min(widthMm, heightMm) * 2.6);

  return (
    <div
      className="flex items-center gap-2 overflow-hidden border border-dashed border-border bg-white p-2"
      style={{ width: `${widthMm}mm`, height: `${heightMm}mm` }}
    >
      <QRCodeSVG value={resolveUrl} size={qrSize} bgColor="#ffffff" fgColor="#212121" />
      {toggle !== "qr" && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-caption font-semibold text-ink">{displayCode ?? "Unassigned"}</p>
          {toggle === "qr-code-name" && <p className="truncate text-micro text-ink">{name ?? "Unclaimed label"}</p>}
          {includeLocation && locationName && <p className="truncate text-micro text-muted-foreground">{locationName}</p>}
        </div>
      )}
    </div>
  );
}
