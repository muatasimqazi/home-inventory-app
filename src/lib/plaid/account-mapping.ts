// Plaid account type/subtype -> Shohaz AccountType (docs/Bank Sync
// Addendum.md §5). Pure function, no SDK/network dependency, so it's
// testable the same way lib/receipt-resolution.ts's pure resolvers are.

import type { AccountType } from "@/lib/types";

/** `cash` has no Plaid equivalent and is never returned here — a Plaid-linked account is always one of the other six types. */
export function mapPlaidAccountType(plaidType: string, plaidSubtype: string | null | undefined): AccountType {
  switch (plaidType) {
    case "depository":
      return plaidSubtype === "savings" ? "savings" : "checking"; // checking, money market, CDs, etc. default to checking
    case "credit":
      return "credit_card";
    case "loan":
      return plaidSubtype === "mortgage" ? "mortgage" : "loan";
    case "investment":
    case "brokerage":
      return "investment";
    default:
      return "checking"; // conservative fallback for a Plaid type Shohaz doesn't otherwise recognize
  }
}
