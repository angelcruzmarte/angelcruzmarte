// Server-side first-page PDF renderer.
//
// Renders page 1 of a PDF (already downloaded as a Buffer) to a JPEG using
// pdf.js's legacy build together with @napi-rs/canvas — a prebuilt native
// canvas that runs on Vercel's Linux serverless functions. This lets the
// Google Drive / cloud import path produce a real, high-quality first-page
// thumbnail entirely on the server, so imported documents get a branded
// preview immediately without relying on the client-side self-heal path.
//
// Server-only: never import this into a client component.

import "server-only"

// pdf.js reaches for a handful of browser globals (DOMMatrix, Path2D,
// ImageData) at module + render time. @napi-rs/canvas provides Node
// implementations; install them globally before pdf.js renders.
import {
  createCanvas,
  DOMMatrix as NapiDOMMatrix,
  Path2D as NapiPath2D,
  ImageData as NapiImageData,
} from "@napi-rs/canvas"

type Globalish = Record<string, unknown>

function ensurePdfGlobals() {
  const g = globalThis as unknown as Globalish
  if (typeof g.DOMMatrix === "undefined") g.DOMMatrix = NapiDOMMatrix
  if (typeof g.Path2D === "undefined") g.Path2D = NapiPath2D
  if (typeof g.ImageData === "undefined") g.ImageData = NapiImageData
}

/**
 * Renders the first page of a PDF buffer to a JPEG buffer at `width` px wide.
 * Fills white first so transparent regions don't come out black. Returns null
 * on any failure (best-effort — callers should treat a null as "no thumbnail").
 */
export async function renderPdfFirstPageToJpegBuffer(
  pdf: Buffer,
  width = 640,
): Promise<Buffer | null> {
  try {
    ensurePdfGlobals()

    // Legacy build is transpiled and Node-friendly. Import lazily so the native
    // canvas globals are in place first and so client bundles never pull it in.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")

    // pdf.js expects a Uint8Array it can detach; copy into a fresh one.
    const data = new Uint8Array(pdf)
    // In Node (no workerSrc configured) pdf.js automatically runs on a fake
    // worker on the main thread, so no worker option is needed here.
    const doc = await pdfjs.getDocument({
      data,
      isEvalSupported: false,
      // Avoid trying to fetch standard fonts/cmaps over the network at runtime.
      useSystemFonts: true,
    }).promise

    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = width / base.width
    const viewport = page.getViewport({ scale })

    const canvas = createCanvas(
      Math.floor(viewport.width),
      Math.floor(viewport.height),
    )
    const ctx = canvas.getContext("2d")
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({
      // @napi-rs/canvas' context is API-compatible with pdf.js' expectations.
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise

    const jpeg = canvas.toBuffer("image/jpeg", 82)
    await doc.cleanup().catch(() => {})
    return jpeg
  } catch (err) {
    console.log(
      "[v0] server pdf thumbnail render failed:",
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}
