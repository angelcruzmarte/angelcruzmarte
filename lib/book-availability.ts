// Shared catalog "availability" vocabulary used by both the admin server
// actions and the admin UI. Availability is a merchandising status that is
// independent of `published` (storefront visibility): a title can be published
// but "Out of stock", or hidden while "Coming soon".

export const AVAILABILITY_VALUES = [
  "available",
  "out_of_stock",
  "affiliate_only",
  "coming_soon",
  "preorder",
  "unavailable",
  "needs_review",
  "hidden",
] as const

export type Availability = (typeof AVAILABILITY_VALUES)[number]

export const DEFAULT_AVAILABILITY: Availability = "available"

/** Human labels for each availability value. */
export const AVAILABILITY_LABELS: Record<Availability, string> = {
  available: "Available",
  out_of_stock: "Out of stock",
  affiliate_only: "Affiliate only",
  coming_soon: "Coming soon",
  preorder: "Preorder",
  unavailable: "Unavailable",
  needs_review: "Needs review",
  hidden: "Hidden",
}

/**
 * Tailwind classes for the availability badge. Uses semantic tokens so it fits
 * the theme in both light and dark mode. "Bad" states lean on destructive,
 * "pending" states on muted, healthy on primary.
 */
export const AVAILABILITY_BADGE_CLASS: Record<Availability, string> = {
  available: "border-primary/40 text-primary",
  out_of_stock: "border-destructive/40 text-destructive",
  affiliate_only: "border-primary/40 text-primary",
  coming_soon: "border-border text-muted-foreground",
  preorder: "border-border text-muted-foreground",
  unavailable: "border-destructive/40 text-destructive",
  needs_review: "border-destructive/60 text-destructive",
  hidden: "border-border text-muted-foreground",
}

export function isAvailability(v: string): v is Availability {
  return (AVAILABILITY_VALUES as readonly string[]).includes(v)
}

export function availabilityLabel(v: string): string {
  return isAvailability(v) ? AVAILABILITY_LABELS[v] : v
}

/** Link-health status recorded by the broken-link checker. */
export const LINK_STATUS_VALUES = [
  "unknown",
  "ok",
  "broken",
  "needs_review",
] as const

export type LinkStatus = (typeof LINK_STATUS_VALUES)[number]

export const LINK_STATUS_LABELS: Record<LinkStatus, string> = {
  unknown: "Not checked",
  ok: "Link OK",
  broken: "Link broken",
  needs_review: "Needs review",
}
