// Deterministic next action engine — no AI, no external calls.
// Uses existing job fields + reminders to determine the recommended next step.

// ── Follow-up detection ──

export function getFollowUp(job) {
  const status = (job.status || '').toLowerCase()
  const isTrackable = status.includes('applied') || status.includes('interview')
  if (!isTrackable) return { shouldFollowUp: false, daysSinceLastAction: 0 }

  const lastAction = job.updated_at ? new Date(job.updated_at) : null
  if (!lastAction) return { shouldFollowUp: false, daysSinceLastAction: 0 }

  const daysSinceLastAction = Math.floor((new Date() - lastAction) / 86400000)
  return {
    shouldFollowUp: daysSinceLastAction >= 3,
    daysSinceLastAction,
  }
}

// ── Timeline stages ──

const TIMELINE_STAGES = [
  { key: 'saved', label: 'Saved' },
  { key: 'analyzed', label: 'Analyzed' },
  { key: 'resume_ready', label: 'Resume Ready' },
  { key: 'applied', label: 'Applied' },
  { key: 'interview', label: 'Interview' },
  { key: 'offer', label: 'Offer' },
]

export function getTimeline(job) {
  const status = (job.status || '').toLowerCase()

  const stages = TIMELINE_STAGES.map(stage => {
    let completed = false
    let current = false

    switch (stage.key) {
      case 'saved':
        completed = true // always true if job exists
        break
      case 'analyzed':
        completed = job.match_score != null
        break
      case 'resume_ready':
        completed = !!(job.tailored_resume && job.tailored_resume.length > 0)
        break
      case 'applied':
        completed = status.includes('applied') || status.includes('interview') || status.includes('offer')
        break
      case 'interview':
        completed = status.includes('interview') || status.includes('offer')
        break
      case 'offer':
        completed = status.includes('offer')
        break
    }

    // Determine current stage: the last completed one
    return { ...stage, completed }
  })

  // Mark the current stage (last completed)
  let currentIdx = 0
  for (let i = stages.length - 1; i >= 0; i--) {
    if (stages[i].completed) { currentIdx = i; break }
  }
  stages[currentIdx].current = true

  return stages
}

export { TIMELINE_STAGES }

// ── Next action engine ──

export function getNextAction(job, reminders = []) {
  const now = new Date()
  const updatedAt = job.updated_at ? new Date(job.updated_at) : now
  const daysSinceUpdate = (now - updatedAt) / 86400000
  const status = (job.status || '').toLowerCase()
  const score = job.match_score

  // Check follow-up first (Feature 1 integration)
  const followUp = getFollowUp(job)

  // Check for upcoming interview reminder within 24h
  const interviewReminder = reminders
    .filter(r => !r.completed && r.job_id === job.id)
    .filter(r => r.type === 'interview_reminder' || r.type === 'prepare_interview' || r.title?.toLowerCase().includes('interview'))
    .find(r => {
      const due = new Date(r.due_at)
      return due > now && (due - now) < 24 * 3600000
    })

  // Rule 1: Interview within 24h
  if (interviewReminder) {
    return {
      action: 'Prepare for interview',
      reason: 'Upcoming interview',
      priority: 'high',
      tab: 'interview',
    }
  }

  // Rule 2: Follow-up needed (applied/interview with no activity for 3+ days)
  if (followUp.shouldFollowUp) {
    return {
      action: 'Follow up',
      reason: `No activity for ${followUp.daysSinceLastAction} days`,
      priority: 'medium',
      tab: 'notes',
    }
  }

  // Rule 3: High match + not yet applied
  if (score != null && score >= 85 && (status.includes('backlog') || status.includes('send'))) {
    return {
      action: 'Apply now',
      reason: 'High match and not applied',
      priority: 'high',
      tab: 'resume',
    }
  }

  // Rule 4: Partial match — improve resume
  if (score != null && score >= 65 && score < 85 && (status.includes('backlog') || status.includes('send'))) {
    return {
      action: 'Improve resume before applying',
      reason: 'Partial match — tailor your resume',
      priority: 'medium',
      tab: 'resume',
    }
  }

  // Rule 5: Interview scheduled, more than 24h away
  if (status.includes('interview')) {
    return {
      action: 'Review interview prep',
      reason: 'Interview scheduled',
      priority: 'medium',
      tab: 'interview',
    }
  }

  // Rule 6: Stale in pre-apply stages — not "follow up" since you haven't applied yet
  if ((status.includes('send') || status.includes('backlog')) && daysSinceUpdate > 3) {
    return {
      action: 'Take action',
      reason: `No activity for ${Math.floor(daysSinceUpdate)} days — apply or move on`,
      priority: 'medium',
      tab: 'analysis',
    }
  }

  // Rule 7: Offer stage
  if (status.includes('offer')) {
    return {
      action: 'Review offer',
      reason: 'Offer received',
      priority: 'high',
      tab: 'notes',
    }
  }

  // Rule 8: Low match
  if (score != null && score < 65) {
    return {
      action: 'Review or deprioritize',
      reason: 'Low match score',
      priority: 'low',
      tab: 'analysis',
    }
  }

  // Rule 9: Not yet analyzed
  if (score == null && job.description) {
    return {
      action: 'Analyze job',
      reason: 'Not yet scored',
      priority: 'medium',
      tab: 'analysis',
    }
  }

  // Default
  return {
    action: 'Review job',
    reason: 'No action taken',
    priority: 'low',
    tab: 'analysis',
  }
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

export function getTopActions(jobs, reminders = [], limit = 5) {
  return jobs
    .map(job => ({ job, ...getNextAction(job, reminders) }))
    .sort((a, b) => {
      const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      if (pDiff !== 0) return pDiff
      return new Date(a.job.updated_at || 0) - new Date(b.job.updated_at || 0)
    })
    .slice(0, limit)
}
