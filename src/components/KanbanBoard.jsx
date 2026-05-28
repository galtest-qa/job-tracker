import React, { useState, useRef, useEffect } from 'react'
import { api } from '../api.js'
import KanbanCard from './KanbanCard.jsx'
import ReminderSummary from './ReminderSummary.jsx'
import TodaysFocus from './TodaysFocus.jsx'
import { getReminderState } from './reminderUtils.js'

export default function KanbanBoard({ jobs, columns, onSelect, onRefresh, onMoveJob, onReorderColumns, searchQuery, onSearchChange, filterScore, onFilterScoreChange, generatingJobIds = new Set() }) {
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
  const [editingColId, setEditingColId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColName, setNewColName] = useState('')
  // Column drag state
  const [dragColId, setDragColId] = useState(null)
  const [dragOverColId, setDragOverColId] = useState(null)

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

  // ── Column drag (reorder columns) ──
  const handleColDragStart = (e, colId) => {
    e.dataTransfer.setData('column-id', String(colId))
    e.dataTransfer.effectAllowed = 'move'
    setDragColId(colId)
  }

  const handleColDragOver = (e, colId) => {
    e.preventDefault()
    if (!e.dataTransfer.types.includes('column-id')) return
    if (dragOverColId !== colId) setDragOverColId(colId)
  }

  const handleColDrop = async (sourceId, targetColId) => {
    if (!sourceId || sourceId === targetColId) {
      setDragColId(null)
      setDragOverColId(null)
      return
    }

    const ids = columns.map(c => c.id)
    const fromIdx = ids.indexOf(sourceId)
    const toIdx = ids.indexOf(targetColId)
    if (fromIdx < 0 || toIdx < 0) return
    ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, sourceId)

    setDragColId(null)
    setDragOverColId(null)
    onReorderColumns(ids)
  }

  const handleColDragEnd = () => {
    setDragColId(null)
    setDragOverColId(null)
  }

  // ── Column CRUD ──
  const startEditColumn = (col) => {
    setEditingColId(col.id)
    setEditingName(col.name)
  }

  const saveColumnName = async () => {
    if (editingName.trim() && editingColId) {
      await api.updateColumn(editingColId, editingName.trim())
      await onRefresh()
    }
    setEditingColId(null)
  }

  const deleteColumn = async (colId) => {
    if (!confirm('Delete this column? Jobs will be moved to the first column.')) return
    await api.deleteColumn(colId)
    await onRefresh()
  }

  const addColumn = async () => {
    if (!newColName.trim()) return
    await api.createColumn(newColName.trim())
    setNewColName('')
    setAddingColumn(false)
    await onRefresh()
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

  return (
    <div className="kanban">
      <ReminderSummary reminders={reminders} onFilter={setReminderFilter} />

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
          const isColDragging = dragColId === col.id
          const isColDropTarget = dragOverColId === col.id && dragColId !== col.id

          return (
            <div
              key={col.id}
              className={`kanban-column ${dragOverCol === col.name ? 'card-drag-over' : ''} ${isColDragging ? 'col-dragging' : ''} ${isColDropTarget ? 'col-drop-target' : ''}`}
              onDragOver={(e) => {
                handleCardDragOver(e, col.name)
                handleColDragOver(e, col.id)
              }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { setDragOverCol(null); setDragOverColId(null) } }}
              onDrop={(e) => {
                e.preventDefault()
                const colId = e.dataTransfer.getData('column-id')
                const jobId = e.dataTransfer.getData('job-id')
                setDragOverCol(null)
                setDragOverColId(null)
                if (colId) handleColDrop(colId, col.id)
                else if (jobId) handleCardDrop(jobId, col.name)
              }}
            >
              <div
                className="kanban-column-header"
                draggable
                onDragStart={(e) => handleColDragStart(e, col.id)}
                onDragEnd={handleColDragEnd}
              >
                <div className="kanban-col-drag-handle" title="Drag to reorder column">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="5" cy="3" r="1.3"/><circle cx="11" cy="3" r="1.3"/>
                    <circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/>
                    <circle cx="5" cy="13" r="1.3"/><circle cx="11" cy="13" r="1.3"/>
                  </svg>
                </div>
                {editingColId === col.id ? (
                  <input
                    className="kanban-col-edit-input"
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onBlur={saveColumnName}
                    onKeyDown={e => { if (e.key === 'Enter') saveColumnName(); if (e.key === 'Escape') setEditingColId(null) }}
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span className="kanban-col-title" onDoubleClick={() => startEditColumn(col)}>
                    {col.name}
                  </span>
                )}
                <span className="kanban-col-count">{colJobs.length}</span>
                <div className="kanban-col-actions">
                  <button className="kanban-col-btn" onClick={() => startEditColumn(col)} title="Rename">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                  </button>
                  {columns.length > 1 && !col.is_default && (
                    <button className="kanban-col-btn danger" onClick={() => deleteColumn(col.id)} title="Delete column">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                  )}
                </div>
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

        {/* Add Column */}
        <div className="kanban-column kanban-add-column">
          {addingColumn ? (
            <div className="kanban-add-col-form">
              <input
                className="kanban-col-edit-input"
                value={newColName}
                onChange={e => setNewColName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addColumn(); if (e.key === 'Escape') setAddingColumn(false) }}
                placeholder="Column name..."
                autoFocus
              />
              <div className="kanban-add-col-btns">
                <button className="btn btn-primary btn-sm" onClick={addColumn}>Add</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAddingColumn(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="kanban-add-col-btn" onClick={() => setAddingColumn(true)}>
              + Add Column
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
