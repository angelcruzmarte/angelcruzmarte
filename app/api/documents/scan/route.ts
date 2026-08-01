import { createDocument } from "@/app/actions/documents"
import { extractTextFromImage } from "@/app/actions/ai"
import { getCurrentUser } from "@/lib/session"
import { generateAndStoreDocumentThumbnail } from "@/lib/document-thumbnail"
import { put } from "@vercel/blob"
import { NextResponse } from "next/server"

// OCR across several captured pages can take a while.
export const maxDuration = 60

const MAX_PAGE_BYTES = 15 * 1024 * 1024 // 15MB per page
const MAX_PAGES = 20

function isImage(name: string, type: string): boolean {
  if (type.startsWith("image/")) return true
  return /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(name)
}

/**
 * Multi-page document scanner endpoint. Accepts one or more captured/uploaded
 * page images, runs OCR on each (in capture order), and stitches the text into
 * a single document. The first page image is preserved as the document's
 * original so the reader can show the real scan.
 */
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

  const pages = form.getAll("pages").filter((p): p is File => p instanceof File)
  const providedTitle = (form.get("title") as string | null)?.trim() || ""

  if (pages.length === 0) {
    return NextResponse.json({ error: "No pages provided." }, { status: 400 })
  }
  if (pages.length > MAX_PAGES) {
    return NextResponse.json(
      { error: `Please scan at most ${MAX_PAGES} pages at a time.` },
      { status: 400 },
    )
  }
  for (const page of pages) {
    if (!isImage(page.name, page.type)) {
      return NextResponse.json(
        { error: "Only image pages can be scanned." },
        { status: 400 },
      )
    }
    if (page.size > MAX_PAGE_BYTES) {
      return NextResponse.json(
        { error: "A page image is too large. Please use images under 15MB." },
        { status: 400 },
      )
    }
  }

  try {
    // OCR each page sequentially (in order) so the transcript reads top to
    // bottom, page by page, and we never fire many model calls at once.
    const firstBuffer = Buffer.from(await pages[0].arrayBuffer())
    const sections: string[] = []
    for (let i = 0; i < pages.length; i++) {
      const buffer =
        i === 0 ? firstBuffer : Buffer.from(await pages[i].arrayBuffer())
      const mime = pages[i].type || "image/jpeg"
      const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`
      const pageText = (await extractTextFromImage(dataUrl)).trim()
      if (pageText) sections.push(pageText)
    }

    const text = sections.join("\n\n")
    if (!text || text.trim().split(/\s+/).filter(Boolean).length < 3) {
      return NextResponse.json(
        {
          error:
            "Couldn't read any text from those pages. Try again with clearer, well-lit photos.",
        },
        { status: 400 },
      )
    }

    // Preserve the first captured page so the reader can render the real scan.
    let originalUrl: string | null = null
    let originalMime: string | null = null
    try {
      const ext = (pages[0].name.split(".").pop() || "jpg").toLowerCase()
      const blob = await put(
        `documents/${user.id}/scan-${Date.now()}.${ext}`,
        firstBuffer,
        {
          access: "public",
          addRandomSuffix: true,
          contentType: pages[0].type || "image/jpeg",
        },
      )
      originalUrl = blob.url
      originalMime = pages[0].type || "image/jpeg"
    } catch {
      // Non-fatal: the document still works without the preserved page image.
      originalUrl = null
      originalMime = null
    }

    const title =
      providedTitle ||
      (pages.length > 1 ? `Scan (${pages.length} pages)` : "Scanned document")

    const doc = await createDocument({
      title,
      content: text,
      sourceType: "scan",
      originalUrl,
      originalMime,
    })

    // Best-effort branded cover from the first page image, consistent with the
    // other import sources.
    await generateAndStoreDocumentThumbnail({
      userId: user.id,
      docId: doc.id,
      buffer: firstBuffer,
      name: pages[0].name || "scan.jpg",
      mimeType: pages[0].type || "image/jpeg",
    })

    return NextResponse.json({ id: doc.id })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not process those pages."
    console.log("[v0] document scan error:", message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
