import "server-only";
import { createHash } from "crypto";
import { importJWK, jwtVerify, decodeProtectedHeader } from "jose";
import type { JWK } from "jose";
import { getPlaidClient } from "./client";

// Plaid webhook verification (https://plaid.com/docs/api/webhooks/webhook-verification/)
// — a JWT in the `Plaid-Verification` header, ES256-signed with a key
// Plaid rotates infrequently. Same overall shape as Resend's Svix
// verification in the resend-inbound webhook (verify against the raw
// body, reject anything that doesn't check out), different mechanics:
// Plaid ships the signing key itself via /webhook_verification_key/get
// rather than a shared secret, so the key has to be fetched (and cached)
// rather than read from an env var.

// Cached in module scope, not per-request — Plaid's own guidance is to
// cache verification keys and avoid calling /webhook_verification_key/get
// on every webhook. A fresh Vercel Function instance starts with an empty
// cache; Fluid Compute's instance reuse means most invocations hit it warm.
const keyCache = new Map<string, JWK>();

async function getVerificationKey(keyId: string): Promise<JWK> {
  const cached = keyCache.get(keyId);
  if (cached) return cached;

  const plaidClient = getPlaidClient();
  const response = await plaidClient.webhookVerificationKeyGet({ key_id: keyId });
  const key = response.data.key as unknown as JWK;
  keyCache.set(keyId, key);
  return key;
}

/**
 * Verifies a Plaid webhook request. MUST be called against the raw body
 * string (not a parsed/re-serialized one) — the JWT's request_body_sha256
 * claim is a hash of the exact bytes Plaid sent.
 */
export async function verifyPlaidWebhook(rawBody: string, verificationHeader: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!verificationHeader) return { ok: false, error: "Missing Plaid-Verification header." };

  let keyId: string | undefined;
  try {
    ({ kid: keyId } = decodeProtectedHeader(verificationHeader));
  } catch {
    return { ok: false, error: "Malformed verification JWT." };
  }
  if (!keyId) return { ok: false, error: "Verification JWT has no key id." };

  try {
    const jwk = await getVerificationKey(keyId);
    const key = await importJWK(jwk, "ES256");
    const { payload } = await jwtVerify(verificationHeader, key, { maxTokenAge: "5 min" });

    const bodyHash = createHash("sha256").update(rawBody).digest("hex");
    if (payload.request_body_sha256 !== bodyHash) {
      return { ok: false, error: "Request body hash mismatch." };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Verification failed." };
  }
}
