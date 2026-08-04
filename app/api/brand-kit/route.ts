import { readFile } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"

// Serve the brand-kit ZIP with a forced-attachment header. Linking straight to
// the static /public file with the HTML `download` attribute is unreliable on
// mobile (iOS Safari and in-app webviews often ignore `download` and open the
// ZIP inline instead of saving it). Streaming it through this route with an
// explicit Content-Disposition guarantees a real download on every browser.
export const runtime = "nodejs"
export const dynamic = "force-static"

const FILE_NAME = "voxyfi-brand-kit.zip"

export async function GET() {
  const filePath = path.join(process.cwd(), "public", "brand", FILE_NAME)

  try {
    const file = await readFile(filePath)
    // Copy into a fresh ArrayBuffer so the Response body is a valid BodyInit.
    const body = file.buffer.slice(
      file.byteOffset,
      file.byteOffset + file.byteLength,
    ) as ArrayBuffer

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${FILE_NAME}"`,
        "Content-Length": String(file.byteLength),
        "Cache-Control": "public, max-age=3600, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch {
    return new NextResponse("Brand kit not found", { status: 404 })
  }
}
