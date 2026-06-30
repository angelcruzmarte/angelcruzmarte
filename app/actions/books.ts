"use server"

import { db } from "@/lib/db"
import { book } from "@/lib/db/schema"
import { INTEREST_LABELS } from "@/lib/interests"
import { desc, eq } from "drizzle-orm"
import { getMyInterests } from "./interests"

export async function getBooks() {
  return db.select().from(book).orderBy(desc(book.featured), desc(book.createdAt))
}

export async function getBook(id: number) {
  const [row] = await db.select().from(book).where(eq(book.id, id)).limit(1)
  return row ?? null
}

/**
 * Returns books ranked by how well their category matches the user's selected
 * interests. Falls back to featured/newest when no interests are set.
 */
export async function getPersonalizedBooks() {
  const [all, interestIds] = await Promise.all([getBooks(), getMyInterests()])
  const wanted = new Set(
    interestIds.map((id) => (INTEREST_LABELS.get(id) ?? id).toLowerCase()),
  )
  if (wanted.size === 0) return { books: all, personalized: false }

  const ranked = [...all].sort((a, b) => {
    const aMatch = wanted.has(a.category.toLowerCase()) ? 1 : 0
    const bMatch = wanted.has(b.category.toLowerCase()) ? 1 : 0
    if (aMatch !== bMatch) return bMatch - aMatch
    return Number(b.featured) - Number(a.featured)
  })
  return { books: ranked, personalized: true }
}
