"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { userInterest } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

export async function getMyInterests(): Promise<string[]> {
  const userId = await getUserId()
  const rows = await db
    .select({ interest: userInterest.interest })
    .from(userInterest)
    .where(eq(userInterest.userId, userId))
  return rows.map((r) => r.interest)
}

export async function saveInterests(interests: string[]) {
  const userId = await getUserId()
  // Replace the user's interest set atomically.
  await db.delete(userInterest).where(eq(userInterest.userId, userId))
  const unique = Array.from(new Set(interests)).slice(0, 50)
  if (unique.length > 0) {
    await db
      .insert(userInterest)
      .values(unique.map((interest) => ({ userId, interest })))
      .onConflictDoNothing()
  }
  revalidatePath("/app/discover")
  revalidatePath("/app/books")
  revalidatePath("/app")
}
