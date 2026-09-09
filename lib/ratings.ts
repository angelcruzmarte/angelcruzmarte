// Shared rating constants/types. Kept in a plain module (not the "use server"
// actions file, which may only export async functions) so both server actions
// and client components can import them.

export type BookRatingSummary = {
  /** Mean stars, rounded to 1 decimal. 0 when there are no ratings. */
  average: number
  /** Total number of ratings. */
  count: number
  /** The signed-in user's own rating (1-5), or 0 if they haven't rated. */
  mine: number
  /** True once at least one rating exists (the aggregate should be shown). */
  hasEnough: boolean
  /** True when the current viewer is signed in and may submit a rating. */
  canRate: boolean
}
