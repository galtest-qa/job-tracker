import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const supabase = createClient(supabaseUrl, serviceKey)

    // Get all users with Telegram enabled
    const { data: users, error: usersError } = await supabase
      .from("profiles")
      .select("id, telegram_bot_token, telegram_chat_id, last_rec_digest_at")
      .eq("telegram_enabled", true)
      .neq("telegram_bot_token", "")
      .neq("telegram_chat_id", "")

    if (usersError || !users?.length) {
      return new Response(JSON.stringify({ checked: 0, notified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "")
    const now = new Date().toISOString()
    const thirtyMinLater = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    let totalNotified = 0

    for (const user of users) {
      // Get due reminders — exclude completed AND soft-cancelled
      const { data: reminders } = await supabase
        .from("reminders")
        .select("id, title, due_at, note, job_id, jobs(company, role)")
        .eq("user_id", user.id)
        .eq("completed", false)
        .is("cancelled_at", null)
        .lte("due_at", thirtyMinLater)
        .or(`last_notified_at.is.null,last_notified_at.lt.${new Date(Date.now() - 3600000).toISOString()}`)
        .order("due_at")

      if (!reminders?.length) continue

      for (const r of reminders) {
        const due = new Date(r.due_at)
        const diffMs = due.getTime() - Date.now()
        const isOverdue = diffMs < 0

        let timeStr: string
        if (isOverdue) {
          const mins = Math.round(Math.abs(diffMs) / 60000)
          if (mins < 60) timeStr = `${mins}m overdue`
          else if (mins < 1440) timeStr = `${Math.round(mins / 60)}h overdue`
          else timeStr = `${Math.round(mins / 1440)}d overdue`
        } else {
          const mins = Math.round(diffMs / 60000)
          if (mins < 60) timeStr = `in ${mins}m`
          else timeStr = `in ${Math.round(mins / 60)}h`
        }

        const emoji = isOverdue ? "🔴" : "🟡"
        const job = (r as any).jobs
        const jobInfo = job ? `${job.company} — ${job.role}` : ""

        // Build message text with deep link
        let msg = `${emoji} <b>${r.title}</b> — ${timeStr}`
        if (jobInfo) msg += `\n📋 ${jobInfo}`
        if (r.note) msg += `\n📝 ${r.note}`
        if (appUrl && r.job_id) {
          msg += `\n\n<a href="${appUrl}/?job=${r.job_id}">Open Job →</a>`
        } else if (appUrl) {
          msg += `\n\n<a href="${appUrl}">Open App →</a>`
        }

        // Build inline keyboard
        // Row 1: action buttons (callback_data)
        const actionRow = [
          { text: "✅ Done", callback_data: `done:${r.id}` },
          { text: "⏭ 1d", callback_data: `snooze:${r.id}` },
          { text: "⏭ 3d", callback_data: `snooze3:${r.id}` },
          { text: "🗑 Cancel", callback_data: `cancel:${r.id}` },
        ]

        // Row 2: navigation buttons (url) — only when job_id is available
        const navRow = r.job_id && appUrl ? [
          { text: "✏️ Open Reminder", url: `${appUrl}/?job=${r.job_id}&tab=reminders` },
          { text: "📂 Open Job", url: `${appUrl}/?job=${r.job_id}&tab=updates` },
        ] : []

        const inlineKeyboard = navRow.length > 0 ? [actionRow, navRow] : [actionRow]

        try {
          await fetch(`https://api.telegram.org/bot${user.telegram_bot_token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: user.telegram_chat_id,
              text: msg,
              parse_mode: "HTML",
              link_preview_options: { is_disabled: true },
              reply_markup: { inline_keyboard: inlineKeyboard },
            }),
          })

          // Mark as notified
          await supabase
            .from("reminders")
            .update({ last_notified_at: now })
            .eq("id", r.id)

          totalNotified++
        } catch (err) {
          console.error(`Failed to notify user ${user.id}:`, err)
        }
      }
    }

    // ── Recommendations digest ─────────────────────────────────────────────
    // Generate fresh recommendations for every Telegram user (fire-and-forget),
    // then send a once-per-day digest for users whose recommendations are stale.
    const digestCutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString() // 20h ago
    const functionsBase = `${supabaseUrl}/functions/v1`
    const internalHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    }

    for (const user of users) {
      // Regenerate recommendations in background — never wait on this
      fetch(`${functionsBase}/generate-recommendations`, {
        method: "POST",
        headers: internalHeaders,
        body: JSON.stringify({ userId: user.id }),
      }).catch(() => {})

      // Skip digest if sent within the last 20 hours
      const lastDigest = (user as any).last_rec_digest_at
      if (lastDigest && lastDigest > digestCutoff) continue

      // Load top-3 active recommendations for this user
      const { data: recs } = await supabase
        .from("recommendations")
        .select("id, title, reason, priority, job_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("priority", { ascending: false })
        .limit(3)

      if (!recs?.length) continue

      // Build digest message
      const lines = ["🤖 <b>Job Maker — Daily Coach</b>\n"]
      for (const rec of recs) {
        lines.push(`→ ${rec.title}`)
        if (rec.reason) lines.push(`   <i>${rec.reason}</i>`)
      }
      if (appUrl) lines.push(`\n<a href="${appUrl}">Open App →</a>`)

      try {
        const res = await fetch(
          `https://api.telegram.org/bot${user.telegram_bot_token}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: user.telegram_chat_id,
              text: lines.join("\n"),
              parse_mode: "HTML",
              link_preview_options: { is_disabled: true },
            }),
          },
        )
        if (res.ok) {
          await supabase
            .from("profiles")
            .update({ last_rec_digest_at: now })
            .eq("id", user.id)
        }
      } catch (err) {
        console.error(`Digest failed for user ${user.id}:`, err)
      }
    }

    return new Response(JSON.stringify({ checked: users.length, notified: totalNotified }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
