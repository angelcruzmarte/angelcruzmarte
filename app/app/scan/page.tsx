import { ScanBookCover } from "@/components/scan-book-cover"

export const metadata = {
  title: "Scan a book cover",
  description:
    "Point your camera at a book cover and VOXYFI identifies it — read & listen, wishlist, shop, or import your own file.",
}

export default function ScanPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
          Scan a book cover
        </h1>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Point your camera at any book&apos;s front cover and we&apos;ll find it
          for you.
        </p>
      </header>

      <ScanBookCover />
    </div>
  )
}
