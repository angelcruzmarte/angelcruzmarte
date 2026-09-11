import { getCurrentUser } from "@/lib/session"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"

const MAX_BYTES = 15 * 1024 * 1024 // 15MB

// Issues short-lived, single-file upload tokens so the browser can stream the
// file DIRECTLY to Vercel Blob. This is the key to true 15MB support: a normal
// POST to a serverless route caps the request body at ~4.5MB, but a client
// upload sends the bytes straight to Blob storage and never touches that limit.
// The actual text extraction happens afterwards in /api/documents/process,
// which reads the file back from its (small, fast) Blob URL.
export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody
  const user = await getCurrentUser()

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        // Only signed-in users may mint an upload token, and the token itself
        // enforces the size ceiling so an over-limit file is rejected by Blob
        // before any bytes are stored.
        if (!user) {
          throw new Error("Unauthorized")
        }
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_BYTES,
          tokenPayload: JSON.stringify({ userId: user.id }),
        }
      },
      // Processing is driven by an explicit client call to
      // /api/documents/process once the upload resolves, so nothing to do here.
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(jsonResponse)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed."
    console.log("[v0] blob-upload token error:", message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
