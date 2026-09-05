// Shared UGC-safety constants and types. Kept in a plain module (NOT the
// "use server" action files, which may only export async functions) so both
// server actions and client components can import them.

// Report reasons shown in the Report Content modal. `value` is stored; `label`
// is displayed. Apple's required reason set for objectionable content.
export const REPORT_REASONS = [
  { value: "inappropriate", label: "Inappropriate or offensive content" },
  { value: "copyright", label: "Copyright infringement" },
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or abusive content" },
  { value: "illegal", label: "Illegal content" },
  { value: "other", label: "Other" },
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]["value"]

export const REPORT_REASON_VALUES: readonly string[] = REPORT_REASONS.map(
  (r) => r.value,
)

export function reportReasonLabel(value: string): string {
  return REPORT_REASONS.find((r) => r.value === value)?.label ?? value
}

// Report lifecycle. `pending` on creation; admins move it forward.
export const REPORT_STATUSES = [
  "pending",
  "reviewed",
  "resolved",
  "dismissed",
] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

// Account moderation states. `restricted` and `suspended` both block posting;
// `suspended` additionally hides the user's existing UGC from everyone.
export const USER_STATUSES = ["active", "restricted", "suspended"] as const
export type UserStatus = (typeof USER_STATUSES)[number]

// The only content type that is user-generated + viewable by others today.
export const CONTENT_TYPE_BOOK_REVIEW = "book_review"

export const MAX_REPORT_DETAILS = 1000
export const MAX_REVIEW_LENGTH = 2000

// A book review as shown publicly to other users. Never includes the author's
// email or any private field — only their public display identity.
export type PublicReview = {
  id: number
  userId: string
  authorName: string
  authorUsername: string | null
  authorImage: string | null
  stars: number
  review: string
  createdAt: string // ISO string
  isMine: boolean
}
