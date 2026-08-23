import "server-only";
import { randomBytes, createHash } from "crypto";

// Generation/hashing for the api_keys table (0028_api_keys.sql) —
// deliberately its own tiny module rather than folded into
// src/lib/authorize.ts: authorize.ts is about verifying a caller's
// identity/role, this is about the secret's own lifecycle (mint, hash,
// display fragments), used by both the generate route
// (src/app/api/v1/api-keys/route.ts) and the request-auth path
// (src/lib/api-key-auth.ts).

export const API_KEY_PREFIX = "shz_";

// 24 random bytes = 192 bits of entropy, hex-encoded (48 hex chars) — hex
// rather than base64url so the full key is copy-paste-safe into config
// UIs (Home Assistant, Shortcuts, curl headers) that don't always handle
// base64's +/= characters cleanly.
const SECRET_BYTES = 24;

export interface GeneratedApiKey {
  /** The real, one-time-visible secret — e.g. "shz_8f3a2c1d...". Never stored anywhere, this app included; show it to the user once and discard. */
  secret: string;
  /** First 8 hex chars after the prefix, for display: "shz_8f3a2c1d…" */
  keyPrefix: string;
  /** Last 4 hex chars, for display: "…wXyz" */
  lastFour: string;
  /** sha256(secret), hex — the only thing that actually gets stored. */
  keyHash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const raw = randomBytes(SECRET_BYTES).toString("hex");
  const secret = `${API_KEY_PREFIX}${raw}`;
  return {
    secret,
    keyPrefix: `${API_KEY_PREFIX}${raw.slice(0, 8)}`,
    lastFour: raw.slice(-4),
    keyHash: hashApiKeySecret(secret),
  };
}

export function hashApiKeySecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}
