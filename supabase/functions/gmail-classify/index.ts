import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { decrypt, encrypt } from "../_shared/crypto-utils.ts"
import { refreshAccessToken, fetchRecentEmails, fetchEmailBody, type GmailEmail } from "../_shared/gmail-api.ts"
import { shouldPreFilter, getPreFilterReason } from "../_shared/email-prefilter.ts"
import { applySignalOverride, getRecommendation, type SignalDetectionResult } from "../_shared/hiring-signal-detector.ts"

// ── Versioning ─────────────────────────────────────────────────────────────
const CLASSIFIER_VERSION = "1.0"
const PROMPT_VERSION = "3.0"
const MODEL = "gpt-4o-mini"

// ── Config ─────────────────────────────────────────────────────────────────
const MAX_EMAILS = 30
const BATCH_SIZE = 10   // smaller batches = reliable count matching
const SNIPPET_MAX = 500
const TEXT_MAX = 300  // max chars for summary / reasoning stored in DB

// ── Taxonomy ───────────────────────────────────────────────────────────────
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// ── AI classification ──────────────────────────────────────────────────────

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

If ANY of these phrases appear, classify as rejection (or position_closed if the role itself was cancelled),
even if the email ALSO contains:
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
  Examples: "we are discontinuing our recruitment process", "hiring has been put on hold",
  "we are no longer moving forward with any candidates at this time"
follow_up_sent — user sent a follow-up, outbound (isJobRelated=true)
follow_up_received — recruiter or employer followed up inbound (isJobRelated=true)
networking_outreach — specific job opportunity discussed, NOT generic connection (isJobRelated=true only if specific role discussed)
other — not a hiring-process event (isJobRelated=false)

━━━ LINKEDIN RULES ━━━
Emails from linkedin.com require strict evaluation. Most LinkedIn emails are NOT hiring events.

NOT hiring events (isJobRelated=false, category="other"):
- New connection / connection accepted
- Someone viewed your profile
- Someone followed you
- Endorsements, reactions, comments
- "X people viewed your profile this week"
- Generic recruiter follow / recruiter viewed your profile
- Content notifications, post engagement
- "You appeared in X searches"
- Generic outreach with no specific role mentioned

Hiring events (isJobRelated=true):
- Interview invitation via LinkedIn
- Recruiter message discussing a SPECIFIC named role or company opportunity
- Application status update from LinkedIn Jobs
- Assignment or next-step request from a recruiter
- Offer or salary discussion in messages

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
0.85+ → "high"
0.65–0.84 → "medium"
<0.65 → "low"

━━━ RULES ━━━
- Only classify as isJobRelated=true if a hiring-process event clearly occurred
- A hiring-related sender (recruiter, ATS, LinkedIn) does not automatically make an email job-related
- When signals conflict, the highest-priority outcome wins — polite openers never override a negative outcome
- Keep summary to 1 sentence; reasoning to 1–2 sentences
- Do not expose personal details in reasoning
- For links: include only if type is clearly detectable; use empty string for url if not visible
- Return valid JSON only — no prose, no markdown outside the JSON object`

function buildUserPrompt(
  emails: GmailEmail[],
  connectedEmail: string | null,
): string {
  const emailsFormatted = emails
    .map((e, idx) => {
      const snippetPart = `snippet="${(e.snippet ?? "").slice(0, 200)}"`
      const bodyPart = e.body ? ` body="${e.body.slice(0, 1500)}"` : ""
      return `[${idx + 1}] id="${e.id}" direction=${e.direction} from="${e.from}" ` +
        `subject="${e.subject}" ${snippetPart}${bodyPart} ` +
        `labels=${e.gmailLabels?.join(",") || "none"} received=${e.receivedAt}`
    })
    .join("\n\n")

  return `Connected Gmail: ${connectedEmail ?? "unknown"}
Today: ${new Date().toISOString().split("T")[0]}

Classify these ${emails.length} emails as hiring process events:

${emailsFormatted}

Return a JSON object with key "classifications" containing an array of exactly ${emails.length} objects in the same order:

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

function toConfidenceLevel(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.85) return "high"
  if (confidence >= 0.65) return "medium"
  return "low"
}

function validateRow(raw: Record<string, unknown>, email: GmailEmail): Record<string, unknown> {
  const confidence =
    typeof raw.confidence === "number" && raw.confidence >= 0 && raw.confidence <= 1
      ? raw.confidence
      : 0

  const category =
    typeof raw.category === "string" && ALLOWED_CATEGORIES.has(raw.category)
      ? raw.category
      : "other"

  const actionType =
    typeof raw.actionType === "string" && ALLOWED_ACTION_TYPES.has(raw.actionType)
      ? raw.actionType
      : "none"

  const links = Array.isArray(raw.links)
    ? (raw.links as Record<string, unknown>[])
        .filter((l) => l && typeof l.type === "string")
        .map((l) => ({ type: l.type, url: typeof l.url === "string" ? l.url : "" }))
        .slice(0, 5)
    : []

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
      typeof raw.confidenceLevel === "string" &&
      ["high", "medium", "low"].includes(raw.confidenceLevel)
        ? raw.confidenceLevel
        : toConfidenceLevel(confidence),
    is_job_related: typeof raw.isJobRelated === "boolean" ? raw.isJobRelated : false,
    priority_score:
      typeof raw.priorityScore === "number" &&
      raw.priorityScore >= 0 &&
      raw.priorityScore <= 100
        ? Math.round(raw.priorityScore)
        : 0,
    action_type: actionType,

    summary:
      typeof raw.summary === "string" ? raw.summary.slice(0, TEXT_MAX) : null,
    reasoning:
      typeof raw.reasoning === "string" ? raw.reasoning.slice(0, TEXT_MAX) : null,
    important_signals: Array.isArray(raw.importantSignals)
      ? (raw.importantSignals as string[]).slice(0, 10)
      : [],
    suggested_next_action:
      typeof raw.suggestedNextAction === "string"
        ? raw.suggestedNextAction.slice(0, 200)
        : null,

    detected_company:
      typeof raw.detectedCompany === "string" ? raw.detectedCompany : null,
    detected_role:
      typeof raw.detectedRole === "string" ? raw.detectedRole : null,
    recruiter_name:
      typeof raw.recruiterName === "string" ? raw.recruiterName : null,
    recruiter_email:
      typeof raw.recruiterEmail === "string" ? raw.recruiterEmail : null,

    action_required:
      typeof raw.actionRequired === "boolean" ? raw.actionRequired : false,
    interview_link_detected:
      typeof raw.interviewLinkDetected === "boolean"
        ? raw.interviewLinkDetected
        : false,
    deadline_mentioned:
      typeof raw.deadlineMentioned === "boolean" ? raw.deadlineMentioned : false,
    links,

    pre_filtered: false,
    model_used: MODEL,
    classifier_version: CLASSIFIER_VERSION,
    prompt_version: PROMPT_VERSION,
  }
}

function safeDefaultRow(email: GmailEmail): Record<string, unknown> {
  return {
    email_id: email.id,
    thread_id: email.threadId,
    from_address: email.from,
    subject: email.subject,
    snippet: (email.snippet ?? "").slice(0, SNIPPET_MAX),
    direction: email.direction,
    gmail_labels: email.gmailLabels,
    received_at: email.receivedAt,
    category: "other",
    confidence: 0,
    confidence_level: "low",
    is_job_related: false,
    priority_score: 0,
    action_type: "none",
    action_required: false,
    interview_link_detected: false,
    deadline_mentioned: false,
    links: [],
    important_signals: [],
    pre_filtered: false,
    model_used: MODEL,
    classifier_version: CLASSIFIER_VERSION,
    prompt_version: PROMPT_VERSION,
  }
}

interface BatchResult {
  row: Record<string, unknown>
  rawAI: Record<string, unknown> | null
  reachedAI: boolean
  overrideReason: string | null
  signalDebug: SignalDetectionResult | null
}

async function classifyBatch(
  emails: GmailEmail[],
  openaiKey: string,
  connectedEmail: string | null,
): Promise<BatchResult[]> {
  const prompt = buildUserPrompt(emails, connectedEmail)

  let parsed: { classifications?: unknown[] }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    })

    if (!res.ok) {
      console.error("OpenAI error:", res.status)
      return emails.map((e) => ({ row: safeDefaultRow(e), rawAI: null, reachedAI: true, overrideReason: `openai_error:${res.status}`, signalDebug: null }))
    }

    const data = await res.json()
    parsed = JSON.parse(data.choices[0].message.content)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("classifyBatch parse error:", msg)
    return emails.map((e) => ({ row: safeDefaultRow(e), rawAI: null, reachedAI: true, overrideReason: `parse_error:${msg}`, signalDebug: null }))
  }

  const rawList = parsed?.classifications
  if (!Array.isArray(rawList) || rawList.length === 0) {
    console.error("classifyBatch: no classifications returned, using safe defaults")
    return emails.map((e) => ({ row: safeDefaultRow(e), rawAI: null, reachedAI: true, overrideReason: "ai_returned_empty", signalDebug: null }))
  }

  // Match by emailId — resilient to AI returning fewer items than requested
  const byId = new Map(
    rawList.map((r: Record<string, unknown>) => [r.emailId as string, r])
  )

  if (rawList.length !== emails.length) {
    console.error(`classifyBatch: expected ${emails.length}, got ${rawList.length} — matching by id`)
  }

  return emails.map((email) => {
    const raw = byId.get(email.id) as Record<string, unknown> | undefined
    if (!raw) return { row: safeDefaultRow(email), rawAI: null, reachedAI: true, overrideReason: "ai_missing_email_id", signalDebug: null }
    try {
      const validated = validateRow(raw, email)

      // Track whether validateRow changed the AI output
      let overrideReason: string | null = null
      if (raw.category !== validated.category) {
        overrideReason = `invalid_category:${raw.category}→other`
      } else if (raw.isJobRelated !== validated.is_job_related) {
        overrideReason = `isJobRelated_coerced:${raw.isJobRelated}→${validated.is_job_related}`
      }

      // Post-processing: deterministic signal override scanning body + snippet.
      // Critical: the rejection phrase may not appear in the snippet (first ~150 chars)
      // but WILL appear in the full body. Concatenate both so we catch it.
      const fullText = `${email.body ?? ""} ${email.snippet ?? ""}`
      const signalResult = applySignalOverride(validated, email.subject, fullText)
      const finalRow = signalResult.overriddenRow
      // Stamp signal diagnostics onto the row for DB storage
      finalRow.detected_signals = signalResult.signalDebug?.detectedSignals ?? []
      finalRow.winning_signal = signalResult.signalDebug?.winningSignal?.signal ?? null
      finalRow.signal_selection_reason = signalResult.signalDebug?.selectionReason ?? null
      const finalOverrideReason = signalResult.overrideApplied
        ? signalResult.overrideReason
        : overrideReason

      return { row: finalRow, rawAI: raw, reachedAI: true, overrideReason: finalOverrideReason, signalDebug: signalResult.signalDebug }
    } catch {
      return { row: safeDefaultRow(email), rawAI: raw, reachedAI: true, overrideReason: "validate_threw", signalDebug: null }
    }
  })
}

// ── Main handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    // 1. Authenticate
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    // 2. Load Gmail tokens
    const { data: integration, error: intErr } = await adminClient
      .from("user_integrations")
      .select("encrypted_access_token, encrypted_refresh_token, expires_at, email")
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .single()

    if (intErr || !integration) {
      return new Response(
        JSON.stringify({ error: "Gmail not connected. Please connect your inbox first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const encKey = Deno.env.get("INTEGRATION_ENCRYPTION_KEY")!
    let accessToken = await decrypt(integration.encrypted_access_token, encKey)

    // 3. Refresh token if needed
    const expiresAt = new Date(integration.expires_at)
    if (expiresAt <= new Date(Date.now() + 5 * 60 * 1000)) {
      if (!integration.encrypted_refresh_token) {
        return new Response(
          JSON.stringify({ error: "Token expired. Please reconnect Gmail.", needsReconnect: true }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        )
      }
      const refreshToken = await decrypt(integration.encrypted_refresh_token, encKey)
      try {
        const refreshed = await refreshAccessToken(
          refreshToken,
          Deno.env.get("GOOGLE_CLIENT_ID")!,
          Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        )
        accessToken = refreshed.accessToken
        const newEncrypted = await encrypt(refreshed.accessToken, encKey)
        await adminClient
          .from("user_integrations")
          .update({
            encrypted_access_token: newEncrypted,
            expires_at: refreshed.expiresAt.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .eq("provider", "gmail")
      } catch {
        return new Response(
          JSON.stringify({ error: "Session expired. Please reconnect Gmail.", needsReconnect: true }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        )
      }
    }

    // 4. Fetch up to 50 recent emails
    const emails = await fetchRecentEmails(accessToken, MAX_EMAILS, integration.email ?? undefined)
    if (emails.length === 0) {
      return new Response(JSON.stringify({ classifications: [], total: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // 5. Version-aware cache — only skip emails classified with the CURRENT versions.
    // Emails classified by an older classifier_version or prompt_version are eligible
    // for reclassification so bad old classifications never get permanently stuck.
    const emailIds = emails.map((e) => e.id)
    const { data: existing } = await adminClient
      .from("email_classifications")
      .select("*")
      .eq("user_id", user.id)
      .in("email_id", emailIds)

    const existingRows = (existing ?? []) as Record<string, unknown>[]
    const existingMap = new Map(existingRows.map((r) => [r.email_id as string, r]))
    const newEmails = emails.filter((e) => {
      const cached = existingMap.get(e.id)
      if (!cached) return true  // never classified
      // Re-classify if versions are outdated
      return cached.classifier_version !== CLASSIFIER_VERSION || cached.prompt_version !== PROMPT_VERSION
    })

    // 6. Pre-filter new emails — track debug info per email
    const toClassify: GmailEmail[] = []
    const preFilteredRows: Record<string, unknown>[] = []

    // debugByEmailId accumulates per-email debug info for the response
    const debugByEmailId = new Map<string, Record<string, unknown>>()

    for (const email of newEmails) {
      const filterReason = getPreFilterReason(email)
      if (filterReason !== null) {
        debugByEmailId.set(email.id, {
          preFiltered: true,
          preFilterReason: filterReason,
          reachedAI: false,
          rawCategory: null,
          rawIsJobRelated: null,
          rawConfidence: null,
          finalCategory: "other",
          finalIsJobRelated: false,
          overrideReason: null,
        })
        preFilteredRows.push({
          user_id: user.id,
          email_id: email.id,
          thread_id: email.threadId,
          from_address: email.from,
          subject: email.subject,
          snippet: (email.snippet ?? "").slice(0, SNIPPET_MAX),
          direction: email.direction,
          gmail_labels: email.gmailLabels,
          received_at: email.receivedAt,
          category: "other",
          confidence: 0,
          confidence_level: "low",
          is_job_related: false,
          priority_score: 0,
          action_type: "none",
          action_required: false,
          interview_link_detected: false,
          deadline_mentioned: false,
          links: [],
          important_signals: [],
          pre_filtered: true,
          model_used: null,
          classifier_version: CLASSIFIER_VERSION,
          prompt_version: PROMPT_VERSION,
        })
      } else {
        toClassify.push(email)
      }
    }

    if (preFilteredRows.length > 0) {
      await adminClient
        .from("email_classifications")
        .upsert(preFilteredRows, { onConflict: "user_id,email_id" })
    }

    // 7. Fetch full email bodies for candidate emails (parallel, never throws)
    // The Gmail snippet is only ~150 chars. Rejection phrases like "move forward
    // with other candidates" often appear AFTER the polite opening and are cut off.
    if (toClassify.length > 0) {
      const bodyFetches = await Promise.allSettled(
        toClassify.map((e) => fetchEmailBody(accessToken, e.id)),
      )
      toClassify.forEach((e, i) => {
        const r = bodyFetches[i]
        if (r.status === "fulfilled" && r.value) e.body = r.value
      })
    }

    // 8. AI classify remaining in batches
    const openaiKey = Deno.env.get("OPENAI_API_KEY")
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured on server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const aiRows: Record<string, unknown>[] = []
    for (let i = 0; i < toClassify.length; i += BATCH_SIZE) {
      const batch = toClassify.slice(i, i + BATCH_SIZE)
      const batchResults = await classifyBatch(batch, openaiKey, integration.email)
      for (const br of batchResults) {
        const emailId = br.row.email_id as string
        debugByEmailId.set(emailId, {
          preFiltered: false,
          preFilterReason: null,
          reachedAI: br.reachedAI,
          rawCategory: br.rawAI?.category ?? null,
          rawIsJobRelated: br.rawAI?.isJobRelated ?? null,
          rawConfidence: br.rawAI?.confidence ?? null,
          finalCategory: br.row.category,
          finalIsJobRelated: br.row.is_job_related,
          overrideReason: br.overrideReason,
          // Signal debug: all detected signals, winning signal, why it was selected
          detectedSignals: br.signalDebug?.detectedSignals ?? [],
          winningSignal: br.signalDebug?.winningSignal ?? null,
          signalSelectionReason: br.signalDebug?.selectionReason ?? null,
          // Human-readable explanation of why the final category was chosen
          classificationReason: br.overrideReason
            ?? (typeof br.rawAI?.reasoning === "string" ? br.rawAI.reasoning : null),
        })
        aiRows.push(br.row)
      }
    }

    if (aiRows.length > 0) {
      await adminClient
        .from("email_classifications")
        .upsert(
          aiRows.map((r) => ({ ...r, user_id: user.id })),
          { onConflict: "user_id,email_id" },
        )
    }

    // 8. Return combined results in original email order (existing + newly classified)
    const { data: allClassified } = await adminClient
      .from("email_classifications")
      .select("*")
      .eq("user_id", user.id)
      .in("email_id", emailIds)

    const classMap = new Map((allClassified ?? []).map((r) => [r.email_id, r]))
    const classifications = emails.map((e) => {
      const base = classMap.get(e.id)
      if (!base) return null
      const dbg = debugByEmailId.get(e.id)
      // Cached emails (not in debugByEmailId) get inferred debug info from DB record
      if (!dbg) {
        return {
          ...base,
          preFiltered: base.pre_filtered ?? false,
          preFilterReason: base.pre_filtered ? "cached_pre_filtered" : null,
          reachedAI: !base.pre_filtered,
          rawCategory: null,
          rawIsJobRelated: null,
          rawConfidence: null,
          finalCategory: base.category,
          finalIsJobRelated: base.is_job_related,
          overrideReason: "cached",
        }
      }
      return { ...base, ...dbg }
    }).filter(Boolean)

    // Log summary only — never log email content
    console.log(
      `classify: user=${user.id} total=${emails.length} new=${newEmails.length} ` +
      `preFiltered=${preFilteredRows.length} aiClassified=${aiRows.length} ` +
      `cached=${emails.length - newEmails.length}`,
    )

    return new Response(
      JSON.stringify({
        classifications,
        total: classifications.length,
        jobRelated: classifications.filter((c: Record<string, unknown>) => c.is_job_related).length,
        preFiltered: preFilteredRows.length,
        cached: emails.length - newEmails.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (err) {
    console.error("gmail-classify unexpected error:", err.message)
    return new Response(
      JSON.stringify({ error: "Classification failed. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
