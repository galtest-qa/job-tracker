import React, { useState, useEffect } from 'react'
import CompanyLogo from './CompanyLogo.jsx'
import { getWinsForDate, getWinsForPeriod } from '../lib/winTracker.js'

const TERMINAL = /reject|close|declin|withdraw|pass|archive/i

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
  const active = jobs.filter(j => !TERMINAL.test(j.status || '') && !dismissed.has(j.id))
  const cards = []

  for (const job of active) {
    const status = (job.status || '').toLowerCase()
    const days = daysSince(job.updated_at || job.created_at)
    const score = job.match_score
    const hasResume = !!job.tailored_resume
    const hasDesc = !!job.description
    const hasPrep = !!(job.interview_prep_ai &&
      (typeof job.interview_prep_ai === 'object'
        ? Object.keys(job.interview_prep_ai).length > 0
        : job.interview_prep_ai.length > 10))
    const isApplied = /applied/i.test(status)
    const isInterview = /interview/i.test(status)
    const isPreApply = !isApplied && !isInterview && !TERMINAL.test(status)

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

    if (score != null && score >= 80 && hasResume && isPreApply) {
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

    if (score != null && score >= 80 && !hasResume && isPreApply) {
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

    if (score != null && score >= 60 && score < 80 && !hasResume && isPreApply) {
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

    if (score != null && isPreApply && !hasResume && days < 5) {
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

    if (score == null && !hasDesc && isPreApply && days < 3) {
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

    if (isApplied && days >= 3) {
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

    if (isInterview && !hasPrep) {
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

    if (score != null && score >= 65 && isPreApply && days >= 5) {
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

    if (isPreApply && days >= 7) {
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

    if (score == null && hasDesc && isPreApply) {
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
    !TERMINAL.test(j.status || '') && /backlog/i.test(j.status || '') &&
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
  const r = 30
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" className="focus-score-svg">
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--border-light)" strokeWidth="5"/>
      <circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
        transform="rotate(-90 38 38)"
      />
      <text x="38" y="35" textAnchor="middle" fontSize="16" fontWeight="800" fill="currentColor" className="focus-score-num">{score}</text>
      <text x="38" y="49" textAnchor="middle" fontSize="9" fill="currentColor" className="focus-score-label">match</text>
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
      const col = columns.find(c => TERMINAL.test(c.name))
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
      const col = columns.find(c => TERMINAL.test(c.name))
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

function getMotivation(pct, count) {
  if (count === 0) return "Let's get the week started"
  if (pct < 25) return "Building momentum — keep going"
  if (pct < 50) return "Good progress! You're making moves"
  if (pct < 75) return "Great momentum! Keep going 💪"
  if (pct < 100) return "Almost there — one final push"
  return "Weekly goal reached! Outstanding work 🎉"
}

function ProgressSection({ jobs }) {
  const [weeklyGoal] = useState(() => {
    try { return parseInt(localStorage.getItem('weeklyGoal') || '10') } catch { return 10 }
  })

  const todayStr = new Date().toISOString().slice(0, 10)
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 86400000)

  const todayWins = getWinsForDate(0)
  const yesterdayWins = getWinsForDate(1)
  const weekWins = getWinsForPeriod(7)

  const addedToday = jobs.filter(j => (j.created_at || '').slice(0, 10) === todayStr).length
  const addedYesterday = jobs.filter(j => (j.created_at || '').slice(0, 10) === yesterdayStr).length
  const addedThisWeek = jobs.filter(j => new Date(j.created_at) > weekAgo).length

  const count = (arr, type) => arr.filter(w => w.type === type).length

  const todayStats = [
    addedToday > 0 && `${addedToday} added`,
    count(todayWins, 'analyzed') > 0 && `${count(todayWins, 'analyzed')} analyzed`,
    count(todayWins, 'tailored') > 0 && `${count(todayWins, 'tailored')} tailored`,
    count(todayWins, 'applied') > 0 && `${count(todayWins, 'applied')} applied`,
  ].filter(Boolean)

  const yesterdayStats = [
    addedYesterday > 0 && `${addedYesterday} added`,
    count(yesterdayWins, 'analyzed') > 0 && `${count(yesterdayWins, 'analyzed')} analyzed`,
    count(yesterdayWins, 'tailored') > 0 && `${count(yesterdayWins, 'tailored')} tailored`,
    count(yesterdayWins, 'applied') > 0 && `${count(yesterdayWins, 'applied')} applied`,
  ].filter(Boolean)

  const weekStats = [
    addedThisWeek > 0 && `${addedThisWeek} added`,
    count(weekWins, 'analyzed') > 0 && `${count(weekWins, 'analyzed')} analyzed`,
    count(weekWins, 'tailored') > 0 && `${count(weekWins, 'tailored')} tailored`,
    count(weekWins, 'applied') > 0 && `${count(weekWins, 'applied')} applied`,
  ].filter(Boolean)

  const appliedThisWeek = count(weekWins, 'applied')
  const pct = Math.min(100, Math.round((appliedThisWeek / weeklyGoal) * 100))

  return (
    <div className="focus-progress-section">
      <div className="focus-progress-header">
        <span className="focus-section-label">Your Progress</span>
      </div>

      {(todayStats.length > 0 || yesterdayStats.length > 0 || weekStats.length > 0) && (
        <div className="focus-stats-rows">
          {todayStats.length > 0 && (
            <div className="focus-stat-row">
              <span className="focus-stat-period">Today</span>
              <span className="focus-stat-text">{todayStats.join(' · ')}</span>
            </div>
          )}
          {yesterdayStats.length > 0 && (
            <div className="focus-stat-row">
              <span className="focus-stat-period">Yesterday</span>
              <span className="focus-stat-text">{yesterdayStats.join(' · ')}</span>
            </div>
          )}
          {weekStats.length > 0 && (weekStats.length > (todayStats.length > 0 ? todayStats.length : 0) || true) && (
            <div className="focus-stat-row">
              <span className="focus-stat-period">This Week</span>
              <span className="focus-stat-text">{weekStats.join(' · ')}</span>
            </div>
          )}
        </div>
      )}

      <div className="focus-goal-block">
        <div className="focus-goal-top">
          <span className="focus-goal-label">Weekly Applications Goal</span>
          <span className="focus-goal-count">{appliedThisWeek} / {weeklyGoal}</span>
        </div>
        <div className="focus-goal-track">
          <div className="focus-goal-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="focus-goal-bottom">
          <span className="focus-goal-message">{getMotivation(pct, appliedThisWeek)}</span>
          <span className="focus-goal-pct">{pct}%</span>
        </div>
      </div>
    </div>
  )
}

export default function TodaysFocus({ jobs, reminders, columns, onSelect, onMoveJob, onRefresh }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('focusDismissed') || '[]')) } catch { return new Set() }
  })
  const [collapsed, setCollapsed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

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
          <ProgressSection jobs={jobs} />
        </>
      )}
    </div>
  )
}
