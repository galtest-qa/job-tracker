import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import {
  deriveTodaysFocus,
  deriveContinueItems,
  deriveRecentActivity,
} from '../lib/careerOsSignals.js'

// Career OS Home — answers one question: "What should I do next?"
// It is guidance-first, not a metrics dashboard. Quick Add lives in the
// existing bottom-nav FAB, so there is no permanent add section here.
export default function CareerOSHome({
  jobs = [],
  hiringEvents = [],
  generatingJobIds = new Set(),
  userName,
  onSelectJob,
  onOpenBoard,
  onOpenNotifications,
  onAddJob,
}) {
  const [reminders, setReminders] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.allSettled([api.getAllReminders(), api.getRecommendations()])
      .then(([rem, rec]) => {
        if (!alive) return
        setReminders(rem.status === 'fulfilled' ? rem.value : [])
        setRecommendations(rec.status === 'fulfilled' ? rec.value : [])
        setLoaded(true)
      })
    return () => { alive = false }
  }, [jobs.length, hiringEvents.length])

  const focus = deriveTodaysFocus({ reminders, hiringEvents, recommendations, jobs })
  const continueItems = deriveContinueItems({ jobs, generatingJobIds })
  const activity = deriveRecentActivity({ jobs, hiringEvents, reminders })

  // Recommendations for the list — drop the one already promoted to focus.
  const recActions = recommendations
    .filter(r => !(focus && focus.kind === 'recommendation' && focus.title === r.title))
    .slice(0, 4)

  const greeting = getGreeting()
  const hasNothing = loaded && !focus && continueItems.length === 0 && recActions.length === 0

  const openFocus = () => {
    if (!focus) return
    if (focus.jobId) onSelectJob?.(focus.jobId)
    else if (focus.kind === 'event') onOpenNotifications?.()
  }

  return (
    <div className="cos-home">
      <header className="cos-greeting">
        <h1>{greeting}{userName ? `, ${userName}` : ''}</h1>
        <p className="cos-sub">Here's what matters right now.</p>
      </header>

      {/* 1 — Today's Focus (single primary action) */}
      {focus && (
        <section className="cos-section">
          <h2 className="cos-section-title">Today's Focus</h2>
          <button className="cos-focus" onClick={openFocus}>
            <div className="cos-focus-icon" aria-hidden="true">{focus.icon}</div>
            <div className="cos-focus-body">
              <span className="cos-focus-eyebrow">{focus.eyebrow}{focus.meta ? ` · ${focus.meta}` : ''}</span>
              <span className="cos-focus-title">{focus.title}</span>
              {focus.subtitle && <span className="cos-focus-sub">{focus.subtitle}</span>}
            </div>
            <span className="cos-focus-cta">{focus.ctaLabel} →</span>
          </button>
        </section>
      )}

      {/* 2 — AI Recommended Actions */}
      {recActions.length > 0 && (
        <section className="cos-section">
          <h2 className="cos-section-title">Recommended next steps</h2>
          <div className="cos-rec-list">
            {recActions.map(rec => (
              <button
                key={rec.id}
                className="cos-rec"
                onClick={() => rec.job_id ? onSelectJob?.(rec.job_id) : onOpenBoard?.()}
              >
                <div className="cos-rec-main">
                  <span className="cos-rec-title">{rec.title}</span>
                  {rec.reason && <span className="cos-rec-reason">{rec.reason}</span>}
                </div>
                <span className="cos-rec-chevron" aria-hidden="true">→</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 3 — Continue Where You Left Off (background work visible) */}
      {continueItems.length > 0 && (
        <section className="cos-section">
          <h2 className="cos-section-title">Continue where you left off</h2>
          <div className="cos-continue-list">
            {continueItems.map(item => (
              <button
                key={item.jobId}
                className="cos-continue"
                onClick={() => onSelectJob?.(item.jobId)}
              >
                <span className={`cos-continue-icon${item.live ? ' cos-spin' : ''}`} aria-hidden="true">
                  {item.icon}
                </span>
                <span className="cos-continue-body">
                  <span className="cos-continue-title">{item.title}</span>
                  <span className="cos-continue-status">{item.status}</span>
                </span>
                {item.live && <span className="cos-working" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 4 — Recent Activity (meaningful events, not metrics) */}
      {activity.length > 0 && (
        <section className="cos-section">
          <h2 className="cos-section-title">Recent activity</h2>
          <ul className="cos-activity">
            {activity.map(a => (
              <li key={a.id} className="cos-activity-item">
                <span className="cos-activity-icon" aria-hidden="true">{a.icon}</span>
                <span className="cos-activity-text">{a.text}</span>
                <span className="cos-activity-when">{a.when}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Calm empty state — reduce anxiety, don't manufacture urgency */}
      {hasNothing && (
        <section className="cos-empty">
          <div className="cos-empty-icon" aria-hidden="true">🌤️</div>
          <h2>You're all caught up</h2>
          <p>No pressing actions right now. Add a job and Job Maker will start working on it for you.</p>
          <button className="btn btn-primary" onClick={() => onAddJob?.()}>Add a job</button>
        </section>
      )}

      {loaded && jobs.length > 0 && (
        <button className="cos-board-link" onClick={() => onOpenBoard?.()}>
          View all jobs →
        </button>
      )}
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}
