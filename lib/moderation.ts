// Shared user-safety constants and types. Kept in a plain module (NOT the
// "use server" action files, which may only export async functions) so both
// server actions and client components can import them.
//
// Voxyfi collects numeric star ratings only — there is no user-generated text
// to report or moderate — so the former written-review reporting/queue types
// have been removed. What remains is general account moderation (restrict /
// suspend / reinstate), which is part of the user-management system.

// Account moderation states. `restricted` and `suspended` are administrative
// controls over an account's standing, applied from the admin Users page and
// recorded in the moderation audit trail.
export const USER_STATUSES = ["active", "restricted", "suspended"] as const
export type UserStatus = (typeof USER_STATUSES)[number]
