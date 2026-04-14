// ── Config from chrome.storage ──

let config = {}

function loadConfig() {
  return new Promise(resolve => {
    chrome.storage.local.get(['supabaseUrl', 'supabaseAnonKey', 'accessToken', 'refreshToken', 'userId'], (data) => {
      config = data || {}
      resolve(config)
    })
  })
}

function isConnected() {
  return !!(config.supabaseUrl && config.supabaseAnonKey && config.accessToken && config.userId)
}

// ── Extract job data — class-name-independent, structure-based ──

function extractJobData() {
  return {
    role: extractRole(),
    company: extractCompany(),
    description: extractDescription(),
    link: window.location.href.split('?')[0],
    source: 'LinkedIn',
    status: 'Backlog',
  }
}

const JUNK_PATTERNS = /^\d+\s*(notifications?|messages?|results?|jobs?)$|^skip to|^main content|^search|^home|^my network/i

function extractRole() {
  const titleRole = parseTitlePart(0)
  if (titleRole) return titleRole

  for (const tag of ['h1', 'h2']) {
    const els = document.querySelectorAll(tag)
    for (const el of els) {
      const text = el.innerText?.trim()
      if (text && text.length > 4 && text.length < 150 && !text.includes('\n') && !JUNK_PATTERNS.test(text)) {
        return text
      }
    }
  }
  return ''
}

function extractCompany() {
  const companyLinks = document.querySelectorAll('a[href*="/company/"]')
  for (const link of companyLinks) {
    const text = link.innerText?.trim()
    if (
      text &&
      text.length > 1 &&
      text.length < 80 &&
      !text.includes('\n') &&
      !text.includes('.') &&
      !/show|more|jobs|see|follow|view/i.test(text)
    ) {
      return text
    }
  }

  const h1 = document.querySelector('h1')
  if (h1) {
    const parent = h1.parentElement
    if (parent) {
      const siblings = parent.parentElement?.children || []
      for (const sib of siblings) {
        if (sib === parent) continue
        const links = sib.querySelectorAll('a')
        for (const a of links) {
          const text = a.innerText?.trim()
          if (text && text.length > 1 && text.length < 80 && !text.includes('\n')) {
            return text
          }
        }
      }
    }
  }
  return parseTitlePart(1)
}

function clickShowMore() {
  // Only look inside #job-details to avoid accidentally clicking things elsewhere on the page
  const container = document.querySelector('#job-details')
  if (!container) return false

  const candidates = container.querySelectorAll('button, [role="button"]')
  for (const el of candidates) {
    const text = (el.innerText || el.textContent || '').trim().toLowerCase()
    if (/^\.{0,3}more$/.test(text) || text.includes('show more') || text.includes('see more')) {
      el.click()
      return true
    }
  }
  return false
}

function cleanDescription(text) {
  return text
    .replace(/^about the job\s*/i, '')   // strip LinkedIn "About the job" header
    .replace(/\.{2,3}\s*more\s*$/gi, '') // strip trailing "...more"
    .replace(/\u2026\s*more\s*$/gi, '')  // strip trailing "…more" (unicode ellipsis)
    .replace(/\.{2,3}\s*more/gi, '')     // strip inline "...more"
    .replace(/\u2026\s*more/gi, '')      // strip inline "…more"
    .trim()
}

function extractDescription() {
  // Try to expand first
  clickShowMore()

  const jobDetails = document.querySelector('#job-details')
  if (jobDetails?.innerText?.trim()) return cleanDescription(jobDetails.innerText.trim())

  const allElements = document.querySelectorAll('div, section, article')
  let best = null
  let bestScore = 0

  for (const el of allElements) {
    const text = el.innerText?.trim()
    if (!text || text.length < 200) continue
    const childCount = el.querySelectorAll('div, section, article').length
    if (childCount > 30) continue
    const hasKeywords = /responsibilities|requirements|qualifications|experience|about the role|what you|we are|you will/i.test(text)
    const lineCount = text.split('\n').filter(l => l.trim()).length
    const score = text.length * (hasKeywords ? 3 : 1) * (lineCount > 5 ? 2 : 1) / (childCount + 1)
    if (score > bestScore) { best = text; bestScore = score }
  }
  return best ? cleanDescription(best) : ''
}

function parseTitlePart(index) {
  const parts = document.title.split('|').map(s => s.trim())
  if (parts.length >= 2 && parts[index]) {
    let val = parts[index]
    val = val.replace(/\(\d+\)/, '').replace('hiring', '').replace('LinkedIn', '').trim()
    return val
  }
  return ''
}

// ── Toast notification ──

function showToast(message, duration = 3000) {
  const existing = document.getElementById('jt-toast')
  if (existing) existing.remove()
  const toast = document.createElement('div')
  toast.id = 'jt-toast'
  toast.textContent = message
  document.body.appendChild(toast)
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300) }, duration)
}

// ── Save job ──

async function saveJob() {
  const btn = document.getElementById('jt-save-btn')
  if (!btn) return

  await loadConfig()

  if (!isConnected()) {
    showToast('Not connected. Click the Job Tracker extension icon to set up.')
    return
  }

  // Expand description before extracting
  clickShowMore()
  await new Promise(r => setTimeout(r, 300))

  const data = extractJobData()

  if (!data.role && !data.company) {
    data.role = parseTitlePart(0)
    data.company = parseTitlePart(1)
  }

  if (!data.role && !data.company) {
    showToast('Could not extract job details from this page.')
    return
  }

  btn.textContent = 'Saving...'
  btn.disabled = true

  try {
    const res = await fetch(`${config.supabaseUrl}/rest/v1/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.supabaseAnonKey,
        'Authorization': `Bearer ${config.accessToken}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        ...data,
        user_id: config.userId,
        tags: [],
      }),
    })

    if (res.status === 401) {
      // Try to refresh token
      const refreshed = await tryRefreshToken()
      if (refreshed) {
        // Retry once
        const retry = await fetch(`${config.supabaseUrl}/rest/v1/jobs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': config.supabaseAnonKey,
            'Authorization': `Bearer ${config.accessToken}`,
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ ...data, user_id: config.userId, tags: [] }),
        })
        if (retry.ok) {
          btn.textContent = 'Saved!'
          btn.classList.add('jt-saved')
          showToast(`Saved: ${data.role} at ${data.company}`)
        } else {
          throw new Error('Session expired. Click extension icon to reconnect.')
        }
      } else {
        throw new Error('Session expired. Click extension icon to reconnect.')
      }
    } else if (res.ok) {
      btn.textContent = 'Saved!'
      btn.classList.add('jt-saved')
      showToast(`Saved: ${data.role} at ${data.company}`)
    } else {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || `Error ${res.status}`)
    }

    setTimeout(() => {
      btn.classList.remove('jt-saved')
      btn.textContent = '+ Save to Tracker'
      btn.disabled = false
    }, 3000)

  } catch (err) {
    btn.classList.add('jt-error')
    btn.textContent = 'Failed'
    showToast(err.message || 'Could not save job.')
    setTimeout(() => {
      btn.classList.remove('jt-error')
      btn.textContent = '+ Save to Tracker'
      btn.disabled = false
    }, 3000)
  }
}

async function tryRefreshToken() {
  if (!config.refreshToken) return false
  try {
    const res = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': config.supabaseAnonKey },
      body: JSON.stringify({ refresh_token: config.refreshToken }),
    })
    if (res.ok) {
      const data = await res.json()
      config.accessToken = data.access_token
      config.refreshToken = data.refresh_token
      chrome.storage.local.set({ accessToken: data.access_token, refreshToken: data.refresh_token })
      return true
    }
  } catch {}
  return false
}

// ── Floating button ──

function injectFloatingButton() {
  if (document.getElementById('jt-save-btn')) return
  const btn = document.createElement('button')
  btn.id = 'jt-save-btn'
  btn.textContent = '+ Save to Tracker'
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); saveJob() })
  document.body.appendChild(btn)
}

function isJobPage() {
  return /linkedin\.com\/jobs/.test(location.href)
}

function updateVisibility() {
  const btn = document.getElementById('jt-save-btn')
  if (!btn) return
  btn.style.display = isJobPage() ? 'flex' : 'none'
}

// ── Init ──

loadConfig().then(() => {
  injectFloatingButton()
  updateVisibility()
})

let lastUrl = location.href
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href
    updateVisibility()
    const btn = document.getElementById('jt-save-btn')
    if (btn) {
      btn.classList.remove('jt-saved', 'jt-error')
      btn.textContent = '+ Save to Tracker'
      btn.disabled = false
    }
  }
}, 500)

setInterval(() => {
  if (isJobPage() && !document.getElementById('jt-save-btn')) {
    injectFloatingButton()
  }
}, 2000)
