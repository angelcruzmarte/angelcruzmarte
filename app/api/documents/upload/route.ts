import { createDocument } from "@/app/actions/documents"
import { detectLanguage } from "@/app/actions/ai"
import { getCurrentUser } from "@/lib/session"
import { parseDocumentBuffer } from "@/lib/parse-document"
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
    const { title, text } = await parseDocumentBuffer(
      file.name,
      file.type,
      buffer,
    )

    // Preserve the original file (PDF/scan) so the reader can show real pages.
    let originalUrl: string | null = null
    let originalMime: string | null = null
    if (isViewable(file.name, file.type)) {
      const ext = file.name.split(".").pop() || "bin"
      const blob = await put(
        `documents/${user.id}/${Date.now()}.${ext}`,
        buffer,
        { access: "private", contentType: file.type || undefined },
      )
      originalUrl = `/api/documents/original?pathname=${encodeURIComponent(
        blob.pathname,
      )}`
      originalMime = file.type || null
    }

    // Detect the document's language so playback can auto-translate later.
    const sourceLang = await detectLanguage(text)

    const doc = await createDocument({
      title,
      content: text,
      sourceType: "file",
      originalUrl,
      originalMime,
      sourceLang,
    })
    return NextResponse.json({ id: doc.id })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not process that file."
    console.log("[v0] document upload error:", message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
