import { AddContent } from "@/components/add-content"

type Mode = "text" | "link" | "file" | "dictate"

export default async function NewPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const { mode } = await searchParams
  const normalized: Mode =
    mode === "link" || mode === "file" || mode === "dictate"
      ? mode
      : mode === "scan"
        ? "file"
        : "text"

  return <AddContent initialMode={normalized} />
}
