import { supabase } from './supabase.js'

let cachedKey = null

export async function getOpenAIKey() {
  if (cachedKey) return cachedKey
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('profiles').select('openai_key').eq('id', user.id).single()
  cachedKey = data?.openai_key || null
  return cachedKey
}

export function clearKeyCache() {
  cachedKey = null
}

// Returns 'personal' if user has their own key, 'shared' otherwise
export async function getAIMode() {
  const key = await getOpenAIKey()
  return key ? 'personal' : 'shared'
}

export async function callOpenAI(prompt, { temperature = 0.3, raw = false } = {}) {
  const personalKey = await getOpenAIKey()

  if (personalKey) {
    return callOpenAIDirect(prompt, personalKey, temperature, raw)
  } else {
    return callOpenAIProxy(prompt, temperature, raw)
  }
}

async function callOpenAIDirect(prompt, key, temperature, raw = false) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    if (res.status === 401) throw new Error('Invalid OpenAI API key. Check your key in Settings.')
    throw new Error(err.error?.message || `OpenAI error: ${res.status}`)
  }

  const data = await res.json()
  const text = data.choices[0].message.content.trim()

  if (raw) return text

  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error('Could not parse AI response')
  }
}

async function callOpenAIProxy(prompt, temperature, raw = false) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const res = await fetch(`${supabaseUrl}/functions/v1/openai-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ prompt, temperature, raw }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `AI proxy error: ${res.status}`)
  }

  const { result } = await res.json()
  return result
}
