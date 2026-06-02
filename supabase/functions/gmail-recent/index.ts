import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { decrypt, encrypt } from "../_shared/crypto-utils.ts"
import { refreshAccessToken, fetchRecentEmails } from "../_shared/gmail-api.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Authenticate caller
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Verify JWT and get user identity
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Use service role to read encrypted token columns.
    // We use the verified user.id to scope the query — RLS equivalent enforced manually.
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const { data: integration, error: intErr } = await adminClient
      .from("user_integrations")
      .select("encrypted_access_token, encrypted_refresh_token, expires_at, email")
      .eq("user_id", user.id)   // explicit user scope — never reads another user's row
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

    // Refresh token if expired or expiring within 5 minutes
    const expiresAt = new Date(integration.expires_at)
    const needsRefresh = expiresAt <= new Date(Date.now() + 5 * 60 * 1000)

    if (needsRefresh) {
      if (!integration.encrypted_refresh_token) {
        return new Response(
          JSON.stringify({
            error: "Token expired and no refresh token available. Please reconnect Gmail.",
            needsReconnect: true,
          }),
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

        // Re-encrypt and persist the new access token
        const newEncryptedAccess = await encrypt(refreshed.accessToken, encKey)
        await adminClient
          .from("user_integrations")
          .update({
            encrypted_access_token: newEncryptedAccess,
            expires_at: refreshed.expiresAt.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .eq("provider", "gmail")
      } catch (refreshErr) {
        console.error("Token refresh failed:", refreshErr.message)
        return new Response(
          JSON.stringify({
            error: "Session expired. Please reconnect your Gmail account.",
            needsReconnect: true,
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        )
      }
    }

    // Fetch emails — metadata only, no full body
    // Pass connected email for direction fallback classification
    const emails = await fetchRecentEmails(accessToken, 30, integration.email ?? undefined)

    // Update last_sync_at
    await adminClient
      .from("user_integrations")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("provider", "gmail")

    return new Response(JSON.stringify({ emails }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("gmail-recent unexpected error:", err.message)
    return new Response(
      JSON.stringify({ error: "Failed to fetch emails. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
