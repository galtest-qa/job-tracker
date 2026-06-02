import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, isConfigured } from './lib/supabase.js'
import { api, initUserData } from './api.js'
import { trackWin } from './lib/winTracker.js'
import KanbanBoard from './components/KanbanBoard.jsx'
import JobForm from './components/JobForm.jsx'
import JobDetail from './components/JobDetail.jsx'
import ResumeUpload from './components/ResumeUpload.jsx'
import Auth from './components/Auth.jsx'
import Settings from './components/Settings.jsx'
import FindJobs from './components/FindJobs.jsx'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading, null = not auth'd
  const [jobs, setJobs] = useState([])
  const [columns, setColumns] = useState([])
  const [stats, setStats] = useState(null)
  const [view, setView] = useState('board')
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [initialTab, setInitialTab] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterScore, setFilterScore] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [showResume, setShowResume] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [resumeInfo, setResumeInfo] = useState(null)
  const [panelWide, setPanelWide] = useState(false)
  const [generatingJobIds, setGeneratingJobIds] = useState(new Set())
  const [hasExtension, setHasExtension] = useState(false)
  const [showSettingsSection, setShowSettingsSection] = useState(null)
  const [gmailCallbackResult, setGmailCallbackResult] = useState(null)
  const resumeInfoRef = useRef(null)

  // Handle OAuth callback redirect (e.g. ?gmail=connected)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const gmailResult = params.get('gmail')
    if (gmailResult) {
      window.history.replaceState({}, '', window.location.pathname)
      setGmailCallbackResult(gmailResult)
      setShowSettingsSection('gmail')
      setShowSettings(true)
    }
  }, [])

  // Auth listener
  useEffect(() => {
    if (!isConfigured || !supabase) {
      setSession(null)
      return
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [jobsData, colsData, statsData] = await Promise.all([
        api.getJobs(), api.getColumns(), api.getStats()
      ])
      setJobs(jobsData)
      setColumns(colsData)
      setStats(statsData)
    } catch (err) {
      console.error('Refresh error:', err)
    }
    setLoading(false)
  }, [])

  const updateJobScore = useCallback((jobId, score) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, match_score: score } : j))
  }, [])

  const moveJob = useCallback((jobId, status) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status } : j))
    api.updateJob(jobId, { status }).catch(err => {
      console.error('Move job failed:', err)
      refresh()
    })
  }, [refresh])

  const reorderCols = useCallback((orderedIds) => {
    setColumns(prev => orderedIds.map(id => prev.find(c => c.id === id)).filter(Boolean))
    api.reorderColumns(orderedIds).catch(err => {
      console.error('Reorder columns failed:', err)
      refresh()
    })
  }, [refresh])

  const loadResume = useCallback(async () => {
    try { const r = await api.getResume(); setResumeInfo(r); resumeInfoRef.current = r } catch {}
  }, [])

  const loadSettings = useCallback(async () => {
    try { const s = await api.getSettings(); setHasExtension(!!s.has_extension) } catch {}
  }, [])

  const handleExtensionConfirm = useCallback(async (val) => {
    setHasExtension(val)
    await api.updateSettings({ has_extension: val })
  }, [])

  const autoGenerate = useCallback(async (jobId, hasDescription, hasResume) => {
    const calls = []
    if (hasDescription) calls.push(api.analyzeJob(jobId).then(() => trackWin('analyzed')))
    if (hasDescription && hasResume) {
      calls.push(api.tailorResume(jobId).then(() => trackWin('tailored')))
      calls.push(api.interviewPrep(jobId))
    }
    if (!calls.length) return
    setGeneratingJobIds(prev => new Set([...prev, jobId]))
    try { await Promise.allSettled(calls) } catch {}
    setGeneratingJobIds(prev => { const s = new Set(prev); s.delete(jobId); return s })
    refresh()
  }, [refresh])

  // Load data after auth
  useEffect(() => {
    if (session) {
      initUserData().then(() => {
        refresh()
        loadResume()
        loadSettings()
      })
    } else if (session === null) {
      setLoading(false)
    }
  }, [session, refresh, loadResume, loadSettings])

  const closePanel = () => { setSelectedJobId(null); setInitialTab(null); setPanelWide(false) }
  const openDetail = (id, tab = null) => { setSelectedJobId(id); setInitialTab(tab ?? null) }
  const goHome = () => { setView('board'); closePanel() }

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') closePanel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setJobs([])
    setColumns([])
    setView('board')
  }

  // Loading auth state
  if (session === undefined) return <div className="loading">Loading...</div>

  // Not authenticated
  if (!session) return <Auth />

  // Authenticated but loading data
  if (loading) return <div className="loading">Loading...</div>

  return (
    <div className="app">
      <header className="header">
        <div className="header-left" onClick={goHome} style={{ cursor: 'pointer' }}>
          <img src="/logo.png" alt="Job Maker" style={{ height: '48px', width: '48px', objectFit: 'contain', mixBlendMode: 'multiply' }} />
          <h1>Job Maker</h1>
        </div>
        <div className="header-right">
          {stats && (
            <div className="stats-bar">
              <span className="stat">{stats.total} jobs</span>
              {stats.avgScore && <span className="stat">Avg match: {stats.avgScore}%</span>}
            </div>
          )}
          <button
            className={`btn ${resumeInfo?.raw_text ? 'btn-secondary' : 'btn-secondary resume-missing'}`}
            onClick={() => setShowResume(true)}
          >
            {resumeInfo?.raw_text ? `Resume: ${resumeInfo.filename || 'Uploaded'}` : 'Upload Resume'}
          </button>
          <button className={`btn ${view === 'find' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView(view === 'find' ? 'board' : 'find')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Find Jobs
          </button>
          <button className="btn btn-primary" onClick={() => setView('add')}>+ Add Job</button>
          <button className="btn btn-ghost" onClick={() => setShowSettings(true)} title="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button className="btn btn-ghost" onClick={handleLogout} title="Sign out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </header>

      {showSettings && (
        <Settings
          onClose={() => { setShowSettings(false); setShowSettingsSection(null); setGmailCallbackResult(null) }}
          initialSection={showSettingsSection}
          hasExtension={hasExtension}
          onExtensionConfirm={handleExtensionConfirm}
          gmailCallbackResult={gmailCallbackResult}
        />
      )}

      {showResume && (
        <ResumeUpload
          current={resumeInfo}
          onClose={() => setShowResume(false)}
          onSaved={(data) => { setResumeInfo(data); setShowResume(false) }}
        />
      )}

      <main className="main">
        {view === 'board' && (
          <KanbanBoard
            jobs={jobs}
            columns={columns}
            onSelect={openDetail}
            onRefresh={refresh}
            onMoveJob={moveJob}
            onReorderColumns={reorderCols}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filterScore={filterScore}
            onFilterScoreChange={setFilterScore}
            generatingJobIds={generatingJobIds}
            hasExtension={hasExtension}
            hasResume={!!resumeInfo?.raw_text}
            onOpenSettings={(section) => { setShowSettingsSection(section || null); setShowSettings(true) }}
            onOpenResume={() => setShowResume(true)}
            onAddJob={() => setView('add')}
          />
        )}
        {view === 'find' && <FindJobs />}
        {view === 'add' && (
          <JobForm
            columns={columns}
            onSave={async (data) => {
              const newJob = await api.createJob(data)
              await refresh()
              goHome()
              autoGenerate(newJob.id, !!data.description, !!resumeInfoRef.current?.raw_text)
            }}
            onCancel={goHome}
          />
        )}
      </main>

      {selectedJobId && (
        <>
          <div className="panel-backdrop" onClick={closePanel} />
          <div className={`side-panel${panelWide ? ' side-panel-wide' : ''}`}>
            <div className="side-panel-bar" style={{ justifyContent: 'flex-start' }}>
              <button className="panel-btn" onClick={closePanel} title="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <button className="panel-btn" onClick={() => setPanelWide(w => !w)} title={panelWide ? 'Shrink panel' : 'Expand panel'}>
                {panelWide
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/><polyline points="9 18 3 12 9 6"/><polyline points="21 18 15 12 21 6"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/><polyline points="15 18 21 12 15 6"/><polyline points="3 18 9 12 3 6"/></svg>
                }
              </button>
            </div>
            <div className="side-panel-content">
              <JobDetail
                jobId={selectedJobId}
                columns={columns}
                initialTab={initialTab}
                onBack={closePanel}
                onRefresh={refresh}
                onJobScoreUpdate={updateJobScore}
                isPanel
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
