import React from 'react'
import { getReminderState } from './reminderUtils.js'

export default function ReminderSummary({ reminders, onFilter }) {
  const active = reminders.filter(r => !r.completed)
  const overdue = active.filter(r => getReminderState(r) === 'overdue')
  const today = active.filter(r => getReminderState(r) === 'today')
  const upcoming = active.filter(r => getReminderState(r) === 'upcoming')

  if (active.length === 0) return null

  return (
    <div className="reminder-summary">
      {overdue.length > 0 && (
        <span className="reminder-summary-item overdue clickable" onClick={() => onFilter?.('overdue')}>
          <span className="reminder-summary-count">{overdue.length}</span> overdue
        </span>
      )}
      {today.length > 0 && (
        <span className="reminder-summary-item today clickable" onClick={() => onFilter?.('today')}>
          <span className="reminder-summary-count">{today.length}</span> due today
        </span>
      )}
      {upcoming.length > 0 && (
        <span className="reminder-summary-item upcoming">
          <span className="reminder-summary-count">{upcoming.length}</span> upcoming
        </span>
      )}
    </div>
  )
}
