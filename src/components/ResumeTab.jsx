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

// ── Fuzzy apply: semantic + similarity matching ───────────────────────────
// Three-level strategy so minor formatting/whitespace changes never block
// the user from applying an improvement.

function bigramSimilarity(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  const bg = s => { const r = new Set(); for (let i = 0; i < s.length - 1; i++) r.add(s[i] + s[i + 1]); return r }
  const ba = bg(a), bb = bg(b)
  const inter = [...ba].filter(x => bb.has(x)).length
  return inter / (ba.size + bb.size - inter)
}

// Returns { text: string|null, matchType: 'exact'|'normalized'|'fuzzy'|'failed', confidence?: number }
function applyImprovement(resume, original, improved) {
  if (!resume || !original || !improved) return { text: null, matchType: 'failed' }

  // 1. Exact match
  if (resume.includes(original)) {
    return { text: resume.replace(original, improved), matchType: 'exact' }
  }

  // 2. Whitespace-normalized match (handles copy-paste artifacts)
  const norm = s => s.replace(/\s+/g, ' ').trim()
  const nResume = norm(resume), nOrig = norm(original)
  if (nResume.includes(nOrig)) {
    return { text: nResume.replace(nOrig, norm(improved)), matchType: 'normalized' }
  }

  // 3. Line-level bigram similarity (handles minor wording drift since analysis)
  const resumeLines = resume.split('\n')
  const origFirstLine = norm(original.trim().split('\n')[0])
  const origLineCount = original.trim().split('\n').length

  let bestIdx = -1, bestSim = 0
  resumeLines.forEach((line, i) => {
    const sim = bigramSimilarity(norm(line), origFirstLine)
    if (sim > bestSim && sim >= 0.62) { bestSim = sim; bestIdx = i }
  })

  if (bestIdx >= 0) {
    const impLines = improved.trim().split('\n')
    return {
      text: [
        ...resumeLines.slice(0, bestIdx),
        ...impLines,
        ...resumeLines.slice(bestIdx + origLineCount),
      ].join('\n'),
      matchType: 'fuzzy',
      confidence: Math.round(bestSim * 100),
    }
  }

  return { text: null, matchType: 'failed' }
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

// ── Coaching Session (guided, linear, one improvement at a time) ───────────
// Replaces the old side-panel. Manages its own walk through all opportunities.

function CoachingSession({ opportunities, baseScore, resumeText, job, jobId, setJob, setEditText, onExit }) {
  const [idx, setIdx]         = useState(0)
  const [step, setStep]       = useState('questions')   // 'questions' | 'result'
  const [answers, setAnswers] = useState(() => new Array((opportunities[0]?.questions || []).length).fill(''))
  const [generating, setGenerating] = useState(false)
  const [result, setResult]   = useState(null)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)         // applied in this step
  const [matchType, setMatchType] = useState(null)
  const [scoreGain, setScoreGain] = useState(0)         // cumulative gain across session
  const [stepGain, setStepGain]   = useState(0)         // gain from this improvement

  const opp = opportunities[idx]
  const isLast = idx >= opportunities.length - 1
  const estimatedScore = Math.min(100, baseScore + scoreGain)

  const copy = text => navigator.clipboard.writeText(text).catch(() => {})

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const r = await api.coachGenerate(jobId, opp, opp.target_statement, answers)
      setResult(r)
      setStepGain(r.score_improvement || 0)
      setStep('result')
    } catch {}
    setGenerating(false)
  }

  const handleApply = async () => {
    if (!result || applied) return
    const currentText = resumeText || ''
    const { text, matchType: mt } = applyImprovement(currentText, result.original, result.improved)
    setMatchType(mt)
    if (mt !== 'failed' && text) {
      setApplying(true)
      setEditText(text)
      try {
        await api.updateJob(jobId, { tailored_resume: text })
        setJob(prev => ({ ...prev, tailored_resume: text }))
        setScoreGain(g => g + (result.score_improvement || 0))
        setApplied(true)
      } catch {}
      setApplying(false)
    }
  }

  const moveNext = () => {
    if (isLast) { onExit(scoreGain); return }
    const next = opportunities[idx + 1]
    setIdx(i => i + 1)
    setStep('questions')
    setAnswers(new Array((next?.questions || []).length).fill(''))
    setResult(null)
    setApplied(false)
    setMatchType(null)
    setStepGain(0)
  }

  const progressPct = Math.round((idx / opportunities.length) * 100)
  const oppType = opp.type || (opp.title?.toLowerCase().includes('keyword') ? 'Keyword gap'
    : opp.title?.toLowerCase().includes('bullet') ? 'Bullet strength'
    : opp.title?.toLowerCase().includes('quant') ? 'Quantification'
    : 'Improvement')

  return (
    <div className="rc-session">

      {/* ── Progress bar header ── */}
      <div className="rc-session-header">
        <div className="rc-session-toprow">
          <span className="rc-session-step">Step {idx + 1} of {opportunities.length}</span>
          <button className="rc-session-exit" onClick={() => onExit(scoreGain)} title="Exit coaching">✕</button>
        </div>
        <div className="rc-session-bar-track">
          <div className="rc-session-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
        {scoreGain > 0 && (
          <p className="rc-session-gain-line">+{scoreGain} pts gained this session</p>
        )}
      </div>

      {/* ── Improvement card ── */}
      <div className="rc-session-card">
        <span className="rc-session-type-badge">{oppType}</span>
        <h3 className="rc-session-title">{opp.title}</h3>
        {opp.target_statement && (
          <p className="rc-session-target">{opp.target_statement}</p>
        )}
      </div>

      {/* ── Questions step ── */}
      {step === 'questions' && (
        <div className="rc-session-questions">
          {(opp.questions || []).map((q, i) => (
            <div key={i} className="rc-session-q">
              <label className="rc-session-q-label">{q}</label>
              <textarea
                className="rc-session-q-input"
                rows={2}
                value={answers[i] || ''}
                onChange={e => { const a = [...answers]; a[i] = e.target.value; setAnswers(a) }}
                placeholder="Optional — helps generate a more specific improvement"
                disabled={generating}
              />
            </div>
          ))}
          <div className="rc-session-actions">
            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
              {generating ? <><span className="rc-spinner" />Generating…</> : 'Generate improvement'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={moveNext}>
              {isLast ? 'Skip & finish' : 'Skip →'}
            </button>
          </div>
        </div>
      )}

      {/* ── Result step ── */}
      {step === 'result' && result && (
        <div className="rc-session-result">

          {/* Before → After */}
          <div className="rc-result-comparison">
            <div className="rc-result-before">
              <span className="rc-result-label">Before</span>
              <p className="rc-result-text">{result.original}</p>
            </div>
            <div className="rc-result-arrow">↓</div>
            <div className="rc-result-after">
              <span className="rc-result-label">After</span>
              <p className="rc-result-text rc-result-text--improved">{result.improved}</p>
            </div>
          </div>

          {/* Match quality note — only when relevant */}
          {matchType === 'failed' && !applied && (
            <p className="rc-result-note rc-result-note--warn">
              Text not found — resume may have been edited. Copy the improved version manually.
            </p>
          )}
          {matchType === 'fuzzy' && applied && (
            <p className="rc-result-note">Applied with fuzzy match — review the change.</p>
          )}

          {/* Actions */}
          <div className="rc-session-actions">
            {!applied && matchType !== 'failed' && (
              <button className="btn btn-primary" onClick={handleApply} disabled={applying}>
                {applying ? 'Applying…' : stepGain > 0 ? `Apply · +${stepGain} pts` : 'Apply'}
              </button>
            )}
            {applied && <span className="rc-session-applied">✓ Applied</span>}
            <button className="btn btn-ghost btn-sm" onClick={() => copy(result.improved)}>Copy</button>
            <button className="btn btn-ghost btn-sm" onClick={moveNext}>
              {isLast ? (applied ? 'Finish' : 'Skip & finish') : (applied ? 'Next →' : 'Skip →')}
            </button>
          </div>
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
  const [coaching, setCoaching] = useState(null)   // kept for ATS + suggestion flow
  const [sessionMode, setSessionMode] = useState(false)
  const [sessionGain, setSessionGain] = useState(0) // pts earned in last session
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
    setSessionMode(false)
    try {
      const updated = await api.analyzeResume(jobId)
      setJob(updated)
      // Auto-enter coaching immediately — skip the list screen
      if (updated.resume_score?.coaching_opportunities?.length > 0) {
        setSessionMode(true)
      }
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
    const { text, matchType } = applyImprovement(base, original, improved)

    if (matchType === 'failed' || !text) {
      setCoaching(prev => ({ ...prev, applyFailed: true }))
      return
    }

    setCoaching(prev => ({ ...prev, applying: true, applyFailed: false }))
    setEditText(text)
    try {
      await api.updateJob(jobId, { tailored_resume: text })
      setJob(prev => ({ ...prev, tailored_resume: text }))
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

      {/* ── Entry — one clear action ── */}
      {!sessionMode && (
        <div className="rc-entry">
          {!hasAnalysis ? (
            <>
              <button
                className="btn btn-primary rc-entry-cta"
                onClick={handleAnalyze}
                disabled={analyzing || !originalResume}
                title={!originalResume ? 'Upload your resume first' : ''}
              >
                {analyzing
                  ? <><span className="rc-spinner" />Analyzing your resume…</>
                  : '✦ Analyze & Improve'}
              </button>
              {!analyzing && (
                <p className="rc-entry-hint">
                  Finds keyword gaps, scores your match, and walks you through improvements one at a time.
                </p>
              )}
            </>
          ) : (
            <div className="rc-entry-tools">
              <button className="btn btn-ghost btn-sm" onClick={handleAnalyze} disabled={analyzing}>
                {analyzing ? 'Re-analyzing…' : 'Re-analyze'}
              </button>
              {(editText || job.tailored_resume) && <>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowPreview(true)}>Preview</button>
                <button className="btn btn-ghost btn-sm" onClick={handleExport} disabled={exporting}>
                  {exporting ? 'Exporting…' : 'Export .docx'}
                </button>
              </>}
            </div>
          )}
          {(analyzeError || tailorError) && (
            <p className="rc-entry-error">{analyzeError || tailorError}</p>
          )}
        </div>
      )}

      {/* Score card — simplified */}
      {hasAnalysis && !sessionMode && (
        <div className="rc-score-card">
          <div className="rc-score-header">
            <div className="rc-score-numbers">
              <span className="rc-score-current">
                {Math.min(100, job.resume_score.current_score + sessionGain)}
              </span>
              <div className="rc-score-meta">
                <span className="rc-score-label">Resume Match</span>
                {sessionGain > 0 && (
                  <span className="rc-score-session-gain">+{sessionGain} from coaching</span>
                )}
              </div>
            </div>
            <span className="rc-score-potential-pill">{job.resume_score.potential_score} potential</span>
          </div>
          <ScoreBar
            current={Math.min(100, job.resume_score.current_score + sessionGain)}
            potential={job.resume_score.potential_score}
          />
        </div>
      )}

      {/* Coaching session — full-width, guided */}
      {sessionMode && opportunities.length > 0 && (
        <CoachingSession
          opportunities={opportunities}
          baseScore={Math.min(100, job.resume_score?.current_score + sessionGain)}
          resumeText={editText || job.tailored_resume || originalResume || ''}
          job={job}
          jobId={jobId}
          setJob={setJob}
          setEditText={setEditText}
          onExit={(gain) => {
            setSessionGain(g => g + gain)
            setSessionMode(false)
            if (gain > 0) setTailoredOpen(true)
          }}
        />
      )}

      {/* Opportunity list + start coaching CTA */}
      {hasAnalysis && !sessionMode && opportunities.length > 0 && (
        <div className="rc-opportunities-section">
          <div className="rc-opportunities-header">
            <span className="rc-section-title">{opportunities.length} improvement{opportunities.length !== 1 ? 's' : ''} identified</span>
            <button className="btn btn-primary btn-sm" onClick={() => setSessionMode(true)}>
              Start Coaching →
            </button>
          </div>
          <div className="rc-opportunity-list">
            {opportunities.map((opp, i) => (
              <div key={opp.id} className="rc-opp-row">
                <span className="rc-opp-num">{i + 1}</span>
                <div className="rc-opp-body">
                  <span className="rc-opp-title">{opp.title}</span>
                  <span className="rc-opp-explanation">{opp.explanation}</span>
                </div>
                <button
                  className="btn btn-ghost btn-sm rc-opp-jump"
                  onClick={() => { setSessionMode(true) }}
                >
                  →
                </button>
              </div>
            ))}
          </div>
        </div>
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
