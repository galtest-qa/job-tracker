import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { decrypt, encrypt } from "../_shared/crypto-utils.ts"
import { refreshAccessToken, fetchRecentEmails, type GmailEmail } from "../_shared/gmail-api.ts"
import { shouldPreFilter } from "../_shared/email-prefilter.ts"

// ── Versioning ─────────────────────────────────────────────────────────────
const CLASSIFIER_VERSION = "1.0"
const PROMPT_VERSION = "1.0"
const MODEL = "gpt-4o-mini"

// ── Config ─────────────────────────────────────────────────────────────────
const MAX_EMAILS = 20
const BATCH_SIZE = 20   // single AI call for all new emails
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

Your job is to detect meaningful hiring events from email metadata (subject, snippet, sender, direction, labels).
You receive only subject lines, snippets, and headers — never full email bodies.

Supported languages: English, Hebrew, mixed Hebrew+English. Understand intent regardless of language.

Hebrew examples to correctly detect:
- "נשמח לקבוע איתך ראיון" = interview_invite
- "עברת לשלב הבא" = recruiter_response
- "לצערנו החלטנו להמשיך עם מועמדים אחרים" = rejection

TAXONOMY:
- application_confirmation: employer confirms receipt of application
- application_sent: user sent a job application (outbound)
- recruiter_response: recruiter replied, showed interest, or reached out
- interview_invite: explicit invitation to interview
- interview_scheduled: interview time confirmed
- interview_rescheduled: existing interview moved to new time
- technical_assignment: coding challenge or technical test assigned
- take_home_assignment: take-home project or case study
- reference_request: request for professional references
- salary_discussion: compensation or salary conversation
- offer: job offer received
- offer_discussion: negotiating terms of an offer
- rejection: employer is not moving forward
- follow_up_sent: user sent a follow-up (outbound)
- follow_up_received: recruiter or employer followed up (inbound)
- networking_outreach: professional networking related to job search
- other: not job-related or genuinely unclear

ACTION TYPES:
none, review_email, schedule_interview, submit_assignment, reply_to_recruiter,
prepare_for_interview, follow_up, review_offer, provide_references, salary_discussion

PRIORITY SCORE guidance (0-100):
- offer: 100
- interview_invite / interview_scheduled: 95-100
- technical_assignment / take_home_assignment: 90-95
- salary_discussion / offer_discussion: 85-95
- recruiter_response: 80
- reference_request: 80
- interview_rescheduled: 75
- follow_up_received: 70
- rejection: 50
- networking_outreach: 30
- application_confirmation: 20
- application_sent: 15
- follow_up_sent: 15
- other: 0-10

CONFIDENCE LEVELS:
- 0.85+ = "high"
- 0.65-0.85 = "medium"
- <0.65 = "low"

RULES:
- Precision over recall: when genuinely uncertain, use category "other" with isJobRelated=false
- Keep summary to 1 sentence, reasoning to 1-2 sentences
- Do not expose sensitive personal details in reasoning
- For links: only include if the link type is clearly detectable from context; use empty string for url if not visible
- Return valid JSON object only — no prose, no markdown, no explanation outside JSON`

function buildUserPrompt(
  emails: GmailEmail[],
  connectedEmail: string | null,
): string {
  const emailsFormatted = emails
    .map(
      (e, idx) =>
        `[${idx + 1}] id="${e.id}" direction=${e.direction} from="${e.from}" ` +
        `subject="${e.subject}" snippet="${(e.snippet ?? "").slice(0, 300)}" ` +
        `labels=${e.gmailLabels?.join(",") || "none"} received=${e.receivedAt}`,
    )
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

async function classifyBatch(
  emails: GmailEmail[],
  openaiKey: string,
  connectedEmail: string | null,
): Promise<Record<string, unknown>[]> {
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
      return emails.map(safeDefaultRow)
    }

    const data = await res.json()
    parsed = JSON.parse(data.choices[0].message.content)
  } catch (err) {
    console.error("classifyBatch parse error:", err.message)
    return emails.map(safeDefaultRow)
  }

  const rawList = parsed?.classifications
  if (!Array.isArray(rawList) || rawList.length !== emails.length) {
    console.error(
      `classifyBatch: expected ${emails.length} results, got ${Array.isArray(rawList) ? rawList.length : "non-array"}`,
    )
    return emails.map(safeDefaultRow)
  }

  return emails.map((email, idx) => {
    try {
      return validateRow(rawList[idx] as Record<string, unknown>, email)
    } catch {
      return safeDefaultRow(email)
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

    // 5. Load existing classifications (cache)
    const emailIds = emails.map((e) => e.id)
    const { data: existing } = await adminClient
      .from("email_classifications")
      .select("*")
      .eq("user_id", user.id)
      .in("email_id", emailIds)

    const existingMap = new Map((existing ?? []).map((r) => [r.email_id, r]))
    const newEmails = emails.filter((e) => !existingMap.has(e.id))

    // 6. Pre-filter new emails
    const toClassify: GmailEmail[] = []
    const preFilteredRows: Record<string, unknown>[] = []

    for (const email of newEmails) {
      if (shouldPreFilter(email)) {
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

    // 7. AI classify remaining in batches
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
      const results = await classifyBatch(batch, openaiKey, integration.email)
      aiRows.push(...results)
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
    const classifications = emails.map((e) => classMap.get(e.id)).filter(Boolean)

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
