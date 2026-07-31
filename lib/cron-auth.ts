import { NextResponse } from "next/server"

/**
 * Authorizes a cron request. Vercel Cron automatically sends
 * `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is configured.
 *
 * Security model:
 *  - Production: CRON_SECRET MUST be set and the header MUST match. If the
 *    secret is missing we FAIL CLOSED (503) so a misconfiguration can never
 *    leave these expensive/destructive jobs publicly triggerable.
 *  - Non-production: if no secret is set we allow the request (local/dev
 *    convenience); if a secret is set it is still enforced.
 *
 * Returns a NextResponse to short-circuit with when unauthorized, or null
 * when the request is authorized and the handler should proceed.
 */
export function authorizeCron(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  const isProd = process.env.NODE_ENV === "production"

  if (!secret) {
    if (isProd) {
      console.error(
        "[v0] CRON_SECRET is not set in production — refusing to run cron job.",
      )
      return NextResponse.json(
        { error: "Cron is not configured" },
        { status: 503 },
      )
    }
    // Dev/preview without a secret: allow.
    return null
  }

  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}
