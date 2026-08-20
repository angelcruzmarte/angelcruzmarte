"use client"

import type React from "react"
import { useState } from "react"
import { ShieldCheck, Eye, EyeOff, Loader2, LogOut, ArrowLeft } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { verifyAdminAccess } from "@/app/actions/admin"
import { BrandLogo } from "@/components/brand-logo"

type Props = {
  /** Where to send a verified admin after login ("/" on the subdomain, else "/admin"). */
  adminHome: string
  /** Path back to the normal user app for non-admins. */
  appHref: string
  /** True when a non-admin account is already signed in on this browser. */
  alreadySignedIn: boolean
}

export function AdminLoginForm({ adminHome, appHref, alreadySignedIn }: Props) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await authClient.signOut()
    // Full reload so the server re-renders this page in its signed-out state.
    window.location.reload()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: signInError } = await authClient.signIn.email({
        email,
        password,
      })
      if (signInError) {
        setError("Invalid email or password.")
        return
      }
      // Password was correct — now confirm the account is an administrator on
      // the server. A non-admin is immediately signed back out so no admin
      // session cookie lingers in the browser.
      const isAdmin = await verifyAdminAccess()
      if (!isAdmin) {
        await authClient.signOut()
        setError("This account does not have administrator access.")
        return
      }
      // Full navigation so the fresh session cookie is sent and, on the admin
      // subdomain, the clean-path routing applies.
      window.location.assign(adminHome)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <BrandLogo size="lg" subtitle="Admin" />
          <p className="text-sm text-muted-foreground">
            Restricted area — authorized administrators only.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-lg font-semibold leading-tight text-card-foreground">
                Administrator sign in
              </h1>
              <p className="text-xs text-muted-foreground">
                Manage VOXYFI content, users, and revenue.
              </p>
            </div>
          </div>

          {alreadySignedIn ? (
            <div className="flex flex-col gap-4">
              <p className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                You are signed in with an account that is not an administrator.
                Sign out to log in with an admin account.
              </p>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {signingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                Sign out
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="admin-email"
                  className="text-sm font-medium text-card-foreground"
                >
                  Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@voxyfi.com"
                  required
                  autoComplete="email"
                  className="h-11 w-full rounded-lg border border-border bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="admin-password"
                  className="text-sm font-medium text-card-foreground"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="admin-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    minLength={8}
                    autoComplete="current-password"
                    className="h-11 w-full rounded-lg border border-border bg-background px-3.5 pr-11 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign in to admin
              </button>
            </form>
          )}
        </div>

        <a
          href={appHref}
          className="mx-auto mt-6 flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to VOXYFI
        </a>
      </div>
    </main>
  )
}
