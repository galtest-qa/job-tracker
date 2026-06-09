// Job Maker MCP Server — Phase 1 (read-only)
// Transport: MCP Streamable HTTP (2025-03-26)
// Auth: SHA-256 hashed API key in X-MCP-Api-Key or Authorization: Bearer header
// Deploy with: supabase functions deploy mcp --no-verify-jwt
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SERVER_INFO = { name: "job-maker", version: "1.0.0" }
const PROTOCOL_VERSION = "2025-03-26"

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "get_jobs",
    description: "List the user's jobs. Optionally filter by status or search term.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by column name e.g. 'Interview', 'Applied / Waiting'" },
        search: { type: "string", description: "Search company or role name" },
        limit: { type: "number", description: "Max results (default 50, max 100)" },
      },
    },
  },
  {
    name: "get_job",
    description: "Get full details for a single job including description, match score, tailored resume, and notes.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Job UUID" },
      },
      required: ["id"],
    },
  },
  {
    name: "get_hiring_events",
    description: "List hiring events (email-detected interview invites, rejections, offers, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Filter by job UUID" },
        event_type: { type: "string", description: "Filter by type e.g. 'interview_invite', 'rejection', 'offer'" },
        status: { type: "string", description: "Filter by status: pending | reviewed | dismissed" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  {
    name: "get_reminders",
    description: "List active reminders. Returns upcoming and overdue reminders by default.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Filter reminders for a specific job" },
        include_completed: { type: "boolean", description: "Include completed reminders (default false)" },
      },
    },
  },
  {
    name: "get_sync_status",
    description: "Get Gmail sync health: last sync time, sync status, and whether reconnection is needed.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_recommendations",
    description: "Get active proactive recommendations (follow-up suggestions, stage move hints, etc.).",
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Filter recommendations for a specific job" },
      },
    },
  },
]

// ── Main handler ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type, x-mcp-api-key",
      },
    })
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  // ── Auth: validate API key ─────────────────────────────────────────────────
  const rawKey =
    req.headers.get("x-mcp-api-key") ||
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")

  if (!rawKey) {
    return mcpError(null, -32001, "Missing API key")
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const userId = await resolveUserFromKey(supabase, rawKey)
  if (!userId) {
    return mcpError(null, -32001, "Invalid API key")
  }

  // ── Parse JSON-RPC request ─────────────────────────────────────────────────
  let rpc: Record<string, unknown>
  try {
    rpc = await req.json()
  } catch {
    return mcpError(null, -32700, "Parse error")
  }

  const id = rpc.id ?? null
  const method = rpc.method as string
  const params = (rpc.params ?? {}) as Record<string, unknown>

  // ── Dispatch ───────────────────────────────────────────────────────────────
  try {
    switch (method) {
      case "initialize":
        return mcpResult(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        })

      case "notifications/initialized":
        // Client sends this after initialize — no response needed
        return new Response(null, { status: 204 })

      case "tools/list":
        return mcpResult(id, { tools: TOOLS })

      case "tools/call": {
        const toolName = params.name as string
        const args = (params.arguments ?? {}) as Record<string, unknown>
        const content = await callTool(supabase, userId, toolName, args)
        return mcpResult(id, { content: [{ type: "text", text: content }], isError: false })
      }

      default:
        return mcpError(id, -32601, `Method not found: ${method}`)
    }
  } catch (err) {
    console.error("MCP tool error:", (err as Error).message)
    return mcpError(id, -32603, "Internal error")
  }
})

// ── Auth helpers ────────────────────────────────────────────────────────────

async function resolveUserFromKey(
  supabase: ReturnType<typeof createClient>,
  rawKey: string,
): Promise<string | null> {
  const hashHex = await sha256Hex(rawKey)
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("mcp_api_key_hash", hashHex)
    .maybeSingle()
  return data?.id ?? null
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

// ── Tool handlers ────────────────────────────────────────────────────────────

async function callTool(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "get_jobs":      return toolGetJobs(supabase, userId, args)
    case "get_job":       return toolGetJob(supabase, userId, args)
    case "get_hiring_events": return toolGetHiringEvents(supabase, userId, args)
    case "get_reminders": return toolGetReminders(supabase, userId, args)
    case "get_sync_status": return toolGetSyncStatus(supabase, userId)
    case "get_recommendations": return toolGetRecommendations(supabase, userId, args)
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

async function toolGetJobs(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const limit = Math.min(Number(args.limit ?? 50), 100)
  let query = supabase
    .from("jobs")
    .select("id, company, role, status, match_score, location, created_at, updated_at, has_unread_event")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit)

  if (args.status) query = query.eq("status", args.status)
  if (args.search) {
    query = query.or(`company.ilike.%${args.search}%,role.ilike.%${args.search}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return JSON.stringify({ jobs: data ?? [], count: data?.length ?? 0 }, null, 2)
}

async function toolGetJob(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", args.id)
    .eq("user_id", userId)
    .single()
  if (error) throw new Error(`Job not found: ${args.id}`)
  return JSON.stringify(data, null, 2)
}

async function toolGetHiringEvents(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const limit = Math.min(Number(args.limit ?? 20), 50)
  let query = supabase
    .from("hiring_events")
    .select("id, event_type, title, description, priority_score, status, matched_job_id, extracted_company, extracted_role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (args.job_id)    query = query.eq("matched_job_id", args.job_id)
  if (args.event_type) query = query.eq("event_type", args.event_type)
  if (args.status)    query = query.eq("status", args.status)

  const { data, error } = await query
  if (error) throw error
  return JSON.stringify({ events: data ?? [], count: data?.length ?? 0 }, null, 2)
}

async function toolGetReminders(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  args: Record<string, unknown>,
): Promise<string> {
  let query = supabase
    .from("reminders")
    .select("id, title, due_at, note, completed, cancelled_at, job_id, jobs(company, role)")
    .eq("user_id", userId)
    .is("cancelled_at", null)
    .order("due_at")

  if (!args.include_completed) query = query.eq("completed", false)
  if (args.job_id) query = query.eq("job_id", args.job_id)

  const { data, error } = await query
  if (error) throw error
  return JSON.stringify({ reminders: data ?? [], count: data?.length ?? 0 }, null, 2)
}

async function toolGetSyncStatus(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("user_integrations")
    .select("email, last_sync_at, last_successful_sync_at, last_sync_status, last_sync_error, needs_reconnect")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .maybeSingle()

  if (error) throw error
  if (!data) return JSON.stringify({ connected: false })

  return JSON.stringify({
    connected: true,
    email: data.email,
    last_sync_at: data.last_sync_at,
    last_successful_sync_at: data.last_successful_sync_at,
    last_sync_status: data.last_sync_status,
    last_sync_error: data.last_sync_error,
    needs_reconnect: data.needs_reconnect,
  }, null, 2)
}

async function toolGetRecommendations(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  args: Record<string, unknown>,
): Promise<string> {
  let query = supabase
    .from("recommendations")
    .select("id, type, title, reason, priority, status, context, job_id, created_at, expires_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("priority", { ascending: false })
    .limit(20)

  if (args.job_id) query = query.eq("job_id", args.job_id)

  const { data, error } = await query
  if (error) throw error
  return JSON.stringify({ recommendations: data ?? [], count: data?.length ?? 0 }, null, 2)
}

// ── JSON-RPC helpers ────────────────────────────────────────────────────────

function mcpResult(id: unknown, result: unknown): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, result }),
    { headers: { "Content-Type": "application/json" } },
  )
}

function mcpError(id: unknown, code: number, message: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
}
