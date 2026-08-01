/**
 * Book metadata quality: language/script detection, Project Gutenberg
 * boilerplate cleaning, title/author normalization, cover heuristics, and an
 * overall publishable verdict. Pure functions only (no I/O, no "server-only")
 * so this is shared by the live import pipeline and the offline backfill
 * script alike.
 */

export type Script =
  | "latin"
  | "han"
  | "kana"
  | "hangul"
  | "cyrillic"
  | "greek"
  | "arabic"
  | "hebrew"
  | "other"

const SCRIPT_RANGES: { script: Script; re: RegExp }[] = [
  { script: "kana", re: /[\u3040-\u30ff]/ },
  { script: "han", re: /[\u3400-\u4dbf\u4e00-\u9fff]/ },
  { script: "hangul", re: /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/ },
  { script: "cyrillic", re: /[\u0400-\u04ff]/ },
  { script: "greek", re: /[\u0370-\u03ff]/ },
  { script: "arabic", re: /[\u0600-\u06ff]/ },
  { script: "hebrew", re: /[\u0590-\u05ff]/ },
  { script: "latin", re: /[A-Za-z\u00c0-\u024f]/ },
]

/** Counts letters by script and returns the dominant one (ignores punctuation,
 *  whitespace and digits). Returns "other" when there are no letters. */
export function dominantScript(text: string): Script {
  const counts: Record<Script, number> = {
    latin: 0, han: 0, kana: 0, hangul: 0,
    cyrillic: 0, greek: 0, arabic: 0, hebrew: 0, other: 0,
  }
  for (const ch of text) {
    let matched = false
    for (const { script, re } of SCRIPT_RANGES) {
      if (re.test(ch)) {
        counts[script]++
        matched = true
        break
      }
    }
    if (!matched && /\p{L}/u.test(ch)) counts.other++
  }
  let best: Script = "other"
  let bestN = 0
  for (const s of Object.keys(counts) as Script[]) {
    if (counts[s] > bestN) {
      bestN = counts[s]
      best = s
    }
  }
  return bestN === 0 ? "other" : best
}

/**
 * Infers a language code from the dominant script of a text sample. Only
 * returns a code for scripts that map unambiguously to a single language in
 * our catalog; returns null for Latin script (which spans en/es/fr/de/… and
 * can't be told apart by characters alone) or when there's no signal.
 */
export function scriptLanguage(text: string): string | null {
  // Kana anywhere is a decisive signal for Japanese, even amid Han characters.
  if (/[\u3040-\u30ff]/.test(text)) return "ja"
  const script = dominantScript(text)
  switch (script) {
    case "han":
      return "zh"
    case "hangul":
      return "ko"
    case "cyrillic":
      return "ru"
    case "greek":
      return "el"
    case "arabic":
      return "ar"
    case "hebrew":
      return "he"
    default:
      return null
  }
}

/**
 * Verifies a tagged language against the actual script of the book's text.
 * Only overrides when the script gives a decisive non-Latin signal that
 * conflicts with the tag (this is what catches CJK/Cyrillic/etc. books
 * mislabeled as English). Latin-script languages are left untouched.
 */
export function verifyLanguage(
  tagged: string | null | undefined,
  sample: string,
): { ok: boolean; language: string } {
  const current = (tagged || "en").trim().toLowerCase().split(/[-_]/)[0]
  const detected = scriptLanguage(sample)
  if (detected && detected !== current) {
    return { ok: false, language: detected }
  }
  return { ok: true, language: current }
}

// Lines/paragraphs that are Project Gutenberg boilerplate rather than prose.
const BOILERPLATE_START =
  /^(produced by|transcribed by|transcriber'?s? note|e-?text prepared|etext prepared|prepared by|title:|author:|release date|posting date|first posted|last updated|updated:|language:|character set|credits?:|illustrat|contents\b|table of contents|\[illustration|note:|copyright|end of (the |this )?project gutenberg|start of (the |this )?project gutenberg|\*\*\*)/i

const BOILERPLATE_CONTAINS =
  /(project gutenberg|gutenberg-?tm|www\.gutenberg|pglaf\.org|distributed proofread|public domain|ebook is for the use)/i

/** Number of actual letters (any script) in a string. */
function letterCount(s: string): number {
  const m = s.match(/\p{L}/gu)
  return m ? m.length : 0
}

/** True when a paragraph looks like real prose rather than a heading/marker. */
function isProse(block: string): boolean {
  if (BOILERPLATE_START.test(block) || BOILERPLATE_CONTAINS.test(block)) {
    return false
  }
  const letters = letterCount(block)
  if (letters < 24) return false
  // Reject shouty ALL-CAPS headings (Latin only; CJK has no case).
  const latin = block.match(/[A-Za-z]/g)?.length ?? 0
  if (latin > 12) {
    const upper = block.match(/[A-Z]/g)?.length ?? 0
    if (upper / latin > 0.8) return false
  }
  return true
}

/** Splits a text blob into normalized paragraph blocks. */
function toBlocks(raw: string): string[] {
  return raw
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter(Boolean)
}

/**
 * Produces a clean marketing description + short excerpt from a book's prose
 * (its full content or an existing blurb), stripping Gutenberg boilerplate,
 * transcriber notes, headings and license text.
 */
export function deriveDescription(raw: string): {
  description: string
  excerpt: string
} {
  if (!raw) return { description: "", excerpt: "" }
  const prose = toBlocks(raw).filter(isProse)
  if (prose.length === 0) return { description: "", excerpt: "" }
  const description = prose.slice(0, 2).join(" ").slice(0, 600).trim()
  const excerpt = prose[0].slice(0, 400).trim()
  return { description, excerpt }
}

/** True if a description is empty or still just Gutenberg boilerplate. */
export function isBoilerplateDescription(desc: string | null | undefined): boolean {
  if (!desc || !desc.trim()) return true
  const d = desc.trim()
  if (BOILERPLATE_CONTAINS.test(d)) return true
  if (BOILERPLATE_START.test(d)) return true
  if (letterCount(d) < 24) return true
  return false
}

/** Normalizes a title: collapses whitespace, trims, unwraps stray quotes. */
export function normalizeTitle(raw: string): string {
  return (raw || "")
    .replace(/\s+/g, " ")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim()
}

/**
 * Normalizes an author into "First Last" order, dropping life-year suffixes
 * ("Dickens, Charles, 1812-1870" → "Charles Dickens") and honoring a leading
 * "active …" / "-approximately" flourish gracefully.
 */
export function normalizeAuthor(raw: string): string {
  if (!raw || !raw.trim()) return "Unknown"
  let a = raw.split(";")[0].trim()
  a = a.replace(/,\s*(active |approximately |ca\.?\s)?\d{2,4}\??(\s*(bc|b\.c\.|ad))?(-\d{0,4}\??)?\s*$/i, "").trim()
  a = a.replace(/\s*\[.*?\]\s*/g, " ").trim()
  const m = a.match(/^([^,]+),\s*(.+)$/)
  const out = m ? `${m[2].trim()} ${m[1].trim()}` : a
  return out.replace(/\s+/g, " ").trim() || "Unknown"
}

/** True when a cover URL is a Project Gutenberg auto-generated placeholder we
 *  want to replace with real artwork (or a branded card). */
export function isGutenbergCover(url: string | null | undefined): boolean {
  if (!url) return false
  return /gutenberg\.org\/.*cover/i.test(url)
}

export type QualityVerdict = {
  publishable: boolean
  issues: string[]
}

/**
 * Overall metadata quality gate. A book is held (unpublished / needs_review)
 * when its core metadata is missing or unusable after normalization.
 */
export function assessQuality(input: {
  title: string
  author: string
  description: string
  language: string
  sample: string
}): QualityVerdict {
  const issues: string[] = []
  const title = normalizeTitle(input.title)
  if (letterCount(title) < 1) issues.push("missing_title")
  if (isBoilerplateDescription(input.description)) issues.push("poor_description")
  const check = verifyLanguage(input.language, input.sample || title)
  if (!check.ok) issues.push("language_mismatch")
  return { publishable: issues.length === 0, issues }
}

// ---------------------------------------------------------------------------
// Weighted metadata quality score
// ---------------------------------------------------------------------------

export type FieldStatus = "pass" | "warn" | "fail"

export type FieldCheck = {
  field: string
  label: string
  status: FieldStatus
  /** Fraction of this field's weight earned, 0..1. */
  ratio: number
  weight: number
  /** Points earned (weight * ratio), rounded for display. */
  points: number
  reason: string
}

export type QualityReport = {
  /** Overall 0-100 metadata quality score. */
  score: number
  /** Final disposition. */
  verdict: "publish" | "review"
  /** Machine-readable hard-failure / quarantine reasons. */
  flags: string[]
  /** Human summary, e.g. "Accepted — strong metadata" or the top problems. */
  summary: string
  checks: FieldCheck[]
  scoredAt: string
}

/** Minimum score required to auto-publish (also needs zero hard flags). */
export const QUALITY_PUBLISH_THRESHOLD = 70

// Per-field weights (sum = 100).
const WEIGHTS = {
  title: 18,
  author: 12,
  language: 14,
  cover: 16,
  description: 18,
  publicationYear: 8,
  isbn: 8,
  category: 6,
} as const

const CURRENT_YEAR = new Date().getFullYear()

function mk(
  field: keyof typeof WEIGHTS,
  label: string,
  status: FieldStatus,
  ratio: number,
  reason: string,
): FieldCheck {
  const weight = WEIGHTS[field]
  return {
    field,
    label,
    status,
    ratio,
    weight,
    points: Math.round(weight * ratio),
    reason,
  }
}

export type ScoreInput = {
  title: string
  author: string
  language: string
  /** Effective cover URL (real artwork) or null when a branded card renders. */
  coverImageUrl: string | null | undefined
  description: string
  publicationYear?: number | null
  isbn?: string | null
  category?: string | null
  /** Text sample (title + start of content) used for language verification. */
  sample?: string
  /** "affiliate" books should carry a real ISBN; "in_app" (Gutenberg) needn't. */
  fulfillment?: "in_app" | "affiliate"
  /** Set when a duplicate of an existing catalog entry was detected. */
  duplicateOf?: number | null
}

/**
 * Computes a weighted 0-100 metadata quality score with a per-field report and
 * a publish/review verdict. Hard failures (missing title, boilerplate
 * description, language mismatch, generic Gutenberg placeholder cover, or a
 * detected duplicate) force "review" regardless of score.
 */
export function scoreBook(input: ScoreInput): QualityReport {
  const checks: FieldCheck[] = []
  const flags: string[] = []

  const title = normalizeTitle(input.title)
  const author = normalizeAuthor(input.author)
  const sample = input.sample || title

  // Title
  const titleLetters = letterCount(title)
  if (titleLetters < 1) {
    checks.push(mk("title", "Title", "fail", 0, "Missing title"))
    flags.push("missing_title")
  } else if (title.length < 2 || /^(unknown|untitled|n\/?a)$/i.test(title)) {
    checks.push(mk("title", "Title", "warn", 0.4, "Title looks like a placeholder"))
  } else {
    checks.push(mk("title", "Title", "pass", 1, "Present and well-formed"))
  }

  // Author
  if (!author || /^unknown$/i.test(author)) {
    checks.push(mk("author", "Author", "warn", 0.3, "Author unknown"))
  } else if (/\d/.test(author)) {
    checks.push(mk("author", "Author", "warn", 0.6, "Author contains stray digits"))
  } else {
    checks.push(mk("author", "Author", "pass", 1, "Present and normalized"))
  }

  // Language (verified against the actual script)
  const langCheck = verifyLanguage(input.language, sample)
  if (!langCheck.ok) {
    checks.push(
      mk(
        "language",
        "Language",
        "fail",
        0,
        `Tagged "${input.language}" but text is ${langCheck.language}`,
      ),
    )
    flags.push("language_mismatch")
  } else if (!input.language) {
    checks.push(mk("language", "Language", "warn", 0.5, "No language tag; defaulted"))
  } else {
    checks.push(mk("language", "Language", "pass", 1, "Consistent with text"))
  }

  // Cover — generic Gutenberg placeholder is a hard fail; missing (branded
  // card) is acceptable but not ideal; real artwork is best.
  if (isGutenbergCover(input.coverImageUrl)) {
    checks.push(
      mk("cover", "Cover image", "fail", 0, "Generic Project Gutenberg placeholder"),
    )
    flags.push("placeholder_cover")
  } else if (!input.coverImageUrl) {
    checks.push(
      mk("cover", "Cover image", "warn", 0.5, "No artwork — branded card shown"),
    )
  } else {
    checks.push(mk("cover", "Cover image", "pass", 1, "Real cover artwork"))
  }

  // Description
  if (isBoilerplateDescription(input.description)) {
    checks.push(
      mk("description", "Description", "fail", 0, "Empty or Gutenberg boilerplate"),
    )
    flags.push("poor_description")
  } else if (letterCount(input.description) < 120) {
    checks.push(mk("description", "Description", "warn", 0.6, "Very short description"))
  } else {
    checks.push(mk("description", "Description", "pass", 1, "Clean and substantial"))
  }

  // Publication year
  const year = input.publicationYear
  if (year == null) {
    checks.push(mk("publicationYear", "Publication year", "warn", 0.3, "Unknown"))
  } else if (year < -800 || year > CURRENT_YEAR + 1) {
    checks.push(
      mk("publicationYear", "Publication year", "fail", 0, `Implausible year ${year}`),
    )
  } else {
    checks.push(mk("publicationYear", "Publication year", "pass", 1, `${year}`))
  }

  // ISBN / identifier — required for affiliate (retail) books, optional for
  // public-domain in-app titles.
  const isAffiliate = input.fulfillment === "affiliate"
  if (input.isbn && isValidIsbn(input.isbn)) {
    checks.push(mk("isbn", "ISBN / identifier", "pass", 1, "Valid ISBN"))
  } else if (input.isbn) {
    checks.push(mk("isbn", "ISBN / identifier", "fail", 0, "Invalid ISBN"))
    if (isAffiliate) flags.push("invalid_isbn")
  } else if (isAffiliate) {
    checks.push(mk("isbn", "ISBN / identifier", "fail", 0, "Retail book missing ISBN"))
    flags.push("missing_isbn")
  } else {
    checks.push(
      mk("isbn", "ISBN / identifier", "warn", 0.5, "None (not required for this title)"),
    )
  }

  // Category
  const cat = (input.category || "").trim()
  if (!cat) {
    checks.push(mk("category", "Category", "warn", 0.2, "Uncategorized"))
  } else if (/^(uncategor|misc|other|general)/i.test(cat)) {
    checks.push(mk("category", "Category", "warn", 0.5, "Generic category"))
  } else {
    checks.push(mk("category", "Category", "pass", 1, cat))
  }

  // Duplicate detection is done upstream (needs the DB); reflect it here.
  if (input.duplicateOf) {
    flags.push("duplicate")
  }

  const score = Math.round(
    checks.reduce((sum, c) => sum + c.weight * c.ratio, 0),
  )

  const hardFail = flags.length > 0
  const verdict: QualityReport["verdict"] =
    !hardFail && score >= QUALITY_PUBLISH_THRESHOLD ? "publish" : "review"

  const summary = buildSummary(verdict, score, flags, checks, input.duplicateOf)

  return {
    score,
    verdict,
    flags,
    summary,
    checks,
    scoredAt: new Date().toISOString(),
  }
}

const FLAG_LABELS: Record<string, string> = {
  missing_title: "missing title",
  language_mismatch: "language mismatch",
  placeholder_cover: "placeholder cover",
  poor_description: "boilerplate/empty description",
  invalid_isbn: "invalid ISBN",
  missing_isbn: "missing ISBN",
  duplicate: "duplicate of an existing book",
}

/** Turns flag codes into a readable phrase. */
export function describeFlags(flags: string[]): string {
  return flags.map((f) => FLAG_LABELS[f] ?? f).join(", ")
}

function buildSummary(
  verdict: QualityReport["verdict"],
  score: number,
  flags: string[],
  checks: FieldCheck[],
  duplicateOf?: number | null,
): string {
  if (verdict === "publish") {
    return score >= 90
      ? `Accepted — excellent metadata (${score}/100).`
      : `Accepted — metadata meets the quality bar (${score}/100).`
  }
  if (duplicateOf) {
    return `Quarantined — appears to duplicate book #${duplicateOf}.`
  }
  if (flags.length > 0) {
    return `Quarantined (${score}/100) — ${describeFlags(flags)}.`
  }
  const weak = checks
    .filter((c) => c.status !== "pass")
    .map((c) => c.label.toLowerCase())
  return `Quarantined — below the quality threshold (${score}/100): weak ${weak
    .slice(0, 3)
    .join(", ")}.`
}

/**
 * Builds a normalized dedupe key from title + author for duplicate detection.
 * Lowercased, punctuation-stripped, whitespace-collapsed.
 */
export function dedupeKey(title: string, author: string): string {
  const norm = (s: string) =>
    (s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
  return `${norm(normalizeTitle(title))}::${norm(normalizeAuthor(author))}`
}

// ISBN validation lives in lib/affiliate; re-declared here as a light local
// check to keep this module dependency-free (pure, no imports).
function isValidIsbn(raw: string): boolean {
  const s = (raw || "").replace(/[\s-]/g, "").toUpperCase()
  if (/^\d{9}[\dX]$/.test(s)) {
    let sum = 0
    for (let i = 0; i < 10; i++) {
      const c = s[i] === "X" ? 10 : Number(s[i])
      sum += c * (10 - i)
    }
    return sum % 11 === 0
  }
  if (/^\d{13}$/.test(s)) {
    let sum = 0
    for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3)
    return sum % 10 === 0
  }
  return false
}
