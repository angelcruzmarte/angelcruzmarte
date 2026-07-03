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
