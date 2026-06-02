import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { verifyState, encrypt } from "../_shared/crypto-utils.ts"

// This function is called directly by Google — no user JWT, no CORS needed.
// Security relies entirely on the HMAC-signed state parameter.

serve(async (req) => {
  const reqUrl = new URL(req.url)
  const code = reqUrl.searchParams.get("code")
  const state = reqUrl.searchParams.get("state")
  const errorParam = reqUrl.searchParams.get("error")

  const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:5173"
  const redirectBase = `${appUrl}?gmail=`

  // User denied or Google returned an error
  if (errorParam) {
    console.warn("Gmail OAuth error from Google:", errorParam)
    return Response.redirect(`${redirectBase}error&reason=${encodeURIComponent(errorParam)}`)
  }

  if (!code || !state) {
    return Response.redirect(`${redirectBase}error&reason=missing_params`)
  }

  try {
    const stateSecret = Deno.env.get("OAUTH_STATE_SECRET")
    if (!stateSecret) {
      return Response.redirect(`${redirectBase}error&reason=server_config`)
    }

    // Verify HMAC signature + 10-min expiry
    const payload = await verifyState(state, stateSecret)
    if (!payload) {
      console.warn("gmail-oauth-callback: invalid or expired state")
      return Response.redirect(`${redirectBase}error&reason=invalid_state`)
    }

    const userId = payload.userId as string

    // Exchange authorization code for tokens
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID")!
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const redirectUri = `${supabaseUrl}/functions/v1/gmail-oauth-callback`

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}))
      console.error("Token exchange failed:", err)
      return Response.redirect(`${redirectBase}error&reason=token_exchange`)
    }

    const tokens = await tokenRes.json()
    const encKey = Deno.env.get("INTEGRATION_ENCRYPTION_KEY")!

    // Service role client — we verified userId from signed state, not user JWT
    const adminClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    // Fetch Gmail address from Google userinfo (non-sensitive, store plain)
    let gmailEmail: string | null = null
    try {
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      if (userInfoRes.ok) {
        const info = await userInfoRes.json()
        gmailEmail = info.email ?? null
      }
    } catch {
      // Non-fatal — we can still store tokens without the email
    }

    // Encrypt the access token
    const encryptedAccessToken = await encrypt(tokens.access_token, encKey)

    // Handle refresh token:
    // Google only returns refresh_token on the first consent grant.
    // If absent, preserve any existing refresh token in the DB.
    let encryptedRefreshToken: string | null = null

    if (tokens.refresh_token) {
      encryptedRefreshToken = await encrypt(tokens.refresh_token, encKey)
    } else {
      const { data: existing } = await adminClient
        .from("user_integrations")
        .select("encrypted_refresh_token")
        .eq("user_id", userId)
        .eq("provider", "gmail")
        .single()
      encryptedRefreshToken = existing?.encrypted_refresh_token ?? null
    }

    if (!encryptedRefreshToken) {
      console.error("No refresh token available for user", userId)
      return Response.redirect(`${redirectBase}error&reason=no_refresh_token`)
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const { error: upsertError } = await adminClient.from("user_integrations").upsert(
      {
        user_id: userId,
        provider: "gmail",
        email: gmailEmail,
        encrypted_access_token: encryptedAccessToken,
        encrypted_refresh_token: encryptedRefreshToken,
        expires_at: expiresAt,
        scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    )

    if (upsertError) {
      console.error("user_integrations upsert failed:", upsertError.message)
      return Response.redirect(`${redirectBase}error&reason=db_error`)
    }

    return Response.redirect(`${redirectBase}connected`)
  } catch (err) {
    console.error("gmail-oauth-callback unexpected error:", err.message)
    return Response.redirect(`${redirectBase}error&reason=internal`)
  }
})
