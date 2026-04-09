import React from 'react'

export default function ResumePreview({ text, company, role, onClose }) {
  if (!text) return null

  // Parse resume text into styled sections
  const lines = text.split('\n')
  const elements = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      elements.push(<div key={i} className="preview-spacer" />)
      continue
    }

    // Section headers (ALL CAPS or common patterns)
    const isHeader = /^[A-Z][A-Z\s&\/]{2,}$/.test(trimmed) ||
      /^(SUMMARY|EXPERIENCE|EDUCATION|SKILLS|CERTIFICATIONS|PROJECTS|PROFESSIONAL SUMMARY|WORK EXPERIENCE|TECHNICAL SKILLS|PROFESSIONAL EXPERIENCE|OBJECTIVE|PROFILE|LANGUAGES|AWARDS)$/i.test(trimmed)

    if (isHeader) {
      elements.push(<h3 key={i} className="preview-section-header">{trimmed}</h3>)
      continue
    }

    // Bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
      elements.push(
        <div key={i} className="preview-bullet">
          <span className="preview-bullet-dot" />
          <span>{trimmed.replace(/^[-•*]\s*/, '')}</span>
        </div>
      )
      continue
    }

    // Job title lines (contain dates, pipes, dashes with company names)
    const isTitleLine = /\d{4}/.test(trimmed) && (trimmed.includes('|') || trimmed.includes('–') || trimmed.includes(' - '))
    if (isTitleLine) {
      elements.push(<div key={i} className="preview-job-title">{trimmed}</div>)
      continue
    }

    // First line = likely the person's name
    if (i === 0 || (i === 1 && !lines[0].trim())) {
      elements.push(<h2 key={i} className="preview-name">{trimmed}</h2>)
      continue
    }

    // Contact line (contains email, phone, or URL patterns)
    if (i <= 2 && (trimmed.includes('@') || trimmed.includes('+') || trimmed.includes('linkedin'))) {
      elements.push(<div key={i} className="preview-contact">{trimmed}</div>)
      continue
    }

    // Regular text
    elements.push(<p key={i} className="preview-text">{trimmed}</p>)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-preview" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Resume Preview</h3>
          <button className="btn btn-ghost" onClick={onClose}>&times;</button>
        </div>
        {company && <p className="preview-subtitle">Tailored for {company}{role ? ` — ${role}` : ''}</p>}
        <div className="resume-preview-page">
          {elements}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
