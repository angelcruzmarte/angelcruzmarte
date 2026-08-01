/**
 * Removes common non-content lines from a document so narration skips headers,
 * footers, standalone page numbers, and inline citation markers. Used by the
 * "Auto Skip Content" listening preference.
 *
 * This is intentionally conservative: it only drops short lines that strongly
 * match boilerplate patterns, so real prose is never removed.
 */
export function stripBoilerplate(text: string): string {
  const rawLines = text.split(/\r?\n/)

  const kept = rawLines.filter((line) => {
    const trimmed = line.trim()
    if (!trimmed) return true // preserve paragraph breaks

    // Standalone page numbers: "12", "- 12 -", "Page 12", "12 of 340".
    if (/^[-–—\s]*(page\s+)?\d{1,4}([-–—\s]*|(\s+of\s+\d{1,4}))$/i.test(trimmed))
      return false

    // "Page 12", "p. 12", "pg 12" style footers.
    if (/^(page|pg\.?|p\.)\s*\d{1,4}$/i.test(trimmed)) return false

    // Running header/footer style: short ALL-CAPS lines (e.g. chapter running
    // heads) with no sentence punctuation.
    if (
      trimmed.length <= 60 &&
      /^[A-Z0-9 .,'’&:-]+$/.test(trimmed) &&
      trimmed === trimmed.toUpperCase() &&
      /[A-Z]/.test(trimmed) &&
      !/[.!?]$/.test(trimmed) &&
      trimmed.split(/\s+/).length <= 8
    )
      return false

    // Bare citation/reference lines like "[12]" or "(2019)".
    if (/^[[(]\s*\d{1,4}\s*[\])]$/.test(trimmed)) return false

    // URLs / DOIs on their own line.
    if (/^(https?:\/\/|doi:|www\.)\S+$/i.test(trimmed)) return false

    return true
  })

  let out = kept.join("\n")

  // Strip inline citation markers such as "[12]" or "[3,4]" that sit mid-line.
  out = out.replace(/\s?\[\d{1,4}(?:\s*[,–-]\s*\d{1,4})*\]/g, "")

  // Collapse any runs of blank lines the removals introduced.
  return out.replace(/\n{3,}/g, "\n\n").trim()
}
