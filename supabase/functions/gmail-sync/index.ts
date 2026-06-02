import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { decrypt, encrypt } from "../_shared/crypto-utils.ts"
import { refreshAccessToken, fetchRecentEmails, type GmailEmail } from "../_shared/gmail-api.ts"
import { shouldPreFilter } from "../_shared/email-prefilter.ts"

// ── Versioning ──────────────────────────────────────────────────────────────
const CLASSIFIER_VERSION = "1.0"
const PROMPT_VERSION = "2.0"
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

// ── System prompt (same as gmail-classify v2) ─────────────────────────────
const SYSTEM_PROMPT = `You are a Hiring Process Event Detection Engine for a job search tracking platform.

━━━ CENTRAL QUESTION ━━━
For every email, ask exactly one question:
"Did this email CREATE, UPDATE, ADVANCE, PAUSE, REJECT, CANCEL, CLOSE, or COMPLETE a hiring process?"

If YES → isJobRelated = true
If NO  → isJobRelated = false, category = "other"

CRITICAL: isJobRelated means a hiring-process event occurred — NOT that the email requires action.
A rejection, position closure, or hiring freeze are all isJobRelated=true even though no action is needed.

━━━ LANGUAGES ━━━
English, Hebrew, mixed Hebrew+English. Detect intent regardless of language.
Hebrew signals:
- "נשמח לקבוע איתך ראיון" → interview_invite
- "עברת לשלב הבא" → recruiter_response
- "לצערנו החלטנו להמשיך עם מועמדים אחרים" → rejection
- "המשרה נסגרה" / "המשרה בוטלה" → position_closed

━━━ TAXONOMY ━━━
application_confirmation — employer confirms receipt of application (isJobRelated=true)
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
position_closed — role was closed, cancelled, or frozen before or during process (isJobRelated=true)
  Examples: "position has been closed", "role no longer available", "hiring freeze",
  "organizational restructuring", "requisition cancelled", "we are pausing hiring"
process_cancelled — company stopped the hiring process entirely (isJobRelated=true)
  Examples: "we are discontinuing our recruitment process", "hiring has been put on hold"
follow_up_sent — user sent a follow-up, outbound (isJobRelated=true)
follow_up_received — recruiter or employer followed up inbound (isJobRelated=true)
networking_outreach — specific job opportunity discussed, NOT generic connection (isJobRelated=true only if specific role discussed)
other — not a hiring-process event (isJobRelated=false)

━━━ LINKEDIN RULES ━━━
NOT hiring events (isJobRelated=false, category="other"):
- New connection / connection accepted
- Someone viewed your profile
- Someone followed you / endorsements / reactions / comments
- Generic recruiter follow or profile view with no specific role
- Content notifications

Hiring events (isJobRelated=true):
- Interview invitation via LinkedIn
- Recruiter message discussing a SPECIFIC named role
- Application status update from LinkedIn Jobs
- Offer or salary discussion

━━━ PRIORITY SCORE (0-100) ━━━
offer: 100 | interview_invite/interview_scheduled: 95 | technical_assignment/take_home_assignment: 90
salary_discussion/offer_discussion: 88 | reference_request: 80 | recruiter_response: 75
interview_rescheduled: 72 | follow_up_received: 65 | rejection: 55
position_closed/process_cancelled: 50 | application_confirmation: 20
application_sent/follow_up_sent: 15 | networking_outreach: 30 | other: 0

━━━ CONFIDENCE LEVELS ━━━
0.85+ → "high" | 0.65–0.84 → "medium" | <0.65 → "low"

━━━ RULES ━━━
- Only classify as isJobRelated=true if a hiring-process event clearly occurred
- A hiring-related sender does not automatically make an email job-related
- Keep summary to 1 sentence; reasoning to 1–2 sentences
- Return valid JSON only — no prose, no markdown outside the JSON object`

// ── Classification helpers ────────────────────────────────────────────────

function buildUserPrompt(emails: GmailEmail[], connectedEmail: string | null): string {
  const formatted = emails
    .map((e, i) =>
      `[${i + 1}] id="${e.id}" direction=${e.direction} from="${e.from}" ` +
      `subject="${e.subject}" snippet="${(e.snippet ?? "").slice(0, 300)}" ` +
      `labels=${e.gmailLabels?.join(",") || "none"} received=${e.receivedAt}`
    )
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
    try { return validateRow(raw as Record<string, unknown>, email) }
    catch { return safeDefaultRow(email) }
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

// ── Job matching ───────────────────────────────────────────────────────────

function normalizeCompany(s: string): string {
  return s.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\b(inc|ltd|llc|corp|limited|co|gmbh|sa|ag|bv|nv|plc|pvt)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

interface MatchResult {
  jobId: string | null
  confidence: "high" | "medium" | "low" | "none"
  signals: string[]
}

async function matchToJob(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  detectedCompany: string | null,
  detectedRole: string | null,
): Promise<MatchResult> {
  if (!detectedCompany) return { jobId: null, confidence: "none", signals: [] }

  const { data: jobs } = await adminClient
    .from("jobs")
    .select("id, company, role, status")
    .eq("user_id", userId)

  if (!jobs?.length) return { jobId: null, confidence: "none", signals: [] }

  const normTarget = normalizeCompany(detectedCompany)
  if (!normTarget) return { jobId: null, confidence: "none", signals: [] }

  let bestMatch: MatchResult = { jobId: null, confidence: "none", signals: [] }

  for (const job of jobs) {
    const normJob = normalizeCompany(job.company || "")
    if (!normJob) continue

    const companyMatches =
      normJob === normTarget ||
      normJob.includes(normTarget) ||
      normTarget.includes(normJob)

    if (!companyMatches) continue

    const signals = ["company_name"]
    let confidence: "high" | "medium" = "high"

    if (detectedRole) {
      const normRole = (detectedRole || "").toLowerCase().trim()
      const normJobRole = (job.role || "").toLowerCase().trim()
      if (normRole && normJobRole && (normJobRole.includes(normRole) || normRole.includes(normJobRole))) {
        signals.push("role_title")
      }
    }

    // Prefer non-terminal jobs
    const isTerminal = ["Rejected", "Archived", "Closed"].includes(job.status)
    if (!isTerminal) {
      return { jobId: job.id, confidence, signals }
    }
    // Keep as fallback
    if (bestMatch.jobId === null) {
      bestMatch = { jobId: job.id, confidence: "medium", signals }
    }
  }

  return bestMatch
}

// ── Main handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

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

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

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

    // 3. Throttle check (server-side)
    if (integration.last_sync_at) {
      const elapsed = Date.now() - new Date(integration.last_sync_at).getTime()
      if (elapsed < THROTTLE_MS) {
        return new Response(JSON.stringify({ skipped: true, reason: "recently_synced" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
    }

    // 4. Decrypt + refresh token if needed
    const encKey = Deno.env.get("INTEGRATION_ENCRYPTION_KEY")!
    let accessToken = await decrypt(integration.encrypted_access_token, encKey)

    const expiresAt = new Date(integration.expires_at)
    if (expiresAt <= new Date(Date.now() + 5 * 60 * 1000)) {
      if (!integration.encrypted_refresh_token) {
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
        return new Response(JSON.stringify({ error: "Session expired. Please reconnect Gmail.", needsReconnect: true }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
    }

    // 5. Fetch recent emails
    const emails = await fetchRecentEmails(accessToken, MAX_EMAILS, integration.email ?? undefined)
    if (emails.length === 0) {
      await adminClient.from("user_integrations")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("user_id", user.id).eq("provider", "gmail")
      return new Response(JSON.stringify({ skipped: false, newEvents: [], total: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // 6. Load cache (already classified emails)
    const emailIds = emails.map(e => e.id)
    const { data: existing } = await adminClient
      .from("email_classifications")
      .select("email_id")
      .eq("user_id", user.id)
      .in("email_id", emailIds)

    const cachedIds = new Set((existing ?? []).map(r => r.email_id))
    const newEmails = emails.filter(e => !cachedIds.has(e.id))

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

    // 8. AI classify
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

    // 9. Create hiring events from new job-related classifications
    const jobRelatedRows = aiRows.filter(r => r.is_job_related === true)
    const newEvents: Record<string, unknown>[] = []

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
      const match = await matchToJob(adminClient, user.id, company, role)

      const eventRow = {
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
        status: "pending",
        popup_shown: false,
      }

      const { data: inserted, error: eventErr } = await adminClient
        .from("hiring_events")
        .upsert(eventRow, { onConflict: "user_id,email_id" })
        .select()
        .single()

      if (!eventErr && inserted) {
        newEvents.push(inserted)
      }
    }

    // 10. Update has_unread_event on matched jobs
    const matchedJobIds = [...new Set(
      newEvents
        .filter(e => e.matched_job_id)
        .map(e => e.matched_job_id as string)
    )]
    if (matchedJobIds.length > 0) {
      await adminClient
        .from("jobs")
        .update({ has_unread_event: true })
        .in("id", matchedJobIds)
    }

    // 11. Update last_sync_at
    await adminClient
      .from("user_integrations")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("provider", "gmail")

    console.log(
      `gmail-sync: user=${user.id} fetched=${emails.length} new=${newEmails.length} ` +
      `classified=${aiRows.length} events=${newEvents.length}`
    )

    return new Response(
      JSON.stringify({ skipped: false, newEvents, total: emails.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (err) {
    console.error("gmail-sync unexpected error:", err.message)
    return new Response(
      JSON.stringify({ error: "Sync failed. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
