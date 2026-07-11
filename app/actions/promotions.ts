"use server"

import { db } from "@/lib/db"
import { promotion } from "@/lib/db/schema"
import { getCurrentUser, isAdmin } from "@/lib/session"
import { stripe } from "@/lib/stripe"
import { and, desc, eq, isNull, lte, gte, or, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import type { Promotion } from "@/lib/db/schema"

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!isAdmin(user)) throw new Error("Forbidden")
  return user!
}

export async function listPromotions(): Promise<Promotion[]> {
  await requireAdmin()
  return db.select().from(promotion).orderBy(desc(promotion.createdAt))
}

export interface PromotionInput {
  name: string
  description?: string | null
  percentOff: number
  durationType?: "once" | "repeating" | "forever"
  durationMonths?: number | null
  planScope?: "all" | "monthly" | "yearly"
  active?: boolean
  showBanner?: boolean
  startsAt?: string | null
  endsAt?: string | null
}

export async function createPromotion(input: PromotionInput) {
  await requireAdmin()
  const percentOff = Math.max(1, Math.min(100, Math.round(input.percentOff)))
  await db.insert(promotion).values({
    name: input.name.trim(),
    description: input.description?.trim() || null,
    percentOff,
    durationType: input.durationType ?? "once",
    durationMonths:
      input.durationType === "repeating" ? (input.durationMonths ?? 3) : null,
    planScope: input.planScope ?? "all",
    active: input.active ?? true,
    showBanner: input.showBanner ?? true,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
  })
  revalidatePath("/admin/promotions")
  return { success: true }
}

export async function updatePromotion(id: number, input: PromotionInput) {
  await requireAdmin()
  const percentOff = Math.max(1, Math.min(100, Math.round(input.percentOff)))
  await db
    .update(promotion)
    .set({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      percentOff,
      durationType: input.durationType ?? "once",
      durationMonths:
        input.durationType === "repeating" ? (input.durationMonths ?? 3) : null,
      planScope: input.planScope ?? "all",
      active: input.active ?? true,
      showBanner: input.showBanner ?? true,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      // Reset the cached coupon so a new one is minted with the new percent.
      stripeCouponId: null,
    })
    .where(eq(promotion.id, id))
  revalidatePath("/admin/promotions")
  return { success: true }
}

export async function togglePromotion(id: number, active: boolean) {
  await requireAdmin()
  await db.update(promotion).set({ active }).where(eq(promotion.id, id))
  revalidatePath("/admin/promotions")
  return { success: true }
}

export async function deletePromotion(id: number) {
  await requireAdmin()
  await db.delete(promotion).where(eq(promotion.id, id))
  revalidatePath("/admin/promotions")
  return { success: true }
}

/**
 * Returns the single active promotion currently in effect (respecting
 * start/end windows), or null. Safe to call from public pages.
 */
export async function getActivePromotion(): Promise<Promotion | null> {
  const now = new Date()
  const rows = await db
    .select()
    .from(promotion)
    .where(
      and(
        eq(promotion.active, true),
        or(isNull(promotion.startsAt), lte(promotion.startsAt, now)),
        or(isNull(promotion.endsAt), gte(promotion.endsAt, now)),
      ),
    )
    .orderBy(desc(promotion.createdAt))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Lazily creates (and caches) a Stripe coupon for a promotion, then returns
 * the coupon id so it can be attached to a Checkout session as a real
 * discount. Returns null if the promo is invalid.
 */
export async function ensureStripeCoupon(
  promo: Promotion,
): Promise<string | null> {
  if (promo.stripeCouponId) return promo.stripeCouponId
  try {
    const coupon = await stripe.coupons.create({
      percent_off: promo.percentOff,
      duration: promo.durationType as "once" | "repeating" | "forever",
      ...(promo.durationType === "repeating"
        ? { duration_in_months: promo.durationMonths ?? 3 }
        : {}),
      name: `${promo.name} (${promo.percentOff}% off)`,
      metadata: { promotionId: String(promo.id) },
    })
    await db
      .update(promotion)
      .set({ stripeCouponId: coupon.id })
      .where(eq(promotion.id, promo.id))
    return coupon.id
  } catch (error) {
    console.error("[v0] Failed to create Stripe coupon:", error)
    return null
  }
}
