import Link from "next/link"
import { FileX2, Plus } from "lucide-react"
import { getDocuments } from "@/app/actions/documents"
import { DocumentList } from "@/components/document-list"
import { buttonVariants } from "@/components/ui/button"

export default async function LibraryPage() {
  const docs = await getDocuments()

  return (
    <div className="px-4 py-6 sm:px-6">
      <h1 className="mb-5 text-3xl font-bold tracking-tight">Library</h1>

      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-secondary text-muted-foreground">
            <FileX2 className="h-9 w-9" />
          </span>
          <p className="text-lg font-medium text-muted-foreground">
            No files yet
          </p>
          <Link
            href="/app/new"
            className={buttonVariants({ size: "lg" }) + " gap-2"}
          >
            <Plus className="h-4 w-4" />
            Add
          </Link>
        </div>
      ) : (
        <DocumentList documents={docs} />
      )}
    </div>
  )
}
