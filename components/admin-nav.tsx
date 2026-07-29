"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BookOpen,
  CircleDollarSign,
  Filter,
  LayoutDashboard,
  Library,
  Tag,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Clean, root-relative paths served from the admin subdomain
// (admin.<root>). The proxy maps them onto the /admin route tree.
const LINKS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/finance", label: "Finance", icon: CircleDollarSign },
  { href: "/funnel", label: "Pricing funnel", icon: Filter },
  { href: "/promotions", label: "Promotions", icon: Tag },
  { href: "/books", label: "Books", icon: BookOpen },
  { href: "/users", label: "Users", icon: Users },
  { href: "/content", label: "Content", icon: Library },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-visible">
      {LINKS.map((link) => {
        // On the subdomain, pathname is the clean path ("/finance"); when the
        // panel is accessed via /admin directly it carries the "/admin" prefix.
        const normalized = pathname.replace(/^\/admin/, "") || "/"
        const active =
          link.href === "/"
            ? normalized === "/"
            : normalized.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <link.icon className="h-4 w-4" />
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
