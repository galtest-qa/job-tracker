import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { clearKeyCache, getAIMode } from '../lib/openai.js'
import { api } from '../api.js'

export default function Settings({ onClose, initialSection, hasExtension, onExtensionConfirm, gmailCallbackResult, gmailNeedsReconnect }) {
  const [openaiKey, setOpenaiKey] = useState('')
  const [aiMode, setAiMode] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  // Profile questions
  const PROFILE_QUESTIONS = [
    { key: 'current_role', label: 'What is your current or most recent role?', placeholder: 'e.g. Release Operations Manager at Upwind Security' },
    { key: 'years_experience', label: 'How many years of professional experience do you have?', placeholder: 'e.g. 3 years' },
    { key: 'key_skills', label: 'What are your top skills?', placeholder: 'e.g. Release management, QA, cross-functional collaboration, CI/CD' },
    { key: 'career_goals', label: 'What kind of roles are you targeting?', placeholder: 'e.g. Product Operations, Technical Program Management, Release Management' },
    { key: 'strengths', label: 'What makes you stand out?', placeholder: 'e.g. Built release ops from scratch, managed PoCs with enterprise customers' },
    { key: 'gaps', label: 'What areas are you looking to grow in?', placeholder: 'e.g. Data analysis, SQL, people management' },
    { key: 'preferences', label: 'Any preferences? (company size, industry, remote, etc.)', placeholder: 'e.g. Prefer startups, cloud/security industry, hybrid work' },
  ]
  const [profileContext, setProfileContext] = useState({})
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

  // Telegram
  const [tgEnabled, setTgEnabled] = useState(false)
  const [tgToken, setTgToken] = useState('')
  const [tgChatId, setTgChatId] = useState('')
  const [tgDetecting, setTgDetecting] = useState(false)
  const [tgTesting, setTgTesting] = useState(false)
  const [tgSaving, setTgSaving] = useState(false)
  const [tgStatus, setTgStatus] = useState('')

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('profiles').select('openai_key, telegram_bot_token, telegram_chat_id, telegram_enabled, profile_context').eq('id', user.id).single()
        if (data?.openai_key) setOpenaiKey(data.openai_key)
        if (data?.telegram_bot_token) setTgToken(data.telegram_bot_token)
        if (data?.telegram_chat_id) setTgChatId(data.telegram_chat_id)
        if (data?.telegram_enabled) setTgEnabled(data.telegram_enabled)
        if (data?.profile_context && typeof data.profile_context === 'object') setProfileContext(data.profile_context)
      }
      const mode = await getAIMode()
      setAiMode(mode)
      setLoading(false)
    })()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ openai_key: openaiKey }).eq('id', user.id)
    clearKeyCache()
    const mode = await getAIMode()
    setAiMode(mode)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleProfileSave = async () => {
    setProfileSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ profile_context: profileContext }).eq('id', user.id)
    setProfileSaving(false)
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2000)
  }

  const [connectionCode, setConnectionCode] = useState('')
  const extensionSectionRef = useRef(null)
  const gmailSectionRef = useRef(null)

  // Gmail state
  const [gmailStatus, setGmailStatus] = useState(null)   // null = loading
  const [gmailEmails, setGmailEmails] = useState(null)   // null = not fetched yet
  const [gmailFetching, setGmailFetching] = useState(false)
  const [gmailConnecting, setGmailConnecting] = useState(false)
  const [gmailError, setGmailError] = useState(null)

  // MCP state
  const [mcpKeyStatus, setMcpKeyStatus] = useState(null) // null = loading
  const [mcpNewKey, setMcpNewKey] = useState(null)       // full key shown once after generation
  const [mcpWorking, setMcpWorking] = useState(false)
  const [mcpError, setMcpError] = useState(null)

  useEffect(() => {
    if (initialSection === 'extension' && extensionSectionRef.current) {
      setTimeout(() => extensionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
      extensionSectionRef.current.querySelector('details')?.setAttribute('open', '')
    }
    if (initialSection === 'gmail' && gmailSectionRef.current) {
      setTimeout(() => gmailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
    }
  }, [initialSection])

  // Load Gmail + MCP status on mount
  useEffect(() => {
    api.gmailStatus().then(setGmailStatus).catch(() => setGmailStatus({ connected: false }))
    api.getMcpKeyStatus().then(setMcpKeyStatus).catch(() => setMcpKeyStatus({ hasKey: false, prefix: null }))
  }, [])

  const handleGmailConnect = async () => {
    setGmailConnecting(true)
    setGmailError(null)
    try {
      const url = await api.gmailAuthUrl()
      window.location.href = url  // redirect to Google consent screen
    } catch (err) {
      setGmailError('Could not start Gmail connection. Please try again.')
      setGmailConnecting(false)
    }
  }

  const handleGmailFetch = async () => {
    setGmailFetching(true)
    setGmailError(null)
    setGmailEmails(null)
    try {
      const emails = await api.gmailRecentEmails()
      setGmailEmails(emails)
      setGmailStatus(prev => ({ ...prev, lastSyncAt: new Date().toISOString() }))
    } catch (err) {
      setGmailError(err.message || 'Failed to fetch emails.')
    }
    setGmailFetching(false)
  }

  const handleGetCode = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const { data: { user } } = await supabase.auth.getUser()
    if (!session || !user) { alert('Not logged in'); return }

    const code = btoa(JSON.stringify({
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
      supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      email: user.email,
      userId: user.id,
    }))
    setConnectionCode(code)
    navigator.clipboard.writeText(code).then(() => {}).catch(() => {})
  }

  // ── Telegram handlers ──

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

  const handleTgDetectChat = async () => {
    if (!tgToken.trim()) { setTgStatus('Enter your bot token first'); return }
    setTgDetecting(true); setTgStatus('')
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/telegram-detect-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session.access_token}` },
        body: JSON.stringify({ bot_token: tgToken.trim() }),
      })
      const data = await res.json()
      if (data.chat_id) {
        setTgChatId(data.chat_id)
        setTgStatus('Chat ID detected!')
      } else {
        setTgStatus(data.error || 'Could not detect chat ID')
      }
    } catch (err) { setTgStatus(err.message) }
    setTgDetecting(false)
  }

  const handleTgTest = async () => {
    if (!tgToken.trim() || !tgChatId.trim()) { setTgStatus('Token and chat ID required'); return }
    setTgTesting(true); setTgStatus('')
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/telegram-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session.access_token}` },
        body: JSON.stringify({ bot_token: tgToken.trim(), chat_id: tgChatId.trim() }),
      })
      const data = await res.json()
      setTgStatus(data.ok ? 'Test message sent! Check Telegram.' : (data.error || 'Failed'))
    } catch (err) { setTgStatus(err.message) }
    setTgTesting(false)
  }

  const handleTgSave = async () => {
    setTgSaving(true)
    setTgStatus('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('profiles').update({
        telegram_bot_token: tgToken.trim(),
        telegram_chat_id: tgChatId.trim(),
        telegram_enabled: tgEnabled,
      }).eq('id', user.id)

      // Register the Telegram webhook so inline action buttons work.
      // Non-fatal: if this fails, notifications still send but buttons won't fire.
      if (tgEnabled && tgToken.trim() && tgChatId.trim()) {
        try {
          const session = (await supabase.auth.getSession()).data.session
          const res = await fetch(`${supabaseUrl}/functions/v1/telegram-setup-webhook`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.access_token}`,
            },
          })
          const data = await res.json()
          if (data.ok) {
            setTgStatus('Saved! Action buttons enabled ✅')
          } else {
            setTgStatus(`Saved, but webhook setup failed: ${data.error || 'unknown error'}`)
          }
        } catch {
          setTgStatus('Saved, but webhook setup failed — buttons may not work')
        }
      } else {
        setTgStatus('Saved!')
      }
    } catch (err) {
      setTgStatus(`Save failed: ${err.message}`)
    }
    setTgSaving(false)
    setTimeout(() => setTgStatus(''), 4000)
  }

  // Classify state
  const [classifying, setClassifying] = useState(false)
  const [classifyResult, setClassifyResult] = useState(null)
  const [classifyError, setClassifyError] = useState(null)

  const handleClassify = async () => {
    setClassifying(true)
    setClassifyError(null)
    setClassifyResult(null)
    try {
      const result = await api.gmailClassifyRecent()
      setClassifyResult(result)
    } catch (err) {
      setClassifyError(err.message || 'Classification failed.')
    }
    setClassifying(false)
  }

  const [reanalyzing, setReanalyzing] = useState(false)
  const [reanalyzeDone, setReanalyzeDone] = useState(null) // {success, failed}

  const handleReanalyzeAll = async () => {
    if (!confirm('This will re-analyze all jobs that have a description. It may take a few minutes and uses AI credits. Continue?')) return
    setReanalyzing(true)
    setReanalyzeDone(null)
    const jobs = await api.getJobs()
    const eligible = jobs.filter(j => j.description)
    let success = 0, failed = 0
    for (const job of eligible) {
      try { await api.analyzeJob(job.id); success++ }
      catch { failed++ }
    }
    setReanalyzing(false)
    setReanalyzeDone({ success, failed })
  }

  const handleRemoveKey = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ openai_key: '' }).eq('id', user.id)
    setOpenaiKey('')
    clearKeyCache()
    setAiMode('shared')
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Settings</h3>
          <button className="btn btn-ghost" onClick={onClose}>&times;</button>
        </div>

        {loading ? <p className="muted">Loading...</p> : (
          <>
            {/* Chrome Extension — top priority for new users */}
            <div className="settings-section" ref={extensionSectionRef}>
              <div className="settings-section-title-row">
                <h4 className="settings-section-title">Chrome Extension</h4>
                {hasExtension
                  ? <span className="settings-badge-ok">Installed</span>
                  : <span className="settings-badge-todo">Recommended</span>
                }
              </div>
              <p className="settings-guide-text">
                Browse LinkedIn and save jobs to your board with one click — title, company, and description included. No copy-pasting.
              </p>

              <details className="settings-details">
                <summary>How to install</summary>
                <div className="settings-guide">
                  <p><strong>Step 1: Download</strong></p>
                  <p>
                    <a href="https://github.com/galtest-qa/job-tracker/archive/refs/heads/main.zip" target="_blank" rel="noopener noreferrer">
                      Click here to download the ZIP
                    </a>
                    , then unzip it. You only need the <code>chrome-extension</code> folder inside.
                  </p>

                  <p><strong>Step 2: Install in Chrome</strong></p>
                  <ol>
                    <li>Open Chrome and go to <code>chrome://extensions</code></li>
                    <li>Turn on <strong>Developer mode</strong> (toggle in the top-right corner)</li>
                    <li>Click <strong>Load unpacked</strong></li>
                    <li>Select the <code>chrome-extension</code> folder you just unzipped</li>
                  </ol>

                  <p><strong>Step 3: Connect to your account</strong></p>
                  <ol>
                    <li>Click <strong>"Get Connection Code"</strong> below — it copies a code to your clipboard</li>
                    <li>Click the Job Tracker extension icon in Chrome's toolbar</li>
                    <li>Paste the code and click <strong>Connect</strong></li>
                  </ol>

                  <p><strong>Step 4: Start saving jobs</strong></p>
                  <p>Go to any LinkedIn job page — you'll see a blue <strong>"+ Save to Tracker"</strong> button. Click it and the job lands in your Backlog.</p>
                </div>
              </details>

              <div className="settings-btn-row" style={{ marginTop: '0.75rem' }}>
                <button className="btn btn-secondary btn-sm" onClick={handleGetCode}>
                  Get Connection Code
                </button>
                {connectionCode && <span className="settings-hint" style={{ marginTop: 0, fontWeight: 600, color: 'var(--success)' }}>Copied!</span>}
              </div>
              {connectionCode && (
                <textarea className="connection-code" readOnly value={connectionCode} onClick={e => { e.target.select(); navigator.clipboard.writeText(connectionCode) }} />
              )}
              <p className="settings-hint">Click the button, then paste the code in the extension popup to connect.</p>

              <label className="settings-extension-confirm">
                <input
                  type="checkbox"
                  checked={!!hasExtension}
                  onChange={e => onExtensionConfirm && onExtensionConfirm(e.target.checked)}
                />
                I have the extension installed and connected
              </label>
            </div>

            {/* AI Mode Status */}
            <div className="settings-section">
              <h4 className="settings-section-title">AI Features</h4>

              {aiMode === 'shared' ? (
                <>
                  <div className="settings-status settings-status-ok">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    AI features are active using a shared key. No setup needed.
                  </div>

                  <details className="settings-details">
                    <summary>Want to use your own OpenAI key?</summary>
                    <div className="settings-guide">
                      <p>Using your own key gives you:</p>
                      <ul>
                        <li>Higher rate limits</li>
                        <li>Your own billing and usage tracking</li>
                        <li>Privacy — requests go directly to OpenAI</li>
                      </ul>
                      <p><strong>How to get a key:</strong></p>
                      <ol>
                        <li>Go to <a href="https://platform.openai.com/signup" target="_blank" rel="noopener noreferrer">platform.openai.com</a> and create an account</li>
                        <li>Add a payment method in <a href="https://platform.openai.com/account/billing" target="_blank" rel="noopener noreferrer">Billing</a> (pay-as-you-go, typically ~$1-5/month for light use)</li>
                        <li>Go to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">API Keys</a> and click "Create new secret key"</li>
                        <li>Copy the key and paste it below</li>
                      </ol>
                      <div className="form-group">
                        <label>Your OpenAI API Key</label>
                        <input
                          type="password"
                          value={openaiKey}
                          onChange={e => setOpenaiKey(e.target.value)}
                          placeholder="sk-..."
                        />
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !openaiKey.trim()}>
                        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Key'}
                      </button>
                    </div>
                  </details>
                </>
              ) : (
                <>
                  <div className="settings-status settings-status-personal">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Using your personal OpenAI key
                  </div>
                  <div className="form-group">
                    <label>OpenAI API Key</label>
                    <input
                      type="password"
                      value={openaiKey}
                      onChange={e => setOpenaiKey(e.target.value)}
                      placeholder="sk-..."
                    />
                  </div>
                  <div className="settings-btn-row">
                    <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving...' : saved ? 'Saved!' : 'Update Key'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={handleRemoveKey} disabled={saving}>
                      Remove my key (use shared)
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Profile Questions */}
            <div className="settings-section">
              <details className="settings-details">
                <summary>About You</summary>
                <div className="settings-guide">
                  <p className="settings-guide-text">
                    Help the AI understand you better. These answers improve job analysis accuracy, resume tailoring, and interview prep.
                  </p>
                  <div className="profile-questions">
                    {PROFILE_QUESTIONS.map(q => (
                      <div key={q.key} className="form-group">
                        <label>{q.label}</label>
                        <input
                          type="text"
                          value={profileContext[q.key] || ''}
                          onChange={e => setProfileContext({ ...profileContext, [q.key]: e.target.value })}
                          placeholder={q.placeholder}
                        />
                      </div>
                    ))}
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={handleProfileSave} disabled={profileSaving}>
                    {profileSaving ? 'Saving...' : profileSaved ? 'Saved!' : 'Save Profile'}
                  </button>
                </div>
              </details>
            </div>

            {/* Telegram Notifications */}
            <div className="settings-section">
              <details className="settings-details">
                <summary>Telegram Notifications <span className="settings-optional">(Optional)</span></summary>
                <div className="settings-guide">
                  <p>Get reminder notifications on Telegram — never miss a follow-up, interview, or deadline.</p>

                  <div className="settings-toggle-row">
                    <label className="toggle-label">
                      <input type="checkbox" checked={tgEnabled} onChange={e => setTgEnabled(e.target.checked)} />
                      <span>Enable Telegram notifications</span>
                    </label>
                  </div>

                  {tgEnabled && (
                    <>
                      <p style={{ marginTop: '0.75rem' }}><strong>Step 1:</strong> Create a bot</p>
                      <ol>
                        <li>Open Telegram and search for <strong>@BotFather</strong></li>
                        <li>Send <code>/newbot</code> and follow the prompts</li>
                        <li>Copy the bot token and paste it below</li>
                      </ol>
                      <div className="form-group">
                        <label>Bot Token</label>
                        <input type="password" value={tgToken} onChange={e => setTgToken(e.target.value)} placeholder="123456:ABC-DEF..." />
                      </div>
                      <p><strong>Step 2:</strong> Get your Chat ID</p>
                      <p>Open Telegram, find your new bot, and send it <code>/start</code>. Then click the button below.</p>
                      <div className="settings-btn-row">
                        <button className="btn btn-secondary btn-sm" onClick={handleTgDetectChat} disabled={tgDetecting}>
                          {tgDetecting ? 'Detecting...' : 'Detect Chat ID'}
                        </button>
                        {tgChatId && <span className="settings-hint" style={{ marginTop: 0 }}>Chat ID: {tgChatId}</span>}
                      </div>
                      <div className="form-group" style={{ marginTop: '0.5rem' }}>
                        <label>Chat ID</label>
                        <input type="text" value={tgChatId} onChange={e => setTgChatId(e.target.value)} placeholder="Auto-detected or enter manually" />
                      </div>
                      <div className="settings-btn-row">
                        <button className="btn btn-primary btn-sm" onClick={handleTgSave} disabled={tgSaving}>
                          {tgSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={handleTgTest} disabled={tgTesting || !tgToken || !tgChatId}>
                          {tgTesting ? 'Sending...' : 'Send Test'}
                        </button>
                      </div>
                      {tgStatus && <p className="settings-hint" style={{ marginTop: '0.5rem', fontWeight: 600 }}>{tgStatus}</p>}
                    </>
                  )}
                </div>
              </details>
            </div>

            {/* Gmail Integration */}
            <div className="settings-section" ref={gmailSectionRef}>
              <div className="settings-section-title-row">
                <h4 className="settings-section-title">Email Integration</h4>
                {gmailStatus === null
                  ? null
                  : !gmailStatus.connected
                    ? <span className="settings-badge-todo">Not connected</span>
                    : (gmailNeedsReconnect || gmailStatus.needsReconnect || gmailStatus.syncHealth === 'reconnect_required')
                      ? <span className="settings-badge-error">Reconnect required</span>
                      : gmailStatus.syncHealth === 'degraded'
                        ? <span className="settings-badge-error">Sync issues</span>
                        : <span className="settings-badge-ok">Connected</span>
                }
              </div>
              <p className="settings-guide-text">
                Connect your Gmail inbox so the platform can detect job application replies, interview invites, and status updates automatically.
              </p>

              {/* OAuth callback result banner */}
              {gmailCallbackResult === 'connected' && (
                <div className="settings-status settings-status-ok" style={{ marginBottom: '0.75rem' }}>
                  Gmail connected successfully.
                </div>
              )}
              {gmailCallbackResult?.startsWith('error') && (
                <div className="settings-status settings-status-error" style={{ marginBottom: '0.75rem' }}>
                  Gmail connection failed. Please try again.
                </div>
              )}

              {gmailStatus === null ? (
                <p className="muted">Checking connection…</p>
              ) : gmailStatus.connected ? (
                <>
                  <div className="gmail-status-row">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    <span>{gmailStatus.email}</span>
                    {(gmailStatus.lastSuccessfulSyncAt || gmailStatus.lastSyncAt) && (
                      <span className="gmail-last-sync">
                        Last sync: {new Date(gmailStatus.lastSuccessfulSyncAt || gmailStatus.lastSyncAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  {(gmailNeedsReconnect || gmailStatus.needsReconnect || gmailStatus.syncHealth === 'reconnect_required') && (
                    <div className="settings-status settings-status-error" style={{ marginBottom: '0.5rem' }}>
                      Session expired — reconnect Gmail to continue receiving updates.
                    </div>
                  )}
                  {!gmailNeedsReconnect && !gmailStatus.needsReconnect && gmailStatus.syncHealth === 'degraded' && (
                    <div className="settings-status settings-status-error" style={{ marginBottom: '0.5rem', opacity: 0.8 }}>
                      Last sync failed — will retry automatically.
                    </div>
                  )}
                  <div className="settings-btn-row">
                    <button className="btn btn-primary btn-sm" onClick={handleGmailFetch} disabled={gmailFetching}>
                      {gmailFetching ? 'Fetching…' : 'Test: Fetch Recent Emails'}
                    </button>
                    <button
                      className={`btn btn-sm ${(gmailNeedsReconnect || gmailStatus.needsReconnect || gmailStatus.syncHealth === 'reconnect_required') ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={handleGmailConnect}
                      disabled={gmailConnecting}
                    >
                      {gmailConnecting ? 'Redirecting…' : 'Reconnect'}
                    </button>
                  </div>
                </>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={handleGmailConnect} disabled={gmailConnecting}>
                  {gmailConnecting ? 'Redirecting…' : 'Connect Gmail'}
                </button>
              )}

              {gmailError && (
                <p className="settings-hint" style={{ color: 'var(--danger)', marginTop: '0.5rem' }}>
                  {gmailError}
                </p>
              )}

              {gmailEmails !== null && (
                <div className="gmail-email-list">
                  {gmailEmails.length === 0 ? (
                    <p className="muted" style={{ padding: '0.75rem 0' }}>No emails found.</p>
                  ) : (() => {
                    const inbound = gmailEmails.filter(e => e.direction === 'inbound')
                    const outbound = gmailEmails.filter(e => e.direction === 'outbound')
                    return (
                      <>
                        <p className="settings-hint" style={{ marginBottom: '0.75rem' }}>
                          {gmailEmails.length} emails fetched — {inbound.length} incoming, {outbound.length} sent.
                        </p>
                        {[
                          { label: 'Incoming', emails: inbound },
                          { label: 'Sent', emails: outbound },
                        ].map(({ label, emails }) => emails.length > 0 && (
                          <div key={label} className="gmail-email-group">
                            <div className="gmail-email-group-label">{label}</div>
                            {emails.map(email => (
                              <div key={email.id} className="gmail-email-row">
                                <div className="gmail-email-meta">
                                  <span className="gmail-email-from">{email.from}</span>
                                  <div className="gmail-email-meta-right">
                                    <span className={`gmail-direction-badge gmail-direction-${email.direction}`}>
                                      {email.direction === 'inbound' ? '↓ In' : '↑ Out'}
                                    </span>
                                    <span className="gmail-email-date">
                                      {new Date(email.receivedAt).toLocaleDateString()}
                                    </span>
                                  </div>
                                </div>
                                <div className="gmail-email-subject">{email.subject || '(no subject)'}</div>
                                <div className="gmail-email-snippet">{email.snippet}</div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* MCP Integration */}
            <div className="settings-section">
              <div className="settings-section-title-row">
                <h4 className="settings-section-title">MCP Integration</h4>
                {mcpKeyStatus === null
                  ? null
                  : mcpKeyStatus.hasKey
                    ? <span className="settings-badge-ok">Active</span>
                    : <span className="settings-badge-todo">Not configured</span>
                }
              </div>
              <p className="settings-guide-text">
                Connect Job Maker to Claude Desktop or any MCP-compatible AI client. Your API key is hashed before storage — the full key is shown only once.
              </p>

              {mcpKeyStatus?.hasKey && !mcpNewKey && (
                <div className="gmail-status-row" style={{ marginBottom: '0.5rem' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <span className="muted">{mcpKeyStatus.prefix}…</span>
                </div>
              )}

              {mcpNewKey && (
                <div className="settings-status settings-status-ok" style={{ marginBottom: '0.75rem' }}>
                  <p style={{ marginBottom: '0.4rem', fontWeight: 600 }}>⚠ Copy your API key now — it won't be shown again.</p>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <code style={{ fontSize: '0.75rem', wordBreak: 'break-all', flex: 1 }}>{mcpNewKey}</code>
                    <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(mcpNewKey).catch(() => {}) }}>Copy</button>
                  </div>
                  <details style={{ marginTop: '0.75rem' }}>
                    <summary style={{ fontSize: '0.78rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>Claude Desktop config</summary>
                    <pre style={{ fontSize: '0.7rem', marginTop: '0.5rem', background: 'rgba(0,0,0,0.04)', padding: '0.6rem', borderRadius: '4px', overflow: 'auto' }}>{JSON.stringify({ mcpServers: { "job-maker": { command: "npx", args: ["-y", "mcp-remote", `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp`], env: { MCP_API_KEY: mcpNewKey } } } }, null, 2)}</pre>
                  </details>
                </div>
              )}

              {mcpError && (
                <p className="settings-hint" style={{ color: 'var(--danger)', marginTop: '0.5rem' }}>{mcpError}</p>
              )}

              <div className="settings-btn-row">
                {!mcpKeyStatus?.hasKey || mcpNewKey ? (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={mcpWorking}
                    onClick={async () => {
                      setMcpWorking(true); setMcpError(null); setMcpNewKey(null)
                      try {
                        const { key, prefix } = await api.generateMcpKey()
                        setMcpNewKey(key)
                        setMcpKeyStatus({ hasKey: true, prefix })
                      } catch (err) { setMcpError(err.message) }
                      setMcpWorking(false)
                    }}
                  >
                    {mcpWorking ? 'Generating…' : mcpKeyStatus?.hasKey ? 'Regenerate Key' : 'Generate API Key'}
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={mcpWorking}
                    onClick={async () => {
                      setMcpWorking(true); setMcpError(null)
                      try {
                        await api.revokeMcpKey()
                        setMcpKeyStatus({ hasKey: false, prefix: null })
                        setMcpNewKey(null)
                      } catch (err) { setMcpError(err.message) }
                      setMcpWorking(false)
                    }}
                  >
                    {mcpWorking ? 'Revoking…' : 'Revoke Key'}
                  </button>
                )}
                {mcpKeyStatus?.hasKey && !mcpNewKey && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={mcpWorking}
                    onClick={async () => {
                      setMcpWorking(true); setMcpError(null); setMcpNewKey(null)
                      try {
                        const { key, prefix } = await api.generateMcpKey()
                        setMcpNewKey(key)
                        setMcpKeyStatus({ hasKey: true, prefix })
                      } catch (err) { setMcpError(err.message) }
                      setMcpWorking(false)
                    }}
                  >
                    {mcpWorking ? 'Regenerating…' : 'Regenerate Key'}
                  </button>
                )}
              </div>
            </div>

            {/* Debug: Hiring Event Detection */}
            {gmailStatus?.connected && (
              <div className="settings-section">
                <details className="settings-details">
                  <summary>Debug: Hiring Event Detection</summary>
                  <div className="settings-guide">
                    <p className="settings-guide-text">
                      Classify your 50 most recent emails to detect hiring events — interview invites, rejections, offers, and more.
                    </p>
                    <div className="settings-btn-row">
                      <button className="btn btn-secondary btn-sm" onClick={handleClassify} disabled={classifying}>
                        {classifying ? 'Classifying…' : 'Run Classification'}
                      </button>
                    </div>
                    {classifyError && (
                      <p className="settings-hint" style={{ color: 'var(--danger)', marginTop: '0.5rem' }}>{classifyError}</p>
                    )}
                    {classifyResult && (() => {
                      const all = classifyResult.classifications || []
                      const jobRelated = all.filter(c => c.is_job_related)
                      const notRelated = all.filter(c => !c.is_job_related)
                      const renderRow = (c) => (
                        <div key={c.email_id} className={`classify-row classify-priority-${c.priority_score >= 70 ? 'high' : c.priority_score >= 40 ? 'med' : 'low'}`}>
                          <div className="classify-row-header">
                            <span className="classify-category">{c.category?.replace(/_/g, ' ')}</span>
                            {c.confidence_level && <span className={`classify-confidence classify-confidence-${c.confidence_level}`}>{c.confidence_level}</span>}
                            {c.pre_filtered && <span className="classify-confidence" style={{ background: '#f1f5f9', color: '#64748b' }}>pre-filtered</span>}
                            {c.overrideReason === 'cached' && <span className="classify-confidence" style={{ background: '#eff6ff', color: '#3b82f6' }}>cached</span>}
                            {c.direction && <span className="classify-confidence" style={{ background: '#faf5ff', color: '#7c3aed' }}>{c.direction}</span>}
                            {c.action_required && <span className="classify-action-badge">Action needed</span>}
                          </div>
                          <div className="classify-row-subject">{c.subject || '(no subject)'}</div>
                          <div className="classify-row-meta" style={{ color: 'var(--text-tertiary)' }}>{c.from_address}</div>
                          {c.detected_company && (
                            <div className="classify-row-meta">{c.detected_company}{c.detected_role ? ` — ${c.detected_role}` : ''}</div>
                          )}
                          {c.summary && <div className="classify-row-summary">{c.summary}</div>}
                          {/* Debug trace */}
                          <div className="classify-row-debug">
                            {c.preFilterReason && <span>pre-filter: <code>{c.preFilterReason}</code></span>}
                            {c.reachedAI === false && !c.preFilterReason && <span>did not reach AI</span>}
                            {c.reachedAI && (
                              <span>
                                AI raw: <code>{String(c.rawIsJobRelated)} / {c.rawCategory} / conf={c.rawConfidence}</code>
                                {c.overrideReason && c.overrideReason !== 'cached' && (
                                  <> → override: <code style={{ color: 'var(--danger)' }}>{c.overrideReason}</code></>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                      return (
                        <div className="classify-results">
                          <p className="classify-summary">
                            {all.length} emails processed — {jobRelated.length} job-related,{' '}
                            {notRelated.filter(c => c.pre_filtered).length} pre-filtered,{' '}
                            {notRelated.filter(c => !c.pre_filtered).length} classified as other
                            {classifyResult.cached > 0 ? `, ${classifyResult.cached} from cache` : ''}
                          </p>
                          {jobRelated.length > 0 && (
                            <>
                              <div className="classify-group-label">Job-Related ({jobRelated.length})</div>
                              <div className="classify-list">{jobRelated.map(renderRow)}</div>
                            </>
                          )}
                          {notRelated.length > 0 && (
                            <details style={{ marginTop: '0.75rem' }}>
                              <summary className="classify-group-label" style={{ cursor: 'pointer' }}>
                                Not Job-Related ({notRelated.length}) — click to expand
                              </summary>
                              <div className="classify-list" style={{ marginTop: '0.5rem', opacity: 0.7 }}>
                                {notRelated.map(renderRow)}
                              </div>
                            </details>
                          )}
                          {all.length === 0 && (
                            <p className="muted" style={{ padding: '0.5rem 0' }}>No emails in this window.</p>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </details>
              </div>
            )}

            {/* Re-analyze all jobs */}
            <div className="settings-section">
              <h4 className="settings-section-title">Bulk Actions</h4>
              <p className="settings-guide-text">
                Re-analyze all jobs to fix match scores and refresh AI insights. Only jobs with a description will be processed.
              </p>
              <div className="settings-btn-row">
                <button className="btn btn-secondary btn-sm" onClick={handleReanalyzeAll} disabled={reanalyzing}>
                  {reanalyzing ? 'Analyzing…' : 'Re-analyze all jobs'}
                </button>
                {reanalyzeDone && (
                  <span className="settings-hint" style={{ marginTop: 0, fontWeight: 600, color: reanalyzeDone.failed > 0 ? 'var(--warning)' : 'var(--success)' }}>
                    ✓ {reanalyzeDone.success} updated{reanalyzeDone.failed > 0 ? `, ${reanalyzeDone.failed} failed` : ''}
                  </span>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
