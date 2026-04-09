import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { clearKeyCache, getAIMode } from '../lib/openai.js'

export default function Settings({ onClose }) {
  const [openaiKey, setOpenaiKey] = useState('')
  const [aiMode, setAiMode] = useState(null) // 'shared' | 'personal'
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('profiles').select('openai_key').eq('id', user.id).single()
        if (data?.openai_key) setOpenaiKey(data.openai_key)
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

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
