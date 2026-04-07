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

export default function ResumeUpload({ current, onClose, onSaved }) {
  const [text, setText] = useState(current?.raw_text || '')
  const [filename, setFilename] = useState(current?.filename || '')
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [dragging, setDragging] = useState(false)
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

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const onDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = (e) => { e.preventDefault(); setDragging(false) }

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
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Your Resume</h3>
          <button className="btn btn-ghost" onClick={onClose}>&times;</button>
        </div>
        <p className="modal-desc">
          Upload or paste your resume. Supports PDF, Word (.docx), and text files.
        </p>
        <div
          className={`drop-zone ${dragging ? 'dragging' : ''} ${parsing ? 'parsing' : ''}`}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.text,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={onFileInput}
            disabled={parsing}
            hidden
          />
          {parsing ? (
            <div className="drop-zone-content">
              <span className="spinner" />
              <span>Extracting text from {filename}...</span>
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
          placeholder={"Or paste your resume text here..."}
          rows={14}
        />
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
