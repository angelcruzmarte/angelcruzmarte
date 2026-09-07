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

// Profanity roots that commonly take inflectional suffixes and never form an
// innocent English word when suffixed. For these we allow a trailing suffix so
// "fucking"/"fucked"/"bitches"/"assholes"/"retarded" are caught, not just the
// bare root. Ethnicity/identity slurs are deliberately NOT in this set: a
// blanket suffix there would create false positives on legitimate words like
// "spicy" or "chinks (in the armor)", so those stay whole-word only.
const INFLECTABLE = new Set([
  "fuck",
  "motherfucker",
  "bitch",
  "cunt",
  "asshole",
  "whore",
  "slut",
  "faggot",
  "retard",
])
const INFLECTION_SUFFIX = "(?:ing|ed|er|ers|in|s|es|y|ah)?"

// A banned term becomes a whole-word pattern where each letter may repeat, so
// stretched spellings ("fuuuck", "asssshole") are caught without a global
// character-collapse pass that would corrupt other words. Word boundaries keep
// matching to whole words, so "class" never matches "ass".
const BANNED_PATTERNS = BANNED_TERMS.map((term) => {
  const body = term.split("").map((c) => `${c}+`).join("")
  const tail = INFLECTABLE.has(term) ? INFLECTION_SUFFIX : ""
  return new RegExp(`\\b${body}${tail}\\b`)
})

// Direct threats of violence and targeted self-harm harassment. These are
// PHRASE patterns (a violent verb aimed at "you"/"yourself"), not bare words,
// so ordinary discussion of violence in a book's plot stays allowed:
// "a killer thriller", "this twist killed me", "the murder was shocking" all
// pass, while "kill yourself" / "i'll murder you" are blocked.
const THREAT_PATTERNS: RegExp[] = [
  /\bk+y+s+\b/, // "kys"
  /\b(kill|murder|rape|stab|shoot|strangle|behead|lynch) +(you|u|yourself|urself|him|her|them)\b/,
  /\b(go +)?(die|rot) +in +(a +fire|hell)\b/,
  /\bi('?ll| +will| +wanna| +want +to| +am +going +to|'?m +gonna| +gonna) +(find|hurt|kill|murder|beat|rape|stab) +(you|u)\b/,
  /\byou +should +(die|kill +yourself)\b/,
  /\bhope +you +die\b/,
]

// Demeaning words used to insult a PERSON. Matched only when aimed at the
// reader/another person (see HARASSMENT_PATTERNS), never on their own — this is
// what lets legitimate book criticism through: "this book is garbage/trash",
// "the plot is stupid", "a disgusting villain" all stay allowed, while
// "you are garbage", "you're a disgusting idiot" are rejected.
const INSULT_WORDS = [
  "idiot",
  "idiots",
  "moron",
  "morons",
  "imbecile",
  "imbeciles",
  "stupid",
  "dumb",
  "dumbass",
  "dumbasses",
  "jackass",
  "loser",
  "losers",
  "pathetic",
  "worthless",
  "useless",
  "disgusting",
  "repulsive",
  "revolting",
  "ugly",
  "hideous",
  "freak",
  "freaks",
  "creep",
  "creepy",
  "scum",
  "scumbag",
  "trash",
  "garbage",
  "filth",
  "vermin",
  "clown",
  "clowns",
  "coward",
  "cowards",
  "nobody",
  "nothing",
  "waste",
  "disgrace",
  "embarrassment",
  "failure",
  "dimwit",
  "nitwit",
  "brainless",
  "spineless",
  "despicable",
  "vile",
  "worst",
]
const INSULT = INSULT_WORDS.join("|")

// Targeted harassment / abuse aimed at a person. These are PHRASE patterns
// anchored on second-person address ("you"/"you're") or "nobody/everyone …
// you", so ordinary book/plot criticism is unaffected. This is what catches
// insults that contain no slur or profanity, e.g.
// "You are a disgusting idiot and nobody wants you here."
const HARASSMENT_PATTERNS: RegExp[] = [
  // "you are / you're / you r (a|an|such a|so|the) <insult>"
  new RegExp(
    `\\byou(?:'?re| +are| +r) +(?:a +|an +|such +a +|so +|the +|a +bunch +of +)?(?:${INSULT})\\b`,
  ),
  // direct address stacking two demeaning words: "you stupid idiot",
  // "you disgusting freak"
  new RegExp(`\\byou +(?:${INSULT}) +(?:${INSULT})\\b`),
  // "nobody / no one / everyone (wants|likes|needs|loves|cares about) you"
  /\b(?:nobody|no +one|noone|everyone|everybody) +(?:wants|likes|needs|loves|cares +about|misses) +you\b/,
  // "everyone hates/despises you"
  /\b(?:everyone|everybody|nobody|no +one) +(?:hates|despises|detests) +you\b/,
  // dismissive "you don't belong (here)" / "you should be ashamed"
  /\byou +(?:do +not|don'?t) +belong\b/,
  /\byou +should +be +ashamed\b/,
  // "you suck" (targeted; book criticism uses "this/it sucks", not "you suck")
  /\byou +suck\b/,
]

/**
 * Returns `{ ok: true }` when the text is acceptable, or `{ ok: false, reason }`
 * with a user-facing message when it contains disallowed content. Screens for
 * slurs/abusive language, direct threats, and targeted harassment/abuse.
 */
export function screenContent(text: string): { ok: boolean; reason?: string } {
  const normalized = normalize(text)
  const blocked =
    BANNED_PATTERNS.some((p) => p.test(normalized)) ||
    THREAT_PATTERNS.some((p) => p.test(normalized)) ||
    HARASSMENT_PATTERNS.some((p) => p.test(normalized))
  if (blocked) {
    return {
      ok: false,
      reason:
        "This review contains inappropriate or offensive language. Please revise your review before posting.",
    }
  }
  return { ok: true }
}
