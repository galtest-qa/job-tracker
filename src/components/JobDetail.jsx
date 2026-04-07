import React, { useState, useEffect } from 'react'
import { api } from '../api.js'
import JobForm from './JobForm.jsx'
import MatchAnalysis from './MatchAnalysis.jsx'
import CompanyLogo from './CompanyLogo.jsx'
import ReminderPanel from './ReminderPanel.jsx'
import { getNextAction, getFollowUp, getTimeline } from './nextAction.js'

const PALETTE = ['#6b7280', '#4f6ef7', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1']

export default function JobDetail({ jobId, columns = [], initialTab, onBack, onRefresh }) {
  const [job, setJob] = useState(null)
  const [editing, setEditing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [tailoring, setTailoring] = useState(false)
  const [prepping, setPrepping] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState(initialTab || 'analysis')
  const [jobReminders, setJobReminders] = useState([])

  const load = async () => {
    const data = await api.getJob(jobId)
    // Parse interview_prep_ai if it's a string
    if (typeof data.interview_prep_ai === 'string' && data.interview_prep_ai) {
      try { data.interview_prep_ai = JSON.parse(data.interview_prep_ai) } catch {}
    }
    setJob(data)
  }

  const loadReminders = async () => {
    try { const r = await api.getReminders(jobId); setJobReminders(r) } catch {}
  }
  useEffect(() => { load(); loadReminders() }, [jobId])

  const analyze = async () => {
    setAnalyzing(true); setError(null)
    try { const updated = await api.analyzeJob(jobId); setJob(updated) }
    catch (err) { setError(err.message) }
    setAnalyzing(false)
  }

  const tailorResume = async () => {
    setTailoring(true); setError(null)
    try {
      const updated = await api.tailorResume(jobId)
      setJob(updated)
    } catch (err) { setError(err.message) }
    setTailoring(false)
  }

  const generateInterviewPrep = async () => {
    setPrepping(true); setError(null)
    try {
      const updated = await api.interviewPrep(jobId)
      if (typeof updated.interview_prep_ai === 'string') {
        try { updated.interview_prep_ai = JSON.parse(updated.interview_prep_ai) } catch {}
      }
      setJob(updated)
    } catch (err) { setError(err.message) }
    setPrepping(false)
  }

  const exportResume = () => {
    window.open(api.exportResume(jobId), '_blank')
  }

  const updateStatus = async (status) => {
    const updated = await api.updateJob(jobId, { status })
    setJob(updated); onRefresh()
  }

  const updateNotes = async (field, value) => {
    const updated = await api.updateJob(jobId, { [field]: value })
    setJob(updated)
  }

  const handleDelete = async () => {
    if (!confirm('Delete this job?')) return
    await api.deleteJob(jobId); onBack()
  }

  if (!job) return <div className="loading">Loading...</div>

  if (editing) {
    return (
      <JobForm
        initial={job}
        onSave={async (data) => {
          await api.updateJob(jobId, data)
          setEditing(false); load(); onRefresh()
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  const prep = job.interview_prep_ai && typeof job.interview_prep_ai === 'object' ? job.interview_prep_ai : null

  return (
    <div className="job-detail">
      <div className="detail-header">
        <button className="btn btn-ghost" onClick={onBack}>&larr; Back</button>
        <div className="detail-actions">
          <button className="btn btn-secondary" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      <div className="detail-hero">
        <CompanyLogo
          company={job.company}
          size="lg"
          logoUrl={job.logo_url}
          editable
          onLogoChange={async (url) => {
            const updated = await api.updateJob(jobId, { logo_url: url })
            setJob(updated)
            onRefresh()
          }}
        />
        <div className="detail-hero-info">
          <div className="detail-title">
            <div>
              <h2>{job.role}</h2>
              <span className="company-name">{job.company}</span>
              {job.company_industry && <span className="industry"> &middot; {job.company_industry}</span>}
              {job.company_size && <span className="size"> &middot; {job.company_size}</span>}
            </div>
            <div className="detail-meta">
              {job.match_score != null && (
                <div className={`score-big ${job.match_score >= 70 ? 'high' : job.match_score >= 40 ? 'mid' : 'low'}`}>
                  {job.match_score}%<small>match</small>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {job.company_overview && <p className="company-overview">{job.company_overview}</p>}

      {job.contact_name && (
        <div className="contact-card">
          <div className="contact-card-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <div className="contact-card-info">
            <span className="contact-card-name">{job.contact_name}</span>
            {job.contact_role && <span className="contact-card-role">{job.contact_role}</span>}
          </div>
          <div className="contact-card-links">
            {job.contact_email && (
              <a href={`mailto:${job.contact_email}`} className="contact-link" title={job.contact_email}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </a>
            )}
            {job.contact_linkedin && (
              <a href={job.contact_linkedin} target="_blank" rel="noopener noreferrer" className="contact-link" title="LinkedIn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
            )}
          </div>
        </div>
      )}

      <div className="status-row">
        <div className="status-pipeline">
          {columns.map((col, i) => (
            <button
              key={col.id}
              className={`pipeline-step ${job.status === col.name ? 'active' : ''}`}
              style={job.status === col.name ? { background: PALETTE[i % PALETTE.length] } : {}}
              onClick={() => updateStatus(col.name)}
            >{col.name}</button>
          ))}
        </div>
        <div className="source-info">
          {job.source}
          {job.link && <a href={job.link} target="_blank" rel="noopener noreferrer" className="job-link">View Post &rarr;</a>}
        </div>
      </div>

      {/* Follow-up banner */}
      {job && (() => {
        const fu = getFollowUp(job)
        if (!fu.shouldFollowUp) return null
        return (
          <div className="followup-banner">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            No activity for {fu.daysSinceLastAction} days — consider following up
          </div>
        )
      })()}

      {/* Job Timeline */}
      {job && (() => {
        const stages = getTimeline(job)
        return (
          <div className="job-timeline">
            {stages.map((stage, i) => (
              <div key={stage.key} className={`timeline-stage ${stage.completed ? 'completed' : ''} ${stage.current ? 'current' : ''}`}>
                <div className="timeline-dot">{stage.completed ? '\u2713' : (i + 1)}</div>
                {i < stages.length - 1 && <div className={`timeline-line ${stages[i + 1].completed ? 'completed' : ''}`} />}
                <span className="timeline-label">{stage.label}</span>
              </div>
            ))}
          </div>
        )
      })()}

      {job.tags?.length > 0 && (
        <div className="tags detail-tags">
          {job.tags.map(t => <span key={t} className="tag">{t}</span>)}
        </div>
      )}

      {job && (() => {
        const na = getNextAction(job, jobReminders)
        return (
          <div className={`next-step-block next-step-${na.priority}`}>
            <div className="next-step-content">
              <span className="next-step-label">Recommended Next Step</span>
              <span className="next-step-action">{na.action}</span>
              <span className="next-step-reason">{na.reason}</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab(na.tab)}>
              Go to {na.tab === 'analysis' ? 'Analysis' : na.tab === 'resume' ? 'Resume' : na.tab === 'interview' ? 'Interview Prep' : na.tab === 'notes' ? 'Notes' : na.tab}
            </button>
          </div>
        )
      })()}

      <div className="detail-tabs">
        {['analysis', 'reminders', 'resume', 'interview', 'description', 'notes'].map(tab => (
          <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}>
            {tab === 'analysis' ? 'Analysis' :
             tab === 'reminders' ? 'Reminders' :
             tab === 'resume' ? 'Resume' :
             tab === 'interview' ? 'Interview Prep' :
             tab === 'description' ? 'Description' : 'Notes'}
          </button>
        ))}
      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="detail-content">
        {/* ── Analysis Tab ── */}
        {activeTab === 'analysis' && (
          <div className="analysis-tab">
            <button className="btn btn-primary analyze-btn" onClick={analyze} disabled={analyzing}>
              {analyzing ? 'Analyzing...' : job.match_score != null ? 'Re-analyze with AI' : 'Analyze with AI'}
            </button>
            {job.summary && <div className="summary-block"><h4>Summary</h4><p>{job.summary}</p></div>}
            {(job.requirements_met?.length > 0 || job.requirements_partial?.length > 0 || job.requirements_unmet?.length > 0) && (
              <MatchAnalysis job={job} />
            )}
            {job.positioning_tips && (
              <div className="tips-block"><h4>Positioning Tips</h4><p>{job.positioning_tips}</p></div>
            )}
          </div>
        )}

        {/* ── Reminders Tab ── */}
        {activeTab === 'reminders' && (
          <ReminderPanel jobId={jobId} />
        )}

        {/* ── Resume Tab ── */}
        {activeTab === 'resume' && (
          <div className="resume-tab">
            <div className="tab-actions">
              <button className="btn btn-primary" onClick={tailorResume} disabled={tailoring}>
                {tailoring ? 'Tailoring...' : job.tailored_resume ? 'Re-tailor Resume' : 'Tailor Resume for This Role'}
              </button>
              {job.tailored_resume && (
                <button className="btn btn-secondary" onClick={exportResume}>
                  Export to Word
                </button>
              )}
            </div>

            {job.tailored_resume ? (
              <>
                <div className="tailored-resume-block">
                  <h4>Tailored Resume</h4>
                  <pre className="description-text">{job.tailored_resume}</pre>
                </div>

                {job.resume_improvements?.length > 0 && (
                  <div className="improvements-block">
                    <h4>Improvement Recommendations</h4>
                    <div className="improvements-list">
                      {job.resume_improvements.map((imp, i) => (
                        <div key={i} className="improvement-item">
                          <span className="improvement-category">{imp.category}</span>
                          <p>{imp.suggestion}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-tab-state">
                <p>Click "Tailor Resume for This Role" to generate a resume customized for this specific job posting.</p>
                <p className="muted">Make sure you've uploaded your resume first (button in the header).</p>
              </div>
            )}
          </div>
        )}

        {/* ── Interview Prep Tab ── */}
        {activeTab === 'interview' && (
          <div className="interview-tab">
            <div className="tab-actions">
              <button className="btn btn-primary" onClick={generateInterviewPrep} disabled={prepping}>
                {prepping ? 'Generating...' : prep ? 'Regenerate Prep' : 'Generate Interview Prep'}
              </button>
            </div>

            {prep ? (
              <div className="interview-prep-content">
                {prep.company_research_notes && (
                  <div className="prep-section">
                    <h4>Company Research</h4>
                    <p>{prep.company_research_notes}</p>
                  </div>
                )}

                {prep.key_talking_points?.length > 0 && (
                  <div className="prep-section">
                    <h4>Key Talking Points</h4>
                    <ul className="prep-list">
                      {prep.key_talking_points.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                )}

                {prep.likely_questions?.length > 0 && (
                  <div className="prep-section">
                    <h4>Likely Questions & Suggested Answers</h4>
                    <div className="qa-list">
                      {prep.likely_questions.map((qa, i) => (
                        <div key={i} className="qa-item">
                          <div className="qa-question">Q: {qa.question}</div>
                          <div className="qa-answer">{qa.suggested_answer}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {prep.questions_to_ask?.length > 0 && (
                  <div className="prep-section">
                    <h4>Questions to Ask Them</h4>
                    <ul className="prep-list">
                      {prep.questions_to_ask.map((q, i) => <li key={i}>{q}</li>)}
                    </ul>
                  </div>
                )}

                {prep.potential_concerns?.length > 0 && (
                  <div className="prep-section concerns">
                    <h4>Potential Concerns & How to Address</h4>
                    <ul className="prep-list">
                      {prep.potential_concerns.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-tab-state">
                <p>Generate an AI-powered interview preparation guide tailored to this specific role.</p>
              </div>
            )}

            <div className="prep-divider">
              <span>Your Personal Notes</span>
            </div>
            <textarea
              className="notes-textarea"
              value={job.interview_notes || ''}
              onChange={e => setJob({ ...job, interview_notes: e.target.value })}
              onBlur={e => updateNotes('interview_notes', e.target.value)}
              placeholder="Add your own interview notes here..."
              rows={6}
            />
          </div>
        )}

        {/* ── Description Tab ── */}
        {activeTab === 'description' && (
          <div className="description-tab">
            {job.description ? (
              <pre className="description-text">{job.description}</pre>
            ) : (
              <p className="muted">No description added. Edit this job to paste the job description.</p>
            )}
          </div>
        )}

        {/* ── Notes Tab ── */}
        {activeTab === 'notes' && (
          <div className="notes-tab">
            <textarea
              className="notes-textarea"
              value={job.notes || ''}
              onChange={e => setJob({ ...job, notes: e.target.value })}
              onBlur={e => updateNotes('notes', e.target.value)}
              placeholder="Add your notes here... thoughts, contacts, timeline, etc."
              rows={12}
            />
          </div>
        )}
      </div>
    </div>
  )
}
