"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  LogOut,
  User as UserIcon,
  ArrowUp,
  BarChart3,
  CreditCard,
} from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { usePlatform } from "@/hooks/use-platform"
import { buttonVariants } from "@/components/ui/button"
import { PremiumBadge } from "@/components/premium-badge"
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
  isSubscribed?: boolean
  image?: string | null
}

export function UserMenu({ name, email, isSubscribed, image }: Props) {
  const router = useRouter()
  const { isIOS } = usePlatform()

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
          "relative rounded-full shadow-sm transition-transform duration-200 hover:scale-105 focus-visible:scale-105",
          isSubscribed &&
            "ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
        aria-label={
          isSubscribed ? "Account menu (Premium)" : "Account menu (Free plan)"
        }
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image || "/placeholder.svg"}
            alt=""
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          <span className="text-sm font-semibold">{initials || "U"}</span>
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
              <PremiumBadge size="sm" className="mt-0.5" />
            ) : (
              <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                Free plan
              </span>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {!isSubscribed && !isIOS && (
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
        <DropdownMenuItem render={<Link href="/app/profile" />}>
          <UserIcon className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/app/stats" />}>
          <BarChart3 className="mr-2 h-4 w-4" />
          Statistics
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/account" />}>
          <CreditCard className="mr-2 h-4 w-4" />
          Account &amp; billing
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
