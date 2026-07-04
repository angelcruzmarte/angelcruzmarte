import { NextResponse } from "next/server"

// Cache the assembled cover set for an hour; the mix is shuffled per request
// from a larger cached pool so it feels fresh without hammering Open Library.
export const revalidate = 3600

export type MarqueeCover = {
  id: string
  title: string
  coverUrl: string
}

// A spread of subjects so the strip always mixes genres/categories.
const SUBJECTS = [
  "fiction",
  "fantasy",
  "science_fiction",
  "history",
  "biography",
  "mystery",
  "romance",
  "science",
  "poetry",
  "children",
  "philosophy",
  "art",
] as const

type Work = {
  cover_id?: number | null
  title?: string
  key?: string
}

async function fetchSubject(subject: string): Promise<MarqueeCover[]> {
  const url = `https://openlibrary.org/subjects/${subject}.json?limit=16`
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "VoxyfiBookstore/1.0 (books listening app)" },
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const data = (await res.json()) as { works?: Work[] }
    return (data.works ?? [])
      .filter((w) => w.cover_id && w.title)
      .map((w) => ({
        id: `${subject}:${w.cover_id}`,
        title: w.title as string,
        coverUrl: `https://covers.openlibrary.org/b/id/${w.cover_id}-M.jpg`,
      }))
  } catch {
    return []
  }
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export async function GET() {
  const batches = await Promise.all(SUBJECTS.map((s) => fetchSubject(s)))

  // Round-robin across subjects so genres interleave, de-duplicating by both
  // cover id and title so the same book never appears twice.
  const seenCover = new Set<string>()
  const seenTitle = new Set<string>()
  const pool: MarqueeCover[] = []
  const maxLen = Math.max(0, ...batches.map((b) => b.length))
  for (let i = 0; i < maxLen; i++) {
    for (const batch of batches) {
      const item = batch[i]
      if (!item) continue
      const titleKey = item.title.trim().toLowerCase()
      if (seenCover.has(item.coverUrl) || seenTitle.has(titleKey)) continue
      seenCover.add(item.coverUrl)
      seenTitle.add(titleKey)
      pool.push(item)
    }
  }

  // Cap the set so the marquee stays light, then shuffle for per-visit variety.
  const covers = shuffle(pool).slice(0, 32)
  return NextResponse.json({ covers })
}
