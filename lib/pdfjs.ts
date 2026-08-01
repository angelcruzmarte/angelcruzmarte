// Shared client-only pdf.js loader.
//
// Uses the "legacy" build, which is transpiled for older browsers (e.g. the
// iOS in-app browsers many users open the app from), and points the worker at
// a copy served from /public so it resolves reliably across bundlers.
//
// This is the single source of truth for loading pdf.js — the reader
// (PdfFollowAlong) and the library thumbnail renderer both use it so the
// worker + polyfill setup can never drift apart.

export type PdfjsModule = typeof import("pdfjs-dist")

// Polyfill Promise.withResolvers on the main thread. pdf.js relies on it, but
// iOS Safari only shipped it in 17.4 — without this, older iPhones throw when
// loading a PDF.
function ensurePromiseWithResolvers() {
  const P = Promise as unknown as {
    withResolvers?: () => {
      promise: Promise<unknown>
      resolve: (v?: unknown) => void
      reject: (e?: unknown) => void
    }
  }
  if (typeof P.withResolvers !== "function") {
    P.withResolvers = function () {
      let resolve!: (v?: unknown) => void
      let reject!: (e?: unknown) => void
      const promise = new Promise<unknown>((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    }
  }
}

let pdfjsPromise: Promise<PdfjsModule> | null = null

/** Loads pdf.js once (client only) and configures its worker. */
export async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    ensurePromiseWithResolvers()
    pdfjsPromise = (
      import("pdfjs-dist/legacy/build/pdf.mjs") as unknown as Promise<PdfjsModule>
    ).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
      return pdfjs
    })
  }
  return pdfjsPromise
}
