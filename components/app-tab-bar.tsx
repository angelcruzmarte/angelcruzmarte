"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Library, Compass, BookOpen, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

const tabs = [
  { href: "/app", label: "Home", icon: Home, exact: true },
  { href: "/app/library", label: "Library", icon: Library },
  { href: "/app/discover", label: "Discover", icon: Compass },
  { href: "/app/books", label: "Books", icon: BookOpen },
]

export function AppTabBar() {
  const pathname = usePathname()

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto max-w-2xl px-4 pb-4">
        <div className="flex items-center justify-between gap-1 rounded-full border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
          {tabs.map((tab) => {
            const active = isActive(tab.href, tab.exact)
            const Icon = tab.icon
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 items-center justify-center rounded-full px-3 transition-colors",
                    active && "bg-secondary",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                {tab.label}
              </Link>
            )
          })}
          <Link
            href="/app/new"
            aria-label="Add content"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105"
          >
            <Plus className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </nav>
  )
}
