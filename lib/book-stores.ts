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
 * The single bookstore the app is connected to for one-tap buying (like
 * Speechify). Bookshop.org carries essentially every in-print book, so users
 * can buy any title without choosing a retailer.
 */
export function bookstoreUrl(title: string, author?: string | null) {
  const query = encodeURIComponent(
    [title, author].filter(Boolean).join(" ").trim(),
  )
  return `https://bookshop.org/search?keywords=${query}`
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
