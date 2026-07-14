/**
 * Free-tier daily limits (Speechify-style). Kept in their own module with no
 * server-only imports so both client components (the player) and server code
 * (actions, pages) can share the same numbers without pulling the database /
 * auth stack into the client bundle.
 */

// 15 minutes of premium narration per day for free users.
export const FREE_DAILY_LISTEN_SECONDS = 15 * 60

// 3 AI generations (summary / quiz / podcast) per day for free users.
export const FREE_DAILY_AI_GENERATIONS = 3
