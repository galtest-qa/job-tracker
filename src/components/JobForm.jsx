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
  const [importPartial, setImportPartial] = useState(false)
  const urlInputRef = useRef(null)

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const handleImport = async (e) => {
    e?.preventDefault()
    const url = importUrl.trim()
    if (!url) return
    setImporting(true)
    setImportError(null)
    setImportPartial(false)
    try {
      const result = await api.importJobFromUrl(url)
      setForm(prev => ({
        ...prev,
        company:     result.company     || prev.company,
        role:        result.role        || prev.role,
        description: result.description || prev.description,
        link:        url,
        source:      inferSource(result.source_type),
      }))
      if (result.partial) setImportPartial(true)
    } catch (err) {
      setImportError(err.message || 'Could not extract job — please fill in manually')
    }
    setImporting(false)
  }

  const handleImportKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleImport() }
  }

  function inferSource(sourceType) {
    if (sourceType === 'linkedin') return 'LinkedIn'
    if (['greenhouse', 'lever', 'ashby', 'workday'].includes(sourceType)) return 'Company Website'
    return 'Job Board'
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
          {importPartial && !importError && (
            <p className="job-import-note">
              ⚠ Some fields couldn't be extracted — please review and fill in missing details.
            </p>
          )}
          {!importError && !importPartial && importUrl && !importing && form.company && (
            <p className="job-import-note job-import-note--ok">✓ Fields filled from URL — review and save</p>
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
