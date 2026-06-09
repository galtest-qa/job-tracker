// Pure functions for hiring event lifecycle decisions.
// Extracted from the main handler so they can be unit-tested without a DB.

export type ExistingEventSnapshot = {
  email_id: string
  id: string
  status: string       // 'pending' | 'reviewed' | 'dismissed' | 'acted'
  popup_shown: boolean
}

/**
 * Decides whether a (re)classified email should be surfaced to the user
 * as a new/active event.
 *
 * Rules:
 * - No existing row   → always surface (genuinely new)
 * - Existing pending, popup not shown → still surface (user hasn't seen it yet)
 * - Existing pending, popup shown     → do NOT surface again
 * - Existing reviewed / dismissed / acted → NEVER surface again
 *
 * This is the core guard that prevents version-bump reclassification from
 * resurfacing events the user already handled.
 */
export function shouldSurfaceEvent(existing: ExistingEventSnapshot | undefined): boolean {
  if (!existing) return true
  return existing.status === "pending" && !existing.popup_shown
}

/**
 * Decides whether has_unread_event should be set to true on a matched job.
 * Only set it when there is at least one genuinely new pending event.
 */
export function shouldMarkJobUnread(
  newEventStatuses: Array<Record<string, unknown>>,
  jobId: string,
): boolean {
  return newEventStatuses.some(
    e => e.status === "pending" && e.matched_job_id === jobId,
  )
}
