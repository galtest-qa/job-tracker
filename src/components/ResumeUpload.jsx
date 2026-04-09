import React, { useState, useRef } from 'react'
import { api } from '../api.js'
import * as mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

async function extractTextFromDocx(file) {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map(item => item.str).join(' ')
    pages.push(text)
  }
  return pages.join('\n\n')
}

async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (ext === 'pdf') return extractTextFromPdf(file)
  if (ext === 'docx' || ext === 'doc') return extractTextFromDocx(file)
  return file.text()
}

// CV Builder questions
const CV_QUESTIONS = [
  { key: 'full_name', label: 'Full Name', placeholder: 'John Doe' },
  { key: 'email', label: 'Email', placeholder: 'john@example.com' },
  { key: 'phone', label: 'Phone', placeholder: '+972-50-123-4567' },
  { key: 'linkedin', label: 'LinkedIn URL', placeholder: 'https://linkedin.com/in/johndoe' },
  { key: 'summary', label: 'Professional Summary', placeholder: 'Experienced operations professional with 3 years in cloud security...', multiline: true },
  { key: 'experience', label: 'Work Experience (most recent first)', placeholder: 'Release Operations Manager | Upwind Security | 2023-2024\n- Built and scaled release operations from scratch\n- Managed PoCs with enterprise customers\n\nQA Engineer | Upwind Security | 2022-2023\n- Improved QA coverage and product readiness', multiline: true },
  { key: 'skills', label: 'Skills', placeholder: 'Release management, QA, CI/CD, cross-functional collaboration, Jira, Git' },
  { key: 'education', label: 'Education', placeholder: 'B.Sc. Computer Science | Tel Aviv University | 2022' },
  { key: 'certifications', label: 'Certifications (optional)', placeholder: 'AWS Cloud Practitioner, PMP...' },
  { key: 'languages', label: 'Languages (optional)', placeholder: 'English (fluent), Hebrew (native)' },
]

function buildResumeFromQuestions(answers) {
  const lines = []
  if (answers.full_name) lines.push(answers.full_name)
  const contact = [answers.email, answers.phone, answers.linkedin].filter(Boolean).join(' | ')
  if (contact) lines.push(contact)
  lines.push('')

  if (answers.summary) {
    lines.push('SUMMARY')
    lines.push(answers.summary)
    lines.push('')
  }
  if (answers.experience) {
    lines.push('EXPERIENCE')
    lines.push(answers.experience)
    lines.push('')
  }
  if (answers.skills) {
    lines.push('SKILLS')
    lines.push(answers.skills)
    lines.push('')
  }
  if (answers.education) {
    lines.push('EDUCATION')
    lines.push(answers.education)
    lines.push('')
  }
  if (answers.certifications) {
    lines.push('CERTIFICATIONS')
    lines.push(answers.certifications)
    lines.push('')
  }
  if (answers.languages) {
    lines.push('LANGUAGES')
    lines.push(answers.languages)
  }
  return lines.join('\n')
}

export default function ResumeUpload({ current, onClose, onSaved }) {
  const [mode, setMode] = useState('upload') // 'upload' | 'build'
  const [text, setText] = useState(current?.raw_text || '')
  const [filename, setFilename] = useState(current?.filename || '')
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [cvAnswers, setCvAnswers] = useState({})
  const fileInputRef = useRef(null)

  const handleFile = async (file) => {
    if (!file) return
    setFilename(file.name)
    setParsing(true)
    try {
      const content = await parseFile(file)
      setText(content)
    } catch (err) {
      alert('Could not parse file: ' + err.message)
    }
    setParsing(false)
  }

  const onFileInput = (e) => handleFile(e.target.files[0])
  const onDrop = (e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }
  const onDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = (e) => { e.preventDefault(); setDragging(false) }

  const handleBuildResume = () => {
    const built = buildResumeFromQuestions(cvAnswers)
    setText(built)
    setFilename('Built with CV Builder')
    setMode('upload') // Switch to upload view to show the result
  }

  const handleSave = async () => {
    if (!text.trim()) return
    setSaving(true)
    try {
      const result = await api.updateResume(text, filename)
      onSaved(result)
    } catch (err) {
      alert('Error saving resume: ' + err.message)
    }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Your Resume</h3>
          <button className="btn btn-ghost" onClick={onClose}>&times;</button>
        </div>

        <div className="resume-mode-tabs">
          <button className={`tab ${mode === 'upload' ? 'active' : ''}`} onClick={() => setMode('upload')}>
            Upload / Paste
          </button>
          <button className={`tab ${mode === 'build' ? 'active' : ''}`} onClick={() => setMode('build')}>
            Build from Scratch
          </button>
        </div>

        {mode === 'upload' && (
          <>
            <p className="modal-desc">Upload or paste your resume. Supports PDF, Word (.docx), and text files.</p>
            <div
              className={`drop-zone ${dragging ? 'dragging' : ''} ${parsing ? 'parsing' : ''}`}
              onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file"
                accept=".txt,.md,.text,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={onFileInput} disabled={parsing} hidden />
              {parsing ? (
                <div className="drop-zone-content">
                  <span className="spinner" /><span>Extracting text from {filename}...</span>
                </div>
              ) : (
                <div className="drop-zone-content">
                  <span className="drop-zone-icon">&#128196;</span>
                  <span>{filename ? filename : 'Drop file here or click to browse'}</span>
                  <span className="drop-zone-hint">PDF, Word (.docx), or text file</span>
                </div>
              )}
            </div>
            <textarea
              className="notes-textarea resume-textarea"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Or paste your resume text here..."
              rows={14}
            />
          </>
        )}

        {mode === 'build' && (
          <>
            <p className="modal-desc">Don't have a resume? Answer these questions and we'll create one for you.</p>
            <div className="cv-builder">
              {CV_QUESTIONS.map(q => (
                <div key={q.key} className="form-group">
                  <label>{q.label}</label>
                  {q.multiline ? (
                    <textarea
                      value={cvAnswers[q.key] || ''}
                      onChange={e => setCvAnswers({ ...cvAnswers, [q.key]: e.target.value })}
                      placeholder={q.placeholder}
                      rows={5}
                    />
                  ) : (
                    <input
                      type="text"
                      value={cvAnswers[q.key] || ''}
                      onChange={e => setCvAnswers({ ...cvAnswers, [q.key]: e.target.value })}
                      placeholder={q.placeholder}
                    />
                  )}
                </div>
              ))}
              <button className="btn btn-primary" onClick={handleBuildResume}
                disabled={!cvAnswers.full_name || !cvAnswers.experience}>
                Generate Resume
              </button>
            </div>
          </>
        )}

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || parsing || !text.trim()}>
            {saving ? 'Saving...' : 'Save Resume'}
          </button>
        </div>
      </div>
    </div>
  )
}
