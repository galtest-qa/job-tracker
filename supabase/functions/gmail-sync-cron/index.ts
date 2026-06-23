// gmail-sync-cron — background Gmail sync runner
// Called every 5 minutes by pg_cron via net.http_post.
// Finds all connected users who haven't synced recently and triggers
// gmail-sync for each one using the internal cron-mode header.
//
// Auth: must be called with the Supabase service role key.
// No user JWT is required — this is a background server-to-server call.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// How many minutes must have passed since last_sync_at before we re-sync.
// Set slightly under gmail-sync's own 15-min server throttle so cron drives
// the schedule rather than the throttle.
const SYNC_INTERVAL_MS = 14 * 60 * 1000  // 14 minutes

// Max seconds to wait for a single user's sync before aborting.
// gmail-sync can take up to 30s for full classification; 50s gives headroom.
const PER_USER_TIMEOUT_MS = 50_000

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*" },
    })
  }

  const supabaseUrl  = Deno.env.get("SUPABASE_URL")!
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  // JWT verification is handled by Supabase gateway (verify_jwt=true).
  // Only calls with a valid service role JWT can reach this function.
  const adminClient = createClient(supabaseUrl, serviceKey)
  const runAt = new Date().toISOString()
  const now = Date.now()

  // ── 1. Find users eligible for background sync ──────────────────────────
  const { data: integrations, error } = await adminClient
    .from("user_integrations")
    .select("user_id, last_sync_at, email")
    .eq("provider", "gmail")
    .eq("needs_reconnect", false)
    .not("encrypted_access_token", "is", null)

  if (error) {
    console.error("gmail-sync-cron: failed to load integrations:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }

  const total = integrations?.length ?? 0

  // Filter: skip users synced within the last SYNC_INTERVAL_MS
  const eligible = (integrations ?? []).filter(i => {
    if (!i.last_sync_at) return true
    return now - new Date(i.last_sync_at).getTime() > SYNC_INTERVAL_MS
  })

  const skippedThrottle = total - eligible.length

  console.log(
    `gmail-sync-cron: runAt=${runAt} total=${total} eligible=${eligible.length}` +
    ` skipped_throttle=${skippedThrottle}`,
  )

  if (eligible.length === 0) {
    return new Response(JSON.stringify({
      runAt, total, eligible: 0, skipped_throttle: skippedThrottle,
      synced: 0, errors: 0, reconnect_required: 0,
    }), { headers: { "Content-Type": "application/json" } })
  }

  // ── 2. Sync each eligible user via gmail-sync (cron-mode) ───────────────
  const functionsBase = `${supabaseUrl}/functions/v1`
  let synced = 0
  let errors = 0
  let reconnectRequired = 0

  for (const integration of eligible) {
    try {
      const res = await fetch(`${functionsBase}/gmail-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
          "X-Cron-User-Id": integration.user_id,
        },
        signal: AbortSignal.timeout(PER_USER_TIMEOUT_MS),
      })

      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        synced++
        const emails   = (data as Record<string, unknown>).total ?? 0
        const newEvents = (data as { newEvents?: unknown[] }).newEvents?.length ?? 0
        console.log(
          `gmail-sync-cron: user=${integration.user_id} ok` +
          ` emails=${emails} new_events=${newEvents}`,
        )
      } else if (res.status === 401) {
        const body = await res.json().catch(() => ({}))
        if ((body as Record<string, unknown>).needsReconnect) {
          reconnectRequired++
          console.log(`gmail-sync-cron: user=${integration.user_id} needs_reconnect`)
        } else {
          errors++
          console.error(`gmail-sync-cron: user=${integration.user_id} 401 unexpected`)
        }
      } else {
        errors++
        const text = await res.text().catch(() => String(res.status))
        console.error(
          `gmail-sync-cron: user=${integration.user_id} failed` +
          ` status=${res.status} body=${text.slice(0, 200)}`,
        )
      }
    } catch (err) {
      errors++
      const msg = (err as Error).name === "TimeoutError"
        ? `timed out after ${PER_USER_TIMEOUT_MS / 1000}s`
        : (err as Error).message
      console.error(`gmail-sync-cron: user=${integration.user_id} exception: ${msg}`)
    }
  }

  const summary = {
    runAt,
    total,
    eligible: eligible.length,
    skipped_throttle: skippedThrottle,
    synced,
    errors,
    reconnect_required: reconnectRequired,
  }

  console.log("gmail-sync-cron summary:", JSON.stringify(summary))

  return new Response(JSON.stringify(summary), {
    headers: { "Content-Type": "application/json" },
  })
})
