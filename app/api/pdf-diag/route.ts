import { NextResponse } from "next/server"

// Temporary diagnostic endpoint: the PDF follow-along reader posts what happens
// on the client (which we can't see otherwise) so we can read it in Vercel logs.
export async function POST(request: Request) {
  let payload: unknown = null
  try {
    payload = await request.json()
  } catch {
    payload = { parseError: true }
  }
  const ua = request.headers.get("user-agent") ?? "unknown"
  console.log("[v0][pdf-diag]", JSON.stringify({ ...(payload as object), ua }))
  return NextResponse.json({ ok: true })
}
