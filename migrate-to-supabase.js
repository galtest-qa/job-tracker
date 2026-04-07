/**
 * Migration script: SQLite → Supabase
 *
 * Usage:
 *   node migrate-to-supabase.js
 *
 * Requires .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 * Also requires a valid Supabase auth session (use the email from your login)
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { getDb, all } from './db.js'

// Read env
const envFile = readFileSync('.env.local', 'utf-8')
const env = {}
envFile.split('\n').forEach(line => {
  const [k, ...v] = line.split('=')
  if (k && v.length) env[k.trim()] = v.join('=').trim()
})

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

// You need to sign in first — provide your email
const EMAIL = process.argv[2]
if (!EMAIL) {
  console.log('Usage: node migrate-to-supabase.js your@email.com')
  console.log('Then check your email for the magic link, click it, and run again with --session flag')

  // Try to sign in
  console.log('\nOr set SUPABASE_SERVICE_KEY env var for direct access.')
  process.exit(1)
}

// Use service role key if available (bypasses RLS)
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
let adminClient = null
if (SERVICE_KEY) {
  adminClient = createClient(env.VITE_SUPABASE_URL, SERVICE_KEY)
}

const db = adminClient || supabase

async function migrate() {
  await getDb()

  // Get user by email from auth (need service key for this)
  let userId
  if (adminClient) {
    const { data } = await adminClient.auth.admin.listUsers()
    const user = data?.users?.find(u => u.email === EMAIL)
    if (!user) {
      console.error(`User ${EMAIL} not found. Make sure you've signed in at least once.`)
      process.exit(1)
    }
    userId = user.id
    console.log(`Found user: ${userId}`)
  } else {
    console.error('SUPABASE_SERVICE_KEY required for migration. Find it in Supabase Dashboard → Settings → API → service_role key')
    process.exit(1)
  }

  // 1. Clean up duplicate columns
  console.log('\n--- Cleaning duplicate columns ---')
  const { data: existingCols } = await db.from('columns').select('*').eq('user_id', userId).order('sort_order')
  const seen = new Set()
  for (const col of (existingCols || [])) {
    if (seen.has(col.name)) {
      await db.from('columns').delete().eq('id', col.id)
      console.log(`  Deleted duplicate: ${col.name}`)
    } else {
      seen.add(col.name)
    }
  }

  // 2. Ensure default columns exist
  console.log('\n--- Ensuring columns ---')
  const { data: cols } = await db.from('columns').select('*').eq('user_id', userId).order('sort_order')
  const colNames = new Set(cols?.map(c => c.name) || [])

  const defaults = [
    { name: 'Backlog', sort_order: 0, is_default: true },
    { name: 'Want to Send Resume', sort_order: 1, is_default: false },
    { name: 'Applied', sort_order: 2, is_default: false },
    { name: 'Interview', sort_order: 3, is_default: false },
    { name: 'Offer', sort_order: 4, is_default: false },
    { name: 'Rejected', sort_order: 5, is_default: false },
  ]

  if (colNames.size === 0) {
    await db.from('columns').insert(defaults.map(c => ({ ...c, user_id: userId })))
    console.log('  Created default columns')
  } else {
    console.log(`  ${colNames.size} columns exist: ${[...colNames].join(', ')}`)
  }

  // 3. Migrate jobs from SQLite
  console.log('\n--- Migrating jobs ---')
  const localJobs = all('SELECT * FROM jobs')
  console.log(`  Found ${localJobs.length} local jobs`)

  // Check which already exist (by company + role)
  const { data: remoteJobs } = await db.from('jobs').select('company, role').eq('user_id', userId)
  const remoteSet = new Set((remoteJobs || []).map(j => `${j.company}|||${j.role}`))

  let migrated = 0
  for (const job of localJobs) {
    const key = `${job.company}|||${job.role}`
    if (remoteSet.has(key)) {
      console.log(`  Skip (exists): ${job.company} - ${job.role}`)
      continue
    }

    const { error } = await db.from('jobs').insert({
      user_id: userId,
      company: job.company,
      role: job.role,
      link: job.link || '',
      description: job.description || '',
      summary: job.summary || '',
      source: job.source || 'LinkedIn',
      status: job.status || 'Backlog',
      tags: safeParseJSON(job.tags, []),
      match_score: job.match_score || null,
      notes: job.notes || '',
      interview_notes: job.interview_notes || '',
      company_overview: job.company_overview || '',
      company_industry: job.company_industry || '',
      company_size: job.company_size || '',
      requirements_met: safeParseJSON(job.requirements_met, []),
      requirements_partial: safeParseJSON(job.requirements_partial, []),
      requirements_unmet: safeParseJSON(job.requirements_unmet, []),
      positioning_tips: job.positioning_tips || '',
      sort_order: job.sort_order || 0,
      tailored_resume: job.tailored_resume || '',
      resume_improvements: safeParseJSON(job.resume_improvements, []),
      interview_prep_ai: safeParseJSON(job.interview_prep_ai, {}),
      contact_name: job.contact_name || '',
      contact_role: job.contact_role || '',
      contact_linkedin: job.contact_linkedin || '',
      contact_email: job.contact_email || '',
      logo_url: job.logo_url || '',
    })

    if (error) {
      console.log(`  Error: ${job.company} - ${error.message}`)
    } else {
      migrated++
      console.log(`  Migrated: ${job.company} - ${job.role}`)
    }
  }

  // 4. Migrate resume
  console.log('\n--- Migrating resume ---')
  const localResume = all('SELECT * FROM resume')
  if (localResume.length > 0 && localResume[0].raw_text) {
    const { data: existing } = await db.from('resumes').select('id').eq('user_id', userId).limit(1)
    if (existing && existing.length > 0) {
      console.log('  Resume already exists in Supabase, skipping')
    } else {
      await db.from('resumes').insert({
        user_id: userId,
        raw_text: localResume[0].raw_text,
        parsed: safeParseJSON(localResume[0].parsed, {}),
        filename: localResume[0].filename || '',
      })
      console.log('  Resume migrated')
    }
  } else {
    console.log('  No local resume found')
  }

  console.log(`\n✓ Done! Migrated ${migrated} jobs.`)
  console.log('Refresh your browser to see the data.')
}

function safeParseJSON(str, fallback) {
  if (typeof str === 'object' && str !== null) return str
  try { return JSON.parse(str) } catch { return fallback }
}

migrate().catch(console.error)
