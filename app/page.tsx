import Link from "next/link"
import { redirect } from "next/navigation"
import { BookOpen, Gauge, Headphones, Sparkles } from "lucide-react"
import { getCurrentUser } from "@/lib/session"
import { PLANS, formatPrice } from "@/lib/plans"
import { getActivePromotion } from "@/app/actions/promotions"
import { SiteHeader } from "@/components/site-header"
import { LogoMark } from "@/components/logo-mark"
import { PromoCountdown } from "@/components/promo-countdown"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default async function HomePage() {
  const user = await getCurrentUser()

  // Signed-in users skip the marketing page and go straight to the app.
  if (user) {
    redirect("/app")
  }

  // Reflect any active promotion on the public homepage. This is the same
  // promo that is applied as a real discount at checkout, so the prices shown
  // here are truthful. The banner/countdown only appears while the promo is
  // live (getActivePromotion respects the start/end window).
  const promo = await getActivePromotion()
  const showPromo = Boolean(promo && promo.showBanner)

  return (
    <div className="min-h-screen">
      <SiteHeader />

      {/* Hero — clean, centered, no imagery */}
      <section className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6 lg:py-28">
        {showPromo ? (
          <a
            href="/sign-up"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Limited time: {promo!.percentOff}% off Premium
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Listen to anything, anywhere
          </span>
        )}
        <h1 className="mt-6 text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          Turn reading into listening
        </h1>
        <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
          Natural voices narrate your articles and books with word-by-word
          highlighting. Read with your ears while you commute, cook, or unwind.
        </p>
        <div className="mt-8 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
          <Link
            href="/sign-up"
            className={buttonVariants({ size: "lg" }) + " w-full sm:w-auto"}
          >
            Start listening free
          </Link>
          <Link
            href="/sign-in"
            className={
              buttonVariants({ variant: "secondary", size: "lg" }) +
              " w-full sm:w-auto"
            }
          >
            Sign in
          </Link>
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

          {showPromo && (
            <div className="mx-auto mt-8 max-w-lg overflow-hidden rounded-2xl border border-primary/30 bg-primary/10 p-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Limited-time offer
              </p>
              <p className="mt-1 text-balance text-xl font-semibold">
                {promo!.name} &mdash; {promo!.percentOff}% off Premium
              </p>
              {promo!.description && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {promo!.description}
                </p>
              )}
              <PromoCountdown
                endsAt={promo!.endsAt ? promo!.endsAt.toISOString() : null}
              />
              <p className="mt-3 text-sm font-medium text-primary">
                Sign up now &mdash; discount applied automatically at checkout
              </p>
            </div>
          )}

          <div className="mx-auto mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
            {PLANS.map((plan) => {
              const promoApplies =
                showPromo &&
                (promo!.planScope === "all" || promo!.planScope === plan.id)
              const discounted = promoApplies
                ? Math.round(plan.priceInCents * (1 - promo!.percentOff / 100))
                : null
              return (
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
                  {discounted !== null && (
                    <span className="mr-2 align-middle text-lg font-normal text-muted-foreground line-through">
                      {formatPrice(plan.priceInCents)}
                    </span>
                  )}
                  {formatPrice(discounted ?? plan.priceInCents)}
                  <span className="text-base font-normal text-muted-foreground">
                    /{plan.interval}
                  </span>
                </p>
                {discounted !== null && (
                  <p className="mt-1.5 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    Save {promo!.percentOff}% for a limited time
                  </p>
                )}
                <Link
                  href="/sign-up"
                  className={
                    buttonVariants({
                      variant: plan.highlighted ? "default" : "secondary",
                    }) + " mt-4 w-full"
                  }
                >
                  Get {plan.name}
                </Link>
              </Card>
              )
            })}
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
