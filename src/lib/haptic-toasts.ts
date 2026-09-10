"use client";

import { toast } from "sonner";
import { hapticSuccess, hapticError } from "@/lib/haptics";

// Side-effect-only module — import it once (root layout) and every
// `toast.success(...)`/`toast.error(...)` call anywhere in the app
// (there are dozens, across saves, deletes, sign-out, etc.) gets the
// matching haptic for free, since a toast is already this app's
// consistent "something happened" signal everywhere. No per-call-site
// changes needed, and no import swap either — this mutates sonner's own
// exported `toast` object in place, so files that already
// `import { toast } from "sonner"` keep working completely unchanged.
if (!(toast as unknown as { _hapticPatched?: boolean })._hapticPatched) {
  const originalSuccess = toast.success.bind(toast);
  const originalError = toast.error.bind(toast);

  toast.success = ((...args: Parameters<typeof toast.success>) => {
    hapticSuccess();
    return originalSuccess(...args);
  }) as typeof toast.success;

  toast.error = ((...args: Parameters<typeof toast.error>) => {
    hapticError();
    return originalError(...args);
  }) as typeof toast.error;

  (toast as unknown as { _hapticPatched: boolean })._hapticPatched = true;
}
