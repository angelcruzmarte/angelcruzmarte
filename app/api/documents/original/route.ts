import { type NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { getCurrentUser } from "@/lib/session"

// Streams the original uploaded file (PDF/image) for a document. Access is
// restricted to the owner: originals live under `documents/{userId}/...` and we
// verify the requesting user's id matches the path segment.
export async function GET(request: NextRequest) {
  const current = await getCurrentUser()
  if (!current) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const pathname = request.nextUrl.searchParams.get("pathname")
  if (!pathname || !pathname.startsWith(`documents/${current.id}/`)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const result = await get(pathname, {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    })

    if (!result) {
      return new NextResponse("Not found", { status: 404 })
    }

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          "Cache-Control": "private, no-cache",
        },
      })
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        ETag: result.blob.etag,
        "Cache-Control": "private, no-cache",
      },
    })
  } catch (error) {
    console.log("[v0] document original serve error:", error)
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 })
  }
}
