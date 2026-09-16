import type { Metadata } from "next"
import { VerifyEmailClient } from "@/components/verify-email-client"

// Transactional email-verification page — not for search.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams
  return <VerifyEmailClient email={email ?? ""} />
}
