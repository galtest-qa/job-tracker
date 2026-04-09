const $ = (id) => document.getElementById(id)

function loadConfig() {
  return new Promise(resolve => {
    chrome.storage.local.get(['supabaseUrl', 'supabaseAnonKey', 'accessToken', 'refreshToken', 'userEmail', 'userId'], resolve)
  })
}

function saveConfig(config) {
  return new Promise(resolve => chrome.storage.local.set(config, resolve))
}

function clearConfig() {
  return new Promise(resolve => {
    chrome.storage.local.remove(['supabaseUrl', 'supabaseAnonKey', 'accessToken', 'refreshToken', 'userEmail', 'userId'], resolve)
  })
}

function showConnected(email) {
  $('status-connected').classList.remove('hidden')
  $('status-disconnected').classList.add('hidden')
  $('login-form').classList.add('hidden')
  $('connected-view').classList.remove('hidden')
  $('user-email').textContent = `(${email})`
}

function showDisconnected() {
  $('status-connected').classList.add('hidden')
  $('status-disconnected').classList.remove('hidden')
  $('login-form').classList.remove('hidden')
  $('connected-view').classList.add('hidden')
}

function showError(msg) {
  $('error').textContent = msg
  $('error').classList.remove('hidden')
}

async function connect() {
  const appUrl = $('app-url').value.trim().replace(/\/$/, '')
  const email = $('email').value.trim()
  const password = $('password').value

  if (!appUrl || !email) {
    showError('App URL and email are required')
    return
  }

  $('login-btn').disabled = true
  $('login-btn').textContent = 'Connecting...'
  $('error').classList.add('hidden')

  try {
    // Detect Supabase config from the app's built JS
    const res = await fetch(appUrl)
    const html = await res.text()
    const jsMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/)

    let supabaseUrl, supabaseAnonKey
    if (jsMatch) {
      const jsRes = await fetch(new URL(jsMatch[1], appUrl).href)
      const js = await jsRes.text()
      supabaseUrl = js.match(/(https:\/\/[a-z]+\.supabase\.co)/)?.[1]
      supabaseAnonKey = js.match(/(eyJ[A-Za-z0-9._-]{100,})/)?.[1]
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Could not detect app configuration. Check the URL.')
    }

    // Sign in with magic link (OTP)
    const authRes = await fetch(`${supabaseUrl}/auth/v1/otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': supabaseAnonKey },
      body: JSON.stringify({ email }),
    })

    if (!authRes.ok) {
      const err = await authRes.json().catch(() => ({}))
      throw new Error(err.msg || err.error_description || 'Could not send magic link')
    }

    // Save config for later
    await saveConfig({ supabaseUrl, supabaseAnonKey })

    $('login-btn').textContent = 'Email sent!'
    document.querySelector('.hint').innerHTML = `
      <strong>Check your email!</strong> Click the magic link to log in on the app.<br><br>
      After logging in, open the app and click your profile → <strong>"Connect Extension"</strong> to finish setup.
    `

  } catch (err) {
    showError(err.message)
    $('login-btn').disabled = false
    $('login-btn').textContent = 'Connect'
  }
}

// Listen for token from the app page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'job-tracker-connect') {
    saveConfig({
      supabaseUrl: message.supabaseUrl,
      supabaseAnonKey: message.supabaseAnonKey,
      accessToken: message.accessToken,
      refreshToken: message.refreshToken,
      userEmail: message.email,
      userId: message.userId,
    }).then(() => {
      sendResponse({ ok: true })
    })
    return true
  }
})

async function refreshToken(config) {
  if (!config.refreshToken) return false
  try {
    const res = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': config.supabaseAnonKey },
      body: JSON.stringify({ refresh_token: config.refreshToken }),
    })
    if (res.ok) {
      const data = await res.json()
      await saveConfig({
        ...config,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      })
      return true
    }
  } catch {}
  return false
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
  const config = await loadConfig()

  if (config.accessToken && config.userEmail) {
    try {
      const res = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
        headers: { 'Authorization': `Bearer ${config.accessToken}`, 'apikey': config.supabaseAnonKey },
      })
      if (res.ok) {
        showConnected(config.userEmail)
      } else if (await refreshToken(config)) {
        showConnected(config.userEmail)
      } else {
        showDisconnected()
      }
    } catch {
      showDisconnected()
    }
  } else {
    showDisconnected()
  }

  $('login-btn').addEventListener('click', connect)
  $('disconnect-btn').addEventListener('click', async () => {
    await clearConfig()
    showDisconnected()
  })
})
