import React, { useState, useRef } from 'react'
import CompanyLogo from './CompanyLogo.jsx'
import { api } from '../api.js'

const STATUSES = ['All', 'Saved', 'Applied', 'Interviewing', 'Rejected', 'Offer']
const SCORE_FILTERS = [
  { key: 'All', label: 'All Scores' },
  { key: '70-100', label: '70-100%' },
  { key: '50-70', label: '50-70%' },
  { key: '0-50', label: '0-50%' },
  { key: 'unscored', label: 'Not Scored' },
]

export default function Dashboard({ jobs, stats, onSelect, filterStatus, onFilterChange, searchQuery, onSearchChange, onReorder, onRefresh, filterScore, onFilterScoreChange }) {
  const [analyzingId, setAnalyzingId] = useState(null)
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const dragNode = useRef(null)

  const handleAnalyze = async (e, jobId) => {
    e.stopPropagation()
    setAnalyzingId(jobId)
    try {
      await api.analyzeJob(jobId)
      await onRefresh()
    } catch (err) {
      alert('Analysis failed: ' + err.message)
    }
    setAnalyzingId(null)
  }

  const handleDragStart = (e, index) => {
    setDragIdx(index)
    dragNode.current = e.target.closest('.job-card')
    e.dataTransfer.effectAllowed = 'move'
    // Make the drag image slightly transparent
    requestAnimationFrame(() => {
      if (dragNode.current) dragNode.current.classList.add('dragging')
    })
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (index !== overIdx) setOverIdx(index)
  }

  const handleDragEnd = () => {
    if (dragNode.current) dragNode.current.classList.remove('dragging')
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      onReorder(dragIdx, overIdx)
    }
    setDragIdx(null)
    setOverIdx(null)
    dragNode.current = null
  }

  return (
    <div className="dashboard">
      <div className="controls">
        <input
          type="text"
          className="search-input"
          placeholder="Search companies, roles, tags..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
        <div className="filter-tabs">
          {STATUSES.map(s => (
            <button
              key={s}
              className={`tab ${filterStatus === s ? 'active' : ''}`}
              onClick={() => onFilterChange(s)}
            >
              {s}
              {s !== 'All' && stats?.byStatus && (
                <span className="tab-count">
                  {stats.byStatus.find(x => x.status === s)?.count || 0}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="filter-tabs score-filters">
          {SCORE_FILTERS.map(f => (
            <button
              key={f.key}
              className={`tab score-tab ${filterScore === f.key ? 'active' : ''} ${f.key !== 'All' && f.key !== 'unscored' ? 'score-' + f.key : ''}`}
              onClick={() => onFilterScoreChange(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">&#128188;</div>
          <p>No jobs found. Add your first opportunity!</p>
        </div>
      ) : (
        <div className="job-list">
          {jobs.map((job, index) => (
            <div
              key={job.id}
              className={`job-card ${dragIdx === index ? 'dragging' : ''} ${overIdx === index && dragIdx !== index ? (dragIdx < index ? 'drop-below' : 'drop-above') : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
            >
              <div className="job-card-row">
                <div className="drag-handle" title="Drag to reorder">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="5" cy="3" r="1.5" />
                    <circle cx="11" cy="3" r="1.5" />
                    <circle cx="5" cy="8" r="1.5" />
                    <circle cx="11" cy="8" r="1.5" />
                    <circle cx="5" cy="13" r="1.5" />
                    <circle cx="11" cy="13" r="1.5" />
                  </svg>
                </div>
                <div className="job-card-content" onClick={() => onSelect(job.id)}>
                  <div className="job-card-main">
                    <CompanyLogo company={job.company} logoUrl={job.logo_url} />
                    <div className="job-card-info">
                      <div className="job-card-header">
                        <div className="job-card-title">
                          <h3>{job.role}</h3>
                          <span className="company">{job.company}</span>
                        </div>
                        <div className="job-card-meta">
                          <button
                            className={`btn-analyze ${analyzingId === job.id ? 'analyzing' : ''}`}
                            onClick={(e) => handleAnalyze(e, job.id)}
                            disabled={analyzingId === job.id}
                            title={job.match_score != null ? 'Re-analyze with AI' : 'Analyze with AI'}
                          >
                            {analyzingId === job.id ? (
                              <span className="spinner" />
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.26-2.88 3.83L12 18" />
                                <path d="M12 2a4 4 0 0 0-4 4c0 1.95 1.4 3.26 2.88 3.83L12 18" />
                                <path d="M8 22h8" />
                                <path d="M9 18h6" />
                              </svg>
                            )}
                          </button>
                          <span className={`status-badge status-${job.status.toLowerCase()}`}>
                            {job.status}
                          </span>
                          {job.match_score != null && (
                            <span className={`score ${job.match_score >= 70 ? 'high' : job.match_score >= 40 ? 'mid' : 'low'}`}>
                              {job.match_score}%
                            </span>
                          )}
                        </div>
                      </div>
                      {job.summary && <p className="job-summary">{job.summary}</p>}
                      <div className="job-card-footer">
                        <span className="source">{job.source}</span>
                        {job.contact_name && (
                          <span className="contact-badge" title={[job.contact_role, job.contact_email].filter(Boolean).join(' · ')}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                              <circle cx="12" cy="7" r="4"/>
                            </svg>
                            {job.contact_name}
                          </span>
                        )}
                        {job.tags?.length > 0 && (
                          <div className="tags">
                            {job.tags.slice(0, 4).map(t => <span key={t} className="tag">{t}</span>)}
                          </div>
                        )}
                        <span className="date">{new Date(job.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
