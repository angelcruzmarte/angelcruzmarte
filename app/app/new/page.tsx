import { AddContent } from "@/components/add-content"

type Mode = "text" | "link" | "file" | "dictate" | "scan"

export default async function NewPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const { mode } = await searchParams
  const normalized: Mode =
    mode === "link" ||
    mode === "file" ||
    mode === "dictate" ||
    mode === "scan"
      ? mode
      : "text"

  return <AddContent initialMode={normalized} />
}
