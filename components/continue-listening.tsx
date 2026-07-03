"use client"

import Link from "next/link"
import { FileText, Play, Pause } from "lucide-react"
import { usePlayer } from "@/components/player-provider"

export type ContinueDoc = {
  id: number
  title: string
  content: string
  wordCount: number
}

export function ContinueListening({ docs }: { docs: ContinueDoc[] }) {
  const { track, status, loadAndPlay, toggle } = usePlayer()

  return (
    <div className="space-y-2">
      {docs.map((doc) => {
        const isCurrent = track?.id === doc.id
        const isPlaying = isCurrent && status === "playing"
        return (
          <div
            key={doc.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary"
          >
            <Link
              href={`/app/listen/${doc.id}`}
              className="flex min-w-0 flex-1 items-center gap-3"
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
            <button
              type="button"
              onClick={() =>
                isCurrent
                  ? toggle()
                  : loadAndPlay({ id: doc.id, title: doc.title, content: doc.content })
              }
              aria-label={isPlaying ? `Pause ${doc.title}` : `Play ${doc.title}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105"
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 translate-x-0.5" />
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}
