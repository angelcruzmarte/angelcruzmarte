import type { Metadata } from "next"
import { LegalTitle, LegalSection } from "@/components/legal"

export const metadata: Metadata = {
  title: "Privacy Policy — VOXYFI",
  description: "How VOXYFI collects, uses, and protects your data.",
}

export default function PrivacyPage() {
  return (
    <article>
      <LegalTitle title="Privacy Policy" updated="June 30, 2026" />

      <LegalSection heading="Overview">
        <p>
          This Privacy Policy explains how VOXYFI collects, uses, and protects
          your information when you use the Service. We aim to collect only what
          we need to provide and improve VOXYFI.
        </p>
      </LegalSection>

      <LegalSection heading="Information we collect">
        <p>
          <strong className="text-foreground">Account information:</strong> your
          name, email address, and a securely hashed password.
        </p>
        <p>
          <strong className="text-foreground">Content you submit:</strong> the
          text, links, and documents you add so we can convert them to speech or
          generate summaries, quizzes, and podcasts.
        </p>
        <p>
          <strong className="text-foreground">Billing information:</strong>{" "}
          subscription status and identifiers from our payment processor. We do
          not store your full card details; those are handled by Stripe.
        </p>
        <p>
          <strong className="text-foreground">Usage data:</strong> basic,
          technical information such as interactions with features, used to keep
          the Service reliable and secure.
        </p>
      </LegalSection>

      <LegalSection heading="How we use your information">
        <p>
          We use your information to provide the Service, process payments,
          personalize content based on the interests you select, communicate with
          you about your account, and protect against fraud and abuse.
        </p>
      </LegalSection>

      <LegalSection heading="Service providers">
        <p>
          We share information with trusted providers who help us operate VOXYFI,
          including Stripe for payments, our database and hosting providers for
          storage, our email provider for transactional messages, and AI model
          providers for generating speech and summaries. These providers process
          data on our behalf under contractual safeguards.
        </p>
      </LegalSection>

      <LegalSection heading="Data retention">
        <p>
          We keep your account and content for as long as your account is active.
          You can delete your content at any time, and you may request deletion of
          your account by contacting us. Some records may be retained as required
          by law or for legitimate business purposes.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          Depending on where you live, you may have the right to access, correct,
          export, or delete your personal information, and to object to certain
          processing. To exercise these rights, contact us using the details
          below.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          We use industry-standard measures to protect your data, including
          encrypted connections and hashed passwords. No method of transmission or
          storage is completely secure, but we work to safeguard your information.
        </p>
      </LegalSection>

      <LegalSection heading="Children's privacy">
        <p>
          VOXYFI is not directed to children under 13, and we do not knowingly
          collect personal information from them.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. We will post the
          updated version here and update the date above.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          For privacy questions or requests, contact us at{" "}
          <a
            href="mailto:privacy@voxyfi.com"
            className="font-medium text-primary hover:underline"
          >
            privacy@voxyfi.com
          </a>
          .
        </p>
      </LegalSection>
    </article>
  )
}
