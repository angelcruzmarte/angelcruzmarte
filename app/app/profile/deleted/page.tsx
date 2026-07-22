import { getDeletedDocuments } from "@/app/actions/documents"
import { DeletedFilesView } from "@/components/deleted-files-view"

export const metadata = {
  title: "Deleted Files",
}

export default async function DeletedFilesPage() {
  const documents = await getDeletedDocuments()
  return <DeletedFilesView documents={documents} />
}
