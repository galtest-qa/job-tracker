import React, { useState, useEffect, useRef } from 'react'
import CompanyLogo from './CompanyLogo.jsx'
import { api } from '../api.js'
import { getWinsForDate, getWinsForPeriod } from '../lib/winTracker.js'
import { getStage, isPreApply, isApplied, isInterview, isTerminal } from '../lib/columns.js'

const TYPE_META = {
  INTERVIEW_ALERT: { color: '#ef4444', bg: '#fef2f2', label: 'Urgent' },
  READY_TO_APPLY:  { color: '#10b981', bg: '#f0fdf4', label: 'Ready to Apply' },
  HOT_MATCH:       { color: '#4f6ef7', bg: '#eff6ff', label: 'Hot Match' },
  GOOD_MATCH:      { color: '#4f6ef7', bg: '#eff6ff', label: 'Good Match' },
  FOLLOW_UP:       { color: '#f59e0b', bg: '#fffbeb', label: 'Follow Up' },
  INTERVIEW_PREP:  { color: '#8b5cf6', bg: '#faf5ff', label: 'Prep Needed' },
  BACKLOG_MOVE:    { color: '#10b981', bg: '#f0fdf4', label: 'Move Forward' },
  STALE_GOOD:      { color: '#f97316', bg: '#fff7ed', label: 'Action Needed' },
  STALE:           { color: '#64748b', bg: '#f8fafc', label: 'Stale' },
  NEEDS_ANALYSIS:  { color: '#06b6d4', bg: '#ecfeff', label: 'Unscored' },
  FRESH_UNSCORED:  { color: '#06b6d4', bg: '#ecfeff', label: 'Just Added' },
  BACKLOG_CLEANUP: { color: '#64748b', bg: '#f8fafc', label: 'Review Needed' },
}

function daysSince(dateStr) {
  if (!dateStr) return 0
  return (Date.now() - new Date(dateStr).getTime()) / 86400000
}

function deriveFocusCards(jobs, reminders, dismissed) {
  const now = new Date()
  const active = jobs.filter(j => !isTerminal(j.status) && !dismissed.has(j.id))
  const cards = []

  for (const job of active) {
    const status = job.status || ''
    const days = daysSince(job.updated_at || job.created_at)
    const score = job.match_score
    const hasResume = !!job.tailored_resume
    const hasDesc = !!job.description
    const hasPrep = !!(job.interview_prep_ai &&
      (typeof job.interview_prep_ai === 'object'
        ? Object.keys(job.interview_prep_ai).length > 0
        : job.interview_prep_ai.length > 10))
    const jobIsPreApply   = isPreApply(status)
    const jobIsApplied    = isApplied(status)
    const jobIsInterview  = isInterview(status)

    const upcomingInterview = reminders.find(r =>
      r.job_id === job.id && !r.completed &&
      (r.type === 'interview_reminder' || (r.title || '').toLowerCase().includes('interview')) &&
      new Date(r.due_at) > now && new Date(r.due_at) - now < 24 * 3600000
    )
    if (upcomingInterview) {
      const h = Math.round((new Date(upcomingInterview.due_at) - now) / 3600000)
      cards.push({ type: 'INTERVIEW_ALERT', priority: 1, job,
        headline: 'Interview coming up — are you ready?',
        context: `You have an interview for ${job.role} at ${job.company} in ${h}h.`,
        recommendation: "Review your prep notes and talking points. Don't go in cold.",
        actions: [
          { label: 'Interview Prep', tab: 'interview', variant: 'primary' },
          { label: 'My Notes', tab: 'notes' },
        ]
      })
      continue
    }

    if (score != null && score >= 80 && hasResume && jobIsPreApply) {
      cards.push({ type: 'READY_TO_APPLY', priority: 2, job,
        headline: "You're one step away from applying",
        context: `${score}% match and your resume is already tailored. You already did the hard part.`,
        recommendation: 'Submit the application today while momentum is high.',
        actions: [
          { label: job.link ? 'Apply Now ↗' : 'Open Job', link: job.link || null, tab: 'analysis', variant: 'primary' },
          { label: 'Review Resume', tab: 'resume' },
          { label: 'Dismiss', action: 'dismiss' },
        ]
      })
      continue
    }

    if (score != null && score >= 80 && !hasResume && jobIsPreApply) {
      cards.push({ type: 'HOT_MATCH', priority: 3, job,
        headline: 'High match, low effort',
        context: `${score}% match — the only thing missing is a tailored resume.`,
        recommendation: 'Tailor your resume now. It should take minutes.',
        actions: [
          { label: 'Tailor Resume', tab: 'resume', variant: 'primary' },
          { label: 'View Job', tab: 'analysis' },
        ]
      })
      continue
    }

    if (score != null && score >= 60 && score < 80 && !hasResume && jobIsPreApply) {
      cards.push({ type: 'GOOD_MATCH', priority: 3.5, job,
        headline: 'Worth pursuing — tailor your resume',
        context: `${score}% match at ${job.company}. A tailored resume can make you competitive.`,
        recommendation: 'Tailoring pushes your effective match well above 80%.',
        actions: [
          { label: 'Tailor Resume', tab: 'resume', variant: 'primary' },
          { label: 'View Analysis', tab: 'analysis' },
          { label: 'Dismiss', action: 'dismiss' },
        ]
      })
      continue
    }

    if (score != null && jobIsPreApply && !hasResume && days < 5) {
      cards.push({ type: 'BACKLOG_MOVE', priority: 4.5, job,
        headline: 'Ready to move this one forward?',
        context: `${job.role} at ${job.company} is sitting in your backlog. ${score != null ? `You're a ${score}% match.` : ''} Time to decide.`,
        recommendation: 'Tailor your resume or move it to the next stage to keep momentum.',
        actions: [
          { label: 'Tailor Resume', tab: 'resume', variant: 'primary' },
          { label: 'View Job', tab: 'analysis' },
          { label: 'Dismiss', action: 'dismiss' },
        ]
      })
      continue
    }

    if (score == null && !hasDesc && jobIsPreApply && days < 3) {
      cards.push({ type: 'FRESH_UNSCORED', priority: 6.5, job,
        headline: 'New job added — add a description',
        context: `You added ${job.role} at ${job.company} but there's no description yet. AI analysis needs it.`,
        recommendation: 'Paste in the job description to unlock match scoring, resume tailoring, and interview prep.',
        actions: [
          { label: 'Add Description', tab: 'analysis', variant: 'primary' },
          { label: 'Dismiss', action: 'dismiss' },
        ]
      })
      continue
    }

    if (jobIsApplied && days >= 3) {
      cards.push({ type: 'FOLLOW_UP', priority: 4, job,
        headline: 'This opportunity is going quiet',
        context: `No activity for ${Math.floor(days)} days since applying to ${job.company}.`,
        recommendation: 'A short follow-up message can keep you top of mind.',
        actions: [
          { label: 'Log Update', tab: 'notes', variant: 'primary' },
          { label: 'Open Job', tab: 'analysis' },
        ]
      })
      continue
    }

    if (jobIsInterview && !hasPrep) {
      cards.push({ type: 'INTERVIEW_PREP', priority: 4, job,
        headline: 'Interview scheduled — no prep yet',
        context: `You're in the interview stage at ${job.company} but haven't generated prep.`,
        recommendation: 'Generate AI interview prep to walk in confident.',
        actions: [
          { label: 'Generate Prep', tab: 'interview', variant: 'primary' },
          { label: 'Open Job', tab: 'analysis' },
        ]
      })
      continue
    }

    if (score != null && score >= 65 && jobIsPreApply && days >= 5) {
      cards.push({ type: 'STALE_GOOD', priority: 5, job,
        headline: 'This is getting cold',
        context: `${score}% match but sitting in "${job.status}" for ${Math.floor(days)} days. This one deserves a decision.`,
        recommendation: hasResume ? 'Your resume is ready — submit the application.' : 'Tailor your resume and get this one moving.',
        actions: [
          { label: hasResume ? (job.link ? 'Apply Now ↗' : 'Open Job') : 'Tailor Resume',
            link: hasResume && job.link ? job.link : null,
            tab: hasResume ? 'analysis' : 'resume', variant: 'primary' },
          { label: 'Archive', action: 'archive' },
        ]
      })
      continue
    }

    if (jobIsPreApply && days >= 7) {
      cards.push({ type: 'STALE', priority: 6, job,
        headline: 'Still interested in this role?',
        context: `Untouched for ${Math.floor(days)} days. You're probably overthinking this one.`,
        recommendation: 'Make a call: apply, archive, or update your notes.',
        actions: [
          { label: 'Take Action', tab: 'analysis', variant: 'primary' },
          { label: 'Archive', action: 'archive' },
          { label: 'Dismiss', action: 'dismiss' },
        ]
      })
      continue
    }

    if (score == null && hasDesc && jobIsPreApply) {
      cards.push({ type: 'NEEDS_ANALYSIS', priority: 7, job,
        headline: 'Unscored opportunity',
        context: `You haven't analyzed ${job.role} at ${job.company} yet. You might be a great fit.`,
        recommendation: 'Run AI analysis to get your match score.',
        actions: [
          { label: 'Analyze Now', tab: 'analysis', variant: 'primary' },
        ]
      })
    }
  }

  cards.sort((a, b) => a.priority - b.priority || daysSince(b.job?.updated_at) - daysSince(a.job?.updated_at))

  const staleBacklog = jobs.filter(j =>
    j.status === 'Backlog' &&
    daysSince(j.updated_at || j.created_at) >= 7
  )
  if (staleBacklog.length >= 3 && !dismissed.has('_backlog')) {
    const bc = { type: 'BACKLOG_CLEANUP', priority: 5.5, job: null,
      headline: 'Your backlog needs attention',
      context: `${staleBacklog.length} jobs haven't been touched in 7+ days. A clean pipeline reduces overwhelm.`,
      recommendation: 'Review and either progress or archive stale roles.',
      actions: [
        { label: 'Review Backlog', action: 'open_backlog', variant: 'primary' },
        { label: 'Dismiss', action: 'dismiss_backlog' },
      ]
    }
    const insertAt = cards.findIndex(c => c.priority > 5.5)
    if (insertAt === -1) cards.push(bc)
    else cards.splice(insertAt, 0, bc)
  }

  return { primary: cards[0] || null, suggestions: cards.slice(1, 4) }
}

function ScoreCircle({ score }) {
  const r = 34
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" className="focus-score-svg">
      <circle cx="44" cy="44" r={r} fill="none" stroke="var(--border-light)" strokeWidth="5.5"/>
      <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="5.5"
        strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
        transform="rotate(-90 44 44)"
      />
      <text x="44" y="40" textAnchor="middle" fontSize="18" fontWeight="800" fill="currentColor" className="focus-score-num">{score}</text>
      <text x="44" y="54" textAnchor="middle" fontSize="10" fill="currentColor" className="focus-score-label">match</text>
    </svg>
  )
}

function HeroCard({ card, columns, onSelect, onMoveJob, onDismiss }) {
  const meta = TYPE_META[card.type] || TYPE_META.STALE
  const { job } = card
  const days = job ? Math.floor(daysSince(job.updated_at || job.created_at)) : 0

  const runAction = (action) => {
    if (action.action === 'dismiss') onDismiss(job?.id)
    else if (action.action === 'archive') {
      const col = columns.find(c => c.name === 'Rejected')
      if (col && job) { onMoveJob(job.id, col.name); onDismiss(job.id) }
      else if (job) onSelect(job.id, 'analysis')
    }
    else if (action.action === 'dismiss_backlog') onDismiss('_backlog')
    else if (action.action === 'open_backlog') { onDismiss('_backlog') }
    else if (action.link) window.open(action.link, '_blank')
    else if (action.tab && job) onSelect(job.id, action.tab)
  }

  return (
    <div className="focus-hero-card" style={{ borderLeftColor: meta.color }}>
      <div className="focus-hero-left">
        <span className="focus-hero-badge" style={{ background: meta.bg, color: meta.color }}>
          {meta.label}
        </span>
        <h2 className="focus-hero-headline">{card.headline}</h2>
        {job && (
          <div className="focus-hero-job-row">
            <CompanyLogo company={job.company} size="sm" logoUrl={job.logo_url} />
            <div className="focus-hero-job-info">
              <div className="focus-hero-role">{job.role}</div>
              <div className="focus-hero-company">{job.company}</div>
            </div>
          </div>
        )}
        <p className="focus-hero-context">{card.context}</p>
        <div className="focus-hero-rec">
          <span className="focus-hero-rec-label">Recommendation</span>
          <span className="focus-hero-rec-text">{card.recommendation}</span>
        </div>
        <div className="focus-hero-actions">
          {card.actions.map((a, i) => (
            <button key={i} onClick={() => runAction(a)}
              className={`btn btn-sm ${
                a.variant === 'primary' ? 'btn-primary' :
                a.action === 'archive' || a.action === 'dismiss' || a.action === 'dismiss_backlog'
                  ? 'btn-ghost' : 'btn-secondary'
              }`}
            >{a.label}</button>
          ))}
        </div>
      </div>

      {job?.match_score != null && (
        <div className="focus-hero-right">
          <ScoreCircle score={job.match_score} />
          <div className="focus-hero-meta">
            <div className="focus-hero-meta-item">
              <span className="focus-meta-dot" style={{ background: days > 7 ? '#ef4444' : days > 3 ? '#f59e0b' : '#10b981' }} />
              <span>{days}d in stage</span>
            </div>
            <div className="focus-hero-meta-item">
              <span className="focus-meta-dot" style={{ background: job.tailored_resume ? '#10b981' : '#cbd5e1' }} />
              <span>{job.tailored_resume ? 'Resume ready' : 'No resume yet'}</span>
            </div>
            {job.interview_prep_ai && (
              <div className="focus-hero-meta-item">
                <span className="focus-meta-dot" style={{ background: '#10b981' }} />
                <span>Prep ready</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SuggestionCard({ card, columns, onSelect, onMoveJob, onDismiss }) {
  const meta = TYPE_META[card.type] || TYPE_META.STALE
  const { job } = card

  const runAction = (action) => {
    if (action.action === 'dismiss') onDismiss(job?.id)
    else if (action.action === 'archive') {
      const col = columns.find(c => c.name === 'Rejected')
      if (col && job) { onMoveJob(job.id, col.name); onDismiss(job.id) }
      else if (job) onSelect(job.id, 'analysis')
    }
    else if (action.action === 'dismiss_backlog') onDismiss('_backlog')
    else if (action.action === 'open_backlog') { onDismiss('_backlog') }
    else if (action.link) window.open(action.link, '_blank')
    else if (action.tab && job) onSelect(job.id, action.tab)
  }

  const primaryAction = card.actions.find(a => a.variant === 'primary') || card.actions[0]
  const dismissAction = card.actions.find(a =>
    a !== primaryAction && (a.action === 'archive' || a.action === 'dismiss' || a.action === 'dismiss_backlog')
  )

  return (
    <div className="focus-suggestion-card" onClick={() => job && onSelect(job.id)}>
      <div className="focus-suggestion-top">
        <span className="focus-suggestion-dot" style={{ background: meta.color }} />
        <span className="focus-suggestion-label" style={{ color: meta.color }}>{meta.label}</span>
        {dismissAction && (
          <button className="focus-suggestion-dismiss" onClick={e => { e.stopPropagation(); runAction(dismissAction) }} title="Dismiss">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}
      </div>
      <div className="focus-suggestion-headline">{card.headline}</div>
      {job && (
        <div className="focus-suggestion-job-row">
          <CompanyLogo company={job.company} size="xs" logoUrl={job.logo_url} />
          <div className="focus-suggestion-job-info">
            <div className="focus-suggestion-role">{job.role}</div>
            <div className="focus-suggestion-company">{job.company}</div>
          </div>
        </div>
      )}
      <p className="focus-suggestion-desc">{card.context}</p>
      {primaryAction && (
        <div onClick={e => e.stopPropagation()}>
          <button className="btn btn-sm btn-secondary focus-suggestion-btn" onClick={() => runAction(primaryAction)}>
            {primaryAction.label}
          </button>
        </div>
      )}
    </div>
  )
}

const METRIC_COLORS = {
  added:    '#4f6ef7',
  analyzed: '#06b6d4',
  tailored: '#8b5cf6',
  applied:  '#10b981',
}

function getMotivation(pct) {
  if (pct === 0)   return "Let's get the week started"
  if (pct < 25)   return "Building momentum — keep going"
  if (pct < 50)   return "Good progress! You're making moves"
  if (pct < 75)   return "Great momentum! Keep going"
  if (pct < 100)  return "Almost there — one final push"
  return "Goal reached! Outstanding work 🎉"
}

function GoalsPopover({ goals, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...goals })
  const [saving, setSaving] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', esc) }
  }, [onClose])

  const set = (key, val) => {
    const n = Math.max(1, Math.min(99, parseInt(val) || 1))
    setDraft(d => ({ ...d, [key]: n }))
  }

  const save = async () => {
    setSaving(true)
    await onSave(draft)
    setSaving(false)
    onClose()
  }

  const fields = [
    { key: 'weekly_goal_applied',  label: 'Applications sent',  color: METRIC_COLORS.applied  },
    { key: 'weekly_goal_tailored', label: 'Resumes tailored',   color: METRIC_COLORS.tailored },
    { key: 'weekly_goal_added',    label: 'Jobs added',         color: METRIC_COLORS.added    },
  ]

  return (
    <div className="goals-popover" ref={ref}>
      <div className="goals-popover-header">
        <span>Set Weekly Goals</span>
        <button className="goals-popover-close" onClick={onClose}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div className="goals-popover-fields">
        {fields.map(f => (
          <div key={f.key} className="goals-popover-row">
            <span className="goals-popover-dot" style={{ background: f.color }} />
            <span className="goals-popover-label">{f.label}</span>
            <input
              type="number" min="1" max="99"
              className="goals-popover-input"
              value={draft[f.key]}
              onChange={e => set(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="goals-popover-footer">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save Goals'}
        </button>
      </div>
    </div>
  )
}

function ProgressSection({ jobs, goals, onSaveGoals }) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const pencilRef = useRef(null)

  const CHART_H = 52

  const dayData = Array.from({ length: 7 }, (_, i) => {
    const daysAgo = 6 - i
    const d = new Date(Date.now() - daysAgo * 86400000)
    const dateStr = d.toISOString().slice(0, 10)
    const wins = getWinsForDate(daysAgo)
    const added    = jobs.filter(j => (j.created_at || '').slice(0, 10) === dateStr).length
    const analyzed = wins.filter(w => w.type === 'analyzed').length
    const tailored = wins.filter(w => w.type === 'tailored').length
    const appliedWins = wins.filter(w => w.type === 'applied').length
    const appliedJobs = jobs.filter(j =>
      isApplied(j.status) && (j.updated_at || '').slice(0, 10) === dateStr
    ).length
    const applied = Math.max(appliedWins, appliedJobs)
    return {
      label: d.toLocaleDateString('en', { weekday: 'short' }).slice(0, 1),
      isToday: daysAgo === 0,
      added, analyzed, tailored, applied,
      total: added + analyzed + tailored + applied,
    }
  })

  const maxTotal = Math.max(...dayData.map(d => d.total), 1)
  const today = dayData[6]
  const weekAgo = new Date(Date.now() - 7 * 86400000)
  const weekWins = getWinsForPeriod(7)

  const weekStats = {
    applied: Math.max(
      weekWins.filter(w => w.type === 'applied').length,
      jobs.filter(j => isApplied(j.status) && new Date(j.updated_at) > weekAgo).length
    ),
    tailored: weekWins.filter(w => w.type === 'tailored').length,
    added: jobs.filter(j => new Date(j.created_at) > weekAgo).length,
  }

  const goalBars = [
    { key: 'applied',  label: 'Applications sent', count: weekStats.applied,  goal: goals.weekly_goal_applied,  color: METRIC_COLORS.applied  },
    { key: 'tailored', label: 'Resumes tailored',  count: weekStats.tailored, goal: goals.weekly_goal_tailored, color: METRIC_COLORS.tailored },
    { key: 'added',    label: 'Jobs added',        count: weekStats.added,    goal: goals.weekly_goal_added,    color: METRIC_COLORS.added    },
  ]

  const todayMetrics = [
    { key: 'added',    label: 'added',    value: today.added },
    { key: 'analyzed', label: 'analyzed', value: today.analyzed },
    { key: 'tailored', label: 'tailored', value: today.tailored },
    { key: 'applied',  label: 'applied',  value: today.applied },
  ]

  return (
    <div className="focus-progress-section">
      <div className="focus-progress-header">
        <span className="focus-section-label">Your Progress</span>
      </div>

      {/* 7-day stacked bar chart */}
      <div className="focus-chart-wrap">
        <div className="focus-chart-bars">
          {dayData.map((day, i) => {
            const barH = day.total > 0 ? Math.max(4, (day.total / maxTotal) * CHART_H) : 0
            const segs = [
              { key: 'added',    h: day.added    / Math.max(day.total, 1) * barH },
              { key: 'analyzed', h: day.analyzed / Math.max(day.total, 1) * barH },
              { key: 'tailored', h: day.tailored / Math.max(day.total, 1) * barH },
              { key: 'applied',  h: day.applied  / Math.max(day.total, 1) * barH },
            ].filter(s => s.h > 0)
            return (
              <div key={i} className={`focus-chart-col${day.isToday ? ' is-today' : ''}`}>
                <div className="focus-chart-track" style={{ height: CHART_H }}>
                  {barH > 0 ? (
                    <div className="focus-chart-bar" style={{ height: barH }}>
                      {segs.map(s => (
                        <div key={s.key} style={{ height: s.h, background: METRIC_COLORS[s.key] }} />
                      ))}
                    </div>
                  ) : (
                    <div className="focus-chart-empty-bar" />
                  )}
                </div>
                <div className="focus-chart-day-label">{day.label}</div>
              </div>
            )
          })}
        </div>
        <div className="focus-chart-legend">
          {Object.entries(METRIC_COLORS).map(([key, color]) => (
            <span key={key} className="focus-legend-item">
              <span className="focus-legend-dot" style={{ background: color }} />
              {key}
            </span>
          ))}
        </div>
      </div>

      {/* Today's metric pills */}
      <div className="focus-today-row">
        <span className="focus-today-label">Today</span>
        <div className="focus-metric-pills">
          {todayMetrics.map(m => (
            <div key={m.key} className={`focus-metric-pill${m.value === 0 ? ' zero' : ''}`}
              style={{ '--mc': METRIC_COLORS[m.key] }}>
              <span className="focus-metric-val">{m.value}</span>
              <span className="focus-metric-name">{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly goals */}
      <div className="focus-goals-section">
        <div className="focus-goals-header">
          <span className="focus-section-label">Weekly Goals</span>
          <div className="focus-goals-pencil-wrap" ref={pencilRef}>
            <button
              className="focus-goals-pencil"
              onClick={() => setPopoverOpen(o => !o)}
              title="Set your weekly goals"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              </svg>
            </button>
            {popoverOpen && (
              <GoalsPopover
                goals={goals}
                onSave={onSaveGoals}
                onClose={() => setPopoverOpen(false)}
              />
            )}
          </div>
        </div>
        <div className="focus-goal-bars">
          {goalBars.map(g => {
            const pct = Math.min(100, Math.round((g.count / g.goal) * 100))
            return (
              <div key={g.key} className="focus-goal-row">
                <div className="focus-goal-row-top">
                  <span className="focus-goal-dot" style={{ background: g.color }} />
                  <span className="focus-goal-name">{g.label}</span>
                  <span className="focus-goal-count">{g.count} / {g.goal}</span>
                </div>
                <div className="focus-goal-track">
                  <div className="focus-goal-fill" style={{ width: `${pct}%`, background: g.color }} />
                </div>
                {pct > 0 && (
                  <div className="focus-goal-message">{getMotivation(pct)}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const DEFAULT_GOALS = { weekly_goal_applied: 10, weekly_goal_tailored: 5, weekly_goal_added: 15 }

export default function TodaysFocus({ jobs, reminders, columns, onSelect, onMoveJob, onRefresh }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('focusDismissed') || '[]')) } catch { return new Set() }
  })
  const [collapsed, setCollapsed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [goals, setGoals] = useState(DEFAULT_GOALS)

  useEffect(() => {
    api.getSettings().then(s => setGoals(s)).catch(() => {})
  }, [])

  const handleSaveGoals = async (updated) => {
    const saved = await api.updateSettings(updated)
    setGoals(saved)
  }

  const handleRefresh = async () => {
    console.log('[TodaysFocus] refresh clicked, onRefresh=', typeof onRefresh)
    setDismissed(new Set())
    localStorage.removeItem('focusDismissed')
    if (!onRefresh) { console.warn('[TodaysFocus] onRefresh not provided'); return }
    setRefreshing(true)
    try {
      await onRefresh()
      console.log('[TodaysFocus] refresh done')
    } catch (e) {
      console.error('[TodaysFocus] refresh error', e)
    } finally { setRefreshing(false) }
  }

  const dismiss = (id) => {
    setDismissed(prev => {
      const next = new Set([...prev, id])
      localStorage.setItem('focusDismissed', JSON.stringify([...next]))
      return next
    })
  }

  useEffect(() => {
    const currentIds = new Set(jobs.map(j => j.id))
    setDismissed(prev => {
      const pruned = [...prev].filter(id => id.startsWith('_') || currentIds.has(id))
      if (pruned.length === prev.size) return prev
      const next = new Set(pruned)
      localStorage.setItem('focusDismissed', JSON.stringify(pruned))
      return next
    })
  }, [jobs])

  const { primary, suggestions } = deriveFocusCards(jobs, reminders, dismissed)

  return (
    <div className="todays-focus-v2">
      {/* Header */}
      <div className="focus-v2-header" onClick={() => setCollapsed(c => !c)}>
        <h3 className="focus-v2-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          Today's Focus
          {collapsed && primary && <span className="focus-v2-collapsed-hint"> · {primary.headline}</span>}
        </h3>
        <div className="focus-v2-header-btns">
          <button className="focus-header-btn"
            onClick={e => { console.log('BTN CLICK'); e.stopPropagation(); handleRefresh() }}
            title="Refresh focus"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}>
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/>
            </svg>
          </button>
          <button className="focus-header-btn" onClick={e => { e.stopPropagation(); setCollapsed(c => !c) }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s' }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* 1. Hero card */}
          {primary ? (
            <HeroCard card={primary} columns={columns} onSelect={onSelect} onMoveJob={onMoveJob} onDismiss={dismiss} />
          ) : (
            <div className="focus-empty">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span>You're on top of things — no urgent actions right now.</span>
            </div>
          )}

          {/* 2. AI Suggestions */}
          {suggestions.length > 0 && (
            <div className="focus-suggestions-section">
              <div className="focus-section-label">AI Suggestions</div>
              <div className="focus-suggestions-grid">
                {suggestions.map((card, i) => (
                  <SuggestionCard key={i} card={card} columns={columns} onSelect={onSelect} onMoveJob={onMoveJob} onDismiss={dismiss} />
                ))}
              </div>
            </div>
          )}

          {/* 3. Progress & Wins */}
          <ProgressSection jobs={jobs} goals={goals} onSaveGoals={handleSaveGoals} />
        </>
      )}
    </div>
  )
}
