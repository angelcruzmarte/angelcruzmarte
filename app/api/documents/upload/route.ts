import { createDocument } from "@/app/actions/documents"
import { extractTextFromImage } from "@/app/actions/ai"
import { getCurrentUser } from "@/lib/session"
import { parseDocumentBuffer } from "@/lib/parse-document"
import { generateAndStoreDocumentThumbnail } from "@/lib/document-thumbnail"
import { put } from "@vercel/blob"
import { NextResponse } from "next/server"

// Parsing large PDFs/EPUBs can take a moment.
export const maxDuration = 60

const MAX_BYTES = 15 * 1024 * 1024 // 15MB

// File types whose original bytes we preserve so the reader can render the
// real pages/scan alongside the extracted text.
const VIEWABLE_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
])

function isViewable(name: string, type: string): boolean {
  if (VIEWABLE_MIME.has(type)) return true
  return /\.(pdf|png|jpe?g|webp|gif)$/i.test(name)
}

function isImage(name: string, type: string): boolean {
  if (type.startsWith("image/")) return true
  return /\.(png|jpe?g|webp|gif)$/i.test(name)
}

/** Best-effort MIME from a file extension for browsers that omit file.type. */
function mimeFromExt(ext: string): string | null {
  switch (ext.toLowerCase()) {
    case "pdf":
      return "application/pdf"
    case "png":
      return "image/png"
    case "jpg":
    case "jpeg":
      return "image/jpeg"
    case "webp":
      return "image/webp"
    case "gif":
      return "image/gif"
    default:
      return null
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File is too large. Please use a file under 15MB." },
      { status: 400 },
    )
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())

    let title: string
    let text: string
    if (isImage(file.name, file.type)) {
      // Scanned page / photo: run OCR via the multimodal model.
      const mime = file.type || "image/png"
      const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`
      text = await extractTextFromImage(dataUrl)
      title = file.name.replace(/\.[^.]+$/, "") || "Scanned document"
      if (!text || text.trim().split(/\s+/).filter(Boolean).length < 3) {
        throw new Error(
          "Couldn't read any text from that image. Try a clearer photo or scan.",
        )
      }
    } else {
      const parsed = await parseDocumentBuffer(file.name, file.type, buffer)
      title = parsed.title
      text = parsed.text
    }

    // Preserve the original file (PDF/scan) so the reader can show real pages.
    let originalUrl: string | null = null
    let originalMime: string | null = null
    if (isViewable(file.name, file.type)) {
      const ext = file.name.split(".").pop() || "bin"
      const blob = await put(
        `documents/${user.id}/${Date.now()}.${ext}`,
        buffer,
        {
          access: "public",
          addRandomSuffix: true,
          contentType: file.type || undefined,
        },
      )
      // Public blob URL is directly renderable in the reader. Fall back to the
      // extension when the browser doesn't report a MIME type so the reader can
      // still recognize (and render) the original pages.
      originalUrl = blob.url
      originalMime = file.type || mimeFromExt(ext)
    }

    // Language is auto-detected inside createDocument so playback can
    // auto-translate later.
    const doc = await createDocument({
      title,
      content: text,
      sourceType: "file",
      originalUrl,
      originalMime,
    })

    // Same shared thumbnail pipeline as every other import source: render a
    // cover from the PDF's first page (or downscale the uploaded image itself)
    // so the document has a consistent preview server-side, no matter how it
    // was added. Best-effort, idempotent, and non-blocking to the response
    // contract — the client self-heal path becomes a redundant safety net.
    await generateAndStoreDocumentThumbnail({
      userId: user.id,
      docId: doc.id,
      buffer,
      name: file.name,
      mimeType: file.type,
    })

    return NextResponse.json({ id: doc.id })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not process that file."
    console.log("[v0] document upload error:", message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
