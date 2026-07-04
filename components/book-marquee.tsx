"use client"

import { useState } from "react"
import useSWR from "swr"
import { BookOpen } from "lucide-react"
import type { MarqueeCover } from "@/app/api/store/marquee/route"

const fetcher = (url: string): Promise<{ covers: MarqueeCover[] }> =>
  fetch(url).then((r) => r.json())

/**
 * A decorative hero that scrolls two rows of book covers in opposite
 * directions. Covers are pulled live from Open Library across many categories
 * (de-duplicated so no book repeats) and refreshed per visit. Purely visual;
 * the animation pauses for users who prefer reduced motion.
 */
export function BookMarquee() {
  const { data } = useSWR("/api/store/marquee", fetcher, {
    revalidateOnFocus: false,
  })

  const covers = data?.covers ?? []
  if (covers.length < 6) {
    // Skeleton keeps layout stable while the first fetch resolves.
    return (
      <div
        className="relative -mx-4 h-[268px] animate-pulse rounded-2xl bg-secondary/60 sm:-mx-6"
        aria-hidden
      />
    )
  }

  // Split the unique set into two rows so nothing repeats across the strip.
  const half = Math.ceil(covers.length / 2)
  const rowA = covers.slice(0, half)
  const rowB = covers.slice(half)

  return (
    <div
      className="relative -mx-4 overflow-hidden rounded-2xl bg-secondary/60 py-5 sm:-mx-6"
      aria-hidden
    >
      <MarqueeRow covers={rowA} direction="left" />
      <div className="h-4" />
      <MarqueeRow covers={rowB} direction="right" />

      {/* Soft fade on both edges. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent" />
    </div>
  )
}

function MarqueeRow({
  covers,
  direction,
}: {
  covers: MarqueeCover[]
  direction: "left" | "right"
}) {
  // Duplicate the row so translating by -50% loops seamlessly.
  const doubled = [...covers, ...covers]
  return (
    <div className="flex w-max">
      <div
        className={`flex w-max gap-3 pr-3 ${
          direction === "left" ? "animate-marquee-left" : "animate-marquee-right"
        }`}
      >
        {doubled.map((cover, i) => (
          <Cover key={`${cover.id}-${i}`} cover={cover} />
        ))}
      </div>
    </div>
  )
}

function Cover({ cover }: { cover: MarqueeCover }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="w-20 shrink-0 sm:w-24">
      {broken ? (
        <div className="flex aspect-[2/3] w-full flex-col justify-between rounded-md bg-muted p-2 shadow-md">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <p className="line-clamp-3 text-[10px] font-semibold leading-tight">
            {cover.title}
          </p>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover.coverUrl || "/placeholder.svg"}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className="aspect-[2/3] w-full rounded-md object-cover shadow-md"
        />
      )}
    </div>
  )
}
