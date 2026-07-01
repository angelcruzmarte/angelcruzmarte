import { VerifyEmailClient } from "@/components/verify-email-client"

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams
  return <VerifyEmailClient email={email ?? ""} />
}
