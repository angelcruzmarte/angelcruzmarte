"use client"

import { useCallback, useRef, useState } from "react"
import {
  cloudConfig,
  GOOGLE_EXPORT_MIME,
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

const DROPBOX_EXTENSIONS = [".pdf", ".docx", ".epub", ".txt", ".md", ".markdown"]

const GOOGLE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/epub+zip",
  "text/plain",
  "text/markdown",
  "application/vnd.google-apps.document",
].join(",")

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

// --- Google Drive Picker ----------------------------------------------------
async function pickGoogleDrive(): Promise<PickResult | null> {
  await Promise.all([
    loadScript("https://apis.google.com/js/api.js"),
    loadScript("https://accounts.google.com/gsi/client"),
  ])
  const g = (window as any).google
  const gapi = (window as any).gapi
  if (!g?.accounts?.oauth2 || !gapi) {
    throw new Error("Google Picker failed to load.")
  }

  // 1) Get a read-only access token via Google Identity Services.
  const token: string = await new Promise((resolve, reject) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: cloudConfig.googleClientId,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      callback: (resp: any) => {
        if (resp?.access_token) resolve(resp.access_token)
        else reject(new Error("Google sign-in was cancelled."))
      },
    })
    client.requestAccessToken()
  })

  // 2) Load the picker module.
  await new Promise<void>((resolve) => gapi.load("picker", () => resolve()))

  // 3) Show the picker and resolve with the chosen document.
  return new Promise((resolve, reject) => {
    try {
      const view = new g.picker.DocsView(g.picker.ViewId.DOCS)
        .setIncludeFolders(false)
        .setMimeTypes(GOOGLE_MIME_TYPES)
      const picker = new g.picker.PickerBuilder()
        .setOAuthToken(token)
        .setDeveloperKey(cloudConfig.googleApiKey)
        .addView(view)
        .setCallback((data: any) => {
          const action = data?.[g.picker.Response.ACTION]
          if (action === g.picker.Action.PICKED) {
            const doc = data[g.picker.Response.DOCUMENTS]?.[0]
            if (!doc) return resolve(null)
            const id = doc[g.picker.Document.ID]
            const name = doc[g.picker.Document.NAME] ?? "document"
            const mimeType = doc[g.picker.Document.MIME_TYPE] ?? ""
            const isGoogleDoc = mimeType.startsWith("application/vnd.google-apps")
            const url = isGoogleDoc
              ? `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(GOOGLE_EXPORT_MIME)}`
              : `https://www.googleapis.com/drive/v3/files/${id}?alt=media`
            resolve({
              url,
              name: isGoogleDoc && !/\.\w+$/.test(name) ? `${name}.docx` : name,
              auth: `Bearer ${token}`,
              mimeType: isGoogleDoc ? GOOGLE_EXPORT_MIME : mimeType,
            })
          } else if (action === g.picker.Action.CANCEL) {
            resolve(null)
          }
        })
        .build()
      picker.setVisible(true)
    } catch (e) {
      reject(e instanceof Error ? e : new Error("Google Picker error."))
    }
  })
}

async function pick(provider: CloudProviderId): Promise<PickResult | null> {
  switch (provider) {
    case "dropbox":
      return pickDropbox()
    case "google-drive":
      return pickGoogleDrive()
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

  const importFrom = useCallback(
    async (provider: CloudProviderId) => {
      if (busyRef.current) return
      if (!isCloudProviderConfigured(provider)) {
        setError("This provider isn't set up yet.")
        return
      }
      busyRef.current = true
      setError(null)
      setActiveProvider(provider)
      setStatus("picking")
      try {
        const picked = await pick(provider)
        if (!picked) {
          setStatus("idle")
          setActiveProvider(null)
          busyRef.current = false
          return
        }
        setStatus("importing")
        const res = await fetch("/api/documents/import-cloud", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(picked),
        })
        const data = (await res.json()) as { id?: number; error?: string }
        if (!res.ok || !data.id) {
          setError(data.error ?? "Could not import that file.")
          setStatus("idle")
          setActiveProvider(null)
          busyRef.current = false
          return
        }
        onDone(data.id)
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
    [onDone],
  )

  return { importFrom, status, activeProvider, error, setError }
}
