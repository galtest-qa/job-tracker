import React, { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'
import ResumeDiff from './ResumeDiff.jsx'
import ResumePreview from './ResumePreview.jsx'

// ── Utility: export to .doc ────────────────────────────────────────────────

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function generateDocx(text, company, role) {
  const lines = text.split('\n')
  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<style>
  @page { margin: 0.75in; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #222; white-space: pre-wrap; }
  .line { margin: 0; padding: 0; min-height: 1em; }
  .bold { font-weight: bold; }
  .header { font-size: 11pt; font-weight: bold; text-transform: uppercase; border-bottom: 1pt solid #666; padding-bottom: 2pt; margin-top: 8pt; }
  .name { font-size: 18pt; font-weight: bold; text-align: center; }
  .contact { text-align: center; font-size: 9.5pt; color: #444; }
</style>
</head><body>`

  const SECTION_RE = /^[A-Z][A-Z\s&\/]{2,}$/
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()
    if (!trimmed) { html += '<div class="line">&nbsp;</div>'; continue }
    const isFirstContent = i === 0 || (i <= 2 && !lines.slice(0, i).some(l => l.trim()))
    if (isFirstContent && !SECTION_RE.test(trimmed) && trimmed.length < 60) {
      html += `<div class="line name">${esc(trimmed)}</div>`; continue
    }
    if (i <= 3 && (trimmed.includes('@') || trimmed.includes('+') || trimmed.includes('linkedin'))) {
      html += `<div class="line contact">${esc(trimmed)}</div>`; continue
    }
    if (SECTION_RE.test(trimmed)) {
      html += `<div class="line header">${esc(trimmed)}</div>`; continue
    }
    const isBold = /\d{4}/.test(trimmed) && (trimmed.includes('|') || trimmed.includes('–') || trimmed.includes(' - '))
    html += `<div class="line${isBold ? ' bold' : ''}">${esc(raw)}</div>`
  }
  html += '</body></html>'
  const blob = new Blob(['﻿' + html], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Resume_${company.replace(/[^a-zA-Z0-9]/g, '_')}_${role.replace(/[^a-zA-Z0-9]/g, '_')}.doc`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Utility: section append for suggestion apply ───────────────────────────

function isSectionHeader(line) {
  const t = line.trim()
  if (!t || t.length < 2 || t.length > 60) return false
  return /^[A-Z][A-Z\s&\/\-]{2,}$/.test(t) || /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/.test(t)
}

function appendToSection(text, sectionName, newLine, isNewSection) {
  if (!sectionName) return text + '\n' + newLine
  const lines = text.split('\n')
  const needle = sectionName.trim().toLowerCase()
  let sectionStart = -1
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim().toLowerCase()
    if (isSectionHeader(lines[i]) && (t === needle || t.includes(needle) || needle.includes(t))) {
      sectionStart = i; break
    }
  }
  if (sectionStart >= 0) {
    let j = sectionStart + 1
    while (j < lines.length && !isSectionHeader(lines[j])) j++
    let insertIdx = j
    while (insertIdx > sectionStart + 1 && lines[insertIdx - 1].trim() === '') insertIdx--
    const bullet = (newLine.startsWith('-') || newLine.startsWith('•')) ? '' : '- '
    lines.splice(insertIdx, 0, bullet + newLine)
  } else {
    const langIdx = lines.findIndex(l => /^languages\s*$/i.test(l.trim()))
    const insertAt = langIdx >= 0 ? langIdx : lines.length
    const bullet = (newLine.startsWith('-') || newLine.startsWith('•')) ? '' : '- '
    lines.splice(insertAt, 0, '', sectionName.toUpperCase(), bullet + newLine)
  }
  return lines.join('\n')
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ScoreBar({ current, potential }) {
  const currentPct = Math.min(100, Math.max(0, current))
  const gapPct = Math.min(100 - currentPct, Math.max(0, potential - current))
  return (
    <div className="rc-score-bar-track">
      <div className="rc-score-bar-current" style={{ width: `${currentPct}%` }} />
      <div className="rc-score-bar-potential" style={{ width: `${gapPct}%` }} />
    </div>
  )
}

function OpportunityCard({ opp, active, onImprove }) {
  const impactColor = opp.impact_score >= 8 ? 'high' : opp.impact_score >= 5 ? 'mid' : 'low'
  return (
    <div className={`rc-opportunity-card ${active ? 'rc-opportunity-card--active' : ''}`}>
      <div className="rc-opportunity-header">
        <span className="rc-opportunity-title">{opp.title}</span>
        <span className={`rc-impact-badge rc-impact-badge--${impactColor}`}>
          {opp.impact_score}/10
        </span>
      </div>
      <p className="rc-opportunity-explanation">{opp.explanation}</p>
      {opp.target_statement && (
        <div className="rc-target-statement">❝ {opp.target_statement} ❞</div>
      )}
      <button
        className={`btn btn-sm ${active ? 'btn-ghost' : 'btn-primary'}`}
        onClick={() => onImprove(opp)}
      >
        {active ? 'Coaching open ↓' : 'Improve →'}
      </button>
    </div>
  )
}

function CoachingPanel({ coaching, onAnswer, onGenerate, onApply, onClose }) {
  const { opportunity, answers, generating, result, applying, applied, applyFailed } = coaching
  const allAnswered = answers.some(a => a.trim())

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  return (
    <div className="rc-coaching-panel">
      <div className="rc-coaching-panel-header">
        <span className="rc-coaching-panel-title">{opportunity.title}</span>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
      </div>

      {opportunity.target_statement && (
        <div className="rc-coaching-statement">
          <span className="rc-coaching-statement-label">Targeting this statement:</span>
          <blockquote className="rc-coaching-quote">❝ {opportunity.target_statement} ❞</blockquote>
        </div>
      )}

      {!result && (
        <>
          <p className="rc-coaching-intro">
            Answer what you can — the AI will use your answers to write a stronger version.
          </p>
          <div className="rc-coaching-questions">
            {(opportunity.questions || []).map((q, i) => (
              <div key={i} className="rc-coaching-question">
                <label className="rc-coaching-q-label">{i + 1}. {q}</label>
                <input
                  className="rc-coaching-input"
                  type="text"
                  value={answers[i] || ''}
                  onChange={e => onAnswer(i, e.target.value)}
                  placeholder="Your answer…"
                  disabled={generating}
                />
              </div>
            ))}
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={onGenerate}
            disabled={generating || !allAnswered}
          >
            {generating ? 'Generating…' : 'Generate Improvement'}
          </button>
        </>
      )}

      {result && (
        <div className="rc-coaching-result">
          <div className="rc-result-row rc-result-original">
            <span className="rc-result-label">Original</span>
            <p className="rc-result-text rc-result-text--old">{result.original}</p>
          </div>
          <div className="rc-result-row rc-result-improved">
            <span className="rc-result-label">Improved</span>
            <p className="rc-result-text rc-result-text--new">{result.improved}</p>
          </div>
          {result.reason && (
            <p className="rc-result-reason">{result.reason}</p>
          )}
          {result.score_improvement > 0 && (
            <div className="rc-result-delta">+{result.score_improvement} Resume Score</div>
          )}

          {applyFailed ? (
            <div className="rc-apply-failed">
              <p>The original text wasn't found exactly in the resume — a previous edit may have already changed it.</p>
              <button className="btn btn-secondary btn-sm" onClick={() => copyToClipboard(result.improved)}>
                Copy improved bullet
              </button>
            </div>
          ) : applied ? (
            <div className="rc-apply-success">✓ Applied to resume</div>
          ) : (
            <div className="rc-result-actions">
              <button className="btn btn-primary btn-sm" onClick={onApply} disabled={applying}>
                {applying ? 'Applying…' : 'Apply Change'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(result.improved)}>
                Copy
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AtsSection({ atsKeywords }) {
  const [open, setOpen] = useState(false)
  const found = atsKeywords?.found_in_resume || []
  const missing = atsKeywords?.missing_from_resume || []
  const injected = atsKeywords?.injected_by_edits || []
  const total = found.length + missing.length + injected.length
  const covered = found.length + injected.length
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0

  return (
    <div className="rc-ats-section">
      <button className="rc-ats-toggle" onClick={() => setOpen(o => !o)}>
        <span>ATS Keywords</span>
        <span className="rc-ats-summary">
          {covered}/{total} covered
          <span className="rc-ats-chevron">{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && (
        <div className="rc-ats-body">
          <div className="rc-ats-bar-track">
            <div className="rc-ats-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          {found.length > 0 && (
            <div className="rc-ats-group">
              <span className="rc-ats-group-label rc-ats-group-label--found">✓ Found ({found.length})</span>
              <div className="rc-ats-chips">
                {found.map(k => <span key={k} className="rc-ats-chip rc-ats-chip--found">{k}</span>)}
              </div>
            </div>
          )}
          {injected.length > 0 && (
            <div className="rc-ats-group">
              <span className="rc-ats-group-label rc-ats-group-label--injected">+ Injected ({injected.length})</span>
              <div className="rc-ats-chips">
                {injected.map(k => <span key={k} className="rc-ats-chip rc-ats-chip--injected">{k}</span>)}
              </div>
            </div>
          )}
          {missing.length > 0 && (
            <div className="rc-ats-group">
              <span className="rc-ats-group-label rc-ats-group-label--missing">✗ Missing ({missing.length})</span>
              <div className="rc-ats-chips">
                {missing.map(k => <span key={k} className="rc-ats-chip rc-ats-chip--missing">{k}</span>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ResumeTab({ job, setJob, jobId }) {
  const [originalResume, setOriginalResume] = useState(null)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [appliedSuggestions, setAppliedSuggestions] = useState(new Set())
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(null)
  const [tailoring, setTailoring] = useState(false)
  const [tailorError, setTailorError] = useState(null)
  const [coaching, setCoaching] = useState(null)
  const [tailoredOpen, setTailoredOpen] = useState(false)
  const diffRef = useRef(null)

  useEffect(() => {
    if (job.tailored_resume) setEditText(job.tailored_resume)
  }, [job.tailored_resume])

  useEffect(() => {
    api.getResume().then(r => setOriginalResume(r?.raw_text || '')).catch(() => setOriginalResume(''))
  }, [])

  const resumeLoaded = originalResume !== null
  const hasAnalysis = !!(job.resume_score?.current_score)
  const opportunities = job.resume_score?.coaching_opportunities || []

  // ── Analyze ──────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setAnalyzeError(null)
    setCoaching(null)
    try {
      const updated = await api.analyzeResume(jobId)
      setJob(updated)
    } catch (err) {
      setAnalyzeError(err.message)
    }
    setAnalyzing(false)
  }

  // ── Tailor (secondary action) ─────────────────────────────────────────────

  const handleTailor = async () => {
    setTailoring(true)
    setTailorError(null)
    try {
      const updated = await api.tailorResume(jobId)
      setJob(updated)
      if (updated.tailored_resume) {
        setEditText(updated.tailored_resume)
        setTailoredOpen(true)
      }
    } catch (err) {
      setTailorError(err.message)
    }
    setTailoring(false)
  }

  // ── Coaching ──────────────────────────────────────────────────────────────

  const openCoaching = (opp) => {
    setCoaching({
      opportunity: opp,
      answers: new Array((opp.questions || []).length).fill(''),
      generating: false,
      result: null,
      applying: false,
      applied: false,
      applyFailed: false,
    })
    // Scroll coaching panel into view after render
    setTimeout(() => {
      document.querySelector('.rc-coaching-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }

  const handleAnswer = (idx, val) => {
    setCoaching(prev => {
      const answers = [...prev.answers]
      answers[idx] = val
      return { ...prev, answers }
    })
  }

  const handleGenerate = async () => {
    if (!coaching) return
    setCoaching(prev => ({ ...prev, generating: true, result: null }))
    try {
      const result = await api.coachGenerate(
        jobId,
        coaching.opportunity,
        coaching.opportunity.target_statement,
        coaching.answers,
      )
      setCoaching(prev => ({ ...prev, generating: false, result }))
    } catch {
      setCoaching(prev => ({ ...prev, generating: false }))
    }
  }

  const handleApplyCoach = async () => {
    if (!coaching?.result) return
    const { original, improved } = coaching.result
    const base = editText || job.tailored_resume || originalResume || ''

    // Exact match required — never silently replace fuzzy matches
    if (!base.includes(original)) {
      setCoaching(prev => ({ ...prev, applyFailed: true }))
      return
    }

    setCoaching(prev => ({ ...prev, applying: true, applyFailed: false }))
    const newText = base.replace(original, improved)
    setEditText(newText)
    try {
      await api.updateJob(jobId, { tailored_resume: newText })
      setJob(prev => ({ ...prev, tailored_resume: newText }))
      setCoaching(prev => ({ ...prev, applying: false, applied: true }))
      setTailoredOpen(true)
    } catch {
      setCoaching(prev => ({ ...prev, applying: false }))
    }
  }

  // ── Existing edit/apply utilities ─────────────────────────────────────────

  const handleSaveEdit = async () => {
    setSaving(true)
    await api.updateJob(jobId, { tailored_resume: editText })
    setJob({ ...job, tailored_resume: editText })
    setSaving(false)
    setIsEditing(false)
  }

  const handleApplyDiff = async (newText) => {
    setEditText(newText)
    setSaving(true)
    await api.updateJob(jobId, { tailored_resume: newText })
    setJob({ ...job, tailored_resume: newText })
    setSaving(false)
  }

  const handleApplySuggestion = async (idx, imp) => {
    let currentText = editText || job.tailored_resume
    const suggested = imp.suggested || imp.suggestion || ''
    if (imp.original && imp.original.trim()) {
      if (currentText.includes(imp.original)) {
        currentText = currentText.replace(imp.original, suggested)
      } else {
        const snippet = imp.original.slice(0, 30)
        const si = currentText.indexOf(snippet)
        if (si >= 0) {
          const endIdx = currentText.indexOf('\n', si)
          currentText = currentText.slice(0, si) + suggested + (endIdx >= 0 ? currentText.slice(endIdx) : '')
        } else {
          currentText = appendToSection(currentText, imp.section, suggested)
        }
      }
    } else {
      currentText = appendToSection(currentText, imp.section, suggested, imp.type === 'new_section')
    }
    setEditText(currentText)
    await api.updateJob(jobId, { tailored_resume: currentText })
    setJob({ ...job, tailored_resume: currentText })
    setAppliedSuggestions(prev => new Set([...prev, idx]))
  }

  const handleExport = () => {
    const text = diffRef.current?.getEffectiveText() || editText || job.tailored_resume
    if (!text) return
    generateDocx(text, job.company, job.role)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="resume-tab">
      {resumeLoaded && !originalResume && (
        <div className="info-banner info-banner-warn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          No resume uploaded yet. Upload your resume using the button in the top header.
        </div>
      )}

      {/* Primary action bar */}
      <div className="rc-action-bar">
        <button
          className="btn btn-primary"
          onClick={handleAnalyze}
          disabled={analyzing || !originalResume}
        >
          {analyzing ? 'Analyzing…' : hasAnalysis ? 'Re-analyze' : 'Analyze Resume'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleTailor}
          disabled={tailoring || !originalResume}
          title="Generate keyword-optimized version of your resume"
        >
          {tailoring ? 'Tailoring…' : 'Tailor Resume'}
        </button>
        {(editText || job.tailored_resume) && (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPreview(true)}>Preview</button>
            <button className="btn btn-ghost btn-sm" onClick={handleExport}>Export .docx</button>
          </>
        )}
      </div>

      {(analyzeError || tailorError) && (
        <div className="rc-error">{analyzeError || tailorError}</div>
      )}

      {/* Empty state */}
      {!hasAnalysis && !analyzing && (
        <div className="rc-empty-state">
          <div className="rc-empty-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </div>
          <p className="rc-empty-title">Analyze your resume against this role</p>
          <p className="rc-empty-sub">
            Get a match score, discover the highest-impact improvements, and work with an AI coach to strengthen specific bullets.
          </p>
        </div>
      )}

      {/* Score card */}
      {hasAnalysis && (
        <div className="rc-score-card">
          <div className="rc-score-header">
            <span className="rc-score-label">Resume Match Score</span>
            <div className="rc-score-numbers">
              <span className="rc-score-current">{job.resume_score.current_score}</span>
              <span className="rc-score-arrow">→</span>
              <span className="rc-score-potential">{job.resume_score.potential_score}</span>
              <span className="rc-score-potential-label">potential</span>
            </div>
          </div>
          <ScoreBar
            current={job.resume_score.current_score}
            potential={job.resume_score.potential_score}
          />
          <div className="rc-score-tags">
            {(job.resume_score.strengths || []).map((s, i) => (
              <span key={i} className="rc-score-tag rc-score-tag--strength">✓ {s}</span>
            ))}
            {(job.resume_score.gaps || []).map((g, i) => (
              <span key={i} className="rc-score-tag rc-score-tag--gap">⚠ {g}</span>
            ))}
          </div>
          {job.resume_score.analyzed_at && (
            <span className="rc-score-analyzed-at">
              Analyzed {new Date(job.resume_score.analyzed_at).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {/* Coaching opportunities */}
      {opportunities.length > 0 && (
        <div className="rc-opportunities-section">
          <h4 className="rc-section-title">Top Coaching Opportunities</h4>
          <div className="rc-opportunity-list">
            {opportunities.map(opp => (
              <OpportunityCard
                key={opp.id}
                opp={opp}
                active={coaching?.opportunity?.id === opp.id}
                onImprove={openCoaching}
              />
            ))}
          </div>
        </div>
      )}

      {/* Coaching panel */}
      {coaching && (
        <CoachingPanel
          coaching={coaching}
          onAnswer={handleAnswer}
          onGenerate={handleGenerate}
          onApply={handleApplyCoach}
          onClose={() => setCoaching(null)}
        />
      )}

      {/* ATS keywords */}
      {job.ats_keywords && (
        <AtsSection atsKeywords={job.ats_keywords} />
      )}

      {/* Tailored resume + diff + suggestions — collapsible */}
      {(job.tailored_resume || job.resume_improvements?.length > 0) && (
        <div className="rc-tailored-section">
          <button
            className="rc-tailored-toggle"
            onClick={() => setTailoredOpen(o => !o)}
          >
            <span>Tailored Resume &amp; Suggestions</span>
            <span className="rc-tailored-chevron">{tailoredOpen ? '▲' : '▼'}</span>
          </button>

          {tailoredOpen && (
            <div className="rc-tailored-body">
              {job.tailored_resume && (
                <div className="resume-editor-section">
                  <div className="resume-editor-header">
                    <h4>Tailored Resume</h4>
                    <button className="btn btn-ghost btn-sm" onClick={() => setIsEditing(!isEditing)}>
                      {isEditing ? 'Done Editing' : 'Edit'}
                    </button>
                  </div>
                  {isEditing ? (
                    <>
                      <textarea
                        className="notes-textarea resume-edit-textarea"
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        rows={18}
                      />
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={handleSaveEdit}
                        disabled={saving}
                        style={{ marginTop: '0.5rem' }}
                      >
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </>
                  ) : (
                    <pre className="description-text">{job.tailored_resume}</pre>
                  )}
                </div>
              )}

              {originalResume && job.tailored_resume && (
                <div className="resume-changes-section">
                  <h4>Changes from Original</h4>
                  <ResumeDiff
                    ref={diffRef}
                    original={originalResume}
                    tailored={job.tailored_resume}
                    onApply={handleApplyDiff}
                  />
                </div>
              )}

              {job.resume_improvements?.length > 0 && (
                <div className="resume-suggestions-section">
                  <h4>Suggestions</h4>
                  <p className="muted" style={{ marginBottom: '0.5rem' }}>Click "Apply" to add to your resume.</p>
                  <div className="improvements-list">
                    {job.resume_improvements.map((imp, i) => {
                      const isApplied = appliedSuggestions.has(i)
                      return (
                        <div key={i} className={`suggestion-card ${isApplied ? 'applied' : ''}`}>
                          <div className="suggestion-card-header">
                            <span className="suggestion-card-section">{imp.section || imp.category}</span>
                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                              {imp.impact === 'high' && <span className="suggestion-impact-high">High impact</span>}
                              <span className={`suggestion-card-type ${imp.type === 'new_section' ? 'new-section' : ''}`}>
                                {imp.type === 'new_section' ? 'New Section' : imp.type || 'suggestion'}
                              </span>
                            </div>
                          </div>
                          {imp.type === 'new_section' && (
                            <div className="suggestion-new-section-note">
                              This section doesn't exist in your resume yet. Applying will create it.
                            </div>
                          )}
                          {imp.original && (
                            <div className="suggestion-original">
                              <span className="suggestion-label">Current:</span> {imp.original}
                            </div>
                          )}
                          <div className="suggestion-new">
                            <span className="suggestion-label">
                              {imp.type === 'new_section' ? 'New section:' : imp.original ? 'Change to:' : 'Add:'}
                            </span>{' '}
                            {imp.suggested || imp.suggestion}
                          </div>
                          {imp.reason && <div className="suggestion-reason">{imp.reason}</div>}
                          <button
                            className={`btn btn-sm ${isApplied ? 'btn-ghost' : 'btn-primary'}`}
                            onClick={() => handleApplySuggestion(i, imp)}
                            disabled={isApplied}
                          >
                            {isApplied ? 'Applied' : 'Apply'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showPreview && (
        <ResumePreview
          text={editText || job.tailored_resume}
          company={job.company}
          role={job.role}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  )
}
