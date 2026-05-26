import React, { useState, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'
import CompanyLogo from './CompanyLogo.jsx'
import ReminderBadge from './ReminderBadge.jsx'
import { getNextActiveReminder } from './reminderUtils.js'
import { getNextAction } from './nextAction.js'

function Tooltip({ anchor, job, columns }) {
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const spaceRight = window.innerWidth - rect.right
    // Show on the right if there's room, otherwise on the left
    if (spaceRight > 240) {
      setPos({ top: rect.top, left: rect.right + 8 })
    } else {
      setPos({ top: rect.top, left: rect.left - 232 })
    }
  }, [anchor])

  if (!pos) return null

  const colIndex = columns?.findIndex(c => c.name === job.status) ?? -1
  const nextStep = colIndex >= 0 && colIndex < (columns?.length || 0) - 1
    ? columns[colIndex + 1].name : null

  return ReactDOM.createPortal(
    <div className="kanban-tooltip" style={{ top: pos.top, left: pos.left }}>
      <div className="kanban-tooltip-row">
        <span className="kanban-tooltip-label">Role</span>
        <span className="kanban-tooltip-value">{job.role}</span>
      </div>
      <div className="kanban-tooltip-row">
        <span className="kanban-tooltip-label">Company</span>
        <span className="kanban-tooltip-value">{job.company}</span>
      </div>
      {job.contact_name && (
        <div className="kanban-tooltip-row">
          <span className="kanban-tooltip-label">Contact</span>
          <span className="kanban-tooltip-value">
            {job.contact_name}{job.contact_role ? ` (${job.contact_role})` : ''}
          </span>
        </div>
      )}
      <div className="kanban-tooltip-row">
        <span className="kanban-tooltip-label">Next Step</span>
        <span className="kanban-tooltip-value kanban-tooltip-next">
          {nextStep || 'Final stage'}
        </span>
      </div>
      <div className="kanban-tooltip-row">
        <span className="kanban-tooltip-label">Match</span>
        <span className="kanban-tooltip-value">
          {job.match_score != null ? (
            <span className={`score score-sm ${job.match_score >= 70 ? 'high' : job.match_score >= 40 ? 'mid' : 'low'}`}>
              {job.match_score}%
            </span>
          ) : (
            <span className="kanban-tooltip-muted">Not scored</span>
          )}
        </span>
      </div>
    </div>,
    document.body
  )
}

export default function KanbanCard({ job, columns, reminders = [], onSelect, onAnalyze, analyzing }) {
  const nextReminder = getNextActiveReminder(reminders.filter(r => r.job_id === job.id))
  const nextAction = getNextAction(job, reminders)
  const [showTooltip, setShowTooltip] = useState(false)
  const [showAiHover, setShowAiHover] = useState(false)
  const [aiHoverPos, setAiHoverPos] = useState(null)
  const hoverTimer = useRef(null)
  const aiHoverTimer = useRef(null)
  const cardRef = useRef(null)
  const aiButtonRef = useRef(null)

  const handleMouseEnter = () => {
    hoverTimer.current = setTimeout(() => setShowTooltip(true), 400)
  }
  const handleMouseLeave = () => {
    clearTimeout(hoverTimer.current)
    setShowTooltip(false)
  }

  return (
    <div
      ref={cardRef}
      className="kanban-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('job-id', String(job.id))
        e.dataTransfer.effectAllowed = 'move'
        e.currentTarget.classList.add('dragging')
        clearTimeout(hoverTimer.current)
        setShowTooltip(false)
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
      onClick={() => onSelect(job.id)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="kanban-card-top">
        <CompanyLogo company={job.company} size="sm" logoUrl={job.logo_url} />
        <div className="kanban-card-title">
          <span className="kanban-card-role">{job.role}</span>
          <span className="kanban-card-company">{job.company}</span>
        </div>
        {job.match_score != null && (
          <span className={`score score-sm ${job.match_score >= 70 ? 'high' : job.match_score >= 40 ? 'mid' : 'low'}`}>
            {job.match_score}%
          </span>
        )}
      </div>

      {job.summary && <p className="kanban-card-summary">{job.summary}</p>}
      <ReminderBadge reminder={nextReminder} />

      <div className="kanban-card-bottom">
        <div className="kanban-card-tags">
          {job.department && <span className="tag tag-sm tag-dept">{job.department}</span>}
          {job.industry && <span className="tag tag-sm tag-industry">{job.industry}</span>}
        </div>
        <div className="kanban-card-actions">
          {job.contact_name && (
            <span className="kanban-card-contact" title={job.contact_name}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </span>
          )}
          <button
            ref={aiButtonRef}
            className={`kanban-analyze-btn ${analyzing ? 'analyzing' : ''}`}
            onClick={(e) => { e.stopPropagation(); onAnalyze(e, job.id) }}
            disabled={analyzing}
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              setAiHoverPos({ top: rect.bottom + 6, left: rect.left })
              aiHoverTimer.current = setTimeout(() => setShowAiHover(true), 300)
            }}
            onMouseLeave={() => { clearTimeout(aiHoverTimer.current); setShowAiHover(false) }}
          >
            {analyzing ? <span className="spinner spinner-sm" /> : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.26-2.88 3.83L12 18"/>
                <path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.26 2.88 3.83L12 18"/>
                <path d="M8 22h8"/><path d="M9 18h6"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className={`kanban-card-next-action next-${nextAction.priority}`}>
        <span className="next-action-label">Next:</span> {nextAction.action}
      </div>

      {showTooltip && <Tooltip anchor={cardRef.current} job={job} columns={columns} />}
      {showAiHover && aiHoverPos && <AiHoverPopup job={job} pos={aiHoverPos} />}
    </div>
  )
}

function AiHoverPopup({ job, pos }) {
  const hasScore = job.match_score != null
  const breakdown = job.score_breakdown || []

  const met   = breakdown.filter(r => r.status === 'met').slice(0, 2)
  const unmet = breakdown.filter(r => r.status === 'unmet').slice(0, 2)

  // Adjust position so popup doesn't go off screen
  const left = Math.min(pos.left, window.innerWidth - 240)

  return ReactDOM.createPortal(
    <div className="ai-hover-popup" style={{ top: pos.top, left }}>
      {!hasScore ? (
        <>
          <div className="ai-hover-title">Analyze with AI</div>
          <div className="ai-hover-desc">Score this job against your profile — see what you meet, what's missing, and get positioning tips.</div>
        </>
      ) : (
        <>
          <div className="ai-hover-header">
            <span className="ai-hover-title">AI Analysis</span>
            <span className={`score score-sm ${job.match_score >= 70 ? 'high' : job.match_score >= 40 ? 'mid' : 'low'}`}>
              {job.match_score}%
            </span>
          </div>
          {met.length > 0 && (
            <div className="ai-hover-section">
              <span className="ai-hover-section-label met">✓ Meets</span>
              {met.map((r, i) => <div key={i} className="ai-hover-item">{r.requirement}</div>)}
            </div>
          )}
          {unmet.length > 0 && (
            <div className="ai-hover-section">
              <span className="ai-hover-section-label unmet">✗ Gaps</span>
              {unmet.map((r, i) => <div key={i} className="ai-hover-item">{r.requirement}</div>)}
            </div>
          )}
          {breakdown.length === 0 && job.positioning_tips && (
            <div className="ai-hover-desc">{job.positioning_tips.slice(0, 100)}…</div>
          )}
          <div className="ai-hover-footer">Click to re-analyze</div>
        </>
      )}
    </div>,
    document.body
  )
}
