// Server-side objectionable-content screening applied BEFORE user-generated
// content (book reviews) is stored. This satisfies Apple Guideline 1.2's
// requirement to "filter objectionable material before it is posted."
//
// Kept intentionally conservative: it matches a normalized copy of the text on
// whole words only, so ordinary words that merely CONTAIN a short banned
// substring (e.g. "grape" / "class") are not flagged. Normalization folds
// common leetspeak substitutions and collapses character repetition so trivial
// evasions ("f\u00fcck", "fuuuck", "f4ggot") are still caught.
//
// This is a first-pass automated gate; anything that slips through is still
// reportable by users and actionable by admins through the existing moderation
// system. It is not a replacement for human moderation.

// High-severity slurs and explicit terms. Ambiguous words common in legitimate
// literary discussion (e.g. standalone "rape", "bastard") are deliberately
// omitted to avoid false positives in book reviews.
const BANNED_TERMS = [
  "nigger",
  "nigga",
  "faggot",
  "chink",
  "spic",
  "kike",
  "gook",
  "wetback",
  "tranny",
  "retard",
  "cunt",
  "pussy",
  "whore",
  "slut",
  "fuck",
  "motherfucker",
  "bitch",
  "asshole",
]

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics (fück -> fuck)
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
}

// A banned term becomes a whole-word pattern where each letter may repeat, so
// stretched spellings ("fuuuck", "asssshole") are caught without a global
// character-collapse pass that would corrupt other words. Word boundaries keep
// matching to whole words, so "class" never matches "ass".
const BANNED_PATTERNS = BANNED_TERMS.map(
  (term) =>
    new RegExp(`\\b${term.split("").map((c) => `${c}+`).join("")}\\b`),
)

/**
 * Returns `{ ok: true }` when the text is acceptable, or `{ ok: false, reason }`
 * with a user-facing message when it contains disallowed language.
 */
export function screenContent(text: string): { ok: boolean; reason?: string } {
  const normalized = normalize(text)
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        ok: false,
        reason:
          "Your review contains language that isn't allowed. Please revise it and try again.",
      }
    }
  }
  return { ok: true }
}
