import "server-only";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

// Server-only Plaid API client factory — same lazy-singleton shape as
// lib/supabase/admin.ts. PLAID_SECRET must never reach the browser bundle;
// the `server-only` import makes an accidental client-component import a
// build error instead of a runtime key leak.

let plaidClient: PlaidApi | null = null;

/** 'sandbox' | 'development' | 'production' — see docs/Bank Sync Addendum.md §1: development starts (and stays, for now) in Sandbox. */
function resolveEnv(): keyof typeof PlaidEnvironments {
  const env = process.env.PLAID_ENV ?? "sandbox";
  if (env !== "sandbox" && env !== "development" && env !== "production") {
    throw new Error(`PLAID_ENV must be "sandbox", "development", or "production" — got "${env}".`);
  }
  return env;
}

export function getPlaidClient(): PlaidApi {
  if (plaidClient) return plaidClient;

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    throw new Error("PLAID_CLIENT_ID and PLAID_SECRET must be set.");
  }

  const configuration = new Configuration({
    basePath: PlaidEnvironments[resolveEnv()],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  plaidClient = new PlaidApi(configuration);
  return plaidClient;
}
