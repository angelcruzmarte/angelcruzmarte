import { auth } from "@/lib/auth"
import { AuthForm } from "@/components/auth-form"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ timeout?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect("/app")
  const { timeout } = await searchParams
  return (
    <AuthForm
      mode="sign-in"
      notice={
        timeout
          ? "You were signed out after a period of inactivity. Please sign in again."
          : undefined
      }
    />
  )
}
