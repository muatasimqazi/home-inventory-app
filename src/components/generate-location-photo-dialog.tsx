"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icon";
import { useAutoFocusVisible } from "@/hooks/use-autofocus-visible";
import { cn } from "@/lib/utils";

// A curated, common set of household storage locations — the user
// request's own examples ("kitchen, pantry, wardrobe") plus the rest of
// what households commonly name Locations. Tapping one just fills the
// room-type field below, same source of truth as typing — not a separate
// exclusive selection, so a location named something none of these cover
// (a workshop, a she-shed) still works by typing it in.
const PRESET_ROOM_TYPES = [
  "Kitchen",
  "Pantry",
  "Wardrobe",
  "Bedroom",
  "Bathroom",
  "Living Room",
  "Garage",
  "Laundry Room",
  "Office",
  "Basement",
  "Attic",
  "Storage Unit",
];

interface GenerateLocationPhotoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRoomType: string;
  onSubmit: (input: { roomType: string; detail: string }) => void;
}

/**
 * Collects what to generate — this dialog itself never calls the API;
 * the caller (locations/[id]/page.tsx) does that after it closes, using
 * the same "Add/Change photo" button + spinner treatment the manual
 * upload flow already has, rather than a second loading UI living here
 * for a call that can genuinely take up to 45s
 * (lib/vision/generate-location-photo.ts's CALL_TIMEOUT_MS).
 */
export function GenerateLocationPhotoDialog({ open, onOpenChange, initialRoomType, onSubmit }: GenerateLocationPhotoDialogProps) {
  const [roomType, setRoomType] = useState(initialRoomType);
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const roomTypeInputRef = useRef<HTMLInputElement>(null);
  useAutoFocusVisible(roomTypeInputRef, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5 text-section-title font-medium text-ink">
            <Icon name="ai" size={16} className="text-yellow" />
            Generate a Photo
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {PRESET_ROOM_TYPES.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setRoomType(preset);
                if (error) setError(null);
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-caption font-medium",
                roomType === preset ? "border-ink-fill bg-ink-fill text-white" : "border-border bg-card text-ink"
              )}
            >
              {preset}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1 block text-caption text-muted-foreground">Room type</label>
          <Input
            value={roomType}
            onChange={(e) => {
              setRoomType(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g. Pantry"
            className="h-11"
            ref={roomTypeInputRef}
          />
          {error && <p className="mt-1 text-caption text-danger">{error}</p>}
        </div>

        <div>
          <label className="mb-1 block text-caption text-muted-foreground">Detail (optional)</label>
          <Input
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="e.g. white cabinets, hardwood floors"
            className="h-11"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="lg" className="flex-auto" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="lg"
            className="flex-auto bg-ink-fill text-white hover:bg-ink-fill/90"
            onClick={() => {
              if (!roomType.trim()) {
                setError("Room type is required.");
                return;
              }
              onSubmit({ roomType: roomType.trim(), detail: detail.trim() });
              onOpenChange(false);
            }}
          >
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
