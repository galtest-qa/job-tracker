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
      .select("id, telegram_bot_token, telegram_chat_id")
      .eq("telegram_enabled", true)
      .neq("telegram_bot_token", "")
      .neq("telegram_chat_id", "")

    if (usersError || !users?.length) {
      return new Response(JSON.stringify({ checked: 0, notified: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const now = new Date().toISOString()
    const thirtyMinLater = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    let totalNotified = 0

    for (const user of users) {
      // Get due reminders for this user (overdue or due within 30 min, not yet notified)
      const { data: reminders } = await supabase
        .from("reminders")
        .select("id, title, due_at, note, job_id, jobs(company, role)")
        .eq("user_id", user.id)
        .eq("completed", false)
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

        let msg = `${emoji} <b>${r.title}</b> — ${timeStr}`
        if (jobInfo) msg += `\n📋 ${jobInfo}`
        if (r.note) msg += `\n📝 ${r.note}`

        try {
          await fetch(`https://api.telegram.org/bot${user.telegram_bot_token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: user.telegram_chat_id,
              text: msg,
              parse_mode: "HTML",
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
