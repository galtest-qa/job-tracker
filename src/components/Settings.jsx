import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  Bell, Calendar, ChevronLeft, ChevronRight, Cpu, FileText, LogOut,
  Mail, Plug, Puzzle, Send, User,
} from 'lucide-react'
import { getPushStatus, subscribeToPush, unsubscribeFromPush, sendTestPush } from '../lib/push.js'

// lucide dropped brand icons — keep the LinkedIn glyph inline
const LinkedinGlyph = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
    <rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>
  </svg>
)
import { supabase } from '../lib/supabase.js'
import { clearKeyCache, getAIMode } from '../lib/openai.js'
import { api } from '../api.js'

// Settings — a hub of clickable app tiles. Tapping a tile opens that
// app's own settings screen; back returns to the hub. One screen,
// one purpose.
export default function Settings({
  onClose,
  initialSection,
  hasExtension,
  onExtensionConfirm,
  gmailCallbackResult,
  gmailNeedsReconnect,
  resumeInfo,
  onOpenResume,
  onLogout,
}) {
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
  const [tgLastCheck, setTgLastCheck] = useState(null) // ISO string or null

  // Hub ↔ detail navigation
  const [section, setSection] = useState(initialSection || (gmailCallbackResult ? 'gmail' : null))
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (initialSection) setSection(initialSection)
  }, [initialSection])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('profiles').select('openai_key, telegram_bot_token, telegram_chat_id, telegram_enabled, profile_context, last_telegram_check_at').eq('id', user.id).single()
        if (data?.openai_key) setOpenaiKey(data.openai_key)
        if (data?.telegram_bot_token) setTgToken(data.telegram_bot_token)
        if (data?.telegram_chat_id) setTgChatId(data.telegram_chat_id)
        if (data?.telegram_enabled) setTgEnabled(data.telegram_enabled)
        if (data?.last_telegram_check_at) setTgLastCheck(data.last_telegram_check_at)
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

  // Push notifications state
  const [pushStatus, setPushStatus] = useState(null) // null = loading
  const [pushWorking, setPushWorking] = useState(false)
  const [pushMsg, setPushMsg] = useState('')

  useEffect(() => {
    getPushStatus().then(setPushStatus).catch(() => setPushStatus('unsupported'))
  }, [])

  const handlePushToggle = async () => {
    setPushWorking(true)
    setPushMsg('')
    try {
      if (pushStatus === 'subscribed') {
        await unsubscribeFromPush()
        setPushStatus('off')
        setPushMsg('Notifications turned off on this device.')
      } else {
        await subscribeToPush()
        setPushStatus('subscribed')
        setPushMsg('Notifications enabled 🎉')
      }
    } catch (err) {
      if (err.message === 'permission-denied') {
        setPushStatus('denied')
        setPushMsg('Notifications are blocked — allow them in your browser settings, then try again.')
      } else if (err.message === 'permission-dismissed') {
        setPushMsg('Permission prompt dismissed — tap Enable again when ready.')
      } else {
        setPushMsg(`Could not enable notifications: ${err.message}`)
      }
    }
    setPushWorking(false)
  }

  const handlePushTest = async () => {
    setPushWorking(true)
    setPushMsg('')
    try {
      const { sent } = await sendTestPush()
      setPushMsg(sent > 0 ? 'Test sent — check your notifications.' : 'No devices registered — enable notifications first.')
    } catch (err) {
      setPushMsg(`Test failed: ${err.message}`)
    }
    setPushWorking(false)
  }

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

  // Classify state (debug tool inside the Gmail screen)
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

  const handleRemoveKey = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('profiles').update({ openai_key: '' }).eq('id', user.id)
    setOpenaiKey('')
    clearKeyCache()
    setAiMode('shared')
    setSaving(false)
  }

  // ── Tile status derivation ──

  const gmailUnhealthy = gmailNeedsReconnect || gmailStatus?.needsReconnect || gmailStatus?.syncHealth === 'reconnect_required'
  const gmailTile = gmailStatus === null
    ? { label: 'Checking…', tone: 'off' }
    : !gmailStatus.connected
      ? { label: 'Not connected', tone: 'off' }
      : gmailUnhealthy
        ? { label: 'Reconnect required', tone: 'error' }
        : gmailStatus.syncHealth === 'degraded'
          ? { label: 'Sync issues', tone: 'warn' }
          : { label: 'Active', tone: 'ok' }

  const tgConnected = tgEnabled && !!tgChatId
  const tgStale = tgConnected && tgLastCheck && Math.round((Date.now() - new Date(tgLastCheck).getTime()) / 60000) > 240
  const telegramTile = !tgConnected
    ? { label: 'Not connected', tone: 'off' }
    : !tgLastCheck || tgStale
      ? { label: 'Needs attention', tone: 'warn' }
      : { label: 'Active', tone: 'ok' }

  const mcpTile = mcpKeyStatus === null
    ? { label: 'Checking…', tone: 'off' }
    : mcpKeyStatus.hasKey
      ? { label: 'Active', tone: 'ok' }
      : { label: 'Not set up', tone: 'off' }

  const extensionTile = hasExtension
    ? { label: 'Installed', tone: 'ok' }
    : { label: 'Recommended', tone: 'warn' }

  const answeredCount = PROFILE_QUESTIONS.filter(q => (profileContext[q.key] || '').trim()).length
  const aboutTile = answeredCount === 0
    ? { label: 'Tell us about you', tone: 'off' }
    : { label: `${answeredCount} of ${PROFILE_QUESTIONS.length} answered`, tone: answeredCount === PROFILE_QUESTIONS.length ? 'ok' : 'warn' }

  const resumeTile = resumeInfo?.raw_text
    ? { label: resumeInfo.filename || 'Uploaded', tone: 'ok' }
    : { label: 'Not uploaded', tone: 'warn' }

  const aiTile = aiMode === null
    ? { label: 'Checking…', tone: 'off' }
    : aiMode === 'shared'
      ? { label: 'Active', tone: 'ok' }
      : { label: 'Personal key', tone: 'ok' }

  const notifyTile = pushStatus === null
    ? { label: 'Checking…', tone: 'off' }
    : pushStatus === 'subscribed'
      ? { label: 'On', tone: 'ok' }
      : pushStatus === 'denied'
        ? { label: 'Blocked', tone: 'error' }
        : pushStatus === 'needs-install'
          ? { label: 'Install app first', tone: 'warn' }
          : pushStatus === 'unsupported'
            ? { label: 'Not supported here', tone: 'off' }
            : { label: 'Off', tone: 'off' }

  const TILES = {
    gmail: { name: 'Gmail', icon: Mail, iconClass: 'integration-icon--gmail', status: gmailTile },
    telegram: { name: 'Telegram', icon: Send, iconClass: 'integration-icon--telegram', status: telegramTile },
    notifications: { name: 'Notifications', icon: Bell, iconClass: 'set-icon--notify', status: notifyTile },
    mcp: { name: 'Claude & AI clients', icon: Plug, iconClass: 'set-icon--mcp', status: mcpTile },
    extension: { name: 'Chrome Extension', icon: Puzzle, iconClass: 'set-icon--extension', status: extensionTile },
    about: { name: 'About You', icon: User, iconClass: 'set-icon--about', status: aboutTile },
    resume: { name: 'Resume', icon: FileText, iconClass: 'set-icon--resume', status: resumeTile },
    ai: { name: 'AI Features', icon: Cpu, iconClass: 'set-icon--ai', status: aiTile },
  }

  const sectionTitle = {
    gmail: 'Gmail', telegram: 'Telegram', notifications: 'Notifications', mcp: 'Claude & AI clients',
    extension: 'Chrome Extension', about: 'About You', resume: 'Resume', ai: 'AI Features',
  }

  const slide = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: 24 }, transition: { duration: 0.18, ease: 'easeOut' } }
  const slideBack = reduceMotion
    ? slide
    : { initial: { opacity: 0, x: -24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -24 }, transition: { duration: 0.18, ease: 'easeOut' } }

  const Tile = ({ id }) => {
    const t = TILES[id]
    const Icon = t.icon
    return (
      <button className="set-tile" onClick={() => setSection(id)}>
        <span className={`integration-icon ${t.iconClass}`}><Icon size={18} strokeWidth={1.8} aria-hidden="true" /></span>
        <span className="set-tile-body">
          <span className="set-tile-name">{t.name}</span>
          <span className={`set-tile-status status-${t.status.tone}`}>{t.status.label}</span>
        </span>
        <ChevronRight size={16} className="set-tile-chevron" aria-hidden="true" />
      </button>
    )
  }

  // ── Detail screens ──

  const renderGmail = () => (
    <>
      <p className="settings-guide-text">
        Connect your Gmail inbox so Job Maker can detect application replies, interview invites, and status updates automatically.
      </p>

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
            <Mail size={14} aria-hidden="true" />
            <span>{gmailStatus.email}</span>
            {(gmailStatus.lastSuccessfulSyncAt || gmailStatus.lastSyncAt) && (
              <span className="gmail-last-sync">
                Last sync: {new Date(gmailStatus.lastSuccessfulSyncAt || gmailStatus.lastSyncAt).toLocaleString()}
              </span>
            )}
          </div>
          {gmailUnhealthy && (
            <div className="settings-status settings-status-error" style={{ marginBottom: '0.5rem' }}>
              Session expired — reconnect Gmail to continue receiving updates.
            </div>
          )}
          {!gmailNeedsReconnect && !gmailStatus.needsReconnect && gmailStatus.syncHealth === 'degraded' && (
            <div className="settings-status settings-status-error" style={{ marginBottom: '0.5rem' }}>
              Last sync failed — will retry automatically. If this persists, reconnect Gmail.
            </div>
          )}
          {gmailStatus.lastSyncError && gmailStatus.syncHealth !== 'healthy' && (
            <div className="settings-status settings-status-error" style={{ marginBottom: '0.5rem', fontSize: '0.78rem' }}>
              {gmailStatus.lastSyncError}
            </div>
          )}
          <div className="settings-btn-row">
            {/* Reconnect is primary CTA whenever health is not healthy */}
            <button
              className={`btn btn-sm ${gmailUnhealthy || gmailStatus.syncHealth !== 'healthy' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={handleGmailConnect}
              disabled={gmailConnecting}
            >
              {gmailConnecting ? 'Redirecting…' : 'Reconnect'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleGmailFetch} disabled={gmailFetching}>
              {gmailFetching ? 'Fetching…' : 'Test: fetch recent emails'}
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

      {gmailStatus?.connected && (
        <details className="settings-details" style={{ marginTop: '1rem' }}>
          <summary>Debug: hiring event detection</summary>
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
      )}
    </>
  )

  const renderTelegram = () => (
    <>
      <p className="settings-guide-text">Get reminder notifications on Telegram — never miss a follow-up, interview, or deadline.</p>

      <div className="settings-toggle-row">
        <label className="toggle-label">
          <input type="checkbox" checked={tgEnabled} onChange={e => setTgEnabled(e.target.checked)} />
          <span>Enable Telegram notifications</span>
        </label>
      </div>

      {tgEnabled && (
        <div className="settings-guide" style={{ marginTop: '0.5rem' }}>
          <p><strong>Step 1:</strong> Create a bot</p>
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
        </div>
      )}

      {/* Cron health indicator */}
      {tgEnabled && tgChatId && (() => {
        if (!tgLastCheck) return (
          <div className="settings-status settings-status-error" style={{ marginTop: '0.75rem' }}>
            ⚠ Telegram cron has not run yet. Set up a schedule for <code>telegram-check</code> in{' '}
            <a href="https://supabase.com/dashboard/project/uytuyjodqvlrnsenitnh/functions/telegram-check" target="_blank" rel="noreferrer">Supabase Dashboard → Functions → telegram-check → Schedules</a>.
            Recommended: <code>*/30 * * * *</code>
          </div>
        )
        const minAgo = Math.round((Date.now() - new Date(tgLastCheck).getTime()) / 60000)
        const isStale = minAgo > 240 // 4h threshold
        return (
          <div className={`settings-status ${isStale ? 'settings-status-error' : 'settings-status-ok'}`} style={{ marginTop: '0.75rem' }}>
            {isStale
              ? `⚠ Cron may be down — last check was ${minAgo >= 60 ? `${Math.round(minAgo / 60)}h` : `${minAgo}m`} ago`
              : `✓ Cron healthy — last check ${minAgo < 2 ? 'just now' : `${minAgo}m ago`}`}
          </div>
        )
      })()}
    </>
  )

  const renderMcp = () => (
    <>
      <p className="settings-guide-text">
        Connect Job Maker to Claude Desktop or any MCP-compatible AI client. Your API key is hashed before storage — the full key is shown only once.
      </p>

      {mcpKeyStatus?.hasKey && !mcpNewKey && (
        <div className="gmail-status-row" style={{ marginBottom: '0.5rem' }}>
          <Plug size={14} aria-hidden="true" />
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
    </>
  )

  const renderExtension = () => (
    <>
      <p className="settings-guide-text">
        Browse LinkedIn and save jobs to your board with one click — title, company, and description included. No copy-pasting.
      </p>

      <details className="settings-details" {...(!hasExtension ? { open: true } : {})}>
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
    </>
  )

  const renderAbout = () => (
    <>
      <p className="settings-guide-text">
        Help Job Maker understand you better. These answers improve job analysis accuracy, resume tailoring, and interview prep.
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
    </>
  )

  const renderResume = () => (
    <>
      <p className="settings-guide-text">
        Your resume powers match scores, tailored suggestions, and interview prep for every job you add.
      </p>
      {resumeInfo?.raw_text ? (
        <div className="settings-status settings-status-ok" style={{ marginBottom: '0.75rem' }}>
          <FileText size={16} aria-hidden="true" />
          {resumeInfo.filename || 'Resume uploaded'}
        </div>
      ) : (
        <div className="settings-status settings-status-error" style={{ marginBottom: '0.75rem' }}>
          No resume yet — upload one so Job Maker can start matching you to jobs.
        </div>
      )}
      <button className="btn btn-primary btn-sm" onClick={() => onOpenResume && onOpenResume()}>
        {resumeInfo?.raw_text ? 'Replace resume' : 'Upload resume'}
      </button>
    </>
  )

  const renderAi = () => (
    aiMode === 'shared' ? (
      <>
        <div className="settings-status settings-status-ok">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          Smart features are active. No setup needed.
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
    )
  )

  const renderNotifications = () => (
    <>
      <p className="settings-guide-text">
        Get notified on this device the moment something happens — a recruiter replies, an interview invite lands, or a follow-up is due.
      </p>

      {pushStatus === 'needs-install' && (
        <div className="settings-status settings-status-error">
          On iPhone, notifications require the installed app: open this site in Safari, tap Share → <strong>Add to Home Screen</strong>, then enable notifications from inside the installed app.
        </div>
      )}
      {pushStatus === 'unsupported' && (
        <div className="settings-status settings-status-error">
          This browser doesn't support push notifications. Try Chrome, or install the app on your phone.
        </div>
      )}
      {pushStatus === 'denied' && (
        <div className="settings-status settings-status-error">
          Notifications are blocked for Job Maker. Allow them in your browser/system settings, then come back here.
        </div>
      )}

      {(pushStatus === 'off' || pushStatus === 'subscribed') && (
        <div className="settings-btn-row">
          <button className={`btn btn-sm ${pushStatus === 'subscribed' ? 'btn-ghost' : 'btn-primary'}`} onClick={handlePushToggle} disabled={pushWorking}>
            {pushWorking ? 'Working…' : pushStatus === 'subscribed' ? 'Turn off on this device' : 'Enable notifications'}
          </button>
          {pushStatus === 'subscribed' && (
            <button className="btn btn-secondary btn-sm" onClick={handlePushTest} disabled={pushWorking}>
              Send test notification
            </button>
          )}
        </div>
      )}

      {pushMsg && <p className="settings-hint" style={{ marginTop: '0.5rem', fontWeight: 600 }}>{pushMsg}</p>}

      <p className="settings-hint" style={{ marginTop: '0.75rem' }}>
        Each device is enabled separately — turn this on from your phone to get notifications there.
      </p>
    </>
  )

  const DETAILS = {
    gmail: renderGmail,
    telegram: renderTelegram,
    notifications: renderNotifications,
    mcp: renderMcp,
    extension: renderExtension,
    about: renderAbout,
    resume: renderResume,
    ai: renderAi,
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Settings</h3>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close settings">&times;</button>
        </div>

        {loading ? (
          <div className="set-hub" aria-hidden="true">
            <div className="cos-skel cos-skel-label" />
            <div className="set-grid">
              {[...Array(4)].map((_, i) => <div key={i} className="cos-skel set-tile-skel" />)}
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {section && DETAILS[section] ? (
              <motion.div key={section} {...slide}>
                <div className="set-detail-head">
                  <button className="set-back" onClick={() => setSection(null)} aria-label="Back to settings">
                    <ChevronLeft size={18} aria-hidden="true" />
                  </button>
                  <h4 className="set-detail-title">{sectionTitle[section]}</h4>
                  {TILES[section] && (
                    <span className={`set-tile-status status-${TILES[section].status.tone}`}>{TILES[section].status.label}</span>
                  )}
                </div>
                <div className="set-detail-body">
                  {DETAILS[section]()}
                </div>
              </motion.div>
            ) : (
              <motion.div key="hub" {...slideBack} className="set-hub">
                <h4 className="set-group-title">Connected apps</h4>
                <div className="set-grid">
                  <Tile id="gmail" />
                  <Tile id="telegram" />
                  <Tile id="notifications" />
                  <Tile id="mcp" />
                  <Tile id="extension" />
                </div>

                <h4 className="set-group-title">Your profile</h4>
                <div className="set-grid">
                  <Tile id="about" />
                  <Tile id="resume" />
                  <Tile id="ai" />
                </div>

                <h4 className="set-group-title">Coming soon</h4>
                <div className="set-grid">
                  <div className="set-tile set-tile--soon">
                    <span className="integration-icon integration-icon--linkedin"><LinkedinGlyph size={18} /></span>
                    <span className="set-tile-body">
                      <span className="set-tile-name">LinkedIn</span>
                      <span className="set-tile-status status-off">Save recruiters &amp; contacts</span>
                    </span>
                  </div>
                  <div className="set-tile set-tile--soon">
                    <span className="integration-icon integration-icon--gcal"><Calendar size={18} strokeWidth={1.8} aria-hidden="true" /></span>
                    <span className="set-tile-body">
                      <span className="set-tile-name">Google Calendar</span>
                      <span className="set-tile-status status-off">Auto-add interviews</span>
                    </span>
                  </div>
                </div>

                {onLogout && (
                  <button className="set-signout" onClick={onLogout}>
                    <LogOut size={15} aria-hidden="true" />
                    Sign out
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
