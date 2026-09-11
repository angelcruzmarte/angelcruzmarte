import { createDocument } from "@/app/actions/documents"
import { extractTextFromImage } from "@/app/actions/ai"
import { getCurrentUser } from "@/lib/session"
import { parseDocumentBuffer } from "@/lib/parse-document"
import { generateAndStoreDocumentThumbnail } from "@/lib/document-thumbnail"
import { del } from "@vercel/blob"
import { after, NextResponse } from "next/server"

// Reading the file back from Blob and parsing a large PDF/EPUB can take a
// moment; keep the same generous budget the old direct-upload route used.
export const maxDuration = 60

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

/**
 * Only accept URLs that live in our own Blob store. The browser hands us the
 * URL it just uploaded to, so pinning the host prevents the route from being
 * coerced into fetching an arbitrary server (SSRF).
 */
function isOwnBlobUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return (
      u.protocol === "https:" &&
      u.hostname.endsWith(".blob.vercel-storage.com")
    )
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: { url?: string; name?: string; type?: string }
  try {
    payload = (await req.json()) as {
      url?: string
      name?: string
      type?: string
    }
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }

  const url = payload.url ?? ""
  const name = payload.name ?? "document"
  const type = payload.type ?? ""

  if (!isOwnBlobUrl(url)) {
    return NextResponse.json({ error: "Invalid file reference." }, { status: 400 })
  }

  try {
    // Pull the uploaded bytes back from Blob. This request body is a URL, not
    // the file, so the ~4.5MB serverless limit never applies here.
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error("Could not read the uploaded file.")
    }
    const buffer = Buffer.from(await res.arrayBuffer())

    let title: string
    let text: string
    if (isImage(name, type)) {
      // Scanned page / photo: run OCR via the multimodal model.
      const mime = type || "image/png"
      const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`
      text = await extractTextFromImage(dataUrl)
      title = name.replace(/\.[^.]+$/, "") || "Scanned document"
      if (!text || text.trim().split(/\s+/).filter(Boolean).length < 3) {
        throw new Error(
          "Couldn't read any text from that image. Try a clearer photo or scan.",
        )
      }
    } else {
      const parsed = await parseDocumentBuffer(name, type, buffer)
      title = parsed.title
      text = parsed.text
    }

    // Viewable originals (PDF/image) stay in Blob so the reader can render the
    // real pages. Non-viewable formats (DOCX/EPUB/TXT/MD) were only needed for
    // text extraction, so delete the now-redundant upload to avoid orphans.
    let originalUrl: string | null = null
    let originalMime: string | null = null
    if (isViewable(name, type)) {
      const ext = name.split(".").pop() || "bin"
      originalUrl = url
      originalMime = type || mimeFromExt(ext)
    } else {
      after(async () => {
        try {
          await del(url)
        } catch {
          // Best-effort cleanup; an orphaned temp blob is harmless.
        }
      })
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

    // Same shared thumbnail pipeline as every other import source, run AFTER
    // the response is sent so this heavy step (PDF parse + native canvas
    // rasterize + Blob upload) never inflates latency. Best-effort/idempotent;
    // the client self-heal and the player's on-load backfill remain safety nets.
    after(async () => {
      await generateAndStoreDocumentThumbnail({
        userId: user.id,
        docId: doc.id,
        buffer,
        name,
        mimeType: type,
      })
    })

    return NextResponse.json({ id: doc.id })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not process that file."
    console.log("[v0] document process error:", message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
