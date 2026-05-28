import { supabase } from './lib/supabase.js'
import { callOpenAI } from './lib/openai.js'
import { getCandidateContext } from './lib/candidateContext.js'
import { FIXED_COLUMNS, guessFixedColumn } from './lib/columns.js'

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user.id
}

function throwIfError({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

// ── Ensure fixed columns, migrating any custom columns ──

let _columnsInitialized = false

async function ensureFixedColumns(userId) {
  if (_columnsInitialized) return
  _columnsInitialized = true

  const { data: existing } = await supabase.from('columns').select('*').eq('user_id', userId).order('sort_order')

  const fixedNames = FIXED_COLUMNS.map(c => c.name)
  const alreadyFixed = existing && existing.length === FIXED_COLUMNS.length &&
    existing.every(c => fixedNames.includes(c.name))

  if (alreadyFixed) return

  // Build the fixed column rows
  const { data: inserted } = await supabase
    .from('columns')
    .insert(FIXED_COLUMNS.map(c => ({ ...c, user_id: userId })))
    .select()

  if (!inserted) return

  // Migrate jobs from old columns to nearest fixed column
  if (existing && existing.length > 0) {
    const fixedByName = Object.fromEntries(inserted.map(c => [c.name, c]))
    await Promise.all(existing.map(async oldCol => {
      const targetName = guessFixedColumn(oldCol.name)
      const target = fixedByName[targetName]
      if (!target) return
      await supabase.from('jobs')
        .update({ status: target.name })
        .eq('user_id', userId)
        .eq('status', oldCol.name)
    }))
    // Delete old columns
    await supabase.from('columns').delete().eq('user_id', userId)
      .not('id', 'in', `(${inserted.map(c => c.id).join(',')})`)
  }
}

// Called once after login
export async function initUserData() {
  const userId = await getUserId()
  await ensureFixedColumns(userId)
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
      department: jobData.department || '',
      industry: jobData.industry || '',
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

    const result = await callOpenAI(`You are an expert career advisor. Analyze this job posting against the candidate using a strict, transparent scoring system.

STEP 1 — EXTRACT REQUIREMENTS:
- Extract ALL distinct requirements from the job description. Aim for 8–15 items.
- If the job description is short or vague, infer standard requirements for the role level and title.
- Do NOT group multiple requirements into one. Each requirement = one item.

STEP 2 — CLASSIFY EACH REQUIREMENT:
Assign a WEIGHT:
  - "critical" = must-have (years of experience, core skills, mandatory tools)
  - "important" = significant but not a dealbreaker (preferred tools, domain knowledge)
  - "nice_to_have" = bonus only (extra certifications, minor language, etc.)

Assign a STATUS — be strict:
  - "met" = candidate clearly and directly has this from their actual experience
  - "partial" = candidate has done something directly similar but at smaller scale or adjacent context. Only use partial if the connection is strong and clear. If it requires a stretch, use "unmet".
  - "unmet" = candidate lacks this or the connection is weak

STEP 3 — DEDUCT POINTS (be consistent — the math must be exact):
  - critical + unmet = 15 to 25 pts (large experience gaps = 20–25)
  - critical + partial = 5 to 12 pts
  - important + unmet = 8 to 12 pts
  - important + partial = 3 to 6 pts
  - nice_to_have + unmet = 2 to 5 pts
  - nice_to_have + partial = 1 to 3 pts
  - met (any weight) = 0 pts
  - Be HARSH on experience year gaps: if role asks 5+ years and candidate has 1–2, that is critical + unmet = 20–25 pts

STEP 4 — COMPUTE SCORE:
  - Sum all points_deducted values
  - match_score = 100 − total_deducted (minimum 0)
  - IMPORTANT: your match_score field MUST equal exactly 100 minus the sum of all points_deducted in score_breakdown. Double-check this before responding.

JOB POSTING:
Company: ${job.company}
Role: ${job.role}
Description:
${job.description}

${candidateContext}

POSITIONING TIPS RULES:
- Write exactly 3 tips
- Each tip MUST name a specific project, company, achievement, or tool from the candidate's actual experience
- Do not give generic advice like "highlight your experience in X" — be concrete

Respond in EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):
{
  "summary": "2-3 sentence summary of what this role involves",
  "company_overview": "1-2 sentence company description if inferable",
  "company_industry": "industry category",
  "score_breakdown": [
    {
      "requirement": "The specific requirement from the job posting",
      "weight": "critical|important|nice_to_have",
      "status": "met|partial|unmet",
      "points_deducted": 0,
      "evidence": "Cite the specific candidate experience that justifies this status, or explain exactly what is missing"
    }
  ],
  "match_score": "<integer 0-100, must equal 100 minus sum of all points_deducted>",
  "positioning_tips": ["tip 1 referencing a specific achievement", "tip 2 referencing a specific achievement", "tip 3 referencing a specific achievement"],
  "department": "one of: R&D / Engineering, Product, QA, DevOps / IT, Data, Design, Sales, Marketing, Operations, Customer Success, Finance, HR, Legal",
  "industry": "one of: AI, Cybersecurity, Cloud, Gaming, AdTech, FinTech, HealthTech, E-commerce, SaaS, Enterprise Software, DevTools, Blockchain / Web3, Defense, Media / Entertainment, EdTech, HR Tech, Mobility / Transport, Retail, Other"
}`)

    const breakdown = (result.score_breakdown || []).map(r => ({
      ...r,
      points_deducted: Number(r.points_deducted) || 0,
    }))
    const requirements_met = breakdown.filter(r => r.status === 'met').map(r => `${r.requirement} — ${r.evidence}`)
    const requirements_partial = breakdown.filter(r => r.status === 'partial').map(r => `${r.requirement} (-${r.points_deducted}pts) — ${r.evidence}`)
    const requirements_unmet = breakdown.filter(r => r.status === 'unmet').map(r => `${r.requirement} (-${r.points_deducted}pts) — ${r.evidence}`)

    await api.updateJob(id, {
      summary: result.summary || '',
      company_overview: result.company_overview || '',
      company_industry: result.company_industry || '',
      requirements_met: requirements_met,
      requirements_partial: requirements_partial,
      requirements_unmet: requirements_unmet,
      score_breakdown: breakdown,
      score_breakdown_overrides: {},
      match_score: typeof result.match_score === 'number' ? result.match_score : parseInt(result.match_score) || null,
      positioning_tips: (() => {
        const t = result.positioning_tips
        if (Array.isArray(t)) return JSON.stringify(t)
        if (typeof t === 'string' && t.startsWith('[')) return t
        return t ? JSON.stringify([t]) : ''
      })(),
      department: result.department || '',
      industry: result.industry || '',
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
    await Promise.all(
      orderedIds.map((id, i) => supabase.from('columns').update({ sort_order: i }).eq('id', id))
    )
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
    const resume = await api.getResume()
    const rawResume = resume?.raw_text || ''

    if (!rawResume.trim()) {
      throw new Error('Upload your resume first (button in the header)')
    }

    // Detect which sections exist in the resume
    const resumeLines = rawResume.split('\n').map(l => l.trim().toUpperCase())
    const existingSections = resumeLines.filter(l => /^[A-Z][A-Z\s&\/]{2,}$/.test(l))

    const result = await callOpenAI(`You are an expert resume editor specializing in ATS optimization and recruiter impact. Tailor this resume to the job posting.

DO NOT return the full resume text. Instead, return:
1. "edits" — targeted find-and-replace changes to inject keywords and sharpen impact (5–10 edits)
2. "suggestions" — additions or rewrites the user can choose to apply manually

STEP 1 — IDENTIFY TOP KEYWORDS:
Before editing, mentally extract the 8–12 most important keywords and phrases from the job description (skills, tools, methodologies, role-specific language). Your edits should prioritize injecting these into the resume where they are absent but truthfully applicable.

STEP 2 — EDITS (find-and-replace):
- "find" = exact text copied character-for-character from the resume (must exist verbatim)
- "replace" = improved version — inject a missing keyword, strengthen a verb, or sharpen impact
- Priority order: (1) inject a missing ATS keyword, (2) replace a weak verb with a stronger one, (3) add a quantified result where missing
- Only change a few words at a time — never rewrite an entire sentence
- NEVER invent experience, titles, companies, tools, or metrics that are not in the resume
- NEVER touch the LANGUAGES section
- NEVER touch personal info (name, email, phone, LinkedIn)
- Add "impact": "high" if this edit adds a critical missing keyword or metric; "medium" for verb/phrasing improvements

STEP 3 — SUGGESTIONS (optional additions):
- Each suggestion MUST reference a specific project, achievement, or experience already in the resume — no generic advice
- Prioritize suggestions that address the biggest gaps between the resume and job requirements
- Check if the target section EXISTS: resume sections are: ${existingSections.join(', ') || 'none detected'}
- If the section does NOT exist, set type to "new_section"
- If it exists, use "add_bullet", "add_skill", or "rephrase"
- NEVER suggest changes to the LANGUAGES section

JOB POSTING:
Company: ${job.company}
Role: ${job.role}
Description:
${job.description}

RESUME:
${rawResume}

Respond in EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):
{
  "edits": [
    {"find": "exact text from resume", "replace": "improved text", "reason": "why this improves ATS or recruiter impact", "impact": "high|medium"}
  ],
  "suggestions": [
    {
      "section": "EXPERIENCE or SKILLS or new section name",
      "type": "add_bullet|add_skill|rephrase|new_section",
      "original": "original text if rephrasing, or empty",
      "suggested": "suggested text referencing a real achievement from the resume",
      "reason": "which job requirement this addresses and why"
    }
  ]
}`, { temperature: 0.3 })

    // Apply edits to the original resume text — preserves exact formatting
    let tailored = rawResume
    const edits = result.edits || []
    for (const edit of edits) {
      if (edit.find && edit.replace && tailored.includes(edit.find)) {
        tailored = tailored.replace(edit.find, edit.replace)
      }
    }

    await api.updateJob(id, {
      tailored_resume: tailored,
      resume_improvements: result.suggestions || [],
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

  // Settings
  getSettings: async () => {
    const userId = await getUserId()
    const { data } = await supabase.from('user_settings').select('*').eq('user_id', userId).single()
    return data || { weekly_goal_applied: 10, weekly_goal_tailored: 5, weekly_goal_added: 15 }
  },

  updateSettings: async (patch) => {
    const userId = await getUserId()
    return throwIfError(
      await supabase.from('user_settings')
        .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() })
        .select().single()
    )
  },
}
