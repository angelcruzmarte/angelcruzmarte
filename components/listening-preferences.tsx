"use client"

import { createContext, useContext } from "react"

/** The four listening preferences configured in Settings. */
export type ListeningPreferences = {
  /** Start playing a file as soon as its reader opens. */
  autoPlay: boolean
  /** Auto-collapse the docked mini-player after a few seconds of inactivity. */
  autoHide: boolean
  /** Keep audio from other apps playing (honored by the native wrapper). */
  mixAudio: boolean
  /** Skip headers, footers, page numbers and citations during narration. */
  autoSkip: boolean
}

const DEFAULTS: ListeningPreferences = {
  autoPlay: false,
  autoHide: false,
  mixAudio: false,
  autoSkip: false,
}

const Ctx = createContext<ListeningPreferences>(DEFAULTS)

export function ListeningPreferencesProvider({
  value,
  children,
}: {
  value: ListeningPreferences
  children: React.ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useListeningPreferences(): ListeningPreferences {
  return useContext(Ctx)
}
