// Regression tests for hiring signal detection and post-processing override.
// Run with: deno test supabase/functions/gmail-classify/classifier.test.ts
//
// These are pure function tests — no network, no Supabase, no OpenAI required.

import {
  detectHiringSignals,
  applySignalOverride,
  CATEGORY_PRIORITY,
} from "../_shared/hiring-signal-detector.ts"
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.177.0/testing/asserts.ts"

// ── Regression: Port.io rejection misclassified as application_confirmation ──
//
// Email subject: "Product Operation Manager role"
// Email body:    "Thank you very much for taking the time to apply for the
//                Product Operation Manager role...
//                After reviewing your background, we've decided to move forward
//                with other candidates whose experience more closely aligns with
//                our current needs..."
//
// The AI was confused by the polite "Thank you for applying" opener and returned
// application_confirmation. The correct category is rejection.

Deno.test("Port.io regression: detects both application_confirmation and rejection signals", () => {
  const subject = "Product Operation Manager role"
  const snippet =
    "Thank you very much for taking the time to apply for the Product Operation Manager role... " +
    "After reviewing your background, we've decided to move forward with other candidates whose " +
    "experience more closely aligns with our current needs..."

  const result = detectHiringSignals(`${subject} ${snippet}`)

  console.log("\n── Port.io regression: detected signals ──")
  for (const s of result.detectedSignals) {
    console.log(`  [${s.priority}] "${s.signal}" → ${s.category}`)
  }
  console.log(`  Winning signal: "${result.winningSignal?.signal}" → ${result.winningSignal?.category}`)
  console.log(`  Selection reason: ${result.selectionReason}`)

  const categories = result.detectedSignals.map((s) => s.category)
  assert(categories.includes("application_confirmation"), "should detect application_confirmation signal")
  assert(categories.includes("rejection"), "should detect rejection signal")
  assertEquals(result.winningSignal?.category, "rejection", "rejection must beat application_confirmation")
})

Deno.test("Port.io regression: applySignalOverride corrects application_confirmation → rejection", () => {
  const subject = "Product Operation Manager role"
  const snippet =
    "Thank you very much for taking the time to apply for the Product Operation Manager role... " +
    "After reviewing your background, we've decided to move forward with other candidates whose " +
    "experience more closely aligns with our current needs..."

  // Simulate what the AI incorrectly returned
  const aiRow: Record<string, unknown> = {
    email_id: "test-001",
    category: "application_confirmation",
    is_job_related: true,
    priority_score: 20,
    confidence: 0.80,
    confidence_level: "medium",
    action_type: "none",
    action_required: false,
  }

  const { overriddenRow, overrideApplied, overrideReason, signalDebug } =
    applySignalOverride(aiRow, subject, snippet)

  console.log("\n── Port.io regression: override result ──")
  console.log(`  Override applied: ${overrideApplied}`)
  console.log(`  Override reason: ${overrideReason}`)
  console.log(`  Final category: ${overriddenRow.category}`)
  console.log(`  Final priority_score: ${overriddenRow.priority_score}`)
  console.log(`  Final confidence_level: ${overriddenRow.confidence_level}`)
  console.log(`  Signal selection: ${signalDebug?.selectionReason}`)

  // Expected output (matches user-specified regression expectation)
  assertEquals(overriddenRow.category, "rejection")
  assertEquals(overriddenRow.is_job_related, true)
  assert((overriddenRow.confidence as number) >= 0.9, `confidence should be >= 0.9, got ${overriddenRow.confidence}`)
  assertEquals(overriddenRow.confidence_level, "high")
  assertEquals(overriddenRow.priority_score, 60)
  assertEquals(overriddenRow.action_required, false)
  assertEquals(overriddenRow.action_type, "review_email")
  assertEquals(overrideApplied, true)
  assertExists(overrideReason)
  assert(overrideReason!.includes("rejection"), `override reason should mention rejection, got: ${overrideReason}`)
})

Deno.test("priority order: rejection(60) > application_confirmation(20)", () => {
  assert(CATEGORY_PRIORITY["rejection"] > CATEGORY_PRIORITY["application_confirmation"])
})

Deno.test("no override when AI category already has higher priority", () => {
  // AI correctly returned interview_invite — signal override must not downgrade it
  const aiRow: Record<string, unknown> = {
    email_id: "test-002",
    category: "interview_invite",
    is_job_related: true,
    priority_score: 95,
    confidence: 0.92,
    confidence_level: "high",
    action_type: "schedule_interview",
    action_required: true,
  }

  // Snippet also contains "thank you for applying" — but should not override interview_invite
  const snippet = "Thank you for applying. We'd love to schedule an interview with you."
  const { overriddenRow, overrideApplied } = applySignalOverride(aiRow, "Interview Invitation", snippet)

  assertEquals(overrideApplied, false, "should not override when AI category has higher priority")
  assertEquals(overriddenRow.category, "interview_invite")
})

Deno.test("override: application_confirmation with interview signal → interview_invite", () => {
  const aiRow: Record<string, unknown> = {
    email_id: "test-003",
    category: "application_confirmation",
    is_job_related: true,
    priority_score: 20,
    confidence: 0.75,
    confidence_level: "medium",
    action_type: "none",
    action_required: false,
  }

  const snippet = "Thank you for applying. We'd like to invite you to an interview next week."
  const { overriddenRow, overrideApplied } = applySignalOverride(aiRow, "Next Steps", snippet)

  assertEquals(overrideApplied, true)
  assertEquals(overriddenRow.category, "interview_invite")
  assertEquals(overriddenRow.action_required, true)
  assertEquals(overriddenRow.action_type, "schedule_interview")
})

Deno.test("no false positive: genuine application_confirmation stays unchanged", () => {
  const aiRow: Record<string, unknown> = {
    email_id: "test-004",
    category: "application_confirmation",
    is_job_related: true,
    priority_score: 20,
    confidence: 0.85,
    confidence_level: "high",
    action_type: "none",
    action_required: false,
  }

  const snippet = "Thank you for applying! We have received your application and will review it shortly."
  const { overriddenRow, overrideApplied } = applySignalOverride(aiRow, "Application Received", snippet)

  assertEquals(overrideApplied, false, "genuine application_confirmation should not be overridden")
  assertEquals(overriddenRow.category, "application_confirmation")
})

// ── Port.io full-body regression ───────────────────────────────────────────
//
// THE critical production bug: the Gmail snippet only captures ~150 chars
// (the polite "Thank you for applying" opener). The rejection phrase is buried
// later in the body and was never seen by the classifier.
//
// The fix: fetch the full body and concatenate it with the snippet before
// running signal detection. This test verifies that the override fires even
// when the rejection phrase is ONLY in the body, NOT in the snippet.

Deno.test("Port.io full-body: override fires when rejection phrase is only in body, not snippet", () => {
  const subject = "Product Operation Manager role"

  // Snippet: only what Gmail auto-generates (~150 chars, the polite opener)
  const snippetOnly =
    "Thank you very much for taking the time to apply for the Product Operation Manager role at Port.io."

  // Full body: the complete email including the rejection phrase
  const bodyText =
    "Thank you very much for taking the time to apply for the Product Operation Manager role at Port.io.\n\n" +
    "After careful consideration, we've decided to move forward with other candidates whose experience " +
    "more closely aligns with our current needs.\n\n" +
    "We appreciate your interest in Port.io and wish you the best in your job search."

  // Simulate AI seeing ONLY the snippet → misclassifies
  const aiRow: Record<string, unknown> = {
    email_id: "portio-prod-001",
    category: "application_confirmation",
    is_job_related: true,
    priority_score: 20,
    confidence: 0.82,
    confidence_level: "medium",
    action_type: "none",
    action_required: false,
  }

  // Verify snippet alone does NOT contain the rejection phrase
  assert(!snippetOnly.toLowerCase().includes("move forward with other"), "snippet must not contain rejection phrase (simulates real Gmail truncation)")

  // Run override with body+snippet (as the fixed pipeline now does)
  const combinedText = `${bodyText} ${snippetOnly}`
  const { overriddenRow, overrideApplied, overrideReason, signalDebug } =
    applySignalOverride(aiRow, subject, combinedText)

  console.log("\n── Port.io full-body regression ──")
  console.log(`  Snippet contains rejection phrase: ${snippetOnly.includes("move forward")}`)
  console.log(`  Body contains rejection phrase:    ${bodyText.includes("move forward with other")}`)
  console.log(`  Override applied: ${overrideApplied}`)
  console.log(`  Override reason:  ${overrideReason}`)
  console.log(`  Final category:   ${overriddenRow.category}`)
  console.log(`  Detected signals:`)
  for (const s of signalDebug?.detectedSignals ?? []) {
    console.log(`    [priority=${s.priority}] "${s.signal}" → ${s.category}`)
  }
  console.log(`  Winning signal: "${signalDebug?.winningSignal?.signal}" → ${signalDebug?.winningSignal?.category}`)
  console.log(`  Selection reason: ${signalDebug?.selectionReason}`)

  // ── Assertions (match user-specified expected output) ──
  assertEquals(overrideApplied, true, "override must fire — rejection phrase found in body")
  assertEquals(overriddenRow.category, "rejection")
  assertEquals(overriddenRow.is_job_related, true)
  assert((overriddenRow.confidence as number) >= 0.9, `confidence must be >= 0.9, got ${overriddenRow.confidence}`)
  assertEquals(overriddenRow.confidence_level, "high")
  assertEquals(overriddenRow.priority_score, 60)
  assertEquals(overriddenRow.action_required, false)
  assertEquals(overriddenRow.action_type, "review_email")
  assertExists(overrideReason)
  assert(overrideReason!.includes("rejection"), `override reason must mention rejection, got: ${overrideReason}`)
})

// ── Notch regression ──────────────────────────────────────────────────────
//
// Subject: "Thank you for applying for the Product Implementation Manager position at Notch"
// Snippet: "Thank you for submitting your resume for the Product Implementation Manager position at Notch."
// Body:    "...we decided to move forward with other candidates."
//
// Old v2 behavior: snippet-only → only saw the "Thank you" opener → application_confirmation
// New v3 behavior: body+snippet → finds "move forward with other candidates" → rejection

Deno.test("Notch regression: subject 'Thank you for applying' + body 'decided to move forward'", () => {
  const subject = "Thank you for applying for the Product Implementation Manager position at Notch"
  const snippet = "Thank you for submitting your resume for the Product Implementation Manager position at Notch."
  const body =
    "Thank you for submitting your resume for the Product Implementation Manager position at Notch.\n\n" +
    "After reviewing your experience and qualifications, we decided to move forward with other candidates.\n\n" +
    "We wish you the best in your job search."

  // Confirm what old v2 (snippet-only) would have seen
  const oldResult = detectHiringSignals(`${subject} ${snippet}`)
  assertEquals(oldResult.winningSignal?.category, "application_confirmation",
    "old v2 (snippet-only) should have been application_confirmation — confirms the regression")

  // Confirm v3 (body+snippet) correctly identifies rejection
  const newResult = detectHiringSignals(`${subject} ${body} ${snippet}`)

  console.log("\n── Notch regression ──")
  console.log("  Old v2 winning signal:", oldResult.winningSignal?.signal, "→", oldResult.winningSignal?.category)
  console.log("  New v3 detected signals:")
  for (const s of newResult.detectedSignals) {
    console.log(`    [priority=${s.priority}] "${s.signal}" → ${s.category}`)
  }
  console.log("  New v3 winning signal:", newResult.winningSignal?.signal, "→", newResult.winningSignal?.category)
  console.log("  Selection reason:", newResult.selectionReason)

  assertEquals(newResult.winningSignal?.category, "rejection")

  // "Thank you for submitting your resume" — new pattern, confirms it is detected
  const submittedSignal = newResult.detectedSignals.find(s => s.signal.toLowerCase().includes("submitting"))
  assertExists(submittedSignal, '"Thank you for submitting your resume" should be detected as application_confirmation')
  assertEquals(submittedSignal.category, "application_confirmation")
})

Deno.test("Notch regression: applySignalOverride upgrades application_confirmation → rejection", () => {
  const subject = "Thank you for applying for the Product Implementation Manager position at Notch"
  const body =
    "Thank you for submitting your resume for the Product Implementation Manager position at Notch.\n\n" +
    "After reviewing your experience and qualifications, we decided to move forward with other candidates."

  const aiRow: Record<string, unknown> = {
    email_id: "notch-prod-001",
    category: "application_confirmation",
    is_job_related: true,
    priority_score: 20,
    confidence: 0.79,
    confidence_level: "medium",
    action_type: "none",
    action_required: false,
  }

  const { overriddenRow, overrideApplied, overrideReason } =
    applySignalOverride(aiRow, subject, body)

  assertEquals(overrideApplied, true)
  assertEquals(overriddenRow.category, "rejection")
  assertEquals(overriddenRow.is_job_related, true)
  assertEquals(overriddenRow.priority_score, 60)
  assertEquals(overriddenRow.confidence_level, "high")
  assert((overriddenRow.confidence as number) >= 0.9)
  assertEquals(overriddenRow.action_required, false)
  assertEquals(overriddenRow.action_type, "review_email")
  assert(overrideReason!.includes("rejection"))
})

// ── Recommendation engine ──────────────────────────────────────────────────

import { getRecommendation } from "../_shared/hiring-signal-detector.ts"

Deno.test("recommendation: rejection → move card to Rejected", () => {
  const rec = getRecommendation("rejection")
  assertEquals(rec.stage, "Rejected")
  assertEquals(rec.action, "Move card to Rejected")
  assert(rec.reason.length > 0)
})

Deno.test("recommendation: offer → move card to Offer", () => {
  const rec = getRecommendation("offer")
  assertEquals(rec.stage, "Offer")
  assertEquals(rec.action, "Move card to Offer")
})

Deno.test("recommendation: interview_invite → move card to Interview", () => {
  const rec = getRecommendation("interview_invite")
  assertEquals(rec.stage, "Interview")
  assertEquals(rec.action, "Move card to Interview")
})

Deno.test("recommendation: position_closed → Archive job", () => {
  const rec = getRecommendation("position_closed")
  assertEquals(rec.stage, "Archived")
  assertEquals(rec.action, "Archive job")
})

Deno.test("recommendation: unknown category → safe default", () => {
  const rec = getRecommendation("some_unknown_category")
  assertExists(rec.stage)
  assertExists(rec.action)
  assertExists(rec.reason)
})
