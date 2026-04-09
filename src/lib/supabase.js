import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = !!(supabaseUrl && supabaseAnonKey)

if (!isConfigured) {
  console.warn('Supabase env vars missing — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        detectSessionFromUrl: true,
        autoRefreshToken: true,
        persistSession: true,
      },
    })
  : null
