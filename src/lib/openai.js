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

export async function callOpenAI(prompt, { temperature = 0.3 } = {}) {
  const key = await getOpenAIKey()
  if (!key) throw new Error('OpenAI API key not set. Go to Settings to add your key.')

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

  // Parse JSON response
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error('Could not parse AI response')
  }
}
