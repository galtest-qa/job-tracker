import React, { useState, useEffect } from 'react'
import { api } from '../api.js'
import ResumeDiff from './ResumeDiff.jsx'
import ResumePreview from './ResumePreview.jsx'

export default function ResumeTab({ job, setJob, jobId, tailoring, onTailor }) {
  const [resumeView, setResumeView] = useState('tailored') // 'tailored' | 'diff' | 'edit'
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [originalResume, setOriginalResume] = useState('')

  useEffect(() => {
    if (job.tailored_resume) setEditText(job.tailored_resume)
  }, [job.tailored_resume])

  useEffect(() => {
    api.getResume().then(r => { if (r?.raw_text) setOriginalResume(r.raw_text) }).catch(() => {})
  }, [])

  const handleSaveEdit = async () => {
    setSaving(true)
    await api.updateJob(jobId, { tailored_resume: editText })
    setJob({ ...job, tailored_resume: editText })
    setSaving(false)
    setResumeView('tailored')
  }

  const handleExport = () => {
    // Generate a .txt download (simple, works everywhere)
    const text = editText || job.tailored_resume
    if (!text) return
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Resume_${job.company.replace(/[^a-zA-Z0-9]/g, '_')}_${job.role.replace(/[^a-zA-Z0-9]/g, '_')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="resume-tab">
      <div className="tab-actions">
        <button className="btn btn-primary" onClick={onTailor} disabled={tailoring}>
          {tailoring ? 'Tailoring...' : job.tailored_resume ? 'Re-tailor Resume' : 'Tailor Resume for This Role'}
        </button>
        {job.tailored_resume && (
          <>
            <button className="btn btn-secondary" onClick={() => setShowPreview(true)}>
              Preview
            </button>
            <button className="btn btn-secondary" onClick={handleExport}>
              Export
            </button>
          </>
        )}
      </div>

      {job.tailored_resume ? (
        <>
          {/* View mode tabs */}
          <div className="resume-view-tabs">
            <button className={`tab ${resumeView === 'tailored' ? 'active' : ''}`}
              onClick={() => setResumeView('tailored')}>Tailored</button>
            <button className={`tab ${resumeView === 'diff' ? 'active' : ''}`}
              onClick={() => setResumeView('diff')}>Changes</button>
            <button className={`tab ${resumeView === 'edit' ? 'active' : ''}`}
              onClick={() => { setResumeView('edit'); setEditText(job.tailored_resume) }}>Edit</button>
          </div>

          {resumeView === 'tailored' && (
            <div className="tailored-resume-block">
              <pre className="description-text">{job.tailored_resume}</pre>
            </div>
          )}

          {resumeView === 'diff' && (
            <div className="tailored-resume-block">
              <h4>Changes from Original</h4>
              {originalResume ? (
                <ResumeDiff original={originalResume} tailored={job.tailored_resume} />
              ) : (
                <p className="muted">Upload your original resume to see the diff.</p>
              )}
            </div>
          )}

          {resumeView === 'edit' && (
            <div className="tailored-resume-block">
              <textarea
                className="notes-textarea resume-edit-textarea"
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={20}
              />
              <div className="settings-btn-row" style={{ marginTop: '0.5rem' }}>
                <button className="btn btn-primary btn-sm" onClick={handleSaveEdit} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setResumeView('tailored')}>Cancel</button>
              </div>
            </div>
          )}

          {job.resume_improvements?.length > 0 && resumeView !== 'edit' && (
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
