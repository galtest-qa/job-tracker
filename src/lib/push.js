// Web Push client — subscribe this device to phone/desktop notifications.
// Subscriptions are stored in push_subscriptions and sent to by Edge
// Functions (reminder cron, gmail-sync high-priority events).
import { supabase } from './supabase.js'

// VAPID public key — pairs with VAPID_KEYS_JWK secret on Supabase.
const VAPID_PUBLIC_KEY = 'BK8R1zALFAZUU3uII6rfDJt2MnhW421uBFiRSTgslV0pyi-Lh3pxOOCIV6xobauyqLj-eJ_xQR967SKFTmYtY8I'

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

// iOS Safari exposes Push only to home-screen apps — tell the user to install first.
export function pushNeedsInstall() {
  return !pushSupported() && isIOS() && !isStandalone()
}

// 'unsupported' | 'needs-install' | 'denied' | 'subscribed' | 'off'
export async function getPushStatus() {
  if (pushNeedsInstall()) return 'needs-install'
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    return sub ? 'subscribed' : 'off'
  } catch {
    return 'off'
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

// Must be called from a user gesture (tap) so the permission prompt shows.
export async function subscribeToPush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'permission-denied' : 'permission-dismissed')

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })

  const json = sub.toJSON()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('not-authenticated')

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: navigator.userAgent.slice(0, 255),
  }, { onConflict: 'endpoint' })
  if (error) throw error

  return sub
}

export async function unsubscribeFromPush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

// Ask the server to send a real test notification to this user's devices.
export async function sendTestPush() {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/push-test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Test failed')
  return data
}
