import { supabase } from './lib/supabase.js'
import { callOpenAI } from './lib/openai.js'
import { getCandidateContext } from './lib/candidateContext.js'

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user.id
}

function throwIfError({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

// ── Seed default columns for new users ──

let _columnsInitialized = false

async function ensureDefaultColumns(userId) {
  if (_columnsInitialized) return
  _columnsInitialized = true

  const { data } = await supabase.from('columns').select('id').eq('user_id', userId).limit(1)
  if (data && data.length > 0) return

  const defaults = [
    { name: 'Backlog', sort_order: 0, is_default: true },
    { name: 'Want to Send Resume', sort_order: 1, is_default: false },
    { name: 'Applied', sort_order: 2, is_default: false },
    { name: 'Interview', sort_order: 3, is_default: false },
    { name: 'Offer', sort_order: 4, is_default: false },
    { name: 'Rejected', sort_order: 5, is_default: false },
  ]
  await supabase.from('columns').insert(defaults.map(c => ({ ...c, user_id: userId })))
}

// Called once after login
export async function initUserData() {
  const userId = await getUserId()
  await ensureDefaultColumns(userId)
}

// ── API (same interface as before) ──

export const api = {
  // Jobs
  getJobs: async () => {
    const userId = await getUserId()
    return throwIfError(
      await supabase.from('jobs').select('*').eq('user_id', userId).order('sort_order').order('created_at', { ascending: false })
    )
  },

  getJob: async (id) => {
    const data = throwIfError(await supabase.from('jobs').select('*').eq('id', id).single())
    return data
  },

  createJob: async (jobData) => {
    const userId = await getUserId()
    const row = {
      user_id: userId,
      company: jobData.company,
      role: jobData.role,
      link: jobData.link || '',
      description: jobData.description || '',
      source: jobData.source || 'LinkedIn',
      status: jobData.status || 'Backlog',
      tags: jobData.tags || [],
      notes: jobData.notes || '',
      interview_notes: jobData.interview_notes || '',
      company_overview: jobData.company_overview || '',
      company_industry: jobData.company_industry || '',
      company_size: jobData.company_size || '',
      contact_name: jobData.contact_name || '',
      contact_role: jobData.contact_role || '',
      contact_linkedin: jobData.contact_linkedin || '',
      contact_email: jobData.contact_email || '',
    }
    return throwIfError(await supabase.from('jobs').insert(row).select().single())
  },

  updateJob: async (id, updates) => {
    return throwIfError(await supabase.from('jobs').update(updates).eq('id', id).select().single())
  },

  deleteJob: async (id) => {
    return throwIfError(await supabase.from('jobs').delete().eq('id', id))
  },

  analyzeJob: async (id) => {
    const job = await api.getJob(id)
    const candidateContext = await getCandidateContext()

    const result = await callOpenAI(`You are an expert career advisor analyzing a job posting against a specific candidate. Be honest, specific, and actionable.

INSTRUCTIONS:
- Compare EVERY requirement in the job description against the candidate's actual experience
- For each requirement, cite specific evidence from the resume or profile — don't be vague
- Score the match honestly: 90+ means near-perfect fit, 70-89 is strong, 50-69 is partial, below 50 is a stretch
- Positioning tips should reference the candidate's ACTUAL experience and suggest how to frame it
- If the candidate lacks something, say so clearly and suggest how to address it

JOB POSTING:
Company: ${job.company}
Role: ${job.role}
Description:
${job.description}

${candidateContext}

Respond in EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):
{
  "summary": "2-3 sentence summary of what this role involves and what the hiring company is looking for",
  "company_overview": "1-2 sentence company description if inferable from the posting",
  "company_industry": "industry category",
  "requirements_met": ["Requirement X — candidate has Y experience at Z company that directly maps to this"],
  "requirements_partial": ["Requirement X — candidate has related experience in Y but lacks Z specifically"],
  "requirements_unmet": ["Requirement X — not found in candidate's background. Consider: suggestion to address this gap"],
  "match_score": "<integer 0-100 — be precise and honest based on actual evidence>",
  "positioning_tips": "2-3 specific, actionable suggestions referencing the candidate's real experience. Example: 'Frame your PoC management at Upwind as program management experience since it involved cross-functional coordination'",
  "tags": ["relevant", "category", "tags"]
}`)

    await api.updateJob(id, {
      summary: result.summary || '',
      company_overview: result.company_overview || '',
      company_industry: result.company_industry || '',
      requirements_met: result.requirements_met || [],
      requirements_partial: result.requirements_partial || [],
      requirements_unmet: result.requirements_unmet || [],
      match_score: result.match_score || null,
      positioning_tips: result.positioning_tips || '',
      tags: result.tags || [],
    })
    return await api.getJob(id)
  },

  reorderJobs: async (orderedIds) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await supabase.from('jobs').update({ sort_order: i }).eq('id', orderedIds[i])
    }
  },

  getStats: async () => {
    const jobs = await api.getJobs()
    const total = jobs.length
    const byStatus = Object.entries(
      jobs.reduce((acc, j) => { acc[j.status] = (acc[j.status] || 0) + 1; return acc }, {})
    ).map(([status, count]) => ({ status, count }))
    const scored = jobs.filter(j => j.match_score != null)
    const avgScore = scored.length > 0 ? Math.round(scored.reduce((s, j) => s + j.match_score, 0) / scored.length) : null
    return { total, byStatus, avgScore }
  },

  // Columns
  getColumns: async () => {
    const userId = await getUserId()
    return throwIfError(
      await supabase.from('columns').select('*').eq('user_id', userId).order('sort_order')
    )
  },

  createColumn: async (name) => {
    const userId = await getUserId()
    const existing = await api.getColumns()
    const maxOrder = existing.reduce((m, c) => Math.max(m, c.sort_order || 0), 0)
    return throwIfError(
      await supabase.from('columns').insert({ user_id: userId, name, sort_order: maxOrder + 1 }).select().single()
    )
  },

  updateColumn: async (id, name) => {
    // Get old name to update jobs
    const old = throwIfError(await supabase.from('columns').select('name, user_id').eq('id', id).single())
    const userId = old.user_id
    // Rename jobs
    await supabase.from('jobs').update({ status: name }).eq('user_id', userId).eq('status', old.name)
    return throwIfError(await supabase.from('columns').update({ name }).eq('id', id).select().single())
  },

  deleteColumn: async (id) => {
    const col = throwIfError(await supabase.from('columns').select('*').eq('id', id).single())
    if (col.is_default) throw new Error('Cannot delete the default column')
    // Move jobs to the default column
    const userId = col.user_id
    const backlog = throwIfError(
      await supabase.from('columns').select('name').eq('user_id', userId).eq('is_default', true).single()
    )
    await supabase.from('jobs').update({ status: backlog.name }).eq('user_id', userId).eq('status', col.name)
    return throwIfError(await supabase.from('columns').delete().eq('id', id))
  },

  reorderColumns: async (orderedIds) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await supabase.from('columns').update({ sort_order: i }).eq('id', orderedIds[i])
    }
  },

  // Reminders
  getAllReminders: async () => {
    const userId = await getUserId()
    const reminders = throwIfError(
      await supabase.from('reminders').select('*, jobs(company, role)').eq('user_id', userId).order('due_at')
    )
    return reminders.map(r => ({
      ...r,
      company: r.jobs?.company,
      role: r.jobs?.role,
      jobs: undefined,
    }))
  },

  getReminders: async (jobId) => {
    return throwIfError(
      await supabase.from('reminders').select('*').eq('job_id', jobId).order('due_at')
    )
  },

  createReminder: async (jobId, data) => {
    const userId = await getUserId()
    return throwIfError(
      await supabase.from('reminders').insert({
        user_id: userId,
        job_id: jobId,
        type: data.type || 'custom',
        title: data.title,
        due_at: data.due_at,
        note: data.note || '',
      }).select().single()
    )
  },

  updateReminder: async (id, data) => {
    return throwIfError(await supabase.from('reminders').update(data).eq('id', id).select().single())
  },

  deleteReminder: async (id) => {
    return throwIfError(await supabase.from('reminders').delete().eq('id', id))
  },

  getReminderSuggestions: async (jobId) => {
    const job = await api.getJob(jobId)
    const status = (job.status || '').toLowerCase()
    const now = new Date()
    const suggestions = []

    if (status.includes('send')) {
      suggestions.push({ type: 'send_resume', title: 'Send resume', due_at: now.toISOString() })
    }
    if (status.includes('applied')) {
      suggestions.push({ type: 'follow_up_recruiter', title: 'Follow up recruiter', due_at: new Date(now.getTime() + 3 * 86400000).toISOString() })
    }
    if (status.includes('interview')) {
      suggestions.push({ type: 'prepare_interview', title: 'Prepare for interview', due_at: new Date(now.getTime() + 86400000).toISOString() })
      suggestions.push({ type: 'check_feedback', title: 'Check feedback', due_at: new Date(now.getTime() + 3 * 86400000).toISOString() })
    }
    if (status.includes('offer')) {
      suggestions.push({ type: 'review_offer', title: 'Review offer', due_at: new Date(now.getTime() + 2 * 86400000).toISOString() })
    }
    return suggestions
  },

  // Resume
  getResume: async () => {
    const userId = await getUserId()
    const { data } = await supabase.from('resumes').select('*').eq('user_id', userId).limit(1).single()
    return data || { raw_text: '', parsed: {}, filename: '' }
  },

  updateResume: async (raw_text, filename) => {
    const userId = await getUserId()
    // Upsert: try update, then insert
    const { data: existing } = await supabase.from('resumes').select('id').eq('user_id', userId).limit(1).single()
    if (existing) {
      return throwIfError(
        await supabase.from('resumes').update({ raw_text, filename }).eq('id', existing.id).select().single()
      )
    } else {
      return throwIfError(
        await supabase.from('resumes').insert({ user_id: userId, raw_text, filename }).select().single()
      )
    }
  },

  // AI features — use user's own OpenAI key directly from browser
  tailorResume: async (id) => {
    const job = await api.getJob(id)
    const candidateContext = await getCandidateContext()

    const result = await callOpenAI(`You are a professional resume consultant. Your job is to tailor the candidate's resume for a specific role.

RULES:
- Rewrite bullet points to emphasize experience relevant to THIS specific role
- Mirror keywords and phrases from the job description
- Reorder sections to lead with the most relevant experience
- Keep it HONEST — don't fabricate experience, but reframe existing experience to match
- If the candidate mentioned their strengths or career goals, use that to guide emphasis
- Use strong action verbs and quantify achievements where possible

JOB POSTING:
Company: ${job.company}
Role: ${job.role}
Description:
${job.description}

${candidateContext}

Respond in EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):
{
  "tailored_resume": "The full tailored resume text with clear sections (SUMMARY, EXPERIENCE, SKILLS, EDUCATION). Ready to export.",
  "improvements": [
    {"category": "Keywords", "suggestion": "Add these keywords from the job post: X, Y, Z"},
    {"category": "Experience", "suggestion": "Specific actionable suggestion referencing actual experience"}
  ]
}`, { temperature: 0.4 })

    await api.updateJob(id, {
      tailored_resume: result.tailored_resume || '',
      resume_improvements: result.improvements || [],
    })
    return await api.getJob(id)
  },

  interviewPrep: async (id) => {
    const job = await api.getJob(id)
    const candidateContext = await getCandidateContext()

    const result = await callOpenAI(`You are an expert interview coach preparing a candidate for a specific role. Use their actual experience to craft realistic, compelling answers.

RULES:
- Suggested answers MUST use the STAR format (Situation, Task, Action, Result) and reference the candidate's REAL experience from their resume
- Questions to ask should show genuine interest and research about the company
- Key talking points should be things the candidate can naturally bring up that highlight their fit
- Potential concerns should be honest about gaps and include a strategy to address each one
- If the candidate mentioned growth areas or career goals, factor those into the prep

JOB POSTING:
Company: ${job.company}
Role: ${job.role}
Description:
${job.description}
${job.company_overview ? `\nCompany: ${job.company_overview}` : ''}
${job.company_industry ? `Industry: ${job.company_industry}` : ''}

${candidateContext}

Respond in EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):
{
  "likely_questions": [
    {"question": "Tell me about a time you...", "suggested_answer": "At [Company], I [situation]. I was tasked with [task]. I [action] which resulted in [result]."}
  ],
  "questions_to_ask": ["Insightful question showing research about the company/role"],
  "key_talking_points": ["Specific experience to highlight and how to frame it"],
  "potential_concerns": ["Gap or concern the interviewer might have + strategy to address it"],
  "company_research_notes": "Key things to know about this company, their products, culture, and recent news"
}`, { temperature: 0.4 })

    await api.updateJob(id, { interview_prep_ai: result })
    return await api.getJob(id)
  },

  // Export not available in hosted mode (needs server-side docx generation)
  exportResume: () => null,
}
