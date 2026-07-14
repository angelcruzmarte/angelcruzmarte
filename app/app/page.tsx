import Link from "next/link"
import {
  FolderOpen,
  ScanLine,
  LinkIcon,
  Type,
  Mic,
  Plus,
  FileText,
  AudioLines,
  HelpCircle,
  Lock,
  Sparkles,
} from "lucide-react"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { getDocuments } from "@/app/actions/documents"
import { getAiGenerationsLeftToday } from "@/app/actions/ai"
import { QuickCreate } from "@/components/quick-create"
import { SavedStat } from "@/components/saved-stat"
import { ContinueListening } from "@/components/continue-listening"
import { cn } from "@/lib/utils"

const ttsTiles = [
  { href: "/app/new?mode=file", label: "File", icon: FolderOpen },
  { href: "/app/new?mode=scan", label: "Scan", icon: ScanLine },
  { href: "/app/new?mode=link", label: "Link", icon: LinkIcon },
  { href: "/app/new?mode=text", label: "Paste", icon: Type },
  { href: "/app/new?mode=dictate", label: "Dictate", icon: Mic },
  { href: "/app/new", label: "Add", icon: Plus },
]

const aiTiles = [
  { href: "/app/create/summary", label: "Summary", icon: FileText },
  { href: "/app/create/podcast", label: "AI Podcast", icon: AudioLines },
  { href: "/app/create/quiz", label: "Quiz", icon: HelpCircle },
]

export default async function AppHome() {
  const user = await getCurrentUser()
  const subscribed = hasActiveSubscription(user)
  // `unlocked` means unlimited access (paid, in-trial, or admin). Free users
  // still reach this page but get the limited experience with daily quotas.
  const unlocked = subscribed || user?.role === "admin"
  const isTrialing = user?.subscriptionStatus === "trialing"
  const trialDaysLeft =
    isTrialing && user?.currentPeriodEnd
      ? Math.max(
          0,
          Math.ceil(
            (new Date(user.currentPeriodEnd).getTime() - Date.now()) /
              86_400_000,
          ),
        )
      : 0
  const docs = await getDocuments()
  // Free users see how many AI generations they have left today as a nudge.
  const aiLeft = unlocked ? 0 : await getAiGenerationsLeftToday()
  const totalWords = docs.reduce((sum, d) => sum + d.wordCount, 0)
  const minutesSaved = Math.round((totalWords / 200) * 0.6)

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6">
      <SavedStat minutesSaved={minutesSaved} docCount={docs.length} />

      {isTrialing ? (
        <Link
          href="/account"
          className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 transition-colors hover:bg-primary/10"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              Free trial active &mdash;{" "}
              {trialDaysLeft} {trialDaysLeft === 1 ? "day" : "days"} left
            </p>
            <p className="truncate text-xs text-muted-foreground">
              Everything is unlocked. Manage your plan anytime.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            Manage
          </span>
        </Link>
      ) : subscribed ? (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Premium active</p>
            <p className="truncate text-xs text-muted-foreground">
              All AI features and unlimited listening are unlocked.
            </p>
          </div>
        </div>
      ) : (
        <Link
          href="/subscribe"
          className="flex items-center gap-3 rounded-2xl border border-border bg-secondary px-4 py-3 transition-colors hover:bg-accent"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Start your free trial</p>
            <p className="truncate text-xs text-muted-foreground">
              7 days free &mdash; unlock everything VOXYFI can do.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Start
          </span>
        </Link>
      )}

      <section>
        <h2 className="mb-3 text-2xl font-bold tracking-tight">Text to Speech</h2>
        <div className="grid grid-cols-3 gap-3">
          {ttsTiles.map((tile) => (
            <TileLink key={tile.label} {...tile} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-2xl font-bold tracking-tight">Create with AI</h2>
          {!unlocked && (
            <Link
              href="/subscribe"
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {aiLeft > 0 ? `${aiLeft} free left today` : "Upgrade for more"}
            </Link>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {aiTiles.map((tile) => (
            <TileLink key={tile.label} {...tile} />
          ))}
        </div>
        <div className="mt-4">
          <QuickCreate />
        </div>
      </section>

      {docs.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Continue listening</h2>
            <Link href="/app/library" className="text-sm font-medium text-primary">
              See all
            </Link>
          </div>
          <ContinueListening
            docs={docs.slice(0, 3).map((doc) => ({
              id: doc.id,
              title: doc.title,
              content: doc.content,
              wordCount: doc.wordCount,
            }))}
          />
        </section>
      )}
    </div>
  )
}

function TileLink({
  href,
  label,
  icon: Icon,
  locked,
}: {
  href: string
  label: string
  icon: React.ElementType
  locked?: boolean
}) {
  return (
    <Link
      href={locked ? "/subscribe" : href}
      aria-label={locked ? `${label} (Premium)` : label}
      className={cn(
        "relative flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl bg-secondary text-center transition-colors hover:bg-accent",
        locked && "border border-dashed border-primary/30",
      )}
    >
      {locked && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock className="h-3 w-3" aria-hidden="true" />
        </span>
      )}
      <Icon
        className={cn("h-6 w-6", locked && "text-muted-foreground")}
        strokeWidth={1.75}
      />
      <span
        className={cn(
          "text-sm font-semibold",
          locked && "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </Link>
  )
}
