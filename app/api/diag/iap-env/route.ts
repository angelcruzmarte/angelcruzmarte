// Temporary read-only diagnostic: logs what the client WebView exposes so we can
// see why the iOS app isn't detected as native. Grants nothing, stores nothing.
export async function POST(req: Request) {
  const body = await req.text().catch(() => "")
  console.log(
    "[v0] IAP env report:",
    JSON.stringify({
      userAgent: req.headers.get("user-agent"),
      report: body.slice(0, 2000),
    }),
  )
  return new Response(null, { status: 204 })
}
