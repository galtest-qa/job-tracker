// Gmail API helpers — metadata + optional full body fetching

/**
 * Thrown when Gmail returns 401 or 403 — token revoked, expired without refresh,
 * or scope mismatch. Callers must treat this as a reconnect signal, not a generic
 * retry-able failure.
 */
export class GmailAuthError extends Error {
  readonly status: number
  constructor(status: number, message?: string) {
    super(message ?? `Gmail authorization failed (${status}) — token revoked or expired`)
    this.name = "GmailAuthError"
    this.status = status
  }
}

export type EmailDirection = "inbound" | "outbound"

export interface GmailEmail {
  id: string
  threadId: string
  from: string
  subject: string
  snippet: string
  receivedAt: string
  hasAttachments: boolean
  direction: EmailDirection
  gmailLabels: string[]
  body?: string  // plain text body, capped at 1500 chars
}

// ── Body extraction helpers ────────────────────────────────────────────────

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

/**
 * Fetch the plain-text body of a single Gmail message.
 * Returns "" on any error — never throws.
 * Body is capped at maxChars characters.
 */
export async function fetchEmailBody(
  accessToken: string,
  emailId: string,
  maxChars = 1500,
): Promise<string> {
  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    if (!res.ok) {
      console.warn(`fetchEmailBody: Gmail API ${res.status} for emailId=${emailId}`)
      return ""
    }
    const msg = await res.json()
    const { plain, html } = extractBody(msg.payload ?? {})
    let body: string
    if (plain) {
      body = plain
    } else if (html) {
      body = stripHtml(html)
    } else {
      console.warn(`fetchEmailBody: no readable content for emailId=${emailId}`)
      return ""
    }
    return body.slice(0, maxChars)
  } catch (err) {
    console.warn(`fetchEmailBody: unexpected error for emailId=${emailId}:`, err instanceof Error ? err.message : String(err))
    return ""
  }
}

export interface RefreshedToken {
  accessToken: string
  expiresAt: Date
}

/**
 * Exchange a refresh token for a new access token.
 * Throws if the refresh token is invalid or revoked.
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<RefreshedToken> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      `Token refresh failed: ${err.error_description || err.error || res.status}`,
    )
  }

  const data = await res.json()
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  }
}

/**
 * Fetch the last N emails from Primary inbox + Sent, merged and deduped.
 * Two separate queries are used instead of a combined OR query for reliability:
 *   inbox: Primary inbox only, excluding Promotions/Social/Spam/Trash
 *   sent:  Sent folder only, excluding Spam/Trash
 * Results are merged by message ID, sorted newest-first, capped at maxResults.
 * connectedEmail is used as fallback for direction classification when labelIds are ambiguous.
 */
export async function fetchRecentEmails(
  accessToken: string,
  maxResults = 10,
  connectedEmail?: string,
): Promise<GmailEmail[]> {
  const inboxQuery = encodeURIComponent(
    "in:inbox -category:promotions -category:social -in:spam -in:trash",
  )
  const sentQuery = encodeURIComponent("in:sent -in:spam -in:trash")
  const authHeader = { Authorization: `Bearer ${accessToken}` }

  // Fetch inbox and sent in parallel
  const [inboxRes, sentRes] = await Promise.all([
    fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${inboxQuery}`,
      { headers: authHeader },
    ),
    fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${sentQuery}`,
      { headers: authHeader },
    ),
  ])

  if (!inboxRes.ok) {
    // 401/403 means the token is revoked or the app lost scope — must reconnect
    if (inboxRes.status === 401 || inboxRes.status === 403) {
      throw new GmailAuthError(inboxRes.status)
    }
    const err = await inboxRes.json().catch(() => ({}))
    throw new Error(
      `Gmail messages.list (inbox) failed: ${err.error?.message || inboxRes.status}`,
    )
  }

  // Sent failures are non-fatal — log and proceed with inbox only
  let sentMessages: Array<{ id: string; threadId: string }> = []
  if (sentRes.ok) {
    const sentData = await sentRes.json()
    sentMessages = sentData.messages || []
  } else {
    console.warn("Gmail messages.list (sent) failed:", sentRes.status)
  }

  const inboxData = await inboxRes.json()
  const inboxMessages: Array<{ id: string; threadId: string }> = inboxData.messages || []

  // Merge and deduplicate by message ID
  const seen = new Set<string>()
  const merged: Array<{ id: string; threadId: string }> = []
  for (const msg of [...inboxMessages, ...sentMessages]) {
    if (!seen.has(msg.id)) {
      seen.add(msg.id)
      merged.push(msg)
    }
  }

  if (merged.length === 0) return []

  // Fetch metadata for all unique messages
  const results = await Promise.allSettled(
    merged.map(({ id, threadId }) =>
      fetchMessageMetadata(accessToken, id, threadId, connectedEmail)
    ),
  )

  const emails = results
    .filter((r): r is PromiseFulfilledResult<GmailEmail> => r.status === "fulfilled")
    .map((r) => r.value)

  // Sort newest-first, cap at maxResults
  emails.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
  return emails.slice(0, maxResults)
}

/**
 * Classify direction using labelIds (primary) then From header (fallback).
 *
 * Priority:
 *   1. labelIds includes "SENT"  → outbound
 *   2. labelIds includes "INBOX" → inbound
 *   3. From address matches connectedEmail → outbound
 *   4. Default → inbound
 */
function classifyDirection(
  labelIds: string[],
  fromHeader: string,
  connectedEmail?: string,
): EmailDirection {
  if (labelIds.includes("SENT")) return "outbound"
  if (labelIds.includes("INBOX")) return "inbound"
  // Fallback: extract bare address from "Name <addr>" and compare
  if (connectedEmail) {
    const match = fromHeader.match(/<([^>]+)>/)
    const fromAddress = (match ? match[1] : fromHeader).trim().toLowerCase()
    if (fromAddress === connectedEmail.trim().toLowerCase()) return "outbound"
  }
  return "inbound"
}

async function fetchMessageMetadata(
  accessToken: string,
  id: string,
  threadId: string,
  connectedEmail?: string,
): Promise<GmailEmail> {
  const params = new URLSearchParams({ format: "metadata" })
  ;["From", "Subject", "Date"].forEach((h) => params.append("metadataHeaders", h))

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!res.ok) {
    throw new Error(`messages.get failed for ${id}: ${res.status}`)
  }

  const msg = await res.json()
  const headers: Array<{ name: string; value: string }> = msg.payload?.headers || []
  const labelIds: string[] = msg.labelIds || []

  const getHeader = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ""

  // Best-effort attachment detection from parts (metadata format)
  const parts: Array<{ filename?: string; body?: { attachmentId?: string } }> =
    msg.payload?.parts || []
  const hasAttachments = parts.some(
    (p) => p.filename && p.filename.length > 0 && !!p.body?.attachmentId,
  )

  // Timestamp: prefer internalDate (ms epoch), fall back to Date header
  const dateHeader = getHeader("Date")
  let receivedAt: string
  if (msg.internalDate) {
    receivedAt = new Date(Number(msg.internalDate)).toISOString()
  } else if (dateHeader) {
    receivedAt = new Date(dateHeader).toISOString()
  } else {
    receivedAt = new Date().toISOString()
  }

  const fromHeader = getHeader("From")

  return {
    id: msg.id,
    threadId: msg.threadId ?? threadId,
    from: fromHeader,
    subject: getHeader("Subject"),
    snippet: msg.snippet ?? "",
    receivedAt,
    hasAttachments,
    direction: classifyDirection(labelIds, fromHeader, connectedEmail),
    gmailLabels: labelIds,
  }
}
