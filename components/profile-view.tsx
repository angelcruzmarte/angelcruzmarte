"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowUp,
  BarChart3,
  Bug,
  ChevronRight,
  CreditCard,
  EyeOff,
  Flame,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Music2,
  PlayCircle,
  Share2,
  Shield,
  SkipForward,
  Sparkles,
  Star,
  Trash2,
  Trophy,
} from "lucide-react"
import { authClient } from "@/lib/auth-client"
import type { LifetimeStats } from "@/lib/stats-shared"
import { ProfileAvatar } from "@/components/profile-avatar"
import { DisplayNameEditor } from "@/components/display-name-editor"
import { UsernameEditor } from "@/components/username-editor"
import { ReferralCard } from "@/components/referral-card"
import {
  PreferenceRow,
  DailyGoalRow,
  DeleteAccountLink,
} from "@/components/settings-controls"
import { cn } from "@/lib/utils"

const APP_VERSION = "1.0.0"

export type ProfilePreferences = {
  prefAutoPlay: boolean
  prefAutoHide: boolean
  prefMixAudio: boolean
  prefAutoSkip: boolean
}

type Props = {
  name: string
  username: string | null
  email: string
  image?: string | null
  isAdmin: boolean
  isSubscribed: boolean
  planName?: string
  lifetime: LifetimeStats
  referralCode: string
  preferences: ProfilePreferences
  dailyGoalMinutes: number
  memberSince: string
}

export function ProfileView({
  name,
  username,
  email,
  image,
  isAdmin,
  isSubscribed,
  planName,
  lifetime,
  referralCode,
  preferences,
  dailyGoalMinutes,
  memberSince,
}: Props) {
  const router = useRouter()

  async function handleSignOut() {
    await authClient.signOut()
    router.push("/")
    router.refresh()
  }

  async function handleShare() {
    const shareData = {
      title: "VOXYFI",
      text: "Listen to anything — turn your documents, articles and books into natural audio with VOXYFI.",
      url: "https://www.voxyfi.com",
    }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        await navigator.clipboard.writeText(shareData.url)
      }
    } catch {
      // User cancelled the share sheet — ignore.
    }
  }

  return (
    <div className="pb-10">
      <header className="flex items-center justify-center border-b border-border px-4 py-3">
        <h1 className="text-lg font-bold tracking-tight">Settings</h1>
      </header>

      <div className="mx-auto max-w-2xl px-4">
        {/* Avatar */}
        <section className="flex flex-col items-center gap-3 pt-8">
          <ProfileAvatar name={name} image={image} />
        </section>

        {/* Identity card: Name / Email / Subscription */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5">
            <span className="text-sm font-bold">Name</span>
            <div className="flex flex-col items-end">
              <DisplayNameEditor name={name} />
              <UsernameEditor username={username} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5">
            <span className="text-sm font-bold">Email</span>
            <span className="truncate text-sm text-muted-foreground">
              {email}
            </span>
          </div>
          <Link
            href={isSubscribed ? "/account" : "/subscribe"}
            className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-accent"
          >
            <span className="text-sm font-bold">Subscription</span>
            <span className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
              {isSubscribed
                ? planName
                  ? prettyPlan(planName)
                  : "Premium plan"
                : "Basic plan"}
              <ChevronRight className="h-5 w-5" />
            </span>
          </Link>
        </section>

        {/* Listening preferences */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
          <PreferenceRow
            icon={<SkipForward className="h-5 w-5" />}
            title="Auto Skip Content"
            subtitle="Headers, footers, citations etc."
            prefKey="prefAutoSkip"
            initial={preferences.prefAutoSkip}
          />
          <PreferenceRow
            icon={<PlayCircle className="h-5 w-5" />}
            title="Auto-Play Audio"
            subtitle="Play file as soon as it opens"
            prefKey="prefAutoPlay"
            initial={preferences.prefAutoPlay}
          />
          <PreferenceRow
            icon={<EyeOff className="h-5 w-5" />}
            title="Auto-Hide Player"
            prefKey="prefAutoHide"
            initial={preferences.prefAutoHide}
          />
          <PreferenceRow
            icon={<Music2 className="h-5 w-5" />}
            title="Mix With Background Music"
            subtitle="Don't pause audio from other apps"
            prefKey="prefMixAudio"
            initial={preferences.prefMixAudio}
          />
        </section>

        {/* Daily goal + deleted files */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
          <DailyGoalRow
            icon={<Trophy className="h-5 w-5" />}
            initial={dailyGoalMinutes}
          />
          <RowLink
            href="/app/profile/deleted"
            icon={<Trash2 className="h-5 w-5" />}
            label="Deleted Files"
          />
        </section>

        {/* Lifetime stats */}
        <section className="mt-6 grid grid-cols-3 gap-3">
          <StatTile
            icon={<Flame className="h-4 w-4" />}
            value={String(lifetime.currentStreak)}
            label="Day streak"
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

        {/* Share / review / support */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
          <RowButton
            icon={<Share2 className="h-5 w-5" />}
            label="Share VOXYFI"
            onClick={handleShare}
          />
          <RowLink
            href="/app/faq"
            icon={<HelpCircle className="h-5 w-5" />}
            label="Help & support"
          />
          <RowExternal
            href="mailto:support@voxyfi.com?subject=VOXYFI%20Debug%20Report"
            icon={<Bug className="h-5 w-5" />}
            label="Send Debug Report"
          />
          <RowExternal
            href="https://www.trustpilot.com/evaluate/voxyfi.com"
            icon={<Star className="h-5 w-5" />}
            label="Review VOXYFI"
          />
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
            href="/legal/privacy"
            icon={<Shield className="h-5 w-5" />}
            label="Privacy & terms"
          />
        </section>

        {/* Log out */}
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:bg-accent"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-foreground">
            <LogOut className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold">Log Out</span>
        </button>

        {/* Footer */}
        <footer className="mt-8 flex flex-col items-center gap-2 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Member since {memberSince}
          </p>
          <p className="text-sm font-semibold">
            <Link href="/legal/terms" className="hover:underline">
              Terms and Conditions
            </Link>
            <span className="mx-2 text-muted-foreground">·</span>
            <Link href="/legal/privacy" className="hover:underline">
              Privacy Policy
            </Link>
          </p>
          <p className="text-sm font-medium text-muted-foreground">
            App Version v{APP_VERSION}
          </p>
          <DeleteAccountLink />
        </footer>
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

const rowClass =
  "flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-accent border-b border-border last:border-b-0"

function RowInner({
  icon,
  label,
}: {
  icon: React.ReactNode
  label: string
}) {
  return (
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
}

function RowLink({
  href,
  icon,
  label,
}: {
  href: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <Link href={href} className={rowClass}>
      <RowInner icon={icon} label={label} />
    </Link>
  )
}

function RowExternal({
  href,
  icon,
  label,
}: {
  href: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={rowClass}>
      <RowInner icon={icon} label={label} />
    </a>
  )
}

function RowButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className={cn(rowClass, "w-full text-left")}>
      <RowInner icon={icon} label={label} />
    </button>
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
