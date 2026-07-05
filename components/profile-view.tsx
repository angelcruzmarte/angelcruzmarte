"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowUp,
  BarChart3,
  ChevronRight,
  CreditCard,
  Flame,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Mail,
  Shield,
  Sparkles,
} from "lucide-react"
import { authClient } from "@/lib/auth-client"
import type { LifetimeStats } from "@/lib/stats-shared"
import { ProfileAvatar } from "@/components/profile-avatar"
import { DisplayNameEditor } from "@/components/display-name-editor"
import { ReferralCard } from "@/components/referral-card"
import { cn } from "@/lib/utils"

type Props = {
  name: string
  email: string
  image?: string | null
  isAdmin: boolean
  isSubscribed: boolean
  planName?: string
  lifetime: LifetimeStats
  referralCode: string
}

export function ProfileView({
  name,
  email,
  image,
  isAdmin,
  isSubscribed,
  planName,
  lifetime,
  referralCode,
}: Props) {
  const router = useRouter()

  async function handleSignOut() {
    await authClient.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <div className="pb-10">
      <header className="flex items-center justify-center border-b border-border px-4 py-3">
        <h1 className="text-lg font-bold tracking-tight">Profile</h1>
      </header>

      <div className="mx-auto max-w-2xl px-4">
        {/* Identity */}
        <section className="flex flex-col items-center gap-3 pt-8">
          <ProfileAvatar name={name} image={image} />
          <div className="text-center">
            <DisplayNameEditor name={name} />
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              {email}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
              isSubscribed
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground",
            )}
          >
            {isSubscribed ? (
              <>
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {planName ? prettyPlan(planName) : "Premium"}
              </>
            ) : (
              "Free plan"
            )}
          </span>
        </section>

        {/* Lifetime stats */}
        <section className="mt-8 grid grid-cols-3 gap-3">
          <StatTile
            icon={<Flame className="h-4 w-4" />}
            value={String(lifetime.currentStreak)}
            label={lifetime.currentStreak === 1 ? "Day streak" : "Day streak"}
          />
          <StatTile
            icon={<BarChart3 className="h-4 w-4" />}
            value={formatHours(lifetime.totalSeconds)}
            label="Listened"
          />
          <StatTile
            icon={<Sparkles className="h-4 w-4" />}
            value={formatCount(lifetime.totalWords)}
            label="Words"
          />
        </section>

        {/* View detailed statistics */}
        <Link
          href="/app/stats"
          className="mt-3 flex items-center justify-between rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-accent"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-foreground">
              <BarChart3 className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold">View statistics</span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>

        {/* Referral */}
        <section className="mt-6">
          <ReferralCard code={referralCode} />
        </section>

        {/* Upgrade banner for free users */}
        {!isSubscribed && (
          <Link
            href="/subscribe"
            className="mt-6 flex items-center justify-between rounded-2xl bg-foreground p-4 text-background transition-opacity hover:opacity-90"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-background/15">
                <ArrowUp className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-bold">
                  Upgrade to Premium
                </span>
                <span className="block text-xs text-background/70">
                  Unlimited listening and AI voices
                </span>
              </span>
            </span>
            <ChevronRight className="h-5 w-5 opacity-70" />
          </Link>
        )}

        {/* Settings & support */}
        <section className="mt-6">
          <h2 className="px-1 pb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Settings &amp; support
          </h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <RowLink
              href="/account"
              icon={<CreditCard className="h-5 w-5" />}
              label="Account & billing"
            />
            {isAdmin && (
              <RowLink
                href="/admin"
                icon={<LayoutDashboard className="h-5 w-5" />}
                label="Admin dashboard"
              />
            )}
            <RowLink
              href="https://vercel.com/help"
              external
              icon={<HelpCircle className="h-5 w-5" />}
              label="Help & support"
            />
            <RowLink
              href="/legal/privacy"
              icon={<Shield className="h-5 w-5" />}
              label="Privacy & terms"
            />
          </div>
        </section>

        {/* Sign out */}
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/5"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          VOXYFI · Listen to anything
        </p>
      </div>
    </div>
  )
}

function StatTile({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode
  value: string
  label: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card p-4 text-center">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-primary">
        {icon}
      </span>
      <span className="text-xl font-extrabold tracking-tight">{value}</span>
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

function RowLink({
  href,
  icon,
  label,
  external,
}: {
  href: string
  icon: React.ReactNode
  label: string
  external?: boolean
}) {
  const content = (
    <>
      <span className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-foreground">
          {icon}
        </span>
        <span className="text-sm font-semibold">{label}</span>
      </span>
      <ChevronRight className="h-5 w-5 text-muted-foreground" />
    </>
  )

  const className =
    "flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-accent border-b border-border last:border-b-0"

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {content}
      </a>
    )
  }
  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  )
}

function prettyPlan(plan: string): string {
  if (plan === "yearly") return "Premium Annual"
  if (plan === "monthly") return "Premium"
  return "Premium"
}

function formatHours(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins}m`
  const h = mins / 60
  return `${h >= 10 || Number.isInteger(h) ? Math.round(h) : h.toFixed(1)}h`
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return String(Math.round(n))
}
