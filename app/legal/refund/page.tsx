import type { Metadata } from "next"
import { LegalTitle, LegalSection } from "@/components/legal"

export const metadata: Metadata = {
  title: "Refund Policy — VOXYFI",
  description: "VOXYFI's policy on subscription cancellations and refunds.",
}

export default function RefundPage() {
  return (
    <article>
      <LegalTitle title="Refund Policy" updated="June 30, 2026" />

      <LegalSection heading="Subscriptions">
        <p>
          VOXYFI is billed on a recurring basis according to the plan you choose.
          Your subscription renews automatically at the end of each billing period
          until you cancel.
        </p>
      </LegalSection>

      <LegalSection heading="Canceling">
        <p>
          You can cancel your subscription at any time from your account page.
          When you cancel, you keep access to premium features until the end of
          the current billing period, and you will not be charged again after
          that.
        </p>
      </LegalSection>

      <LegalSection heading="Refunds">
        <p>
          We offer a 14-day refund on your first subscription payment if you are
          not satisfied. To request a refund within this window, contact us with
          the email associated with your account.
        </p>
        <p>
          Renewal charges after the first period are generally non-refundable,
          except where required by law. If you believe you were charged in error,
          contact us and we will review your request promptly.
        </p>
      </LegalSection>

      <LegalSection heading="How to request a refund">
        <p>
          Email{" "}
          <a
            href="mailto:support@voxyfi.com"
            className="font-medium text-primary hover:underline"
          >
            support@voxyfi.com
          </a>{" "}
          from the address on your account and include your name and the reason
          for the request. Approved refunds are issued to your original payment
          method and may take several business days to appear.
        </p>
      </LegalSection>

      <LegalSection heading="Statutory rights">
        <p>
          Nothing in this policy limits any refund or cancellation rights you may
          have under the consumer-protection laws of your country or region.
        </p>
      </LegalSection>
    </article>
  )
}
