import React, { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowRight, BookOpen, Brain, Calendar, Check, ChevronRight, Clock,
  FileText, Hourglass, Loader2, Mail, PenLine, Phone, Plus, Sparkles,
  Sunrise, Target,
} from 'lucide-react'
import CompanyLogo from './CompanyLogo.jsx'
import { api } from '../api.js'
import {
  deriveTodaysFocus,
  deriveContinueItems,
  deriveRecentActivity,
} from '../lib/careerOsSignals.js'

// Career OS Home — answers one question: "What should I do next?"
// It is guidance-first, not a metrics dashboard. Quick Add lives in the
// existing bottom-nav FAB, so there is no permanent add section here.

const ICONS = {
  arrow: ArrowRight, book: BookOpen, brain: Brain, calendar: Calendar,
  check: Check, clock: Clock, file: FileText, hourglass: Hourglass,
  mail: Mail, pen: PenLine, phone: Phone, plus: Plus, target: Target,
}

function SignalIcon({ name, size = 18 }) {
  const Icon = ICONS[name] || Sparkles
  return <Icon size={size} strokeWidth={2} aria-hidden="true" />
}

// Company logo with a small status/type badge overlaid in the corner —
// the logo says which company, the badge says what kind of step it is.
function JobAvatar({ job, size = 'sm', badge, live, tone = 'default' }) {
  return (
    <span className="cos-avatar">
      <CompanyLogo company={job.company} size={size} logoUrl={job.logo_url} />
      {(badge || live) && (
        <span className={`cos-avatar-badge is-${tone}`}>
          {live
            ? <Loader2 size={10} className="cos-spin" aria-hidden="true" />
            : <SignalIcon name={badge} size={10} />}
        </span>
      )}
    </span>
  )
}

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
  const reduceMotion = useReducedMotion()

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

  const jobById = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs])
  const focusJob = focus?.jobId ? jobById.get(focus.jobId) : null

  // Recommendations for the list — drop the one already promoted to focus.
  const recActions = recommendations
    .filter(r => !(focus && focus.kind === 'recommendation' && focus.title === r.title))
    .slice(0, 3)

  const greeting = getGreeting()
  const analyzingCount = generatingJobIds.size || 0
  const hasNothing = loaded && !focus && continueItems.length === 0 && recActions.length === 0

  const openFocus = () => {
    if (!focus) return
    if (focus.jobId) onSelectJob?.(focus.jobId)
    else if (focus.kind === 'event') onOpenNotifications?.()
  }

  const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.06 } },
  }
  const rise = {
    hidden: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14 },
    visible: reduceMotion
      ? { opacity: 1, transition: { duration: 0.2 } }
      : { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 32 } },
  }

  return (
    <div className="cos-home">
      <header className="cos-greeting">
        <h1>{greeting}{userName ? `, ${userName}` : ''}</h1>
        {analyzingCount > 0 ? (
          <p className="cos-sub">
            <span className="cos-live-dot" aria-hidden="true" />
            Working on {analyzingCount} job{analyzingCount > 1 ? 's' : ''} for you in the background
          </p>
        ) : (
          <p className="cos-sub">Here's what matters right now.</p>
        )}
      </header>

      {!loaded ? (
        <HomeSkeleton />
      ) : (
        <motion.div className="cos-sections" variants={stagger} initial="hidden" animate="visible">
          {/* 1 — Today's Focus (single primary action) */}
          {focus && (
            <motion.section className="cos-section" variants={rise}>
              <h2 className="cos-section-title">Today's Focus</h2>
              <button className="cos-focus" onClick={openFocus}>
                <div className="cos-focus-top">
                  {focusJob ? (
                    <JobAvatar
                      job={focusJob}
                      size="md"
                      badge={focus.icon}
                      tone={focus.urgent ? 'urgent' : 'primary'}
                    />
                  ) : (
                    <div className={`cos-focus-icon${focus.urgent ? ' is-urgent' : ''}`}>
                      <SignalIcon name={focus.icon} size={20} />
                    </div>
                  )}
                  <div className="cos-focus-body">
                    <span className={`cos-focus-eyebrow${focus.urgent ? ' is-urgent' : ''}`}>
                      {focus.eyebrow}{focus.meta ? ` · ${focus.meta}` : ''}
                    </span>
                    <span className="cos-focus-title">{focus.title}</span>
                    {focus.subtitle && <span className="cos-focus-sub">{focus.subtitle}</span>}
                  </div>
                </div>
                <span className="cos-focus-cta">
                  {focus.ctaLabel}
                  <ArrowRight size={15} strokeWidth={2.2} aria-hidden="true" />
                </span>
              </button>
            </motion.section>
          )}

          {/* 2 — AI Recommended Actions */}
          {recActions.length > 0 && (
            <motion.section className="cos-section" variants={rise}>
              <h2 className="cos-section-title">Recommended next steps</h2>
              <div className="cos-list">
                {recActions.map(rec => {
                  const recJob = rec.job_id ? jobById.get(rec.job_id) : null
                  return (
                    <button
                      key={rec.id}
                      className="cos-row"
                      onClick={() => rec.job_id ? onSelectJob?.(rec.job_id) : onOpenBoard?.()}
                    >
                      {recJob && <JobAvatar job={recJob} />}
                      <div className="cos-row-main">
                        <span className="cos-row-title">{rec.title}</span>
                        {rec.reason && <span className="cos-row-sub">{rec.reason}</span>}
                      </div>
                      <ChevronRight size={16} className="cos-row-chevron" aria-hidden="true" />
                    </button>
                  )
                })}
              </div>
            </motion.section>
          )}

          {/* 3 — Continue Where You Left Off (background work visible) */}
          {continueItems.length > 0 && (
            <motion.section className="cos-section" variants={rise}>
              <h2 className="cos-section-title">Continue where you left off</h2>
              <div className="cos-list">
                {continueItems.map(item => {
                  const itemJob = jobById.get(item.jobId)
                  return (
                    <button
                      key={item.jobId}
                      className="cos-row"
                      onClick={() => onSelectJob?.(item.jobId)}
                    >
                      {itemJob ? (
                        <JobAvatar
                          job={itemJob}
                          badge={item.icon}
                          live={item.live}
                          tone={item.live ? 'primary' : 'default'}
                        />
                      ) : (
                        <span className={`cos-row-icon${item.live ? ' is-live' : ''}`}>
                          {item.live
                            ? <Loader2 size={16} className="cos-spin" aria-hidden="true" />
                            : <SignalIcon name={item.icon} size={16} />}
                        </span>
                      )}
                      <span className="cos-row-main">
                        <span className="cos-row-title">{item.title}</span>
                        <span className="cos-row-sub">{item.status}</span>
                      </span>
                      {item.live
                        ? <span className="cos-working" aria-hidden="true" />
                        : <ChevronRight size={16} className="cos-row-chevron" aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
            </motion.section>
          )}

          {/* 4 — Recent Activity (meaningful events, not metrics) */}
          {activity.length > 0 && (
            <motion.section className="cos-section" variants={rise}>
              <h2 className="cos-section-title">Recent activity</h2>
              <ul className="cos-activity">
                {activity.map(a => (
                  <li key={a.id} className="cos-activity-item">
                    <span className="cos-activity-rail">
                      <span className="cos-activity-dot"><SignalIcon name={a.icon} size={12} /></span>
                    </span>
                    <span className="cos-activity-text">{a.text}</span>
                    <span className="cos-activity-when">{a.when}</span>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {/* Calm empty state — reduce anxiety, don't manufacture urgency */}
          {hasNothing && (
            <motion.section className="cos-empty" variants={rise}>
              <div className="cos-empty-icon">
                <Sunrise size={26} strokeWidth={1.8} aria-hidden="true" />
              </div>
              <h2>You're all caught up</h2>
              <p>No pressing actions right now. Add a job and Job Maker will start working on it for you.</p>
              <button className="btn btn-primary cos-empty-cta" onClick={() => onAddJob?.()}>
                <Plus size={16} aria-hidden="true" />
                Add a job
              </button>
            </motion.section>
          )}

          {jobs.length > 0 && (
            <motion.button className="cos-board-link" variants={rise} onClick={() => onOpenBoard?.()}>
              View all {jobs.length} job{jobs.length > 1 ? 's' : ''}
              <ArrowRight size={14} aria-hidden="true" />
            </motion.button>
          )}
        </motion.div>
      )}
    </div>
  )
}

function HomeSkeleton() {
  return (
    <div className="cos-sections" aria-hidden="true">
      <div className="cos-section">
        <div className="cos-skel cos-skel-label" />
        <div className="cos-skel cos-skel-hero" />
      </div>
      <div className="cos-section">
        <div className="cos-skel cos-skel-label" />
        <div className="cos-skel cos-skel-row" />
        <div className="cos-skel cos-skel-row" />
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}
