import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Terminal stages — never generate recommendations for these
const TERMINAL_STATUSES = new Set(["Rejected", "Offer"])

// How long a recommendation stays active before expiring
const EXPIRES_DAYS = 7

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } })
  }

  let body: { userId?: string } = {}
  try { body = await req.json() } catch { /* userId may come from JWT */ }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  // Resolve userId — accept explicit param (from gmail-sync) or derive from JWT
  let userId = body.userId
  if (!userId) {
    const authHeader = req.headers.get("Authorization") ?? ""
    if (authHeader.startsWith("Bearer ")) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      )
      const { data: { user } } = await userClient.auth.getUser()
      userId = user?.id
    }
  }

  if (!userId) {
    return new Response(JSON.stringify({ error: "userId required" }), { status: 401 })
  }

  try {
    const generated = await generateForUser(supabase, userId)
    return new Response(JSON.stringify({ generated }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("generate-recommendations error:", (err as Error).message)
    return new Response(JSON.stringify({ error: "Failed" }), { status: 500 })
  }
})

async function generateForUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<number> {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Load non-terminal jobs for the user
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, company, role, status, created_at, updated_at")
    .eq("user_id", userId)
    .not("status", "in", `(${[...TERMINAL_STATUSES].map(s => `"${s}"`).join(",")})`)

  if (!jobs?.length) return 0

  const jobIds = jobs.map((j) => j.id)

  // Load hiring events for these jobs (last 30 days)
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: events } = await supabase
    .from("hiring_events")
    .select("id, job_id, event_type, status, created_at")
    .in("job_id", jobIds)
    .gte("created_at", since30d)

  // Load future reminders for these jobs
  const { data: reminders } = await supabase
    .from("reminders")
    .select("id, job_id, due_at, completed, cancelled_at")
    .in("job_id", jobIds)
    .eq("completed", false)
    .is("cancelled_at", null)
    .gte("due_at", now.toISOString())

  // Index for fast lookup
  const eventsByJob = new Map<string, typeof events>()
  for (const e of events ?? []) {
    if (!eventsByJob.has(e.job_id)) eventsByJob.set(e.job_id, [])
    eventsByJob.get(e.job_id)!.push(e)
  }
  const remindersByJob = new Map<string, typeof reminders>()
  for (const r of reminders ?? []) {
    if (!remindersByJob.has(r.job_id)) remindersByJob.set(r.job_id, [])
    remindersByJob.get(r.job_id)!.push(r)
  }

  const upsertRows: Record<string, unknown>[] = []

  for (const job of jobs) {
    const jobEvents = eventsByJob.get(job.id) ?? []
    const jobReminders = remindersByJob.get(job.id) ?? []
    const interviewEvents = jobEvents.filter(
      (e) => e.event_type === "interview_invite" || e.event_type === "interview_scheduled",
    )

    // ── move_to_interview ──────────────────────────────────────────────────
    // An interview event exists but the job is not yet in the Interview stage
    if (
      interviewEvents.length > 0 &&
      job.status !== "Interview"
    ) {
      const ev = interviewEvents[0]
      upsertRows.push({
        user_id: userId,
        job_id: job.id,
        type: "move_to_interview",
        title: `Move ${job.company} to Interview`,
        reason: `You have a${ev.event_type === "interview_invite" ? "n interview invitation" : "n interview scheduled"} from ${job.company} but the job is still in "${job.status}".`,
        priority: 90,
        status: "active",
        expires_at: expiresAt,
        context: { event_id: ev.id, event_type: ev.event_type, suggested_stage: "Interview" },
      })
    }

    // ── add_interview_reminder ─────────────────────────────────────────────
    // Has an interview event within last 7 days but no future reminders
    const recent7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const recentInterviews = interviewEvents.filter((e) => e.created_at >= recent7d)
    if (recentInterviews.length > 0 && jobReminders.length === 0) {
      upsertRows.push({
        user_id: userId,
        job_id: job.id,
        type: "add_interview_reminder",
        title: `Add interview reminder for ${job.company}`,
        reason: `You have an upcoming interview at ${job.company} with no reminders set.`,
        priority: 85,
        status: "active",
        expires_at: expiresAt,
        context: { job_company: job.company, job_role: job.role },
      })
    }

    // ── prepare_for_interview ──────────────────────────────────────────────
    // Job is in Interview stage and has a recent interview_scheduled event
    const scheduledRecently = jobEvents.some(
      (e) => e.event_type === "interview_scheduled" && e.created_at >= recent7d,
    )
    if (job.status === "Interview" && scheduledRecently) {
      upsertRows.push({
        user_id: userId,
        job_id: job.id,
        type: "prepare_for_interview",
        title: `Prepare for your ${job.company} interview`,
        reason: `You have an interview scheduled at ${job.company}. Use the Interview Prep tab to prepare.`,
        priority: 75,
        status: "active",
        expires_at: expiresAt,
        context: { job_company: job.company, job_role: job.role },
      })
    }

    // ── follow_up_application ──────────────────────────────────────────────
    // Job is Applied/Waiting with no hiring activity for 14+ days
    if (job.status === "Applied / Waiting") {
      const daysSinceActivity = jobEvents.length > 0
        ? (now.getTime() - new Date(jobEvents.sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0].created_at).getTime()) / (24 * 60 * 60 * 1000)
        : (now.getTime() - new Date(job.updated_at ?? job.created_at).getTime()) / (24 * 60 * 60 * 1000)

      if (daysSinceActivity >= 14) {
        const daysAgo = Math.round(daysSinceActivity)
        upsertRows.push({
          user_id: userId,
          job_id: job.id,
          type: "follow_up_application",
          title: `Follow up with ${job.company}`,
          reason: `No activity on your ${job.company} application for ${daysAgo} days. Consider sending a follow-up.`,
          priority: 60,
          status: "active",
          expires_at: expiresAt,
          context: { days_since_activity: daysAgo, job_company: job.company, job_role: job.role },
        })
      }
    }
  }

  if (upsertRows.length === 0) return 0

  // Upsert — ON CONFLICT updates the recommendation to keep it fresh
  const { error } = await supabase
    .from("recommendations")
    .upsert(upsertRows, {
      onConflict: "user_id,job_id,type",
      ignoreDuplicates: false,
    })

  if (error) {
    console.error("recommendations upsert error:", error.message)
    return 0
  }

  // Clean up expired recommendations for this user
  await supabase
    .from("recommendations")
    .delete()
    .eq("user_id", userId)
    .eq("status", "active")
    .lt("expires_at", now.toISOString())

  console.log(`generate-recommendations: user=${userId} rows=${upsertRows.length}`)
  return upsertRows.length
}
