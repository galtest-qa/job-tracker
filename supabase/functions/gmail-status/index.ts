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
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ connected: false }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ connected: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // RLS ensures this only returns the current user's row
    const { data } = await supabase
      .from("user_integrations")
      .select(
        "email, scopes, connected_at, last_sync_at, expires_at, " +
        "last_successful_sync_at, last_sync_status, last_sync_error, needs_reconnect",
      )
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .single()

    if (!data) {
      return new Response(JSON.stringify({ connected: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const needsReconnect = data.needs_reconnect ?? false
    const lastSyncStatus: string | null = data.last_sync_status ?? null

    type SyncHealth = "healthy" | "degraded" | "reconnect_required"
    let syncHealth: SyncHealth = "healthy"
    if (needsReconnect || lastSyncStatus === "reconnect_required") {
      syncHealth = "reconnect_required"
    } else if (lastSyncStatus === "failed") {
      syncHealth = "degraded"
    }

    return new Response(
      JSON.stringify({
        connected: true,
        email: data.email,
        scopes: data.scopes,
        connectedAt: data.connected_at,
        lastSyncAt: data.last_sync_at,
        lastSuccessfulSyncAt: data.last_successful_sync_at ?? null,
        lastSyncStatus,
        lastSyncError: data.last_sync_error ?? null,
        needsReconnect,
        syncHealth,
        // kept for backwards compatibility
        tokenExpired: data.expires_at ? new Date(data.expires_at) < new Date() : false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (err) {
    console.error("gmail-status error:", err.message)
    return new Response(JSON.stringify({ connected: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
