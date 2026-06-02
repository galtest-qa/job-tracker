import React from 'react'

const EVENT_MESSAGES = {
  interview_invite: (title) => ({
    headline: 'Interview invitation detected',
    message: title,
    icon: '🎉',
  }),
  interview_scheduled: (title) => ({
    headline: 'Interview scheduled',
    message: title,
    icon: '📅',
  }),
  offer: (title) => ({
    headline: 'Offer received!',
    message: title,
    icon: '🎊',
  }),
  offer_discussion: (title) => ({
    headline: 'Offer discussion',
    message: title,
    icon: '💼',
  }),
  rejection: (title) => ({
    headline: 'Application update',
    message: title,
    icon: '📋',
  }),
  position_closed: (title) => ({
    headline: 'Position closed',
    message: title,
    icon: '🔒',
  }),
  process_cancelled: (title) => ({
    headline: 'Hiring process cancelled',
    message: title,
    icon: '🔒',
  }),
  technical_assignment: (title) => ({
    headline: 'Assignment received',
    message: title,
    icon: '💻',
  }),
  take_home_assignment: (title) => ({
    headline: 'Take-home assignment',
    message: title,
    icon: '📝',
  }),
  recruiter_response: (title) => ({
    headline: 'Recruiter replied',
    message: title,
    icon: '💬',
  }),
}

function getActions(event, onMove, onKeepHere, onDismiss, onOpenNotifications) {
  const { event_type, suggested_stage, matched_job_id } = event
  const canMove = matched_job_id && suggested_stage

  const moveBtn = canMove
    ? { label: `Move to ${suggested_stage}`, onClick: onMove, variant: 'primary' }
    : null

  const prepBtn = (event_type === 'interview_invite' || event_type === 'interview_scheduled')
    ? { label: 'Prepare for Interview', onClick: onKeepHere, variant: 'secondary' }
    : null

  const keepBtn = { label: 'Keep Here', onClick: onKeepHere, variant: 'ghost' }
  const dismissBtn = { label: 'Dismiss', onClick: onDismiss, variant: 'ghost' }
  const viewBtn = { label: 'View Updates', onClick: onOpenNotifications, variant: 'secondary' }

  if (event_type === 'rejection' || event_type === 'position_closed' || event_type === 'process_cancelled') {
    return [moveBtn, keepBtn, dismissBtn].filter(Boolean)
  }

  return [moveBtn, prepBtn, keepBtn, dismissBtn].filter(Boolean)
}

export default function HiringEventPopup({ event, groupCount, onMove, onKeepHere, onDismiss, onOpenNotifications }) {
  // Grouped popup (multiple high-priority events)
  if (groupCount > 0) {
    return (
      <div className="modal-overlay hiring-popup-overlay" onClick={onDismiss}>
        <div className="hiring-popup" onClick={e => e.stopPropagation()}>
          <div className="hiring-popup-icon">📬</div>
          <h3 className="hiring-popup-headline">
            {groupCount} new hiring update{groupCount > 1 ? 's' : ''}
          </h3>
          <p className="hiring-popup-message">
            You have new activity in your hiring pipeline. Review your updates.
          </p>
          <div className="hiring-popup-actions">
            <button className="btn btn-primary btn-sm" onClick={onOpenNotifications}>
              View Updates
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onDismiss}>
              Later
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!event) return null

  const meta = EVENT_MESSAGES[event.event_type]
    ? EVENT_MESSAGES[event.event_type](event.title)
    : { headline: 'New hiring update', message: event.title, icon: '📬' }

  const actions = getActions(event, onMove, onKeepHere, onDismiss, onOpenNotifications)

  return (
    <div className="modal-overlay hiring-popup-overlay" onClick={onDismiss}>
      <div className="hiring-popup" onClick={e => e.stopPropagation()}>
        <div className="hiring-popup-icon">{meta.icon}</div>
        <h3 className="hiring-popup-headline">{meta.headline}</h3>
        <p className="hiring-popup-message">{meta.message}</p>

        {event.suggested_stage && event.matched_job_id && (
          <div className="hiring-popup-suggestion">
            Suggested: move to <strong>{event.suggested_stage}</strong>
          </div>
        )}

        <div className="hiring-popup-actions">
          {actions.map((action, i) => (
            <button
              key={i}
              className={`btn btn-sm ${
                action.variant === 'primary' ? 'btn-primary' :
                action.variant === 'secondary' ? 'btn-secondary' :
                'btn-ghost'
              }`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
