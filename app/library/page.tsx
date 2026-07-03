import { redirect } from "next/navigation"

// Legacy route — the app now lives under /app with its own tabbed shell.
export default function LegacyLibraryRedirect() {
  redirect("/app/library")
}
