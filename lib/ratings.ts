// Shared rating constants/types. Kept in a plain module (not the "use server"
// actions file, which may only export async functions) so both server actions
// and client components can import them.

// Aggregates are only surfaced once there are at least this many ratings, so a
// single opinion never masquerades as a meaningful score.
export const MIN_RATINGS_TO_SHOW = 3

export type BookRatingSummary = {
  /** Mean stars, rounded to 1 decimal. 0 when below the display threshold. */
  average: number
  /** Total number of ratings. */
  count: number
  /** The signed-in user's own rating (1-5), or 0 if they haven't rated. */
  mine: number
  /** True once `count >= MIN_RATINGS_TO_SHOW` (aggregate is meaningful). */
  hasEnough: boolean
  /** True when the current viewer is signed in and may submit a rating. */
  canRate: boolean
}
