import { getCurrentUser } from "@/lib/session"
import { NextResponse } from "next/server"

// Transcribing a short dictation clip is quick, but allow headroom for longer
// recordings and cold starts.
export const maxDuration = 60

// Dictation clips are short; cap the upload so a runaway recording can't tie up
// the transcription API. ~25MB covers several minutes of compressed audio.
const MAX_BYTES = 25 * 1024 * 1024

const ELEVEN_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text"
// Scribe is ElevenLabs' accurate, widely-available speech-to-text model. It
// works with the compressed audio (mp4/m4a on iOS, webm on Chrome) that
// MediaRecorder produces in the browser.
const STT_MODEL = "scribe_v1"

/**
 * Transcribes a dictated audio clip to text using ElevenLabs Scribe.
 *
 * Why a server route instead of the Web Speech API: `webkitSpeechRecognition`
 * is unreliable in iOS Safari and entirely absent inside an iOS WKWebView
 * (App Store wrapper), so the previous client-only dictation never activated
 * the mic on the target platform. Capturing audio with MediaRecorder and
 * transcribing here works consistently across browsers and the packaged app.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "Dictation isn't available right now." },
      { status: 503 },
    )
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid audio upload." }, { status: 400 })
  }

  const audio = form.get("audio")
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json(
      { error: "No audio was recorded. Please try again." },
      { status: 400 },
    )
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That recording is too long. Please dictate in shorter bursts." },
      { status: 400 },
    )
  }

  try {
    const upstream = new FormData()
    upstream.append("model_id", STT_MODEL)
    upstream.append("file", audio, audio.name || "dictation.webm")

    const res = await fetch(ELEVEN_STT_URL, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: upstream,
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      console.log("[v0] transcription upstream error:", res.status, detail.slice(0, 300))
      return NextResponse.json(
        { error: "Couldn't transcribe that audio. Please try again." },
        { status: 502 },
      )
    }

    const data = (await res.json()) as { text?: string }
    const text = (data.text ?? "").trim()
    if (!text) {
      return NextResponse.json(
        { error: "We couldn't hear any speech. Please try again." },
        { status: 422 },
      )
    }
    return NextResponse.json({ text })
  } catch (err) {
    console.log(
      "[v0] transcription error:",
      err instanceof Error ? err.message : err,
    )
    return NextResponse.json(
      { error: "Couldn't transcribe that audio. Please try again." },
      { status: 500 },
    )
  }
}
