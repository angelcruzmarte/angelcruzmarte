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
  Smile,
} from "lucide-react"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { getDocuments } from "@/app/actions/documents"
import { QuickCreate } from "@/components/quick-create"
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
      <div className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Smile className="h-5 w-5" />
        </span>
        <p className="text-sm">
          <span className="font-semibold">{minutesSaved}m saved</span>{" "}
          <span className="text-muted-foreground">
            across {docs.length} {docs.length === 1 ? "document" : "documents"}
          </span>
        </p>
      </div>

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
          <div className="space-y-2">
            {docs.slice(0, 3).map((doc) => (
              <Link
                key={doc.id}
                href={`/app/listen/${doc.id}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                  <FileText className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{doc.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {doc.wordCount} words
                  </span>
                </span>
              </Link>
            ))}
          </div>
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
