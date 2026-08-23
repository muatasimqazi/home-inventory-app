import { APICallError, RetryError } from "ai";

/**
 * Unwraps a (possibly retry-wrapped) AI SDK error down to a real HTTP
 * status code from the upstream provider, if there is one. Shared by every
 * API route that calls a Gateway-routed model and wants to tell a real
 * 503/429 (transient overload/rate-limiting, worth telling the user
 * plainly and that retrying is the fix) apart from any other failure —
 * previously three independently-maintained copies of this exact function
 * (vision/detect, finance/categorize, and now inventory/suggest-container-
 * name's routes), factored into one here so a future fix to how these
 * errors get unwrapped only needs to land once.
 */
export function upstreamStatusCode(error: unknown): number | undefined {
  if (APICallError.isInstance(error)) return error.statusCode;
  if (RetryError.isInstance(error)) {
    for (const inner of error.errors) {
      const code = upstreamStatusCode(inner);
      if (code !== undefined) return code;
    }
  }
  return undefined;
}
