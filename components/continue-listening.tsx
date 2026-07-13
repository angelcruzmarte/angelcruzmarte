"use client"

import Link from "next/link"
import { FileText, Play } from "lucide-react"

export type ContinueDoc = {
  id: number
  title: string
  content: string
  wordCount: number
}

export function ContinueListening({ docs }: { docs: ContinueDoc[] }) {
  // Each row simply opens the full premium player for that document. We no
  // longer start an inline (device-voice) player here — that produced robotic
  // audio and a second floating bar that duplicated this list.
  return (
    <div className="space-y-2">
      {docs.map((doc) => (
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
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <Play className="h-4 w-4 translate-x-0.5" />
          </span>
        </Link>
      ))}
    </div>
  )
}
