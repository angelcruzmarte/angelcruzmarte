import Image from "next/image"
import Link from "next/link"
import { BookOpen, Gauge, Headphones, Sparkles } from "lucide-react"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { PLANS, formatPrice } from "@/lib/plans"
import { SiteHeader } from "@/components/site-header"
import { LogoMark } from "@/components/logo-mark"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default async function HomePage() {
  const user = await getCurrentUser()
  const subscribed = hasActiveSubscription(user)

  const primaryHref = user ? "/app" : "/sign-up"
  const primaryLabel = user ? "Open the app" : "Start listening free"

  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero */}
      <section className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Listen to anything, anywhere
          </span>
          <h1 className="mt-5 text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Turn reading into listening with VOXYFI
          </h1>
          <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
            Subscribe to a growing library of articles and books, narrated with
            natural voices and word-by-word highlighting. Read with your ears
            while you commute, cook, or unwind.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href={primaryHref} className={buttonVariants({ size: "lg" })}>
              {primaryLabel}
            </Link>
            <Link
              href={user ? "/app" : "/sign-up"}
              className={buttonVariants({ variant: "secondary", size: "lg" })}
            >
              Browse the app
            </Link>
          </div>
          {!user && (
            <p className="mt-4 text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href="/sign-in"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          )}
        </div>

        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border bg-muted shadow-sm">
          <Image
            src="/images/hero-listening.png"
            alt="A person listening to narrated text with headphones"
            fill
            className="object-cover"
            priority
          />
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: Headphones,
              title: "Natural narration",
              body: "Lifelike voices read any text aloud at a pace that feels human.",
            },
            {
              icon: BookOpen,
              title: "Follow along",
              body: "Word-by-word highlighting keeps your eyes and ears in sync.",
            },
            {
              icon: Gauge,
              title: "Your speed",
              body: "Slow down to absorb or speed up to power through, 0.5x to 2x.",
            },
          ].map((f) => (
            <Card key={f.title} className="p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing preview */}
      <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <div className="rounded-3xl border border-border bg-card p-8 sm:p-12">
          <div className="text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight">
              Simple, premium pricing
            </h2>
            <p className="mt-2 text-muted-foreground">
              Unlimited listening across the entire library. Cancel anytime.
            </p>
          </div>
          <div className="mx-auto mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
            {PLANS.map((plan) => (
              <Card
                key={plan.id}
                className={
                  plan.highlighted
                    ? "border-primary p-6 ring-1 ring-primary"
                    : "p-6"
                }
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{plan.name}</h3>
                  {plan.highlighted && (
                    <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                      Best value
                    </span>
                  )}
                </div>
                <p className="mt-3 text-3xl font-semibold tracking-tight">
                  {formatPrice(plan.priceInCents)}
                  <span className="text-base font-normal text-muted-foreground">
                    /{plan.interval}
                  </span>
                </p>
                <Link
                  href={user ? "/subscribe" : "/sign-up"}
                  className={
                    buttonVariants({
                      variant: plan.highlighted ? "default" : "secondary",
                    }) + " mt-4 w-full"
                  }
                >
                  Get {plan.name}
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="flex items-center gap-2">
            <LogoMark className="h-4 w-4 text-primary" />
            VOXYFI
          </span>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/legal/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/legal/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/legal/refund" className="hover:text-foreground">
              Refunds
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
