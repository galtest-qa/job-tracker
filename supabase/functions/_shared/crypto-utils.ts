// AES-GCM encryption/decryption + HMAC-SHA256 state signing
// All crypto via Web Crypto API (available in Deno)

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

/**
 * Encrypt plaintext with AES-GCM.
 * Stores { iv, ct } as a JSON string — iv and ct are base64.
 * The auth tag is included in the ciphertext by the AES-GCM implementation.
 */
export async function encrypt(plaintext: string, keyHex: string): Promise<string> {
  const keyBytes = hexToBytes(keyHex)
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return JSON.stringify({
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ciphertext)),
  })
}

/**
 * Decrypt an AES-GCM ciphertext produced by encrypt().
 */
export async function decrypt(stored: string, keyHex: string): Promise<string> {
  const { iv: ivB64, ct: ctB64 } = JSON.parse(stored)
  const iv = base64ToBytes(ivB64)
  const ct = base64ToBytes(ctB64)
  const keyBytes = hexToBytes(keyHex)
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  )
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct)
  return new TextDecoder().decode(plain)
}

/**
 * Sign OAuth state with HMAC-SHA256.
 * Returns: base64(payload) + "." + base64(signature)
 */
export async function signState(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const body = btoa(JSON.stringify(payload))
  const keyBytes = new TextEncoder().encode(secret)
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  )
  return `${body}.${bytesToBase64(new Uint8Array(sig))}`
}

/**
 * Verify OAuth state. Returns the payload if valid, null if invalid or expired.
 * Expiry window: 10 minutes.
 */
export async function verifyState(
  state: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  const dotIdx = state.lastIndexOf(".")
  if (dotIdx === -1) return null
  const body = state.slice(0, dotIdx)
  const sigB64 = state.slice(dotIdx + 1)

  const keyBytes = new TextEncoder().encode(secret)
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  )
  const sig = base64ToBytes(sigB64)
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    new TextEncoder().encode(body),
  )
  if (!valid) return null

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(atob(body))
  } catch {
    return null
  }

  // Reject if older than 10 minutes
  if (typeof payload.ts !== "number" || Date.now() - payload.ts > 10 * 60 * 1000) {
    return null
  }

  return payload
}
