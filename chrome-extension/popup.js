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
  $('view-connected').classList.remove('hidden')
  $('view-disconnected').classList.add('hidden')
  $('user-email').textContent = `(${email})`
}

function showDisconnected() {
  $('view-connected').classList.add('hidden')
  $('view-disconnected').classList.remove('hidden')
}

async function connect() {
  const raw = $('code-input').value.trim()
  $('error').classList.add('hidden')

  if (!raw) {
    $('error').textContent = 'Paste the connection code from Settings'
    $('error').classList.remove('hidden')
    return
  }

  try {
    // Decode the connection code (base64 JSON)
    const decoded = JSON.parse(atob(raw))

    if (!decoded.supabaseUrl || !decoded.accessToken || !decoded.userId) {
      throw new Error('Invalid code')
    }

    // Verify the token works
    const res = await fetch(`${decoded.supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${decoded.accessToken}`,
        'apikey': decoded.supabaseAnonKey,
      },
    })

    if (!res.ok) throw new Error('Token expired. Generate a new code from Settings.')

    await saveConfig({
      supabaseUrl: decoded.supabaseUrl,
      supabaseAnonKey: decoded.supabaseAnonKey,
      accessToken: decoded.accessToken,
      refreshToken: decoded.refreshToken,
      userEmail: decoded.email,
      userId: decoded.userId,
    })

    showConnected(decoded.email)
  } catch (err) {
    $('error').textContent = err.message === 'Invalid code'
      ? 'Invalid connection code. Make sure you copied the full code from Settings.'
      : err.message
    $('error').classList.remove('hidden')
  }
}

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
      await saveConfig({ ...config, accessToken: data.access_token, refreshToken: data.refresh_token })
      config.accessToken = data.access_token
      return true
    }
  } catch {}
  return false
}

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

  $('connect-btn').addEventListener('click', connect)
  $('disconnect-btn').addEventListener('click', async () => {
    await clearConfig()
    showDisconnected()
  })
})
