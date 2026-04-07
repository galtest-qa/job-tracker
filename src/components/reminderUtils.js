export const TEMPLATES = [
  { type: 'send_resume', title: 'Send resume', offsetDays: 0 },
  { type: 'prepare_interview', title: 'Prepare for interview', offsetDays: 0 },
  { type: 'interview_reminder', title: 'Interview reminder', offsetDays: 0 },
  { type: 'check_feedback', title: 'Check feedback', offsetDays: 2 },
  { type: 'follow_up_recruiter', title: 'Follow up recruiter', offsetDays: 3 },
  { type: 'complete_assignment', title: 'Complete assignment', offsetDays: 0 },
  { type: 'review_offer', title: 'Review offer', offsetDays: 0 },
]

export function defaultDueAt(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  // Use local time, not UTC
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function getReminderState(reminder) {
  if (reminder.completed) return 'completed'
  const now = new Date()
  if (reminder.snoozed_until && new Date(reminder.snoozed_until) > now) return 'snoozed'
  const due = new Date(reminder.due_at)
  const diffMs = due - now
  const diffHours = diffMs / 3600000
  if (diffMs < 0) return 'overdue'
  if (diffHours < 24 && due.toDateString() === now.toDateString()) return 'today'
  return 'upcoming'
}

export function formatDue(reminder) {
  const state = getReminderState(reminder)
  if (state === 'completed') return 'Done'
  if (state === 'snoozed') return `Snoozed`

  const now = new Date()
  const due = new Date(reminder.due_at)
  const diffMs = due - now
  const diffMins = Math.round(diffMs / 60000)
  const diffHours = Math.round(diffMs / 3600000)
  const diffDays = Math.round(diffMs / 86400000)

  if (state === 'overdue') {
    if (diffMins > -60) return `${Math.abs(diffMins)}m overdue`
    if (diffHours > -24) return `${Math.abs(diffHours)}h overdue`
    return `${Math.abs(diffDays)}d overdue`
  }
  if (state === 'today') {
    if (diffMins < 60) return `in ${diffMins}m`
    return `in ${diffHours}h`
  }
  if (diffDays <= 7) return `in ${diffDays}d`
  return due.toLocaleDateString()
}

export function getNextActiveReminder(reminders) {
  const now = new Date()
  const active = reminders
    .filter(r => !r.completed && (!r.snoozed_until || new Date(r.snoozed_until) <= now))
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
  return active[0] || null
}
