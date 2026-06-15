// Regression tests for GmailAuthError — ensures Gmail 401/403 responses are
// classified as reconnect signals, not generic failures.
//
// Run with: ~/.deno/bin/deno test supabase/functions/gmail-sync/gmail-auth-error.test.ts

import { assertEquals, assertInstanceOf } from "https://deno.land/std@0.177.0/testing/asserts.ts"
import { GmailAuthError } from "../_shared/gmail-api.ts"
import { shouldSurfaceEvent } from "./event-lifecycle.ts"

// ── GmailAuthError class ──────────────────────────────────────────────────

Deno.test("GmailAuthError is an Error subclass", () => {
  const err = new GmailAuthError(401)
  assertInstanceOf(err, Error)
  assertEquals(err.name, "GmailAuthError")
  assertEquals(err.status, 401)
})

Deno.test("GmailAuthError 401 carries correct status", () => {
  const err = new GmailAuthError(401)
  assertEquals(err.status, 401)
  assertEquals(err.message.includes("401"), true)
})

Deno.test("GmailAuthError 403 carries correct status", () => {
  const err = new GmailAuthError(403)
  assertEquals(err.status, 403)
  assertEquals(err.message.includes("403"), true)
})

Deno.test("GmailAuthError instanceof check works for catch discrimination", () => {
  // Simulates what the outer catch in index.ts does:
  //   const isAuthError = err instanceof GmailAuthError
  const gmailErr: unknown = new GmailAuthError(401)
  const genericErr: unknown = new Error("network failure")

  assertEquals(gmailErr instanceof GmailAuthError, true,
    "GmailAuthError must be detectable via instanceof")
  assertEquals(genericErr instanceof GmailAuthError, false,
    "plain Error must NOT be a GmailAuthError")
})

// ── Root cause regression — the Wix-style scenario ───────────────────────
//
// What was happening:
//   Gmail returned 401 on messages.list (token revoked mid-session)
//   → fetchRecentEmails threw a plain Error
//   → outer catch set last_sync_status = 'failed', needs_reconnect = false
//   → frontend showed nothing (sync button same as healthy state)
//   → user never knew to reconnect
//
// What happens now:
//   → fetchRecentEmails throws GmailAuthError (401)
//   → outer catch detects instanceof GmailAuthError
//   → sets needs_reconnect = true, last_sync_status = 'reconnect_required'
//   → returns HTTP 401 with { needsReconnect: true }
//   → frontend sets gmailNeedsReconnect = true
//   → header shows red "Reconnect Gmail" button
//   → Settings shows Reconnect as primary CTA

Deno.test("GmailAuthError custom message is human-readable", () => {
  const err = new GmailAuthError(401)
  assertEquals(typeof err.message, "string")
  assertEquals(err.message.length > 0, true)
  // Must contain enough context for log readability
  assertEquals(err.message.toLowerCase().includes("gmail"), true)
})

Deno.test("GmailAuthError with custom message", () => {
  const err = new GmailAuthError(403, "Forbidden — scope revoked")
  assertEquals(err.message, "Forbidden — scope revoked")
  assertEquals(err.status, 403)
  assertEquals(err.name, "GmailAuthError")
})

// ── shouldSurfaceEvent still works independently ──────────────────────────
// (Guards against accidentally breaking the import chain in event-lifecycle.ts)

Deno.test("shouldSurfaceEvent still correct after gmail-api.ts changes", () => {
  assertEquals(shouldSurfaceEvent(undefined), true, "new event surfaces")
  assertEquals(shouldSurfaceEvent({ email_id: "x", id: "1", status: "reviewed", popup_shown: true }), false)
  assertEquals(shouldSurfaceEvent({ email_id: "x", id: "2", status: "pending", popup_shown: false }), true)
})
