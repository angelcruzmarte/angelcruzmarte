import "server-only"

/** Supported upload types and the extensions/MIME types they map to. */
export const ACCEPTED_UPLOAD_EXTENSIONS = [
  ".txt",
  ".md",
  ".markdown",
  ".pdf",
  ".docx",
  ".epub",
] as const

function cleanText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim()
}

function stripHtml(html: string): string {
  return cleanText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(p|div|h[1-6]|li|br|section|article|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"),
  )
}

async function parsePdf(buffer: Buffer): Promise<string> {
  // `unpdf` ships a serverless build of pdf.js that runs in Node without the
  // browser-only globals (e.g. DOMMatrix) that crash `pdf-parse`/`pdfjs-dist`.
  const { extractText, getDocumentProxy } = await import("unpdf")
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: true })
  return cleanText(Array.isArray(text) ? text.join("\n\n") : text)
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth")
  const result = await mammoth.extractRawText({ buffer })
  return cleanText(result.value ?? "")
}

async function parseEpub(buffer: Buffer): Promise<string> {
  const JSZip = (await import("jszip")).default
  const zip = await JSZip.loadAsync(buffer)

  // Collect the reading order from the OPF spine when possible; otherwise fall
  // back to every (x)html file in the archive, sorted by name.
  const htmlPaths: string[] = []
  const opfPath = Object.keys(zip.files).find((p) => p.endsWith(".opf"))
  if (opfPath) {
    const opf = await zip.files[opfPath].async("string")
    const baseDir = opfPath.includes("/")
      ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1)
      : ""
    const manifest = new Map<string, string>()
    for (const m of opf.matchAll(/<item\b[^>]*>/gi)) {
      const tag = m[0]
      const id = tag.match(/id="([^"]+)"/i)?.[1]
      const href = tag.match(/href="([^"]+)"/i)?.[1]
      if (id && href) manifest.set(id, baseDir + decodeURIComponent(href))
    }
    for (const s of opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"[^>]*>/gi)) {
      const path = manifest.get(s[1])
      if (path && /\.(x?html?)$/i.test(path)) htmlPaths.push(path)
    }
  }

  if (htmlPaths.length === 0) {
    htmlPaths.push(
      ...Object.keys(zip.files)
        .filter((p) => /\.(x?html?)$/i.test(p))
        .sort(),
    )
  }

  const parts: string[] = []
  for (const path of htmlPaths) {
    const file = zip.files[path]
    if (!file) continue
    const html = await file.async("string")
    const text = stripHtml(html)
    if (text) parts.push(text)
  }

  return cleanText(parts.join("\n\n"))
}

export type ParsedDocument = { title: string; text: string }

/**
 * Extracts readable text from an uploaded file buffer based on its filename.
 * Runs server-side only (binary formats can't be read in the browser).
 */
export async function parseDocumentBuffer(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
): Promise<ParsedDocument> {
  const lower = fileName.toLowerCase()
  const title = fileName.replace(/\.[^.]+$/, "") || "Untitled"

  let text = ""
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") {
    text = await parsePdf(buffer)
  } else if (
    lower.endsWith(".docx") ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    text = await parseDocx(buffer)
  } else if (lower.endsWith(".epub") || mimeType === "application/epub+zip") {
    text = await parseEpub(buffer)
  } else if (/\.(txt|md|markdown)$/.test(lower) || mimeType.startsWith("text/")) {
    text = cleanText(buffer.toString("utf-8"))
  } else {
    throw new Error(
      "Unsupported file type. Upload a PDF, DOCX, EPUB, TXT, or MD file.",
    )
  }

  if (!text || text.trim().split(/\s+/).filter(Boolean).length < 10) {
    throw new Error(
      "Couldn't extract enough readable text from that file. It may be scanned images or protected.",
    )
  }

  return { title, text }
}
