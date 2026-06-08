import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Registers a Telegram webhook for the authenticated user's bot.
// Called by Settings.jsx whenever the user saves their bot token.
// The webhook points to telegram-callback (deployed --no-verify-jwt).
// The TELEGRAM_WEBHOOK_SECRET is sent with every webhook request so
// telegram-callback can verify requests are genuine Telegram traffic.

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const { data: profile } = await admin
      .from("profiles")
      .select("telegram_bot_token, telegram_enabled")
      .eq("id", user.id)
      .single()

    if (!profile?.telegram_bot_token || !profile.telegram_enabled) {
      return new Response(
        JSON.stringify({ error: "Telegram not configured or not enabled" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")
    if (!webhookSecret) {
      return new Response(
        JSON.stringify({ error: "TELEGRAM_WEBHOOK_SECRET not set on server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Webhook URL = this Supabase project's telegram-callback function
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const callbackUrl = `${supabaseUrl}/functions/v1/telegram-callback`

    const res = await fetch(
      `https://api.telegram.org/bot${profile.telegram_bot_token}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: callbackUrl,
          secret_token: webhookSecret,
          allowed_updates: ["callback_query"],
          drop_pending_updates: true,
        }),
      },
    )

    const data = await res.json()
    if (!data.ok) {
      return new Response(
        JSON.stringify({ error: data.description || "Telegram rejected webhook setup" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    return new Response(
      JSON.stringify({ ok: true, webhookUrl: callbackUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (err) {
    console.error("telegram-setup-webhook error:", err instanceof Error ? err.message : String(err))
    return new Response(
      JSON.stringify({ error: "Failed to set up webhook" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
