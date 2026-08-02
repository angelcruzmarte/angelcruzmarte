/**
 * Session-scoped camera / microphone stream manager.
 *
 * Goals (see product requirements):
 *  - Open the device immediately on a user tap, with NO custom permission UI —
 *    let the browser's own native prompt handle first-time access.
 *  - Reuse a single live MediaStream whenever possible instead of calling
 *    getUserMedia() again, so re-entering the recorder/scanner during a session
 *    is instant and never re-prompts.
 *  - When permission is already granted, callers can launch instantly without
 *    reinitializing the hardware.
 *
 * The cache lives at module scope (outside React) so it survives component
 * remounts — including the intentional remount of the Add Content screen when
 * switching between actions. Streams are released on explicit close, on unmount,
 * and on page hide so the OS capture indicator is never left on needlessly.
 */

export type MediaKind = "mic" | "camera"

const streams: Partial<Record<MediaKind, MediaStream>> = {}

/**
 * Devices the user has actually *used* this session (recorded a clip / captured
 * a scan) — not merely opened. Behavior requested: "warm only after first use".
 * Before a kind's first successful use we still release it on close for privacy;
 * once used, we keep its stream warm for the rest of the session so reopening is
 * silent and iOS shows its native capture banner only that first time.
 */
const usedKinds = new Set<MediaKind>()

/** Mark a device as used, enabling warm reuse for the rest of the session. */
export function markKindUsed(kind: MediaKind): void {
  usedKinds.add(kind)
}

/** Whether this device should be kept warm (i.e. has been used this session). */
export function isKindWarm(kind: MediaKind): boolean {
  return usedKinds.has(kind)
}

const constraintsFor: Record<MediaKind, MediaStreamConstraints> = {
  mic: { audio: true },
  camera: { video: { facingMode: { ideal: "environment" } }, audio: false },
}

function isLive(stream: MediaStream | undefined): boolean {
  return !!stream && stream.getTracks().some((t) => t.readyState === "live")
}

/** Whether a live, reusable stream for this kind is already cached. */
export function hasLiveStream(kind: MediaKind): boolean {
  return isLive(streams[kind])
}

/**
 * Best-effort check of whether the permission is already granted, so callers
 * can auto-launch instantly. Returns false when the Permissions API can't
 * answer (e.g. older Safari), in which case callers should keep an explicit
 * tap so the native prompt fires inside a user gesture.
 */
export async function isPermissionGranted(kind: MediaKind): Promise<boolean> {
  try {
    const perms = navigator.permissions
    if (!perms?.query) return false
    const name = (kind === "mic" ? "microphone" : "camera") as PermissionName
    const status = await perms.query({ name })
    return status.state === "granted"
  } catch {
    // Firefox throws for camera/microphone, older Safari lacks support — treat
    // as "unknown" and let the caller fall back to a user-gesture tap.
    return false
  }
}

/**
 * Return a live stream for the requested device, reusing the cached one when
 * possible and otherwise acquiring it exactly once. May prompt (natively) the
 * first time; never shows any custom dialog.
 */
export async function acquireStream(kind: MediaKind): Promise<MediaStream> {
  const existing = streams[kind]
  if (existing && isLive(existing)) return existing
  // Drop any stale (fully-ended) stream before re-acquiring.
  existing?.getTracks().forEach((t) => t.stop())
  delete streams[kind]

  const stream = await navigator.mediaDevices.getUserMedia(constraintsFor[kind])
  streams[kind] = stream
  // Self-evict if the OS reclaims the device (unplugged, taken by another app),
  // so the next acquire re-initializes cleanly instead of reusing a dead stream.
  stream.getTracks().forEach((t) => {
    t.addEventListener("ended", () => {
      if (streams[kind] === stream) delete streams[kind]
    })
  })
  return stream
}

/** Stop and forget the cached stream for one device (turns its indicator off). */
export function releaseStream(kind: MediaKind): void {
  const stream = streams[kind]
  if (!stream) return
  stream.getTracks().forEach((t) => t.stop())
  delete streams[kind]
}

/**
 * Release the stream on close/unmount UNLESS this device has been used this
 * session — in which case keep it warm so reopening never re-prompts and the
 * native banner doesn't flash again. (It is still fully released on pagehide.)
 */
export function releaseUnlessWarm(kind: MediaKind): void {
  if (usedKinds.has(kind)) return
  releaseStream(kind)
}

/** Release every cached stream. */
export function releaseAllStreams(): void {
  ;(Object.keys(streams) as MediaKind[]).forEach(releaseStream)
}

// Never leave the mic/camera on when the tab is actually going away. Use
// pagehide (fires on tab close and real navigations) rather than visibility
// changes, so briefly switching apps doesn't tear down a warm stream.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", releaseAllStreams)
}
