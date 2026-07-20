"use client"

import { Pencil, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BrandLogo } from "@/components/brand-logo"

type Props = {
  mode: "read" | "edit"
  onToggleMode: () => void
  wordCount: number
}

function estimateMinutes(wordCount: number) {
  // Average spoken pace is roughly 150 words per minute.
  return Math.max(1, Math.round(wordCount / 150))
}

export function VoxifyHeader({ mode, onToggleMode, wordCount }: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <BrandLogo size="md" />
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {wordCount.toLocaleString()} words · {estimateMinutes(wordCount)} min listen
          </span>
        </div>

        <Button
          variant={mode === "edit" ? "default" : "secondary"}
          onClick={onToggleMode}
          className="gap-2"
        >
          {mode === "read" ? (
            <>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              <span>Edit text</span>
            </>
          ) : (
            <>
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              <span>Done</span>
            </>
          )}
        </Button>
      </div>
    </header>
  )
}
