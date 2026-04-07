import React from 'react'
import { getReminderState, formatDue } from './reminderUtils.js'

export default function ReminderBadge({ reminder }) {
  if (!reminder) return null
  const state = getReminderState(reminder)
  if (state === 'completed') return null

  return (
    <div className={`reminder-badge reminder-${state}`} title={reminder.title}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
      <span className="reminder-badge-text">
        {reminder.title.length > 18 ? reminder.title.slice(0, 18) + '...' : reminder.title} {formatDue(reminder)}
      </span>
    </div>
  )
}
