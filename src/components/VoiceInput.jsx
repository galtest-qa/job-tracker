import React, { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Mic, X } from 'lucide-react'
import { startRecording, transcribeAudio, voiceSupported } from '../lib/voice.js'

// Reusable voice dictation control.
// idle → recording (timer + animated bars, confirm/cancel) → transcribing → onTranscript(text)
// `compact` renders just the mic icon button (for small form fields).
export default function VoiceInput({ onTranscript, disabled, compact = false, label = 'Answer by voice' }) {
  const [state, setState] = useState('idle') // idle | recording | transcribing
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState(null)
  const recRef = useRef(null)
  const timerRef = useRef(null)

  const MAX_SECONDS = 180

  useEffect(() => () => { // unmount: stop everything
    clearInterval(timerRef.current)
    recRef.current?.cancel()
  }, [])

  useEffect(() => {
    if (state === 'recording' && seconds >= MAX_SECONDS) stopAndTranscribe()
  }, [seconds]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!voiceSupported()) return null

  const begin = async () => {
    setError(null)
    try {
      recRef.current = await startRecording()
      setSeconds(0)
      setState('recording')
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } catch (err) {
      setError(err.name === 'NotAllowedError'
        ? 'Microphone access blocked — allow it in your browser settings.'
        : 'Could not access the microphone.')
    }
  }

  const stopAndTranscribe = async () => {
    clearInterval(timerRef.current)
    const rec = recRef.current
    if (!rec) return
    recRef.current = null
    setState('transcribing')
    try {
      const blob = await rec.stop()
      if (blob.size < 1000) throw new Error('Recording was too short — try again.')
      const text = await transcribeAudio(blob)
      if (text) onTranscript?.(text)
      else setError("Couldn't hear anything — try again closer to the mic.")
      setState('idle')
    } catch (err) {
      setError(err.message)
      setState('idle')
    }
  }

  const cancel = () => {
    clearInterval(timerRef.current)
    recRef.current?.cancel()
    recRef.current = null
    setState('idle')
  }

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(1, '0')}:${String(s % 60).padStart(2, '0')}`

  if (state === 'recording') {
    return (
      <div className="vi-bar vi-bar--recording" role="status" aria-label="Recording">
        <span className="vi-rec-dot" aria-hidden="true" />
        <span className="vi-timer">{fmt(seconds)}</span>
        <span className="vi-waves" aria-hidden="true">
          {[...Array(12)].map((_, i) => (
            <span key={i} className="vi-wave" style={{ animationDelay: `${i * 0.09}s` }} />
          ))}
        </span>
        <button className="vi-btn vi-btn--cancel" onClick={cancel} aria-label="Cancel recording">
          <X size={15} aria-hidden="true" />
        </button>
        <button className="vi-btn vi-btn--done" onClick={stopAndTranscribe} aria-label="Use this recording">
          <Check size={15} aria-hidden="true" />
        </button>
      </div>
    )
  }

  if (state === 'transcribing') {
    return (
      <div className="vi-bar" role="status">
        <Loader2 size={15} className="cos-spin" aria-hidden="true" />
        <span className="vi-status-text">Writing it down…</span>
      </div>
    )
  }

  return (
    <div className={compact ? 'vi-inline' : 'vi-idle'}>
      <button
        type="button"
        className={compact ? 'vi-mic-compact' : 'vi-mic'}
        onClick={begin}
        disabled={disabled}
        title={label}
        aria-label={label}
      >
        <Mic size={compact ? 15 : 16} aria-hidden="true" />
        {!compact && <span>{label}</span>}
      </button>
      {error && <span className="vi-error">{error}</span>}
    </div>
  )
}
