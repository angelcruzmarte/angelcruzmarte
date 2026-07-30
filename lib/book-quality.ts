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
