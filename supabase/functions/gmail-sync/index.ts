import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { decrypt, encrypt } from "../_shared/crypto-utils.ts"
import { refreshAccessToken, fetchRecentEmails, fetchEmailBody, type GmailEmail } from "../_shared/gmail-api.ts"
import { shouldPreFilter } from "../_shared/email-prefilter.ts"
import { applySignalOverride, getRecommendation } from "../_shared/hiring-signal-detector.ts"

// ── Versioning ──────────────────────────────────────────────────────────────
const CLASSIFIER_VERSION = "1.0"
const PROMPT_VERSION = "3.0"
const MODEL = "gpt-4o-mini"

// ── Config ──────────────────────────────────────────────────────────────────
const MAX_EMAILS = 30
const BATCH_SIZE = 10
const THROTTLE_MS = 15 * 60 * 1000   // 15 minutes
const SNIPPET_MAX = 500
const TEXT_MAX = 300

// ── Taxonomy ─────────────────────────────────────────────────────────────────
const ALLOWED_CATEGORIES = new Set([
  "application_confirmation", "application_sent",
  "recruiter_response", "interview_invite",
  "interview_scheduled", "interview_rescheduled",
  "technical_assignment", "take_home_assignment",
  "reference_request", "salary_discussion",
  "offer", "offer_discussion", "rejection",
  "position_closed", "process_cancelled",
  "follow_up_sent", "follow_up_received",
  "networking_outreach", "other",
])

const ALLOWED_ACTION_TYPES = new Set([
  "none", "review_email", "schedule_interview",
  "submit_assignment", "reply_to_recruiter",
  "prepare_for_interview", "follow_up",
  "review_offer", "provide_references", "salary_discussion",
])

const SUGGESTED_STAGES: Record<string, string> = {
  application_sent: "Applied",
  application_confirmation: "Applied",
  recruiter_response: "Recruiter Response",
  follow_up_received: "Recruiter Response",
  interview_invite: "Interview",
  interview_scheduled: "Interview",
  interview_rescheduled: "Interview",
  technical_assignment: "Assignment",
  take_home_assignment: "Assignment",
  reference_request: "Interview",
  salary_discussion: "Offer",
  offer: "Offer",
  offer_discussion: "Offer",
  rejection: "Rejected",
  position_closed: "Rejected",
  process_cancelled: "Rejected",
  follow_up_sent: "Applied",
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// ── System prompt v3 ──────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a Hiring Process Event Detection Engine for a job search tracking platform.

━━━ CENTRAL QUESTION ━━━
For every email, ask exactly one question:
"Did this email CREATE, UPDATE, ADVANCE, PAUSE, REJECT, CANCEL, CLOSE, or COMPLETE a hiring process?"

If YES → isJobRelated = true
If NO  → isJobRelated = false, category = "other"

CRITICAL: isJobRelated means a hiring-process event occurred — NOT that the email requires action.
A rejection, position closure, or hiring freeze are all isJobRelated=true even though no action is needed.

━━━ CONFLICTING SIGNALS — MOST IMPORTANT RULE ━━━
Many emails contain BOTH polite/positive opening language AND a negative hiring outcome.
The FINAL hiring outcome ALWAYS wins. Polite openings are irrelevant to classification.

Priority order when signals conflict (highest wins):
  1. offer
  2. interview_invite / interview_scheduled
  3. technical_assignment / take_home_assignment
  4. rejection / position_closed / process_cancelled
  5. recruiter_response / follow_up_received
  6. application_confirmation
  7. application_sent
  8. other

REJECTION OVERRIDE RULE — These phrases indicate rejection regardless of what else the email says:
  ✗ "move forward with other candidates"
  ✗ "moving forward with other candidates"
  ✗ "decided to proceed with other candidates"
  ✗ "not moving forward"
  ✗ "not selected"
  ✗ "decided not to move forward"
  ✗ "not aligned with our current needs"
  ✗ "pursuing other candidates"
  ✗ "will not be moving forward"
  ✗ "regret to inform you"

If ANY of these phrases appear anywhere in the email (subject, snippet, or body), classify as rejection
(or position_closed if the role itself was cancelled), EVEN IF the email ALSO contains:
  → "Thank you for applying"        ← polite opener, does NOT make it application_confirmation
  → "We appreciate your interest"   ← polite opener, ignore for classification
  → "We reviewed your background"   ← neutral, does NOT change the outcome

EXAMPLE — wrong vs correct:
  Email: "Thank you for applying... After reviewing your background, we've decided to move
  forward with other candidates whose experience more closely aligns with our needs."
  WRONG: application_confirmation   ← "Thank you for applying" is just a polite opener
  RIGHT: rejection                  ← the actual outcome is rejection; confidence=high

━━━ LANGUAGES ━━━
English, Hebrew, mixed Hebrew+English. Detect intent regardless of language.
Hebrew signals:
- "נשמח לקבוע איתך ראיון" → interview_invite
- "עברת לשלב הבא" → recruiter_response
- "לצערנו החלטנו להמשיך עם מועמדים אחרים" → rejection
- "המשרה נסגרה" / "המשרה בוטלה" → position_closed

━━━ TAXONOMY ━━━
application_confirmation — employer ONLY confirms receipt; no other hiring outcome stated (isJobRelated=true)
application_sent — user sent a job application, outbound (isJobRelated=true)
recruiter_response — recruiter replied about a SPECIFIC role or moved candidate forward (isJobRelated=true)
interview_invite — explicit invitation to interview (isJobRelated=true)
interview_scheduled — interview time confirmed (isJobRelated=true)
interview_rescheduled — existing interview moved to new time (isJobRelated=true)
technical_assignment — coding challenge or technical test assigned (isJobRelated=true)
take_home_assignment — take-home project or case study (isJobRelated=true)
reference_request — request for professional references (isJobRelated=true)
salary_discussion — compensation or salary conversation (isJobRelated=true)
offer — job offer received (isJobRelated=true)
offer_discussion — negotiating terms of an offer (isJobRelated=true)
rejection — employer is not moving forward with this candidate (isJobRelated=true)
  NOTE: classify as rejection even if email opens with "Thank you for applying"
position_closed — role was closed, cancelled, or frozen before or during process (isJobRelated=true)
  Examples: "position has been closed", "role no longer available", "hiring freeze",
  "organizational restructuring", "requisition cancelled", "we are pausing hiring"
process_cancelled — company stopped the hiring process entirely (isJobRelated=true)
follow_up_sent — user sent a follow-up, outbound (isJobRelated=true)
follow_up_received — recruiter or employer followed up inbound (isJobRelated=true)
networking_outreach — specific job opportunity discussed, NOT generic connection (isJobRelated=true only if specific role discussed)
other — not a hiring-process event (isJobRelated=false)

━━━ LINKEDIN RULES ━━━
NOT hiring events (isJobRelated=false, category="other"):
- New connection / connection accepted
- Someone viewed your profile / followed you / endorsed you
- Generic recruiter follow with no specific role
- Content notifications, post engagement
- "You appeared in X searches"

Hiring events (isJobRelated=true):
- Interview invitation via LinkedIn
- Recruiter message discussing a SPECIFIC named role
- Application status update from LinkedIn Jobs
- Offer or salary discussion

━━━ PRIORITY SCORE (0-100) ━━━
offer: 100
interview_invite / interview_scheduled: 95
technical_assignment / take_home_assignment: 90
salary_discussion / offer_discussion: 88
reference_request: 80
recruiter_response: 75
interview_rescheduled: 72
follow_up_received: 65
rejection: 60
position_closed / process_cancelled: 50
application_confirmation: 20
application_sent / follow_up_sent: 15
networking_outreach (job-related): 30
other: 0

━━━ CONFIDENCE LEVELS ━━━
0.85+ → "high" | 0.65–0.84 → "medium" | <0.65 → "low"

━━━ RULES ━━━
- Only classify as isJobRelated=true if a hiring-process event clearly occurred
- A hiring-related sender does not automatically make an email job-related
- When signals conflict, the highest-priority outcome wins — polite openers never override a negative outcome
- Scan the ENTIRE email content including body text, not just the opening sentence
- Keep summary to 1 sentence; reasoning to 1–2 sentences
- Return valid JSON only — no prose, no markdown outside the JSON object`

// ── Classification helpers ────────────────────────────────────────────────

function buildUserPrompt(emails: GmailEmail[], connectedEmail: string | null): string {
  const formatted = emails
    .map((e, i) => {
      const snippetPart = `snippet="${(e.snippet ?? "").slice(0, 200)}"`
      const bodyPart = e.body ? ` body="${e.body.slice(0, 1500)}"` : ""
      return `[${i + 1}] id="${e.id}" direction=${e.direction} from="${e.from}" ` +
        `subject="${e.subject}" ${snippetPart}${bodyPart} ` +
        `labels=${e.gmailLabels?.join(",") || "none"} received=${e.receivedAt}`
    })
    .join("\n\n")

  return `Connected Gmail: ${connectedEmail ?? "unknown"}
Today: ${new Date().toISOString().split("T")[0]}

Classify these ${emails.length} emails as hiring process events:

${formatted}

Return a JSON object with key "classifications" containing an array of exactly ${emails.length} objects:

{
  "classifications": [
    {
      "emailId": "<same id as input>",
      "category": "<from taxonomy>",
      "confidence": 0.0,
      "confidenceLevel": "high|medium|low",
      "isJobRelated": true,
      "priorityScore": 0,
      "actionType": "<from action types>",
      "summary": "<1 sentence>",
      "reasoning": "<1-2 sentences>",
      "importantSignals": ["signal1"],
      "suggestedNextAction": "<human readable>",
      "detectedCompany": null,
      "detectedRole": null,
      "recruiterName": null,
      "recruiterEmail": null,
      "actionRequired": false,
      "interviewLinkDetected": false,
      "deadlineMentioned": false,
      "links": []
    }
  ]
}`
}

function toConfidenceLevel(c: number): "high" | "medium" | "low" {
  return c >= 0.85 ? "high" : c >= 0.65 ? "medium" : "low"
}

function validateRow(raw: Record<string, unknown>, email: GmailEmail): Record<string, unknown> {
  const confidence =
    typeof raw.confidence === "number" && raw.confidence >= 0 && raw.confidence <= 1
      ? raw.confidence : 0

  const category =
    typeof raw.category === "string" && ALLOWED_CATEGORIES.has(raw.category)
      ? raw.category : "other"

  const actionType =
    typeof raw.actionType === "string" && ALLOWED_ACTION_TYPES.has(raw.actionType)
      ? raw.actionType : "none"

  const links = Array.isArray(raw.links)
    ? (raw.links as Record<string, unknown>[])
        .filter(l => l && typeof l.type === "string")
        .map(l => ({ type: l.type, url: typeof l.url === "string" ? l.url : "" }))
        .slice(0, 5)
    : []

  const priorityScore =
    typeof raw.priorityScore === "number" && raw.priorityScore >= 0 && raw.priorityScore <= 100
      ? Math.round(raw.priorityScore) : 0

  return {
    email_id: email.id,
    thread_id: email.threadId,
    from_address: email.from,
    subject: email.subject,
    snippet: (email.snippet ?? "").slice(0, SNIPPET_MAX),
    direction: email.direction,
    gmail_labels: email.gmailLabels,
    received_at: email.receivedAt,
    category,
    confidence,
    confidence_level:
      typeof raw.confidenceLevel === "string" && ["high","medium","low"].includes(raw.confidenceLevel)
        ? raw.confidenceLevel : toConfidenceLevel(confidence),
    is_job_related: typeof raw.isJobRelated === "boolean" ? raw.isJobRelated : false,
    priority_score: priorityScore,
    action_type: actionType,
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, TEXT_MAX) : null,
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning.slice(0, TEXT_MAX) : null,
    important_signals: Array.isArray(raw.importantSignals)
      ? (raw.importantSignals as string[]).slice(0, 10) : [],
    suggested_next_action: typeof raw.suggestedNextAction === "string"
      ? raw.suggestedNextAction.slice(0, 200) : null,
    detected_company: typeof raw.detectedCompany === "string" ? raw.detectedCompany : null,
    detected_role: typeof raw.detectedRole === "string" ? raw.detectedRole : null,
    recruiter_name: typeof raw.recruiterName === "string" ? raw.recruiterName : null,
    recruiter_email: typeof raw.recruiterEmail === "string" ? raw.recruiterEmail : null,
    action_required: typeof raw.actionRequired === "boolean" ? raw.actionRequired : false,
    interview_link_detected: typeof raw.interviewLinkDetected === "boolean" ? raw.interviewLinkDetected : false,
    deadline_mentioned: typeof raw.deadlineMentioned === "boolean" ? raw.deadlineMentioned : false,
    links,
    pre_filtered: false,
    model_used: MODEL,
    classifier_version: CLASSIFIER_VERSION,
    prompt_version: PROMPT_VERSION,
  }
}

function safeDefaultRow(email: GmailEmail): Record<string, unknown> {
  return {
    email_id: email.id, thread_id: email.threadId,
    from_address: email.from, subject: email.subject,
    snippet: (email.snippet ?? "").slice(0, SNIPPET_MAX),
    direction: email.direction, gmail_labels: email.gmailLabels,
    received_at: email.receivedAt,
    category: "other", confidence: 0, confidence_level: "low",
    is_job_related: false, priority_score: 0, action_type: "none",
    action_required: false, interview_link_detected: false, deadline_mentioned: false,
    links: [], important_signals: [], pre_filtered: false,
    model_used: MODEL, classifier_version: CLASSIFIER_VERSION, prompt_version: PROMPT_VERSION,
  }
}

async function classifyBatch(
  emails: GmailEmail[],
  openaiKey: string,
  connectedEmail: string | null,
): Promise<Record<string, unknown>[]> {
  let parsed: { classifications?: unknown[] }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(emails, connectedEmail) },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    })
    if (!res.ok) { console.error("OpenAI error:", res.status); return emails.map(safeDefaultRow) }
    const data = await res.json()
    parsed = JSON.parse(data.choices[0].message.content)
  } catch (err) {
    console.error("classifyBatch error:", err.message)
    return emails.map(safeDefaultRow)
  }

  const rawList = parsed?.classifications
  if (!Array.isArray(rawList) || rawList.length === 0) return emails.map(safeDefaultRow)

  const byId = new Map(rawList.map((r: Record<string, unknown>) => [r.emailId as string, r]))
  return emails.map(email => {
    const raw = byId.get(email.id)
    if (!raw) return safeDefaultRow(email)
    try {
      const validated = validateRow(raw as Record<string, unknown>, email)
      // Scan body + snippet so rejection phrases buried after the polite opening are caught
      const fullText = `${email.body ?? ""} ${email.snippet ?? ""}`
      const signalResult = applySignalOverride(validated, email.subject, fullText)
      const finalRow = signalResult.overriddenRow
      finalRow.detected_signals = signalResult.signalDebug?.detectedSignals ?? []
      finalRow.winning_signal = signalResult.signalDebug?.winningSignal?.signal ?? null
      finalRow.signal_selection_reason = signalResult.signalDebug?.selectionReason ?? null
      return finalRow
    } catch { return safeDefaultRow(email) }
  })
}

// ── Event title generation ─────────────────────────────────────────────────

function buildEventTitle(category: string, company: string | null, role: string | null): string {
  const c = company || "A company"
  const r = role ? ` for ${role}` : ""
  const titles: Record<string, string> = {
    application_confirmation: `${c} confirmed your application${r}`,
    application_sent: `You applied to ${c}${r}`,
    recruiter_response: `Recruiter from ${c} replied`,
    interview_invite: `${c} invited you to an interview${r}`,
    interview_scheduled: `Interview scheduled at ${c}${r}`,
    interview_rescheduled: `Interview at ${c} was rescheduled`,
    technical_assignment: `${c} sent a technical assignment${r}`,
    take_home_assignment: `${c} sent a take-home assignment${r}`,
    reference_request: `${c} is requesting references`,
    salary_discussion: `Salary discussion with ${c}`,
    offer: `${c} sent you an offer${r}`,
    offer_discussion: `Offer negotiation with ${c}`,
    rejection: `${c} is not moving forward`,
    position_closed: `${c} closed the position${r}`,
    process_cancelled: `${c} cancelled the hiring process`,
    follow_up_sent: `You followed up with ${c}`,
    follow_up_received: `${c} followed up with you`,
    networking_outreach: `Networking contact from ${c}`,
  }
  return titles[category] || `Hiring update from ${c}`
}

// ── Company/role extraction ────────────────────────────────────────────────

// ATS platforms: domain alone should never be used as company signal
const ATS_PLATFORM_DOMAINS = new Set([
  "greenhouse.io", "greenhouse-mail.io",
  "lever.co", "hire.lever.co",
  "ashbyhq.com", "workday.com", "myworkdayjobs.com",
  "comeet.com", "smartrecruiters.com", "teamtailor.com",
  "bamboohr.com", "recruitee.com", "icims.com", "workable.com",
  "jobvite.com", "successfactors.com", "taleo.net", "jobscore.com",
  "breezy.hr", "pinpoint.com", "rippling.com", "dover.com", "gem.com",
  "linkedin.com", "recruitment.wix.com",
])

// Generic mailbox providers — no company signal
const GENERIC_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com",
  "icloud.com", "me.com", "mac.com", "proton.me", "protonmail.com",
  "zoho.com", "aol.com",
])

// Words that indicate the display name is a department/function, not a company
const FROM_NAME_STOP_WORDS = [
  "careers", "career", "recruiting", "recruitment", "recruiter", "talent",
  "hr", "human", "resources", "hiring", "team", "group", "jobs", "noreply",
  "no-reply", "notifications", "hello", "apply", "applications", "support",
  "info", "contact", "updates", "alerts", "donotreply", "do not reply",
  "notification", "mailer", "email", "mail",
]

function extractDomain(from: string): string {
  const m = from.match(/@([\w.-]+)/)
  return m ? m[1].toLowerCase() : ""
}

function isAtsDomain(domain: string): boolean {
  return ATS_PLATFORM_DOMAINS.has(domain) ||
    [...ATS_PLATFORM_DOMAINS].some(d => domain.endsWith("." + d))
}

// Parse display name from "Name <email>" → clean company candidate
function extractFromDisplayName(from: string): string | null {
  const nameMatch = from.match(/^([^<@]+?)\s*</)
  if (!nameMatch) return null

  let name = nameMatch[1].trim().replace(/"/g, "")

  // "Recruiting at Wix" / "HR from Company" → extract the company part
  name = name.replace(/^(?:recruiting|talent|hr|careers?)\s+(?:at|from|@)\s+/i, "")
  // "Company | Careers" → "Company"
  name = name.replace(/\s*[|/]\s*.+$/, "")

  // Remove trailing stop words
  for (const word of FROM_NAME_STOP_WORDS) {
    name = name.replace(new RegExp(`\\b${word}s?\\b`, "gi"), "").trim()
  }

  name = name.replace(/[,.-]+$/, "").replace(/\s{2,}/g, " ").trim()
  if (name.length < 2 || name.length > 60) return null
  return name
}

// Extract company name from a non-ATS, non-generic company domain
// e.g. recruiter@workiz.com → "Workiz", hr@monday.com → "Monday"
function extractFromDomain(from: string): string | null {
  const domain = extractDomain(from)
  if (!domain) return null
  if (isAtsDomain(domain)) return null
  if (GENERIC_DOMAINS.has(domain)) return null

  const parts = domain.split(".")
  // subdomain.company.tld → use "company" part
  const companyPart = parts.length >= 3 ? parts[parts.length - 2] : parts[0]

  // Skip obvious non-company subdomain parts
  const skipWords = new Set(["mail", "email", "noreply", "careers", "jobs", "hr", "info", "notifications", "alerts", "smtp"])
  if (skipWords.has(companyPart)) return null
  if (companyPart.length < 2) return null

  return companyPart.charAt(0).toUpperCase() + companyPart.slice(1)
}

// Extract company name from subject line using common recruiting patterns
function extractCompanyFromSubject(subject: string): string | null {
  const patterns = [
    // "at <Company>" — most common
    /\bat\s+([A-Z][A-Za-z0-9\s&.',-]{1,50}?)(?:\s*[-—:,!.]|\s+(?:for|has|is|was|will|–)|$)/,
    // "from <Company>"
    /\bfrom\s+([A-Z][A-Za-z0-9\s&.',-]{1,50}?)(?:\s*[-—:,!.]|\s+(?:for|regarding)|$)/,
    // "<Company> -" or "<Company>:" at start (e.g. "Wix - Interview Invitation")
    /^([A-Z][A-Za-z0-9\s&.',-]{1,50}?)\s*[-—:|]\s+/,
    // "with <Company>"
    /\bwith\s+([A-Z][A-Za-z0-9\s&.',-]{1,50}?)(?:\s*[-—:,!.]|\s+(?:for|regarding)|$)/,
  ]

  for (const p of patterns) {
    const m = subject.match(p)
    if (m) {
      const candidate = m[1].trim()
      // Sanity: reject if it looks like a verb phrase or is too short
      if (candidate.length >= 2 && !/^(your|the|a |an |our|we |us|i |my )/i.test(candidate)) {
        return candidate
      }
    }
  }
  return null
}

// Extract role from subject line
function extractRoleFromSubject(subject: string): string | null {
  const patterns = [
    // "for the <Role> position/role/opportunity"
    /for\s+(?:the\s+)?([A-Za-z][A-Za-z0-9\s/(),-]{3,60}?)\s+(?:position|role|opportunity|job)\b/i,
    // "application for <Role>"
    /application\s+(?:for\s+)?(?:the\s+)?([A-Za-z][A-Za-z0-9\s/(),-]{3,60}?)(?:\s+at\b|\s+role\b|\s+position\b|$)/i,
  ]
  for (const p of patterns) {
    const m = subject.match(p)
    if (m) {
      const candidate = m[1].trim()
      if (candidate.length >= 3 && candidate.length <= 60) return candidate
    }
  }
  return null
}

interface Extraction {
  company: string | null
  role: string | null
  sources: string[]
}

// Build best company/role extraction from all available signals
// AI extraction is highest priority; other sources supplement or provide fallback
function buildExtraction(
  aiCompany: string | null,
  aiRole: string | null,
  emailFrom: string,
  emailSubject: string,
  emailSnippet: string,
): Extraction {
  const sources: string[] = []

  // AI extraction — always first priority
  let company = aiCompany
  let role = aiRole
  if (company) sources.push("ai")
  if (role && !sources.includes("ai")) sources.push("ai")

  // Subject extraction — supplement if AI missed
  const subjectCompany = extractCompanyFromSubject(emailSubject)
  const subjectRole = extractRoleFromSubject(emailSubject)

  if (!company && subjectCompany) {
    company = subjectCompany
    sources.push("subject")
  }
  if (!role && subjectRole) {
    role = subjectRole
    if (!sources.includes("subject")) sources.push("subject")
  }

  // From display name — fallback for company
  if (!company) {
    const nameCompany = extractFromDisplayName(emailFrom)
    if (nameCompany) {
      company = nameCompany
      sources.push("from_name")
    }
  }

  // From domain — lowest priority, never for ATS
  if (!company) {
    const domainCompany = extractFromDomain(emailFrom)
    if (domainCompany) {
      company = domainCompany
      sources.push("from_domain")
    }
  }

  return { company, role, sources }
}

// ── Job matching ───────────────────────────────────────────────────────────

function normalizeCompany(s: string): string {
  return s.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\b(inc|ltd|llc|corp|limited|co|gmbh|sa|ag|bv|nv|plc|pvt)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function scoreCompanyMatch(normJob: string, normTarget: string): number {
  if (!normJob || !normTarget) return 0
  if (normJob === normTarget) return 4

  const longer = normJob.length > normTarget.length ? normJob : normTarget
  const shorter = normJob.length <= normTarget.length ? normJob : normTarget
  if (longer.includes(shorter)) {
    // Reject very short tokens matching inside long company names (e.g. "Al" in "Walmart")
    const ratio = shorter.length / longer.length
    return ratio >= 0.4 ? 3 : 1
  }
  return 0
}

interface MatchResult {
  jobId: string | null
  confidence: "high" | "medium" | "low" | "none"
  signals: string[]
  extractedCompany: string | null
  extractedRole: string | null
  extractionSources: string[]
  matchScore: number
}

async function matchToJob(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  aiCompany: string | null,
  aiRole: string | null,
  emailFrom: string,
  emailSubject: string,
  emailSnippet: string,
): Promise<MatchResult> {
  const noMatch = (ext: Extraction): MatchResult => ({
    jobId: null, confidence: "none", signals: [],
    extractedCompany: ext.company,
    extractedRole: ext.role,
    extractionSources: ext.sources,
    matchScore: 0,
  })

  const ext = buildExtraction(aiCompany, aiRole, emailFrom, emailSubject, emailSnippet)

  if (!ext.company) return noMatch(ext)

  const { data: jobs } = await adminClient
    .from("jobs")
    .select("id, company, role, status")
    .eq("user_id", userId)

  if (!jobs?.length) return noMatch(ext)

  const normTarget = normalizeCompany(ext.company)
  if (!normTarget) return noMatch(ext)

  interface ScoredJob {
    jobId: string
    score: number
    signals: string[]
    isTerminal: boolean
  }

  const scored: ScoredJob[] = []

  for (const job of jobs) {
    const normJob = normalizeCompany(job.company || "")
    if (!normJob) continue

    const companyScore = scoreCompanyMatch(normJob, normTarget)
    if (companyScore === 0) continue

    const signals: string[] = [`company_match:${companyScore}`]
    let score = companyScore

    // Role match bonus
    if (ext.role) {
      const normRole = ext.role.toLowerCase().trim()
      const normJobRole = (job.role || "").toLowerCase().trim()
      if (normRole && normJobRole && (normJobRole.includes(normRole) || normRole.includes(normJobRole))) {
        score += 2
        signals.push("role_match")
      }
    }

    // Extraction source signal
    signals.push(`sources:${ext.sources.join(",")}`)

    const isTerminal = ["Rejected", "Archived", "Closed"].includes(job.status)
    scored.push({ jobId: job.id, score, signals, isTerminal })
  }

  if (scored.length === 0) return noMatch(ext)

  // Sort: highest score first, non-terminal preferred
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return Number(a.isTerminal) - Number(b.isTerminal)
  })

  const best = scored[0]

  const confidence: "high" | "medium" | "low" =
    best.score >= 5 ? "high" :
    best.score >= 3 ? "medium" : "low"

  return {
    jobId: best.jobId,
    confidence,
    signals: best.signals,
    extractedCompany: ext.company,
    extractedRole: ext.role,
    extractionSources: ext.sources,
    matchScore: best.score,
  }
}

// ── Main handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  // Hoisted so the outer catch can persist failure status without a second auth round-trip
  // deno-lint-ignore no-explicit-any
  let adminClient: any = null
  let userId: string | null = null

  try {
    // 1. Authenticate
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )
    userId = user.id

    // 2. Load integration
    const { data: integration } = await adminClient
      .from("user_integrations")
      .select("encrypted_access_token, encrypted_refresh_token, expires_at, email, last_sync_at")
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .single()

    if (!integration) {
      return new Response(JSON.stringify({ skipped: true, reason: "not_connected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // 3. Throttle check (server-side) — bypass with ?force=true
    const url = new URL(req.url)
    const forceSync = url.searchParams.get("force") === "true"

    const serverNow = new Date()
    const lastSyncAt = integration.last_sync_at ? new Date(integration.last_sync_at) : null
    const minutesSinceSync = lastSyncAt
      ? Math.round((serverNow.getTime() - lastSyncAt.getTime()) / 60000 * 10) / 10
      : null

    const debugInfo = {
      lastSyncAt: lastSyncAt?.toISOString() ?? null,
      serverTime: serverNow.toISOString(),
      minutesSinceSync,
      throttleMinutes: THROTTLE_MS / 60000,
    }

    if (!forceSync && lastSyncAt && (serverNow.getTime() - lastSyncAt.getTime()) < THROTTLE_MS) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "recently_synced", ...debugInfo }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // 4. Decrypt + refresh token if needed
    const encKey = Deno.env.get("INTEGRATION_ENCRYPTION_KEY")!
    let accessToken = await decrypt(integration.encrypted_access_token, encKey)

    const expiresAt = new Date(integration.expires_at)
    if (expiresAt <= new Date(Date.now() + 5 * 60 * 1000)) {
      if (!integration.encrypted_refresh_token) {
        await adminClient
          .from("user_integrations")
          .update({
            needs_reconnect: true,
            last_sync_status: "reconnect_required",
            last_sync_error: "Session expired — please reconnect Gmail",
          })
          .eq("user_id", user.id)
          .eq("provider", "gmail")
        return new Response(JSON.stringify({ error: "Token expired. Please reconnect Gmail.", needsReconnect: true }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      const refreshToken = await decrypt(integration.encrypted_refresh_token, encKey)
      try {
        const refreshed = await refreshAccessToken(
          refreshToken,
          Deno.env.get("GOOGLE_CLIENT_ID")!,
          Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        )
        accessToken = refreshed.accessToken
        await adminClient
          .from("user_integrations")
          .update({
            encrypted_access_token: await encrypt(refreshed.accessToken, encKey),
            expires_at: refreshed.expiresAt.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .eq("provider", "gmail")
      } catch {
        await adminClient
          .from("user_integrations")
          .update({
            needs_reconnect: true,
            last_sync_status: "reconnect_required",
            last_sync_error: "Session expired — please reconnect Gmail",
          })
          .eq("user_id", user.id)
          .eq("provider", "gmail")
        return new Response(JSON.stringify({ error: "Session expired. Please reconnect Gmail.", needsReconnect: true }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
    }

    // 5. Fetch recent emails
    const emails = await fetchRecentEmails(accessToken, MAX_EMAILS, integration.email ?? undefined)
    if (emails.length === 0) {
      const now = new Date().toISOString()
      await adminClient.from("user_integrations")
        .update({
          last_sync_at: now,
          last_successful_sync_at: now,
          last_sync_status: "success",
          last_sync_error: null,
          needs_reconnect: false,
        })
        .eq("user_id", user.id).eq("provider", "gmail")
      return new Response(JSON.stringify({ skipped: false, newEvents: [], total: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // 6. Version-aware cache — only skip emails classified with the CURRENT versions.
    // Emails classified by an older classifier_version or prompt_version are eligible
    // for reclassification so bad old classifications never get permanently stuck.
    const emailIds = emails.map(e => e.id)
    const { data: existing } = await adminClient
      .from("email_classifications")
      .select("email_id, classifier_version, prompt_version")
      .eq("user_id", user.id)
      .in("email_id", emailIds)

    const upToDateIds = new Set(
      (existing ?? [])
        .filter((r: Record<string, unknown>) =>
          r.classifier_version === CLASSIFIER_VERSION && r.prompt_version === PROMPT_VERSION
        )
        .map((r: Record<string, unknown>) => r.email_id as string)
    )
    const newEmails = emails.filter(e => !upToDateIds.has(e.id))

    // 7. Pre-filter + classify new emails
    const toClassify: GmailEmail[] = []
    const preFilteredRows: Record<string, unknown>[] = []

    for (const email of newEmails) {
      if (shouldPreFilter(email)) {
        preFilteredRows.push({
          user_id: user.id,
          email_id: email.id, thread_id: email.threadId,
          from_address: email.from, subject: email.subject,
          snippet: (email.snippet ?? "").slice(0, SNIPPET_MAX),
          direction: email.direction, gmail_labels: email.gmailLabels,
          received_at: email.receivedAt,
          category: "other", confidence: 0, confidence_level: "low",
          is_job_related: false, priority_score: 0, action_type: "none",
          action_required: false, interview_link_detected: false, deadline_mentioned: false,
          links: [], important_signals: [], pre_filtered: true, model_used: null,
          classifier_version: CLASSIFIER_VERSION, prompt_version: PROMPT_VERSION,
        })
      } else {
        toClassify.push(email)
      }
    }

    if (preFilteredRows.length > 0) {
      await adminClient.from("email_classifications")
        .upsert(preFilteredRows, { onConflict: "user_id,email_id" })
    }

    // 8. Fetch full email bodies for emails that will be AI-classified (parallel, never throws)
    // The Gmail snippet is only the first ~150 chars. Rejection phrases like
    // "move forward with other candidates" are often buried after the polite opening
    // and invisible to the AI without the full body.
    if (toClassify.length > 0) {
      const bodyFetches = await Promise.allSettled(
        toClassify.map((e) => fetchEmailBody(accessToken, e.id)),
      )
      toClassify.forEach((e, i) => {
        const r = bodyFetches[i]
        if (r.status === "fulfilled" && r.value) e.body = r.value
      })
    }

    // 9. AI classify
    const openaiKey = Deno.env.get("OPENAI_API_KEY")
    const aiRows: Record<string, unknown>[] = []
    if (openaiKey && toClassify.length > 0) {
      for (let i = 0; i < toClassify.length; i += BATCH_SIZE) {
        const batch = toClassify.slice(i, i + BATCH_SIZE)
        const results = await classifyBatch(batch, openaiKey, integration.email)
        aiRows.push(...results)
      }
      if (aiRows.length > 0) {
        await adminClient.from("email_classifications")
          .upsert(
            aiRows.map(r => ({ ...r, user_id: user.id })),
            { onConflict: "user_id,email_id" },
          )
      }
    }

    // 10. Create hiring events from new job-related classifications
    const jobRelatedRows = aiRows.filter(r => r.is_job_related === true)
    const newEvents: Record<string, unknown>[] = []

    // Pre-load existing event states in one query so we can preserve user-facing
    // status/popup_shown when a re-classification hits an already-handled event.
    // This prevents the "resurface" bug where a version bump re-opens dismissed events.
    const jobRelatedEmailIds = jobRelatedRows.map(r => r.email_id as string)
    const { data: existingEventRows } = jobRelatedEmailIds.length > 0
      ? await adminClient
          .from("hiring_events")
          .select("email_id, id, status, popup_shown")
          .eq("user_id", user.id)
          .in("email_id", jobRelatedEmailIds)
      : { data: [] }
    const existingByEmailId = new Map(
      ((existingEventRows ?? []) as Array<{ email_id: string; id: string; status: string; popup_shown: boolean }>)
        .map(e => [e.email_id, e])
    )

    for (const row of jobRelatedRows) {
      const category = row.category as string
      const company = row.detected_company as string | null
      const role = row.detected_role as string | null
      const emailId = row.email_id as string

      // Get classification id
      const { data: classRow } = await adminClient
        .from("email_classifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("email_id", emailId)
        .single()

      // Match to job
      const match = await matchToJob(
        adminClient, user.id,
        company, role,
        row.from_address as string,
        row.subject as string,
        row.snippet as string,
      )

      const rec = getRecommendation(category)

      // Metadata that is always safe to update (factual, not user-facing)
      const metaFields = {
        user_id: user.id,
        email_id: emailId,
        classification_id: classRow?.id ?? null,
        event_type: category,
        title: buildEventTitle(category, company, role),
        priority_score: row.priority_score as number,
        matched_job_id: match.jobId,
        match_confidence: match.confidence,
        match_signals: match.signals,
        suggested_stage: SUGGESTED_STAGES[category] ?? null,
        extracted_company: match.extractedCompany ?? null,
        extracted_role: match.extractedRole ?? null,
        extraction_sources: match.extractionSources ?? [],
        match_score: match.matchScore ?? 0,
        description: typeof row.summary === "string" ? row.summary : null,
        recommended_action: rec.action,
        recommendation_reason: rec.reason,
      }

      const existingEvent = existingByEmailId.get(emailId) as { email_id: string; id: string; status: string; popup_shown: boolean } | undefined

      if (existingEvent) {
        // Row already exists — update metadata only, never touch status/popup_shown.
        // This preserves any action the user already took (reviewed, dismissed, acted).
        await adminClient
          .from("hiring_events")
          .update(metaFields)
          .eq("user_id", user.id)
          .eq("email_id", emailId)

        // Only surface to the frontend if it is still unhandled
        if (existingEvent.status === "pending" && !existingEvent.popup_shown) {
          const { data: refreshed } = await adminClient
            .from("hiring_events")
            .select()
            .eq("user_id", user.id)
            .eq("email_id", emailId)
            .single()
          if (refreshed) newEvents.push(refreshed)
        }
      } else {
        // Genuinely new event — insert with pending/unshown state
        const { data: inserted, error: eventErr } = await adminClient
          .from("hiring_events")
          .insert({ ...metaFields, status: "pending", popup_shown: false })
          .select()
          .single()

        if (!eventErr && inserted) {
          newEvents.push(inserted)
        }
      }
    }

    // 11. Update has_unread_event — only for jobs with genuinely new pending events
    const matchedJobIds = [...new Set(
      newEvents
        .filter(e => e.matched_job_id && e.status === "pending")
        .map(e => e.matched_job_id as string)
    )]
    if (matchedJobIds.length > 0) {
      await adminClient
        .from("jobs")
        .update({ has_unread_event: true })
        .in("id", matchedJobIds)
    }

    // 12. Update sync status
    const syncedAt = new Date().toISOString()
    await adminClient
      .from("user_integrations")
      .update({
        last_sync_at: syncedAt,
        last_successful_sync_at: syncedAt,
        last_sync_status: "success",
        last_sync_error: null,
        needs_reconnect: false,
      })
      .eq("user_id", user.id)
      .eq("provider", "gmail")

    console.log(
      `gmail-sync: user=${user.id} fetched=${emails.length} new=${newEmails.length} ` +
      `classified=${aiRows.length} events=${newEvents.length}`
    )

    return new Response(
      JSON.stringify({
        skipped: false,
        newEvents,
        total: emails.length,
        ...debugInfo,
        lastSyncAt: syncedAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (err) {
    console.error("gmail-sync unexpected error:", (err as Error).message)
    if (adminClient && userId) {
      try {
        await adminClient
          .from("user_integrations")
          .update({ last_sync_status: "failed", last_sync_error: "Sync failed — will retry automatically" })
          .eq("user_id", userId)
          .eq("provider", "gmail")
      } catch { /* best-effort, ignore */ }
    }
    return new Response(
      JSON.stringify({ error: "Sync failed. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
