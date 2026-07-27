import { createDocument } from "@/app/actions/documents"
import { getCurrentUser } from "@/lib/session"
import { parseDocumentBuffer } from "@/lib/parse-document"
import { renderPdfFirstPageToJpegBuffer } from "@/lib/pdf-thumbnail-server"
import { db } from "@/lib/db"
import { document } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { put } from "@vercel/blob"
import { NextResponse } from "next/server"

// Downloading + parsing large PDFs/EPUBs can take a moment.
export const maxDuration = 60

const MAX_BYTES = 15 * 1024 * 1024 // 15MB

type Body = {
  // Direct download URL provided by the cloud picker.
  url?: string
  // Original file name (used for the title and to detect the format).
  name?: string
  // Optional Authorization header value (e.g. "Bearer <token>") for providers
  // like Google Drive that require an access token to download file bytes.
  auth?: string
  // Optional explicit MIME type from the picker.
  mimeType?: string
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }

  const url = (body.url ?? "").trim()
  const name = (body.name ?? "document").trim()
  if (!url) {
    return NextResponse.json({ error: "No file selected." }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: body.auth ? { Authorization: body.auth } : undefined,
      redirect: "follow",
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: "Could not download that file from the cloud provider." },
        { status: 400 },
      )
    }

    // Guard against oversized files using the header when present.
    const declared = Number(res.headers.get("content-length") ?? "0")
    if (declared && declared > MAX_BYTES) {
      return NextResponse.json(
        { error: "File is too large. Please use a file under 15MB." },
        { status: 400 },
      )
    }

    const arrayBuffer = await res.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: "File is too large. Please use a file under 15MB." },
        { status: 400 },
      )
    }

    const buffer = Buffer.from(arrayBuffer)
    const mimeType =
      body.mimeType || res.headers.get("content-type") || ""

    const { title, text } = await parseDocumentBuffer(name, mimeType, buffer)
    const doc = await createDocument({
      title,
      content: text,
      sourceType: "file",
    })

    // Automatically render a high-quality first-page thumbnail on the server so
    // cloud-imported PDFs (e.g. Google Drive) get a real branded preview right
    // away — for the library grid and the /og share card — without depending on
    // the client-side self-heal path (which never fires here because we only
    // store extracted text, not the original PDF). Best-effort: any failure
    // leaves the document usable with the logo fallback.
    const isPdf =
      mimeType.includes("pdf") || /\.pdf$/i.test(name)
    if (isPdf) {
      try {
        const jpeg = await renderPdfFirstPageToJpegBuffer(buffer, 640)
        if (jpeg && jpeg.byteLength > 0) {
          const blob = await put(
            `documents/${user.id}/thumbnails/${doc.id}-${Date.now()}.jpg`,
            jpeg,
            {
              access: "public",
              addRandomSuffix: true,
              contentType: "image/jpeg",
            },
          )
          await db
            .update(document)
            .set({ thumbnailUrl: blob.url, updatedAt: new Date() })
            .where(
              and(eq(document.id, doc.id), eq(document.userId, user.id)),
            )
        }
      } catch (thumbErr) {
        console.log(
          "[v0] cloud import thumbnail skipped:",
          thumbErr instanceof Error ? thumbErr.message : String(thumbErr),
        )
      }
    }

    return NextResponse.json({ id: doc.id })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not import that file."
    console.log("[v0] cloud import error:", message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
