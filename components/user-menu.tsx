"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  LayoutDashboard,
  LogOut,
  User as UserIcon,
  Sparkles,
  ArrowUp,
} from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Props = {
  name: string
  email: string
  isAdmin: boolean
  isSubscribed?: boolean
}

export function UserMenu({ name, email, isAdmin, isSubscribed }: Props) {
  const router = useRouter()

  async function handleSignOut() {
    await authClient.signOut()
    router.push("/")
    router.refresh()
  }

  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "secondary", size: "icon" }),
          "relative rounded-full",
          isSubscribed &&
            "ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
        aria-label={
          isSubscribed ? "Account menu (Premium)" : "Account menu (Free plan)"
        }
      >
        <span className="text-sm font-semibold">{initials || "U"}</span>
        {isSubscribed && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
            <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-1.5">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {email}
            </span>
            {isSubscribed ? (
              <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Premium
              </span>
            ) : (
              <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Free plan
              </span>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {!isSubscribed && (
          <>
            <DropdownMenuItem
              render={<Link href="/subscribe" />}
              className="font-medium text-primary focus:text-primary"
            >
              <ArrowUp className="mr-2 h-4 w-4" />
              Upgrade to Premium
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem render={<Link href="/account" />}>
          <UserIcon className="mr-2 h-4 w-4" />
          Account &amp; billing
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem render={<Link href="/admin" />}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Admin dashboard
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
