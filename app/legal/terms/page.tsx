import type { Metadata } from "next"
import { LegalTitle, LegalSection } from "@/components/legal"

export const metadata: Metadata = {
  title: "Terms of Service — VOXYFI",
  description: "The terms that govern your use of VOXYFI.",
}

export default function TermsPage() {
  return (
    <article>
      <LegalTitle title="Terms of Service" updated="June 30, 2026" />

      <LegalSection heading="1. Agreement to terms">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and
          use of VOXYFI (the &ldquo;Service&rdquo;). By creating an account or
          using the Service, you agree to be bound by these Terms. If you do not
          agree, do not use the Service.
        </p>
      </LegalSection>

      <LegalSection heading="2. Your account">
        <p>
          You must provide accurate information when creating an account and are
          responsible for keeping your password secure. You are responsible for
          all activity that occurs under your account. You must be at least 13
          years old (or the minimum age of digital consent in your country) to
          use the Service.
        </p>
      </LegalSection>

      <LegalSection heading="3. Subscriptions and billing">
        <p>
          VOXYFI offers paid subscription plans. By subscribing, you authorize us
          and our payment processor to charge the applicable fees to your payment
          method on a recurring basis until you cancel. Prices are shown before
          checkout and may change with notice.
        </p>
        <p>
          Your subscription renews automatically at the end of each billing
          period unless you cancel before the renewal date. You can cancel at any
          time from your account page; cancellation takes effect at the end of the
          current billing period.
        </p>
      </LegalSection>

      <LegalSection heading="4. Acceptable use">
        <p>
          You agree not to misuse the Service, including by uploading unlawful
          content, infringing the intellectual property of others, attempting to
          disrupt or reverse-engineer the Service, or using it to generate content
          that is illegal, harmful, or abusive. You are solely responsible for the
          text and files you submit.
        </p>
      </LegalSection>

      <LegalSection heading="5. Your content">
        <p>
          You retain ownership of the text, documents, and other materials you
          submit. You grant VOXYFI a limited license to process that content
          solely to provide the Service to you, such as converting text to speech
          or generating summaries. We do not claim ownership of your content.
        </p>
      </LegalSection>

      <LegalSection heading="6. Intellectual property">
        <p>
          The Service, including its software, design, and branding, is owned by
          VOXYFI and protected by law. These Terms do not grant you any right to
          use our trademarks or content except as necessary to use the Service.
        </p>
      </LegalSection>

      <LegalSection heading="7. Disclaimers and limitation of liability">
        <p>
          The Service is provided &ldquo;as is&rdquo; without warranties of any
          kind. To the maximum extent permitted by law, VOXYFI is not liable for
          any indirect, incidental, or consequential damages arising from your use
          of the Service.
        </p>
      </LegalSection>

      <LegalSection heading="8. Termination">
        <p>
          We may suspend or terminate your access if you violate these Terms. You
          may stop using the Service at any time. Certain provisions, such as
          intellectual property and limitation of liability, survive termination.
        </p>
      </LegalSection>

      <LegalSection heading="9. Changes to these terms">
        <p>
          We may update these Terms from time to time. If we make material
          changes, we will notify you through the Service or by email. Continued
          use after changes take effect constitutes acceptance.
        </p>
      </LegalSection>

      <LegalSection heading="10. Contact">
        <p>
          Questions about these Terms? Contact us at{" "}
          <a
            href="mailto:support@voxyfi.com"
            className="font-medium text-primary hover:underline"
          >
            support@voxyfi.com
          </a>
          .
        </p>
      </LegalSection>
    </article>
  )
}
