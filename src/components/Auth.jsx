import React, { useState } from 'react'
import { supabase, isConfigured } from '../lib/supabase.js'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  if (!isConfigured) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">Job Tracker</h1>
          <div className="error-msg">
            Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.
          </div>
        </div>
      </div>
    )
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Job Tracker</h1>
        <p className="auth-desc">Track, analyze, and manage your job search in one place.</p>

        {sent ? (
          <div className="auth-sent">
            <p>Check your email for a magic link to sign in.</p>
            <button className="btn btn-ghost" onClick={() => setSent(false)}>Try again</button>
          </div>
        ) : (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            {error && <div className="error-msg">{error}</div>}
            <button className="btn btn-primary auth-btn" type="submit" disabled={loading}>
              {loading ? 'Sending...' : 'Send Magic Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
