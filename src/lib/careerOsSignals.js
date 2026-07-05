// Career OS signal derivation — pure functions over existing data.
//
// These turn the app's existing data (jobs, reminders, hiring_events,
// recommendations) into the three guidance signals the Career OS Home shows:
//   • Today's Focus        — the single most important next action
//   • Continue items       — background/continuable work in progress
//   • Recent Activity      — meaningful events, not metrics
//
// No network calls, no React — easy to reason about and test.

const DAY = 86400000

export function relativeTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

function reminderState(r) {
  if (r.completed) return 'completed'
  const now = Date.now()
  if (r.snoozed_until && new Date(r.snoozed_until).getTime() > now) return 'snoozed'
  const due = new Date(r.due_at).getTime()
  if (due < now) return 'overdue'
  if (due - now < DAY) return 'today'
  return 'upcoming'
}

function dueLabel(r) {
  const now = Date.now()
  const due = new Date(r.due_at).getTime()
  const mins = Math.round((due - now) / 60000)
  const hrs = Math.round((due - now) / 3600000)
  const days = Math.round((due - now) / DAY)
  if (due < now) {
    if (mins > -60) return `${Math.abs(mins)}m overdue`
    if (hrs > -24) return `${Math.abs(hrs)}h overdue`
    return `${Math.abs(days)}d overdue`
  }
  if (hrs < 1) return `in ${Math.max(mins, 0)}m`
  if (hrs < 24) return `in ${hrs}h`
  return `in ${days}d`
}

const isInterview = (text = '') => /interview|onsite|screen|call/i.test(text)

// ── Today's Focus ───────────────────────────────────────────────────────────
// Scores every candidate action and returns the single highest. Returns null
// when there is genuinely nothing pressing (a calm, anxiety-free empty state).
export function deriveTodaysFocus({ reminders = [], hiringEvents = [], recommendations = [], jobs = [] }) {
  const jobById = new Map(jobs.map(j => [j.id, j]))
  const candidates = []

  // Reminders — overdue and due-today are the most time-sensitive signals.
  for (const r of reminders) {
    const state = reminderState(r)
    if (state !== 'overdue' && state !== 'today' && state !== 'upcoming') continue
    const interview = isInterview(r.title) || r.type === 'interview'
    let score = 0
    if (state === 'overdue') score = 92
    else if (state === 'today') score = 90
    else {
      const days = (new Date(r.due_at).getTime() - Date.now()) / DAY
      if (days > 2) continue // only surface upcoming reminders within ~2 days
      score = 68
    }
    // An imminent interview outranks an overdue admin follow-up.
    if (interview) score += 8
    candidates.push({
      kind: 'reminder',
      score,
      icon: interview ? '🗓️' : '⏰',
      eyebrow: interview ? 'Interview' : 'Reminder',
      title: r.title,
      subtitle: [r.company, r.role].filter(Boolean).join(' · '),
      meta: dueLabel(r),
      jobId: r.job_id || null,
      ctaLabel: interview ? 'Prepare' : 'Open',
    })
  }

  // Hiring events — a recruiter reply / interview invite is high signal.
  for (const e of hiringEvents) {
    if (e.status && e.status !== 'pending') continue
    const ageDays = (Date.now() - new Date(e.created_at).getTime()) / DAY
    if (ageDays > 5) continue
    const p = e.priority_score || 0
    let score = 40 + Math.min(p, 100) * 0.4 // up to ~80
    if (ageDays < 1) score += 6
    candidates.push({
      kind: 'event',
      score,
      icon: '📬',
      eyebrow: 'Recruiter update',
      title: e.title || 'New hiring update',
      subtitle: [e.detected_company, e.detected_role].filter(Boolean).join(' · '),
      meta: relativeTime(e.created_at),
      jobId: e.matched_job_id || null,
      ctaLabel: 'Review',
    })
  }

  // Recommendations — AI-suggested next steps. Deliberately scored below
  // time-sensitive reminders and recruiter replies, so a generic suggestion
  // never buries an imminent interview or an overdue follow-up. It becomes
  // the focus only when nothing more pressing exists.
  for (const rec of recommendations) {
    const job = rec.job_id ? jobById.get(rec.job_id) : null
    candidates.push({
      kind: 'recommendation',
      score: 30 + Math.min(rec.priority || 0, 100) * 0.3,
      icon: recIcon(rec.type),
      eyebrow: 'Recommended',
      title: rec.title,
      subtitle: job ? `${job.company}${job.role ? ' · ' + job.role : ''}` : '',
      meta: rec.reason || '',
      jobId: rec.job_id || null,
      ctaLabel: 'Do it',
    })
  }

  if (!candidates.length) return null
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0]
}

function recIcon(type = '') {
  if (/cover|apply|application/i.test(type)) return '✍️'
  if (/follow/i.test(type)) return '📞'
  if (/interview|prepare|prep/i.test(type)) return '📚'
  if (/move|stage/i.test(type)) return '➡️'
  return '✅'
}

// ── Continue Where You Left Off ──────────────────────────────────────────────
// Surfaces work the system is doing or the user can pick back up. Order:
// live analysis → analysis pending → missing description (blocks analysis).
export function deriveContinueItems({ jobs = [], generatingJobIds = new Set() }) {
  const items = []

  for (const j of jobs) {
    if (generatingJobIds.has && generatingJobIds.has(j.id)) {
      items.push({
        jobId: j.id, live: true, order: 0,
        icon: '🧠',
        title: `${j.company}${j.role ? ' — ' + j.role : ''}`,
        status: 'Analyzing against your resume…',
      })
    }
  }
  for (const j of jobs) {
    if (generatingJobIds.has && generatingJobIds.has(j.id)) continue
    const hasDesc = !!(j.description && j.description.trim())
    if (hasDesc && (j.match_score === null || j.match_score === undefined)) {
      items.push({
        jobId: j.id, live: false, order: 1,
        icon: '⏳',
        title: `${j.company}${j.role ? ' — ' + j.role : ''}`,
        status: 'Analysis pending — tap to run',
      })
    } else if (!hasDesc) {
      items.push({
        jobId: j.id, live: false, order: 2,
        icon: '📝',
        title: `${j.company}${j.role ? ' — ' + j.role : ''}`,
        status: 'Add job description to unlock match & prep',
      })
    }
  }

  items.sort((a, b) => a.order - b.order)
  return items.slice(0, 4)
}

// ── Recent Activity ──────────────────────────────────────────────────────────
// Meaningful events only — things that happened, not counters.
export function deriveRecentActivity({ jobs = [], hiringEvents = [], reminders = [] }) {
  const cutoff = Date.now() - 7 * DAY
  const out = []

  for (const e of hiringEvents) {
    const ts = new Date(e.created_at).getTime()
    if (ts < cutoff) continue
    out.push({
      id: `ev-${e.id}`, ts, icon: '📬',
      text: e.title || `Update${e.detected_company ? ` from ${e.detected_company}` : ''}`,
    })
  }

  for (const r of reminders) {
    if (!r.completed) continue
    const ts = new Date(r.completed_at || r.updated_at || r.due_at).getTime()
    if (!ts || ts < cutoff) continue
    out.push({ id: `rm-${r.id}`, ts, icon: '✓', text: `Done: ${r.title}` })
  }

  for (const j of jobs) {
    const created = new Date(j.created_at).getTime()
    const scored = j.match_score !== null && j.match_score !== undefined
    const updated = j.updated_at ? new Date(j.updated_at).getTime() : created
    if (scored && updated >= cutoff) {
      out.push({
        id: `an-${j.id}`, ts: updated, icon: '🎯',
        text: `Analyzed ${j.company} — ${j.match_score}% match`,
      })
    } else if (created >= cutoff) {
      out.push({
        id: `add-${j.id}`, ts: created, icon: '➕',
        text: `Added ${j.company}${j.role ? ` — ${j.role}` : ''}`,
      })
    }
  }

  out.sort((a, b) => b.ts - a.ts)
  return out.slice(0, 6).map(a => ({ ...a, when: relativeTime(new Date(a.ts).toISOString()) }))
}
