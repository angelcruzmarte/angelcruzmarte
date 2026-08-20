import { getAllItemsForAdmin } from "@/app/actions/library"
import { AdminContentManager } from "@/components/admin-content-manager"

export default async function AdminContentPage() {
  const items = await getAllItemsForAdmin()

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
      <p className="mt-1 text-muted-foreground">
        Publish and manage the titles in your library.
      </p>
      <div className="mt-8">
        <AdminContentManager items={items} />
      </div>
    </div>
  )
}
