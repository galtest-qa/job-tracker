import React, { useState } from 'react'
import { api } from '../api.js'
import { getReminderState, formatDue, TEMPLATES, defaultDueAt } from './reminderUtils.js'

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso) {
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

// Color per event type — used for the dot and left border accent
const EVENT_TYPE_COLOR = {
  interview_invite:      '#4f6ef7',
  interview_scheduled:   '#4f6ef7',
  interview_rescheduled: '#f59e0b',
  offer:                 '#10b981',
  offer_discussion:      '#10b981',
  salary_discussion:     '#10b981',
  rejection:             '#ef4444',
  position_closed:       '#ef4444',
  process_cancelled:     '#ef4444',
  technical_assignment:  '#8b5cf6',
  take_home_assignment:  '#8b5cf6',
  recruiter_response:    '#4f6ef7',
  application_confirmation: '#6b7280',
  follow_up_received:    '#6b7280',
  reference_request:     '#f97316',
}
function eventColor(type) { return EVENT_TYPE_COLOR[type] || '#4f6ef7' }

// ── Feed item builders ──────────────────────────────────────────────────────

function buildFeedItems(events, reminders) {
  const items = []

  for (const e of events) {
    const pending = e.status === 'pending'
    items.push({
      id: `event-${e.id}`,
      kind: 'event',
      rawId: e.id,
      data: e,
      isActive:   pending,
      isUpcoming: false,
      isHistory:  !pending,
      timestamp:  e.created_at,
      // Sort key: pending events sorted by priority_score DESC, then newer first
      activeSortKey: (e.priority_score ?? 0) * 1e13 + new Date(e.created_at ?? 0).getTime(),
    })
  }

  for (const r of reminders) {
    const state = getReminderState(r)
    const active   = state === 'overdue' || state === 'today'
    const upcoming = state === 'upcoming' || state === 'snoozed'
    const history  = state === 'completed'
    items.push({
      id: `reminder-${r.id}`,
      kind: 'reminder',
      rawId: r.id,
      data: r,
      state,
      isActive:   active,
      isUpcoming: upcoming,
      isHistory:  history,
      timestamp:  r.due_at,
      // Overdue reminders sort before today; within each, sort by due_at ASC (most urgent first)
      activeSortKey: active ? (state === 'overdue' ? 1e14 : 9e13) - new Date(r.due_at).getTime() : 0,
    })
  }

  return items
}

// ── Sub-components ──────────────────────────────────────────────────────────

function EventFeedItem({ event, columns, onMove, onReview, onDismiss, onViewEmail }) {
  const cls   = event.email_classifications
  const color = eventColor(event.event_type)
  const stageExists = event.suggested_stage && columns.some(c => c.name === event.suggested_stage)

  return (
    <div className="feed-item feed-item-event" style={{ '--feed-accent': color }}>
      <div className="feed-item-top">
        <span className="feed-item-dot" style={{ background: color }} />
        <span className="feed-item-title">{event.title}</span>
        <span className="feed-item-time">{relativeTime(event.created_at)}</span>
      </div>
      {cls?.summary && <p className="feed-item-summary">{cls.summary}</p>}
      {cls?.from_address && (
        <span className="feed-item-meta">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          {cls.from_address}
        </span>
      )}
      {event.recommendation_reason && (
        <span className="feed-item-rec">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {event.recommendation_reason}
        </span>
      )}
      <div className="feed-item-actions">
        {stageExists && (
          <button className="btn btn-primary btn-sm" onClick={() => onMove(event)}>
            Move to {event.suggested_stage}
          </button>
        )}
        {event.email_id && (
          <button className="btn btn-ghost btn-sm" onClick={() => onViewEmail(event, cls)}>
            View Email
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => onReview(event.id)}>
          Mark reviewed
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onDismiss(event.id)}>
          Dismiss
        </button>
      </div>
    </div>
  )
}

function ReminderFeedItem({ reminder, onComplete, onSnooze, onDelete, onEdit }) {
  const state = getReminderState(reminder)
  return (
    <div className={`feed-item feed-item-reminder feed-reminder-${state}`}>
      <div className="feed-item-top">
        <span className="feed-item-dot reminder-dot" />
        <span className="feed-item-title">{reminder.title}</span>
        <span className={`feed-item-due feed-due-${state}`}>{formatDue(reminder)}</span>
      </div>
      {reminder.note && <p className="feed-item-summary">{reminder.note}</p>}
      <div className="feed-item-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => onComplete(reminder)}>
          Complete
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onSnooze(reminder, 24)}>
          Snooze 1d
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onEdit(reminder)}>
          Edit
        </button>
        <button className="btn btn-ghost btn-sm btn-danger-ghost" onClick={() => onDelete(reminder.id)}>
          Delete
        </button>
      </div>
    </div>
  )
}

function EditReminderInline({ form, onChange, onSave, onCancel }) {
  return (
    <div className="feed-item feed-item-editing">
      <input
        type="text"
        value={form.title || ''}
        onChange={e => onChange({ ...form, title: e.target.value })}
        placeholder="Reminder title"
        className="reminder-input"
        autoFocus
      />
      <input
        type="datetime-local"
        value={form.due_at || ''}
        onChange={e => onChange({ ...form, due_at: e.target.value })}
        className="reminder-input reminder-date"
      />
      <input
        type="text"
        value={form.note || ''}
        onChange={e => onChange({ ...form, note: e.target.value })}
        placeholder="Note (optional)"
        className="reminder-input"
      />
      <div className="reminder-add-actions">
        <button className="btn btn-primary btn-sm" onClick={onSave}>Save</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function EventHistoryItem({ event, onViewEmail }) {
  const color = eventColor(event.event_type)
  const cls   = event.email_classifications
  return (
    <div className="feed-item feed-item-history">
      <div className="feed-item-top">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span className="feed-item-title feed-item-title-muted">{event.title || event.event_type}</span>
        <span className="feed-item-time">{relativeTime(event.created_at)}</span>
      </div>
      <div className="feed-item-history-meta">
        <span className={`feed-status-badge feed-status-${event.status}`}>
          {event.status === 'acted' ? 'acted on' : event.status}
        </span>
        {event.email_id && (
          <button className="btn btn-ghost btn-xs" onClick={() => onViewEmail(event, cls)}>
            View Email
          </button>
        )}
      </div>
    </div>
  )
}

function ReminderHistoryItem({ reminder, onComplete, onDelete }) {
  return (
    <div className="feed-item feed-item-history">
      <div className="feed-item-top">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <span className="feed-item-title feed-item-title-muted">{reminder.title}</span>
        <span className="feed-item-time">completed</span>
      </div>
      <div className="feed-item-history-meta">
        <button className="btn btn-ghost btn-xs" onClick={() => onComplete(reminder)}>Undo</button>
        <button className="btn btn-ghost btn-xs" onClick={() => onDelete(reminder.id)}>Delete</button>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function ActivityFeed({
  hiringEvents = [],
  reminders = [],
  columns = [],
  jobId,
  onEventMove,
  onEventReview,
  onEventDismiss,
  onViewEmail,
  onReminderChange,
}) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm]         = useState({ type: 'custom', title: '', due_at: defaultDueAt(), note: '' })
  const [editingId, setEditingId]     = useState(null)
  const [editForm, setEditForm]       = useState({})
  const [showHistory, setShowHistory] = useState(false)

  // ── Reminder handlers ─────────────────────────────────────────────────────

  const handleAddReminder = async () => {
    if (!addForm.title.trim()) return
    await api.createReminder(jobId, addForm)
    setAddForm({ type: 'custom', title: '', due_at: defaultDueAt(), note: '' })
    setShowAddForm(false)
    onReminderChange()
  }

  const handleApplyTemplate = (t) => {
    setAddForm({ type: t.type, title: t.title, due_at: defaultDueAt(t.offsetDays), note: '' })
    setShowAddForm(true)
  }

  const handleComplete = async (r) => {
    await api.updateReminder(r.id, { completed: r.completed ? 0 : 1 })
    onReminderChange()
  }

  const handleSnooze = async (r, hours) => {
    await api.updateReminder(r.id, { snoozed_until: new Date(Date.now() + hours * 3600000).toISOString() })
    onReminderChange()
  }

  const handleDeleteReminder = async (id) => {
    await api.deleteReminder(id)
    onReminderChange()
  }

  const handleSaveEdit = async () => {
    if (!editForm.title?.trim()) return
    await api.updateReminder(editingId, editForm)
    setEditingId(null)
    onReminderChange()
  }

  const startEdit = (r) => {
    setEditingId(r.id)
    setEditForm({ title: r.title, due_at: r.due_at?.slice(0, 16) || '', note: r.note || '' })
  }

  // ── Build and partition feed ──────────────────────────────────────────────

  const items = buildFeedItems(hiringEvents, reminders)

  const activeItems   = items
    .filter(i => i.isActive)
    .sort((a, b) => b.activeSortKey - a.activeSortKey)

  const upcomingItems = items
    .filter(i => i.isUpcoming)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

  const historyItems  = items
    .filter(i => i.isHistory)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  const isEmpty = activeItems.length === 0 && upcomingItems.length === 0 && historyItems.length === 0

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderItem = (item) => {
    if (item.kind === 'event') {
      return item.isActive ? (
        <EventFeedItem
          key={item.id}
          event={item.data}
          columns={columns}
          onMove={onEventMove}
          onReview={onEventReview}
          onDismiss={onEventDismiss}
          onViewEmail={onViewEmail}
        />
      ) : (
        <EventHistoryItem
          key={item.id}
          event={item.data}
          onViewEmail={onViewEmail}
        />
      )
    }
    if (item.kind === 'reminder') {
      if (item.isHistory) {
        return (
          <ReminderHistoryItem
            key={item.id}
            reminder={item.data}
            onComplete={handleComplete}
            onDelete={handleDeleteReminder}
          />
        )
      }
      if (editingId === item.rawId) {
        return (
          <EditReminderInline
            key={item.id}
            form={editForm}
            onChange={setEditForm}
            onSave={handleSaveEdit}
            onCancel={() => setEditingId(null)}
          />
        )
      }
      return (
        <ReminderFeedItem
          key={item.id}
          reminder={item.data}
          onComplete={handleComplete}
          onSnooze={handleSnooze}
          onDelete={handleDeleteReminder}
          onEdit={startEdit}
        />
      )
    }
    return null
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="activity-feed">
      {/* Quick-add chips */}
      <div className="activity-feed-chips">
        {TEMPLATES.map(t => (
          <button key={t.type} className="reminder-template-btn" onClick={() => handleApplyTemplate(t)}>
            + {t.title}
          </button>
        ))}
        <button className="reminder-template-btn custom" onClick={() => { setAddForm({ type: 'custom', title: '', due_at: defaultDueAt(), note: '' }); setShowAddForm(true) }}>
          + Custom
        </button>
      </div>

      {/* Inline add form */}
      {showAddForm && (
        <div className="activity-add-form">
          <input
            type="text"
            value={addForm.title}
            onChange={e => setAddForm({ ...addForm, title: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && handleAddReminder()}
            placeholder="What do you need to do?"
            className="reminder-input"
            autoFocus
          />
          <input
            type="datetime-local"
            value={addForm.due_at}
            onChange={e => setAddForm({ ...addForm, due_at: e.target.value })}
            className="reminder-input reminder-date"
          />
          <input
            type="text"
            value={addForm.note}
            onChange={e => setAddForm({ ...addForm, note: e.target.value })}
            placeholder="Note (optional)"
            className="reminder-input"
          />
          <div className="reminder-add-actions">
            <button className="btn btn-primary btn-sm" onClick={handleAddReminder}>Add</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && !showAddForm && (
        <div className="activity-feed-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, margin: '0 auto 0.75rem', display: 'block' }}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <p>No activity yet</p>
          <p className="feed-empty-sub">Gmail updates and reminders for this job will appear here.</p>
        </div>
      )}

      {/* Needs attention */}
      {activeItems.length > 0 && (
        <div className="activity-section">
          <div className="activity-section-label">
            <span className="activity-section-dot activity-dot-active" />
            Needs attention
          </div>
          {activeItems.map(renderItem)}
        </div>
      )}

      {/* Upcoming */}
      {upcomingItems.length > 0 && (
        <div className="activity-section">
          <div className="activity-section-label">
            <span className="activity-section-dot activity-dot-upcoming" />
            Upcoming
          </div>
          {upcomingItems.map(renderItem)}
        </div>
      )}

      {/* History — collapsed by default */}
      {historyItems.length > 0 && (
        <div className="activity-section activity-section-history">
          <button className="activity-history-toggle" onClick={() => setShowHistory(h => !h)}>
            <svg
              className={`activity-history-chevron${showHistory ? ' open' : ''}`}
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            ><polyline points="6 9 12 15 18 9"/></svg>
            {showHistory
              ? 'Hide history'
              : `${historyItems.length} past item${historyItems.length !== 1 ? 's' : ''}`}
          </button>
          {showHistory && historyItems.map(renderItem)}
        </div>
      )}
    </div>
  )
}
