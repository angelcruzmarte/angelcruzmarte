"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react"
import { setUserRole } from "@/app/actions/admin"
import { Button } from "@/components/ui/button"

export function AdminUserRoleToggle({
  userId,
  role,
  disabled,
}: {
  userId: string
  role: string
  disabled?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const isAdmin = role === "admin"

  function toggle() {
    startTransition(async () => {
      await setUserRole(userId, isAdmin ? "user" : "admin")
      router.refresh()
    })
  }

  return (
    <Button
      variant={isAdmin ? "secondary" : "default"}
      size="sm"
      onClick={toggle}
      disabled={disabled || pending}
      className="gap-2"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isAdmin ? (
        <ShieldOff className="h-4 w-4" />
      ) : (
        <ShieldCheck className="h-4 w-4" />
      )}
      {isAdmin ? "Revoke admin" : "Make admin"}
    </Button>
  )
}
