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
} from "lucide-react"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { getDocuments } from "@/app/actions/documents"
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
  const docs = await getDocuments()
  const totalWords = docs.reduce((sum, d) => sum + d.wordCount, 0)
  const minutesSaved = Math.round((totalWords / 200) * 0.6)

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6">
      <SavedStat minutesSaved={minutesSaved} docCount={docs.length} />

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
          {!subscribed && (
            <Link
              href="/subscribe"
              className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              Premium
            </Link>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {aiTiles.map((tile) => (
            <TileLink key={tile.label} {...tile} locked={!subscribed} />
          ))}
        </div>
        <div className="mt-4">
          <QuickCreate subscribed={subscribed} />
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
      className={cn(
        "flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl bg-secondary text-center transition-colors hover:bg-accent",
      )}
    >
      <Icon className="h-6 w-6" strokeWidth={1.75} />
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  )
}
