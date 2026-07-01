"use client"

import { useState } from "react"
import Link from "next/link"
import { Loader2, MailCheck } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { AuthShell } from "@/components/auth-shell"
import { Button } from "@/components/ui/button"

export function VerifyEmailClient({ email }: { email: string }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function resend() {
    if (!email) {
      setError("We couldn't find your email. Please sign in again.")
      return
    }
    setLoading(true)
    setMessage(null)
    setError(null)
    try {
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL: "/subscribe",
      })
      if (error) {
        setError(error.message ?? "Could not resend the email.")
        return
      }
      setMessage("Verification email sent. Check your inbox.")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Verify your email"
      description={
        email
          ? `We sent a verification link to ${email}. Click it to activate your account and start listening.`
          : "We sent you a verification link. Click it to activate your account and start listening."
      }
    >
      <div className="mt-6 flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-xl bg-accent px-4 py-3 text-accent-foreground">
          <MailCheck className="h-5 w-5 shrink-0" />
          <p className="text-sm">Open the email and tap &ldquo;Verify email&rdquo; to continue.</p>
        </div>

        {message && (
          <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button onClick={resend} disabled={loading} variant="secondary" className="gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Resend verification email
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already verified?{" "}
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
