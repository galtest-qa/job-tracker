import React from 'react'

// Human-readable message copy per event type
function buildMessage(event) {
  const company = event.detected_company || 'A company'
  const role = event.detected_role || 'this role'

  switch (event.event_type) {
    case 'application_sent':
      return {
        icon: '✉️',
        headline: 'Application sent',
        body: `It looks like you applied to ${role} at ${company}. Move this job to Applied?`,
      }
    case 'application_confirmation':
      return {
        icon: '✅',
        headline: 'Application confirmed',
        body: `${company} confirmed they received your application for ${role}. Move this job to Applied?`,
      }
    case 'recruiter_response':
      return {
        icon: '💬',
        headline: 'Recruiter replied',
        body: `You heard back from ${company} about ${role}. Want to move this job forward?`,
      }
    case 'interview_invite':
      return {
        icon: '🎉',
        headline: "You're invited to interview!",
        body: `${company} invited you to interview for ${role}. Move this job to Interview?`,
      }
    case 'interview_scheduled':
      return {
        icon: '📅',
        headline: 'Interview scheduled',
        body: `Your interview with ${company} for ${role} is confirmed. Move this job to Interview?`,
      }
    case 'interview_rescheduled':
      return {
        icon: '🔄',
        headline: 'Interview rescheduled',
        body: `Your interview with ${company} has been moved to a new time.`,
      }
    case 'technical_assignment':
    case 'take_home_assignment':
      return {
        icon: '💻',
        headline: 'Assignment received',
        body: `${company} sent you an assignment for ${role}. Move this job to Assignment?`,
      }
    case 'offer':
      return {
        icon: '🎊',
        headline: 'Offer received!',
        body: `${company} sent you an offer for ${role}. Move this job to Offer?`,
      }
    case 'offer_discussion':
    case 'salary_discussion':
      return {
        icon: '💼',
        headline: 'Offer discussion',
        body: `You're in an offer or salary discussion with ${company}. Move this job to Offer?`,
      }
    case 'rejection':
      return {
        icon: '📋',
        headline: 'Application update',
        body: `It looks like ${company} is not moving forward with your application. Move this job to Rejected?`,
      }
    case 'position_closed':
      return {
        icon: '🔒',
        headline: 'Position closed',
        body: `${company} closed the position for ${role}. Archive this opportunity?`,
      }
    case 'process_cancelled':
      return {
        icon: '🔒',
        headline: 'Hiring process cancelled',
        body: `${company} cancelled their hiring process. Archive this opportunity?`,
      }
    case 'follow_up_sent':
      return {
        icon: '📤',
        headline: 'Follow-up sent',
        body: `You followed up with ${company} about ${role}.`,
      }
    case 'follow_up_received':
      return {
        icon: '📥',
        headline: 'Follow-up received',
        body: `${company} followed up with you about ${role}.`,
      }
    default:
      return {
        icon: '📬',
        headline: 'New hiring update',
        body: event.title || `Update from ${company}`,
      }
  }
}

export default function HiringEventPopup({ event, groupCount, columns = [], onMove, onKeepHere, onDismiss, onOpenNotifications }) {
  // Grouped popup — multiple high-priority events
  if (groupCount > 0) {
    return (
      <div className="modal-overlay hiring-popup-overlay" onClick={onDismiss}>
        <div className="hiring-popup" onClick={e => e.stopPropagation()}>
          <div className="hiring-popup-icon">📬</div>
          <h3 className="hiring-popup-headline">
            {groupCount} new hiring update{groupCount > 1 ? 's' : ''}
          </h3>
          <p className="hiring-popup-message">
            You have new activity in your hiring pipeline.
          </p>
          <div className="hiring-popup-actions">
            <button className="btn btn-primary btn-sm" onClick={onOpenNotifications}>View Updates</button>
            <button className="btn btn-ghost btn-sm" onClick={onDismiss}>Later</button>
          </div>
        </div>
      </div>
    )
  }

  if (!event) return null

  const { icon, headline, body } = buildMessage(event)

  // Only show move CTA if suggested_stage exists in this user's actual board columns
  const stageExists = event.suggested_stage && columns.some(c => c.name === event.suggested_stage)
  const canMove = !!(event.matched_job_id && stageExists)

  return (
    <div className="modal-overlay hiring-popup-overlay" onClick={onDismiss}>
      <div className="hiring-popup" onClick={e => e.stopPropagation()}>
        <div className="hiring-popup-icon">{icon}</div>
        <h3 className="hiring-popup-headline">{headline}</h3>
        <p className="hiring-popup-message">{body}</p>

        {canMove && (
          <div className="hiring-popup-suggestion">
            → Move to <strong>{event.suggested_stage}</strong>
          </div>
        )}

        <div className="hiring-popup-actions">
          {canMove && (
            <button className="btn btn-primary btn-sm" onClick={onMove}>
              Move to {event.suggested_stage}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={onKeepHere}>
            {canMove ? 'Keep here' : 'View updates'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
