import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Deployed with --no-verify-jwt — Telegram does not send Supabase JWTs.
// Security relies on:
//   1. X-Telegram-Bot-Api-Secret-Token header (set during setWebhook)
//   2. Reminder ownership check (reminder.user_id == profile.id)
//   3. User lookup via callback_query.message.chat.id == profiles.telegram_chat_id
//      (telegram_chat_id is stored by telegram-detect-chat as msg.chat.id)

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  // ── 1. Validate shared webhook secret ────────────────────────────────────
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")
  const incoming = req.headers.get("X-Telegram-Bot-Api-Secret-Token")
  if (!webhookSecret || incoming !== webhookSecret) {
    console.warn("telegram-callback: rejected — invalid secret token")
    return new Response("Forbidden", { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response("Bad Request", { status: 400 })
  }

  // ── 2. Only handle callback_query (inline button clicks) ──────────────────
  const cbq = body.callback_query as Record<string, unknown> | undefined
  if (!cbq) {
    // Silently acknowledge other update types (messages, etc.)
    return new Response("ok", { status: 200 })
  }

  const callbackQueryId = cbq.id as string
  const message = cbq.message as Record<string, unknown> | undefined
  // Use message.chat.id — same field that telegram-detect-chat stores as telegram_chat_id
  const chatId = String((message?.chat as Record<string, unknown>)?.id ?? "")
  const callbackData = cbq.data as string | undefined

  if (!chatId || !callbackData) {
    return new Response("ok", { status: 200 })
  }

  // ── 3. Parse action:id ───────────────────────────────────────────────────
  const sep = callbackData.indexOf(":")
  if (sep === -1) return new Response("ok", { status: 200 })

  const action = callbackData.slice(0, sep)
  const entityId = callbackData.slice(sep + 1)

  if (!["done", "snooze", "snooze3", "cancel", "event_ack"].includes(action) || !entityId) {
    return new Response("ok", { status: 200 })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  // ── 4. Look up user by chat_id ────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, telegram_bot_token")
    .eq("telegram_chat_id", chatId)
    .eq("telegram_enabled", true)
    .maybeSingle()

  if (!profile) {
    console.warn("telegram-callback: no profile for chat_id", chatId)
    return new Response("ok", { status: 200 })
  }

  // ── 5a. Hiring event acknowledgement ─────────────────────────────────────
  if (action === "event_ack") {
    const { data: event } = await supabase
      .from("hiring_events")
      .select("id, user_id, status")
      .eq("id", entityId)
      .eq("user_id", profile.id)
      .maybeSingle()

    if (!event) {
      await answer(profile.telegram_bot_token, callbackQueryId, "⚠️ Event not found.")
      return new Response("ok", { status: 200 })
    }

    if (event.status !== "pending") {
      await answer(profile.telegram_bot_token, callbackQueryId, "ℹ️ Already acknowledged.")
      return new Response("ok", { status: 200 })
    }

    await supabase
      .from("hiring_events")
      .update({ status: "reviewed" })
      .eq("id", entityId)

    await answer(profile.telegram_bot_token, callbackQueryId, "✅ Acknowledged.")
    return new Response("ok", { status: 200 })
  }

  // ── 5b. Verify reminder ownership ────────────────────────────────────────
  const { data: reminder } = await supabase
    .from("reminders")
    .select("id, user_id, due_at, completed, cancelled_at")
    .eq("id", entityId)
    .eq("user_id", profile.id)
    .maybeSingle()

  if (!reminder) {
    await answer(profile.telegram_bot_token, callbackQueryId, "⚠️ Reminder not found.")
    return new Response("ok", { status: 200 })
  }

  if (reminder.completed || reminder.cancelled_at) {
    await answer(profile.telegram_bot_token, callbackQueryId, "ℹ️ Already handled.")
    return new Response("ok", { status: 200 })
  }

  // ── 6. Execute reminder action ────────────────────────────────────────────
  let confirmText = ""

  if (action === "done") {
    await supabase
      .from("reminders")
      .update({ completed: true })
      .eq("id", entityId)
    confirmText = "✅ Marked as done!"

  } else if (action === "snooze" || action === "snooze3") {
    // Always base snooze on NOW — prevents immediate re-fire if already overdue
    const days = action === "snooze3" ? 3 : 1
    const newDue = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    const { error: snoozeError } = await supabase
      .from("reminders")
      .update({
        due_at: newDue.toISOString(),
        last_notified_at: new Date().toISOString(),
      })
      .eq("id", entityId)
    if (snoozeError) {
      console.error("snooze update failed:", snoozeError.message)
      await answer(profile.telegram_bot_token, callbackQueryId, "⚠️ Snooze failed, please try again.")
      return new Response("ok", { status: 200 })
    }
    confirmText = days === 3 ? "⏭ Snoozed by 3 days." : "⏭ Snoozed by 1 day."

  } else if (action === "cancel") {
    await supabase
      .from("reminders")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("id", entityId)
    confirmText = "🗑 Reminder cancelled."
  }

  await answer(profile.telegram_bot_token, callbackQueryId, confirmText)
  return new Response("ok", { status: 200 })
})

async function answer(botToken: string, callbackQueryId: string, text: string) {
  if (!botToken || !callbackQueryId) return
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false }),
    })
  } catch (err) {
    console.warn("answerCallbackQuery failed:", err instanceof Error ? err.message : String(err))
  }
}
