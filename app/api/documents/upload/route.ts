import { createDocument } from "@/app/actions/documents"
import { getCurrentUser } from "@/lib/session"
import { parseDocumentBuffer } from "@/lib/parse-document"
import { NextResponse } from "next/server"

// Parsing large PDFs/EPUBs can take a moment.
export const maxDuration = 60

const MAX_BYTES = 15 * 1024 * 1024 // 15MB

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
    const doc = await createDocument({
      title,
      content: text,
      sourceType: "file",
    })
    return NextResponse.json({ id: doc.id })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not process that file."
    console.log("[v0] document upload error:", message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
