"use server"

import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { getCurrentUser, getUserId } from "@/lib/session"
import { eq } from "drizzle-orm"
import { put } from "@vercel/blob"
import { revalidatePath } from "next/cache"

/** Updates the current user's display name. */
export async function updateName(name: string) {
  const userId = await getUserId()
  const trimmed = name.trim()
  if (trimmed.length < 1) return { error: "Name can't be empty." as const }
  if (trimmed.length > 60) return { error: "Name is too long." as const }
  await db
    .update(userTable)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(userTable.id, userId))
  revalidatePath("/app/profile")
  revalidatePath("/account")
  return { success: true as const, name: trimmed }
}

/**
 * Uploads a new avatar image to Blob (private store) and saves its pathname on
 * the user. Returns the pathname so the client can render via /api/avatar.
 */
export async function updateAvatar(formData: FormData) {
  const userId = await getUserId()
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { error: "No image selected." as const }
  }
  if (!file.type.startsWith("image/")) {
    return { error: "Please choose an image file." as const }
  }
  if (file.size > 5 * 1024 * 1024) {
    return { error: "Image must be under 5MB." as const }
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "png"
  const blob = await put(`avatars/${userId}-${Date.now()}.${ext}`, file, {
    access: "private",
    addRandomSuffix: true,
  })

  await db
    .update(userTable)
    .set({ image: blob.pathname, updatedAt: new Date() })
    .where(eq(userTable.id, userId))

  revalidatePath("/app/profile")
  revalidatePath("/account")
  return { success: true as const, pathname: blob.pathname }
}

/** Generates (once) and returns the current user's referral code. */
export async function getOrCreateReferralCode() {
  const user = await getCurrentUser()
  if (!user) return { error: "Unauthorized" as const }
  if (user.referralCode) return { code: user.referralCode }

  // Short, readable, uppercase code derived from name + random.
  const base = user.name.replace(/[^a-zA-Z]/g, "").slice(0, 4).toUpperCase() || "VOXY"
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  const code = `${base}${rand}`

  await db
    .update(userTable)
    .set({ referralCode: code, updatedAt: new Date() })
    .where(eq(userTable.id, user.id))

  return { code }
}
