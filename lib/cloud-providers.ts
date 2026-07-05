// Cloud import providers (Google Drive, Dropbox, OneDrive).
//
// Each provider needs a *public* app key / client ID created in that provider's
// developer console. They are read from NEXT_PUBLIC_* env vars so the browser
// pickers can use them. When a key is missing the provider stays visible but
// shows a "Set up" hint instead of being clickable — so the feature activates
// automatically as soon as the corresponding key is added to the project.
//
// Required env vars per provider:
//   Dropbox           -> NEXT_PUBLIC_DROPBOX_APP_KEY
//   Google Drive      -> NEXT_PUBLIC_GOOGLE_API_KEY + NEXT_PUBLIC_GOOGLE_CLIENT_ID
//   Microsoft OneDrive-> NEXT_PUBLIC_ONEDRIVE_CLIENT_ID

export type CloudProviderId = "dropbox" | "google-drive" | "onedrive"

// Reference each var statically so Next.js inlines it into the client bundle.
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""

export const cloudConfig = {
  dropboxAppKey: process.env.NEXT_PUBLIC_DROPBOX_APP_KEY ?? "",
  googleApiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "",
  googleClientId,
  // The Google Cloud project number is the numeric prefix of the OAuth client
  // ID. Passing it to the picker via setAppId makes developer-key validation
  // more reliable. Can be overridden with NEXT_PUBLIC_GOOGLE_APP_ID.
  googleAppId:
    process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? googleClientId.split("-")[0] ?? "",
  onedriveClientId: process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID ?? "",
}

export function isCloudProviderConfigured(id: CloudProviderId): boolean {
  switch (id) {
    case "dropbox":
      return Boolean(cloudConfig.dropboxAppKey)
    case "google-drive":
      return Boolean(cloudConfig.googleApiKey && cloudConfig.googleClientId)
    case "onedrive":
      return Boolean(cloudConfig.onedriveClientId)
    default:
      return false
  }
}

// File types we can turn into audio (mirrors lib/parse-document.ts support).
export const SUPPORTED_EXTENSIONS = [
  "txt",
  "md",
  "markdown",
  "pdf",
  "docx",
  "epub",
] as const

// Google Drive MIME types for the picker's document view + the export format we
// request for native Google Docs (converted to DOCX so our parser can read it).
export const GOOGLE_EXPORT_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
