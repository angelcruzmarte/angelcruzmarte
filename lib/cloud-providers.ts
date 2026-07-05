// Cloud import providers (Google Drive, Dropbox, OneDrive).
//
// Each provider needs a *public* app key / client ID created in that provider's
// developer console. They are read from NEXT_PUBLIC_* env vars so the browser
// can use them. When a key is missing the provider stays visible but shows a
// "Set up" hint instead of being clickable — so the feature activates
// automatically as soon as the corresponding key is added to the project.
//
// Google Drive uses a custom file browser built on the Drive REST API + an
// OAuth token from Google Identity Services, so it only needs the OAuth client
// ID (no developer/API key — the Google Picker is intentionally not used).
//
// Required env vars per provider:
//   Dropbox           -> NEXT_PUBLIC_DROPBOX_APP_KEY
//   Google Drive      -> NEXT_PUBLIC_GOOGLE_CLIENT_ID
//   Microsoft OneDrive-> NEXT_PUBLIC_ONEDRIVE_CLIENT_ID

export type CloudProviderId = "dropbox" | "google-drive" | "onedrive"

// Reference each var statically so Next.js inlines it into the client bundle.
export const cloudConfig = {
  dropboxAppKey: process.env.NEXT_PUBLIC_DROPBOX_APP_KEY ?? "",
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  onedriveClientId: process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID ?? "",
}

export function isCloudProviderConfigured(id: CloudProviderId): boolean {
  switch (id) {
    case "dropbox":
      return Boolean(cloudConfig.dropboxAppKey)
    case "google-drive":
      return Boolean(cloudConfig.googleClientId)
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

// Google Drive MIME types we can turn into audio, used to filter the Drive
// file listing so users only see importable documents.
export const GOOGLE_DRIVE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/epub+zip",
  "text/plain",
  "text/markdown",
  "application/vnd.google-apps.document",
] as const

// The export format we request for native Google Docs (converted to DOCX so
// our parser can read it).
export const GOOGLE_EXPORT_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
