/**
 * Splits text into chunks no larger than `maxChars`, breaking on sentence
 * boundaries where possible (falling back to word boundaries for very long
 * sentences). Used to feed the server TTS model, which accepts a limited
 * number of characters per request.
 */
export function chunkText(text: string, maxChars = 3500): string[] {
  const clean = text.replace(/\s+/g, " ").trim()
  if (!clean) return []
  if (clean.length <= maxChars) return [clean]

  // Split into sentences, keeping their trailing punctuation.
  const sentences = clean.match(/[^.!?]+[.!?]*\s*/g) ?? [clean]
  const chunks: string[] = []
  let current = ""

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      // Sentence itself is too long: flush current, then split by words.
      if (current.trim()) {
        chunks.push(current.trim())
        current = ""
      }
      const words = sentence.split(" ")
      let piece = ""
      for (const word of words) {
        if ((piece + " " + word).trim().length > maxChars) {
          if (piece.trim()) chunks.push(piece.trim())
          piece = word
        } else {
          piece = piece ? `${piece} ${word}` : word
        }
      }
      if (piece.trim()) current = piece
      continue
    }

    if ((current + sentence).length > maxChars) {
      if (current.trim()) chunks.push(current.trim())
      current = sentence
    } else {
      current += sentence
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks
}

/**
 * Chunks text for on-demand narration with a deliberately small FIRST chunk so
 * audio for section one is generated (and starts playing) almost instantly,
 * then falls back to larger chunks to minimize the number of requests. This
 * dramatically reduces the perceived latency before narration begins.
 */
export function chunkForNarration(
  text: string,
  leadChars = 380,
  bodyChars = 1400,
): string[] {
  const clean = text.replace(/\s+/g, " ").trim()
  if (!clean) return []
  if (clean.length <= leadChars) return [clean]

  // Build a short lead chunk on a sentence boundary for a fast first request.
  const first = chunkText(clean, leadChars)[0]
  const chunks = [first]

  const rest = clean.slice(first.length).trim()
  if (rest) chunks.push(...chunkText(rest, bodyChars))
  return chunks
}
