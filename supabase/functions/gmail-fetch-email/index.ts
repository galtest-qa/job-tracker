import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { decrypt, encrypt } from "../_shared/crypto-utils.ts"
import { refreshAccessToken } from "../_shared/gmail-api.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// ── Body extraction ────────────────────────────────────────────────────────

interface Part {
  mimeType?: string
  body?: { data?: string; size?: number }
  parts?: Part[]
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64 + "==".slice(0, (4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  return new TextDecoder("utf-8").decode(
    Uint8Array.from(binary, (c) => c.charCodeAt(0))
  )
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function extractBody(part: Part): { plain: string | null; html: string | null } {
  const mime = part.mimeType ?? ""
  const data = part.body?.data

  if (mime === "text/plain" && data) return { plain: decodeBase64Url(data), html: null }
  if (mime === "text/html" && data) return { plain: null, html: decodeBase64Url(data) }

  if (mime.startsWith("multipart/") && part.parts) {
    let plain: string | null = null
    let html: string | null = null
    for (const p of part.parts) {
      const r = extractBody(p)
      if (!plain && r.plain) plain = r.plain
      if (!html && r.html) html = r.html
    }
    return { plain, html }
  }

  return { plain: null, html: null }
}

// ── Handler ────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const url = new URL(req.url)
    const emailId = url.searchParams.get("emailId")?.trim()
    if (!emailId) {
      return new Response(JSON.stringify({ error: "emailId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Authenticate user
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

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    // Verify ownership: user must own this email classification
    const { data: classRow } = await adminClient
      .from("email_classifications")
      .select("email_id")
      .eq("email_id", emailId)
      .eq("user_id", user.id)
      .single()

    if (!classRow) {
      return new Response(JSON.stringify({ error: "Email not found or access denied" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Load Gmail integration
    const { data: integration } = await adminClient
      .from("user_integrations")
      .select("encrypted_access_token, encrypted_refresh_token, expires_at")
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .single()

    if (!integration) {
      return new Response(JSON.stringify({ error: "Gmail not connected" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const encKey = Deno.env.get("INTEGRATION_ENCRYPTION_KEY")!
    let accessToken = await decrypt(integration.encrypted_access_token, encKey)

    // Refresh token if needed
    if (new Date(integration.expires_at) <= new Date(Date.now() + 5 * 60 * 1000)) {
      const refreshToken = await decrypt(integration.encrypted_refresh_token, encKey)
      const refreshed = await refreshAccessToken(
        refreshToken,
        Deno.env.get("GOOGLE_CLIENT_ID")!,
        Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      )
      accessToken = refreshed.accessToken
      await adminClient
        .from("user_integrations")
        .update({
          encrypted_access_token: await encrypt(refreshed.accessToken, encKey),
          expires_at: refreshed.expiresAt.toISOString(),
        })
        .eq("user_id", user.id)
        .eq("provider", "gmail")
    }

    // Fetch full message from Gmail — body only, no logging of content
    const gmailRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )

    if (!gmailRes.ok) {
      console.error("Gmail fetch failed:", gmailRes.status)
      return new Response(JSON.stringify({ error: "Could not retrieve email from Gmail" }), {
        status: gmailRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const msg = await gmailRes.json()
    const { plain, html } = extractBody(msg.payload ?? {})

    let body: string
    if (plain) {
      body = plain
    } else if (html) {
      body = stripHtml(html)
    } else {
      body = "No readable content found in this email."
    }

    // Cap at 8KB — enough for any hiring email, avoids large newsletter bodies
    return new Response(
      JSON.stringify({ body: body.slice(0, 8000) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (err) {
    console.error("gmail-fetch-email error:", err.message)
    return new Response(
      JSON.stringify({ error: "Failed to fetch email content. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
