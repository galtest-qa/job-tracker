import React, { useState, useRef } from 'react'
import { api } from '../api.js'

const SOURCES = ['LinkedIn', 'Referral', 'Company Website', 'Job Board', 'Recruiter', 'Other']

const DEPARTMENTS = ['', 'R&D / Engineering', 'Product', 'QA', 'DevOps / IT', 'Data', 'Design', 'Sales', 'Marketing', 'Operations', 'Customer Success', 'Finance', 'HR', 'Legal']

const INDUSTRIES = ['', 'AI', 'Cybersecurity', 'Cloud', 'Gaming', 'AdTech', 'FinTech', 'HealthTech', 'E-commerce', 'SaaS', 'Enterprise Software', 'DevTools', 'Blockchain / Web3', 'Defense', 'Media / Entertainment', 'EdTech', 'HR Tech', 'Mobility / Transport', 'Retail', 'Other']

export default function JobForm({ onSave, onCancel, initial, columns }) {
  const backlog = columns?.find(c => c.is_default)
  const defaultStatus = backlog?.name || columns?.[0]?.name || 'Backlog'
  const [form, setForm] = useState({
    company: initial?.company || '',
    role: initial?.role || '',
    link: initial?.link || '',
    description: initial?.description || '',
    source: initial?.source || 'LinkedIn',
    status: initial?.status || defaultStatus,
    notes: initial?.notes || '',
    company_overview: initial?.company_overview || '',
    company_industry: initial?.company_industry || '',
    company_size: initial?.company_size || '',
    contact_name: initial?.contact_name || '',
    contact_role: initial?.contact_role || '',
    contact_linkedin: initial?.contact_linkedin || '',
    contact_email: initial?.contact_email || '',
    department: initial?.department || '',
    industry: initial?.industry || '',
  })
  const [saving, setSaving] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(null)
  const [importedData, setImportedData] = useState(null) // preview before applying
  const urlInputRef = useRef(null)

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const handleImport = async (e) => {
    e?.preventDefault()
    const url = importUrl.trim()
    if (!url) return
    setImporting(true)
    setImportError(null)
    setImportedData(null)
    try {
      const result = await api.importJobFromUrl(url)
      if (result.error && !result.company && !result.role) {
        setImportError(result.error || 'Could not extract job — please fill in manually')
      } else {
        setImportedData({ ...result, url })
      }
    } catch (err) {
      setImportError(err.message || 'Could not extract job — please fill in manually')
    }
    setImporting(false)
  }

  const handleApplyImport = () => {
    if (!importedData) return
    setForm(prev => ({
      ...prev,
      company:     importedData.company     || prev.company,
      role:        importedData.role        || prev.role,
      description: importedData.description || prev.description,
      link:        importedData.url         || prev.link,
      source:      inferSource(importedData.source_type),
    }))
    setImportedData(null)
    setImportUrl('')
  }

  const handleImportKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleImport() }
  }

  function inferSource(sourceType) {
    if (sourceType === 'linkedin') return 'LinkedIn'
    if (['greenhouse', 'lever', 'ashby', 'workday'].includes(sourceType)) return 'Company Website'
    return 'Job Board'
  }

  const SOURCE_LABELS = {
    greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby',
    workday: 'Workday', linkedin: 'LinkedIn', generic: 'Career page',
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.company.trim() || !form.role.trim()) return
    setSaving(true)
    try {
      await onSave(form)
    } catch (err) {
      alert('Error: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <form className="job-form" onSubmit={handleSubmit}>
      <div className="form-header">
        <h2>{initial ? 'Edit Job' : 'Add New Job'}</h2>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>

      {/* URL Import — only show on new job form */}
      {!initial && (
        <div className="job-import-bar">
          <div className="job-import-input-row">
            <input
              ref={urlInputRef}
              type="url"
              className="job-import-input"
              value={importUrl}
              onChange={e => setImportUrl(e.target.value)}
              onKeyDown={handleImportKeyDown}
              placeholder="Paste job URL to auto-fill (LinkedIn, Greenhouse, Lever, Ashby, Workday…)"
              disabled={importing}
              autoFocus
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleImport}
              disabled={importing || !importUrl.trim()}
            >
              {importing ? 'Importing…' : 'Import'}
            </button>
          </div>
          {importError && (
            <p className="job-import-note job-import-note--error">{importError}</p>
          )}

          {/* Preview card — shown after extraction, before applying */}
          {importedData && (
            <div className={`job-import-preview ${importedData.partial ? 'job-import-preview--partial' : ''}`}>
              <div className="job-import-preview-source">
                <span className="job-import-badge">{SOURCE_LABELS[importedData.source_type] || importedData.source_type}</span>
                {importedData.confidence === 'high' && <span className="job-import-confidence high">High confidence</span>}
                {importedData.confidence === 'medium' && <span className="job-import-confidence medium">Review fields</span>}
                {importedData.confidence === 'low' && <span className="job-import-confidence low">Low confidence</span>}
              </div>
              <div className="job-import-preview-fields">
                <div className="job-import-field">
                  <span className="job-import-field-label">Company</span>
                  <span className="job-import-field-value">{importedData.company || <em className="muted">not found</em>}</span>
                </div>
                <div className="job-import-field">
                  <span className="job-import-field-label">Role</span>
                  <span className="job-import-field-value">{importedData.role || <em className="muted">not found</em>}</span>
                </div>
                {importedData.location && (
                  <div className="job-import-field">
                    <span className="job-import-field-label">Location</span>
                    <span className="job-import-field-value">{importedData.location}</span>
                  </div>
                )}
              </div>
              {importedData.error && (
                <p className="job-import-note job-import-note--error" style={{ marginTop: '0.4rem' }}>{importedData.error}</p>
              )}
              {importedData.partial && !importedData.error && (
                <p className="job-import-note" style={{ marginTop: '0.4rem' }}>⚠ Some fields incomplete — review before saving</p>
              )}
              <div className="job-import-preview-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={handleApplyImport}>
                  Apply to form →
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setImportedData(null); setImportUrl('') }}>
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="form-grid">
        <div className="form-group">
          <label>Company *</label>
          <input type="text" value={form.company} onChange={set('company')} placeholder="e.g. Wiz" required />
        </div>
        <div className="form-group">
          <label>Role *</label>
          <input type="text" value={form.role} onChange={set('role')} placeholder="e.g. Release Operations Manager" required />
        </div>
        <div className="form-group">
          <label>Job Post Link</label>
          <input type="url" value={form.link} onChange={set('link')} placeholder="https://..." />
        </div>
        <div className="form-group">
          <label>Source</label>
          <select value={form.source} onChange={set('source')}>
            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Department</label>
          <select value={form.department} onChange={set('department')}>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d || '— Select —'}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Industry</label>
          <select value={form.industry} onChange={set('industry')}>
            {INDUSTRIES.map(i => <option key={i} value={i}>{i || '— Select —'}</option>)}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label>Job Description (paste the full description for best AI analysis)</label>
        <textarea value={form.description} onChange={set('description')} rows={10}
          placeholder="Paste the full job description here..." />
      </div>

      <details className="form-details">
        <summary>Company Info (optional)</summary>
        <div className="form-grid">
          <div className="form-group">
            <label>Company Overview</label>
            <input type="text" value={form.company_overview} onChange={set('company_overview')}
              placeholder="Brief company description" />
          </div>
          <div className="form-group">
            <label>Industry</label>
            <input type="text" value={form.company_industry} onChange={set('company_industry')}
              placeholder="e.g. Cloud Security" />
          </div>
          <div className="form-group">
            <label>Size / Stage</label>
            <input type="text" value={form.company_size} onChange={set('company_size')}
              placeholder="e.g. Series C, 500 employees" />
          </div>
        </div>
      </details>

      <details className="form-details">
        <summary>Contact Person (optional)</summary>
        <div className="form-grid">
          <div className="form-group">
            <label>Name</label>
            <input type="text" value={form.contact_name} onChange={set('contact_name')}
              placeholder="e.g. Sarah Cohen" />
          </div>
          <div className="form-group">
            <label>Role</label>
            <input type="text" value={form.contact_role} onChange={set('contact_role')}
              placeholder="e.g. Hiring Manager, Recruiter" />
          </div>
          <div className="form-group">
            <label>LinkedIn</label>
            <input type="url" value={form.contact_linkedin} onChange={set('contact_linkedin')}
              placeholder="https://linkedin.com/in/..." />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.contact_email} onChange={set('contact_email')}
              placeholder="sarah@company.com" />
          </div>
        </div>
      </details>

      <div className="form-group">
        <label>Notes</label>
        <textarea value={form.notes} onChange={set('notes')} rows={3}
          placeholder="Any initial thoughts or context..." />
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : initial ? 'Update Job' : 'Add Job'}
        </button>
      </div>
    </form>
  )
}
