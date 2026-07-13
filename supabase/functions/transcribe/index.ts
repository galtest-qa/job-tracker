// Whisper transcription proxy — lets users without a personal OpenAI key
// submit voice answers. Body: { audio: base64, mime: string }.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const MAX_AUDIO_BYTES = 15 * 1024 * 1024 // ~15 MB ≈ several minutes of audio

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Identify the caller from their JWT — no anonymous transcription
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { audio, mime } = await req.json()
    if (!audio || typeof audio !== "string") {
      return new Response(JSON.stringify({ error: "Missing audio" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0))
    if (bytes.length > MAX_AUDIO_BYTES) {
      return new Response(JSON.stringify({ error: "Recording too long — keep answers under a few minutes." }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const mimeType = typeof mime === "string" && mime.startsWith("audio/") ? mime : "audio/webm"
    const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm"

    const form = new FormData()
    form.append("file", new Blob([bytes], { type: mimeType }), `answer.${ext}`)
    form.append("model", "whisper-1")

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}` },
      body: form,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error("transcribe: OpenAI error", res.status, err)
      return new Response(JSON.stringify({ error: err.error?.message || `Transcription failed (${res.status})` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const data = await res.json()
    return new Response(JSON.stringify({ text: data.text ?? "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
