// Deterministic hiring signal detection for post-processing overrides.
// Runs on subject + snippet text to catch cases where the AI misranks conflicting signals.

export const CATEGORY_PRIORITY: Record<string, number> = {
  offer: 100,
  interview_invite: 95,
  interview_scheduled: 95,
  technical_assignment: 90,
  take_home_assignment: 90,
  salary_discussion: 88,
  offer_discussion: 88,
  reference_request: 80,
  recruiter_response: 75,
  interview_rescheduled: 72,
  follow_up_received: 65,
  rejection: 60,
  position_closed: 50,
  process_cancelled: 50,
  networking_outreach: 30,
  application_confirmation: 20,
  follow_up_sent: 15,
  application_sent: 15,
  other: 0,
}

// Priority score to store in DB for each category when we apply an override
export const CATEGORY_PRIORITY_SCORE: Record<string, number> = {
  offer: 100,
  interview_invite: 95,
  interview_scheduled: 95,
  technical_assignment: 90,
  take_home_assignment: 90,
  salary_discussion: 88,
  offer_discussion: 88,
  reference_request: 80,
  recruiter_response: 75,
  interview_rescheduled: 72,
  follow_up_received: 65,
  rejection: 60,
  position_closed: 50,
  process_cancelled: 50,
  networking_outreach: 30,
  application_confirmation: 20,
  follow_up_sent: 15,
  application_sent: 15,
  other: 0,
}

// Action type and required fields for override categories
const CATEGORY_ACTION: Record<string, { actionType: string; actionRequired: boolean }> = {
  offer: { actionType: "review_offer", actionRequired: true },
  interview_invite: { actionType: "schedule_interview", actionRequired: true },
  interview_scheduled: { actionType: "prepare_for_interview", actionRequired: true },
  technical_assignment: { actionType: "submit_assignment", actionRequired: true },
  take_home_assignment: { actionType: "submit_assignment", actionRequired: true },
  rejection: { actionType: "review_email", actionRequired: false },
  position_closed: { actionType: "review_email", actionRequired: false },
  process_cancelled: { actionType: "review_email", actionRequired: false },
}

export interface SignalMatch {
  signal: string    // the matched text
  category: string  // the hiring category it maps to
  priority: number  // CATEGORY_PRIORITY value
}

export interface SignalDetectionResult {
  detectedSignals: SignalMatch[]
  winningSignal: SignalMatch | null
  selectionReason: string
}

// Ordered from highest to lowest priority.
// More specific patterns listed before generic ones within the same category.
const SIGNAL_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  // ── Offer ─────────────────────────────────────────────────────────────────
  { pattern: /pleased to offer you/i, category: "offer" },
  { pattern: /offer of employment/i, category: "offer" },
  { pattern: /extend(?:ing)? (?:you )?(?:a )?(?:formal )?(?:job )?offer/i, category: "offer" },
  { pattern: /we(?:'d| would) like to offer you/i, category: "offer" },

  // ── Interview invite ───────────────────────────────────────────────────────
  { pattern: /invit(?:e|ed|ing) you to (?:an? )?interview/i, category: "interview_invite" },
  { pattern: /schedule (?:an? )?interview/i, category: "interview_invite" },
  { pattern: /interview invitation/i, category: "interview_invite" },
  { pattern: /would (?:love|like) to (?:meet|speak|chat) with you/i, category: "interview_invite" },

  // ── Rejection — explicit phrases that OVERRIDE polite openings ─────────────
  { pattern: /move forward with other candidates/i, category: "rejection" },
  { pattern: /moving forward with other candidates/i, category: "rejection" },
  { pattern: /proceed(?:ing)? with other candidates/i, category: "rejection" },
  { pattern: /decided to (?:go|move) forward with (?:another|other)/i, category: "rejection" },
  { pattern: /not (?:be )?moving forward(?: with you)?(?:\b|$)/i, category: "rejection" },
  { pattern: /not selected(?: for| to)/i, category: "rejection" },
  { pattern: /decided not to move forward/i, category: "rejection" },
  { pattern: /not aligned with our (?:current )?needs/i, category: "rejection" },
  { pattern: /pursuing other candidates/i, category: "rejection" },
  { pattern: /chosen to (?:move forward|continue) with (?:another|other)/i, category: "rejection" },
  { pattern: /will not be (?:moving|proceeding) forward/i, category: "rejection" },
  { pattern: /regret to (?:inform|let you know|say) that (?:we(?:'re| are)? )?not/i, category: "rejection" },
  { pattern: /unfortunately.*not (?:able|going|planning) to (?:move|proceed|continue)/i, category: "rejection" },

  // ── Position closed ────────────────────────────────────────────────────────
  { pattern: /position has been (?:closed|filled|cancelled|canceled)/i, category: "position_closed" },
  { pattern: /(?:the )?(?:role|position) (?:is|has been) (?:no longer )?available/i, category: "position_closed" },
  { pattern: /role (?:has been )?closed/i, category: "position_closed" },
  { pattern: /hiring freeze/i, category: "position_closed" },
  { pattern: /pausing (?:all )?hiring/i, category: "position_closed" },
  { pattern: /requisition (?:has been )?cancelled/i, category: "position_closed" },

  // ── Application confirmation — lowest priority, easily beaten ──────────────
  { pattern: /thank you (?:very much )?for (?:taking the time to )?apply(?:ing)?/i, category: "application_confirmation" },
  { pattern: /thank you for submitting your (?:resume|application|cv)/i, category: "application_confirmation" },
  { pattern: /thank you for your (?:interest|application)/i, category: "application_confirmation" },
  { pattern: /(?:received|receipt of) your application/i, category: "application_confirmation" },
  { pattern: /we(?:'ve| have) received your (?:application|resume)/i, category: "application_confirmation" },
]

export function detectHiringSignals(text: string): SignalDetectionResult {
  const detectedSignals: SignalMatch[] = []

  for (const { pattern, category } of SIGNAL_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      detectedSignals.push({
        signal: match[0],
        category,
        priority: CATEGORY_PRIORITY[category] ?? 0,
      })
    }
  }

  if (detectedSignals.length === 0) {
    return { detectedSignals: [], winningSignal: null, selectionReason: "no signals detected" }
  }

  const winning = detectedSignals.reduce((best, s) => s.priority > best.priority ? s : best)

  const losers = detectedSignals
    .filter((s) => s !== winning)
    .map((s) => `"${s.signal}" → ${s.category}(${s.priority})`)

  const selectionReason = losers.length === 0
    ? `only signal: "${winning.signal}" → ${winning.category}`
    : `highest priority wins: "${winning.signal}" → ${winning.category}(${winning.priority}) over [${losers.join(", ")}]`

  return { detectedSignals, winningSignal: winning, selectionReason }
}

// Applies a deterministic override when the AI's category has lower priority
// than what the snippet/subject text signals. Modifies the row in place.
export function applySignalOverride(
  row: Record<string, unknown>,
  subject: string,
  snippet: string,
): { overriddenRow: Record<string, unknown>; signalDebug: SignalDetectionResult; overrideApplied: boolean; overrideReason: string | null } {
  const searchText = `${subject} ${snippet}`
  const signalDebug = detectHiringSignals(searchText)

  if (!signalDebug.winningSignal) {
    return { overriddenRow: row, signalDebug, overrideApplied: false, overrideReason: null }
  }

  const aiCategory = row.category as string
  const aiPriority = CATEGORY_PRIORITY[aiCategory] ?? 0
  const signalPriority = signalDebug.winningSignal.priority

  if (signalPriority <= aiPriority) {
    return { overriddenRow: row, signalDebug, overrideApplied: false, overrideReason: null }
  }

  const winningCategory = signalDebug.winningSignal.category
  const action = CATEGORY_ACTION[winningCategory]

  const overriddenRow: Record<string, unknown> = {
    ...row,
    category: winningCategory,
    is_job_related: true,
    priority_score: CATEGORY_PRIORITY_SCORE[winningCategory] ?? 0,
    confidence: 0.95,
    confidence_level: "high",
    ...(action ? { action_type: action.actionType, action_required: action.actionRequired } : {}),
  }

  const overrideReason = `signal_override:${aiCategory}(${aiPriority})→${winningCategory}(${signalPriority}) via "${signalDebug.winningSignal.signal}"`

  return { overriddenRow, signalDebug, overrideApplied: true, overrideReason }
}

// ── Recommendation engine ──────────────────────────────────────────────────

export interface CategoryRecommendation {
  stage: string
  action: string
  reason: string
}

const CATEGORY_RECOMMENDATIONS: Record<string, CategoryRecommendation> = {
  offer:                  { stage: "Offer",              action: "Move card to Offer",              reason: "Company extended a job offer." },
  offer_discussion:       { stage: "Offer",              action: "Move card to Offer",              reason: "Offer negotiation in progress." },
  interview_invite:       { stage: "Interview",          action: "Move card to Interview",          reason: "Company invited you to interview." },
  interview_scheduled:    { stage: "Interview",          action: "Move card to Interview",          reason: "Interview has been scheduled." },
  interview_rescheduled:  { stage: "Interview",          action: "Move card to Interview",          reason: "Interview was rescheduled." },
  technical_assignment:   { stage: "Assignment",         action: "Move card to Assignment",         reason: "Company sent a technical assignment." },
  take_home_assignment:   { stage: "Assignment",         action: "Move card to Assignment",         reason: "Company sent a take-home assignment." },
  salary_discussion:      { stage: "Offer",              action: "Move card to Offer",              reason: "Salary discussion initiated." },
  reference_request:      { stage: "Interview",          action: "Move card to Interview",          reason: "Company requested references." },
  recruiter_response:     { stage: "Recruiter Response", action: "Move card to Recruiter Response", reason: "Recruiter or employer responded." },
  follow_up_received:     { stage: "Recruiter Response", action: "Move card to Recruiter Response", reason: "Recruiter followed up." },
  rejection:              { stage: "Rejected",           action: "Move card to Rejected",           reason: "Company decided to move forward with other candidates." },
  position_closed:        { stage: "Archived",           action: "Archive job",                     reason: "Position was closed or no longer available." },
  process_cancelled:      { stage: "Archived",           action: "Archive job",                     reason: "Company cancelled the hiring process." },
  application_confirmation: { stage: "Applied",          action: "Move card to Applied",            reason: "Employer confirmed receipt of your application." },
  application_sent:       { stage: "Applied",            action: "Move card to Applied",            reason: "Application submitted." },
  follow_up_sent:         { stage: "Applied",            action: "Move card to Applied",            reason: "Follow-up sent." },
  networking_outreach:    { stage: "Applied",            action: "Review email",                    reason: "Networking outreach received." },
}

const DEFAULT_RECOMMENDATION: CategoryRecommendation = {
  stage: "Applied",
  action: "Review email",
  reason: "New hiring update received.",
}

export function getRecommendation(category: string): CategoryRecommendation {
  return CATEGORY_RECOMMENDATIONS[category] ?? DEFAULT_RECOMMENDATION
}