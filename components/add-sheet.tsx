"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  FilePlus2,
  BookImage,
  ScanLine,
  LinkIcon,
  Type,
  Mic,
  AudioLines,
  HelpCircle,
  FileText,
  HardDrive,
  Cloud,
  CloudCog,
  ChevronDown,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useCloudImport } from "@/hooks/use-cloud-import"
import {
  isCloudProviderConfigured,
  type CloudProviderId,
} from "@/lib/cloud-providers"

type Item = {
  label: string
  icon: React.ElementType
  href?: string
  soon?: boolean
}

type AppItem = {
  id: CloudProviderId
  label: string
  icon: React.ElementType
  // Providers we don't support yet — shown but disabled with a "Soon" badge.
  comingSoon?: boolean
}

const addItems: Item[] = [
  { label: "Scan Book Cover", icon: BookImage, href: "/app/scan" },
  { label: "Scan Document", icon: ScanLine, href: "/app/new?mode=scan" },
  { label: "Import File", icon: FilePlus2, href: "/app/new?mode=file" },
  { label: "Paste Link", icon: LinkIcon, href: "/app/new?mode=link" },
  { label: "Type or Paste Text", icon: Type, href: "/app/new?mode=text" },
  { label: "Dictate Text", icon: Mic, href: "/app/new?mode=dictate" },
]

const createItems: Item[] = [
  { label: "AI Podcast", icon: AudioLines, href: "/app/create/podcast" },
  { label: "Quiz", icon: HelpCircle, href: "/app/create/quiz" },
  { label: "Summary", icon: FileText, href: "/app/create/summary" },
]

const appItems: AppItem[] = [
  { id: "google-drive", label: "Google Drive", icon: HardDrive },
  { id: "dropbox", label: "Dropbox", icon: Cloud },
  { id: "onedrive", label: "Microsoft OneDrive", icon: CloudCog },
]

export function AddSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const { importFrom, status, activeProvider, error } = useCloudImport(
    (id) => {
      onClose()
      router.push(`/app/listen/${id}`)
    },
    {
      // Background delta-sync refreshed one or more Drive documents — refresh
      // the library so the updated content/covers show without a manual reload.
      onSynced: () => router.refresh(),
    },
  )

  // Drive enter/exit animation.
  useEffect(() => {
    if (open) {
      setMounted(true)
    } else {
      const t = setTimeout(() => setMounted(false), 250)
      return () => clearTimeout(t)
    }
  }, [open])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!mounted && !open) return null

  function go(href?: string, soon?: boolean) {
    if (soon || !href) return
    onClose()
    router.push(href)
  }

  return (
    <div className="fixed inset-0 z-50" aria-hidden={!open}>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/50 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add content"
        className={cn(
          "absolute inset-x-0 bottom-0 mx-auto max-h-[85vh] max-w-2xl overflow-y-auto rounded-t-3xl bg-card pb-8 shadow-2xl transition-transform duration-250 ease-out",
          open ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between bg-card px-5 pb-2 pt-3">
          <span className="mx-auto h-1.5 w-10 rounded-full bg-border" />
        </div>

        <div className="flex items-center justify-between px-5">
          <h2 className="text-2xl font-bold tracking-tight">Add</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-accent"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 px-3">
          {addItems.map((item) => (
            <Row key={item.label} item={item} onClick={() => go(item.href, item.soon)} />
          ))}
        </div>

        <SectionLabel>Create</SectionLabel>
        <div className="px-3">
          {createItems.map((item) => (
            <Row key={item.label} item={item} onClick={() => go(item.href, item.soon)} />
          ))}
        </div>

        <SectionLabel>Apps</SectionLabel>
        <div className="px-3">
          {appItems.map((item) => {
            const configured =
              !item.comingSoon && isCloudProviderConfigured(item.id)
            const busy = activeProvider === item.id && status !== "idle"
            return (
              <AppRow
                key={item.id}
                item={item}
                configured={configured}
                busy={busy}
                busyLabel={status === "importing" ? "Importing…" : "Opening…"}
                onClick={() => {
                  if (configured) importFrom(item.id)
                }}
              />
            )
          })}
          {error && (
            <p className="px-2 pt-1 text-sm text-destructive">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-5 pb-1 pt-5 text-sm font-semibold text-muted-foreground">
      {children}
    </p>
  )
}

function Row({ item, onClick }: { item: Item; onClick: () => void }) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={item.soon}
      className={cn(
        "flex w-full items-center gap-4 rounded-2xl px-2 py-3 text-left transition-colors",
        item.soon ? "cursor-not-allowed opacity-55" : "hover:bg-secondary",
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <span className="flex-1 text-lg font-semibold">{item.label}</span>
      {item.soon && (
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
          Soon
        </span>
      )}
    </button>
  )
}

function AppRow({
  item,
  configured,
  busy,
  busyLabel,
  onClick,
}: {
  item: AppItem
  configured: boolean
  busy: boolean
  busyLabel: string
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!configured || busy}
      className={cn(
        "flex w-full items-center gap-4 rounded-2xl px-2 py-3 text-left transition-colors",
        configured ? "hover:bg-secondary" : "cursor-not-allowed opacity-55",
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        )}
      </span>
      <span className="flex-1 text-lg font-semibold">{item.label}</span>
      {busy ? (
        <span className="text-xs font-medium text-muted-foreground">
          {busyLabel}
        </span>
      ) : configured ? null : (
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {item.comingSoon ? "Soon" : "Set up"}
        </span>
      )}
    </button>
  )
}

/** The floating "+" trigger used inside the tab bar. */
export function AddSheetTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Add content"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105"
    >
      <Plus className="h-5 w-5" />
    </button>
  )
}
