/**
 * Premium voice library offered to subscribers. Each entry is a *persona* — a
 * distinct character with its own name, portrait, and delivery — layered on top
 * of one of OpenAI's real TTS engines.
 *
 * - `engine` is the underlying OpenAI voice id actually sent to the TTS API.
 *   When omitted, it defaults to the persona `id` (the 13 "Signature" voices).
 * - `instructions` steer delivery (accent, tone, emotion, pacing) and are only
 *   honored by the gpt-4o-mini-tts model, so any persona with instructions is
 *   synthesized exclusively with that model.
 * - `legacy` marks Signature voices supported by the older tts-1 / tts-1-hd
 *   models, which are used as rate-limit fallbacks for instruction-free voices.
 * - `category` groups personas in the picker.
 */
export type PremiumVoice = {
  id: string
  name: string
  tagline: string
  label: string
  gender: "male" | "female" | "neutral"
  image: string
  category: string
  /**
   * TTS provider. Defaults to "openai". "elevenlabs" personas are synthesized
   * with the ElevenLabs API (ultra-realistic) and require ELEVENLABS_API_KEY.
   */
  provider?: "openai" | "elevenlabs"
  /**
   * Underlying engine id sent to the provider. For OpenAI this is the voice id
   * (defaults to `id`); for ElevenLabs this is the ElevenLabs `voice_id`.
   */
  engine?: string
  /** Style-steering instructions (gpt-4o-mini-tts only). */
  instructions?: string
  /** Accent/origin label shown as a chip, e.g. "British". */
  accent?: string
  /** Supported by legacy tts-1 / tts-1-hd models. */
  legacy?: boolean
}

export const PREMIUM_VOICES: PremiumVoice[] = [
  // --- Signature (the raw OpenAI engines, no steering) ----------------------
  { id: "alloy", name: "Alloy", tagline: "Balanced Narrator", label: "Alloy — Balanced", gender: "neutral", image: "/voices/alloy.png", category: "Signature", legacy: true },
  { id: "nova", name: "Nova", tagline: "Warm Storyteller", label: "Nova — Warm", gender: "female", image: "/voices/nova.png", category: "Signature", legacy: true },
  { id: "shimmer", name: "Shimmer", tagline: "Bright & Upbeat", label: "Shimmer — Bright", gender: "female", image: "/voices/shimmer.png", category: "Signature", legacy: true },
  { id: "echo", name: "Echo", tagline: "Calm & Soothing", label: "Echo — Calm", gender: "male", image: "/voices/echo.png", category: "Signature", legacy: true },
  { id: "onyx", name: "Onyx", tagline: "Deep & Authoritative", label: "Onyx — Deep", gender: "male", image: "/voices/onyx.png", category: "Signature", legacy: true },
  { id: "fable", name: "Fable", tagline: "Expressive Performer", label: "Fable — Expressive", gender: "neutral", image: "/voices/fable.png", category: "Signature", legacy: true },
  { id: "ash", name: "Ash", tagline: "Confident & Crisp", label: "Ash — Confident", gender: "male", image: "/voices/ash.png", category: "Signature", legacy: true },
  { id: "coral", name: "Coral", tagline: "Friendly & Bright", label: "Coral — Friendly", gender: "female", image: "/voices/coral.png", category: "Signature", legacy: true },
  { id: "sage", name: "Sage", tagline: "Wise & Measured", label: "Sage — Wise", gender: "female", image: "/voices/sage.png", category: "Signature", legacy: true },
  { id: "ballad", name: "Ballad", tagline: "Smooth & Emotive", label: "Ballad — Smooth", gender: "male", image: "/voices/ballad.png", category: "Signature" },
  { id: "verse", name: "Verse", tagline: "Poetic & Dynamic", label: "Verse — Poetic", gender: "male", image: "/voices/verse.png", category: "Signature" },
  { id: "marin", name: "Marin", tagline: "Gentle & Clear", label: "Marin — Gentle", gender: "female", image: "/voices/marin.png", category: "Signature" },
  { id: "cedar", name: "Cedar", tagline: "Grounded & Rich", label: "Cedar — Grounded", gender: "male", image: "/voices/cedar.png", category: "Signature" },

  // --- Accents & International ----------------------------------------------
  { id: "aria-british", name: "Aria", tagline: "Refined British", label: "Aria — British", gender: "female", image: "/voices/aria-british.png", category: "Accents & International", accent: "British", engine: "shimmer", instructions: "Speak with a polished British RP accent. Warm, articulate, and elegant, with crisp diction." },
  { id: "jasper-british", name: "Jasper", tagline: "British Gentleman", label: "Jasper — British", gender: "male", image: "/voices/jasper-british.png", category: "Accents & International", accent: "British", engine: "onyx", instructions: "Speak with a refined, distinguished British accent. Calm, confident, and gentlemanly." },
  { id: "priya-indian", name: "Priya", tagline: "Indian English", label: "Priya — Indian English", gender: "female", image: "/voices/priya-indian.png", category: "Accents & International", accent: "Indian", engine: "nova", instructions: "Speak English with a gentle Indian English accent. Clear, friendly, and welcoming." },
  { id: "mateo-spanish", name: "Mateo", tagline: "Spanish Accent", label: "Mateo — Spanish", gender: "male", image: "/voices/mateo-spanish.png", category: "Accents & International", accent: "Spanish", engine: "ash", instructions: "Speak English with a light Spanish accent. Warm, expressive, and charming." },
  { id: "elise-french", name: "Élise", tagline: "French Accent", label: "Élise — French", gender: "female", image: "/voices/elise-french.png", category: "Accents & International", accent: "French", engine: "coral", instructions: "Speak English with a soft French accent. Elegant, smooth, and sophisticated." },
  { id: "liam-australian", name: "Liam", tagline: "Aussie & Relaxed", label: "Liam — Australian", gender: "male", image: "/voices/liam-australian.png", category: "Accents & International", accent: "Australian", engine: "fable", instructions: "Speak with a friendly Australian accent. Relaxed, upbeat, and easygoing." },
  { id: "amara-african", name: "Amara", tagline: "Warm West African", label: "Amara — African English", gender: "female", image: "/voices/amara-african.png", category: "Accents & International", accent: "African", engine: "sage", instructions: "Speak with a warm West African English accent. Rich, measured, and reassuring." },
  { id: "sofia-italian", name: "Sofia", tagline: "Italian Accent", label: "Sofia — Italian", gender: "female", image: "/voices/sofia-italian.png", category: "Accents & International", accent: "Italian", engine: "coral", instructions: "Speak English with a warm Italian accent. Expressive, melodic, and passionate." },
  { id: "klaus-german", name: "Klaus", tagline: "German Accent", label: "Klaus — German", gender: "male", image: "/voices/klaus-german.png", category: "Accents & International", accent: "German", engine: "onyx", instructions: "Speak English with a crisp German accent. Precise, composed, and confident." },
  { id: "yuki-japanese", name: "Yuki", tagline: "Japanese English", label: "Yuki — Japanese English", gender: "female", image: "/voices/yuki-japanese.png", category: "Accents & International", accent: "Japanese", engine: "shimmer", instructions: "Speak English with a gentle Japanese accent. Polite, soft, and friendly." },
  { id: "diego-mexican", name: "Diego", tagline: "Latin American Spanish", label: "Diego — Mexican Spanish", gender: "male", image: "/voices/diego-mexican.png", category: "Accents & International", accent: "Mexican", engine: "verse", instructions: "Speak English with a warm Latin American Spanish accent. Charismatic, friendly, and lively." },
  { id: "ingrid-nordic", name: "Ingrid", tagline: "Scandinavian", label: "Ingrid — Scandinavian", gender: "female", image: "/voices/ingrid-nordic.png", category: "Accents & International", accent: "Nordic", engine: "marin", instructions: "Speak English with a light Scandinavian accent. Calm, clear, and serene." },
  { id: "sean-irish", name: "Sean", tagline: "Irish Charm", label: "Sean — Irish", gender: "male", image: "/voices/sean-irish.png", category: "Accents & International", accent: "Irish", engine: "ballad", instructions: "Speak English with a lilting Irish accent. Warm, cheerful, and charming." },
  { id: "nadia-arabic", name: "Nadia", tagline: "Middle Eastern English", label: "Nadia — Middle Eastern English", gender: "female", image: "/voices/nadia-arabic.png", category: "Accents & International", accent: "Arabic", engine: "nova", instructions: "Speak English with a soft Middle Eastern accent. Elegant, warm, and poised." },
  { id: "rosa-brazilian", name: "Rosa", tagline: "Brazilian English", label: "Rosa — Brazilian English", gender: "female", image: "/voices/rosa-brazilian.png", category: "Accents & International", accent: "Brazilian", engine: "coral", instructions: "Speak English with a vibrant Brazilian Portuguese accent. Warm, joyful, and expressive." },
  { id: "dmitri-russian", name: "Dmitri", tagline: "Russian Accent", label: "Dmitri — Russian", gender: "male", image: "/voices/dmitri-russian.png", category: "Accents & International", accent: "Russian", engine: "cedar", instructions: "Speak English with a deep Russian accent. Strong, measured, and thoughtful." },
  { id: "mei-chinese", name: "Mei", tagline: "Chinese English", label: "Mei — Chinese English", gender: "female", image: "/voices/mei-chinese.png", category: "Accents & International", accent: "Chinese", engine: "sage", instructions: "Speak English with a gentle Mandarin Chinese accent. Clear, graceful, and calm." },

  // --- Characters & Styles ---------------------------------------------------
  { id: "rex-trailer", name: "Rex", tagline: "Movie Trailer", label: "Rex — Trailer", gender: "male", image: "/voices/rex-trailer.png", category: "Characters & Styles", engine: "onyx", instructions: "Speak like an epic movie-trailer narrator. Deep, dramatic, and powerful, with slow, weighty pacing." },
  { id: "pixie-kids", name: "Pixie", tagline: "Playful Storytime", label: "Pixie — Kids", gender: "female", image: "/voices/pixie-kids.png", category: "Characters & Styles", engine: "shimmer", instructions: "Speak in a bright, playful, animated storytelling voice for young children. Cheerful and full of wonder." },
  { id: "silas-noir", name: "Silas", tagline: "Mysterious & Noir", label: "Silas — Noir", gender: "male", image: "/voices/silas-noir.png", category: "Characters & Styles", engine: "ballad", instructions: "Speak in a low, mysterious, suspenseful noir tone. Slow, intimate, and full of intrigue." },
  { id: "sunny-podcast", name: "Sunny", tagline: "Energetic Host", label: "Sunny — Podcast", gender: "female", image: "/voices/sunny-podcast.png", category: "Characters & Styles", engine: "coral", instructions: "Speak like an upbeat podcast host. Energetic, conversational, and engaging." },
  { id: "whisper-asmr", name: "Wren", tagline: "Soft ASMR", label: "Wren — ASMR", gender: "male", image: "/voices/whisper-asmr.png", category: "Characters & Styles", engine: "echo", instructions: "Speak very softly and slowly, in a soothing, calming near-whisper. Gentle and relaxing." },
  { id: "zen-meditation", name: "Zen", tagline: "Meditation Guide", label: "Zen — Meditation", gender: "female", image: "/voices/zen-meditation.png", category: "Characters & Styles", engine: "sage", instructions: "Speak slowly and serenely, like a mindfulness and meditation guide. Peaceful and grounding." },
  { id: "gramps-bedtime", name: "Gramps", tagline: "Cozy Bedtime", label: "Gramps — Bedtime", gender: "male", image: "/voices/gramps-bedtime.png", category: "Characters & Styles", engine: "cedar", instructions: "Speak like a kind, warm grandfather telling a cozy bedtime story. Slow, gentle, and loving." },
  { id: "bella-bff", name: "Bella", tagline: "Bubbly Best Friend", label: "Bella — Bubbly", gender: "female", image: "/voices/bella-bff.png", category: "Characters & Styles", engine: "shimmer", instructions: "Speak like a bubbly, friendly best friend. Casual, warm, and full of personality." },
  { id: "blaze-sports", name: "Blaze", tagline: "Sports Announcer", label: "Blaze — Sports", gender: "male", image: "/voices/blaze-sports.png", category: "Characters & Styles", engine: "ash", instructions: "Speak like a high-energy sports announcer calling a live game. Fast, loud, and thrilling." },
  { id: "luna-dreamy", name: "Luna", tagline: "Dreamy Poet", label: "Luna — Dreamy", gender: "female", image: "/voices/luna-dreamy.png", category: "Characters & Styles", engine: "marin", instructions: "Speak in a soft, dreamy, poetic voice. Wistful, gentle, and full of wonder." },
  { id: "grim-villain", name: "Grim", tagline: "Classic Villain", label: "Grim — Villain", gender: "male", image: "/voices/grim-villain.png", category: "Characters & Styles", engine: "onyx", instructions: "Speak like a theatrical villain. Sinister, smooth, and menacing, with dramatic pauses." },
  { id: "coco-comedy", name: "Coco", tagline: "Stand-up Comic", label: "Coco — Comedy", gender: "female", image: "/voices/coco-comedy.png", category: "Characters & Styles", engine: "coral", instructions: "Speak like a witty stand-up comedian. Playful, animated, and full of comedic timing." },
  { id: "ghost-horror", name: "Ghost", tagline: "Horror Narrator", label: "Ghost — Horror", gender: "male", image: "/voices/ghost-horror.png", category: "Characters & Styles", engine: "ballad", instructions: "Speak like a chilling horror-story narrator. Low, eerie, and suspenseful, building dread." },
  { id: "pep-coach", name: "Pep", tagline: "Hype Coach", label: "Pep — Motivational", gender: "male", image: "/voices/pep-coach.png", category: "Characters & Styles", engine: "ash", instructions: "Speak like an energetic motivational coach. Bold, uplifting, and full of drive." },
  { id: "hunter-wild", name: "Hunter", tagline: "Wilderness Guide", label: "Hunter — Adventure", gender: "male", image: "/voices/hunter-wild.png", category: "Characters & Styles", engine: "cedar", instructions: "Speak like a rugged wilderness adventure guide. Warm, grounded, and full of quiet excitement." },

  // --- Professional ----------------------------------------------------------
  { id: "clara-news", name: "Clara", tagline: "News Anchor", label: "Clara — News", gender: "female", image: "/voices/clara-news.png", category: "Professional", engine: "nova", instructions: "Speak like a professional news anchor. Clear, neutral, authoritative, and well-paced." },
  { id: "victor-corporate", name: "Victor", tagline: "Corporate Presenter", label: "Victor — Corporate", gender: "male", image: "/voices/victor-corporate.png", category: "Professional", engine: "ash", instructions: "Speak like a confident corporate presenter. Crisp, polished, and professional." },
  { id: "marcus-doc", name: "Marcus", tagline: "Documentary Narrator", label: "Marcus — Documentary", gender: "male", image: "/voices/marcus-doc.png", category: "Professional", engine: "verse", instructions: "Speak like a thoughtful documentary narrator. Measured, engaging, and richly descriptive." },
  { id: "isabel-audiobook", name: "Isabel", tagline: "Audiobook Romance", label: "Isabel — Audiobook", gender: "female", image: "/voices/isabel-audiobook.png", category: "Professional", engine: "marin", instructions: "Speak in a warm, intimate, expressive tone suited to romance audiobooks. Emotive and immersive." },
  { id: "theo-tutor", name: "Theo", tagline: "Friendly Tutor", label: "Theo — Tutor", gender: "male", image: "/voices/theo-tutor.png", category: "Professional", engine: "fable", instructions: "Speak like a friendly, patient tutor explaining a lesson. Clear, encouraging, and easy to follow." },
  { id: "hana-science", name: "Dr. Hana", tagline: "Science Explainer", label: "Dr. Hana — Science", gender: "female", image: "/voices/hana-science.png", category: "Professional", engine: "sage", instructions: "Speak like an engaging science communicator. Curious, clear, and enthusiastic about ideas." },
  { id: "grant-legal", name: "Grant", tagline: "Formal & Precise", label: "Grant — Formal", gender: "male", image: "/voices/grant-legal.png", category: "Professional", engine: "onyx", instructions: "Speak in a formal, precise, authoritative tone suited to legal and official text. Deliberate and clear." },
  { id: "reed-radio", name: "Reed", tagline: "Radio DJ", label: "Reed — Radio", gender: "male", image: "/voices/reed-radio.png", category: "Professional", engine: "verse", instructions: "Speak like a smooth late-night radio DJ. Warm, cool, and effortlessly charismatic." },
  { id: "ava-assistant", name: "Ava", tagline: "Virtual Assistant", label: "Ava — Assistant", gender: "female", image: "/voices/ava-assistant.png", category: "Professional", engine: "shimmer", instructions: "Speak like a helpful modern virtual assistant. Friendly, clear, neutral, and efficient." },

  // --- Calm & Wellness -------------------------------------------------------
  { id: "serena-sleep", name: "Serena", tagline: "Sleep Stories", label: "Serena — Sleep", gender: "female", image: "/voices/serena-sleep.png", category: "Calm & Wellness", engine: "marin", instructions: "Speak very softly and slowly, like a soothing sleep-story narrator. Dreamy, calming, and lulling." },
  { id: "kai-yoga", name: "Kai", tagline: "Yoga Guide", label: "Kai — Yoga", gender: "male", image: "/voices/kai-yoga.png", category: "Calm & Wellness", engine: "echo", instructions: "Speak calmly and steadily, like a yoga and breathwork guide. Grounded, gentle, and reassuring." },
  { id: "willow-nature", name: "Willow", tagline: "Nature Calm", label: "Willow — Nature", gender: "female", image: "/voices/willow-nature.png", category: "Calm & Wellness", engine: "sage", instructions: "Speak in a warm, peaceful voice, like a nature and mindfulness narrator. Soft, natural, and serene." },

  // --- Ultra Realistic (ElevenLabs) ------------------------------------------
  // Human-grade neural voices synthesized via the ElevenLabs API. `engine` is
  // the ElevenLabs voice_id; delivery is governed by the voice itself, so these
  // carry no style instructions.
  { id: "el-brian", name: "Brian", tagline: "Deep Narrator", label: "Brian — Deep Narrator", gender: "male", image: "/voices/el-brian.png", category: "Ultra Realistic", provider: "elevenlabs", engine: "nPczCjzI2devNBz1zQrb" },
  { id: "el-sarah", name: "Sarah", tagline: "Warm & Soft", label: "Sarah — Warm", gender: "female", image: "/voices/el-sarah.png", category: "Ultra Realistic", provider: "elevenlabs", engine: "EXAVITQu4vr4xnSDxMaL" },
  { id: "el-george", name: "George", tagline: "British Narrator", label: "George — British", gender: "male", image: "/voices/el-george.png", category: "Ultra Realistic", provider: "elevenlabs", accent: "British", engine: "JBFqnCBsd6RMkjVDRZzb" },
  { id: "el-laura", name: "Laura", tagline: "Upbeat & Social", label: "Laura — Upbeat", gender: "female", image: "/voices/el-laura.png", category: "Ultra Realistic", provider: "elevenlabs", engine: "FGY2WhTYpPnrIDTdsKH5" },
  { id: "el-charlie", name: "Charlie", tagline: "Aussie & Natural", label: "Charlie — Australian", gender: "male", image: "/voices/el-charlie.png", category: "Ultra Realistic", provider: "elevenlabs", accent: "Australian", engine: "IKne3meq5aSn9XLyUdCD" },
  { id: "el-alice", name: "Alice", tagline: "Clear British", label: "Alice — British", gender: "female", image: "/voices/el-alice.png", category: "Ultra Realistic", provider: "elevenlabs", accent: "British", engine: "Xb7hH8MSUJpSbSDYk0k2" },
  { id: "el-roger", name: "Roger", tagline: "Confident", label: "Roger — Confident", gender: "male", image: "/voices/el-roger.png", category: "Ultra Realistic", provider: "elevenlabs", engine: "CwhRBWXzGAHq8TQ4Fs17" },
  { id: "el-matilda", name: "Matilda", tagline: "Warm Professional", label: "Matilda — Professional", gender: "female", image: "/voices/el-matilda.png", category: "Ultra Realistic", provider: "elevenlabs", engine: "XrExE9yKIg1WjnnlVkGX" },
  { id: "el-daniel", name: "Daniel", tagline: "News Anchor", label: "Daniel — News", gender: "male", image: "/voices/el-daniel.png", category: "Ultra Realistic", provider: "elevenlabs", accent: "British", engine: "onwK4e9ZLuTAKqWW03F9" },
  { id: "el-lily", name: "Lily", tagline: "Velvety & Warm", label: "Lily — Velvety", gender: "female", image: "/voices/el-lily.png", category: "Ultra Realistic", provider: "elevenlabs", accent: "British", engine: "pFZP5JQG7iQjIQuC4Bku" },
  { id: "el-will", name: "Will", tagline: "Chill & Friendly", label: "Will — Chill", gender: "male", image: "/voices/el-will.png", category: "Ultra Realistic", provider: "elevenlabs", engine: "bIHbv24MWmeRgasZH58o" },
  { id: "el-jessica", name: "Jessica", tagline: "Young & Playful", label: "Jessica — Playful", gender: "female", image: "/voices/el-jessica.png", category: "Ultra Realistic", provider: "elevenlabs", engine: "cgSgspJ2msm6clMCkdW9" },
  { id: "el-eric", name: "Eric", tagline: "Smooth & Classy", label: "Eric — Smooth", gender: "male", image: "/voices/el-eric.png", category: "Ultra Realistic", provider: "elevenlabs", engine: "cjVigY5qzO86Huf0OWal" },
  { id: "el-river", name: "River", tagline: "Calm & Neutral", label: "River — Neutral", gender: "neutral", image: "/voices/el-river.png", category: "Ultra Realistic", provider: "elevenlabs", engine: "SAz9YHcvj6GT2YYXdXww" },
  { id: "el-chris", name: "Chris", tagline: "Casual & Natural", label: "Chris — Casual", gender: "male", image: "/voices/el-chris.png", category: "Ultra Realistic", provider: "elevenlabs", engine: "iP95p4xoKVk53GoZ742B" },
  { id: "el-leo", name: "Leo", tagline: "Young Energetic", label: "Leo — Energetic", gender: "male", image: "/voices/el-leo.png", category: "Ultra Realistic", provider: "elevenlabs", engine: "TX3LPaxmHKxFdv7VOQHJ" },
  { id: "el-callum", name: "Callum", tagline: "Intense & Cinematic", label: "Callum — Cinematic", gender: "male", image: "/voices/el-callum.png", category: "Ultra Realistic", provider: "elevenlabs", engine: "N2lVS1w4EtoT3dr4eOWO" },
  { id: "el-bill", name: "Bill", tagline: "Trustworthy Elder", label: "Bill — Trustworthy", gender: "male", image: "/voices/el-bill.png", category: "Ultra Realistic", provider: "elevenlabs", engine: "pqHfZKP75CvOlQylNhV4" },
]

export type PremiumVoiceId = string

/** Voice ids supported by the legacy tts-1 / tts-1-hd models. */
export const LEGACY_VOICE_IDS = new Set<string>(
  PREMIUM_VOICES.filter((v) => v.legacy).map((v) => v.id),
)

/** The underlying OpenAI engine id used to synthesize a persona. */
export function voiceEngine(v: PremiumVoice): string {
  return v.engine ?? v.id
}

/** Look up a premium voice persona by id. */
export function getPremiumVoice(id: string): PremiumVoice | undefined {
  return PREMIUM_VOICES.find((v) => v.id === id)
}

/**
 * A small curated set of premium voices that non-subscribers can use for free
 * as a trial/preview, so they can experience the premium narration quality
 * before subscribing. Two ultra-realistic (ElevenLabs) voices plus one
 * signature OpenAI voice give a strong, varied taste of the paid experience.
 */
export const FREE_PREVIEW_VOICE_IDS = new Set<string>([
  "el-sarah", // ultra-realistic female
  "el-brian", // ultra-realistic male
  "nova", // signature female
])

/** True when a voice is usable for free (non-subscriber) preview. */
export function isFreePreviewVoice(id: string): boolean {
  return FREE_PREVIEW_VOICE_IDS.has(id)
}

/** The default preview voice a free user should start with. */
export const DEFAULT_FREE_VOICE_ID = "el-sarah"

/** Ordered list of category names as they should appear in the picker. */
export const VOICE_CATEGORIES = [
  "Ultra Realistic",
  "Signature",
  "Accents & International",
  "Characters & Styles",
  "Professional",
  "Calm & Wellness",
] as const

/** Personas grouped by category, preserving definition order within a group. */
export function groupedVoices(): { category: string; voices: PremiumVoice[] }[] {
  return VOICE_CATEGORIES.map((category) => ({
    category,
    voices: PREMIUM_VOICES.filter((v) => v.category === category),
  })).filter((g) => g.voices.length > 0)
}

// ---------------------------------------------------------------------------
// Device (Web Speech API) voice helpers: present a friendly, human-first list
// by filtering out robotic/novelty voices, cleaning up names, and grouping by
// language.
// ---------------------------------------------------------------------------

// Classic robotic / novelty TTS voices (macOS/iOS/Windows) that do not sound
// human. These are excluded so users only see natural-sounding options.
const NOVELTY_VOICES = new Set([
  "albert",
  "bad news",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "cellos",
  "deranged",
  "good news",
  "hysterical",
  "jester",
  "organ",
  "pipe organ",
  "superstar",
  "trinoids",
  "whisper",
  "wobble",
  "zarvox",
  "fred",
  "junior",
  "ralph",
  "kathy",
  "agnes",
  "princess",
  "bruce",
  "grandpa",
  "grandma",
])

/** Returns true when a voice name is a natural, human-like voice. */
export function isHumanLikeVoice(name: string): boolean {
  const n = (name || "").trim().toLowerCase()
  if (!n) return false
  if (NOVELTY_VOICES.has(n)) return false
  if (n.includes("eloquence") || n.includes("novelty")) return false
  return true
}

// High-quality, natural-sounding named voices bundled by the major platforms
// (Apple, Google, Microsoft). Preferring these gives the clearest device audio.
const HIGH_QUALITY_NAMES = [
  "samantha",
  "ava",
  "siri",
  "allison",
  "susan",
  "zoe",
  "evan",
  "nathan",
  "tom",
  "aaron",
  "serena",
  "daniel",
  "karen",
  "moira",
  "tessa",
  "google",
  "natural",
  "neural",
]

/**
 * Scores a device (Web Speech API) voice by expected clarity/quality so we can
 * default to the best-sounding option. Higher is better. We reward voices the
 * OS labels as "enhanced"/"premium", known natural named voices, and network
 * (cloud) voices, which are typically far clearer than compact local ones.
 */
export function voiceQualityScore(voice: {
  name: string
  localService?: boolean
}): number {
  const n = (voice.name || "").toLowerCase()
  let score = 0
  if (/\b(enhanced|premium|neural|natural)\b/.test(n)) score += 5
  if (HIGH_QUALITY_NAMES.some((k) => n.includes(k))) score += 3
  // Network/cloud voices tend to sound clearer than compact on-device ones.
  if (voice.localService === false) score += 2
  if (n.includes("compact")) score -= 2
  return score
}

/** Base language code, e.g. "en-US" -> "en". */
export function baseLang(lang: string): string {
  return (lang || "").split("-")[0].toLowerCase()
}

/** Human-readable language label, e.g. "en" -> "English". */
export function languageLabel(lang: string): string {
  if (!lang) return "Unknown"
  try {
    const dn = new Intl.DisplayNames(undefined, { type: "language" })
    return dn.of(lang) || lang
  } catch {
    return lang
  }
}

/**
 * Derives a clean, readable voice name. Some platforms expose bundle-id style
 * names (e.g. "com.apple.ttsbundle.Samantha-compact"); this strips the noise
 * and falls back to the language label when nothing readable remains.
 */
export function friendlyVoiceName(name: string, lang: string): string {
  let n = (name || "").trim()

  // Strip bundle-id style identifiers like "com.apple.ttsbundle.Samantha-compact".
  if (n.includes(".") || n.toLowerCase().startsWith("com")) {
    const parts = n.split(".")
    n = parts[parts.length - 1] || ""
  }

  n = n
    .replace(/[-_]+/g, " ")
    .replace(/\b(compact|premium|enhanced|default|siri|voice)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()

  // Title-case whatever is left.
  n = n
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .trim()

  return n || languageLabel(lang)
}
