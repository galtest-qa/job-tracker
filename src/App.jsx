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
import Notifications from './components/Notifications.jsx'
import HiringEventPopup from './components/HiringEventPopup.jsx'

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
  const [showNotifications, setShowNotifications] = useState(false)
  const [unreadEventCount, setUnreadEventCount] = useState(0)
  const [popupEvent, setPopupEvent] = useState(null)
  const [popupGroupCount, setPopupGroupCount] = useState(0)
  const [hiringEvents, setHiringEvents] = useState([])
  const [lastSyncInfo, setLastSyncInfo] = useState(null) // {trigger, status, time, skipped, reason, minutesSince, emailsScanned, eventsCreated, error}
  const [gmailNeedsReconnect, setGmailNeedsReconnect] = useState(false)
  const resumeInfoRef = useRef(null)
  const lastSyncRef = useRef(0)
  const tabHiddenAtRef = useRef(0)

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

  // Handle Telegram deep links: ?job=<id> and ?job=<id>&tab=reminders
  // Read params immediately on mount (before jobs load), then open once loading is done
  const pendingDeepLink = useRef(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const jobId = params.get('job')
    if (jobId) {
      const tab = params.get('tab') || null
      pendingDeepLink.current = { jobId, tab }
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    if (loading || !pendingDeepLink.current) return
    const { jobId, tab } = pendingDeepLink.current
    pendingDeepLink.current = null
    // Only open if the job actually exists — silently ignore stale/invalid IDs
    if (jobs.some(j => j.id === jobId)) {
      setSelectedJobId(jobId)
      setInitialTab(tab)
    }
  }, [loading, jobs])

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

  const loadUnreadCount = useCallback(async () => {
    try { const n = await api.getUnreadEventCount(); setUnreadEventCount(n) } catch {}
  }, [])

  const handlePopupClose = useCallback(async (event, action) => {
    setPopupEvent(null)
    setPopupGroupCount(0)
    if (!event) return
    if (action === 'move' && event.matched_job_id && event.suggested_stage) {
      moveJob(event.matched_job_id, event.suggested_stage)
    }
    try {
      if (action === 'move') await api.markEventStatus(event.id, 'acted', 'moved_to_stage')
      else if (action === 'keep') await api.markEventStatus(event.id, 'reviewed')
      else if (action === 'dismiss') await api.markEventStatus(event.id, 'dismissed')
    } catch {}
    if (event.matched_job_id) {
      try {
        const remaining = await api.getHiringEventsForJob(event.matched_job_id)
        if (!remaining.some(e => e.status === 'pending')) {
          await api.clearJobUnreadEvent(event.matched_job_id)
        }
      } catch {}
      refresh()
      loadUnreadCount()
    }
  }, [moveJob, refresh, loadUnreadCount])

  const syncHiringEvents = useCallback(async (trigger = 'auto', force = false) => {
    const now = Date.now()
    // Frontend 2-min debounce — bypassed for manual trigger or force
    if (trigger !== 'manual' && !force && now - lastSyncRef.current < 2 * 60 * 1000) return
    lastSyncRef.current = now
    try {
      const result = await api.gmailSync(trigger === 'manual' || force)

      // Token expired / refresh failed — surface reconnect banner, don't throw
      if (result.needsReconnect) {
        console.warn('[gmail-sync] reconnect required')
        setGmailNeedsReconnect(true)
        setLastSyncInfo(prev => ({
          ...prev,
          trigger,
          status: 'reconnect_required',
          error: result.error ?? 'Session expired — reconnect Gmail',
        }))
        return
      }

      const syncTime = result.lastSyncAt ? new Date(result.lastSyncAt) : new Date()
      if (result.skipped) {
        console.log(`[gmail-sync] skipped — ${result.reason} (${result.minutesSinceSync}m since last sync)`)
        setLastSyncInfo(prev => ({
          ...prev,
          trigger,
          status: 'skipped',
          skipped: true,
          reason: result.reason ?? null,
          minutesSince: result.minutesSinceSync ?? null,
          time: prev?.time ?? syncTime,
          error: null,
        }))
        return
      }
      const newEvents = result.newEvents || []
      console.log(`[gmail-sync] ran — ${result.total} emails, ${newEvents.length} new events`)
      setGmailNeedsReconnect(false) // clear any previous reconnect warning on successful sync
      setLastSyncInfo({
        trigger,
        status: 'success',
        skipped: false,
        reason: null,
        minutesSince: null,
        time: syncTime,
        emailsScanned: result.total ?? 0,
        eventsCreated: newEvents.length,
        error: null,
      })
      if (newEvents.length > 0) {
        setHiringEvents(prev => [...newEvents, ...prev])
        loadUnreadCount()
        refresh()
        const highPriority = newEvents.filter(e => e.priority_score >= 70 && !e.popup_shown)
        if (highPriority.length === 1) {
          setPopupEvent(highPriority[0])
          api.markEventPopupShown(highPriority[0].id).catch(() => {})
        } else if (highPriority.length > 1) {
          setPopupGroupCount(highPriority.length)
          highPriority.forEach(e => api.markEventPopupShown(e.id).catch(() => {}))
        }
      }
    } catch (err) {
      console.error('[gmail-sync] error:', err.message)
      setLastSyncInfo(prev => ({
        ...prev,
        trigger,
        status: 'failed',
        error: err.message,
      }))
    }
  }, [refresh, loadUnreadCount])

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
        loadUnreadCount()
        syncHiringEvents('app_load')
      })
    } else if (session === null) {
      setLoading(false)
    }
  }, [session, refresh, loadResume, loadSettings]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync on tab reactivation (hidden > 2 min)
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        tabHiddenAtRef.current = Date.now()
      } else if (session) {
        const hiddenFor = Date.now() - tabHiddenAtRef.current
        if (hiddenFor > 2 * 60 * 1000) syncHiringEvents('tab_visible')
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [session, syncHiringEvents])

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
          {lastSyncInfo && (
            <button
              className="sync-status-btn"
              onClick={() => syncHiringEvents('manual', true)}
              title={lastSyncInfo.skipped
                ? `Skipped — synced ${lastSyncInfo.minutesSince}m ago. Click to force check.`
                : 'Click to check for updates'}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/>
              </svg>
              {lastSyncInfo.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </button>
          )}
          <button className="btn btn-ghost bell-btn" onClick={() => setShowNotifications(true)} title="Hiring activity">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            {unreadEventCount > 0 && (
              <span className="bell-badge">{unreadEventCount > 9 ? '9+' : unreadEventCount}</span>
            )}
          </button>
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
          gmailNeedsReconnect={gmailNeedsReconnect}
        />
      )}

      {showNotifications && (
        <Notifications
          onClose={() => setShowNotifications(false)}
          onSelectJob={(jobId) => { setShowNotifications(false); openDetail(jobId) }}
          onCountChange={setUnreadEventCount}
          onRefresh={refresh}
          syncInfo={lastSyncInfo}
          onCheckUpdates={() => syncHiringEvents('manual', true)}
        />
      )}

      {(popupEvent || popupGroupCount > 0) && (
        <HiringEventPopup
          event={popupEvent}
          groupCount={popupGroupCount}
          columns={columns}
          matchedJob={popupEvent?.matched_job_id ? jobs.find(j => j.id === popupEvent.matched_job_id) : null}
          onMove={() => handlePopupClose(popupEvent, 'move')}
          onKeepHere={() => handlePopupClose(popupEvent, 'keep')}
          onDismiss={() => handlePopupClose(popupEvent, 'dismiss')}
          onOpenNotifications={() => {
            setPopupEvent(null); setPopupGroupCount(0)
            setShowNotifications(true)
          }}
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
            hiringEvents={hiringEvents}
            onCheckUpdates={syncHiringEvents}
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
                onRefresh={async () => { await refresh(); loadUnreadCount() }}
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
