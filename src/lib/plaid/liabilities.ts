import "server-only";
import type { CreditCardLiability as PlaidCreditCardLiability } from "plaid";
import { creditCardLiabilityToInsertRow, type CreditCardLiabilityRow } from "@/lib/supabase/mappers";
import type { CreditCardLiability } from "@/lib/types";

/**
 * Maps Plaid's Liabilities response for one credit card into this app's
 * insert-row shape. Pure/synchronous — the actual `plaidClient.
 * liabilitiesGet()` call stays at each call site (exchange-public-token
 * route, sync.ts), matching this codebase's established per-call-site
 * error-handling convention rather than a shared HTTP wrapper; this is
 * just the one genuinely shared piece, the response→row transform.
 */
function mapCreditLiabilityToRow(liability: PlaidCreditCardLiability, accountId: string): CreditCardLiabilityRow {
  const domain: CreditCardLiability = {
    accountId,
    aprs: liability.aprs.map((a) => ({
      aprPercentage: a.apr_percentage,
      aprType: a.apr_type,
      balanceSubjectToApr: a.balance_subject_to_apr,
      interestChargeAmount: a.interest_charge_amount,
    })),
    isOverdue: liability.is_overdue,
    lastPaymentAmount: liability.last_payment_amount,
    lastPaymentDate: liability.last_payment_date,
    lastStatementIssueDate: liability.last_statement_issue_date,
    lastStatementBalance: liability.last_statement_balance,
    minimumPaymentAmount: liability.minimum_payment_amount,
    nextPaymentDueDate: liability.next_payment_due_date,
    lastSyncedAt: new Date().toISOString(),
  };
  return creditCardLiabilityToInsertRow(domain);
}

/**
 * Filters Plaid's per-Item credit liability list down to accounts this
 * app actually knows about (`accountIdByPlaidAccountId`, built from this
 * household's own `accounts` rows) and maps each to an insert-row —
 * ready to `.upsert(rows, { onConflict: "account_id" })`. A liability
 * whose `account_id` isn't in the map is silently skipped rather than
 * erroring — Plaid can return liabilities for the whole Item, including
 * account types this app doesn't track here (mortgage/student, out of
 * scope for v1), or (in principle) an account not yet reflected in the
 * caller's own just-fetched `accounts` snapshot.
 */
export function buildCreditCardLiabilityRows(creditLiabilities: PlaidCreditCardLiability[], accountIdByPlaidAccountId: Map<string, string>): CreditCardLiabilityRow[] {
  const rows: CreditCardLiabilityRow[] = [];
  for (const liability of creditLiabilities) {
    if (!liability.account_id) continue;
    const accountId = accountIdByPlaidAccountId.get(liability.account_id);
    if (!accountId) continue;
    rows.push(mapCreditLiabilityToRow(liability, accountId));
  }
  return rows;
}
