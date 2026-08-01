import { grantBookPurchase, grantCartPurchase } from "@/app/actions/books"
import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { stripe } from "@/lib/stripe"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import type Stripe from "stripe"

async function applySubscription(sub: Stripe.Subscription) {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id
  const item = sub.items.data[0]
  const planId = sub.metadata?.planId ?? null

  await db
    .update(userTable)
    .set({
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      plan: planId,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      currentPeriodEnd: item?.current_period_end
        ? new Date(item.current_period_end * 1000)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(userTable.stripeCustomerId, customerId))
}

export async function POST(req: Request) {
  const body = await req.text()
  const signature = (await headers()).get("stripe-signature")
  // Prefer the integration-independent override (see lib/stripe.ts) so the live
  // webhook secret isn't shadowed by a connected Stripe integration.
  const secret =
    process.env.STRIPE_LIVE_WEBHOOK_SECRET?.trim() ||
    process.env.STRIPE_WEBHOOK_SECRET

  const isProd = process.env.NODE_ENV === "production"

  // In production a verified signature is MANDATORY — never grant purchases or
  // subscriptions from an unverified payload, which could be forged.
  if (isProd && (!secret || !signature)) {
    console.error(
      "[v0] Stripe webhook rejected in production: missing secret or signature.",
    )
    return NextResponse.json(
      { error: "Webhook signature verification required" },
      { status: 400 },
    )
  }

  let event: Stripe.Event
  try {
    if (secret && signature) {
      event = stripe.webhooks.constructEvent(body, signature, secret)
    } else {
      // Dev/preview only: no webhook secret configured (common in the sandbox).
      // Fall back to trusting the parsed payload so local testing still works.
      // The production guard above ensures this branch never runs in prod.
      event = JSON.parse(body) as Stripe.Event
    }
  } catch (err) {
    console.log("[v0] Stripe webhook signature error:", (err as Error).message)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await applySubscription(event.data.object as Stripe.Subscription)
        break
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            session.subscription as string,
          )
          await applySubscription(sub)
        } else if (
          session.metadata?.kind === "book" &&
          session.metadata?.userId &&
          session.metadata?.bookId &&
          (session.payment_status === "paid" || session.status === "complete")
        ) {
          // One-time book purchase — grant lifetime ownership.
          await grantBookPurchase(
            session.metadata.userId,
            Number(session.metadata.bookId),
            session.id,
          )
        } else if (
          session.metadata?.kind === "book-cart" &&
          session.metadata?.userId &&
          session.metadata?.bookIds &&
          (session.payment_status === "paid" || session.status === "complete")
        ) {
          // Multi-book cart purchase — grant lifetime ownership of each book.
          const ids = session.metadata.bookIds
            .split(",")
            .map((s) => Number(s))
            .filter((n) => Number.isFinite(n) && n > 0)
          await grantCartPurchase(session.metadata.userId, ids, session.id)
        }
        break
      }
      default:
        break
    }
  } catch (err) {
    console.log("[v0] Stripe webhook handler error:", (err as Error).message)
    return NextResponse.json({ error: "Handler error" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
