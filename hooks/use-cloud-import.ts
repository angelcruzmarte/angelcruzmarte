"use client"

import { useCallback, useRef, useState } from "react"
import {
  cloudConfig,
  googleAppId,
  GOOGLE_EXPORT_MIME,
  GOOGLE_DRIVE_MIME_TYPES,
  isCloudProviderConfigured,
  type CloudProviderId,
} from "@/lib/cloud-providers"
import { getCloudTrackedDocuments } from "@/app/actions/documents"

type CloudImportOptions = {
  // Called after background delta-sync re-imported one or more changed files,
  // so the caller can refresh the library. `count` is how many were updated.
  onSynced?: (count: number) => void
}

type PickResult = {
  url: string
  name: string
  auth?: string
  mimeType?: string
  // Cloud delta-sync origin, forwarded to the import route so the document
  // records where it came from and can be re-synced when the source changes.
  provider?: CloudProviderId
  fileId?: string
  revision?: string
  // When set, re-sync (update in place) this existing document id.
  docId?: number
}

type Status = "idle" | "picking" | "importing"

// A file listed from the user's Google Drive.
export type DriveFile = {
  id: string
  name: string
  mimeType: string
  modifiedTime?: string
  size?: string
}

const DROPBOX_EXTENSIONS = [".pdf", ".docx", ".epub", ".txt", ".md", ".markdown"]

// Loads an external script once and resolves when it's ready.
function loadScript(
  src: string,
  attrs?: Record<string, string>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    )
    if (existing) {
      if (existing.dataset.loaded === "true") resolve()
      else {
        existing.addEventListener("load", () => resolve())
        existing.addEventListener("error", () =>
          reject(new Error(`Failed to load ${src}`)),
        )
      }
      return
    }
    const script = document.createElement("script")
    script.src = src
    script.async = true
    if (attrs) for (const [k, v] of Object.entries(attrs)) script.setAttribute(k, v)
    script.addEventListener("load", () => {
      script.dataset.loaded = "true"
      resolve()
    })
    script.addEventListener("error", () =>
      reject(new Error(`Failed to load ${src}`)),
    )
    document.head.appendChild(script)
  })
}

// --- Dropbox Chooser --------------------------------------------------------
async function pickDropbox(): Promise<PickResult | null> {
  await loadScript("https://www.dropbox.com/static/api/2/dropins.js", {
    id: "dropboxjs",
    "data-app-key": cloudConfig.dropboxAppKey,
  })
  const Dropbox = (window as any).Dropbox
  if (!Dropbox) throw new Error("Dropbox chooser failed to load.")
  return new Promise((resolve, reject) => {
    Dropbox.choose({
      linkType: "direct",
      multiselect: false,
      extensions: DROPBOX_EXTENSIONS,
      success: (files: any[]) => {
        const f = files?.[0]
        resolve(
          f
            ? {
                url: f.link,
                name: f.name,
                provider: "dropbox",
                // Dropbox Chooser exposes a stable file id; there's no reusable
                // token or rev, so background re-sync isn't available, but the
                // origin is still tracked for consistency + future support.
                fileId: f.id,
              }
            : null,
        )
      },
      cancel: () => resolve(null),
      error: (e: unknown) =>
        reject(e instanceof Error ? e : new Error("Dropbox error.")),
    })
  })
}

// --- Microsoft OneDrive File Picker ----------------------------------------
async function pickOneDrive(): Promise<PickResult | null> {
  await loadScript("https://js.live.net/v7.2/OneDrive.js")
  const OneDrive = (window as any).OneDrive
  if (!OneDrive) throw new Error("OneDrive picker failed to load.")
  return new Promise((resolve, reject) => {
    OneDrive.open({
      clientId: cloudConfig.onedriveClientId,
      action: "download",
      multiSelect: false,
      advanced: {
        redirectUri: window.location.origin,
        filter: ".pdf,.docx,.epub,.txt,.md,.markdown",
      },
      success: (response: any) => {
        const f = response?.value?.[0]
        const url =
          f?.["@microsoft.graph.downloadUrl"] || f?.["@content.downloadUrl"]
        resolve(
          url
            ? {
                url,
                name: f.name,
                provider: "onedrive",
                fileId: f.id,
                // OneDrive items carry an eTag/cTag change token.
                revision: f.eTag ?? f.cTag,
              }
            : null,
        )
      },
      cancel: () => resolve(null),
      error: (e: unknown) =>
        reject(e instanceof Error ? e : new Error("OneDrive error.")),
    })
  })
}

// --- Google Drive (official Google Picker + narrow `drive.file` scope) -------
// We request an OAuth token via Google Identity Services using the NON-sensitive
// `drive.file` scope, then let the user choose a document with Google's own
// Picker. `drive.file` grants the app access ONLY to the specific files the
// user picks, so the app needs NO Google OAuth verification / CASA assessment
// and every public user can import without the "Google hasn't verified this
// app" warning. Listing the entire Drive (the old drive.readonly REST browser)
// is intentionally gone — that broad, restricted scope is exactly what forced
// app verification and produced the warning for non-test users.
const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"

// Cached OAuth token for the drive.file scope, reused across user actions within
// its lifetime so we DON'T re-authenticate (or pop up consent) on every click —
// we only request a new token when none is cached or the current one is
// expiring. Module-scoped so it survives component re-renders.
let cachedGoogleToken: { token: string; expiresAt: number } | null = null

async function getGoogleToken(forceRefresh = false): Promise<string> {
  // Reuse a still-valid token (60s safety buffer) unless a refresh is forced.
  if (
    !forceRefresh &&
    cachedGoogleToken &&
    cachedGoogleToken.expiresAt - 60_000 > Date.now()
  ) {
    return cachedGoogleToken.token
  }
  await loadScript("https://accounts.google.com/gsi/client")
  const g = (window as any).google
  if (!g?.accounts?.oauth2) {
    throw new Error("Google sign-in failed to load.")
  }
  return new Promise((resolve, reject) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: cloudConfig.googleClientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (resp: any) => {
        if (resp?.access_token) {
          const ttlMs = Number(resp.expires_in ?? 3600) * 1000
          cachedGoogleToken = {
            token: resp.access_token,
            expiresAt: Date.now() + ttlMs,
          }
          resolve(resp.access_token)
        } else reject(new Error("Google sign-in was cancelled."))
      },
      error_callback: () => reject(new Error("Google sign-in was cancelled.")),
    })
    client.requestAccessToken()
  })
}

// Fetches the Picker developer key from the server AT RUNTIME (it lives in the
// server-only GCP_API_KEY var). Cached module-side after the first success so
// opening the Picker repeatedly makes no extra requests.
let cachedPickerKey: string | null = null
async function fetchPickerApiKey(): Promise<string> {
  if (cachedPickerKey) return cachedPickerKey
  const res = await fetch("/api/integrations/google-picker-key")
  if (!res.ok) {
    throw new Error("Google Picker is not configured.")
  }
  const data = (await res.json()) as { apiKey?: string }
  if (!data.apiKey) throw new Error("Google Picker is not configured.")
  cachedPickerKey = data.apiKey
  return data.apiKey
}

// Loads the Picker library (part of Google's api.js) exactly once.
async function loadPicker(): Promise<any> {
  await loadScript("https://apis.google.com/js/api.js")
  const gapi = (window as any).gapi
  if (!gapi) throw new Error("Google Picker failed to load.")
  if (!(window as any).google?.picker) {
    await new Promise<void>((resolve, reject) =>
      gapi.load("picker", {
        callback: () => resolve(),
        onerror: () => reject(new Error("Google Picker failed to load.")),
      }),
    )
  }
  return (window as any).google.picker
}

// Opens the Google Picker filtered to importable document types and resolves
// with the chosen file id (or null if the user cancels/closes it).
async function openGooglePicker(token: string): Promise<string | null> {
  // Pull the developer key from the server at runtime; never pass an empty
  // value to the Picker (that surfaces Google's generic "API developer key is
  // invalid" message) — fetchPickerApiKey throws with a clear reason instead.
  const developerKey = await fetchPickerApiKey()
  const picker = await loadPicker()
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS)
      .setMimeTypes(GOOGLE_DRIVE_MIME_TYPES.join(","))
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setMode(picker.DocsViewMode.LIST)
    const builder = new picker.PickerBuilder()
      .setAppId(googleAppId())
      .setOAuthToken(token)
      .setDeveloperKey(developerKey)
      .setOrigin(window.location.protocol + "//" + window.location.host)
      .addView(view)
      .setTitle("Select a document to import")
      .setCallback((data: any) => {
        const action = data[picker.Response.ACTION]
        if (action === picker.Action.PICKED) {
          const docs = data[picker.Response.DOCUMENTS] ?? []
          resolve(docs[0]?.[picker.Document.ID] ?? null)
        } else if (action === picker.Action.CANCEL) {
          resolve(null)
        }
      })
    builder.build().setVisible(true)
  })
}

// Fetches metadata for a single file by id. Under `drive.file` the app can read
// exactly the files the user has picked, so this works for the current pick and
// for any previously-picked (tracked) file — without listing the whole Drive.
async function getDriveFileMeta(
  id: string,
  token: string,
): Promise<DriveFile | null> {
  const params = new URLSearchParams({
    fields: "id,name,mimeType,modifiedTime,size",
    supportsAllDrives: "true",
  })
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return null
  return (await res.json()) as DriveFile
}

// Turns a chosen Drive file + token into an importable download request.
function driveFileToPick(file: DriveFile, token: string): PickResult {
  const isGoogleDoc = file.mimeType.startsWith("application/vnd.google-apps")
  const url = isGoogleDoc
    ? `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(
        GOOGLE_EXPORT_MIME,
      )}`
    : `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`
  const name =
    isGoogleDoc && !/\.\w+$/.test(file.name) ? `${file.name}.docx` : file.name
  return {
    url,
    name,
    auth: `Bearer ${token}`,
    mimeType: isGoogleDoc ? GOOGLE_EXPORT_MIME : file.mimeType,
    provider: "google-drive",
    fileId: file.id,
    // modifiedTime is Drive's change token — bumps on every edit.
    revision: file.modifiedTime,
  }
}

async function pick(provider: CloudProviderId): Promise<PickResult | null> {
  switch (provider) {
    case "dropbox":
      return pickDropbox()
    case "onedrive":
      return pickOneDrive()
    default:
      return null
  }
}

export function useCloudImport(
  onDone: (id: number) => void,
  options?: CloudImportOptions,
) {
  const [status, setStatus] = useState<Status>("idle")
  const [activeProvider, setActiveProvider] = useState<CloudProviderId | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)

  // Keep the latest options in a ref so the reconcile callback never goes stale.
  const optionsRef = useRef(options)
  optionsRef.current = options

  // Holds the current Google OAuth token for the in-progress pick/import.
  const tokenRef = useRef<string | null>(null)

  // Background delta-sync: right after we obtain a fresh token, compare each
  // tracked Drive-sourced document's stored revision (modifiedTime) against the
  // live one and re-import the changed files IN PLACE. Under `drive.file` we
  // can't list the whole Drive, so we fetch each tracked file's metadata by id
  // (the app retains access to files the user previously picked). Reuses the
  // token we already hold, needs no extra consent, and never blocks the picker.
  // Fully best-effort and silent on failure.
  const reconcileDrive = useCallback(
    async (token: string) => {
      try {
        const tracked = await getCloudTrackedDocuments("google-drive")
        if (!tracked.length) return
        let synced = 0
        for (const t of tracked) {
          if (!t.cloudFileId) continue
          // Files the app no longer has a grant for return null and are skipped.
          const live = await getDriveFileMeta(t.cloudFileId, token)
          if (!live || !live.modifiedTime) continue
          if (live.modifiedTime === t.cloudRevision) continue // unchanged
          try {
            const picked = { ...driveFileToPick(live, token), docId: t.id }
            const res = await fetch("/api/documents/import-cloud", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(picked),
            })
            if (res.ok) synced++
          } catch {
            // Skip this one; other files still sync.
          }
        }
        if (synced > 0) optionsRef.current?.onSynced?.(synced)
      } catch {
        // Silent — delta-sync is a background nicety, never a blocker.
      }
    },
    [],
  )

  // Shared: send a picked file to the server importer.
  const runImport = useCallback(
    async (picked: PickResult) => {
      setStatus("importing")
      const res = await fetch("/api/documents/import-cloud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(picked),
      })
      const data = (await res.json()) as { id?: number; error?: string }
      if (!res.ok || !data.id) {
        throw new Error(data.error ?? "Could not import that file.")
      }
      onDone(data.id)
    },
    [onDone],
  )

  const importFrom = useCallback(
    async (provider: CloudProviderId) => {
      if (busyRef.current) return
      if (!isCloudProviderConfigured(provider)) {
        setError("This provider isn't set up yet.")
        return
      }
      setError(null)
      setActiveProvider(provider)

      // Google Drive: sign in with the narrow `drive.file` scope, open Google's
      // own Picker, and import the chosen file. No custom full-Drive browser.
      if (provider === "google-drive") {
        busyRef.current = true
        setStatus("picking")
        try {
          let token = await getGoogleToken()
          tokenRef.current = token
          // Background delta-sync for previously-imported Drive files.
          void reconcileDrive(token)
          const fileId = await openGooglePicker(token)
          if (!fileId) {
            // User closed/cancelled the Picker: stop here. Do NOT re-auth or
            // make any further Google API call automatically.
            setStatus("idle")
            setActiveProvider(null)
            busyRef.current = false
            return
          }
          let meta = await getDriveFileMeta(fileId, token)
          if (!meta) {
            // A null result can mean the cached token expired mid-session.
            // Refresh once and retry before giving up (refresh only when
            // necessary — never on a plain cancel or on page load).
            token = await getGoogleToken(true)
            tokenRef.current = token
            meta = await getDriveFileMeta(fileId, token)
          }
          if (!meta) throw new Error("Could not read the selected file.")
          await runImport(driveFileToPick(meta, token))
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Could not open Google Drive.",
          )
          setStatus("idle")
          setActiveProvider(null)
        } finally {
          busyRef.current = false
        }
        return
      }

      // Dropbox / OneDrive: use each provider's own picker.
      busyRef.current = true
      setStatus("picking")
      try {
        const picked = await pick(provider)
        if (!picked) {
          setStatus("idle")
          setActiveProvider(null)
          busyRef.current = false
          return
        }
        await runImport(picked)
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not import from the cloud.",
        )
        setStatus("idle")
        setActiveProvider(null)
      } finally {
        busyRef.current = false
      }
    },
    [runImport, reconcileDrive],
  )

  return {
    importFrom,
    status,
    activeProvider,
    error,
    setError,
  }
}
