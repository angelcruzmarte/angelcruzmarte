"use client"

import { useCallback, useRef, useState } from "react"
import {
  cloudConfig,
  GOOGLE_EXPORT_MIME,
  GOOGLE_DRIVE_MIME_TYPES,
  isCloudProviderConfigured,
  type CloudProviderId,
} from "@/lib/cloud-providers"

type PickResult = {
  url: string
  name: string
  auth?: string
  mimeType?: string
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
        resolve(f ? { url: f.link, name: f.name } : null)
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
        resolve(url ? { url, name: f.name } : null)
      },
      cancel: () => resolve(null),
      error: (e: unknown) =>
        reject(e instanceof Error ? e : new Error("OneDrive error.")),
    })
  })
}

// --- Google Drive (custom browser, no developer API key needed) -------------
// We request a read-only OAuth token via Google Identity Services and then call
// the Drive REST API directly with that token. This deliberately avoids the
// Google Picker, which requires a classic "AIza" browser API key that newer
// Google Cloud projects can no longer issue.
async function getGoogleToken(): Promise<string> {
  await loadScript("https://accounts.google.com/gsi/client")
  const g = (window as any).google
  if (!g?.accounts?.oauth2) {
    throw new Error("Google sign-in failed to load.")
  }
  return new Promise((resolve, reject) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: cloudConfig.googleClientId,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      callback: (resp: any) => {
        if (resp?.access_token) resolve(resp.access_token)
        else reject(new Error("Google sign-in was cancelled."))
      },
      error_callback: () =>
        reject(new Error("Google sign-in was cancelled.")),
    })
    client.requestAccessToken()
  })
}

async function listGoogleDriveFiles(token: string): Promise<DriveFile[]> {
  const q = `(${GOOGLE_DRIVE_MIME_TYPES.map((m) => `mimeType='${m}'`).join(
    " or ",
  )}) and trashed=false`
  const params = new URLSearchParams({
    q,
    fields: "files(id,name,mimeType,modifiedTime,size)",
    orderBy: "modifiedTime desc",
    pageSize: "100",
    spaces: "drive",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  })
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    throw new Error("Could not list your Google Drive files.")
  }
  const data = (await res.json()) as { files?: DriveFile[] }
  return data.files ?? []
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

export function useCloudImport(onDone: (id: number) => void) {
  const [status, setStatus] = useState<Status>("idle")
  const [activeProvider, setActiveProvider] = useState<CloudProviderId | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)

  // Google Drive custom browser state.
  const [driveOpen, setDriveOpen] = useState(false)
  const [driveFiles, setDriveFiles] = useState<DriveFile[] | null>(null)
  const tokenRef = useRef<string | null>(null)

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

      // Google Drive: sign in, list files, and open our own browser.
      if (provider === "google-drive") {
        busyRef.current = true
        setStatus("picking")
        setDriveOpen(true)
        setDriveFiles(null)
        try {
          const token = await getGoogleToken()
          tokenRef.current = token
          const files = await listGoogleDriveFiles(token)
          setDriveFiles(files)
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Could not open Google Drive.",
          )
          setDriveOpen(false)
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
    [runImport],
  )

  // Google Drive: import the file the user tapped in our browser.
  const selectDriveFile = useCallback(
    async (file: DriveFile) => {
      const token = tokenRef.current
      if (!token || busyRef.current) return
      busyRef.current = true
      setError(null)
      try {
        await runImport(driveFileToPick(file, token))
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not import that file.",
        )
        setStatus("picking")
      } finally {
        busyRef.current = false
      }
    },
    [runImport],
  )

  const closeDrive = useCallback(() => {
    setDriveOpen(false)
    setDriveFiles(null)
    setStatus("idle")
    setActiveProvider(null)
    tokenRef.current = null
    busyRef.current = false
  }, [])

  return {
    importFrom,
    status,
    activeProvider,
    error,
    setError,
    // Google Drive browser
    driveOpen,
    driveFiles,
    selectDriveFile,
    closeDrive,
  }
}
