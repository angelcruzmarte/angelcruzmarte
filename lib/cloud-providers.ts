// Cloud import providers (Google Drive, Dropbox, OneDrive).
//
// Each provider needs a *public* app key / client ID created in that provider's
// developer console. They are read from NEXT_PUBLIC_* env vars so the browser
// can use them. When a key is missing the provider stays visible but shows a
// "Set up" hint instead of being clickable — so the feature activates
// automatically as soon as the corresponding key is added to the project.
//
// Google Drive uses the official Google Picker together with the narrow
// `drive.file` OAuth scope. `drive.file` is a NON-sensitive scope: it grants
// access only to the specific files the user picks, so the app needs NO Google
// OAuth verification or CASA security assessment and every public user can use
// it without the "Google hasn't verified this app" warning. This is the
// production-correct, publicly-distributable choice. The Picker requires both
// the OAuth client ID and a browser API key.
//
// Required env vars per provider:
//   Dropbox           -> NEXT_PUBLIC_DROPBOX_APP_KEY
//   Google Drive      -> NEXT_PUBLIC_GOOGLE_CLIENT_ID + NEXT_PUBLIC_GOOGLE_PICKER_API_KEY
//   Microsoft OneDrive-> NEXT_PUBLIC_ONEDRIVE_CLIENT_ID
//
// The Google browser API key ("Voxyfi Google Picker") is a PUBLIC key by
// design — the Picker needs it in the browser — so it lives in the
// NEXT_PUBLIC_GOOGLE_PICKER_API_KEY var and is protected by HTTP-referrer
// restrictions in Google Cloud, never by secrecy. It is NOT an OAuth client
// secret, and there is no legacy-key fallback.

export type CloudProviderId = "dropbox" | "google-drive" | "onedrive"

// Reference each var statically so Next.js inlines it into the client bundle.
export const cloudConfig = {
  dropboxAppKey: process.env.NEXT_PUBLIC_DROPBOX_APP_KEY ?? "",
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  // Dedicated "Voxyfi Google Picker" browser key. This is the ONLY source for
  // the Picker developer key — there is intentionally no legacy fallback, so
  // the app can never silently use an old key.
  googleApiKey: process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? "",
  onedriveClientId: process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID ?? "",
}

export function isCloudProviderConfigured(id: CloudProviderId): boolean {
  switch (id) {
    case "dropbox":
      return Boolean(cloudConfig.dropboxAppKey)
    case "google-drive":
      // The Picker needs BOTH the OAuth client ID and a browser API key.
      return Boolean(cloudConfig.googleClientId && cloudConfig.googleApiKey)
    case "onedrive":
      return Boolean(cloudConfig.onedriveClientId)
    default:
      return false
  }
}

// The Cloud project NUMBER (Picker `appId`), derived from the OAuth client ID
// whose form is "<projectNumber>-<random>.apps.googleusercontent.com". Passing
// it to the Picker avoids cross-project access issues.
export function googleAppId(): string {
  return cloudConfig.googleClientId.split("-")[0] ?? ""
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
