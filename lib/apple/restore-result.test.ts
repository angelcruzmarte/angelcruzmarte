import { describe, expect, it } from "vitest"
import { restoreStateFromResponse } from "./restore-result"

describe("restoreStateFromResponse", () => {
  it("only reports success when the server confirms a verified restore", () => {
    expect(restoreStateFromResponse(200, { restored: true })).toEqual({ kind: "success" })
    expect(restoreStateFromResponse(200, { restored: false })).toEqual({ kind: "error" })
    expect(restoreStateFromResponse(200, {})).toEqual({ kind: "error" })
    expect(restoreStateFromResponse(500, { restored: true })).toEqual({ kind: "error" })
  })

  it("maps auth and configuration failures", () => {
    expect(restoreStateFromResponse(401, {})).toEqual({ kind: "unauthenticated" })
    expect(restoreStateFromResponse(503, {})).toEqual({ kind: "unavailable" })
  })

  it("maps each server reason to a distinct state", () => {
    expect(restoreStateFromResponse(200, { restored: false, reason: "no_record" }).kind).toBe("no_record")
    expect(restoreStateFromResponse(200, { restored: false, reason: "not_found" }).kind).toBe("no_record")
    expect(restoreStateFromResponse(200, { restored: false, reason: "not_active" }).kind).toBe("not_active")
    expect(restoreStateFromResponse(200, { restored: false, reason: "pending" }).kind).toBe("pending")
    expect(restoreStateFromResponse(200, { restored: false, reason: "unrecognized_product" }).kind).toBe("error")
    expect(restoreStateFromResponse(200, { restored: false, reason: "error" }).kind).toBe("error")
  })

  it("treats an unparseable body as an error", () => {
    expect(restoreStateFromResponse(200, null)).toEqual({ kind: "error" })
  })
})
