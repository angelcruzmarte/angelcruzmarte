/**
 * Languages offered for reading/narrating documents. "en" is the special
 * "original" option that skips translation. OpenAI TTS voices detect the input
 * language automatically, so any translated text is narrated in that language.
 */
export const READING_LANGUAGES = [
  { code: "en", label: "English (original)", name: "English" },
  { code: "es", label: "Spanish", name: "Spanish" },
  { code: "fr", label: "French", name: "French" },
  { code: "de", label: "German", name: "German" },
  { code: "it", label: "Italian", name: "Italian" },
  { code: "pt", label: "Portuguese", name: "Portuguese" },
  { code: "nl", label: "Dutch", name: "Dutch" },
  { code: "hi", label: "Hindi", name: "Hindi" },
  { code: "zh", label: "Chinese (Simplified)", name: "Simplified Chinese" },
  { code: "ja", label: "Japanese", name: "Japanese" },
  { code: "ko", label: "Korean", name: "Korean" },
  { code: "ar", label: "Arabic", name: "Arabic" },
  { code: "ru", label: "Russian", name: "Russian" },
  { code: "tr", label: "Turkish", name: "Turkish" },
  { code: "pl", label: "Polish", name: "Polish" },
] as const

export type ReadingLanguageCode = (typeof READING_LANGUAGES)[number]["code"]

export function languageName(code: string): string {
  return READING_LANGUAGES.find((l) => l.code === code)?.name ?? "English"
}

/** Human-friendly label (without the "(original)" suffix) for a code. */
export function languageLabel(code: string): string {
  const l = READING_LANGUAGES.find((l) => l.code === code)
  return l?.name ?? code.toUpperCase()
}

/**
 * Normalizes a BCP-47 tag (e.g. "en-US", "pt-BR", "ZH-Hans") to the primary
 * two-letter subtag we key voices/translation on (e.g. "en", "pt", "zh").
 */
export function normalizeLang(code: string | null | undefined): string {
  if (!code) return "en"
  return code.trim().toLowerCase().split(/[-_]/)[0]
}

/** Whether we can read/narrate the given (normalized) language. */
export function isSupportedLang(code: string | null | undefined): boolean {
  const c = normalizeLang(code)
  return READING_LANGUAGES.some((l) => l.code === c)
}
