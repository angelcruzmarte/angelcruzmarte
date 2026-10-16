/**
 * The possible outcomes of a server-driven "Restore Purchases" attempt. Each
 * maps to a distinct, honest user-facing explanation — restore only ever
 * re-verifies the Apple subscription already linked to THIS VOXYFI account, so
 * "not found" is a real, expected state (the subscription may belong to another
 * account) and gets a recovery panel rather than a generic error.
 */
export type RestoreState =
  | { kind: "idle" }
  /** Apple verified an active subscription — access re-granted. */
  | { kind: "success" }
  /** Not signed in — cannot restore to an anonymous user. */
  | { kind: "unauthenticated" }
  /** No Apple transaction is linked to this account (wrong account, or never subscribed here). */
  | { kind: "no_record" }
  /** Apple was queried but reports the subscription is no longer entitled (expired/refunded/revoked). */
  | { kind: "not_active" }
  /** Apple verification is not configured on the server. */
  | { kind: "unavailable" }
  /** Apple was temporarily unreachable; nothing was changed. */
  | { kind: "pending" }
  /** Unexpected failure. */
  | { kind: "error" }

/**
 * Maps the `/api/apple/restore` response to a UI state. Success requires the
 * server to have answered 2xx with `restored: true` — which it only does after
 * Apple verified an active subscription — so the client never infers success.
 */
export function restoreStateFromResponse(
  status: number,
  data: { restored?: boolean; reason?: string } | null | undefined,
): RestoreState {
  if (status === 401) return { kind: "unauthenticated" }
  if (status === 503) return { kind: "unavailable" }
  const ok = status >= 200 && status < 300
  if (ok && data?.restored === true) return { kind: "success" }
  if (!ok) return { kind: "error" }
  switch (data?.reason) {
    case "no_record":
    case "not_found":
      return { kind: "no_record" }
    case "not_active":
      return { kind: "not_active" }
    case "pending":
      return { kind: "pending" }
    default:
      return { kind: "error" }
  }
}
