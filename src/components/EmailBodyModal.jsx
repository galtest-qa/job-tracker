import React, { useState, useEffect } from 'react'
import { api } from '../api.js'

const EVENT_TYPE_LABELS = {
  interview_invite: 'Interview Invite',
  interview_scheduled: 'Interview Scheduled',
  interview_rescheduled: 'Interview Rescheduled',
  offer: 'Offer',
  offer_discussion: 'Offer Discussion',
  salary_discussion: 'Salary Discussion',
  rejection: 'Rejection',
  position_closed: 'Position Closed',
  process_cancelled: 'Process Cancelled',
  technical_assignment: 'Technical Assignment',
  take_home_assignment: 'Take-Home Assignment',
  recruiter_response: 'Recruiter Response',
  application_confirmation: 'Application Confirmed',
  application_sent: 'Application Sent',
  follow_up_sent: 'Follow-Up Sent',
  follow_up_received: 'Follow-Up Received',
  networking_outreach: 'Networking',
  other: 'Update',
}

const FOOTER_ANCHORS = [
  /^-{3,}\s*$/m,
  /^_{3,}\s*$/m,
  /unsubscribe/im,
  /you (are|were) receiving this/im,
  /this email was sent to/im,
  /this message was intended for/im,
  /if you received this (email|message|communication) in error/im,
  /to stop receiving/im,
  /manage (your )?(notifications?|preferences?|subscriptions?)/im,
  /©\s*\d{4}/im,
  /linkedin corporation/im,
  /view (this )?in (your )?browser/im,
  /click here to unsubscribe/im,
  /you received this (email|notification) because/im,
]

function cleanEmailBody(text) {
  if (!text) return text
  let cutIndex = text.length
  for (const pattern of FOOTER_ANCHORS) {
    const match = text.match(pattern)
    // require at least 120 chars of body before cutting to avoid false positives
    if (match?.index !== undefined && match.index > 120 && match.index < cutIndex) {
      cutIndex = match.index
    }
  }
  let result = text.slice(0, cutIndex).trimEnd()
  // remove bare tracking/pixel URLs on their own line
  result = result.replace(/^https?:\/\/\S+$/gm, '')
  // collapse 3+ consecutive blank lines to 2
  result = result.replace(/\n{3,}/g, '\n\n').trim()
  return result
}

function relativeTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString()
}

export default function EmailBodyModal({ emailId, event, classification, onClose }) {
  const [body, setBody] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.fetchEmailBody(emailId)
      .then(text => { if (!cancelled) setBody(text) })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [emailId])

  const subject = classification?.subject || event?.title || '(no subject)'
  const fromAddress = classification?.from_address || ''
  const receivedAt = classification?.received_at
  const direction = classification?.direction
  const summary = classification?.summary
  const eventTypeLabel = EVENT_TYPE_LABELS[event?.event_type] || 'Update'

  return (
    <div className="modal-overlay email-modal-overlay" onClick={onClose}>
      <div className="modal email-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Email Details</h3>
          <button className="btn btn-ghost" onClick={onClose}>&times;</button>
        </div>

        <div className="email-modal-meta">
          <div className="email-meta-row">
            <span className="email-meta-label">Subject</span>
            <span className="email-meta-value email-subject">{subject}</span>
          </div>
          {fromAddress && (
            <div className="email-meta-row">
              <span className="email-meta-label">From</span>
              <span className="email-meta-value">{fromAddress}</span>
            </div>
          )}
          <div className="email-meta-row">
            <span className="email-meta-label">Received</span>
            <span className="email-meta-value">
              {receivedAt
                ? `${new Date(receivedAt).toLocaleString()} (${relativeTime(receivedAt)})`
                : '—'}
            </span>
          </div>
          <div className="email-meta-row">
            <span className="email-meta-label">Direction</span>
            <span className="email-meta-value" style={{ textTransform: 'capitalize' }}>{direction || '—'}</span>
          </div>
          <div className="email-meta-row">
            <span className="email-meta-label">Classified as</span>
            <span className="email-meta-value email-type-badge">{eventTypeLabel}</span>
          </div>
          {summary && (
            <div className="email-meta-row email-summary-row">
              <span className="email-meta-label">Summary</span>
              <span className="email-meta-value email-summary">{summary}</span>
            </div>
          )}
        </div>

        <div className="email-body-section">
          <div className="email-body-label">Email Content</div>
          {loading && (
            <div className="email-body-loading">
              <span className="spinner" />
              Fetching email content…
            </div>
          )}
          {error && (
            <div className="email-body-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}
          {!loading && !error && body && (
            <pre className="email-body-text">{cleanEmailBody(body)}</pre>
          )}
        </div>
      </div>
    </div>
  )
}
