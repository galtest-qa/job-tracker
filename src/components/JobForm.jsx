import React, { useState } from 'react'

const SOURCES = ['LinkedIn', 'Referral', 'Company Website', 'Job Board', 'Recruiter', 'Other']

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
  })
  const [saving, setSaving] = useState(false)

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

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
