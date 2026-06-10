import React, { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'
import { trackWin } from '../lib/winTracker.js'
import JobForm from './JobForm.jsx'
import MatchAnalysis from './MatchAnalysis.jsx'
import CompanyLogo from './CompanyLogo.jsx'
import ReminderPanel from './ReminderPanel.jsx'
import { getNextAction, getFollowUp, getTimeline } from './nextAction.js'
import ResumeTab from './ResumeTab.jsx'
import InterviewTab from './InterviewTab.jsx'
import EmailBodyModal from './EmailBodyModal.jsx'

const PALETTE = ['#6b7280', '#4f6ef7', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1']

function formatEventDate(iso) {
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

export default function JobDetail({ jobId, columns = [], initialTab, onBack, onRefresh, onJobScoreUpdate, isPanel = false }) {
  const [job, setJob] = useState(null)
  const [editing, setEditing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState(initialTab || 'analysis')
  const [jobReminders, setJobReminders] = useState([])
  const [liveScore, setLiveScore] = useState(null)
  const [hiringEvents, setHiringEvents] = useState([])
  const [emailModal, setEmailModal] = useState(null) // { emailId, event, classification }
  const touchStartX = useRef(null)

  const load = async () => {
    const data = await api.getJob(jobId)
    if (typeof data.interview_prep_ai === 'string' && data.interview_prep_ai) {
      try { data.interview_prep_ai = JSON.parse(data.interview_prep_ai) } catch {}
    }
    setJob(data)
    const breakdown = data.score_breakdown || []
    const overrides = data.score_breakdown_overrides || {}
    if (breakdown.length > 0) {
      const deducted = breakdown.reduce((sum, item, i) => {
        const status = overrides[i] ?? item.status
        return status === 'met' ? sum : sum + (Number(item.points_deducted) || 0)
      }, 0)
      setLiveScore(Math.max(0, 100 - deducted))
    } else {
      setLiveScore(data.match_score)
    }
    return data
  }

  const loadReminders = async () => {
    try { const r = await api.getReminders(jobId); setJobReminders(r) } catch {}
  }

  const loadHiringEvents = async () => {
    try {
      const e = await api.getHiringEventsForJob(jobId)
      setHiringEvents(e)
      return e
    } catch { return [] }
  }

  useEffect(() => {
    loadReminders()
    Promise.all([load(), loadHiringEvents()]).then(([jobData, events]) => {
      // Fix B: clear stale has_unread_event — fires when all events were dismissed
      // externally (e.g. via Notifications panel) and the clearing logic didn't reach
      // this job (e.g. matched_job_id was null). The red dot would otherwise be permanent.
      if (jobData?.has_unread_event && events.length === 0) {
        api.clearJobUnreadEvent(jobId).catch(() => {})
        setJob(prev => prev ? { ...prev, has_unread_event: false } : prev)
        onRefresh()
      }
    }).catch(() => {})
  }, [jobId])

  const analyze = async () => {
    setAnalyzing(true); setError(null)
    try { const updated = await api.analyzeJob(jobId); setJob(updated); trackWin('analyzed') }
    catch (err) { setError(err.message) }
    setAnalyzing(false)
  }

  const exportResume = () => {
    window.open(api.exportResume(jobId), '_blank')
  }

  const updateStatus = async (status) => {
    const updated = await api.updateJob(jobId, { status })
    setJob(updated); onRefresh()
    if (/applied/i.test(status)) trackWin('applied')
  }

  const handleEventMove = async (event) => {
    await api.updateJob(jobId, { status: event.suggested_stage })
    await api.markEventStatus(event.id, 'acted', 'moved_to_stage')
    const remaining = hiringEvents.filter(e => e.id !== event.id && e.status === 'pending')
    if (remaining.length === 0) await api.clearJobUnreadEvent(jobId)
    await load(); await loadHiringEvents(); onRefresh()
  }

  const handleEventReview = async (eventId) => {
    await api.markEventStatus(eventId, 'reviewed')
    const updated = hiringEvents.map(e => e.id === eventId ? { ...e, status: 'reviewed' } : e)
    setHiringEvents(updated)
    if (!updated.some(e => e.status === 'pending')) {
      await api.clearJobUnreadEvent(jobId); onRefresh()
    }
  }

  const handleEventDismiss = async (eventId) => {
    await api.markEventStatus(eventId, 'dismissed')
    const updated = hiringEvents.filter(e => e.id !== eventId)
    setHiringEvents(updated)
    if (!updated.some(e => e.status === 'pending')) {
      await api.clearJobUnreadEvent(jobId); onRefresh()
    }
  }

  const updateNotes = async (field, value) => {
    const updated = await api.updateJob(jobId, { [field]: value })
    setJob(updated)
  }

  const handleDelete = async () => {
    if (!confirm('Delete this job?')) return
    await api.deleteJob(jobId)
    onRefresh()
    onBack()
  }

  const pendingEventCount = hiringEvents.filter(e => e.status === 'pending').length

  if (!job) return <div className="loading">Loading...</div>

  if (editing) {
    return (
      <JobForm
        initial={job}
        onSave={async (data) => {
          await api.updateJob(jobId, data)
          setEditing(false); load(); onRefresh()
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className="job-detail">
      <div className="detail-header">
        {!isPanel && <button className="btn btn-ghost" onClick={onBack}>&larr; Back</button>}
        <div className="detail-actions">
          <button className="btn btn-secondary" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      <div className="detail-hero">
        <CompanyLogo
          company={job.company}
          size="lg"
          logoUrl={job.logo_url}
          editable
          onLogoChange={async (url) => {
            const updated = await api.updateJob(jobId, { logo_url: url })
            setJob(updated)
            onRefresh()
          }}
        />
        <div className="detail-hero-info">
          <div className="detail-title">
            <div>
              <h2>{job.role}</h2>
              <span className="company-name">{job.company}</span>
              {job.company_industry && <span className="industry"> &middot; {job.company_industry}</span>}
              {job.company_size && <span className="size"> &middot; {job.company_size}</span>}
            </div>
            <div className="detail-meta">
              {liveScore != null && (
                <div className={`score-big ${liveScore >= 70 ? 'high' : liveScore >= 40 ? 'mid' : 'low'}`}>
                  {liveScore}%<small>match</small>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {job.company_overview && <p className="company-overview">{job.company_overview}</p>}

      {job.contact_name && (
        <div className="contact-card">
          <div className="contact-card-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div className="contact-card-info">
            <span className="contact-card-name">{job.contact_name}</span>
            {job.contact_role && <span className="contact-card-role">{job.contact_role}</span>}
          </div>
          <div className="contact-card-links">
            {job.contact_email && (
              <a href={`mailto:${job.contact_email}`} className="contact-link" title={job.contact_email}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </a>
            )}
            {job.contact_linkedin && (
              <a href={job.contact_linkedin} target="_blank" rel="noopener noreferrer" className="contact-link" title="LinkedIn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
            )}
          </div>
        </div>
      )}

      <div className="status-row">
        <div className="status-pipeline">
          {columns.map((col, i) => (
            <button
              key={col.id}
              className={`pipeline-step ${job.status === col.name ? 'active' : ''}`}
              style={job.status === col.name ? { background: PALETTE[i % PALETTE.length] } : {}}
              onClick={() => updateStatus(col.name)}
            >{col.name}</button>
          ))}
        </div>
        <div className="source-info">
          {job.source}
          {job.link && <a href={job.link} target="_blank" rel="noopener noreferrer" className="job-link">View Post &rarr;</a>}
        </div>
      </div>

      <div className="detail-tabs">
        {[
          { key: 'analysis', label: 'Analysis', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
          { key: 'reminders', label: 'Reminders & Updates', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>, badge: pendingEventCount },
          { key: 'resume', label: 'Resume', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
          { key: 'interview', label: 'Interview', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
          { key: 'description', label: 'Description', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg> },
          { key: 'notes', label: 'Notes', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> },
        ].map(({ key, label, icon, badge = 0 }) => (
          <button key={key} className={`detail-tab-btn ${activeTab === key ? 'active' : ''}`} onClick={() => setActiveTab(key)}>
            <span className="detail-tab-icon" style={{ position: 'relative' }}>
              {icon}
              {badge > 0 && <span className="tab-event-badge">{badge}</span>}
            </span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div
        className="detail-content"
        onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
        onTouchEnd={e => {
          if (touchStartX.current === null) return
          const delta = e.changedTouches[0].clientX - touchStartX.current
          const TABS = ['analysis', 'reminders', 'resume', 'interview', 'description', 'notes']
          if (Math.abs(delta) > 60) {
            const idx = TABS.indexOf(activeTab)
            if (delta < 0 && idx < TABS.length - 1) setActiveTab(TABS[idx + 1])
            if (delta > 0 && idx > 0) setActiveTab(TABS[idx - 1])
          }
          touchStartX.current = null
        }}
      >
        {/* Cross-tab pending event notice — visible on all tabs except analysis/reminders */}
        {activeTab !== 'analysis' && activeTab !== 'reminders' && pendingEventCount > 0 && (
          <button className="cross-tab-event-notice" onClick={() => setActiveTab('reminders')}>
            <span className="cross-tab-event-dot" />
            {pendingEventCount === 1 ? 'New Gmail update' : `${pendingEventCount} new Gmail updates`}
            {' '}— see Reminders &amp; Updates
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4, flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        )}

        {/* ── Analysis Tab ── */}
        {activeTab === 'analysis' && (
          <div className="analysis-tab">
            {/* Fix A+C: when updates exist but all are reviewed, tell the user where to find them */}
            {pendingEventCount === 0 && hiringEvents.length > 0 && (
              <button className="reviewed-updates-notice" onClick={() => setActiveTab('reminders')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                {hiringEvents.length === 1 ? '1 email update' : `${hiringEvents.length} email updates`} reviewed — view history in Reminders &amp; Updates
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            )}

            {/* Hiring event banners — pending events for this job */}
            {hiringEvents.filter(e => e.status === 'pending').map(event => {
              const cls = event.email_classifications
              const stageExists = event.suggested_stage && columns.some(c => c.name === event.suggested_stage)
              return (
                <div key={event.id} className="job-event-banner">
                  <div className="job-event-banner-header">
                    <span className="job-event-banner-dot" />
                    <span className="job-event-banner-label">New Gmail update detected</span>
                    <span className="job-event-banner-time">
                      {event.created_at
                        ? new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : ''}
                    </span>
                  </div>
                  <div className="job-event-banner-title">{event.title}</div>
                  {cls?.summary && (
                    <div className="job-event-banner-summary">{cls.summary}</div>
                  )}
                  <div className="job-event-banner-source">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                      <polyline points="22,6 12,13 2,6"/>
                    </svg>
                    via Gmail
                    {cls?.from_address && <span className="job-event-banner-from"> · {cls.from_address}</span>}
                  </div>
                  <div className="job-event-banner-actions">
                    {stageExists && (
                      <button className="btn btn-primary btn-sm" onClick={() => handleEventMove(event)}>
                        Move to {event.suggested_stage}
                      </button>
                    )}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setEmailModal({ emailId: event.email_id, event, classification: cls })}
                    >
                      View Email
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleEventReview(event.id)}>
                      Keep here
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleEventDismiss(event.id)}>
                      Dismiss
                    </button>
                  </div>
                </div>
              )
            })}

            {(() => {
              const fu = getFollowUp(job)
              return fu.shouldFollowUp ? (
                <div className="followup-banner">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  No activity for {fu.daysSinceLastAction} days — consider following up
                </div>
              ) : null
            })()}

            {(() => {
              const stages = getTimeline(job)
              return (
                <div className="job-timeline">
                  {stages.map((stage, i) => (
                    <div key={stage.key} className={`timeline-stage ${stage.completed ? 'completed' : ''} ${stage.current ? 'current' : ''}`}>
                      <div className="timeline-dot">{stage.completed ? '✓' : (i + 1)}</div>
                      {i < stages.length - 1 && <div className={`timeline-line ${stages[i + 1].completed ? 'completed' : ''}`} />}
                      <span className="timeline-label">{stage.label}</span>
                    </div>
                  ))}
                </div>
              )
            })()}

            {(job.department || job.industry) && (
              <div className="tags detail-tags">
                {job.department && <span className="tag tag-dept">{job.department}</span>}
                {job.industry && <span className="tag tag-industry">{job.industry}</span>}
              </div>
            )}

            {(() => {
              const na = getNextAction(job, jobReminders)
              return (
                <div className={`next-step-block next-step-${na.priority}`}>
                  <div className="next-step-content">
                    <span className="next-step-label">Recommended Next Step</span>
                    <span className="next-step-action">{na.action}</span>
                    <span className="next-step-reason">{na.reason}</span>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab(na.tab)}>
                    Go to {na.tab === 'analysis' ? 'Analysis' : na.tab === 'resume' ? 'Resume' : na.tab === 'interview' ? 'Interview Prep' : na.tab === 'notes' ? 'Notes' : na.tab}
                  </button>
                </div>
              )
            })()}

            {!job.description && (
              <div className="info-banner">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                No job description added — AI analysis will be limited. <button className="inline-link" onClick={() => setEditing(true)}>Edit this job</button> to paste the full description for a better match score.
              </div>
            )}
            <button className="btn btn-primary analyze-btn" onClick={analyze} disabled={analyzing}>
              {analyzing ? 'Analyzing...' : job.match_score != null ? 'Re-analyze with AI' : 'Analyze with AI'}
            </button>
            {job.summary && <div className="summary-block"><h4>Summary</h4><p>{job.summary}</p></div>}
            {(job.requirements_met?.length > 0 || job.requirements_partial?.length > 0 || job.requirements_unmet?.length > 0) && (
              <MatchAnalysis job={job} onScoreUpdate={(score) => {
                setLiveScore(score)
                if (onJobScoreUpdate) onJobScoreUpdate(job.id, score)
              }} />
            )}
            {job.positioning_tips && (
              <div className="tips-block">
                <h4>Positioning Tips</h4>
                {(() => {
                  let tips = job.positioning_tips
                  if (typeof tips === 'string') {
                    try { tips = JSON.parse(tips) } catch { tips = [tips] }
                  }
                  return Array.isArray(tips)
                    ? <ul>{tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
                    : <p>{tips}</p>
                })()}
              </div>
            )}
          </div>
        )}

        {/* ── Reminders & Updates Tab ── */}
        {activeTab === 'reminders' && (
          <div className="reminders-updates-tab">
            <ReminderPanel jobId={jobId} />

            <div className="reminders-email-section">
              <div className="reminders-section-divider">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                Gmail Updates
                {pendingEventCount > 0 && (
                  <span className="section-pending-badge">{pendingEventCount} new</span>
                )}
              </div>

              {/* Pending events — full banner with actions */}
              {hiringEvents.filter(e => e.status === 'pending').map(event => {
                const cls = event.email_classifications
                const stageExists = event.suggested_stage && columns.some(c => c.name === event.suggested_stage)
                return (
                  <div key={event.id} className="job-event-banner">
                    <div className="job-event-banner-header">
                      <span className="job-event-banner-dot" />
                      <span className="job-event-banner-label">New Gmail update</span>
                      {event.created_at && (
                        <span className="job-event-banner-time">{formatEventDate(event.created_at)}</span>
                      )}
                    </div>
                    {event.title && <div className="job-event-banner-title">{event.title}</div>}
                    {cls?.summary && <div className="job-event-banner-summary">{cls.summary}</div>}
                    {cls?.from_address && (
                      <div className="job-event-banner-source">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        <span className="job-event-banner-from">{cls.from_address}</span>
                      </div>
                    )}
                    <div className="job-event-banner-actions">
                      {stageExists && (
                        <button className="btn btn-primary btn-sm" onClick={() => handleEventMove(event)}>
                          Move to {event.suggested_stage}
                        </button>
                      )}
                      {event.email_id && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setEmailModal({ emailId: event.email_id, event, classification: cls })}>
                          View Email
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => handleEventReview(event.id)}>Mark reviewed</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleEventDismiss(event.id)}>Dismiss</button>
                    </div>
                  </div>
                )
              })}

              {/* Past events — compact history */}
              {hiringEvents.filter(e => e.status !== 'pending').length > 0 && (
                <div className="event-history-section">
                  <div className="event-history-label">Past Updates</div>
                  {hiringEvents.filter(e => e.status !== 'pending').map(event => (
                    <div key={event.id} className="event-history-item">
                      <div className="event-history-title">{event.title || event.event_type}</div>
                      <div className="event-history-meta">
                        <span className={`event-history-status event-status-${event.status}`}>
                          {event.status === 'acted' ? 'acted on' : event.status}
                        </span>
                        <span className="event-history-time">{formatEventDate(event.created_at)}</span>
                        {event.email_id && (
                          <button
                            className="btn btn-ghost btn-xs"
                            onClick={() => setEmailModal({ emailId: event.email_id, event, classification: event.email_classifications })}
                          >
                            View
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {hiringEvents.length === 0 && (
                <div className="event-empty-state">
                  <p>No Gmail activity for this job yet.</p>
                  <p className="muted">When you receive emails about this application, they'll appear here.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Resume Tab ── */}
        {activeTab === 'resume' && (
          <ResumeTab job={job} setJob={setJob} jobId={jobId} />
        )}

        {/* ── Interview Prep Tab ── */}
        {activeTab === 'interview' && (
          <InterviewTab job={job} setJob={setJob} jobId={jobId} />
        )}

        {/* ── Description Tab ── */}
        {activeTab === 'description' && (
          <div className="description-tab">
            {job.description ? (
              <pre className="description-text">{job.description}</pre>
            ) : (
              <p className="muted">No description added. Edit this job to paste the job description.</p>
            )}
          </div>
        )}

        {/* ── Notes Tab ── */}
        {activeTab === 'notes' && (
          <div className="notes-tab">
            <textarea
              className="notes-textarea"
              value={job.notes || ''}
              onChange={e => setJob({ ...job, notes: e.target.value })}
              onBlur={e => updateNotes('notes', e.target.value)}
              placeholder="Add your notes here... thoughts, contacts, timeline, etc."
              rows={12}
            />
          </div>
        )}
      </div>

      {emailModal && (
        <EmailBodyModal
          emailId={emailModal.emailId}
          event={emailModal.event}
          classification={emailModal.classification}
          onClose={() => setEmailModal(null)}
        />
      )}
    </div>
  )
}
