// Affiliate provider layer.
//
// VOXYFI runs a HYBRID bookstore:
//   - "in_app"   → sold directly through VOXYFI's own Stripe checkout.
//   - "affiliate"→ not available natively; we deep-link out to a retail
//                  affiliate with our tag applied and earn a referral fee.
//
// This module is intentionally provider-agnostic so more affiliate networks
// can be added later WITHOUT a rewrite: every provider implements the small
// `AffiliateProvider` contract and registers in `AFFILIATE_PROVIDERS`. For now
// Amazon Associates is the ONLY active provider (`ACTIVE_AFFILIATE_PROVIDER`).

export type AffiliateProviderId = "amazon"

/** Inputs available when building a buy link for a title. */
export type AffiliateLinkInput = {
  title: string
  author?: string | null
  isbn?: string | null
  /** Explicit product URL / ASIN override. Wins over derived links. */
  buyUrl?: string | null
  /** Associate/partner tag. Resolved server-side (DB override → env). */
  tag?: string | null
  /** Marketplace region code (e.g. "US", "GB"). Defaults to US. */
  region?: string | null
}

export type AffiliateProvider = {
  id: AffiliateProviderId
  /** Display label, e.g. "Amazon". */
  label: string
  /** Button copy, e.g. "Buy on Amazon". */
  buyLabel: string
  /** Required affiliate disclosure text (program compliance). */
  disclosure: string
  /** Builds the best buy URL for a title with the tag applied. */
  buildUrl: (input: AffiliateLinkInput) => string
  /** Regions this provider supports (marketplace code → label). */
  regions: { code: string; label: string; domain: string }[]
}

// ---------------------------------------------------------------------------
// ISBN utilities
// ---------------------------------------------------------------------------

/** Strips hyphens/spaces and uppercases the trailing X of an ISBN. */
export function normalizeIsbn(raw?: string | null): string {
  return (raw || "").replace(/[^0-9Xx]/g, "").toUpperCase()
}

/** Validates an ISBN-10 including its check digit. */
export function isValidIsbn10(raw?: string | null): boolean {
  const s = normalizeIsbn(raw)
  if (!/^[0-9]{9}[0-9X]$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const c = s[i]
    const v = c === "X" ? 10 : Number(c)
    sum += v * (10 - i)
  }
  return sum % 11 === 0
}

/** Validates an ISBN-13 including its check digit. */
export function isValidIsbn13(raw?: string | null): boolean {
  const s = normalizeIsbn(raw)
  if (!/^[0-9]{13}$/.test(s)) return false
  let sum = 0
  for (let i = 0; i < 13; i++) {
    sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3)
  }
  return sum % 10 === 0
}

/** True when the value is a valid ISBN-10 or ISBN-13. */
export function isValidIsbn(raw?: string | null): boolean {
  return isValidIsbn10(raw) || isValidIsbn13(raw)
}

/**
 * Converts an ISBN-13 to its ISBN-10 equivalent when possible. Only 978-prefix
 * ISBN-13s have an ISBN-10 form; 979-prefix ones do NOT (returns null). Also
 * accepts an ISBN-10 and returns it normalized.
 */
export function toIsbn10(raw?: string | null): string | null {
  const s = normalizeIsbn(raw)
  if (isValidIsbn10(s)) return s
  if (!isValidIsbn13(s)) return null
  if (!s.startsWith("978")) return null // 979-prefix has no ISBN-10
  const core = s.slice(3, 12) // 9 digits after the 978 prefix
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i)
  const check = (11 - (sum % 11)) % 11
  return core + (check === 10 ? "X" : String(check))
}

// Amazon uses the ISBN-10 as the ASIN for print books, so this doubles as an
// "is this linkable to an exact product page?" check.
export function isbnToAmazonAsin(raw?: string | null): string | null {
  return toIsbn10(raw)
}

// ---------------------------------------------------------------------------
// Amazon Associates provider
// ---------------------------------------------------------------------------

/** Supported Amazon marketplaces (region code → domain). */
export const AMAZON_MARKETPLACES: {
  code: string
  label: string
  domain: string
}[] = [
  { code: "US", label: "Amazon.com (US)", domain: "www.amazon.com" },
  { code: "GB", label: "Amazon.co.uk (UK)", domain: "www.amazon.co.uk" },
  { code: "CA", label: "Amazon.ca (Canada)", domain: "www.amazon.ca" },
  { code: "DE", label: "Amazon.de (Germany)", domain: "www.amazon.de" },
  { code: "FR", label: "Amazon.fr (France)", domain: "www.amazon.fr" },
  { code: "ES", label: "Amazon.es (Spain)", domain: "www.amazon.es" },
  { code: "IT", label: "Amazon.it (Italy)", domain: "www.amazon.it" },
  { code: "JP", label: "Amazon.co.jp (Japan)", domain: "www.amazon.co.jp" },
  { code: "AU", label: "Amazon.com.au (Australia)", domain: "www.amazon.com.au" },
  { code: "IN", label: "Amazon.in (India)", domain: "www.amazon.in" },
]

export const DEFAULT_AMAZON_REGION = "US"

function amazonDomain(region?: string | null): string {
  const code = (region || DEFAULT_AMAZON_REGION).toUpperCase()
  return (
    AMAZON_MARKETPLACES.find((m) => m.code === code)?.domain || "www.amazon.com"
  )
}

/** Appends the affiliate tag as a query param, respecting existing params. */
function withTag(url: string, tag?: string | null): string {
  const t = (tag || "").trim()
  if (!t) return url
  const sep = url.includes("?") ? "&" : "?"
  return `${url}${sep}tag=${encodeURIComponent(t)}`
}

/**
 * Builds the best Amazon buy link for a title:
 *  - explicit `buyUrl` (product URL or bare ASIN) → tag applied
 *  - ISBN convertible to ASIN → `/dp/<asin>` exact product page
 *  - otherwise → a keyword search on the correct marketplace
 * The tag is always applied when present; links still work (uncredited) if not.
 */
export function buildAmazonUrl(input: AffiliateLinkInput): string {
  const domain = amazonDomain(input.region)
  const base = `https://${domain}`

  // 1. Explicit override: full URL or a bare ASIN/ISBN.
  const override = (input.buyUrl || "").trim()
  if (override) {
    if (/^https?:\/\//i.test(override)) return withTag(override, input.tag)
    const asin = override.replace(/[^0-9A-Za-z]/g, "").toUpperCase()
    if (asin) return withTag(`${base}/dp/${asin}`, input.tag)
  }

  // 2. ISBN → exact product page via ASIN (ISBN-10).
  const asin = isbnToAmazonAsin(input.isbn)
  if (asin) return withTag(`${base}/dp/${asin}`, input.tag)

  // 3. Fallback: keyword search in the books department.
  const query = encodeURIComponent(
    [input.title, input.author].filter(Boolean).join(" ").trim(),
  )
  return withTag(`${base}/s?k=${query}&i=stripbooks`, input.tag)
}

export const amazonProvider: AffiliateProvider = {
  id: "amazon",
  label: "Amazon",
  buyLabel: "Buy on Amazon",
  disclosure:
    "As an Amazon Associate, VOXYFI earns from qualifying purchases.",
  buildUrl: buildAmazonUrl,
  regions: AMAZON_MARKETPLACES,
}

// ---------------------------------------------------------------------------
// Provider registry — extensible; Amazon is the only ACTIVE one for now.
// ---------------------------------------------------------------------------

export const AFFILIATE_PROVIDERS: Record<AffiliateProviderId, AffiliateProvider> =
  {
    amazon: amazonProvider,
  }

export const ACTIVE_AFFILIATE_PROVIDER: AffiliateProviderId = "amazon"

export function activeProvider(): AffiliateProvider {
  return AFFILIATE_PROVIDERS[ACTIVE_AFFILIATE_PROVIDER]
}

/**
 * Builds an affiliate buy URL using the active provider. Pure/sync — callers
 * pass the resolved `tag`/`region` (see `resolveAffiliateSettings` server-side).
 */
export function affiliateBuyUrl(input: AffiliateLinkInput): string {
  return activeProvider().buildUrl(input)
}

/** The active provider's required disclosure copy. */
export function affiliateDisclosure(): string {
  return activeProvider().disclosure
}

// Setting keys (stored in the `app_setting` table, admin-editable).
export const AMAZON_TAG_SETTING_KEY = "amazon_associate_tag"
export const AMAZON_REGION_SETTING_KEY = "amazon_marketplace_region"
