import { useState } from 'react'
import JobSearchChat from './JobSearchChat.jsx'

const PLATFORMS = [
  {
    name: 'LinkedIn',
    color: '#0A66C2',
    logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/linkedin.svg',
    searchUrl: (q) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}`,
    homeUrl: 'https://www.linkedin.com/jobs/',
    description: 'Professional network jobs',
  },
  {
    name: 'Glassdoor',
    color: '#0CAA41',
    logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/glassdoor.svg',
    searchUrl: (q) => `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(q)}`,
    homeUrl: 'https://www.glassdoor.com/Job/index.htm',
    description: 'Jobs + company reviews',
  },
  {
    name: 'Indeed',
    color: '#2164F3',
    logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/indeed.svg',
    searchUrl: (q) => `https://www.indeed.com/jobs?q=${encodeURIComponent(q)}`,
    homeUrl: 'https://www.indeed.com/',
    description: 'Largest job board',
  },
  {
    name: 'Google Jobs',
    color: '#4285F4',
    logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/google.svg',
    searchUrl: (q) => `https://www.google.com/search?q=${encodeURIComponent(q + ' jobs')}&ibp=htl;jobs`,
    homeUrl: 'https://www.google.com/search?q=jobs&ibp=htl;jobs',
    description: 'Aggregates all job boards',
  },
  {
    name: 'AllJobs',
    color: '#E8462A',
    logo: null,
    initials: 'AJ',
    searchUrl: (q) => `https://www.alljobs.co.il/SearchResultsGuest.aspx?position=${encodeURIComponent(q)}`,
    homeUrl: 'https://www.alljobs.co.il/',
    description: 'Israeli job board #1',
    isLocal: true,
  },
  {
    name: 'JobMaster',
    color: '#003B7A',
    logo: null,
    initials: 'JM',
    searchUrl: (q) => `https://www.jobmaster.co.il/jobs/?q=${encodeURIComponent(q)}`,
    homeUrl: 'https://www.jobmaster.co.il/',
    description: 'Israeli job board',
    isLocal: true,
  },
  {
    name: 'Drushim',
    color: '#FF6600',
    logo: null,
    initials: 'DR',
    searchUrl: (q) => `https://www.drushim.co.il/jobs/search/?q=${encodeURIComponent(q)}`,
    homeUrl: 'https://www.drushim.co.il/',
    description: 'Israeli tech jobs',
    isLocal: true,
  },
  {
    name: 'LinkedIn',
    color: '#0A66C2',
    logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/linkedin.svg',
    searchUrl: (q) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}&location=Israel`,
    homeUrl: 'https://www.linkedin.com/jobs/search/?location=Israel',
    description: 'Professional network jobs',
    isLocal: true,
  },
  {
    name: 'Wellfound',
    color: '#000000',
    logo: 'https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/angellist.svg',
    searchUrl: (q) => `https://wellfound.com/jobs?query=${encodeURIComponent(q)}`,
    homeUrl: 'https://wellfound.com/jobs',
    description: 'Startup jobs',
  },
  {
    name: 'Greenhouse',
    color: '#3ABF6E',
    logo: null,
    initials: 'GH',
    searchUrl: (q) => `https://job-boards.greenhouse.io/`,
    homeUrl: 'https://job-boards.greenhouse.io/',
    description: 'Tech company boards',
  },
]

export default function FindJobs() {
  const [activeQuery, setActiveQuery] = useState('')

  const handleSearch = (platform) => {
    const url = activeQuery ? platform.searchUrl(activeQuery) : platform.homeUrl
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleClear = () => setActiveQuery('')

  const handleAISuggestion = (suggestion) => setActiveQuery(suggestion)

  const international = PLATFORMS.filter(p => !p.isLocal)
  const local = PLATFORMS.filter(p => p.isLocal)

  return (
    <div className="find-jobs">
      <div className="find-jobs-header">
        <h2>Find Jobs</h2>
        <p className="muted">Ask the AI to suggest roles and search terms, then click a platform to open it.</p>
      </div>

      <JobSearchChat
        currentQuery={activeQuery}
        onSearchSuggestion={handleAISuggestion}
      />

      {activeQuery ? (
        <div className="find-jobs-active-banner" style={{ marginTop: '1rem' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Searching for <strong>"{activeQuery}"</strong> — click any platform below
          <button className="find-jobs-clear-query" onClick={handleClear} title="Clear search">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      ) : (
        <div className="find-jobs-idle-banner" style={{ marginTop: '1rem' }}>
          Ask the AI above, or click a platform to browse jobs
        </div>
      )}

      <div className="find-jobs-section">
        <h3 className="find-jobs-section-title">International</h3>
        <div className="find-jobs-grid">
          {international.map(platform => (
            <PlatformCard key={platform.name} platform={platform} active={!!activeQuery} onClick={() => handleSearch(platform)} />
          ))}
        </div>
      </div>

      <div className="find-jobs-section">
        <h3 className="find-jobs-section-title">Israel</h3>
        <div className="find-jobs-grid">
          {local.map(platform => (
            <PlatformCard key={platform.name} platform={platform} active={!!activeQuery} onClick={() => handleSearch(platform)} />
          ))}
        </div>
      </div>

      <JobSearchChat
        currentQuery={activeQuery}
        onSearchSuggestion={handleAISuggestion}
      />
    </div>
  )
}

function PlatformCard({ platform, active, onClick }) {
  return (
    <button className={`platform-card ${active ? 'platform-card-active' : ''}`} onClick={onClick} title={active ? `Search on ${platform.name}` : `Open ${platform.name}`}>
      <div className="platform-card-logo" style={{ backgroundColor: platform.color + '15', border: `1.5px solid ${platform.color}30` }}>
        {platform.logo ? (
          <img
            src={platform.logo}
            alt={platform.name}
            width="28"
            height="28"
            style={{ filter: 'none', opacity: 0.9 }}
            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
          />
        ) : null}
        <span
          className="platform-initials"
          style={{ color: platform.color, display: platform.logo ? 'none' : 'flex' }}
        >
          {platform.initials || platform.name.slice(0, 2).toUpperCase()}
        </span>
      </div>
      <div className="platform-card-info">
        <span className="platform-card-name">{platform.name}</span>
        <span className="platform-card-desc">{platform.description}</span>
      </div>
      <div className="platform-card-arrow" style={{ color: platform.color }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </div>
    </button>
  )
}
