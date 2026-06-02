import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { api } from '../api.js'

const EVENT_META = {
  offer:                  { label: 'Offer',           color: '#10b981', bg: '#f0fdf4' },
  interview_invite:       { label: 'Interview',        color: '#4f6ef7', bg: '#eff6ff' },
  interview_scheduled:    { label: 'Interview',        color: '#4f6ef7', bg: '#eff6ff' },
  interview_rescheduled:  { label: 'Rescheduled',     color: '#f59e0b', bg: '#fffbeb' },
  technical_assignment:   { label: 'Assignment',      color: '#8b5cf6', bg: '#faf5ff' },
  take_home_assignment:   { label: 'Assignment',      color: '#8b5cf6', bg: '#faf5ff' },
  rejection:              { label: 'Rejection',       color: '#ef4444', bg: '#fef2f2' },
  position_closed:        { label: 'Closed',          color: '#64748b', bg: '#f8fafc' },
  process_cancelled:      { label: 'Cancelled',       color: '#64748b', bg: '#f8fafc' },
  recruiter_response:     { label: 'Recruiter',       color: '#06b6d4', bg: '#ecfeff' },
  follow_up_received:     { label: 'Follow-up',       color: '#f97316', bg: '#fff7ed' },
  offer_discussion:       { label: 'Offer',           color: '#10b981', bg: '#f0fdf4' },
  salary_discussion:      { label: 'Salary',          color: '#10b981', bg: '#f0fdf4' },
  reference_request:      { label: 'References',      color: '#8b5cf6', bg: '#faf5ff' },
  application_confirmation: { label: 'Applied',       color: '#94a3b8', bg: '#f8fafc' },
  application_sent:       { label: 'Applied',         color: '#94a3b8', bg: '#f8fafc' },
  follow_up_sent:         { label: 'Follow-up',       color: '#94a3b8', bg: '#f8fafc' },
  networking_outreach:    { label: 'Networking',      color: '#94a3b8', bg: '#f8fafc' },
  other:                  { label: 'Update',          color: '#94a3b8', bg: '#f8fafc' },
}

function groupByDate(events) {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const yest = new Date(now); yest.setDate(yest.getDate() - 1)
  const yesterdayStr = yest.toISOString().slice(0, 10)
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7)

  const groups = []
  const seen = new Set()

  const add = (label, items) => {
    if (items.length > 0) groups.push({ label, items })
  }

  const today = events.filter(e => e.created_at?.slice(0, 10) === todayStr)
  const yesterday = events.filter(e => e.created_at?.slice(0, 10) === yesterdayStr)
  const thisWeek = events.filter(e => {
    const d = new Date(e.created_at)
    return d > weekAgo && e.created_at?.slice(0, 10) !== todayStr && e.created_at?.slice(0, 10) !== yesterdayStr
  })
  const older = events.filter(e => new Date(e.created_at) <= weekAgo)

  add('Today', today)
  add('Yesterday', yesterday)
  add('This Week', thisWeek)
  add('Earlier', older)
  return groups
}

export default function Notifications({ onClose, onSelectJob, onCountChange }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('hiring_events')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)
      setEvents(data || [])

      // Mark all pending as reviewed
      const pendingIds = (data || []).filter(e => e.status === 'pending').map(e => e.id)
      if (pendingIds.length > 0) {
        await supabase
          .from('hiring_events')
          .update({ status: 'reviewed' })
          .in('id', pendingIds)
        onCountChange && onCountChange(0)
      }
    } catch (err) {
      console.error('Notifications load error:', err)
    }
    setLoading(false)
  }

  const groups = groupByDate(events)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal notifications-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Hiring Activity</h3>
          <button className="btn btn-ghost" onClick={onClose}>&times;</button>
        </div>

        {loading ? (
          <p className="muted" style={{ padding: '1rem' }}>Loading…</p>
        ) : events.length === 0 ? (
          <div className="notifications-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <p>No hiring events detected yet.</p>
            <p className="muted">Connect Gmail and run a sync to detect events.</p>
          </div>
        ) : (
          <div className="notifications-list">
            {groups.map(group => (
              <div key={group.label} className="notifications-group">
                <div className="notifications-group-label">{group.label}</div>
                {group.items.map(event => {
                  const meta = EVENT_META[event.event_type] || EVENT_META.other
                  return (
                    <div
                      key={event.id}
                      className={`notification-row ${event.status === 'pending' ? 'notification-unread' : ''}`}
                      onClick={() => event.matched_job_id && onSelectJob && onSelectJob(event.matched_job_id)}
                      style={{ cursor: event.matched_job_id ? 'pointer' : 'default' }}
                    >
                      <div className="notification-row-left">
                        <span
                          className="notification-type-badge"
                          style={{ background: meta.bg, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                        <div className="notification-row-body">
                          <div className="notification-title">{event.title}</div>
                          {(event.matched_job_id) && (
                            <div className="notification-job-hint">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                              View job
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="notification-row-right">
                        {event.status === 'pending' && <span className="notification-unread-dot" />}
                        <span className="notification-time">
                          {new Date(event.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
