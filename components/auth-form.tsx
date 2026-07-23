"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { markVisitorConverted } from "@/app/actions/funnel"
import { BrandLogo } from "@/components/brand-logo"

type Props = {
  mode: "sign-in" | "sign-up"
  redirectTo?: string
  notice?: string
  promo?: { name: string; percentOff: number; description?: string | null } | null
}

export function AuthForm({
  mode,
  redirectTo = "/app",
  notice,
  promo = null,
}: Props) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isSignUp = mode === "sign-up"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (isSignUp) {
        const { error } = await authClient.signUp.email({
          email,
          password,
          name,
          callbackURL: "/app",
        })
        if (error) {
          setError(error.message ?? "Could not create account.")
          return
        }
        // Record the pricing-funnel conversion for this visitor.
        void markVisitorConverted()
        // Email verification is required, so no session exists yet.
        router.push(`/verify-email?email=${encodeURIComponent(email)}`)
        return
      }

      const { error } = await authClient.signIn.email({ email, password })
      if (error) {
        if (
          error.code === "EMAIL_NOT_VERIFIED" ||
          error.status === 403 ||
          /verif/i.test(error.message ?? "")
        ) {
          router.push(`/verify-email?email=${encodeURIComponent(email)}`)
          return
        }
        setError(error.message ?? "Invalid email or password.")
        return
      }
      router.push(redirectTo)
      router.refresh()
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col px-6 py-10">
      <Link href="/" className="mx-auto mb-10 mt-2">
        <BrandLogo size="md" />
      </Link>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <h1 className="text-center text-3xl font-bold tracking-tight text-foreground">
          {isSignUp ? "Create Account" : "Welcome Back"}
        </h1>

        {isSignUp && promo && (
          <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/10 p-3.5 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Sign up &amp; save {promo.percentOff}%
            </p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {promo.description ||
                `${promo.name} — ${promo.percentOff}% off your subscription`}
            </p>
          </div>
        )}

        {notice && (
          <p className="mt-6 rounded-xl bg-secondary px-3 py-2 text-center text-sm text-secondary-foreground">
            {notice}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
          {isSignUp && (
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              required
              autoComplete="name"
              aria-label="Name"
              className="h-16 w-full rounded-2xl bg-muted px-5 text-lg font-medium text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          )}

          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            autoComplete="email"
            aria-label="Email"
            className="h-16 w-full rounded-2xl bg-muted px-5 text-lg font-medium text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring"
          />

          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              aria-label="Password"
              className="h-16 w-full rounded-2xl bg-muted px-5 pr-14 text-lg font-medium text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>

          {!isSignUp && (
            <Link
              href="/forgot-password"
              className="mt-1 self-start text-sm font-semibold text-primary hover:underline"
            >
              Forgot Password?
            </Link>
          )}

          {error && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-5 flex h-16 w-full items-center justify-center gap-2 rounded-full bg-primary text-lg font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-5 w-5 animate-spin" />}
            {isSignUp ? "Create Account" : "Log In"}
          </button>
        </form>

        <p className="mt-8 text-center text-base text-muted-foreground">
          {isSignUp ? "Already have an account? " : "New to VOXYFI? "}
          <Link
            href={isSignUp ? "/sign-in" : "/sign-up"}
            className="font-semibold text-primary hover:underline"
          >
            {isSignUp ? "Log In" : "Create Account"}
          </Link>
        </p>

        <p className="mx-auto mt-auto max-w-xs pt-10 text-center text-sm leading-relaxed text-muted-foreground">
          By continuing you accept the{" "}
          <Link href="/legal/terms" className="font-semibold text-primary hover:underline">
            terms of use
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="font-semibold text-primary hover:underline">
            privacy policy
          </Link>
        </p>
      </div>
    </div>
  )
}
