import { AddContent } from "@/components/add-content"

type Mode = "text" | "link" | "file" | "scan"

export default async function NewPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const { mode } = await searchParams

  // Dictation is now a full-screen action rather than an editor mode, so a
  // `?mode=dictate` deep link opens the text editor and auto-launches the
  // recorder. Everything else maps to its editor mode.
  const autoDictate = mode === "dictate"
  const normalized: Mode =
    mode === "link" || mode === "file" || mode === "scan" ? mode : "text"

  return <AddContent initialMode={normalized} autoDictate={autoDictate} />
}
