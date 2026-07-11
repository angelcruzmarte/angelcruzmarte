"use server"

import { db } from "@/lib/db"
import { pricingView } from "@/lib/db/schema"
import { getCurrentUser, isAdmin } from "@/lib/session"
import { and, count, desc, eq, sql } from "drizzle-orm"
import { cookies } from "next/headers"

const VISITOR_COOKIE = "vf_vid"

/** Reads (or creates) the anonymous first-party visitor id. */
async function getVisitorId(): Promise<string> {
  const store = await cookies()
  const existing = store.get(VISITOR_COOKIE)?.value
  if (existing) return existing
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `v_${Date.now()}_${Math.random().toString(36).slice(2)}`
  store.set(VISITOR_COOKIE, id, {
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  })
  return id
}

/**
 * Records a pricing/subscribe page view for the current anonymous visitor.
 * Deduplicates to at most one row per visitor per path so repeat visits don't
 * inflate the funnel. Fails silently — tracking must never break the page.
 */
export async function trackPricingView(path = "pricing", referrer?: string) {
  try {
    const visitorId = await getVisitorId()
    const current = await getCurrentUser()
    const existing = await db
      .select({ id: pricingView.id })
      .from(pricingView)
      .where(
        and(eq(pricingView.visitorId, visitorId), eq(pricingView.path, path)),
      )
      .limit(1)
    if (existing.length > 0) {
      // Keep conversion status fresh if they've since signed in.
      if (current) {
        await db
          .update(pricingView)
          .set({ userId: current.id, converted: true })
          .where(eq(pricingView.visitorId, visitorId))
      }
      return { ok: true }
    }
    await db.insert(pricingView).values({
      visitorId,
      userId: current?.id ?? null,
      path,
      referrer: referrer?.slice(0, 300) ?? null,
      converted: Boolean(current),
    })
    return { ok: true }
  } catch (error) {
    console.error("[v0] trackPricingView failed:", error)
    return { ok: false }
  }
}

/**
 * Marks the current visitor's pricing views as converted once they register.
 * Called right after a successful sign-up.
 */
export async function markVisitorConverted(userId?: string) {
  try {
    const store = await cookies()
    const visitorId = store.get(VISITOR_COOKIE)?.value
    if (!visitorId) return
    await db
      .update(pricingView)
      .set(userId ? { converted: true, userId } : { converted: true })
      .where(eq(pricingView.visitorId, visitorId))
  } catch (error) {
    console.error("[v0] markVisitorConverted failed:", error)
  }
}

export type FunnelData = Awaited<ReturnType<typeof getFunnelData>>

/** Aggregate pricing funnel metrics + recent unconverted visits (admin). */
export async function getFunnelData() {
  const current = await getCurrentUser()
  if (!isAdmin(current)) throw new Error("Forbidden")

  const [totals] = await db
    .select({
      views: count(),
      visitors: sql<number>`count(distinct ${pricingView.visitorId})`,
      converted: sql<number>`count(*) filter (where ${pricingView.converted})`,
    })
    .from(pricingView)

  const views = Number(totals?.views ?? 0)
  const visitors = Number(totals?.visitors ?? 0)
  const converted = Number(totals?.converted ?? 0)
  const conversionRate = visitors > 0 ? (converted / visitors) * 100 : 0

  const recentUnconverted = await db
    .select({
      visitorId: pricingView.visitorId,
      path: pricingView.path,
      referrer: pricingView.referrer,
      createdAt: pricingView.createdAt,
    })
    .from(pricingView)
    .where(eq(pricingView.converted, false))
    .orderBy(desc(pricingView.createdAt))
    .limit(25)

  return {
    views,
    visitors,
    converted,
    unconverted: Math.max(0, visitors - converted),
    conversionRate,
    recentUnconverted,
  }
}
