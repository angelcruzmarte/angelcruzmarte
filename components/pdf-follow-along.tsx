"use client"

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

// Polyfill Promise.withResolvers on the main thread. pdf.js relies on it, but
// iOS Safari only shipped it in 17.4 — without this, older iPhones throw when
// loading the PDF and the reader falls back to a single-page viewer.
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

// Temporary diagnostic beacon: reports client-side PDF load outcomes to the
// server so we can see what happens on real devices via Vercel logs.
function pdfDiag(data: Record<string, unknown>) {
  try {
    const body = JSON.stringify({
      ...data,
      nativeWithResolvers:
        typeof (Promise as unknown as { withResolvers?: unknown })
          .withResolvers === "function",
    })
    // keepalive so it still sends if the page navigates away.
    fetch("/api/pdf-diag", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // ignore
  }
}

// pdfjs is loaded dynamically (client only) so it never runs on the server.
// We use the "legacy" build, which is transpiled for older browsers (e.g. the
// iOS in-app browsers many users open the app from).
type PdfjsModule = typeof import("pdfjs-dist")
let pdfjsPromise: Promise<PdfjsModule> | null = null
async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    ensurePromiseWithResolvers()
    pdfjsPromise = (
      import("pdfjs-dist/legacy/build/pdf.mjs") as unknown as Promise<PdfjsModule>
    ).then((pdfjs) => {
      // Served from /public (legacy worker + polyfill prelude) so it resolves
      // reliably across bundlers and older browsers.
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
      return pdfjs
    })
  }
  return pdfjsPromise
}

/** A single narratable word with a link back to its rendered span. */
type WordEntry = {
  /** Global index across the whole document, in reading order. */
  index: number
  text: string
  page: number
  /** First word index of the sentence this word belongs to. */
  sentenceStart: number
  /** Last word index (inclusive) of the sentence this word belongs to. */
  sentenceEnd: number
}

export type PdfFollowAlongHandle = {
  /** Scroll so the given page (1-based) is at the top. */
  scrollToPage: (page: number) => void
}

type Props = {
  src: string
  /** Index (into the reported word list) currently being narrated, or -1. */
  activeWord: number
  /**
   * Overall playback progress (0..1). When provided, the document auto-scrolls
   * to this fraction of its height — a robust, word-independent way to follow
   * along through the whole document to the end. Use -1 to disable.
   */
  scrollFraction?: number
  /** Reports the extracted words (space-joined) once the PDF is parsed. */
  onWords?: (text: string, count: number) => void
  /** Fired when a word is tapped, to seek narration. */
  onWordClick?: (index: number) => void
  /** Reports the page currently in view / being read (1-based). */
  onPageChange?: (page: number, total: number) => void
  /** Called if the PDF cannot be rendered so the parent can fall back. */
  onError?: (message: string) => void
  className?: string
}

export const PdfFollowAlong = forwardRef<PdfFollowAlongHandle, Props>(
  function PdfFollowAlong(
    {
      src,
      activeWord,
      scrollFraction,
      onWords,
      onWordClick,
      onPageChange,
      onError,
      className,
    },
    ref,
  ) {
    // Whether the parent is driving scroll by playback fraction (premium voice).
    const fractionDriven =
      typeof scrollFraction === "number" && scrollFraction >= 0
    const containerRef = useRef<HTMLDivElement>(null)
    const [status, setStatus] = useState<"loading" | "ready" | "error">(
      "loading",
    )
    const [numPages, setNumPages] = useState(0)

    // Map global word index -> its span element (populated as pages render).
    const spanMap = useRef<Map<number, HTMLElement>>(new Map())
    // Ordered word metadata for the whole document.
    const wordsRef = useRef<WordEntry[]>([])
    // Per-page rendered flag to support lazy rendering.
    const renderedPages = useRef<Set<number>>(new Set())
    const pdfDocRef = useRef<Awaited<
      ReturnType<PdfjsModule["getDocument"]>["promise"]
    > | null>(null)
    // Guards against manual-scroll fighting the auto-scroll.
    const lastManualScroll = useRef(0)

    useImperativeHandle(ref, () => ({
      scrollToPage: (page: number) => {
        const el = containerRef.current?.querySelector<HTMLElement>(
          `[data-page="${page}"]`,
        )
        el?.scrollIntoView({ behavior: "smooth", block: "start" })
      },
    }))

    // ---- Load + parse the PDF, building the global word list -------------
    useEffect(() => {
      let cancelled = false
      const spans = spanMap.current
      async function run() {
        setStatus("loading")
        try {
          const pdfjs = await loadPdfjs()
          const buffer = await fetch(src).then((r) => {
            if (!r.ok) throw new Error(`Fetch failed: ${r.status}`)
            return r.arrayBuffer()
          })
          if (cancelled) return
          const doc = await pdfjs.getDocument({ data: buffer }).promise
          if (cancelled) return
          pdfDocRef.current = doc
          setNumPages(doc.numPages)

          // Build the ordered word list from every page's text content.
          const words: WordEntry[] = []
          for (let p = 1; p <= doc.numPages; p++) {
            const page = await doc.getPage(p)
            if (cancelled) return
            const tc = await page.getTextContent()
            const pageText = tc.items
              .map((it) => ("str" in it ? it.str : ""))
              .join(" ")
            // Split into words, tracking sentence boundaries for block highlight.
            const raw = pageText.split(/\s+/).filter(Boolean)
            for (const w of raw) {
              words.push({
                index: words.length,
                text: w,
                page: p,
                sentenceStart: 0,
                sentenceEnd: 0,
              })
            }
          }
          // Second pass: compute sentence ranges across the whole document.
          let sentStart = 0
          for (let i = 0; i < words.length; i++) {
            const endsSentence = /[.!?]["')\]]?$/.test(words[i].text)
            if (endsSentence || i === words.length - 1) {
              for (let j = sentStart; j <= i; j++) {
                words[j].sentenceStart = sentStart
                words[j].sentenceEnd = i
              }
              sentStart = i + 1
            }
          }
          wordsRef.current = words
          if (cancelled) return
          onWords?.(words.map((w) => w.text).join(" "), words.length)
          setStatus("ready")
        } catch (err) {
          const message =
            err instanceof Error
              ? `${err.name}: ${err.message}`
              : String(err)
          console.log("[v0] PdfFollowAlong load error:", message)
          if (!cancelled) {
            setStatus("error")
            onError?.(message)
          }
        }
      }
      run()
      return () => {
        cancelled = true
        spans.clear()
        renderedPages.current.clear()
        wordsRef.current = []
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src])

    // ---- Render a single page's canvas + word text layer ------------------
    const renderPage = useCallback(
      async (pageNum: number) => {
        const doc = pdfDocRef.current
        const container = containerRef.current
        if (!doc || !container) return
        if (renderedPages.current.has(pageNum)) return
        renderedPages.current.add(pageNum)

        const host = container.querySelector<HTMLElement>(
          `[data-page="${pageNum}"]`,
        )
        if (!host) return

        try {
          const page = await doc.getPage(pageNum)
          const dpr = Math.min(window.devicePixelRatio || 1, 2)
          const baseViewport = page.getViewport({ scale: 1 })
          const cssWidth = host.clientWidth
          const scale = cssWidth / baseViewport.width
          const viewport = page.getViewport({ scale })

          host.style.height = `${viewport.height}px`

          // Canvas (visual fidelity).
          const canvas = document.createElement("canvas")
          canvas.width = Math.floor(viewport.width * dpr)
          canvas.height = Math.floor(viewport.height * dpr)
          canvas.style.width = `${viewport.width}px`
          canvas.style.height = `${viewport.height}px`
          canvas.className = "absolute inset-0"
          const ctx = canvas.getContext("2d")
          if (!ctx) return
          ctx.scale(dpr, dpr)

          // Text layer host (transparent word spans over the canvas).
          const layer = document.createElement("div")
          layer.className = "absolute inset-0 select-none"

          const tc = await page.getTextContent()
          const pdfjs = await loadPdfjs()

          // Find the starting global index for this page.
          const startIndex = wordsRef.current.findIndex(
            (w) => w.page === pageNum,
          )
          let cursor = startIndex

          const measure = document.createElement("canvas").getContext("2d")!

          for (const item of tc.items) {
            if (!("str" in item) || !item.str.trim()) continue
            const tx = pdfjs.Util.transform(viewport.transform, item.transform)
            const fontHeight = Math.hypot(tx[2], tx[3])
            const left = tx[4]
            const top = tx[5] - fontHeight
            const itemWidth = item.width * scale

            // Split the item into words and distribute its width by measured
            // character widths so each word gets an accurate highlight box.
            const parts = item.str.split(/(\s+)/).filter((s) => s.length)
            measure.font = `${fontHeight}px sans-serif`
            const measured = parts.map((p) => measure.measureText(p).width || 1)
            const totalMeasured = measured.reduce((a, b) => a + b, 0) || 1
            let x = left
            for (let k = 0; k < parts.length; k++) {
              const part = parts[k]
              const w = (measured[k] / totalMeasured) * itemWidth
              if (part.trim()) {
                const span = document.createElement("span")
                span.textContent = part
                span.style.position = "absolute"
                span.style.left = `${x}px`
                span.style.top = `${top}px`
                span.style.height = `${fontHeight}px`
                span.style.lineHeight = `${fontHeight}px`
                span.style.fontSize = `${fontHeight}px`
                span.style.color = "transparent"
                span.style.whiteSpace = "pre"
                span.style.cursor = "pointer"
                span.dataset.word = String(cursor)
                span.className = "pdf-word rounded-sm"
                spanMap.current.set(cursor, span)
                layer.appendChild(span)
                cursor++
              }
              x += w
            }
          }

          await page.render({ canvasContext: ctx, viewport }).promise
          host.innerHTML = ""
          host.appendChild(canvas)
          host.appendChild(layer)
          // Re-apply active highlight if it lives on this page.
          applyHighlight(activeWordRef.current)
        } catch (err) {
          console.log(
            "[v0] PdfFollowAlong render error:",
            (err as Error).message,
          )
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    )

    // Keep a ref to activeWord so renderPage can re-highlight after mounting.
    const activeWordRef = useRef(activeWord)
    activeWordRef.current = activeWord

    // Whether scroll is driven by playback fraction (kept in a ref so the
    // stable applyHighlight callback can read the latest value).
    const fractionDrivenRef = useRef(fractionDriven)
    fractionDrivenRef.current = fractionDriven

    const applyHighlight = useCallback(
      (idx: number) => {
        // Clear previous.
        const container = containerRef.current
        if (!container) return
        container
          .querySelectorAll(".pdf-word-active, .pdf-word-sentence")
          .forEach((el) => {
            el.classList.remove("pdf-word-active", "pdf-word-sentence")
          })
        const word = wordsRef.current[idx]
        if (!word) return
        // Highlight the whole sentence lightly.
        for (let j = word.sentenceStart; j <= word.sentenceEnd; j++) {
          spanMap.current.get(j)?.classList.add("pdf-word-sentence")
        }
        // Highlight the active word strongly.
        const span = spanMap.current.get(idx)
        span?.classList.add("pdf-word-active")
        // When the parent drives scroll by playback fraction (premium voice),
        // the highlight is visual only — the fraction effect owns scrolling.
        if (fractionDrivenRef.current) return
        // Otherwise (device voice) auto-scroll the window to keep the active
        // word in view, using an explicit target (scrollIntoView is unreliable
        // for nested/absolute elements on mobile Safari).
        const now = Date.now()
        if (now - lastManualScroll.current <= 1200) return
        // Prefer the active word; fall back to the page host so we still track
        // page-by-page even before the tiny word spans exist.
        const target: HTMLElement | null =
          span ??
          container.querySelector<HTMLElement>(`[data-page="${word.page}"]`)
        if (!target) return
        const rect = target.getBoundingClientRect()
        const absoluteTop = rect.top + window.scrollY
        // Keep the reading position comfortably below the sticky header, around
        // 38% down the viewport (Speechify-style).
        const desired = absoluteTop - window.innerHeight * 0.38
        const maxTop =
          document.documentElement.scrollHeight - window.innerHeight
        const top = Math.max(0, Math.min(desired, maxTop))
        if (Math.abs(top - window.scrollY) > 4) {
          window.scrollTo({ top, behavior: "smooth" })
        }
      },
      [],
    )

    // ---- Lazy render pages near the viewport ------------------------------
    useEffect(() => {
      if (status !== "ready") return
      const container = containerRef.current
      if (!container) return
      const hosts = Array.from(
        container.querySelectorAll<HTMLElement>("[data-page]"),
      )
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              const page = Number((e.target as HTMLElement).dataset.page)
              // Render the visible page and pre-render the next one so scrolling
              // (or narration outrunning the viewport) never shows a blank page.
              renderPage(page)
              if (page + 1 <= (pdfDocRef.current?.numPages ?? 0)) {
                renderPage(page + 1)
              }
              onPageChange?.(page, pdfDocRef.current?.numPages ?? 0)
            }
          }
        },
        // Generous margin so upcoming pages are ready well before they scroll in.
        { root: null, rootMargin: "1200px 0px", threshold: 0.01 },
      )
      hosts.forEach((h) => io.observe(h))
      // Render the first few pages immediately so it's clearly the whole
      // document (not a single page) even before playback starts.
      const eager = Math.min(3, pdfDocRef.current?.numPages ?? 1)
      for (let p = 1; p <= eager; p++) renderPage(p)
      return () => io.disconnect()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, numPages])

    // ---- React to the active word: ensure its page is rendered, highlight -
    useEffect(() => {
      if (status !== "ready") return
      const word = wordsRef.current[activeWord]
      if (!word) return
      // Pre-render the next page so the follow-along scroll stays ahead of the
      // reading position instead of pausing on a blank page.
      const total = pdfDocRef.current?.numPages ?? 0
      if (word.page + 1 <= total) renderPage(word.page + 1)
      if (!renderedPages.current.has(word.page)) {
        // Narration outran the lazy viewport — render that page now.
        renderPage(word.page).then(() => applyHighlight(activeWord))
      } else {
        applyHighlight(activeWord)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeWord, status])

    // ---- Robust follow-along scroll driven by playback fraction -----------
    // This is the primary "read along through the whole document" engine for
    // the premium voice: it maps overall audio progress (0..1) to a position
    // in the document and scrolls the window there. It does not depend on
    // matching word lists or per-word span geometry, so it can't get stuck.
    useEffect(() => {
      if (status !== "ready" || !fractionDriven) return
      const container = containerRef.current
      if (!container) return
      // Don't fight a user who just scrolled manually.
      if (Date.now() - lastManualScroll.current <= 1500) return

      const frac = Math.min(1, Math.max(0, scrollFraction as number))
      // Ensure the target page is rendered so its real height is known.
      const total = pdfDocRef.current?.numPages ?? numPages
      const approxPage = Math.min(total, Math.floor(frac * total) + 1)
      renderPage(approxPage)
      if (approxPage + 1 <= total) renderPage(approxPage + 1)

      const containerTop =
        container.getBoundingClientRect().top + window.scrollY
      const target =
        containerTop + frac * container.offsetHeight - window.innerHeight * 0.32
      const maxTop =
        document.documentElement.scrollHeight - window.innerHeight
      const top = Math.max(0, Math.min(target, maxTop))
      if (Math.abs(top - window.scrollY) > 6) {
        window.scrollTo({ top, behavior: "smooth" })
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scrollFraction, status, fractionDriven])

    // Track manual scrolling to avoid fighting the user.
    useEffect(() => {
      const onScroll = () => {
        lastManualScroll.current = Date.now()
      }
      window.addEventListener("wheel", onScroll, { passive: true })
      window.addEventListener("touchmove", onScroll, { passive: true })
      return () => {
        window.removeEventListener("wheel", onScroll)
        window.removeEventListener("touchmove", onScroll)
      }
    }, [])

    // Delegate word taps to seek.
    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        const target = (e.target as HTMLElement).closest<HTMLElement>(
          ".pdf-word",
        )
        if (target?.dataset.word) {
          onWordClick?.(Number(target.dataset.word))
        }
      },
      [onWordClick],
    )

    const pageHosts = useMemo(
      () =>
        Array.from({ length: numPages }, (_, i) => (
          <div
            key={i + 1}
            data-page={i + 1}
            className="relative mx-auto mb-3 w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-border"
            style={{ minHeight: 200 }}
          >
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          </div>
        )),
      [numPages],
    )

    return (
      <div className={cn("relative", className)}>
        {status === "loading" && (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
        <div ref={containerRef} onClick={handleClick} className="px-1 py-2">
          {status === "ready" && pageHosts}
        </div>
      </div>
    )
  },
)
