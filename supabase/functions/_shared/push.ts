// Web Push sender for Edge Functions.
// Requires secrets: VAPID_KEYS_JWK (exportVapidKeys JSON), VAPID_CONTACT (mailto:).
import * as webpush from "jsr:@negrel/webpush@0.5.0"

export interface PushPayload {
  title: string
  body?: string
  url?: string   // deep link opened on tap, e.g. /?job=<id>&tab=updates
  tag?: string   // collapses duplicate notifications
}

// deno-lint-ignore no-explicit-any
type SupabaseClient = any

let appServerPromise: Promise<webpush.ApplicationServer> | null = null

function getAppServer(): Promise<webpush.ApplicationServer> {
  if (!appServerPromise) {
    appServerPromise = (async () => {
      const jwk = JSON.parse(Deno.env.get("VAPID_KEYS_JWK") ?? "null")
      if (!jwk) throw new Error("VAPID_KEYS_JWK secret is not set")
      const vapidKeys = await webpush.importVapidKeys(jwk, { extractable: false })
      return webpush.ApplicationServer.new({
        contactInformation: Deno.env.get("VAPID_CONTACT") ?? "mailto:gal2618@gmail.com",
        vapidKeys,
      })
    })()
  }
  return appServerPromise
}

// Sends a push to every device the user subscribed. Dead subscriptions
// (uninstalled PWA, revoked permission) are deleted as we discover them.
// Never throws — push is a best-effort side channel.
export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0
  try {
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId)

    if (!subs?.length) return { sent, failed }

    const appServer = await getAppServer()
    const message = JSON.stringify(payload)

    for (const s of subs) {
      try {
        const subscriber = appServer.subscribe({
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        })
        await subscriber.pushTextMessage(message, {})
        sent++
      } catch (err) {
        failed++
        if (err instanceof webpush.PushMessageError && err.isGone()) {
          await supabase.from("push_subscriptions").delete().eq("id", s.id)
          console.log(`push: removed gone subscription ${s.id}`)
        } else {
          console.warn(`push: send failed for sub ${s.id}:`, err instanceof Error ? err.message : String(err))
        }
      }
    }
  } catch (err) {
    console.warn("push: sendPushToUser failed:", err instanceof Error ? err.message : String(err))
  }
  return { sent, failed }
}
