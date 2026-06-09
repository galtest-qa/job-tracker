import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Only notify for these high-signal event types
const NOTIFIABLE_TYPES = new Set([
  "interview_invite",
  "interview_scheduled",
  "offer",
  "rejection",
])

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 })

  let body: { userId?: string; eventIds?: string[] } = {}
  try { body = await req.json() } catch { /* ignore */ }

  if (!body.userId) {
    return new Response(JSON.stringify({ error: "userId required" }), { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  try {
    const sent = await notifyUser(supabase, body.userId, body.eventIds)
    return new Response(JSON.stringify({ sent }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("telegram-notify-events error:", (err as Error).message)
    return new Response(JSON.stringify({ error: "Failed" }), { status: 500 })
  }
})

async function notifyUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  eventIds?: string[],
): Promise<number> {
  // Load Telegram config for this user
  const { data: profile } = await supabase
    .from("profiles")
    .select("telegram_bot_token, telegram_chat_id, telegram_enabled")
    .eq("id", userId)
    .maybeSingle()

  if (!profile?.telegram_enabled || !profile.telegram_bot_token || !profile.telegram_chat_id) {
    return 0 // Telegram not configured
  }

  // Load qualifying events: specific IDs or all unnotified for this user
  let query = supabase
    .from("hiring_events")
    .select("id, event_type, title, matched_job_id, extracted_company, extracted_role, description")
    .eq("user_id", userId)
    .is("telegram_notified_at", null)

  if (eventIds?.length) {
    query = query.in("id", eventIds)
  }

  const { data: events } = await query

  const notifiableEvents = (events ?? []).filter((e) => NOTIFIABLE_TYPES.has(e.event_type))
  if (notifiableEvents.length === 0) return 0

  const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "")
  let sent = 0

  for (const event of notifiableEvents) {
    const company = event.extracted_company || "A company"
    const role = event.extracted_role ? ` for ${event.extracted_role}` : ""

    const { text, emoji } = buildMessage(event.event_type, company, role, event.description)

    const jobLink = event.matched_job_id && appUrl
      ? `${appUrl}/?job=${event.matched_job_id}&tab=updates`
      : appUrl || null

    const messageLines = [emoji + " " + text]
    if (jobLink) messageLines.push(`\n<a href="${jobLink}">View Updates →</a>`)

    const inlineKeyboard: Record<string, unknown>[][] = []
    // Action row
    const actionRow: Record<string, unknown>[] = [
      { text: "✅ Acknowledge", callback_data: `event_ack:${event.id}` },
    ]
    if (jobLink) {
      actionRow.push({ text: "📂 Open Job", url: jobLink })
    }
    inlineKeyboard.push(actionRow)

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${profile.telegram_bot_token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: profile.telegram_chat_id,
            text: messageLines.join(""),
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
            reply_markup: { inline_keyboard: inlineKeyboard },
          }),
        },
      )

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.error(`Telegram send failed for event ${event.id}:`, err)
        continue
      }

      // Mark as notified — use the event's own field, not popup_shown
      await supabase
        .from("hiring_events")
        .update({ telegram_notified_at: new Date().toISOString() })
        .eq("id", event.id)

      sent++
    } catch (err) {
      console.error(`Failed to notify for event ${event.id}:`, err)
    }
  }

  console.log(`telegram-notify-events: user=${userId} sent=${sent}`)
  return sent
}

function buildMessage(
  eventType: string,
  company: string,
  role: string,
  description: string | null,
): { text: string; emoji: string } {
  switch (eventType) {
    case "interview_invite":
      return {
        emoji: "🎯",
        text: `<b>Interview invite — ${company}</b>${role}\n${description ?? "You've been invited to interview."}`,
      }
    case "interview_scheduled":
      return {
        emoji: "📅",
        text: `<b>Interview scheduled — ${company}</b>${role}\n${description ?? "Your interview has been confirmed."}`,
      }
    case "offer":
      return {
        emoji: "🎉",
        text: `<b>Offer received — ${company}</b>${role}\n${description ?? "You received a job offer. Review the details carefully."}`,
      }
    case "rejection":
      // Respectful, not alarming
      return {
        emoji: "📭",
        text: `<b>Update from ${company}</b>\nThey've decided to move forward with other candidates${role ? ` for the ${role.replace(" for ", "")} role` : ""}. Keep going — the right opportunity is ahead.`,
      }
    default:
      return { emoji: "📋", text: `<b>Update from ${company}</b>` }
  }
}
