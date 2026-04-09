import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { bot_token } = await req.json()
    if (!bot_token) {
      return new Response(JSON.stringify({ error: "bot_token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Fetch latest updates from the bot
    const res = await fetch(`https://api.telegram.org/bot${bot_token}/getUpdates?limit=5&offset=-5`)
    const data = await res.json()

    if (!data.ok) {
      return new Response(JSON.stringify({ error: "Invalid bot token. Make sure you copied the full token from @BotFather." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Find the most recent chat ID from a /start message or any message
    const updates = data.result || []
    let chatId = null

    for (const update of updates.reverse()) {
      const msg = update.message
      if (msg?.chat?.id) {
        chatId = String(msg.chat.id)
        break
      }
    }

    if (!chatId) {
      return new Response(JSON.stringify({ error: "No messages found. Send /start to your bot on Telegram first, then try again." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ chat_id: chatId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
