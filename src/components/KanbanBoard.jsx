import React, { useState, useRef, useEffect } from 'react'
import { api } from '../api.js'
import KanbanCard from './KanbanCard.jsx'
import ReminderSummary from './ReminderSummary.jsx'
import TodaysFocus from './TodaysFocus.jsx'
import OnboardingHero from './OnboardingHero.jsx'
import { getReminderState } from './reminderUtils.js'

export default function KanbanBoard({ jobs, columns, onSelect, onRefresh, onMoveJob, onReorderColumns, searchQuery, onSearchChange, filterScore, onFilterScoreChange, generatingJobIds = new Set(), hasExtension, hasResume, onOpenSettings, onOpenResume, onAddJob }) {
  const [reminders, setReminders] = useState([])
  const [analyzingId, setAnalyzingId] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)
  const [suggestion, setSuggestion] = useState(null) // { jobId, suggestions[] }
  const [reminderFilter, setReminderFilter] = useState(null)
  const [reminderDropdownOpen, setReminderDropdownOpen] = useState(false)

  const reminderChipRef = useRef(null)
  useEffect(() => {
    if (!reminderDropdownOpen) return
    const handler = (e) => { if (reminderChipRef.current && !reminderChipRef.current.contains(e.target)) setReminderDropdownOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [reminderDropdownOpen])

  const loadReminders = async () => {
    try { const data = await api.getAllReminders(); setReminders(data) } catch {}
  }
  useEffect(() => { loadReminders() }, [jobs])
  const SCORE_FILTERS = [
    { key: 'All', label: 'All' },
    { key: '70-100', label: '70-100%' },
    { key: '50-70', label: '50-70%' },
    { key: '0-50', label: '0-50%' },
    { key: 'unscored', label: 'No Score' },
  ]

  const REMINDER_OPTIONS = [
    { key: 'overdue', label: 'Overdue' },
    { key: 'today', label: 'Today' },
    { key: '3days', label: 'Next 3 days' },
    { key: '7days', label: 'Next 7 days' },
  ]

  const handleAnalyze = async (e, jobId) => {
    e.stopPropagation()
    setAnalyzingId(jobId)
    try {
      await api.analyzeJob(jobId)
      await onRefresh()
    } catch (err) { alert('Analysis failed: ' + err.message) }
    setAnalyzingId(null)
  }

  // ── Card drag (between columns) ──
  const handleCardDrop = async (jobId, columnName) => {
    setDragOverCol(null)
    if (!jobId) return
    const job = jobs.find(j => j.id === jobId)
    if (job && job.status !== columnName) {
      onMoveJob(jobId, columnName)
      try {
        const sug = await api.getReminderSuggestions(jobId)
        if (sug.length > 0) setSuggestion({ jobId, company: job.company, role: job.role, suggestions: sug })
      } catch {}
    }
  }

  const handleCardDragOver = (e, colName) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverCol !== colName) setDragOverCol(colName)
  }

  const handleColDragEnd = () => { // kept for column div onDragEnd
  }

  // Reminder date helpers
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const in3 = new Date(now); in3.setDate(in3.getDate() + 3)
  const in3Str = in3.toISOString().slice(0, 10)
  const in7 = new Date(now); in7.setDate(in7.getDate() + 7)
  const in7Str = in7.toISOString().slice(0, 10)

  const jobReminderMap = {}
  for (const r of reminders) {
    if (!jobReminderMap[r.job_id]) jobReminderMap[r.job_id] = []
    jobReminderMap[r.job_id].push(r)
  }

  const reminderMatchesFilter = (jobId, key) => {
    const rs = (jobReminderMap[jobId] || []).filter(r => !r.completed)
    if (key === 'overdue') return rs.some(r => getReminderState(r) === 'overdue')
    if (key === 'today')   return rs.some(r => getReminderState(r) === 'today')
    if (key === '3days') {
      const dueStr = r => (r.due_at || '').slice(0, 10)
      return rs.some(r => dueStr(r) >= todayStr && dueStr(r) <= in3Str)
    }
    if (key === '7days') {
      const dueStr = r => (r.due_at || '').slice(0, 10)
      return rs.some(r => dueStr(r) >= todayStr && dueStr(r) <= in7Str)
    }
    return true
  }

  // Filter jobs
  const filtered = jobs.filter(j => {
    if (filterScore === '0-50' && (j.match_score == null || j.match_score > 50)) return false
    if (filterScore === '50-70' && (j.match_score == null || j.match_score < 50 || j.match_score > 70)) return false
    if (filterScore === '70-100' && (j.match_score == null || j.match_score < 70)) return false
    if (filterScore === 'unscored' && j.match_score != null) return false
    if (reminderFilter && !reminderMatchesFilter(j.id, reminderFilter)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return j.company.toLowerCase().includes(q) ||
        j.role.toLowerCase().includes(q) ||
        (j.department || '').toLowerCase().includes(q) ||
        (j.industry || '').toLowerCase().includes(q)
    }
    return true
  })

  const addSuggestedReminder = async (sug) => {
    await api.createReminder(suggestion.jobId, sug)
    loadReminders()
  }

  const dismissSuggestion = () => setSuggestion(null)

  const nudgeMissing = jobs.length > 0 && (!hasResume || !hasExtension)
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    try { return localStorage.getItem('nudge_dismissed') === new Date().toDateString() } catch { return false }
  })
  const dismissNudge = () => {
    try { localStorage.setItem('nudge_dismissed', new Date().toDateString()) } catch {}
    setNudgeDismissed(true)
  }

  if (jobs.length === 0) {
    return (
      <div className="kanban">
        <OnboardingHero
          hasExtension={hasExtension}
          hasResume={hasResume}
          onOpenSettings={onOpenSettings}
          onOpenResume={onOpenResume}
          onAddJob={onAddJob}
        />
      </div>
    )
  }

  return (
    <div className="kanban">
      <ReminderSummary reminders={reminders} onFilter={setReminderFilter} />

      {nudgeMissing && !nudgeDismissed && (
        <div className="onboarding-nudge">
          <div className="onboarding-nudge-items">
            {!hasExtension && (
              <span className="onboarding-nudge-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                Save jobs from LinkedIn in one click —
                <button className="nudge-link" onClick={() => onOpenSettings('extension')}>Install the Chrome extension</button>
              </span>
            )}
            {!hasResume && (
              <span className="onboarding-nudge-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Get AI match scores —
                <button className="nudge-link" onClick={onOpenResume}>Upload your resume</button>
              </span>
            )}
          </div>
          <button className="nudge-dismiss" onClick={dismissNudge} title="Dismiss">×</button>
        </div>
      )}

      <TodaysFocus
        jobs={jobs}
        reminders={reminders}
        columns={columns}
        onSelect={onSelect}
        onMoveJob={onMoveJob}
        onRefresh={onRefresh}
      />

      {suggestion && (
        <div className="suggestion-toast">
          <div className="suggestion-toast-header">
            <span>Suggested reminders for <strong>{suggestion.company}</strong></span>
            <button className="btn btn-ghost btn-sm" onClick={dismissSuggestion}>&times;</button>
          </div>
          <div className="suggestion-toast-items">
            {suggestion.suggestions.map((s, i) => (
              <button key={i} className="suggestion-item" onClick={() => { addSuggestedReminder(s); setSuggestion(prev => ({ ...prev, suggestions: prev.suggestions.filter((_, j) => j !== i) })) }}>
                + {s.title}
              </button>
            ))}
          </div>
          {suggestion.suggestions.length === 0 && <span className="suggestion-done">All added!</span>}
        </div>
      )}

      <div className="kanban-controls">
        <input
          type="text"
          className="search-input kanban-search"
          placeholder="Search jobs..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
        <div className="kanban-filters-row">
          <div className="filter-tabs score-filters kanban-score-filters">
            {SCORE_FILTERS.map(f => (
              <button
                key={f.key}
                className={`tab score-tab ${filterScore === f.key ? 'active' : ''} ${f.key !== 'All' && f.key !== 'unscored' ? 'score-' + f.key : ''}`}
                onClick={() => onFilterScoreChange(f.key)}
              >{f.label}</button>
            ))}
          </div>
          <div className="reminder-chip-wrap" ref={reminderChipRef}>
            <button
              className={`tab reminder-chip ${reminderFilter ? 'active' : ''}`}
              onClick={() => setReminderDropdownOpen(o => !o)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {reminderFilter ? REMINDER_OPTIONS.find(o => o.key === reminderFilter)?.label : 'Reminders'}
              {reminderFilter
                ? <span className="reminder-chip-clear" onClick={e => { e.stopPropagation(); setReminderFilter(null); setReminderDropdownOpen(false) }}>×</span>
                : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              }
            </button>
            {reminderDropdownOpen && (
              <div className="reminder-chip-dropdown">
                {REMINDER_OPTIONS.map(o => (
                  <button
                    key={o.key}
                    className={`reminder-chip-option ${reminderFilter === o.key ? 'selected' : ''}`}
                    onClick={() => { setReminderFilter(o.key); setReminderDropdownOpen(false) }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="kanban-col-dots">
        {columns.map((col, i) => (
          <span key={col.id} className="kanban-col-dot" title={col.name} />
        ))}
      </div>

      <div className="kanban-board" ref={boardRef => {
        if (!boardRef) return
        const dots = boardRef.previousSibling?.querySelectorAll('.kanban-col-dot')
        if (!dots) return
        const onScroll = () => {
          const colW = boardRef.firstChild?.offsetWidth || 1
          const idx = Math.round(boardRef.scrollLeft / (colW + 12))
          dots.forEach((d, i) => d.classList.toggle('active', i === idx))
        }
        boardRef.addEventListener('scroll', onScroll, { passive: true })
        onScroll()
      }}>
        {columns.map(col => {
          const colJobs = filtered.filter(j => j.status === col.name)

          return (
            <div
              key={col.id}
              className={`kanban-column ${dragOverCol === col.name ? 'card-drag-over' : ''}`}
              onDragOver={(e) => handleCardDragOver(e, col.name)}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(null) }}
              onDrop={(e) => {
                e.preventDefault()
                const jobId = e.dataTransfer.getData('job-id')
                setDragOverCol(null)
                if (jobId) handleCardDrop(jobId, col.name)
              }}
            >
              <div className="kanban-column-header">
                <span className="kanban-col-title">{col.name}</span>
                <span className="kanban-col-count">{colJobs.length}</span>
              </div>

              <div className="kanban-column-body">
                {colJobs.map(job => (
                  <KanbanCard
                    key={job.id}
                    job={job}
                    columns={columns}
                    reminders={reminders}
                    onSelect={onSelect}
                    onAnalyze={handleAnalyze}
                    analyzing={analyzingId === job.id}
                    generating={generatingJobIds.has(job.id)}
                  />
                ))}
                {colJobs.length === 0 && (
                  <div className="kanban-empty">Drop jobs here</div>
                )}
              </div>
            </div>
          )
        })}

      </div>
    </div>
  )
}
