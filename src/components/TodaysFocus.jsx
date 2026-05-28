import React, { useState, useEffect } from 'react'
import { getWinsForPeriod } from '../lib/winTracker.js'

const TERMINAL = /reject|close|declin|withdraw|pass|archive/i

const TYPE_COLOR = {
  INTERVIEW_ALERT: '#ef4444',
  READY_TO_APPLY:  '#10b981',
  HOT_MATCH:       '#4f6ef7',
  FOLLOW_UP:       '#f59e0b',
  INTERVIEW_PREP:  '#8b5cf6',
  STALE_GOOD:      '#f97316',
  STALE:           '#94a3b8',
  NEEDS_ANALYSIS:  '#06b6d4',
  BACKLOG_CLEANUP: '#94a3b8',
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
    const isPreApply = /backlog|want|send|save|consider/i.test(status)
    const isApplied = /applied/i.test(status)
    const isInterview = /interview/i.test(status)

    // Interview within 24h
    const upcomingInterview = reminders.find(r =>
      r.job_id === job.id && !r.completed &&
      (r.type === 'interview_reminder' || (r.title || '').toLowerCase().includes('interview')) &&
      new Date(r.due_at) > now &&
      new Date(r.due_at) - now < 24 * 3600000
    )
    if (upcomingInterview) {
      const h = Math.round((new Date(upcomingInterview.due_at) - now) / 3600000)
      cards.push({ type: 'INTERVIEW_ALERT', priority: 1, job,
        headline: 'Interview coming up — are you ready?',
        context: `You have an interview for ${job.role} at ${job.company} in ${h}h.`,
        recommendation: "Review your prep notes and key talking points before the call. Don't go in cold.",
        actions: [
          { label: 'Interview Prep', tab: 'interview', variant: 'primary' },
          { label: 'My Notes', tab: 'notes' },
        ]
      })
      continue
    }

    // Ready to apply: high match + tailored resume
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

    // Hot match, needs resume
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

    // Follow up after applying
    if (isApplied && days >= 3) {
      cards.push({ type: 'FOLLOW_UP', priority: 4, job,
        headline: "This opportunity is going quiet",
        context: `No activity for ${Math.floor(days)} days since applying to ${job.company}.`,
        recommendation: 'A short follow-up message can keep you top of mind.',
        actions: [
          { label: 'Log Update', tab: 'notes', variant: 'primary' },
          { label: 'Open Job', tab: 'analysis' },
        ]
      })
      continue
    }

    // Interview stage, no prep
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

    // Good match, stale 5+ days in pre-apply
    if (score != null && score >= 65 && isPreApply && days >= 5) {
      cards.push({ type: 'STALE_GOOD', priority: 5, job,
        headline: "This is getting cold",
        context: `${score}% match but sitting in "${job.status}" for ${Math.floor(days)} days. This one deserves a decision.`,
        recommendation: hasResume
          ? 'Your resume is ready — submit the application.'
          : 'Tailor your resume and get this one moving.',
        actions: [
          { label: hasResume ? (job.link ? 'Apply Now ↗' : 'Open Job') : 'Tailor Resume',
            link: hasResume && job.link ? job.link : null,
            tab: hasResume ? 'analysis' : 'resume',
            variant: 'primary' },
          { label: 'Archive', action: 'archive' },
        ]
      })
      continue
    }

    // Stale, any match, 7+ days
    if (isPreApply && days >= 7) {
      cards.push({ type: 'STALE', priority: 6, job,
        headline: "Still interested in this role?",
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

    // Needs analysis
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

  // Backlog cleanup aggregate card
  const staleBacklog = jobs.filter(j =>
    !TERMINAL.test(j.status || '') &&
    /backlog/i.test(j.status || '') &&
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

  return { primary: cards[0] || null, secondary: cards.slice(1, 3) }
}

function WinsSection({ jobs }) {
  const wins = getWinsForPeriod(1)
  const today = new Date().toISOString().slice(0, 10)
  const addedToday = jobs.filter(j => (j.created_at || '').slice(0, 10) === today).length
  const analyzed = wins.filter(w => w.type === 'analyzed').length
  const tailored = wins.filter(w => w.type === 'tailored').length
  const applied = wins.filter(w => w.type === 'applied').length

  const items = [
    addedToday > 0 && `${addedToday} job${addedToday > 1 ? 's' : ''} added`,
    analyzed > 0 && `${analyzed} analyzed`,
    tailored > 0 && `${tailored} tailored`,
    applied > 0 && `${applied} applied`,
  ].filter(Boolean)

  if (!items.length) return null

  return (
    <div className="focus-wins">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      <span className="focus-wins-label">Today's wins:</span>
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="focus-wins-sep">·</span>}
          <span>{item}</span>
        </React.Fragment>
      ))}
    </div>
  )
}

function FocusCard({ card, size, columns, onSelect, onMoveJob, onDismiss }) {
  const color = TYPE_COLOR[card.type] || '#94a3b8'

  const runAction = (action) => {
    if (action.action === 'dismiss') { onDismiss(card.job?.id) }
    else if (action.action === 'archive') {
      const archiveCol = columns.find(c => TERMINAL.test(c.name))
      if (archiveCol && card.job) { onMoveJob(card.job.id, archiveCol.name); onDismiss(card.job.id) }
      else if (card.job) onSelect(card.job.id, 'analysis')
    }
    else if (action.action === 'dismiss_backlog') { onDismiss('_backlog') }
    else if (action.action === 'open_backlog') {
      const el = document.querySelector('.kanban-column')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      onDismiss('_backlog')
    }
    else if (action.link) { window.open(action.link, '_blank') }
    else if (action.tab && card.job) { onSelect(card.job.id, action.tab) }
  }

  if (size === 'primary') {
    return (
      <div className="focus-primary-card" style={{ borderLeftColor: color }}>
        <div className="focus-primary-top">
          <div className="focus-primary-titles">
            <div className="focus-primary-headline">{card.headline}</div>
            {card.job && <div className="focus-primary-job">{card.job.role} · {card.job.company}</div>}
          </div>
          {card.job?.match_score != null && (
            <span className={`score score-sm ${card.job.match_score >= 70 ? 'high' : card.job.match_score >= 40 ? 'mid' : 'low'}`}>
              {card.job.match_score}%
            </span>
          )}
        </div>
        <p className="focus-primary-context">{card.context}</p>
        <div className="focus-rec-box">
          <span className="focus-rec-label">Recommendation</span>
          <span className="focus-rec-text">{card.recommendation}</span>
        </div>
        <div className="focus-primary-actions">
          {card.actions.map((action, i) => (
            <button key={i}
              className={`btn btn-sm ${
                action.variant === 'primary' ? 'btn-primary' :
                action.action === 'archive' || action.action === 'dismiss' || action.action === 'dismiss_backlog'
                  ? 'btn-ghost' : 'btn-secondary'
              }`}
              onClick={() => runAction(action)}
            >{action.label}</button>
          ))}
        </div>
      </div>
    )
  }

  const primaryAction = card.actions.find(a => a.variant === 'primary') || card.actions[0]
  const secondaryAction = card.actions.find(a =>
    a !== primaryAction && (a.action === 'archive' || a.action === 'dismiss' || a.action === 'dismiss_backlog')
  )

  return (
    <div className="focus-secondary-card" style={{ borderLeftColor: color }}
      onClick={() => card.job && onSelect(card.job.id)}
    >
      <div className="focus-secondary-headline">{card.headline}</div>
      {card.job && <div className="focus-secondary-job">{card.job.role} · {card.job.company}</div>}
      <p className="focus-secondary-context">{card.context}</p>
      <div className="focus-secondary-actions" onClick={e => e.stopPropagation()}>
        {primaryAction && (
          <button className="btn btn-sm btn-secondary" onClick={() => runAction(primaryAction)}>
            {primaryAction.label}
          </button>
        )}
        {secondaryAction && (
          <button className="btn btn-sm btn-ghost" onClick={() => runAction(secondaryAction)}>
            {secondaryAction.label}
          </button>
        )}
      </div>
    </div>
  )
}

export default function TodaysFocus({ jobs, reminders, columns, onSelect, onMoveJob }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('focusDismissed') || '[]')) } catch { return new Set() }
  })
  const [collapsed, setCollapsed] = useState(false)

  const dismiss = (id) => {
    setDismissed(prev => {
      const next = new Set([...prev, id])
      localStorage.setItem('focusDismissed', JSON.stringify([...next]))
      return next
    })
  }

  // Prune dismissed IDs for jobs that no longer exist
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

  const { primary, secondary } = deriveFocusCards(jobs, reminders, dismissed)

  if (!primary && !secondary.length) return null

  return (
    <div className="todays-focus-v2">
      <div className="focus-v2-header" onClick={() => setCollapsed(c => !c)}>
        <h3 className="focus-v2-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          Today's Focus
          {collapsed && primary && <span className="focus-v2-collapsed-hint"> · {primary.headline}</span>}
        </h3>
        <div className="focus-v2-header-btns" onClick={e => e.stopPropagation()}>
          <button className="focus-header-btn"
            onClick={() => { setDismissed(new Set()); localStorage.removeItem('focusDismissed') }}
            title="Reset dismissed items"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/>
            </svg>
          </button>
          <button className="focus-header-btn" onClick={() => setCollapsed(c => !c)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s' }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {primary && (
            <FocusCard card={primary} size="primary" columns={columns} onSelect={onSelect} onMoveJob={onMoveJob} onDismiss={dismiss} />
          )}
          {secondary.length > 0 && (
            <div className="focus-secondary-cards">
              {secondary.map((card, i) => (
                <FocusCard key={i} card={card} size="secondary" columns={columns} onSelect={onSelect} onMoveJob={onMoveJob} onDismiss={dismiss} />
              ))}
            </div>
          )}
          <WinsSection jobs={jobs} />
        </>
      )}
    </div>
  )
}
