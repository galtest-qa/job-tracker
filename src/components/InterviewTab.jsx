import React, { useState, useEffect } from 'react'
import { api } from '../api.js'

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

function ConfidenceBadge({ level }) {
  const map = {
    high:   { label: 'Observed', cls: 'it-badge--observed' },
    medium: { label: 'Inferred', cls: 'it-badge--inferred' },
    low:    { label: 'Estimated', cls: 'it-badge--estimated' },
  }
  const { label, cls } = map[level] || map.low
  return <span className={`it-badge ${cls}`}>{label}</span>
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

function StageCard({ stage, expanded, onToggle }) {
  return (
    <div className={`it-stage-card ${expanded ? 'it-stage-card--open' : ''}`}>
      <button className="it-stage-header" onClick={onToggle}>
        <span className="it-stage-name">{stage.name}</span>
        <span className="it-stage-meta">
          {stage.format   && <span className="it-stage-tag">{stage.format}</span>}
          {stage.duration && <span className="it-stage-tag">{stage.duration}</span>}
          {stage.confidence && <ConfidenceBadge level={stage.confidence} />}
        </span>
        <span className="it-stage-chevron">{expanded ? '▲' : '▼'}</span>
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
              {stage.questions.map((q, i) => (
                <li key={i} className="it-stage-question">{q}</li>
              ))}
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

function ScoreBreakdown({ breakdown }) {
  const items = [
    { key: 'structure',    label: 'Structure' },
    { key: 'specificity',  label: 'Specificity' },
    { key: 'relevance',    label: 'Relevance' },
    { key: 'impact',       label: 'Impact' },
  ]
  return (
    <div className="it-mock-breakdown">
      {items.map(({ key, label }) => {
        const val = breakdown?.[key] ?? 0
        const color =
          val >= 8 ? 'var(--success)' :
          val >= 6 ? 'var(--warning)' : 'var(--danger)'
        return (
          <div key={key} className="it-mock-breakdown-row">
            <span className="it-mock-breakdown-label">{label}</span>
            <div className="it-mock-breakdown-track">
              <div className="it-mock-breakdown-fill" style={{ width: `${(val / 10) * 100}%`, background: color }} />
            </div>
            <span className="it-mock-breakdown-val">{val}/10</span>
          </div>
        )
      })}
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

  const [selectedQuestion, setSelectedQuestion] = useState('')
  const [customQuestion, setCustomQuestion]     = useState('')
  const [mockAnswer, setMockAnswer]             = useState('')
  const [submitting, setSubmitting]             = useState(false)
  const [feedback, setFeedback]                 = useState(null)
  const [feedbackError, setFeedbackError]       = useState(null)
  const [showCustom, setShowCustom]             = useState(false)

  // Stage reporting
  const [showReportForm, setShowReportForm] = useState(false)
  const [reportDone, setReportDone]         = useState(false)

  // Question library (from shared company_questions table)
  const [libraryQuestions, setLibraryQuestions] = useState([])

  const profile   = job.interview_profile || null
  const readiness = computeReadiness(job)
  const companyKey = (job.company || '').toLowerCase().trim()

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

  const handleMockSubmit = async () => {
    const q = showCustom ? customQuestion.trim() : selectedQuestion
    if (!q || !mockAnswer.trim()) return
    setSubmitting(true)
    setFeedback(null)
    setFeedbackError(null)
    try {
      const result = await api.mockInterviewScore(jobId, { question: q, answer: mockAnswer.trim() })
      setJob(prev => {
        const prev_profile = prev.interview_profile || {}
        const newScores = [...(prev_profile.mock_scores || []), result.score]
        const avg = Math.round((newScores.reduce((a, b) => a + b, 0) / newScores.length) * 10) / 10
        return {
          ...prev,
          interview_profile: {
            ...prev_profile,
            mock_attempts: newScores.length,
            mock_scores: newScores,
            avg_mock_score: avg,
          },
        }
      })
      setFeedback(result)
    } catch (err) {
      setFeedbackError(err.message)
    }
    setSubmitting(false)
  }

  const handleUpdateNotes = async (value) => {
    await api.updateJob(jobId, { interview_notes: value })
  }

  const activeQuestion = showCustom ? customQuestion : selectedQuestion

  return (
    <div className="it-container">

      {/* Readiness Score */}
      <ReadinessCard readiness={readiness} />

      {/* Interview Profile */}
      <div className="it-section">
        <div className="it-section-header">
          <div>
            <h4 className="it-section-title">Interview Profile</h4>
            {profile?.from_shared_cache && (
              <span className="it-cache-note">Company profile shared · Role layer personalized</span>
            )}
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleBuildProfile} disabled={building}>
            {building ? 'Building…' : profile ? 'Rebuild' : 'Build Profile'}
          </button>
        </div>

        {buildError && <div className="rc-error">{buildError}</div>}

        {!profile && !building && (
          <div className="it-empty">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
            </svg>
            <p>
              Build a profile to see interview stages, prep checklist, and what gets candidates
              rejected at {job.company}. Company profiles are shared across users — if someone
              already built one, you get it instantly.
            </p>
          </div>
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

            {/* Prep Checklist */}
            {profile.prep_checklist?.length > 0 && (
              <div className="it-block">
                <span className="it-block-label">
                  Prep Checklist
                  {profile.checklist_done?.length > 0 && (
                    <span className="it-checklist-count">
                      {profile.checklist_done.length}/{profile.prep_checklist.length} done
                    </span>
                  )}
                </span>
                <ChecklistSection
                  items={profile.prep_checklist}
                  done={profile.checklist_done || []}
                  onToggle={handleToggleChecklist}
                />
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
          </>
        )}
      </div>

      {/* Mock Interview */}
      <div className="it-section">
        <h4 className="it-section-title">Mock Interview</h4>
        <p className="it-section-sub">
          Answer as you would in the real interview. Most candidates score 4–6. Scoring 7+ requires
          specific examples with a clear, quantified result.
        </p>

        <div className="it-mock-question-row">
          {allQuestions.length > 0 && !showCustom && (
            <select
              className="it-mock-select"
              value={selectedQuestion}
              onChange={e => { setSelectedQuestion(e.target.value); setFeedback(null) }}
            >
              <option value="">Pick a question…</option>
              {confirmedLibraryQ.length > 0 && (
                <optgroup label={`Shared Library (${confirmedLibraryQ.length})`}>
                  {confirmedLibraryQ.map((q, i) => (
                    <option key={`lib-${i}`} value={q.question}>
                      {q.frequency > 1 ? `[×${q.frequency}] ` : ''}{q.question}
                    </option>
                  ))}
                </optgroup>
              )}
              {filteredProfileQ.length > 0 && (
                <optgroup label="From Profile">
                  {filteredProfileQ.map((q, i) => (
                    <option key={`prof-${i}`} value={q.question}>[{q.stage}] {q.question}</option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
          {showCustom && (
            <input
              className="it-mock-custom"
              type="text"
              placeholder="Type any interview question…"
              value={customQuestion}
              onChange={e => { setCustomQuestion(e.target.value); setFeedback(null) }}
            />
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setShowCustom(v => !v); setSelectedQuestion(''); setCustomQuestion(''); setFeedback(null) }}
          >
            {showCustom ? '← Profile questions' : 'Custom question'}
          </button>
        </div>

        {activeQuestion && (
          <div className="it-mock-active-q">Q: {activeQuestion}</div>
        )}

        <textarea
          className="it-mock-answer"
          placeholder="Write your answer. Use a specific example: what the situation was, what you did, and what the result was."
          value={mockAnswer}
          onChange={e => setMockAnswer(e.target.value)}
          rows={6}
        />

        <button
          className="btn btn-primary btn-sm"
          onClick={handleMockSubmit}
          disabled={submitting || !activeQuestion || !mockAnswer.trim()}
        >
          {submitting ? 'Scoring…' : 'Submit Answer'}
        </button>

        {feedbackError && <div className="rc-error" style={{ marginTop: '0.75rem' }}>{feedbackError}</div>}

        {feedback && (
          <div className="it-feedback-card">
            <div className="it-feedback-score-row">
              <div>
                <span className="it-feedback-score" style={{
                  color: feedback.score >= 8 ? 'var(--success)' :
                         feedback.score >= 6 ? 'var(--warning)' : 'var(--danger)'
                }}>
                  {feedback.score}/10
                </span>
                <div className="it-feedback-score-label">
                  {feedback.score >= 8 ? 'Strong' : feedback.score >= 6 ? 'Average' : 'Needs work'}
                </div>
              </div>
              <ScoreBreakdown breakdown={feedback.breakdown} />
            </div>

            {feedback.what_worked && (
              <div className="it-feedback-block it-feedback-block--good">
                <span className="it-feedback-label">What worked</span>
                <p>{feedback.what_worked}</p>
              </div>
            )}
            {feedback.to_improve && (
              <div className="it-feedback-block it-feedback-block--warn">
                <span className="it-feedback-label">Biggest improvement</span>
                <p>{feedback.to_improve}</p>
              </div>
            )}
            {feedback.stronger_version && (
              <div className="it-feedback-block it-feedback-block--new">
                <span className="it-feedback-label">Stronger version (8/10)</span>
                <p>{feedback.stronger_version}</p>
              </div>
            )}

            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: '0.5rem' }}
              onClick={() => { setFeedback(null); setMockAnswer('') }}
            >
              Try another question
            </button>
          </div>
        )}
      </div>

      {/* Stage Report */}
      <div className="it-section">
        <div className="it-section-header">
          <div>
            <h4 className="it-section-title">Report Interview Stage</h4>
            <span className="it-section-sub">
              Questions you share improve the library for everyone applying here.
            </span>
          </div>
          {!showReportForm && !reportDone && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowReportForm(true)}>
              + Report Stage
            </button>
          )}
        </div>

        {reportDone && (
          <div className="it-report-done">
            Reported — thank you. Questions added to the shared library.
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: '0.75rem' }}
              onClick={() => { setReportDone(false); setShowReportForm(false) }}>
              Report another
            </button>
          </div>
        )}

        {showReportForm && !reportDone && (
          <StageReportForm
            job={job}
            jobId={jobId}
            onDone={() => { setReportDone(true); setShowReportForm(false) }}
          />
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
      </div>

      {/* Personal Notes */}
      <div className="it-section">
        <h4 className="it-section-title">Your Notes</h4>
        <textarea
          className="notes-textarea"
          value={job.interview_notes || ''}
          onChange={e => setJob(prev => ({ ...prev, interview_notes: e.target.value }))}
          onBlur={e => handleUpdateNotes(e.target.value)}
          placeholder="Contacts, timeline, things to follow up on, your own prep notes…"
          rows={6}
        />
      </div>
    </div>
  )
}
