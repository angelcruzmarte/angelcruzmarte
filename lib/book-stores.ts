// Builds "buy anywhere" search links for a book across popular retailers and
// libraries. Each store gets a search URL keyed on the title + author so the
// user lands on the right product page regardless of which store they prefer.

export type BookStore = {
  id: string
  label: string
  /** Short grouping used in the menu ("Buy" vs "Borrow"). */
  kind: "buy" | "borrow"
  /** Builds the search/destination URL for a given query. */
  href: (query: string) => string
}

export const BOOK_STORES: BookStore[] = [
  {
    id: "amazon",
    label: "Amazon",
    kind: "buy",
    href: (q) => `https://www.amazon.com/s?k=${q}&i=stripbooks`,
  },
  {
    id: "bookshop",
    label: "Bookshop.org",
    kind: "buy",
    href: (q) => `https://bookshop.org/search?keywords=${q}`,
  },
  {
    id: "barnesnoble",
    label: "Barnes & Noble",
    kind: "buy",
    href: (q) => `https://www.barnesandnoble.com/s/${q}`,
  },
  {
    id: "applebooks",
    label: "Apple Books",
    kind: "buy",
    href: (q) => `https://books.apple.com/us/search?term=${q}`,
  },
  {
    id: "googlebooks",
    label: "Google Play Books",
    kind: "buy",
    href: (q) => `https://play.google.com/store/search?q=${q}&c=books`,
  },
  {
    id: "kobo",
    label: "Kobo",
    kind: "buy",
    href: (q) => `https://www.kobo.com/us/en/search?query=${q}`,
  },
  {
    id: "abebooks",
    label: "AbeBooks (used)",
    kind: "buy",
    href: (q) => `https://www.abebooks.com/servlet/SearchResults?kn=${q}`,
  },
  {
    id: "worldcat",
    label: "Libraries (WorldCat)",
    kind: "borrow",
    href: (q) => `https://search.worldcat.org/search?q=${q}`,
  },
  {
    id: "openlibrary",
    label: "Open Library",
    kind: "borrow",
    href: (q) => `https://openlibrary.org/search?q=${q}`,
  },
]

/**
 * Optional Bookshop.org affiliate/partner id. When set, buy links become
 * commission-earning affiliate links; when absent, they gracefully fall back to
 * plain Bookshop.org links so the feature still works before the partnership is
 * finalized. Exposed as NEXT_PUBLIC_ so it can be read on the client too.
 */
export const BOOKSHOP_AFFILIATE_ID =
  process.env.NEXT_PUBLIC_BOOKSHOP_AFFILIATE_ID || ""

/**
 * Builds the best Bookshop.org buy link for a title:
 *  - With an ISBN → a deep link to that exact edition
 *    (`/a/<affiliate>/<isbn>` when an affiliate id exists, otherwise
 *    `/book/<isbn>`).
 *  - Without an ISBN → a keyword search (affiliate-tagged when possible).
 * An explicit `buyUrl` override always wins and is returned as-is.
 */
export function bookshopBuyUrl(input: {
  title: string
  author?: string | null
  isbn?: string | null
  buyUrl?: string | null
}) {
  if (input.buyUrl && input.buyUrl.trim()) return input.buyUrl.trim()

  const isbn = (input.isbn || "").replace(/[^0-9Xx]/g, "")
  const aff = BOOKSHOP_AFFILIATE_ID

  if (isbn) {
    return aff
      ? `https://bookshop.org/a/${aff}/${isbn}`
      : `https://bookshop.org/book/${isbn}`
  }

  const query = encodeURIComponent(
    [input.title, input.author].filter(Boolean).join(" ").trim(),
  )
  return aff
    ? `https://bookshop.org/a/${aff}/search?keywords=${query}`
    : `https://bookshop.org/search?keywords=${query}`
}

/**
 * The single bookstore the app is connected to for one-tap buying (like
 * Speechify). Bookshop.org carries essentially every in-print book, so users
 * can buy any title without choosing a retailer. Affiliate-tagged when an id is
 * configured.
 */
export function bookstoreUrl(title: string, author?: string | null) {
  return bookshopBuyUrl({ title, author })
}

/** Returns store links for a specific book (title + author). */
export function storeLinksFor(title: string, author: string) {
  const query = encodeURIComponent(
    [title, author].filter(Boolean).join(" ").trim(),
  )
  return BOOK_STORES.map((store) => ({
    id: store.id,
    label: store.label,
    kind: store.kind,
    url: store.href(query),
  }))
}
