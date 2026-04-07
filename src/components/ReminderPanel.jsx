import React, { useState, useEffect } from 'react'
import { api } from '../api.js'
import { TEMPLATES, defaultDueAt, getReminderState, formatDue } from './reminderUtils.js'

export default function ReminderPanel({ jobId }) {
  const [reminders, setReminders] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ type: 'custom', title: '', due_at: defaultDueAt(), note: '' })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const load = async () => {
    const data = await api.getReminders(jobId)
    setReminders(data)
  }
  useEffect(() => { load() }, [jobId])

  const applyTemplate = (t) => {
    setForm({ type: t.type, title: t.title, due_at: defaultDueAt(t.offsetDays), note: '' })
    setShowAdd(true)
  }

  const handleAdd = async () => {
    if (!form.title.trim() || !form.due_at) return
    await api.createReminder(jobId, form)
    setForm({ type: 'custom', title: '', due_at: defaultDueAt(), note: '' })
    setShowAdd(false)
    load()
  }

  const toggleComplete = async (r) => {
    await api.updateReminder(r.id, { completed: r.completed ? 0 : 1 })
    load()
  }

  const snooze = async (r, hours) => {
    const until = new Date(Date.now() + hours * 3600000).toISOString()
    await api.updateReminder(r.id, { snoozed_until: until })
    load()
  }

  const deleteReminder = async (id) => {
    await api.deleteReminder(id)
    load()
  }

  const startEdit = (r) => {
    setEditingId(r.id)
    setEditForm({ title: r.title, due_at: r.due_at?.slice(0, 16), note: r.note || '' })
  }

  const saveEdit = async () => {
    if (!editForm.title.trim()) return
    await api.updateReminder(editingId, editForm)
    setEditingId(null)
    load()
  }

  const active = reminders.filter(r => !r.completed).sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
  const completed = reminders.filter(r => r.completed)

  return (
    <div className="reminder-panel">
      <div className="reminder-panel-header">
        <h4>Reminders</h4>
        <div className="reminder-templates">
          {TEMPLATES.map(t => (
            <button key={t.type} className="reminder-template-btn" onClick={() => applyTemplate(t)}>
              + {t.title}
            </button>
          ))}
          <button className="reminder-template-btn custom" onClick={() => { setForm({ type: 'custom', title: '', due_at: defaultDueAt(), note: '' }); setShowAdd(true) }}>
            + Custom
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="reminder-add-form">
          <input
            type="text"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="Reminder title..."
            className="reminder-input"
            autoFocus
          />
          <input
            type="datetime-local"
            value={form.due_at}
            onChange={e => setForm({ ...form, due_at: e.target.value })}
            className="reminder-input reminder-date"
          />
          <input
            type="text"
            value={form.note}
            onChange={e => setForm({ ...form, note: e.target.value })}
            placeholder="Note (optional)"
            className="reminder-input"
          />
          <div className="reminder-add-actions">
            <button className="btn btn-primary btn-sm" onClick={handleAdd}>Add</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div className="reminder-list">
          {active.map(r => {
            const state = getReminderState(r)
            const isEditing = editingId === r.id

            return (
              <div key={r.id} className={`reminder-item reminder-${state}`}>
                {isEditing ? (
                  <div className="reminder-edit-form">
                    <input type="text" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} className="reminder-input" />
                    <input type="datetime-local" value={editForm.due_at} onChange={e => setEditForm({ ...editForm, due_at: e.target.value })} className="reminder-input reminder-date" />
                    <input type="text" value={editForm.note} onChange={e => setEditForm({ ...editForm, note: e.target.value })} placeholder="Note" className="reminder-input" />
                    <div className="reminder-add-actions">
                      <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button className="reminder-check" onClick={() => toggleComplete(r)} title="Mark complete">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/>{r.completed && <polyline points="9 12 11 14 15 10"/>}
                      </svg>
                    </button>
                    <div className="reminder-content">
                      <span className="reminder-title">{r.title}</span>
                      <span className={`reminder-due reminder-due-${state}`}>{formatDue(r)}</span>
                      {r.note && <span className="reminder-note">{r.note}</span>}
                    </div>
                    <div className="reminder-actions">
                      <button className="reminder-action-btn" onClick={() => startEdit(r)} title="Edit">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                      </button>
                      <button className="reminder-action-btn" onClick={() => snooze(r, 24)} title="Snooze 1 day">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      </button>
                      <button className="reminder-action-btn danger" onClick={() => deleteReminder(r.id)} title="Delete">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {completed.length > 0 && (
        <details className="reminder-completed-section">
          <summary>{completed.length} completed</summary>
          <div className="reminder-list">
            {completed.map(r => (
              <div key={r.id} className="reminder-item reminder-completed">
                <button className="reminder-check checked" onClick={() => toggleComplete(r)} title="Uncomplete">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>
                  </svg>
                </button>
                <div className="reminder-content">
                  <span className="reminder-title completed-text">{r.title}</span>
                </div>
                <button className="reminder-action-btn danger" onClick={() => deleteReminder(r.id)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {reminders.length === 0 && !showAdd && (
        <p className="reminder-empty">No reminders yet. Use the buttons above to add one.</p>
      )}
    </div>
  )
}
