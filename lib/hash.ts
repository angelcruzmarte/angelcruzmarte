/**
 * Fast, deterministic content hash (FNV-1a, 32-bit) used to key cached
 * translations by their SOURCE text. Runs identically on the server and in the
 * browser, so the client can match a section's source text to a cached row
 * without a round trip. Not cryptographic — only collision-resistant enough to
 * key a per-document cache, and the length suffix makes accidental collisions
 * vanishingly unlikely for the short passages we translate.
 */
export function hashText(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, "0") + input.length.toString(36)
}

/** Canonical cache key for a narration section: hash of its trimmed source. */
export function sectionHash(source: string): string {
  return hashText((source ?? "").trim())
}
