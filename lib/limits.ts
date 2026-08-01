/**
 * Free-tier daily limits (Speechify-style). Kept in their own module with no
 * server-only imports so both client components (the player) and server code
 * (actions, pages) can share the same numbers without pulling the database /
 * auth stack into the client bundle.
 */

// 15 minutes of premium narration per day for free users.
export const FREE_DAILY_LISTEN_SECONDS = 15 * 60

// Free-tier AI quota is a refilling "token bucket" rather than a fixed
// per-calendar-day allotment. A free user can bank up to FREE_AI_QUOTA_CAPACITY
// AI generations, and a quarter of that capacity refills each period
// (FREE_AI_REFILL_PERIODS_PER_DAY periods per day). With the defaults below
// that's 1 generation returning every 6 hours, up to 4 banked.
export const FREE_AI_QUOTA_CAPACITY = 4
export const FREE_AI_REFILL_PERIODS_PER_DAY = 4

// Whole generations restored per refill period (a quarter of capacity).
export const FREE_AI_REFILL_AMOUNT =
  FREE_AI_QUOTA_CAPACITY / FREE_AI_REFILL_PERIODS_PER_DAY

// Length of one refill period in milliseconds (a quarter of a day = 6 hours).
export const FREE_AI_REFILL_PERIOD_MS =
  (24 / FREE_AI_REFILL_PERIODS_PER_DAY) * 60 * 60 * 1000
