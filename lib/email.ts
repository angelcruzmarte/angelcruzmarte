import "server-only"
import { Resend } from "resend"

// Known-good verified sender on the app's Resend domain. Used as the default
// and as a fallback whenever EMAIL_FROM is missing or malformed, so a bad
// environment variable can never silently break auth emails (verification,
// password reset) again.
const DEFAULT_FROM = "VOXYFI <noreply@voxyfi.com>"

/**
 * Accepts either `email@example.com` or `Name <email@example.com>`, matching
 * the formats Resend's `from` field allows.
 */
function isValidFrom(value: string): boolean {
  const bare = /^[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+$/
  const named = /^.+<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>$/
  return bare.test(value) || named.test(value)
}

/**
 * Resolves the sender address. Trims whitespace and strips any stray wrapping
 * quotes or brackets (a common env-var paste mistake, e.g. "[placeholder]"),
 * then validates the result. Falls back to DEFAULT_FROM with a loud warning if
 * the configured value is unusable — Resend rejects invalid `from` values with
 * a 422, which would otherwise block every sign-up verification email.
 */
function resolveFrom(): string {
  const raw = process.env.EMAIL_FROM
  if (!raw) return DEFAULT_FROM
  const cleaned = raw.trim().replace(/^["'[]+|["'\]]+$/g, "").trim()
  if (!isValidFrom(cleaned)) {
    console.error(
      `[v0] EMAIL_FROM is not a valid sender ("${raw}"). Falling back to ${DEFAULT_FROM}. ` +
        `Set EMAIL_FROM to a verified address like "VOXYFI <noreply@voxyfi.com>".`,
    )
    return DEFAULT_FROM
  }
  return cleaned
}

const FROM = resolveFrom()

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

type SendArgs = {
  to: string
  subject: string
  html: string
  text: string
}

/**
 * Sends a transactional email. If RESEND_API_KEY is not configured, the email
 * is logged instead of sent so that local development and preview flows keep
 * working without a provider. Errors are caught and logged so that auth flows
 * (sign-up, password reset) never fail because of an email issue.
 */
export async function sendEmail({ to, subject, html, text }: SendArgs) {
  if (!resend) {
    console.warn(
      `[v0] RESEND_API_KEY not set — email not sent. To: ${to} | Subject: ${subject}\n${text}`,
    )
    return { skipped: true as const }
  }

  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html, text })
    if (error) {
      console.error("[v0] Failed to send email:", error)
      return { error }
    }
    return { sent: true as const }
  } catch (error) {
    console.error("[v0] Failed to send email:", error)
    return { error }
  }
}

function layout(heading: string, body: string, button: { label: string; url: string }) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f4f5;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7;padding:32px;">
            <tr><td style="font-size:20px;font-weight:700;color:#18181b;padding-bottom:8px;">VOXYFI</td></tr>
            <tr><td style="font-size:18px;font-weight:600;color:#18181b;padding-bottom:12px;">${heading}</td></tr>
            <tr><td style="font-size:15px;line-height:1.6;color:#52525b;padding-bottom:24px;">${body}</td></tr>
            <tr>
              <td>
                <a href="${button.url}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:10px;">${button.label}</a>
              </td>
            </tr>
            <tr><td style="font-size:13px;line-height:1.6;color:#a1a1aa;padding-top:24px;">If the button does not work, copy and paste this link into your browser:<br/><a href="${button.url}" style="color:#4f46e5;word-break:break-all;">${button.url}</a></td></tr>
          </table>
          <p style="font-size:12px;color:#a1a1aa;margin-top:16px;">You received this email because an account action was requested on VOXYFI.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export function verificationEmail(url: string) {
  return {
    subject: "Verify your VOXYFI email",
    html: layout(
      "Confirm your email address",
      "Welcome to VOXYFI! Please confirm your email address to activate your account and start listening.",
      { label: "Verify email", url },
    ),
    text: `Welcome to VOXYFI! Confirm your email address to activate your account:\n${url}`,
  }
}

export function resetPasswordEmail(url: string) {
  return {
    subject: "Reset your VOXYFI password",
    html: layout(
      "Reset your password",
      "We received a request to reset your VOXYFI password. Click the button below to choose a new one. If you did not request this, you can safely ignore this email.",
      { label: "Reset password", url },
    ),
    text: `Reset your VOXYFI password using this link:\n${url}\n\nIf you did not request this, you can ignore this email.`,
  }
}
