"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import type { Word } from "@/hooks/use-speech"

type Props = {
  title: string
  text: string
  words: Word[]
  currentWord: number
  onWordClick: (index: number) => void
}

export function ReaderPanel({ title, text, words, currentWord, onWordClick }: Props) {
  const activeRef = useRef<HTMLButtonElement>(null)

  // Keep the spoken word in view as narration progresses. Only scroll when the
  // word drifts outside a comfortable middle band so we don't re-center on every
  // word (which is jarky) and so text never hides behind the bottom bars.
  useEffect(() => {
    if (currentWord < 0 || !activeRef.current) return
    const rect = activeRef.current.getBoundingClientRect()
    const topBound = window.innerHeight * 0.2
    const bottomBound = window.innerHeight * 0.62
    if (rect.top < topBound || rect.bottom > bottomBound) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [currentWord])

  return (
    <article className="mx-auto max-w-3xl px-4 pb-64 pt-10 sm:px-6">
      <h1 className="text-balance font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Tap any word to start listening from there.
      </p>

      <div className="mt-8 font-serif text-xl leading-relaxed text-foreground sm:text-[1.375rem] sm:leading-[1.85]">
        {words.map((word, index) => {
          const isActive = index === currentWord
          const isSpoken = currentWord >= 0 && index < currentWord
          // Preserve the original spacing/newlines that followed each word.
          const trailing = text.slice(
            word.end,
            words[index + 1] ? words[index + 1].start : text.length,
          )
          return (
            <span key={index}>
              <button
                ref={isActive ? activeRef : undefined}
                type="button"
                onClick={() => onWordClick(index)}
                className={cn(
                  "rounded-md px-0.5 transition-colors duration-150 hover:bg-accent",
                  isActive &&
                    "bg-highlight text-highlight-foreground shadow-sm hover:bg-highlight",
                  isSpoken && "text-spoken",
                )}
              >
                {word.text}
              </button>
              {trailing}
            </span>
          )
        })}
      </div>
    </article>
  )
}
