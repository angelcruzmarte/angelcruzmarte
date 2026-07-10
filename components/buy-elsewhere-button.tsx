"use client"

import { ExternalLink, Store } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * "Buy somewhere else" — like Speechify, lets the user buy ANY book from an
 * external retailer without needing an exact catalog match. Each option is a
 * search on that store built from the book's title + author, so it works for
 * every book regardless of whether we carry it.
 */
export function BuyElsewhereButton({
  title,
  author,
  className,
}: {
  title: string
  author?: string | null
  className?: string
}) {
  const query = encodeURIComponent([title, author].filter(Boolean).join(" "))

  const retailers: Array<{ name: string; url: string }> = [
    { name: "Amazon", url: `https://www.amazon.com/s?k=${query}&i=stripbooks` },
    {
      name: "Apple Books",
      url: `https://books.apple.com/us/search?term=${query}`,
    },
    {
      name: "Google Play Books",
      url: `https://play.google.com/store/search?q=${query}&c=books`,
    },
    {
      name: "Barnes & Noble",
      url: `https://www.barnesandnoble.com/s/${query}`,
    },
    {
      name: "Bookshop.org",
      url: `https://bookshop.org/beta-search?keywords=${query}`,
    },
    {
      name: "Kobo",
      url: `https://www.kobo.com/us/en/search?query=${query}`,
    },
  ]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="lg"
            variant="outline"
            className={"gap-2 " + (className ?? "")}
          />
        }
      >
        <Store className="h-4 w-4" />
        Buy somewhere else
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Choose a store</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {retailers.map((r) => (
          <DropdownMenuItem
            key={r.name}
            className="flex items-center justify-between gap-2"
            render={
              <a href={r.url} target="_blank" rel="noopener noreferrer" />
            }
          >
            {r.name}
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
