// Moved to lib/authorize.ts (generalized — first written here for Plaid,
// but the household-membership check has nothing Plaid-specific about it
// and push notifications' subscribe/unsubscribe routes need the exact
// same thing). Re-exported so every existing `@/lib/plaid/authorize`
// import across the Plaid routes keeps working unchanged.
export { requireHouseholdMember, type AuthorizeResult } from "@/lib/authorize";
