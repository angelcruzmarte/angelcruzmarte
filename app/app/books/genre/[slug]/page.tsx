import { notFound } from "next/navigation"
import type { Metadata } from "next"
import {
  getBooksByGenre,
  getFavoriteBookIds,
  getGenreLanguages,
  getOwnedBookIds,
  resolveGenreBySlug,
} from "@/app/actions/books"
import { GenreBrowser } from "@/components/genre-browser"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const category = await resolveGenreBySlug(slug)
  if (!category) return { title: "Genre not found" }
  return {
    title: `${category} audiobooks · VOXYFI`,
    description: `Browse every ${category} title in the VOXYFI library and listen with lifelike AI narration.`,
  }
}

export default async function GenrePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string; lang?: string }>
}) {
  const { slug } = await params
  const { page: pageParam, lang } = await searchParams

  const category = await resolveGenreBySlug(slug)
  if (!category) notFound()

  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1)

  const [data, languages, ownedIds, favoriteIds] = await Promise.all([
    getBooksByGenre({ category, page, language: lang }),
    getGenreLanguages(category),
    getOwnedBookIds(),
    getFavoriteBookIds(),
  ])

  return (
    <div className="px-4 py-6 sm:px-6">
      <GenreBrowser
        slug={slug}
        data={data}
        languages={languages}
        ownedIds={Array.from(ownedIds)}
        favoriteIds={Array.from(favoriteIds)}
      />
    </div>
  )
}
