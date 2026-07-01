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
