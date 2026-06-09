// Hiring event lifecycle regression tests.
// Run with: deno test supabase/functions/gmail-sync/event-lifecycle.test.ts
//
// Covers the Wix resurfacing bug fix: a previously handled hiring event must
// never resurface as a new notification after a version bump or re-sync.
//
// Pure function tests — no network, no Supabase, no OpenAI required.

import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts"
import { shouldSurfaceEvent, shouldMarkJobUnread } from "./event-lifecycle.ts"

// ─────────────────────────────────────────────────────────────────────────────
// shouldSurfaceEvent
// ─────────────────────────────────────────────────────────────────────────────

// Case A — reviewed event must not resurface
//
// Scenario: Wix sent an interview invite. User reviewed it via the
// Notifications panel. Gmail sync runs again (triggered by PROMPT_VERSION bump).
// The same email is reclassified. The event must NOT surface again.
//
// Expected:
//   status remains: reviewed
//   popup_shown remains: true
//   shouldSurfaceEvent: false   ← no popup, no unread dot
Deno.test("Case A: reviewed event — does not resurface after re-sync", () => {
  const existing = {
    email_id: "wix-interview-001",
    id: "uuid-event-1",
    status: "reviewed",
    popup_shown: true,
  }
  assertEquals(shouldSurfaceEvent(existing), false,
    "reviewed event must not be surfaced again")
})

// Case B — dismissed event must not resurface
//
// Scenario: User dismissed a recruiter-response popup. Sync runs again.
// Expected: no popup, no unread dot, status stays dismissed.
Deno.test("Case B: dismissed event — does not resurface after re-sync", () => {
  const existing = {
    email_id: "wix-recruiter-001",
    id: "uuid-event-2",
    status: "dismissed",
    popup_shown: true,
  }
  assertEquals(shouldSurfaceEvent(existing), false,
    "dismissed event must not be surfaced again")
})

// Case B variant — dismissed with popup_shown=false
// (user dismissed through a non-popup path; popup_shown may still be false)
Deno.test("Case B variant: dismissed + popup_shown=false — still does not resurface", () => {
  const existing = {
    email_id: "wix-recruiter-002",
    id: "uuid-event-3",
    status: "dismissed",
    popup_shown: false,
  }
  assertEquals(shouldSurfaceEvent(existing), false,
    "dismissed event must not surface even if popup_shown is false")
})

// Case — acted event must not resurface
Deno.test("acted event — does not resurface after re-sync", () => {
  const existing = {
    email_id: "wix-offer-001",
    id: "uuid-event-4",
    status: "acted",
    popup_shown: true,
  }
  assertEquals(shouldSurfaceEvent(existing), false,
    "acted event must not be surfaced again")
})

// Case C — pending event, popup not yet shown
//
// Scenario: Event was created on this sync but the user hasn't seen the popup
// yet (app was closed, or popup was skipped). On the next sync, it should
// still be surfaced so the user eventually sees it — but without creating
// a duplicate row.
//
// Expected:
//   shouldSurfaceEvent: true   ← still visible/actionable
//   row is NOT duplicated       ← guaranteed by UNIQUE(user_id, email_id)
Deno.test("Case C: pending + popup_shown=false — surfaces as still-pending (no duplicate)", () => {
  const existing = {
    email_id: "wix-interview-002",
    id: "uuid-event-5",
    status: "pending",
    popup_shown: false,
  }
  assertEquals(shouldSurfaceEvent(existing), true,
    "pending unshown event should still be surfaced")
})

// Case C variant — pending but popup already shown
//
// Scenario: Popup was shown and markEventPopupShown() succeeded. The event is
// still pending (user saw the popup but didn't act). On re-sync it must NOT
// fire another popup.
Deno.test("Case C variant: pending + popup_shown=true — does not fire popup again", () => {
  const existing = {
    email_id: "wix-interview-003",
    id: "uuid-event-6",
    status: "pending",
    popup_shown: true,
  }
  assertEquals(shouldSurfaceEvent(existing), false,
    "pending event with popup already shown must not trigger another popup")
})

// Case D — PROMPT_VERSION / CLASSIFIER_VERSION bump
//
// Scenario: PROMPT_VERSION changes from "2.0" to "3.0". Every previously
// classified email is re-eligible. The Wix interview email (already reviewed)
// gets reclassified. shouldSurfaceEvent must return false regardless of
// what the new classification says.
//
// This is the exact reproduction path of the original Wix resurfacing bug.
Deno.test("Case D: version bump — previously reviewed event not resurfaced", () => {
  // Simulates the state in the DB BEFORE the fix: upsert would have reset these.
  // With the fix, existing state is fetched and passed to shouldSurfaceEvent.

  const scenarios: Array<{ status: string; popup_shown: boolean; expected: boolean; label: string }> = [
    { status: "reviewed",  popup_shown: true,  expected: false, label: "reviewed/shown" },
    { status: "reviewed",  popup_shown: false, expected: false, label: "reviewed/not-shown" },
    { status: "dismissed", popup_shown: true,  expected: false, label: "dismissed/shown" },
    { status: "dismissed", popup_shown: false, expected: false, label: "dismissed/not-shown" },
    { status: "acted",     popup_shown: true,  expected: false, label: "acted/shown" },
    { status: "pending",   popup_shown: false, expected: true,  label: "pending/not-shown → still valid" },
    { status: "pending",   popup_shown: true,  expected: false, label: "pending/shown → no second popup" },
  ]

  for (const s of scenarios) {
    const existing = { email_id: "wix-email-001", id: "uuid-event-x", status: s.status, popup_shown: s.popup_shown }
    assertEquals(
      shouldSurfaceEvent(existing),
      s.expected,
      `Case D [${s.label}]: shouldSurfaceEvent should be ${s.expected}`,
    )
  }
})

// Genuinely new event — no existing row
Deno.test("genuinely new event (undefined existing) — surfaces", () => {
  assertEquals(shouldSurfaceEvent(undefined), true,
    "new event with no prior row must be surfaced")
})

// ─────────────────────────────────────────────────────────────────────────────
// shouldMarkJobUnread
// ─────────────────────────────────────────────────────────────────────────────

// has_unread_event must only be set when a genuinely new pending event exists.

Deno.test("has_unread_event: set when new pending event exists for job", () => {
  const events = [
    { status: "pending", matched_job_id: "job-uuid-1" },
  ]
  assertEquals(shouldMarkJobUnread(events, "job-uuid-1"), true)
})

Deno.test("has_unread_event: NOT set when all new events are reviewed", () => {
  const events = [
    { status: "reviewed", matched_job_id: "job-uuid-1" },
  ]
  assertEquals(shouldMarkJobUnread(events, "job-uuid-1"), false,
    "no pending event in newEvents — should not set has_unread_event")
})

Deno.test("has_unread_event: NOT set when all new events are dismissed", () => {
  const events = [
    { status: "dismissed", matched_job_id: "job-uuid-1" },
  ]
  assertEquals(shouldMarkJobUnread(events, "job-uuid-1"), false)
})

Deno.test("has_unread_event: NOT set when new events belong to different job", () => {
  const events = [
    { status: "pending", matched_job_id: "job-uuid-2" },
  ]
  assertEquals(shouldMarkJobUnread(events, "job-uuid-1"), false,
    "pending event for a different job must not set unread on job-uuid-1")
})

Deno.test("has_unread_event: set when mixed events contain one pending for the job", () => {
  const events = [
    { status: "reviewed", matched_job_id: "job-uuid-1" },
    { status: "pending",  matched_job_id: "job-uuid-1" },
    { status: "pending",  matched_job_id: "job-uuid-2" },
  ]
  assertEquals(shouldMarkJobUnread(events, "job-uuid-1"), true)
  assertEquals(shouldMarkJobUnread(events, "job-uuid-2"), true)
})

Deno.test("has_unread_event: empty newEvents — not set", () => {
  assertEquals(shouldMarkJobUnread([], "job-uuid-1"), false)
})

// ─────────────────────────────────────────────────────────────────────────────
// DB-level deduplication note (non-code, documents the constraint)
// ─────────────────────────────────────────────────────────────────────────────
//
// The DB has: UNIQUE (user_id, email_id) on hiring_events
// (constraint name: hiring_events_user_id_email_id_key)
//
// email_id = Gmail Message ID (immutable, assigned by Gmail on message creation)
// This is the real deduplication key. The constraint prevents a second row
// for the same Gmail message + user regardless of what the application layer does.
//
// The shouldSurfaceEvent / shouldMarkJobUnread functions are the application-layer
// guard on top of this DB constraint.
