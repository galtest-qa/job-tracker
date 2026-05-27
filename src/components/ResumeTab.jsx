import React, { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'
import ResumeDiff from './ResumeDiff.jsx'
import ResumePreview from './ResumePreview.jsx'

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function generateDocx(text, company, role) {
  // Convert resume text to Word-compatible HTML preserving exact formatting
  // Instead of trying to classify each line, we preserve the structure as-is
  // and only apply minimal styling

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

    if (!trimmed) {
      html += '<div class="line">&nbsp;</div>'
      continue
    }

    // First non-empty line is likely the name
    const isFirstContent = i === 0 || (i <= 2 && !lines.slice(0, i).some(l => l.trim()))
    if (isFirstContent && !SECTION_RE.test(trimmed) && trimmed.length < 60) {
      html += `<div class="line name">${esc(trimmed)}</div>`
      continue
    }

    // Contact line (near top, has email/phone/linkedin)
    if (i <= 3 && (trimmed.includes('@') || trimmed.includes('+') || trimmed.includes('linkedin'))) {
      html += `<div class="line contact">${esc(trimmed)}</div>`
      continue
    }

    // Section headers
    if (SECTION_RE.test(trimmed)) {
      html += `<div class="line header">${esc(trimmed)}</div>`
      continue
    }

    // Everything else — preserve as-is with basic bold detection for job titles
    const isBold = /\d{4}/.test(trimmed) && (trimmed.includes('|') || trimmed.includes('–') || trimmed.includes(' - '))
    html += `<div class="line${isBold ? ' bold' : ''}">${esc(raw)}</div>`
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
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [originalResume, setOriginalResume] = useState(null)
  const [appliedSuggestions, setAppliedSuggestions] = useState(new Set())
  const diffRef = useRef(null)

  useEffect(() => {
    if (job.tailored_resume) setEditText(job.tailored_resume)
  }, [job.tailored_resume])

  useEffect(() => {
    api.getResume().then(r => setOriginalResume(r?.raw_text || '')).catch(() => setOriginalResume(''))
  }, [])

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
      // Add new: append to the relevant section (or create it)
      currentText = appendToSection(currentText, imp.section, suggested, imp.type === 'new_section')
    }

    setEditText(currentText)
    // Save immediately
    await api.updateJob(jobId, { tailored_resume: currentText })
    setJob({ ...job, tailored_resume: currentText })
    setAppliedSuggestions(prev => new Set([...prev, idx]))
  }

  function isSectionHeader(line) {
    const t = line.trim()
    if (!t || t.length < 2 || t.length > 60) return false
    // Matches ALL CAPS lines or Title Case standalone lines (no punctuation, no numbers)
    return /^[A-Z][A-Z\s&\/\-]{2,}$/.test(t) || /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/.test(t)
  }

  function appendToSection(text, sectionName, newLine, isNewSection) {
    if (!sectionName) return text + '\n' + newLine

    const lines = text.split('\n')
    const needle = sectionName.trim().toLowerCase()

    // Fuzzy match: find a section header that contains the target name (or vice versa)
    let sectionStart = -1
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim().toLowerCase()
      if (isSectionHeader(lines[i]) && (t === needle || t.includes(needle) || needle.includes(t))) {
        sectionStart = i
        break
      }
    }

    if (sectionStart >= 0) {
      // Find end of this section: next section header or end of file
      let j = sectionStart + 1
      while (j < lines.length && !isSectionHeader(lines[j])) j++
      // Walk back over trailing blank lines
      let insertIdx = j
      while (insertIdx > sectionStart + 1 && lines[insertIdx - 1].trim() === '') insertIdx--
      const bullet = (newLine.startsWith('-') || newLine.startsWith('•')) ? '' : '- '
      lines.splice(insertIdx, 0, bullet + newLine)
    } else {
      // Section doesn't exist — create it before LANGUAGES if present
      const langIdx = lines.findIndex(l => /^languages\s*$/i.test(l.trim()))
      const insertAt = langIdx >= 0 ? langIdx : lines.length
      const bullet = (newLine.startsWith('-') || newLine.startsWith('•')) ? '' : '- '
      lines.splice(insertAt, 0, '', sectionName.toUpperCase(), bullet + newLine)
    }
    return lines.join('\n')
  }

  const handleExport = () => {
    const text = diffRef.current?.getEffectiveText() || editText || job.tailored_resume
    if (!text) return
    generateDocx(text, job.company, job.role)
  }

  const resumeLoaded = originalResume !== null

  return (
    <div className="resume-tab">
      {resumeLoaded && !originalResume && (
        <div className="info-banner info-banner-warn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          No resume uploaded yet — tailoring won't work without one. Upload your resume using the button in the top header.
        </div>
      )}
      <div className="tab-actions">
        <button className="btn btn-primary" onClick={onTailor} disabled={tailoring || !originalResume}>
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
        <div className="resume-unified">
          {/* Resume text — editable */}
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
                <button className="btn btn-primary btn-sm" onClick={handleSaveEdit} disabled={saving} style={{ marginTop: '0.5rem' }}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <pre className="description-text">{job.tailored_resume}</pre>
            )}
          </div>

          {/* Changes from original */}
          {originalResume && (
            <div className="resume-changes-section">
              <h4>Changes from Original</h4>
              <ResumeDiff ref={diffRef} original={originalResume} tailored={job.tailored_resume} onApply={handleApplyDiff} />
            </div>
          )}

          {/* Suggestions */}
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
                        <span className="suggestion-label">{imp.type === 'new_section' ? 'New section:' : imp.original ? 'Change to:' : 'Add:'}</span> {imp.suggested || imp.suggestion}
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
