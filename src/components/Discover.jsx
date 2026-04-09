import React, { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { api } from '../api.js'

export default function Discover({ onJobAdded, columns }) {
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)
  const [savedIds, setSavedIds] = useState(new Set())
  const [savingId, setSavingId] = useState(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    setResults([])

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      const res = await fetch(`${supabaseUrl}/functions/v1/job-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ query: query.trim(), location: location.trim() }),
      })

      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResults(data.jobs || [])
      if (data.jobs?.length === 0) setError('No jobs found. Try different keywords.')
    } catch (err) {
      setError(err.message)
    }
    setSearching(false)
  }

  const handleSave = async (job) => {
    setSavingId(job.id)
    try {
      const backlog = columns?.find(c => c.is_default)
      await api.createJob({
        company: job.company,
        role: job.role,
        link: job.link,
        description: job.description,
        source: job.source || 'Job Board',
        status: backlog?.name || 'Backlog',
        logo_url: job.logo || '',
      })
      setSavedIds(prev => new Set([...prev, job.id]))
      if (onJobAdded) onJobAdded()
    } catch (err) {
      alert('Error saving: ' + err.message)
    }
    setSavingId(null)
  }

  const timeAgo = (dateStr) => {
    if (!dateStr) return ''
    const diff = Date.now() - new Date(dateStr).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return '1 day ago'
    if (days < 7) return `${days} days ago`
    return `${Math.floor(days / 7)}w ago`
  }

  return (
    <div className="discover">
      <div className="discover-search">
        <div className="discover-inputs">
          <div className="discover-input-group">
            <label>What are you looking for?</label>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. Product Operations Manager, Release Manager, TPM..."
              className="discover-input"
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <div className="discover-input-group discover-location">
            <label>Location (optional)</label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Israel, Remote, New York..."
              className="discover-input"
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button className="btn btn-primary discover-search-btn" onClick={handleSearch} disabled={searching || !query.trim()}>
            {searching ? 'Searching...' : 'Search Jobs'}
          </button>
        </div>
        <p className="discover-hint">Searches Google Jobs — aggregates LinkedIn, Indeed, Glassdoor, and more.</p>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {results.length > 0 && (
        <div className="discover-results">
          <p className="discover-count">{results.length} jobs found</p>
          <div className="discover-list">
            {results.map(job => {
              const isSaved = savedIds.has(job.id)
              const isSaving = savingId === job.id
              return (
                <div key={job.id} className="discover-card">
                  <div className="discover-card-top">
                    {job.logo ? (
                      <img src={job.logo} alt="" className="discover-logo" onError={e => e.target.style.display = 'none'} />
                    ) : (
                      <div className="discover-logo-placeholder">{job.company.charAt(0)}</div>
                    )}
                    <div className="discover-card-info">
                      <span className="discover-card-role">{job.role}</span>
                      <span className="discover-card-company">{job.company}</span>
                      <div className="discover-card-meta">
                        {job.location && <span>{job.location}</span>}
                        {job.type && <span>{job.type}</span>}
                        {job.posted && <span>{job.posted}</span>}
                        {job.source && <span className="discover-source">{job.source.replace('via ', '')}</span>}
                      </div>
                    </div>
                    <div className="discover-card-actions">
                      {(job.apply_links?.length > 0 ? job.apply_links[0].link : job.link) && (
                        <a href={job.apply_links?.length > 0 ? job.apply_links[0].link : job.link} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                          Apply
                        </a>
                      )}
                      <button
                        className={`btn btn-sm ${isSaved ? 'btn-ghost' : 'btn-primary'}`}
                        onClick={() => handleSave(job)}
                        disabled={isSaved || isSaving}
                      >
                        {isSaving ? '...' : isSaved ? 'Saved' : '+ Add'}
                      </button>
                    </div>
                  </div>
                  {job.description && (
                    <p className="discover-card-desc">{job.description.slice(0, 200)}...</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!searching && results.length === 0 && !error && (
        <div className="discover-empty">
          <p>Search for jobs across multiple platforms. Describe the role you're looking for and optionally add a location.</p>
        </div>
      )}
    </div>
  )
}
