"use server"

import { db } from "@/lib/db"
import { readingItem } from "@/lib/db/schema"
import { getCurrentUser, hasActiveSubscription, isAdmin } from "@/lib/session"
import { and, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

/** Public list of published items (metadata only, no full content). */
export async function getPublishedItems() {
  return db
    .select({
      id: readingItem.id,
      title: readingItem.title,
      author: readingItem.author,
      category: readingItem.category,
      excerpt: readingItem.excerpt,
      createdAt: readingItem.createdAt,
    })
    .from(readingItem)
    .where(eq(readingItem.published, true))
    .orderBy(desc(readingItem.createdAt))
}

/** Full content of a single item — only for active subscribers or admins. */
export async function getReadingItem(id: number) {
  const user = await getCurrentUser()
  if (!user) return { error: "Please sign in to listen." as const }
  if (!hasActiveSubscription(user) && !isAdmin(user)) {
    return { error: "An active subscription is required to listen." as const }
  }
  const rows = await db
    .select()
    .from(readingItem)
    .where(and(eq(readingItem.id, id), eq(readingItem.published, true)))
    .limit(1)
  const item = rows[0]
  if (!item) return { error: "Item not found." as const }
  return { item }
}

// ----- Admin-only management -----

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!isAdmin(user)) throw new Error("Forbidden")
  return user!
}

export async function getAllItemsForAdmin() {
  await requireAdmin()
  return db.select().from(readingItem).orderBy(desc(readingItem.createdAt))
}

export async function createItem(input: {
  title: string
  author?: string
  category?: string
  excerpt?: string
  content: string
  published?: boolean
}) {
  const admin = await requireAdmin()
  if (!input.title?.trim() || !input.content?.trim()) {
    return { error: "Title and content are required." }
  }
  await db.insert(readingItem).values({
    title: input.title.trim(),
    author: input.author?.trim() || null,
    category: input.category?.trim() || "General",
    excerpt: input.excerpt?.trim() || input.content.trim().slice(0, 160),
    content: input.content.trim(),
    published: input.published ?? true,
    createdBy: admin.id,
  })
  revalidatePath("/admin")
  revalidatePath("/library")
  return { success: true }
}

export async function updateItem(
  id: number,
  input: Partial<{
    title: string
    author: string
    category: string
    excerpt: string
    content: string
    published: boolean
  }>,
) {
  await requireAdmin()
  await db
    .update(readingItem)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(readingItem.id, id))
  revalidatePath("/admin")
  revalidatePath("/library")
  return { success: true }
}

export async function deleteItem(id: number) {
  await requireAdmin()
  await db.delete(readingItem).where(eq(readingItem.id, id))
  revalidatePath("/admin")
  revalidatePath("/library")
  return { success: true }
}

export async function togglePublished(id: number, published: boolean) {
  await requireAdmin()
  await db
    .update(readingItem)
    .set({ published, updatedAt: new Date() })
    .where(eq(readingItem.id, id))
  revalidatePath("/admin")
  revalidatePath("/library")
  return { success: true }
}
