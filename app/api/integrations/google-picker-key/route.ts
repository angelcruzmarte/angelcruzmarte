import { getUserId } from "@/lib/session"
import { NextResponse } from "next/server"

// Serves the Google Picker developer key to the browser AT RUNTIME.
//
// The key is a PUBLIC, HTTP-referrer-restricted browser key (safe to expose to
// the client — that's how the Picker uses it), but it lives in the server-only
// GCP_API_KEY env var. Reading it here at request time — instead of inlining a
// NEXT_PUBLIC_* var at build time — means the value is always the current one
// in the environment and can never be a stale or mistyped build-time copy.
//
// Gated behind an authenticated session so it isn't trivially scraped; the
// referrer restriction in Google Cloud is the real protection.
export async function GET() {
  try {
    await getUserId()
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.GCP_API_KEY ?? ""
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Picker key is not configured." },
      { status: 500 },
    )
  }
  // no-store: the key must not be cached by any shared/proxy cache layer.
  return NextResponse.json(
    { apiKey },
    { headers: { "Cache-Control": "no-store" } },
  )
}
