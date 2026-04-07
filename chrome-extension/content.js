const API_URL = 'http://localhost:3001/api'

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
  // Strategy 1: page title is the most reliable — always "Role | Company | LinkedIn"
  const titleRole = parseTitlePart(0)
  if (titleRole) return titleRole

  // Strategy 2: find element whose text matches the page title role
  // (in case page title is unavailable)

  // Strategy 3: h1/h2 that isn't LinkedIn UI chrome
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
  // Strategy 1: link to a /company/ page — this is the most reliable signal
  const companyLinks = document.querySelectorAll('a[href*="/company/"]')
  for (const link of companyLinks) {
    const text = link.innerText?.trim()
    // Company names: short, single line, not a full sentence
    if (text && text.length > 1 && text.length < 80 && !text.includes('\n') && !text.includes('.')) {
      return text
    }
  }

  // Strategy 2: find text near the h1 (job title) — company is usually right below
  const h1 = document.querySelector('h1')
  if (h1) {
    // Walk siblings and parent's next siblings
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

  // Strategy 3: page title
  return parseTitlePart(1)
}

function extractDescription() {
  // Strategy 1: element with id "job-details"
  const jobDetails = document.querySelector('#job-details')
  if (jobDetails?.innerText?.trim()) return jobDetails.innerText.trim()

  // Strategy 2: find the largest text block that looks like a job description
  // Job descriptions are typically 300+ chars with multiple lines
  const allElements = document.querySelectorAll('div, section, article')
  let best = null
  let bestScore = 0

  for (const el of allElements) {
    const text = el.innerText?.trim()
    if (!text || text.length < 200) continue

    // Score based on description-like signals
    const childCount = el.querySelectorAll('div, section, article').length
    if (childCount > 30) continue // too broad, probably a page wrapper

    const hasKeywords = /responsibilities|requirements|qualifications|experience|about the role|what you|we are|you will/i.test(text)
    const lineCount = text.split('\n').filter(l => l.trim()).length
    const score = text.length * (hasKeywords ? 3 : 1) * (lineCount > 5 ? 2 : 1) / (childCount + 1)

    if (score > bestScore) {
      best = text
      bestScore = score
    }
  }

  return best || ''
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

// ── Save job to tracker ──

async function saveJob() {
  const btn = document.getElementById('jt-save-btn')
  if (!btn) return

  const data = extractJobData()

  // Last resort fallback to page title
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
    const res = await fetch(`${API_URL}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    // Accept both 200 and 201 as success
    if (res.status >= 200 && res.status < 300) {
      btn.textContent = 'Saved!'
      btn.classList.add('jt-saved')
      showToast(`Saved: ${data.role} at ${data.company}`)
    } else {
      throw new Error(`Server returned ${res.status}`)
    }

    setTimeout(() => {
      btn.classList.remove('jt-saved')
      btn.textContent = '+ Save to Tracker'
      btn.disabled = false
    }, 3000)
  } catch (err) {
    // Check if it actually saved despite the error (e.g. CORS blocks reading response)
    let reallySaved = false
    try {
      const check = await fetch(`${API_URL}/jobs`)
      if (check.ok) {
        const jobs = await check.json()
        reallySaved = jobs.some(j => j.role === data.role && j.company === data.company)
      }
    } catch {}

    if (reallySaved) {
      btn.textContent = 'Saved!'
      btn.classList.add('jt-saved')
      showToast(`Saved: ${data.role} at ${data.company}`)
      setTimeout(() => {
        btn.classList.remove('jt-saved')
        btn.textContent = '+ Save to Tracker'
        btn.disabled = false
      }, 3000)
    } else {
      btn.classList.add('jt-error')
      btn.textContent = 'Failed'
      showToast('Could not connect to Job Tracker. Make sure npm run dev is running.')
      setTimeout(() => {
        btn.classList.remove('jt-error')
        btn.textContent = '+ Save to Tracker'
        btn.disabled = false
      }, 3000)
    }
  }
}

// ── Floating button ──

function injectFloatingButton() {
  if (document.getElementById('jt-save-btn')) return

  const btn = document.createElement('button')
  btn.id = 'jt-save-btn'
  btn.textContent = '+ Save to Tracker'
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    saveJob()
  })

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

injectFloatingButton()
updateVisibility()

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
