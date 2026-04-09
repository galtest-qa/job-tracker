import React, { useState, useEffect } from 'react'
import { api } from '../api.js'
import ResumeDiff from './ResumeDiff.jsx'
import ResumePreview from './ResumePreview.jsx'

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function isSectionHeader(line) {
  return /^[A-Z][A-Z\s&\/]{2,}$/.test(line) ||
    /^(SUMMARY|EXPERIENCE|EDUCATION|SKILLS|CERTIFICATIONS|PROJECTS|LANGUAGES|AWARDS|PROFESSIONAL SUMMARY|WORK EXPERIENCE|TECHNICAL SKILLS|PROFESSIONAL EXPERIENCE|OBJECTIVE|PROFILE)$/i.test(line)
}

function isBullet(line) {
  return /^[-•*]\s/.test(line)
}

function isJobTitle(line) {
  return /\d{4}/.test(line) && (line.includes('|') || line.includes('–') || line.includes(' - '))
}

function isContact(line) {
  return (line.includes('@') || line.includes('+972') || line.includes('+1') || line.includes('linkedin.com'))
}

function generateDocx(text, company, role) {
  const lines = text.split('\n')

  // Pre-process: group consecutive bullets into a single list
  const blocks = []
  let bulletBuffer = []

  function flushBullets() {
    if (bulletBuffer.length > 0) {
      blocks.push({ type: 'bullets', items: [...bulletBuffer] })
      bulletBuffer = []
    }
  }

  let foundName = false
  let foundContact = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (!line) {
      flushBullets()
      // Only add spacing if previous block wasn't empty
      if (blocks.length > 0 && blocks[blocks.length - 1].type !== 'space') {
        blocks.push({ type: 'space' })
      }
      continue
    }

    if (isBullet(line)) {
      bulletBuffer.push(line.replace(/^[-•*]\s*/, ''))
      continue
    }

    flushBullets()

    if (!foundName && !isSectionHeader(line) && i < 3) {
      blocks.push({ type: 'name', text: line })
      foundName = true
    } else if (!foundContact && isContact(line) && i < 5) {
      blocks.push({ type: 'contact', text: line })
      foundContact = true
    } else if (isSectionHeader(line)) {
      blocks.push({ type: 'section', text: line })
    } else if (isJobTitle(line)) {
      blocks.push({ type: 'jobtitle', text: line })
    } else {
      blocks.push({ type: 'text', text: line })
    }
  }
  flushBullets()

  // Build Word-compatible HTML
  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<style>
  @page { margin: 0.75in; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.4; color: #222; }
  h1 { font-size: 20pt; font-weight: bold; text-align: center; margin: 0 0 2pt; color: #111; }
  .contact { text-align: center; font-size: 9.5pt; color: #444; margin-bottom: 10pt; }
  h2 { font-size: 11pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5pt; border-bottom: 1.5pt solid #333; padding-bottom: 1pt; margin: 12pt 0 4pt; color: #222; }
  .jobtitle { font-size: 10.5pt; font-weight: bold; margin: 6pt 0 1pt; color: #333; }
  ul { margin: 1pt 0 4pt 14pt; padding: 0; }
  li { margin-bottom: 1.5pt; font-size: 10.5pt; }
  p { margin: 1pt 0; font-size: 10.5pt; }
  .spacer { height: 4pt; }
</style>
</head><body>`

  for (const block of blocks) {
    switch (block.type) {
      case 'name':
        html += `<h1>${esc(block.text)}</h1>`
        break
      case 'contact':
        html += `<div class="contact">${esc(block.text)}</div>`
        break
      case 'section':
        html += `<h2>${esc(block.text)}</h2>`
        break
      case 'jobtitle':
        html += `<div class="jobtitle">${esc(block.text)}</div>`
        break
      case 'bullets':
        html += '<ul>'
        for (const item of block.items) {
          html += `<li>${esc(item)}</li>`
        }
        html += '</ul>'
        break
      case 'text':
        html += `<p>${esc(block.text)}</p>`
        break
      case 'space':
        html += '<div class="spacer"></div>'
        break
    }
  }

  html += '</body></html>'

  const blob = new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Resume_${company.replace(/[^a-zA-Z0-9]/g, '_')}_${role.replace(/[^a-zA-Z0-9]/g, '_')}.doc`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ResumeTab({ job, setJob, jobId, tailoring, onTailor }) {
  const [resumeView, setResumeView] = useState('tailored')
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [originalResume, setOriginalResume] = useState('')
  const [appliedSuggestions, setAppliedSuggestions] = useState(new Set())

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

  const handleApplyDiff = async (newText) => {
    setEditText(newText)
    setSaving(true)
    await api.updateJob(jobId, { tailored_resume: newText })
    setJob({ ...job, tailored_resume: newText })
    setSaving(false)
    setResumeView('tailored')
  }

  const handleApplySuggestion = async (idx, imp) => {
    let currentText = editText || job.tailored_resume
    const suggested = imp.suggested || imp.suggestion || ''

    if (imp.original && imp.original.trim()) {
      // Rephrase: find and replace
      if (currentText.includes(imp.original)) {
        currentText = currentText.replace(imp.original, suggested)
      } else {
        // Try fuzzy match (first 30 chars)
        const snippet = imp.original.slice(0, 30)
        const idx = currentText.indexOf(snippet)
        if (idx >= 0) {
          const endIdx = currentText.indexOf('\n', idx)
          currentText = currentText.slice(0, idx) + suggested + (endIdx >= 0 ? currentText.slice(endIdx) : '')
        } else {
          // Can't find it — append to section
          currentText = appendToSection(currentText, imp.section, suggested)
        }
      }
    } else {
      // Add new: append to the relevant section
      currentText = appendToSection(currentText, imp.section, suggested)
    }

    setEditText(currentText)
    // Save immediately
    await api.updateJob(jobId, { tailored_resume: currentText })
    setJob({ ...job, tailored_resume: currentText })
    setAppliedSuggestions(prev => new Set([...prev, idx]))
  }

  function appendToSection(text, sectionName, newLine) {
    if (!sectionName) return text + '\n' + newLine

    const lines = text.split('\n')
    const sectionPattern = new RegExp(`^${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i')
    let insertIdx = -1

    for (let i = 0; i < lines.length; i++) {
      if (sectionPattern.test(lines[i].trim())) {
        // Find the end of this section (next section header or end of file)
        let j = i + 1
        while (j < lines.length && !/^[A-Z][A-Z\s&\/]{2,}$/.test(lines[j].trim())) j++
        insertIdx = j
        break
      }
    }

    if (insertIdx >= 0) {
      lines.splice(insertIdx, 0, (newLine.startsWith('-') || newLine.startsWith('•') ? '' : '- ') + newLine)
    } else {
      lines.push('', newLine)
    }
    return lines.join('\n')
  }

  const handleExport = () => {
    const text = editText || job.tailored_resume
    if (!text) return
    generateDocx(text, job.company, job.role)
  }

  return (
    <div className="resume-tab">
      <div className="tab-actions">
        <button className="btn btn-primary" onClick={onTailor} disabled={tailoring}>
          {tailoring ? 'Tailoring...' : job.tailored_resume ? 'Re-tailor Resume' : 'Tailor Resume for This Role'}
        </button>
        {job.tailored_resume && (
          <>
            <button className="btn btn-secondary" onClick={() => setShowPreview(true)}>Preview</button>
            <button className="btn btn-secondary" onClick={handleExport}>Export .docx</button>
          </>
        )}
      </div>

      {job.tailored_resume ? (
        <>
          <div className="resume-view-tabs">
            <button className={`tab ${resumeView === 'tailored' ? 'active' : ''}`}
              onClick={() => setResumeView('tailored')}>Tailored</button>
            <button className={`tab ${resumeView === 'diff' ? 'active' : ''}`}
              onClick={() => setResumeView('diff')}>Review Changes</button>
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
              {originalResume ? (
                <ResumeDiff original={originalResume} tailored={job.tailored_resume} onApply={handleApplyDiff} />
              ) : (
                <p className="muted">Upload your original resume to review changes.</p>
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
              <h4>Suggestions — click to apply</h4>
              <p className="muted" style={{ marginBottom: '0.5rem' }}>These are optional changes you can add to your resume. Click "Apply" to add each one.</p>
              <div className="improvements-list">
                {job.resume_improvements.map((imp, i) => {
                  const isApplied = appliedSuggestions.has(i)
                  return (
                    <div key={i} className={`suggestion-card ${isApplied ? 'applied' : ''}`}>
                      <div className="suggestion-card-header">
                        <span className="suggestion-card-section">{imp.section || imp.category}</span>
                        <span className="suggestion-card-type">{imp.type || 'suggestion'}</span>
                      </div>
                      {imp.original && (
                        <div className="suggestion-original">
                          <span className="suggestion-label">Current:</span> {imp.original}
                        </div>
                      )}
                      <div className="suggestion-new">
                        <span className="suggestion-label">{imp.original ? 'Change to:' : 'Add:'}</span> {imp.suggested || imp.suggestion}
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
