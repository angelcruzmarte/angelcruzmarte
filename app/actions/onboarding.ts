"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

/** Marks the current user's first-run onboarding as complete. */
export async function completeOnboarding() {
  const userId = await getUserId()
  await db
    .update(userTable)
    .set({ onboardingComplete: true, updatedAt: new Date() })
    .where(eq(userTable.id, userId))
  revalidatePath("/app")
}
