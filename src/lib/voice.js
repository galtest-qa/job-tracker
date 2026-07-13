// Voice answers — record with MediaRecorder, transcribe with Whisper.
// Dual-path like callOpenAI: personal key goes straight to OpenAI,
// otherwise the `transcribe` Edge Function uses the shared key.
import { supabase } from './supabase.js'
import { getOpenAIKey } from './openai.js'

export function voiceSupported() {
  return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder)
}

// Safari records audio/mp4; Chrome/Firefox audio/webm. Whisper accepts both.
export function pickMimeType() {
  if (!window.MediaRecorder) return ''
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return ''
}

export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks = []
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
  recorder.start()

  return {
    stop: () => new Promise((resolve) => {
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }))
      }
      recorder.stop()
    }),
    cancel: () => {
      recorder.onstop = null
      try { recorder.stop() } catch { /* already stopped */ }
      stream.getTracks().forEach(t => t.stop())
    },
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const extFor = (mime) => mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'

export async function transcribeAudio(blob) {
  const mime = blob.type || 'audio/webm'
  const personalKey = await getOpenAIKey()

  if (personalKey) {
    const form = new FormData()
    form.append('file', blob, `answer.${extFor(mime)}`)
    form.append('model', 'whisper-1')
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${personalKey}` },
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || `Transcription failed (${res.status})`)
    }
    const data = await res.json()
    return (data.text || '').trim()
  }

  // Shared key — via Edge Function
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  const audio = await blobToBase64(blob)
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ audio, mime }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Transcription failed (${res.status})`)
  }
  const { text } = await res.json()
  return (text || '').trim()
}
