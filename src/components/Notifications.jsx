import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { api } from '../api.js'

const EVENT_META = {
  offer:                    { label: 'Offer',         color: '#10b981', bg: '#f0fdf4' },
  interview_invite:         { label: 'Interview',     color: '#4f6ef7', bg: '#eff6ff' },
  interview_scheduled:      { label: 'Interview',     color: '#4f6ef7', bg: '#eff6ff' },
  interview_rescheduled:    { label: 'Rescheduled',  color: '#f59e0b', bg: '#fffbeb' },
  technical_assignment:     { label: 'Assignment',   color: '#8b5cf6', bg: '#faf5ff' },
  take_home_assignment:     { label: 'Assignment',   color: '#8b5cf6', bg: '#faf5ff' },
  rejection:                { label: 'Rejection',    color: '#ef4444', bg: '#fef2f2' },
  position_closed:          { label: 'Closed',       color: '#64748b', bg: '#f8fafc' },
  process_cancelled:        { label: 'Cancelled',    color: '#64748b', bg: '#f8fafc' },
  recruiter_response:       { label: 'Recruiter',    color: '#06b6d4', bg: '#ecfeff' },
  follow_up_received:       { label: 'Follow-up',    color: '#f97316', bg: '#fff7ed' },
  offer_discussion:         { label: 'Offer',        color: '#10b981', bg: '#f0fdf4' },
  salary_discussion:        { label: 'Salary',       color: '#10b981', bg: '#f0fdf4' },
  reference_request:        { label: 'References',   color: '#8b5cf6', bg: '#faf5ff' },
  application_confirmation: { label: 'Applied',      color: '#94a3b8', bg: '#f8fafc' },
  application_sent:         { label: 'Applied',      color: '#94a3b8', bg: '#f8fafc' },
  follow_up_sent:           { label: 'Follow-up',    color: '#94a3b8', bg: '#f8fafc' },
  networking_outreach:      { label: 'Networking',   color: '#94a3b8', bg: '#f8fafc' },
  other:                    { label: 'Update',       color: '#94a3b8', bg: '#f8fafc' },
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function groupByDate(events) {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const yest = new Date(now); yest.setDate(yest.getDate() - 1)
  const yesterdayStr = yest.toISOString().slice(0, 10)
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7)

  const today    = events.filter(e => e.created_at?.slice(0, 10) === todayStr)
  const yesterday = events.filter(e => e.created_at?.slice(0, 10) === yesterdayStr)
  const thisWeek = events.filter(e => {
    const d = new Date(e.created_at)
    return d > weekAgo && e.created_at?.slice(0, 10) !== todayStr && e.created_at?.slice(0, 10) !== yesterdayStr
  })
  const older = events.filter(e => new Date(e.created_at) <= weekAgo)

  return [
    { label: 'Today', items: today },
    { label: 'Yesterday', items: yesterday },
    { label: 'This Week', items: thisWeek },
    { label: 'Earlier', items: older },
  ].filter(g => g.items.length > 0)
}

const TRIGGER_LABELS = {
  app_load: 'App load',
  tab_visible: 'Tab visible',
  manual: 'Manual',
  auto: 'Auto',
}

function SyncStatusFooter({ syncInfo, onCheckUpdates }) {
  const [syncing, setSyncing] = useState(false)

  const handleCheck = async () => {
    setSyncing(true)
    try { await onCheckUpdates() } finally { setSyncing(false) }
  }

  return (
    <div className="notifications-sync-footer">
      <div className="notifications-sync-grid">
        <div className="sync-stat">
          <span className="sync-stat-label">Last sync</span>
          <span className="sync-stat-value">
            {syncInfo?.time
              ? syncInfo.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '—'}
          </span>
        </div>
        <div className="sync-stat">
          <span className="sync-stat-label">Status</span>
          <span className={`sync-stat-value sync-status-${syncInfo?.status ?? 'unknown'}`}>
            {syncInfo?.status === 'success' && 'Success'}
            {syncInfo?.status === 'skipped' && `Skipped (throttled)`}
            {syncInfo?.status === 'failed' && 'Failed'}
            {!syncInfo?.status && '—'}
          </span>
        </div>
        <div className="sync-stat">
          <span className="sync-stat-label">Trigger</span>
          <span className="sync-stat-value">
            {syncInfo?.trigger ? TRIGGER_LABELS[syncInfo.trigger] ?? syncInfo.trigger : '—'}
          </span>
        </div>
        <div className="sync-stat">
          <span className="sync-stat-label">Emails scanned</span>
          <span className="sync-stat-value">
            {syncInfo?.status === 'success' ? (syncInfo.emailsScanned ?? 0) : '—'}
          </span>
        </div>
        <div className="sync-stat">
          <span className="sync-stat-label">Events created</span>
          <span className="sync-stat-value">
            {syncInfo?.status === 'success' ? (syncInfo.eventsCreated ?? 0) : '—'}
          </span>
        </div>
      </div>
      {syncInfo?.status === 'skipped' && syncInfo?.minutesSince != null && (
        <p className="sync-throttle-note">
          Last sync was {syncInfo.minutesSince}m ago. Server checks every 15 minutes.
        </p>
      )}
      {syncInfo?.error && (
        <p className="sync-error-note">{syncInfo.error}</p>
      )}
      <button className="btn btn-secondary btn-sm sync-check-btn" onClick={handleCheck} disabled={syncing}>
        {syncing ? 'Checking…' : 'Check for updates'}
      </button>
    </div>
  )
}

export default function Notifications({ onClose, onSelectJob, onCountChange, onRefresh, syncInfo, onCheckUpdates }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [recommendations, setRecommendations] = useState([])
  const [recsExpanded, setRecsExpanded] = useState(true)

  useEffect(() => {
    load()
    api.getRecommendations().then(setRecommendations).catch(() => {})
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('hiring_events')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'dismissed')
        .order('created_at', { ascending: false })
        .limit(100)
      setEvents(data || [])
    } catch (err) {
      console.error('Notifications load error:', err)
    }
    setLoading(false)
  }

  const markReviewed = useCallback(async (id) => {
    const event = events.find(e => e.id === id)
    setEvents(prev => prev.map(e => e.id === id ? { ...e, status: 'reviewed' } : e))
    const pendingCount = events.filter(e => e.status === 'pending' && e.id !== id).length
    onCountChange && onCountChange(pendingCount)
    await supabase.from('hiring_events').update({ status: 'reviewed' }).eq('id', id)
    // Clear the kanban card dot if no more pending events for this job
    if (event?.matched_job_id) {
      const stillPending = events.some(e => e.id !== id && e.status === 'pending' && e.matched_job_id === event.matched_job_id)
      if (!stillPending) {
        await supabase.from('jobs').update({ has_unread_event: false }).eq('id', event.matched_job_id)
        onRefresh && onRefresh()
      }
    }
  }, [events, onCountChange, onRefresh])

  const dismiss = useCallback(async (id) => {
    const event = events.find(e => e.id === id)
    const wasPending = event?.status === 'pending'
    setEvents(prev => prev.filter(e => e.id !== id))
    if (wasPending) {
      const pendingCount = events.filter(e => e.status === 'pending' && e.id !== id).length
      onCountChange && onCountChange(pendingCount)
    }
    await supabase.from('hiring_events').update({ status: 'dismissed' }).eq('id', id)
    // Clear the kanban card dot if this was the last pending event for the job
    if (wasPending && event?.matched_job_id) {
      const stillPending = events.some(e => e.id !== id && e.status === 'pending' && e.matched_job_id === event.matched_job_id)
      if (!stillPending) {
        await supabase.from('jobs').update({ has_unread_event: false }).eq('id', event.matched_job_id)
        onRefresh && onRefresh()
      }
    }
  }, [events, onCountChange, onRefresh])

  const dismissRec = useCallback(async (id) => {
    setRecommendations(prev => prev.filter(r => r.id !== id))
    await api.dismissRecommendation(id).catch(() => {})
  }, [])

  const visible = events.filter(e => e.status !== 'dismissed')
  const groups = groupByDate(visible)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal notifications-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Hiring Activity</h3>
          <button className="btn btn-ghost" onClick={onClose}>&times;</button>
        </div>

        {/* Coach Suggestions — shown above events when active recommendations exist */}
        {recommendations.length > 0 && (
          <div className="notif-recs-section">
            <button className="notif-recs-header" onClick={() => setRecsExpanded(x => !x)}>
              <span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.35rem', verticalAlign: 'middle' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Coach Suggestions
              </span>
              <span className="notif-recs-count">
                {recommendations.length}
                <span className="notif-recs-chevron">{recsExpanded ? ' ▲' : ' ▼'}</span>
              </span>
            </button>
            {recsExpanded && (
              <div className="notif-recs-list">
                {recommendations.slice(0, 5).map(rec => (
                  <div key={rec.id} className="notif-rec-item">
                    <div className="notif-rec-body">
                      <span className={`notif-rec-priority notif-rec-priority--${rec.priority >= 85 ? 'high' : rec.priority >= 65 ? 'mid' : 'low'}`} />
                      <div className="notif-rec-text">
                        <span
                          className="notif-rec-title"
                          onClick={() => rec.job_id && onSelectJob(rec.job_id)}
                          style={rec.job_id ? { cursor: 'pointer' } : {}}
                        >
                          {rec.title}
                        </span>
                        {rec.reason && <span className="notif-rec-reason">{rec.reason}</span>}
                      </div>
                    </div>
                    <button className="notif-rec-dismiss" onClick={() => dismissRec(rec.id)} title="Dismiss">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <p className="muted" style={{ padding: '1rem' }}>Loading…</p>
        ) : visible.length === 0 ? (
          <div className="notifications-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <p>No hiring updates yet.</p>
            <p className="muted">We'll notify you when something changes.</p>
          </div>
        ) : (
          <div className="notifications-list">
            {groups.map(group => (
              <div key={group.label} className="notifications-group">
                <div className="notifications-group-label">{group.label}</div>
                {group.items.map(event => (
                  <NotificationRow
                    key={event.id}
                    event={event}
                    onMarkReviewed={markReviewed}
                    onDismiss={dismiss}
                    onSelectJob={onSelectJob}
                    onClose={onClose}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
        <SyncStatusFooter syncInfo={syncInfo} onCheckUpdates={onCheckUpdates} />
      </div>
    </div>
  )
}

function NotificationRow({ event, onMarkReviewed, onDismiss, onSelectJob, onClose }) {
  const meta = EVENT_META[event.event_type] || EVENT_META.other
  const isPending = event.status === 'pending'
  const isLowPriority = (event.priority_score ?? 50) < 40

  const handleRowClick = () => {
    if (event.matched_job_id && onSelectJob) {
      onClose()
      onSelectJob(event.matched_job_id)
    }
  }

  return (
    <div className={[
      'notification-row',
      isPending ? 'notification-unread' : '',
      isLowPriority ? 'notification-low-priority' : '',
    ].join(' ').trim()}>
      {isPending && <div className="notification-unread-bar" />}

      <div className="notification-row-inner">
        <div className="notification-row-top">
          <span className="notification-type-badge" style={{ background: meta.bg, color: meta.color }}>
            {meta.label}
          </span>
          {isPending && <span className="notification-unread-dot" />}
          <div className="notification-row-actions">
            {isPending && (
              <button
                className="notification-action-btn"
                title="Mark as read"
                onClick={e => { e.stopPropagation(); onMarkReviewed(event.id) }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
            )}
            <button
              className="notification-action-btn notification-dismiss-btn"
              title="Dismiss"
              onClick={e => { e.stopPropagation(); onDismiss(event.id) }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <div
          className="notification-row-body"
          onClick={handleRowClick}
          style={{ cursor: event.matched_job_id ? 'pointer' : 'default' }}
        >
          <div className="notification-title">{event.title}</div>

          {(event.detected_company || event.detected_role) && (
            <div className="notification-subtitle">
              {[event.detected_company, event.detected_role].filter(Boolean).join(' · ')}
            </div>
          )}

          {event.description && (
            <div className="notification-description">{event.description}</div>
          )}

          <div className="notification-meta-row">
            <span className="notification-source">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              Gmail
            </span>
            <span className="notification-time">{relativeTime(event.created_at)}</span>
            {event.matched_job_id && (
              <span className="notification-job-hint">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2"/>
                  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                </svg>
                View job
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
