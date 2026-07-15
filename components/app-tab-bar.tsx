"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Library, BookOpen } from "lucide-react"
import { AddSheet, AddSheetTrigger } from "@/components/add-sheet"
import { cn } from "@/lib/utils"

const tabs = [
  { href: "/app", label: "Home", icon: Home, exact: true },
  { href: "/app/library", label: "Library", icon: Library },
  { href: "/app/books", label: "Books", icon: BookOpen },
]

export function AppTabBar() {
  const pathname = usePathname()
  const [sheetOpen, setSheetOpen] = useState(false)

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  // The listen page is an immersive player with its own fixed playback bar at
  // the bottom. Hide the global tab bar there so it doesn't cover the controls.
  if (pathname?.startsWith("/app/listen")) return null

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
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-xs font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 items-center justify-center rounded-full px-4 transition-colors",
                    active && "bg-primary/12 text-primary",
                  )}
                >
                  <Icon
                    className="h-5 w-5"
                    strokeWidth={active ? 2.25 : 1.75}
                    aria-hidden="true"
                  />
                </span>
                {tab.label}
              </Link>
            )
          })}
          <AddSheetTrigger onOpen={() => setSheetOpen(true)} />
        </div>
      </div>
      <AddSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </nav>
  )
}
