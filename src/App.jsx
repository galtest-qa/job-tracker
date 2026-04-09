import React, { useState, useEffect, useCallback } from 'react'
import { supabase, isConfigured } from './lib/supabase.js'
import { api, initUserData } from './api.js'
import KanbanBoard from './components/KanbanBoard.jsx'
import JobForm from './components/JobForm.jsx'
import JobDetail from './components/JobDetail.jsx'
import ResumeUpload from './components/ResumeUpload.jsx'
import Auth from './components/Auth.jsx'
import Settings from './components/Settings.jsx'

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

  const loadResume = useCallback(async () => {
    try { const r = await api.getResume(); setResumeInfo(r) } catch {}
  }, [])

  // Load data after auth
  useEffect(() => {
    if (session) {
      initUserData().then(() => {
        refresh()
        loadResume()
      })
    } else if (session === null) {
      setLoading(false)
    }
  }, [session, refresh, loadResume])

  const openDetail = (id, tab = null) => { setSelectedJobId(id); setInitialTab(tab); setView('detail') }
  const goHome = () => { setView('board'); setSelectedJobId(null); setInitialTab(null); refresh() }

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
          <h1>Job Tracker</h1>
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

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}

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
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filterScore={filterScore}
            onFilterScoreChange={setFilterScore}
          />
        )}
        {view === 'add' && (
          <JobForm
            columns={columns}
            onSave={async (data) => {
              await api.createJob(data)
              goHome()
            }}
            onCancel={goHome}
          />
        )}
        {view === 'detail' && selectedJobId && (
          <JobDetail
            jobId={selectedJobId}
            columns={columns}
            initialTab={initialTab}
            onBack={goHome}
            onRefresh={refresh}
          />
        )}
      </main>
    </div>
  )
}
