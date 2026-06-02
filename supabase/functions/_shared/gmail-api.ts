// Gmail API helpers — metadata-only, no full body fetching

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
 * Fetch the last N emails as metadata (From, Subject, Date headers + snippet).
 * Does NOT fetch full body.
 * connectedEmail is used as fallback for direction classification when labelIds are ambiguous.
 */
export async function fetchRecentEmails(
  accessToken: string,
  maxResults = 10,
  connectedEmail?: string,
): Promise<GmailEmail[]> {
  // Step 1: list message IDs (default view includes all mail — inbox + sent)
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )

  if (!listRes.ok) {
    const err = await listRes.json().catch(() => ({}))
    throw new Error(
      `Gmail messages.list failed: ${err.error?.message || listRes.status}`,
    )
  }

  const listData = await listRes.json()
  const messages: Array<{ id: string; threadId: string }> = listData.messages || []
  if (messages.length === 0) return []

  // Step 2: fetch each message with format=metadata
  const results = await Promise.allSettled(
    messages.map(({ id, threadId }) =>
      fetchMessageMetadata(accessToken, id, threadId, connectedEmail)
    ),
  )

  return results
    .filter((r): r is PromiseFulfilledResult<GmailEmail> => r.status === "fulfilled")
    .map((r) => r.value)
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
