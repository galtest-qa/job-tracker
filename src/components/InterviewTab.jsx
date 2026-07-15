import React, { useState, useEffect } from 'react'
import { Check, ChevronDown, Lock, Play } from 'lucide-react'
import { api, normalizeCompanyName } from '../api.js'
import VoiceInput from './VoiceInput.jsx'

// ── Readiness score v2 ─────────────────────────────────────────────────────
// Anti-inflation model: practice is weighted heavily, profile generation is not.
//
// Resume Fit   (35 pts) — from existing resume_score analysis
// Practice     (40 pts) — mock attempts + answer quality (avg score)
// Prep Done    (15 pts) — checklist items actually completed
// Research     (10 pts) — ATS analyzed + profile generated
// ──────────────────────────────────────────────────────────────────────────

function computeReadiness(job) {
  const profile = job.interview_profile || {}

  // 1. Resume Fit (0–35)
  const resumeFit = Math.round((job.resume_score?.current_score || 0) * 0.35)

  // 2. Practice (0–40): weighted by attempts AND quality
  const attempts = profile.mock_attempts || 0
  const avg = profile.avg_mock_score || 0
  let practice = 0
  if (attempts >= 1) practice = 18
  if (attempts >= 3) practice = 28
  if (attempts >= 5) practice = 35
  // Quality bonus (up to 5 pts) — encourages improving, not just submitting
  if (attempts > 0 && avg >= 8) practice = Math.min(40, practice + 5)
  else if (attempts > 0 && avg >= 7) practice = Math.min(40, practice + 3)
  else if (attempts > 0 && avg >= 6) practice = Math.min(40, practice + 1)

  // 3. Prep Completion (0–15): based on checklist items done, not generated
  const totalItems = profile.prep_checklist?.length || 0
  const doneItems = profile.checklist_done?.length || 0
  const prepDone = totalItems > 0 ? Math.round((doneItems / totalItems) * 15) : 0

  // 4. Research (0–10): low weight — generating is easy, doing is hard
  const atsAnalyzed = job.ats_keywords ? 5 : 0
  const profileGenerated = profile.generated_at ? 5 : 0
  const research = atsAnalyzed + profileGenerated

  const total = Math.min(100, resumeFit + practice + prepDone + research)

  const label =
    total >= 80 ? 'Well Prepared' :
    total >= 55 ? 'On Track' :
    total >= 30 ? 'Getting Ready' : 'Just Starting'

  const color =
    total >= 80 ? 'var(--success)' :
    total >= 55 ? 'var(--warning)' :
    total >= 30 ? 'var(--primary)' : 'var(--text-tertiary)'

  return { total, resumeFit, practice, prepDone, research, avg, attempts, label, color }
}

// ── Evidence confidence badge ──────────────────────────────────────────────
// Each badge carries a title tooltip so users understand what it means.

function ConfidenceBadge({ level }) {
  const map = {
    high: {
      label: 'Observed',
      cls: 'it-badge--observed',
      tip: "Based on documented reports of this company's interview process (Glassdoor, Reddit, blogs)",
    },
    medium: {
      label: 'Inferred',
      cls: 'it-badge--inferred',
      tip: 'Inferred from company size, stage, and industry patterns — not directly confirmed',
    },
    low: {
      label: 'Estimated',
      cls: 'it-badge--estimated',
      tip: 'Limited information available — best guess based on general interview patterns',
    },
  }
  const { label, cls, tip } = map[level] || map.low
  return <span className={`it-badge ${cls}`} title={tip}>{label}</span>
}

// Question source badge — shown in the mock interview picker and question lists
function QuestionSourceBadge({ q }) {
  if (!q.fromLibrary) return null
  if (!q.is_ai_generated && q.frequency >= 1) {
    return (
      <span
        className="it-badge it-badge--user-report"
        title="Reported by Job Maker users who interviewed at this company"
      >
        {q.frequency > 1 ? `×${q.frequency} reported` : 'User reported'}
      </span>
    )
  }
  if (q.frequency > 2) {
    return (
      <span
        className="it-badge it-badge--observed"
        title={`${q.frequency} users have seen this question at this company`}
      >
        ×{q.frequency} confirmed
      </span>
    )
  }
  return (
    <span
      className="it-badge it-badge--estimated"
      title="AI suggested — not yet confirmed by users"
    >
      AI suggested
    </span>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ReadinessCard({ readiness }) {
  const bars = [
    { label: 'Resume Fit', value: readiness.resumeFit, max: 35 },
    { label: 'Practice',   value: readiness.practice,  max: 40 },
    { label: 'Checklist',  value: readiness.prepDone,  max: 15 },
    { label: 'Research',   value: readiness.research,  max: 10 },
  ]
  return (
    <div className="it-readiness-card">
      <div className="it-readiness-left">
        <div className="it-readiness-score" style={{ color: readiness.color }}>
          {readiness.total}
        </div>
        <div className="it-readiness-label">{readiness.label}</div>
      </div>
      <div className="it-readiness-bars">
        {bars.map(b => (
          <div key={b.label} className="it-readiness-bar-row">
            <span className="it-readiness-bar-label">{b.label}</span>
            <div className="it-readiness-bar-track">
              <div
                className="it-readiness-bar-fill"
                style={{ width: `${(b.value / b.max) * 100}%`, background: readiness.color }}
              />
            </div>
            <span className="it-readiness-bar-pts">{b.value}/{b.max}</span>
          </div>
        ))}
        {readiness.attempts > 0 && (
          <div className="it-readiness-practice-note">
            {readiness.attempts} mock answer{readiness.attempts !== 1 ? 's' : ''} · avg {readiness.avg}/10
          </div>
        )}
      </div>
    </div>
  )
}

function StageCard({ stage, expanded, onToggle, libraryQuestions = [] }) {
  return (
    <div className={`it-stage-card ${expanded ? 'it-stage-card--open' : ''}`}>
      <button className="it-stage-header" onClick={onToggle}>
        <span className="it-stage-name">{stage.name}</span>
        <span className="it-stage-meta">
          {stage.format   && <span className="it-stage-tag">{stage.format}</span>}
          {stage.duration && <span className="it-stage-tag">{stage.duration}</span>}
          {stage.confidence && <ConfidenceBadge level={stage.confidence} />}
        </span>
        <ChevronDown size={15} className={`it-stage-chevron${expanded ? ' it-stage-chevron--open' : ''}`} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="it-stage-body">
          {stage.evidence_note && (
            <p className="it-evidence-note">
              <span className="it-evidence-icon">◎</span> {stage.evidence_note}
            </p>
          )}
          {stage.focus && <p className="it-stage-focus">{stage.focus}</p>}
          {stage.questions?.length > 0 && (
            <ul className="it-stage-questions">
              {stage.questions.map((q, i) => {
                // Find this question in the library to show its source status
                const libEntry = libraryQuestions?.find(
                  lq => lq.question.toLowerCase().trim() === q.toLowerCase().trim()
                )
                return (
                  <li key={i} className="it-stage-question">
                    <span>{q}</span>
                    {libEntry && (
                      <QuestionSourceBadge q={{ ...libEntry, fromLibrary: true }} />
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function ChecklistSection({ items, done, onToggle }) {
  return (
    <div className="it-checklist">
      {items.map((item, i) => {
        const checked = done.includes(i)
        return (
          <label key={i} className={`it-checklist-item ${checked ? 'it-checklist-item--done' : ''}`}>
            <input type="checkbox" checked={checked} onChange={() => onToggle(i)} />
            <span>{item}</span>
          </label>
        )
      })}
    </div>
  )
}

// ── Readiness chip + checkpoint path ───────────────────────────────────────

function ReadinessChip({ readiness }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="it-chip-wrap">
      <button className="it-chip" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="it-chip-dot" style={{ background: readiness.color }} aria-hidden="true" />
        <span className="it-chip-label">{readiness.label}</span>
        <span className="it-chip-score">{readiness.total}</span>
        <ChevronDown size={14} className={`it-stage-chevron${open ? ' it-stage-chevron--open' : ''}`} aria-hidden="true" />
      </button>
      {open && <ReadinessCard readiness={readiness} />}
    </div>
  )
}

// One station on the prep path.
// state: 'done' | 'current' | 'locked' | 'idle'  ·  variant: 'report' tints it
function Station({ num, title, sub, state, variant, open, onToggle, children }) {
  const clickable = state !== 'locked'
  return (
    <div className={`it-station it-station--${state}${variant ? ` it-station--${variant}` : ''}${open ? ' it-station--open' : ''}`}>
      <span className="it-station-rail" aria-hidden="true">
        <span className="it-station-marker">
          {state === 'done' ? <Check size={13} strokeWidth={2.6} /> : state === 'locked' ? <Lock size={11} /> : num}
        </span>
      </span>
      <div className="it-station-main">
        <button
          className="it-station-header"
          onClick={clickable ? onToggle : undefined}
          disabled={!clickable}
          aria-expanded={open}
        >
          <span className="it-station-titles">
            <span className="it-station-title">{title}</span>
            {sub && <span className="it-station-sub">{sub}</span>}
          </span>
          {clickable && (
            <ChevronDown size={15} className={`it-stage-chevron${open ? ' it-stage-chevron--open' : ''}`} aria-hidden="true" />
          )}
        </button>
        {open && clickable && <div className="it-station-body">{children}</div>}
      </div>
    </div>
  )
}

// ── Practice session (guided Q&A) ──────────────────────────────────────────

function PracticeSession({ questions, job, jobId, setJob, onExit }) {
  const [qIdx, setQIdx]       = useState(0)
  const [answer, setAnswer]   = useState('')
  const [scoring, setScoring] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState(null)

  const q = questions[qIdx]
  const isLast = qIdx >= questions.length - 1

  const handleScore = async () => {
    if (!answer.trim() || !q) return
    setScoring(true)
    setError(null)
    try {
      const r = await api.mockInterviewScore(jobId, { question: q.question, answer: answer.trim() })
      setJob(prev => {
        const pp = prev.interview_profile || {}
        const scores = [...(pp.mock_scores || []), r.score]
        const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10
        return { ...prev, interview_profile: { ...pp, mock_attempts: scores.length, mock_scores: scores, avg_mock_score: avg } }
      })
      setResult(r)
    } catch (err) {
      setError(err.message)
    }
    setScoring(false)
  }

  const moveNext = () => {
    if (isLast) { onExit(); return }
    setQIdx(i => i + 1)
    setAnswer('')
    setResult(null)
    setError(null)
  }

  if (!q) return null

  const scoreColor = result
    ? result.score >= 8 ? 'var(--success)' : result.score >= 6 ? 'var(--warning)' : 'var(--danger)'
    : 'var(--text)'

  const progressPct = Math.round((qIdx / questions.length) * 100)

  return (
    <div className="it-practice">
      {/* ── Progress bar header ── */}
      <div className="it-practice-header">
        <div className="it-practice-toprow">
          <span className="it-practice-step-label">Question {qIdx + 1} of {questions.length}</span>
          <button className="btn btn-ghost btn-sm it-practice-exit" onClick={onExit}>End</button>
        </div>
        <div className="it-practice-bar-track">
          <div className="it-practice-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* ── Question ── */}
      <div className="it-practice-question-wrap">
        {q.stage && (
          <span className="it-practice-type-badge">{q.stage.replace(/_/g, ' ')}</span>
        )}
        <p className="it-practice-question">"{q.question}"</p>
      </div>

      {/* ── Answer or Feedback ── */}
      {!result ? (
        <>
          <textarea
            className="it-mock-answer"
            rows={6}
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && answer.trim() && !scoring) {
                e.preventDefault(); handleScore()
              }
            }}
            placeholder="Speak or write your answer. Use a specific example — situation, what you did, and the result."
            disabled={scoring}
            autoFocus
          />
          <VoiceInput
            disabled={scoring}
            label="Answer by voice"
            onTranscript={t => setAnswer(a => (a.trim() ? a.trimEnd() + ' ' + t : t))}
          />
          {error && <div className="rc-error">{error}</div>}
          <div className="it-practice-btns">
            <button className="btn btn-primary" onClick={handleScore} disabled={scoring || !answer.trim()}>
              {scoring ? 'Scoring…' : 'Get feedback →'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={moveNext}>
              {isLast ? 'Finish' : 'Skip →'}
            </button>
            {answer.trim() && !scoring && <span className="it-kbd-hint">⌘↵ to submit</span>}
          </div>
        </>
      ) : (
        <div className="it-practice-feedback">
          {/* Score */}
          <div className="it-practice-score-row">
            <span className="it-practice-score" style={{ color: scoreColor }}>{result.score}/10</span>
            <span className="it-practice-score-label">
              {result.score >= 8 ? 'Strong' : result.score >= 6 ? 'Average' : 'Needs work'}
            </span>
          </div>

          {/* Strength */}
          {result.what_worked && (
            <div className="it-feedback-block">
              <span className="it-feedback-label">✓ What worked</span>
              <p>{result.what_worked}</p>
            </div>
          )}

          {/* One fix */}
          {result.to_improve && (
            <div className="it-feedback-block">
              <span className="it-feedback-label">△ One improvement</span>
              <p>{result.to_improve}</p>
            </div>
          )}

          {/* Stronger version — collapsed by default */}
          {result.stronger_version && (
            <details className="it-stronger-details">
              <summary className="it-stronger-summary">See stronger version</summary>
              <p className="it-stronger-text">{result.stronger_version}</p>
            </details>
          )}

          <button className="btn btn-primary" onClick={moveNext}>
            {isLast ? 'Finish session' : 'Next question →'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Stage report form ──────────────────────────────────────────────────────

const STAGE_OPTIONS = [
  { value: 'recruiter_screen', label: 'Recruiter Screen' },
  { value: 'hiring_manager',  label: 'Hiring Manager' },
  { value: 'technical',       label: 'Technical' },
  { value: 'culture',         label: 'Culture / Values' },
  { value: 'case_study',      label: 'Case Study / Take-home' },
  { value: 'panel',           label: 'Panel / Onsite' },
  { value: 'offer',           label: 'Offer' },
  { value: 'rejection',       label: 'Rejection' },
]

function StageReportForm({ job, jobId, onDone }) {
  const [stage, setStage]           = useState('')
  const [outcome, setOutcome]       = useState('')
  const [duration, setDuration]     = useState('')
  const [questions, setQuestions]   = useState('')
  const [notes, setNotes]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState(null)

  const handleSubmit = async () => {
    if (!stage) return
    setSaving(true)
    setError(null)
    try {
      await api.reportInterviewStage(jobId, {
        stage,
        outcome: outcome || undefined,
        duration_min: duration ? Number(duration) : undefined,
        questions_seen: questions.split('\n').map(q => q.trim()).filter(Boolean),
        notes: notes || undefined,
      })
      onDone()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <div className="it-stage-report-form">
      <div className="it-srf-row">
        <div className="it-srf-field">
          <label className="it-srf-label">Stage</label>
          <select className="it-srf-select" value={stage} onChange={e => setStage(e.target.value)}>
            <option value="">Select stage…</option>
            {STAGE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="it-srf-field">
          <label className="it-srf-label">Outcome</label>
          <select className="it-srf-select" value={outcome} onChange={e => setOutcome(e.target.value)}>
            <option value="">Unknown</option>
            <option value="passed">Passed</option>
            <option value="rejected">Rejected</option>
            <option value="pending">Pending</option>
            <option value="withdrew">Withdrew</option>
          </select>
        </div>
        <div className="it-srf-field it-srf-field--sm">
          <label className="it-srf-label">Duration (min)</label>
          <input className="it-srf-input" type="number" min="5" max="480" value={duration} onChange={e => setDuration(e.target.value)} placeholder="45" />
        </div>
      </div>
      <div className="it-srf-field">
        <label className="it-srf-label">Questions asked <span className="it-srf-hint">(one per line — these improve the shared question library)</span></label>
        <textarea className="it-srf-textarea" rows={4} value={questions} onChange={e => setQuestions(e.target.value)} placeholder={"Tell me about yourself.\nHow do you handle tight deadlines?\nDescribe a time you dealt with conflict."} />
      </div>
      <div className="it-srf-field">
        <label className="it-srf-label">Notes</label>
        <textarea className="it-srf-textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything else worth remembering about this stage…" />
      </div>
      {error && <div className="rc-error">{error}</div>}
      <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={saving || !stage}>
        {saving ? 'Saving…' : 'Submit Report'}
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function InterviewTab({ job, setJob, jobId }) {
  const [building, setBuilding]         = useState(false)
  const [buildError, setBuildError]     = useState(null)
  const [expandedStage, setExpandedStage] = useState(null)

  // View mode: 'overview' shows the prep path; 'practice' shows session
  const [viewMode, setViewMode] = useState('overview')
  // When set, the guided session runs these questions instead of the full set
  // (used for practicing a single custom question).
  const [sessionQuestions, setSessionQuestions] = useState(null)

  // Stage reporting
  const [showReportForm, setShowReportForm] = useState(false)
  const [reportDone, setReportDone]         = useState(false)

  // Question library (from shared company_questions table)
  const [libraryQuestions, setLibraryQuestions] = useState([])

  const profile   = job.interview_profile || null
  const readiness = computeReadiness(job)
  const companyKey = normalizeCompanyName(job.company)

  // Load question library for this company
  useEffect(() => {
    if (!companyKey) return
    api.getCompanyQuestions(companyKey, { limit: 40 })
      .then(rows => setLibraryQuestions(rows))
      .catch(() => {})
  }, [companyKey])

  // Merge profile questions + library questions for the mock interview picker.
  // Library questions appear first if they have frequency > 1 (user-confirmed).
  const confirmedLibraryQ = libraryQuestions
    .filter(q => !q.is_ai_generated || q.frequency > 1)
    .map(q => ({ stage: q.stage, question: q.question, fromLibrary: true, frequency: q.frequency }))

  const profileQuestions = [
    ...((profile?.stages || []).flatMap(s =>
      (s.questions || []).map(q => ({ stage: s.name, question: q, fromLibrary: false }))
    )),
    ...((profile?.role_specific?.role_questions || []).map(q => ({
      stage: 'Role-Specific', question: q, fromLibrary: false,
    }))),
  ]

  // Deduplicate: prefer library entry when both exist
  const librarySet = new Set(confirmedLibraryQ.map(q => q.question.toLowerCase().trim()))
  const filteredProfileQ = profileQuestions.filter(q => !librarySet.has(q.question.toLowerCase().trim()))

  const allQuestions = [...confirmedLibraryQ, ...filteredProfileQ]

  const handleBuildProfile = async () => {
    setBuilding(true)
    setBuildError(null)
    try {
      const updated = await api.buildInterviewProfile(jobId)
      setJob(updated)
      setExpandedStage(0)
    } catch (err) {
      setBuildError(err.message)
    }
    setBuilding(false)
  }

  const handleToggleChecklist = async (idx) => {
    if (!profile) return
    const done = profile.checklist_done || []
    const next = done.includes(idx) ? done.filter(i => i !== idx) : [...done, idx]
    const updated = { ...profile, checklist_done: next }
    setJob(prev => ({ ...prev, interview_profile: updated }))
    await api.updateJob(jobId, { interview_profile: updated })
  }

  const handleUpdateNotes = async (value) => {
    await api.updateJob(jobId, { interview_notes: value })
  }

  // Custom question practice — runs a one-question guided session
  const [customQuestion, setCustomQuestion] = useState('')
  const startCustomPractice = () => {
    const q = customQuestion.trim()
    if (!q) return
    setSessionQuestions([{ stage: 'Custom', question: q }])
    setViewMode('practice')
  }

  const practiceQuestions = sessionQuestions || allQuestions

  // ── Path state ────────────────────────────────────────────────────────────
  const s1Done = !!profile
  const s2Done = readiness.attempts >= 3
  const checklistTotal = profile?.prep_checklist?.length || 0
  const checklistDoneCount = profile?.checklist_done?.length || 0
  const s3Done = checklistTotal > 0 && checklistDoneCount >= checklistTotal
  const currentStation = !s1Done ? 1 : !s2Done ? 2 : !s3Done ? 3 : 4
  const s2Locked = !s1Done && allQuestions.length === 0
  const s3Locked = !s1Done

  // null = follow the current station; 0 = user closed everything
  const [openStation, setOpenStation] = useState(null)
  const shownOpen = openStation ?? currentStation
  const toggleStation = (n) =>
    setOpenStation(prev => ((prev ?? currentStation) === n ? 0 : n))

  const stationState = (n, done, locked) =>
    locked ? 'locked' : done ? 'done' : n === currentStation ? 'current' : 'idle'

  return (
    <div className="it-container">

      {/* Practice Session — full-screen guided mode */}
      {viewMode === 'practice' && practiceQuestions.length > 0 && (
        <PracticeSession
          questions={practiceQuestions}
          job={job}
          jobId={jobId}
          setJob={setJob}
          onExit={() => { setViewMode('overview'); setSessionQuestions(null); setCustomQuestion('') }}
        />
      )}

      {viewMode === 'overview' && (
      <>

      {/* Readiness — one quiet chip, detail on tap */}
      <ReadinessChip readiness={readiness} />

      <div className="it-path">

      {/* ① Know the company */}
      <Station
        num={1}
        title="Know the company"
        sub={s1Done
          ? `${profile.stages?.length || 0} interview stage${(profile.stages?.length || 0) !== 1 ? 's' : ''} mapped for ${job.company}`
          : 'Who interviews you, what they ask, what gets offers'}
        state={stationState(1, s1Done, false)}
        open={shownOpen === 1}
        onToggle={() => toggleStation(1)}
      >
        {buildError && <div className="rc-error">{buildError}</div>}

        {!profile && (
          <>
            <p className="it-station-explain">
              Job Maker maps {job.company}'s interview process — stages, real questions,
              and what gets candidates rejected. If another user already built this
              company's briefing, you get it instantly.
            </p>
            <button className="btn btn-primary it-station-cta" onClick={handleBuildProfile} disabled={building}>
              {building ? 'Building your briefing…' : 'Build company briefing'}
            </button>
          </>
        )}

        {profile && (
          <>
            {/* Data quality note */}
            {profile.data_quality_note && (
              <div className="it-quality-note">
                <span className="it-quality-icon">◎</span> {profile.data_quality_note}
              </div>
            )}

            {/* Stages */}
            {profile.stages?.length > 0 && (
              <div className="it-block">
                <span className="it-block-label">Interview Stages</span>
                <div className="it-stages">
                  {profile.stages.map((stage, i) => (
                    <StageCard
                      key={i}
                      stage={stage}
                      expanded={expandedStage === i}
                      onToggle={() => setExpandedStage(expandedStage === i ? null : i)}
                      libraryQuestions={libraryQuestions}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Role-specific questions */}
            {profile.role_specific?.role_questions?.length > 0 && (
              <div className="it-block">
                <span className="it-block-label">Role-Specific Questions <span className="it-block-label--sub">(this role)</span></span>
                <ul className="it-stage-questions it-role-questions">
                  {profile.role_specific.role_questions.map((q, i) => (
                    <li key={i} className="it-stage-question">{q}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Talking points from candidate's background */}
            {profile.role_specific?.talking_points?.length > 0 && (
              <div className="it-block">
                <span className="it-block-label it-block-label--success">Your Strongest Angles</span>
                <ul className="it-success-list">
                  {profile.role_specific.talking_points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Company Intel */}
            {profile.company_intel && (
              <div className="it-block">
                <span className="it-block-label">
                  Company Intel
                  {profile.intel_confidence && (
                    <span style={{ marginLeft: '0.4rem' }}>
                      <ConfidenceBadge level={profile.intel_confidence} />
                    </span>
                  )}
                </span>
                <p className="it-intel-text">{profile.company_intel}</p>
              </div>
            )}

            {/* Potential concerns */}
            {profile.role_specific?.potential_concerns?.length > 0 && (
              <div className="it-block">
                <span className="it-block-label it-block-label--warn">Likely Concerns + How to Address</span>
                <ul className="it-warning-list it-warning-list--amber">
                  {profile.role_specific.potential_concerns.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Common Mistakes */}
            {profile.common_mistakes?.length > 0 && (
              <div className="it-block">
                <span className="it-block-label it-block-label--danger">Common Mistakes</span>
                <div className="it-mistake-list">
                  {profile.common_mistakes.map((m, i) => {
                    const text   = typeof m === 'string' ? m : m.text
                    const conf   = typeof m === 'object' ? m.confidence : null
                    return (
                      <div key={i} className="it-mistake-item">
                        <span>{text}</span>
                        {conf && <ConfidenceBadge level={conf} />}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Success Signals */}
            {profile.success_signals?.length > 0 && (
              <div className="it-block">
                <span className="it-block-label it-block-label--success">What Gets Offers</span>
                <div className="it-success-evidence-list">
                  {profile.success_signals.map((s, i) => {
                    const text = typeof s === 'string' ? s : s.text
                    const conf = typeof s === 'object' ? s.confidence : null
                    return (
                      <div key={i} className="it-success-evidence-item">
                        <span>{text}</span>
                        {conf && <ConfidenceBadge level={conf} />}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="it-station-footer">
              {profile.from_shared_cache && (
                <span className="it-cache-note">Company briefing shared · role layer personalized</span>
              )}
              <button className="btn btn-ghost btn-sm" onClick={handleBuildProfile} disabled={building}>
                {building ? 'Rebuilding…' : 'Rebuild briefing'}
              </button>
            </div>
          </>
        )}
      </Station>

      {/* ② Practice */}
      <Station
        num={2}
        title="Practice out loud"
        sub={s2Locked
          ? 'Unlocks after the company briefing'
          : s2Done
            ? `${readiness.attempts} answers practiced · avg ${readiness.avg}/10`
            : readiness.attempts > 0
              ? `${readiness.attempts} of 3 answers done — keep going`
              : `${allQuestions.length} real question${allQuestions.length !== 1 ? 's' : ''} ready · ~10 min`}
        state={stationState(2, s2Done, s2Locked)}
        open={shownOpen === 2}
        onToggle={() => toggleStation(2)}
      >
        <p className="it-station-explain">
          One question at a time, instant feedback — answer by voice or text.
          Most candidates score 4–6; 7+ needs a specific, quantified example.
        </p>

        {allQuestions.length > 0 && (
          <button className="it-practice-launch" onClick={() => { setSessionQuestions(null); setViewMode('practice') }}>
            <span className="it-practice-launch-icon"><Play size={18} aria-hidden="true" /></span>
            <span className="it-practice-launch-body">
              <span className="it-practice-launch-title">
                {readiness.attempts > 0 ? 'Continue practice' : 'Start practice session'}
              </span>
              <span className="it-practice-launch-sub">
                {allQuestions.length} question{allQuestions.length !== 1 ? 's' : ''} for {job.company}
                {readiness.attempts > 0 ? ` · your avg ${readiness.avg}/10` : ''}
              </span>
            </span>
          </button>
        )}

        <div className="it-custom-practice">
          <input
            className="it-mock-custom"
            type="text"
            placeholder="Or paste any question — e.g. one a recruiter just sent you"
            value={customQuestion}
            onChange={e => setCustomQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') startCustomPractice() }}
          />
          <button className="btn btn-secondary btn-sm" onClick={startCustomPractice} disabled={!customQuestion.trim()}>
            Practice it
          </button>
        </div>

        <div className="it-legend">
          <span className="it-badge it-badge--user-report" title="Reported by Job Maker users">User reported</span>
          <span className="it-badge it-badge--observed" title="AI-generated, confirmed by multiple users">Confirmed</span>
          <span className="it-badge it-badge--estimated" title="AI suggested, not yet confirmed">AI suggested</span>
        </div>
      </Station>

      {/* ③ Final prep */}
      <Station
        num={3}
        title="Final prep"
        sub={s3Locked
          ? 'Unlocks after the company briefing'
          : checklistTotal > 0
            ? `${checklistDoneCount}/${checklistTotal} done`
            : 'No checklist yet — rebuild the briefing to get one'}
        state={stationState(3, s3Done, s3Locked)}
        open={shownOpen === 3}
        onToggle={() => toggleStation(3)}
      >
        {checklistTotal > 0 ? (
          <ChecklistSection
            items={profile.prep_checklist}
            done={profile.checklist_done || []}
            onToggle={handleToggleChecklist}
          />
        ) : (
          <p className="it-station-explain">
            The checklist comes with the company briefing — rebuild it in step ① to get one.
          </p>
        )}
      </Station>

      {/* ④ After the interview — visually distinct: this is for a done interview */}
      <Station
        num={4}
        title="After the interview"
        sub="Had the interview? Report how it went — it sharpens your next prep"
        state={currentStation === 4 ? 'current' : 'idle'}
        variant="report"
        open={shownOpen === 4}
        onToggle={() => toggleStation(4)}
      >
        {reportDone ? (
          <div className="it-report-done">
            Reported — thank you. Questions added to the shared library.
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: '0.75rem' }}
              onClick={() => { setReportDone(false); setShowReportForm(false) }}>
              Report another
            </button>
          </div>
        ) : showReportForm ? (
          <StageReportForm
            job={job}
            jobId={jobId}
            onDone={() => { setReportDone(true); setShowReportForm(false) }}
          />
        ) : (
          <>
            <p className="it-station-explain">
              Log each stage you complete — outcome, duration, and the questions you
              were asked. Your questions improve the shared library for everyone applying here.
            </p>
            <button className="btn btn-primary it-station-cta" onClick={() => setShowReportForm(true)}>
              Report an interview stage
            </button>
          </>
        )}

        {libraryQuestions.length > 0 && (
          <div className="it-library-note">
            <span className="it-library-count">{libraryQuestions.length}</span>
            {' '}question{libraryQuestions.length !== 1 ? 's' : ''} in the shared library for {job.company}
            {libraryQuestions.some(q => !q.is_ai_generated) && (
              <span className="it-library-user-note"> · {libraryQuestions.filter(q => !q.is_ai_generated).length} user-reported</span>
            )}
          </div>
        )}

        <div className="it-block" style={{ marginTop: '0.75rem' }}>
          <span className="it-block-label">Your Notes</span>
          <textarea
            className="notes-textarea"
            value={job.interview_notes || ''}
            onChange={e => setJob(prev => ({ ...prev, interview_notes: e.target.value }))}
            onBlur={e => handleUpdateNotes(e.target.value)}
            placeholder="Contacts, timeline, things to follow up on, your own prep notes…"
            rows={4}
          />
        </div>
      </Station>

      </div>

      </> // end overview mode
      )}
    </div>
  )
}
