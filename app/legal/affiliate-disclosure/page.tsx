import type { Metadata } from "next"

import { LegalTitle, LegalSection } from "@/components/legal"
import {
  affiliateDisclosure,
  affiliateDisclosureExtended,
} from "@/lib/affiliate"

export const metadata: Metadata = {
  title: "Affiliate Disclosure — VOXYFI",
  description:
    "How VOXYFI uses Amazon affiliate links and what that means for you.",
}

export default function AffiliateDisclosurePage() {
  return (
    <article>
      <LegalTitle title="Affiliate Disclosure" updated="July 30, 2026" />

      <LegalSection heading="Amazon Associates">
        <p className="font-medium text-foreground">{affiliateDisclosure()}</p>
        <p>{affiliateDisclosureExtended()}</p>
      </LegalSection>

      <LegalSection heading="What “Buy on Amazon” means">
        <p>
          Some books in VOXYFI are commercial titles we cannot narrate in full.
          For these, we offer a free listening sample and a{" "}
          <span className="font-medium text-foreground">Buy on Amazon</span>{" "}
          button. That button is an affiliate link: it takes you to Amazon,
          where you complete your purchase directly with Amazon under Amazon&apos;s
          own terms, pricing, and return policy. VOXYFI does not sell, ship, or
          fulfill these books.
        </p>
      </LegalSection>

      <LegalSection heading="Pricing and availability">
        <p>
          VOXYFI does not display Amazon prices or stock status. Prices and
          availability are shown on Amazon at the time you visit and can change
          at any time. Always confirm the current price and availability on
          Amazon before buying.
        </p>
      </LegalSection>

      <LegalSection heading="Does it cost me anything?">
        <p>
          No. If you buy through one of our affiliate links, you pay the same
          price you would pay on Amazon. VOXYFI may receive a small commission
          from Amazon on qualifying purchases, which helps support the app at no
          additional cost to you.
        </p>
      </LegalSection>

      <LegalSection heading="Trademarks">
        <p>
          Amazon and the Amazon logo are trademarks of Amazon.com, Inc. or its
          affiliates. VOXYFI is an independent participant in the Amazon
          Associates Program and is not endorsed by, sponsored by, or affiliated
          with Amazon beyond that program.
        </p>
      </LegalSection>
    </article>
  )
}
