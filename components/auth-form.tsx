"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AudioLines, Loader2 } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Props = {
  mode: "sign-in" | "sign-up"
  redirectTo?: string
  notice?: string
}

export function AuthForm({ mode, redirectTo = "/app", notice }: Props) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
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
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <AudioLines className="h-5 w-5" />
        </div>
        <span className="text-xl font-semibold tracking-tight">VOXYFI</span>
      </Link>

      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-card-foreground">
          {isSignUp ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {isSignUp
            ? "Start listening to your library in minutes."
            : "Sign in to continue listening."}
        </p>

        {notice && (
          <p className="mt-4 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
            {notice}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          {isSignUp && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                required
                autoComplete="name"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {!isSignUp && (
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              )}
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="mt-1 gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSignUp ? "Create account" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignUp ? "Already have an account? " : "New to VOXYFI? "}
          <Link
            href={isSignUp ? "/sign-in" : "/sign-up"}
            className="font-medium text-primary hover:underline"
          >
            {isSignUp ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </div>
    </div>
  )
}
