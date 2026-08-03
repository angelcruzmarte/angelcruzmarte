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
  /**
   * Required affiliate disclosure text (program compliance). MUST be the
   * program's exact mandated statement — for Amazon this is verbatim
   * "As an Amazon Associate I earn from qualifying purchases." Paraphrasing
   * (e.g. swapping "I" for a brand name) is a common Operating-Agreement
   * violation, so keep this string exact.
   */
  disclosure: string
  /**
   * Longer, plain-language explanation shown on the dedicated disclosure page
   * and in expandable "learn more" contexts. May be branded/paraphrased since
   * it accompanies (does not replace) the exact `disclosure` statement.
   */
  disclosureExtended: string
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

/**
 * Canonical Associate-tag country suffix Amazon assigns per marketplace. A tag
 * only earns commission on the marketplace whose suffix it carries, so this is
 * the source of truth for tag ↔ marketplace validation.
 *   -20 → US, Canada, Mexico, Brazil
 *   -21 → UK, Germany, France, Italy, Spain, India, and other EU/MENA stores
 *   -22 → Japan, Australia
 */
export const MARKETPLACE_TAG_SUFFIX: Record<string, string> = {
  US: "20",
  CA: "20",
  GB: "21",
  DE: "21",
  FR: "21",
  ES: "21",
  IT: "21",
  IN: "21",
  JP: "22",
  AU: "22",
}

function amazonDomain(region?: string | null): string {
  const code = (region || DEFAULT_AMAZON_REGION).toUpperCase()
  return (
    AMAZON_MARKETPLACES.find((m) => m.code === code)?.domain || "www.amazon.com"
  )
}

// ---------------------------------------------------------------------------
// Browser-forced outbound links (open the Amazon WEBSITE, never the app)
// ---------------------------------------------------------------------------
//
// On iOS/Android an `https://amazon.*` link is a Universal Link / App Link: if
// the Amazon app is installed, tapping it hands off to the APP instead of the
// browser. For affiliate purchases we want the tagged Amazon WEBSITE in the
// user's default browser — a predictable checkout that preserves our commission
// across every device and the App Store wrapper.
//
// The fix is a same-origin redirect hop: the tap targets our OWN domain
// (`/go/amazon?u=…`), which the Amazon app is never associated with, so it is
// never intercepted. The route then issues a server 302 to the real Amazon URL,
// and server-side redirects do NOT trigger Universal Links / App Links — so
// Amazon opens in the browser. The affiliate `tag` rides along untouched inside
// the destination URL. We deliberately do NOT emit any amazon:// deep link.

/** Route that performs the same-origin → Amazon website redirect. */
export const AMAZON_REDIRECT_PATH = "/go/amazon"

/** True when a URL points at a supported Amazon marketplace over HTTPS. */
export function isAllowedAmazonUrl(rawUrl?: string | null): boolean {
  const url = (rawUrl || "").trim()
  if (!url) return false
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === "https:" &&
      AMAZON_MARKETPLACES.some((m) => m.domain === parsed.hostname)
    )
  } catch {
    return false
  }
}

/**
 * Wraps a raw, tagged Amazon URL so a tap opens the Amazon website in the
 * browser instead of the Amazon mobile app (see the section note above). Any
 * non-Amazon, relative, or already-wrapped URL is returned unchanged, so this
 * is safe to call defensively on any href.
 */
export function browserAmazonLink(rawUrl?: string | null): string {
  const url = (rawUrl || "").trim()
  if (!isAllowedAmazonUrl(url)) return url
  return `${AMAZON_REDIRECT_PATH}?u=${encodeURIComponent(url)}`
}

/**
 * Sanitizes an Amazon Associate tag into its bare store-id form (e.g.
 * "voxyfi-20"), tolerating common mistakes:
 *   - a full SiteStripe URL pasted in ("https://amazon.com/dp/X?tag=voxyfi-20")
 *   - a "tag=voxyfi-20" fragment
 *   - surrounding whitespace/quotes
 * Returns "" when the value can't be resolved to a valid-looking tag, so we
 * emit a CLEAN (untagged) link rather than a broken one.
 */
export function sanitizeAmazonTag(raw?: string | null): string {
  let v = (raw || "").trim().replace(/^["']|["']$/g, "")
  if (!v) return ""
  // Pull the tag out of a pasted URL / query fragment (also a bare "tag=…").
  const m = v.match(/(?:^|[?&])tag=([^&#\s]+)/i)
  if (m) v = decodeURIComponent(m[1])
  // A bare tag must not contain URL punctuation or spaces.
  if (/[:/?#\s]/.test(v)) return ""
  // Amazon store ids are alphanumeric segments ending in a numeric locale
  // suffix, e.g. "voxyfi-20", "my-store-21".
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*-\d{1,3}$/i.test(v)) return ""
  return v
}

/** Appends the affiliate tag as a query param, respecting existing params. */
function withTag(url: string, tag?: string | null): string {
  const t = sanitizeAmazonTag(tag)
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

  // 3. Fallback: keyword search in the books department. If we have nothing to
  // search on, land on the Books storefront rather than an empty search page.
  const q = [input.title, input.author].filter(Boolean).join(" ").trim()
  if (!q) return withTag(`${base}/b?node=283155`, input.tag) // Amazon Books
  return withTag(`${base}/s?k=${encodeURIComponent(q)}&i=stripbooks`, input.tag)
}

// ---------------------------------------------------------------------------
// Format-aware Amazon links (digital-reading first)
// ---------------------------------------------------------------------------
//
// VOXYFI is a listening/reading app, so when a customer buys on Amazon we
// prioritize the DIGITAL Kindle edition, then Audible, then print. Amazon's
// Kindle/Audible products have their own ASINs that cannot be derived from an
// ISBN, and without the Product Advertising API (which unlocks after 3
// qualifying sales) we cannot auto-detect which formats exist. So we use a
// HYBRID strategy per format:
//   - exact ASIN provided by an admin  → deep-link the precise product
//   - otherwise                        → a department-scoped Amazon search that
//                                         surfaces that format if it exists
// Both are fully Associates-compliant (tagged product and search links are
// allowed), and search links never overstate that a specific product exists.

/** Amazon "search index" (department) per format. */
const AMAZON_DEPARTMENT: Record<string, string> = {
  kindle: "digital-text", // Kindle Store
  audible: "audible", // Audible audiobooks
  print: "stripbooks", // Books (paperback/hardcover)
}

export type AmazonFormatId = "kindle" | "audible" | "print"

export type AmazonFormatLink = {
  id: AmazonFormatId
  /** Human label of what the user is buying, e.g. "Kindle eBook". */
  label: string
  /** The tagged Amazon URL for this format. */
  url: string
  /** True = deep link to a specific product; false = department search. */
  exact: boolean
  /** True for Kindle/Audible (digital delivery). */
  digital: boolean
}

export type AmazonFormatInput = AffiliateLinkInput & {
  kindleAsin?: string | null
  audibleAsin?: string | null
  printAsin?: string | null
}

/** A tagged department-scoped Amazon search for a title+author. */
function amazonSearchUrl(
  base: string,
  index: string,
  q: string,
  tag?: string | null,
): string {
  const url = q
    ? `${base}/s?k=${encodeURIComponent(q)}&i=${index}`
    : `${base}/b?node=283155`
  return withTag(url, tag)
}

/** A tagged exact-product link from a bare ASIN/ISBN. */
function amazonProductUrl(
  base: string,
  asinOrIsbn: string,
  tag?: string | null,
): string {
  const asin = asinOrIsbn.replace(/[^0-9A-Za-z]/g, "").toUpperCase()
  return withTag(`${base}/dp/${asin}`, tag)
}

/**
 * Builds every available Amazon format link for a title, ordered by VOXYFI's
 * digital-first preference: Kindle → Audible → Print. The first entry is the
 * recommended PRIMARY action. An explicit `buyUrl` override, when present,
 * replaces the Kindle primary (admins use it to point at an exact product).
 */
export function amazonFormatLinks(input: AmazonFormatInput): AmazonFormatLink[] {
  const domain = amazonDomain(input.region)
  const base = `https://${domain}`
  const q = [input.title, input.author].filter(Boolean).join(" ").trim()
  const { tag } = input

  // Kindle (primary). An explicit buyUrl override wins as the exact product.
  const override = (input.buyUrl || "").trim()
  let kindle: AmazonFormatLink
  if (override) {
    const url = /^https?:\/\//i.test(override)
      ? withTag(override, tag)
      : amazonProductUrl(base, override, tag)
    kindle = { id: "kindle", label: "Kindle eBook", url, exact: true, digital: true }
  } else if (input.kindleAsin?.trim()) {
    kindle = {
      id: "kindle",
      label: "Kindle eBook",
      url: amazonProductUrl(base, input.kindleAsin, tag),
      exact: true,
      digital: true,
    }
  } else {
    kindle = {
      id: "kindle",
      label: "Kindle eBook",
      url: amazonSearchUrl(base, AMAZON_DEPARTMENT.kindle, q, tag),
      exact: false,
      digital: true,
    }
  }

  // Audible.
  const audible: AmazonFormatLink = input.audibleAsin?.trim()
    ? {
        id: "audible",
        label: "Audible audiobook",
        url: amazonProductUrl(base, input.audibleAsin, tag),
        exact: true,
        digital: true,
      }
    : {
        id: "audible",
        label: "Audible audiobook",
        url: amazonSearchUrl(base, AMAZON_DEPARTMENT.audible, q, tag),
        exact: false,
        digital: true,
      }

  // Print (paperback / hardcover). Prefer an exact print ASIN, then the ISBN
  // product page, then a Books-department search.
  const printExact =
    input.printAsin?.trim() || (isbnToAmazonAsin(input.isbn) ?? "")
  const print: AmazonFormatLink = printExact
    ? {
        id: "print",
        label: "Paperback / Hardcover",
        url: amazonProductUrl(base, printExact, tag),
        exact: true,
        digital: false,
      }
    : {
        id: "print",
        label: "Paperback / Hardcover",
        url: amazonSearchUrl(base, AMAZON_DEPARTMENT.print, q, tag),
        exact: false,
        digital: false,
      }

  return [kindle, audible, print]
}

/** The recommended primary Amazon format (Kindle-first). */
export function primaryAmazonFormat(input: AmazonFormatInput): AmazonFormatLink {
  return amazonFormatLinks(input)[0]
}

export const amazonProvider: AffiliateProvider = {
  id: "amazon",
  label: "Amazon",
  buyLabel: "Buy on Amazon",
  // Amazon's Operating Agreement (Participation Requirements) mandates this
  // EXACT sentence. Do not rebrand "I" → "VOXYFI"; the brand explanation lives
  // in `disclosureExtended`.
  disclosure: "As an Amazon Associate I earn from qualifying purchases.",
  disclosureExtended:
    "VOXYFI is a participant in the Amazon Services LLC Associates Program, an " +
    "affiliate advertising program. When you use a “Buy on Amazon” link you " +
    "purchase directly from Amazon — the price, availability, and checkout all " +
    "happen on Amazon and may change at any time — and VOXYFI may earn a " +
    "commission on qualifying purchases at no extra cost to you.",
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

/** Display label of the active affiliate provider, e.g. "Amazon". */
export const ACTIVE_AFFILIATE_LABEL = amazonProvider.label

/** Button copy of the active affiliate provider, e.g. "Buy on Amazon". */
export const ACTIVE_AFFILIATE_BUY_LABEL = amazonProvider.buyLabel

/**
 * Builds an affiliate buy URL using the active provider. Pure/sync — callers
 * pass the resolved `tag`/`region` (see `resolveAffiliateSettings` server-side).
 */
export function affiliateBuyUrl(input: AffiliateLinkInput): string {
  return activeProvider().buildUrl(input)
}

/** The active provider's EXACT mandated disclosure statement. */
export function affiliateDisclosure(): string {
  return activeProvider().disclosure
}

/** The active provider's longer, plain-language disclosure explanation. */
export function affiliateDisclosureExtended(): string {
  return activeProvider().disclosureExtended
}

/** Display label of the active provider, e.g. "Amazon". */
export function affiliateProviderLabel(): string {
  return activeProvider().label
}

// ---------------------------------------------------------------------------
// Configuration validation (tag ↔ marketplace) + link self-test
// ---------------------------------------------------------------------------

export type ConfigValidationLevel = "pass" | "warning" | "error"

export type AmazonConfigValidation = {
  /** pass = safe, warning = allowed but flagged, error = blocks saving. */
  level: ConfigValidationLevel
  /** Machine-readable code (match, mismatch, invalid_format, empty, …). */
  code: string
  /** Short status headline. */
  title: string
  /** Full explanation, including how to fix a problem. */
  message: string
  /** The sanitized bare tag that would actually be stored. */
  normalizedTag: string
}

/**
 * Validates an Amazon Associate tag against the selected marketplace. Pure and
 * dependency-free so it runs identically in the admin UI (live, on every
 * change) and on the server (enforced before persisting). Errors block saving;
 * warnings are allowed but surfaced.
 */
export function validateAmazonConfig(
  rawTag: string | null | undefined,
  region: string,
): AmazonConfigValidation {
  const regionCode = (region || "").toUpperCase()
  const marketplace = AMAZON_MARKETPLACES.find((m) => m.code === regionCode)
  const regionLabel =
    marketplace?.label ?? (region || "the selected marketplace")

  const raw = (rawTag || "").trim()
  const normalizedTag = sanitizeAmazonTag(raw)

  // Empty is allowed (clears the override) but earns nothing.
  if (!raw) {
    return {
      level: "warning",
      code: "empty",
      title: "No Associate tag set",
      message:
        "Links will point to Amazon without a tag, so qualifying purchases " +
        "won't earn commission. Add your Associate tag to start earning.",
      normalizedTag: "",
    }
  }

  // Typed a value that can't be resolved to a valid store id.
  if (!normalizedTag) {
    return {
      level: "error",
      code: "invalid_format",
      title: "Invalid Associate tag",
      message:
        `“${raw}” is not a valid Amazon store ID. Tags look like ` +
        "“voxyfi-20” — letters/numbers ending in a country suffix. Enter the " +
        "tag itself, not a full SiteStripe URL.",
      normalizedTag: "",
    }
  }

  const suffix = normalizedTag.slice(normalizedTag.lastIndexOf("-") + 1)
  const expected = MARKETPLACE_TAG_SUFFIX[regionCode]

  if (!expected) {
    return {
      level: "warning",
      code: "unknown_region",
      title: "Can't verify marketplace",
      message:
        `Couldn't determine the expected tag suffix for ${regionLabel}. ` +
        "Confirm the tag was issued for this marketplace.",
      normalizedTag,
    }
  }

  if (suffix === expected) {
    return {
      level: "pass",
      code: "match",
      title: "Tag matches marketplace",
      message:
        `“${normalizedTag}” is a valid ${regionLabel} Associate tag ` +
        `(suffix -${expected}). Links will be credited correctly.`,
      normalizedTag,
    }
  }

  // The suffix belongs to a KNOWN but different marketplace → hard mismatch.
  const owners = AMAZON_MARKETPLACES.filter(
    (m) => MARKETPLACE_TAG_SUFFIX[m.code] === suffix,
  )
  if (owners.length > 0) {
    const ownerLabels = owners.map((m) => m.label).join(", ")
    return {
      level: "error",
      code: "mismatch",
      title: "Tag doesn’t match marketplace",
      message:
        `“${normalizedTag}” ends in -${suffix}, which belongs to ` +
        `${ownerLabels} — not ${regionLabel} (which uses -${expected}). ` +
        "Links would work but earn no commission. Either switch the " +
        `marketplace to match, or enter your ${regionLabel} tag.`,
      normalizedTag,
    }
  }

  // Suffix isn't a recognized Amazon country suffix at all.
  return {
    level: "warning",
    code: "unknown_suffix",
    title: "Unrecognized tag suffix",
    message:
      `“${normalizedTag}” ends in -${suffix}, which isn’t a standard Amazon ` +
      `country suffix (-20, -21, -22). ${regionLabel} normally uses ` +
      `-${expected}. Double-check this tag is correct.`,
    normalizedTag,
  }
}

export type AffiliateLinkTest = {
  /** The generated sample affiliate URL. */
  url: string
  /** The tag actually present on the URL (null when none was applied). */
  appliedTag: string | null
  /** The marketplace domain the link points to. */
  domain: string
  /** True when the applied tag equals the sanitized input tag. */
  ok: boolean
}

/**
 * Builds a real sample affiliate link (for a well-known public-domain title)
 * and reports the tag + domain actually applied, so the admin can confirm the
 * configuration produces correctly credited links.
 */
export function testAffiliateLink(
  tag: string | null | undefined,
  region: string,
): AffiliateLinkTest {
  const normalizedTag = sanitizeAmazonTag(tag)
  const url = buildAmazonUrl({
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    isbn: "9780743273565",
    tag: normalizedTag,
    region,
  })
  const m = url.match(/[?&]tag=([^&#]+)/)
  const appliedTag = m ? decodeURIComponent(m[1]) : null
  const ok = normalizedTag ? appliedTag === normalizedTag : appliedTag === null
  return { url, appliedTag, domain: amazonDomain(region), ok }
}

// Setting keys (stored in the `app_setting` table, admin-editable).
export const AMAZON_TAG_SETTING_KEY = "amazon_associate_tag"
export const AMAZON_REGION_SETTING_KEY = "amazon_marketplace_region"
