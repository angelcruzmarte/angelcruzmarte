import type { Metadata } from "next"
import { ResetPasswordClient } from "@/components/reset-password-client"

// Token-based transactional page — not for search.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  return <ResetPasswordClient token={token ?? ""} />
}
