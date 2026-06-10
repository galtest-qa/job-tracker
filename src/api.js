import { supabase } from './lib/supabase.js'
import { callOpenAI } from './lib/openai.js'
import { getCandidateContext } from './lib/candidateContext.js'
import { FIXED_COLUMNS, guessFixedColumn } from './lib/columns.js'

// ── Interview knowledge base helpers ──────────────────────────────────────

// Mirror of the Postgres normalize_company_name() function.
// Must stay in sync with 20260618_normalization_guardrails.sql.
//
// Examples:
//   "Wix"              → "wix"
//   "wix.com"          → "wix"
//   "Wix.com Ltd."     → "wix"
//   "careers.wix.com"  → "wix"
//   "Google LLC"       → "google"
//   "Monday.com"       → "monday"
export function normalizeCompanyName(name) {
  if (!name) return ''
  let s = name.trim().toLowerCase()
  s = s.replace(/^https?:\/\//, '')
  s = s.replace(/^(?:www|careers|jobs|talent|about|hire)\./, '')
  s = s.replace(/[/?#].*$/, '')
  s = s.replace(/\.(?:com|io|org|net|co|app|ai|dev|tech|inc|biz|us|uk|de|fr|ca|au)\b.*/i, '')
  s = s.replace(/[\s,]+(?:llc|ltd\.?|inc\.?|corp\.?|co\.?|gmbh|b\.?v\.?|s\.?a\.?|plc|limited|incorporated|company|group|holdings?)[\s.,]*$/gi, '')
  s = s.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
  return s
}

// Map a job role string to one of the broad role_family values stored in
// company_questions. Returns null when no confident mapping can be made.
function inferRoleFamily(role) {
  if (!role) return null
  const r = role.toLowerCase()
  if (/engineer|developer|\bdev\b|swe|sre|devops|platform|backend|frontend|fullstack|mobile/.test(r)) return 'engineering'
  if (/product manager|\bpm\b|product owner/.test(r)) return 'product'
  if (/design|ux\b|ui\b/.test(r)) return 'design'
  if (/\bdata\b|analyst|machine learning|\bml\b|\bai\b/.test(r)) return 'data'
  if (/ops|operations|program manager|project manager|release/.test(r)) return 'ops'
  if (/sales|account executive|\bae\b/.test(r)) return 'sales'
  if (/marketing/.test(r)) return 'marketing'
  return null
}

// Seed the company_questions table from a freshly-generated profile.
// Uses the upsert_company_question RPC so frequency increments on repeats.
async function seedQuestionsFromProfile(companyKey, roleFamily, profile) {
  const entries = []

  // Stage questions from company-level profile
  for (const stage of profile.stages || []) {
    const stageName = normalizeStage(stage.name)
    for (const q of stage.questions || []) {
      if (q?.trim()) entries.push({ stage: stageName, question: q.trim() })
    }
  }
  // Role-specific questions
  for (const q of profile.role_specific?.role_questions || []) {
    if (q?.trim()) entries.push({ stage: 'general', question: q.trim() })
  }

  for (const { stage, question } of entries) {
    await supabase.rpc('upsert_company_question', {
      p_company_key: companyKey,
      p_role_family: roleFamily,
      p_stage: stage,
      p_question: question,
      p_source_id: null,
      p_confidence: 0.50,
      p_is_ai_generated: true,
    })
  }
}

// Map human-readable stage names (from AI output) to the enum values
// stored in company_questions / interview_stage_reports.
function normalizeStage(name) {
  if (!name) return 'general'
  const n = name.toLowerCase()
  if (/recruiter|hr screen|phone screen/.test(n)) return 'recruiter_screen'
  if (/hiring manager/.test(n)) return 'hiring_manager'
  if (/technical|coding|system design/.test(n)) return 'technical'
  if (/culture|values|fit/.test(n)) return 'culture'
  if (/case|take.?home|assignment/.test(n)) return 'case_study'
  if (/panel|onsite|loop/.test(n)) return 'panel'
  return 'general'
}

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
    const computedScore = Math.max(0, 100 - breakdown.reduce((sum, r) => sum + r.points_deducted, 0))
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
      match_score: computedScore,
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

  analyzeResume: async (id) => {
    const job = await api.getJob(id)
    const resume = await api.getResume()
    const rawResume = resume?.raw_text || ''
    const candidateContext = await getCandidateContext()

    if (!rawResume.trim()) {
      throw new Error('Upload your resume first (button in the header)')
    }
    if (!job.description?.trim()) {
      throw new Error('No job description found — paste the job posting first')
    }

    const result = await callOpenAI(`You are a Resume Coach specializing in helping professionals strengthen their resumes for specific job opportunities.

Your job is to score this resume against the job posting, identify the top coaching opportunities, and extract ATS keywords.

━━━ SCORING (0–100) ━━━
Score the resume on these 6 dimensions and return a single composite score:
- ATS keyword coverage: how many of the role's key terms appear in the resume
- Role relevance: how closely the candidate's experience matches the target role
- Leadership evidence: concrete examples of leading teams, projects, or initiatives
- Business impact: evidence of measurable business outcomes (revenue, efficiency, growth)
- Achievement quantification: how many bullets include specific numbers, percentages, or scale
- Requirement match: how many specific job requirements are directly addressed

current_score: the realistic score as the resume stands today (be honest, not optimistic)
potential_score: what the score could realistically reach after coaching — never more than 20 points higher, usually 6–15

━━━ COACHING OPPORTUNITIES ━━━
Identify 2–4 high-impact opportunities. Each must have:
- target_statement: COPY VERBATIM text from the resume — exact characters, no paraphrasing, no ellipsis, no summarizing
- title: concise action phrase, specific not generic (e.g. "Quantify team building outcome" not "Add impact")
- explanation: 1–2 sentences referencing the specific gap and why it matters for this role
- impact_score: 1–10 reflecting how much this one change would improve the resume
- questions: 1–3 concrete questions to collect the specific facts needed to write a stronger bullet
  GOOD question: "How many engineers did you manage directly?"
  GOOD question: "What percentage did onboarding time decrease by?"
  BAD question: "What was the impact of this work?"
  BAD question: "Can you tell me more about your achievements?"

━━━ ABSOLUTE PROHIBITIONS ━━━
NEVER treat the following as professional achievements or improvement opportunities:
- Job applications submitted
- Recruiter conversations or responses
- Interview invitations, interview rounds, final rounds
- Offers received or rejected

ONLY coach on real professional work:
- Work performed and delivered
- Products owned, built, or launched
- Teams led, grown, or built
- Business outcomes: revenue, cost savings, efficiency, customer impact
- Operational improvements and KPI changes
- Measurable team growth or organizational change

NEVER suggest changing or ask questions about:
- Job titles (e.g. "Senior Product Manager", "Team Lead")
- Company names
- Employment start or end dates
- Contact information (name, email, phone, LinkedIn URL)
- Education institution names, degrees, or graduation years

━━━ ATS KEYWORDS ━━━
Extract 8–15 important keywords and phrases from the job description.
Check which appear in the resume text and which are absent.

━━━ OUTPUT ━━━
Return valid JSON only — no markdown, no code blocks, no extra text:

{
  "current_score": 74,
  "potential_score": 88,
  "strengths": ["strength 1", "strength 2"],
  "gaps": ["gap 1", "gap 2"],
  "coaching_opportunities": [
    {
      "id": "opp_1",
      "title": "Quantify team building outcome",
      "impact_score": 8,
      "explanation": "Your statement about building the Product Operations team lacks scale and outcome. Recruiters evaluating leadership need specific numbers.",
      "target_statement": "Built a Product Operations team",
      "questions": [
        "How many people were on the team when you finished building it?",
        "What specific process or metric improved because of this team?",
        "Can you give a number — percentage improvement, time saved, or volume handled?"
      ]
    }
  ],
  "ats_keywords": {
    "found_in_resume": ["product strategy", "roadmap"],
    "missing_from_resume": ["stakeholder management", "OKRs", "go-to-market"]
  }
}

JOB POSTING:
Company: ${job.company}
Role: ${job.role}
Description:
${(job.description || '').slice(0, 3000)}

RESUME:
${rawResume}
${candidateContext ? `\nCANDIDATE CONTEXT:\n${candidateContext}` : ''}`, { temperature: 0.3 })

    const score = {
      current_score: typeof result.current_score === 'number' ? result.current_score : 0,
      potential_score: typeof result.potential_score === 'number' ? result.potential_score : 0,
      strengths: Array.isArray(result.strengths) ? result.strengths.slice(0, 4) : [],
      gaps: Array.isArray(result.gaps) ? result.gaps.slice(0, 4) : [],
      coaching_opportunities: Array.isArray(result.coaching_opportunities)
        ? result.coaching_opportunities.slice(0, 4)
        : [],
      analyzed_at: new Date().toISOString(),
    }

    const atsKeywords = {
      found_in_resume: Array.isArray(result.ats_keywords?.found_in_resume)
        ? result.ats_keywords.found_in_resume : [],
      missing_from_resume: Array.isArray(result.ats_keywords?.missing_from_resume)
        ? result.ats_keywords.missing_from_resume : [],
      injected_by_edits: [],
    }

    await api.updateJob(id, { resume_score: score, ats_keywords: atsKeywords })
    return await api.getJob(id)
  },

  coachGenerate: async (id, opportunity, targetStatement, answers) => {
    const job = await api.getJob(id)

    const qaBlock = (opportunity.questions || [])
      .map((q, i) => `Q: ${q}\nA: ${answers[i]?.trim() || '(no answer provided)'}`)
      .join('\n\n')

    const result = await callOpenAI(`You are a Resume Coach helping a professional strengthen a specific resume bullet.

You have collected answers from the candidate about a statement on their resume.
Your task is to rewrite it into a stronger bullet using ONLY the facts the candidate provided.

━━━ RULES ━━━
- Use ONLY facts the candidate explicitly stated — do not invent numbers, percentages, team sizes, or outcomes
- If an answer is empty or vague, make the bullet as strong as possible without fabricating anything
- The improved statement should be 1–2 sentences that can directly replace the original in the resume
- Write in the same tense and style as the original (past tense for past roles)
- NEVER change job titles, company names, dates, or any identifying information
- score_improvement: realistic integer between 1 and 10 (how much this one improvement adds to the resume score)

OPPORTUNITY:
"${opportunity.title}"
${opportunity.explanation || ''}

ORIGINAL STATEMENT (verbatim from resume):
"${targetStatement}"

CANDIDATE'S ANSWERS:
${qaBlock}

ROLE CONTEXT:
${job.role} at ${job.company}

Return valid JSON only:
{
  "original": "${targetStatement.replace(/"/g, '\\"')}",
  "improved": "the improved bullet using only the facts provided",
  "reason": "1–2 sentences explaining what makes it stronger and why it matters for this role",
  "score_improvement": 5
}`, { temperature: 0.3 })

    return {
      original: result.original || targetStatement,
      improved: typeof result.improved === 'string' ? result.improved : '',
      reason: typeof result.reason === 'string' ? result.reason : '',
      score_improvement: typeof result.score_improvement === 'number' ? result.score_improvement : 3,
    }
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

  buildInterviewProfile: async (id) => {
    const job = await api.getJob(id)
    const candidateContext = await getCandidateContext()
    const companyKey = normalizeCompanyName(job.company)

    // ── 1. Check shared company profile (skip per-user regeneration) ──
    let sharedProfile = null
    if (companyKey) {
      const { data } = await supabase
        .from('company_interview_profiles')
        .select('profile, generated_at')
        .eq('company_key', companyKey)
        .gte('expires_at', new Date().toISOString())
        .maybeSingle()
      sharedProfile = data
    }

    // ── 2. Generate company-level profile if not cached ──
    if (!sharedProfile) {
      const companyResult = await callOpenAI(`You are a senior hiring expert. Build a company-level interview profile for ${job.company}.

COMPANY CONTEXT:
${job.company_overview ? `Overview: ${job.company_overview}` : ''}
${job.company_industry ? `Industry: ${job.company_industry}` : ''}
${job.company_size ? `Size: ${job.company_size}` : ''}
Job description excerpt: ${(job.description || '').slice(0, 800)}

IMPORTANT — Evidence classification rules:
- confidence "high": you have seen multiple consistent reports about this specific company's interview process in your training data (Glassdoor, Reddit, tech blogs, LinkedIn posts). Cite the source type.
- confidence "medium": you are inferring from the company's size, industry, stage, or role type. Say so explicitly.
- confidence "low": limited signal — best guess from general patterns.

Be honest. Do not overstate confidence. If this is a small or obscure company, most items will be "medium" or "low".

Return EXACTLY this JSON (no markdown, no code blocks):
{
  "stages": [
    {
      "name": "Stage name",
      "format": "Phone / Video / Onsite / Technical / Panel",
      "duration": "30 min",
      "focus": "What this stage assesses",
      "questions": ["Realistic question", "Another"],
      "confidence": "high|medium|low",
      "evidence_note": "Observed in Glassdoor reports for this company|Inferred from typical Series B SaaS hiring patterns"
    }
  ],
  "common_mistakes": [
    { "text": "Specific mistake and why it fails", "confidence": "high|medium|low" }
  ],
  "success_signals": [
    { "text": "What strong candidates do", "confidence": "high|medium|low" }
  ],
  "company_intel": "2-3 paragraphs: what the company does, culture signals from the job description, what they value, what differentiates offer-getters",
  "intel_confidence": "high|medium|low",
  "data_quality_note": "One honest sentence: how well-known is this company's interview process, and what are the limits of this profile"
}`, { temperature: 0.3 })

      // Store in shared table — all future users of this company benefit
      if (companyKey) {
        await supabase.from('company_interview_profiles').upsert({
          company_name: job.company,
          profile: companyResult,
          generated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: 'company_key' })
      }
      sharedProfile = { profile: companyResult, generated_at: new Date().toISOString() }
    }

    // ── 3. Generate role-specific layer on top of the shared company base ──
    const roleLayer = await callOpenAI(`You are preparing a candidate for a specific role interview. You have the company's general interview profile — now add what is specific to THIS role and THIS candidate.

ROLE: ${job.role} at ${job.company}
FULL JOB DESCRIPTION:
${job.description || '(not provided)'}

${candidateContext}

Generate role-specific additions. Do NOT repeat anything from the company profile. Only add what is unique to this specific role.

Return EXACTLY this JSON:
{
  "role_questions": ["Question specific to this role's responsibilities", "Another"],
  "talking_points": ["Specific experience from the candidate's background that directly maps to a requirement in this JD"],
  "potential_concerns": ["Gap or concern the interviewer might raise + how to address it honestly"],
  "prep_checklist": ["Concrete action item before the first interview — be specific to this company and role"]
}`, { temperature: 0.3 })

    // ── 4. Merge, preserving practice history ──
    const existing = job.interview_profile || {}
    const profile = {
      ...sharedProfile.profile,
      role_specific: roleLayer,
      prep_checklist: roleLayer.prep_checklist || [],
      from_shared_cache: !!(sharedProfile.generated_at && companyKey),
      mock_attempts: existing.mock_attempts || 0,
      mock_scores: existing.mock_scores || [],
      avg_mock_score: existing.avg_mock_score || null,
      checklist_done: existing.checklist_done || [],
      generated_at: new Date().toISOString(),
    }

    await api.updateJob(id, { interview_profile: profile })

    // ── 5. Seed question library (fire-and-forget, non-blocking) ──
    // Questions accumulate in company_questions so future users benefit
    // from frequency counts even before any web scraping is added.
    const roleFamily = inferRoleFamily(job.role)
    seedQuestionsFromProfile(companyKey, roleFamily, profile).catch(() => {})

    return await api.getJob(id)
  },

  mockInterviewScore: async (id, { question, answer }) => {
    const job = await api.getJob(id)

    const result = await callOpenAI(`You are a senior interviewer at ${job.company} evaluating a ${job.role} candidate.

QUESTION ASKED: "${question}"

CANDIDATE'S ANSWER: "${answer}"

SCORING RUBRIC — apply strictly, do not inflate:
• 1–3  No specific examples. Vague generalities ("I'm a team player"). Under 3 sentences. Off-topic.
• 4    Some structure but examples unnamed ("at a previous job") or too brief. No quantified outcome.
• 5    Recognizable structure (STAR or similar). One specific example but impact is vague or missing.
• 6    Clear STAR. Named company/project. Specific actions taken. Some quantification or concrete outcome.
• 7    Strong STAR. Vivid details. Quantified result. The candidate's personal contribution is clear.
• 8    All of 7 PLUS result is impressive and directly relevant to what ${job.company} is hiring for.
• 9–10 Reserved for genuinely exceptional: measurable business impact, clear leadership signal, memorable framing perfectly matched to this role. Rare.

Calibration check: most real interview answers land at 4–6. Push to 7 only if the STAR bar is clearly met. Score 8+ only if you would actually flag this answer to the hiring manager as impressive.

Return EXACTLY this JSON (score must be an integer):
{
  "score": 5,
  "breakdown": { "structure": 5, "specificity": 4, "relevance": 6, "impact": 4 },
  "what_worked": "One concrete thing that was good about this answer",
  "to_improve": "The single most important thing to fix — be specific",
  "stronger_version": "Rewrite the answer to score 8/10 using the same experience but with vivid details and a clear quantified result"
}`, { temperature: 0.2 })

    // Track per-answer scores for avg and readiness calculation
    const existing = job.interview_profile || {}
    const prevScores = existing.mock_scores || []
    const newScores = [...prevScores, result.score]
    const avgScore = Math.round((newScores.reduce((a, b) => a + b, 0) / newScores.length) * 10) / 10

    await api.updateJob(id, {
      interview_profile: {
        ...existing,
        mock_attempts: newScores.length,
        mock_scores: newScores,
        avg_mock_score: avgScore,
      },
    })

    return result
  },

  // ── Interview Knowledge Base ────────────────────────────────────────────

  // User reports an interview stage they completed, with optional questions.
  // Populates interview_stage_reports and seeds company_questions with
  // any questions the user remembers being asked.
  reportInterviewStage: async (jobId, { stage, outcome, duration_min, questions_seen, notes }) => {
    const userId = await getUserId()
    const job = await api.getJob(jobId)
    const companyKey = normalizeCompanyName(job.company)
    const roleFamily = inferRoleFamily(job.role)

    // Save the stage report (upsert so the user can update their entry)
    await supabase.from('interview_stage_reports').upsert({
      user_id: userId,
      job_id: jobId,
      company_key: companyKey,
      role_family: roleFamily,
      stage_name: stage,
      outcome: outcome || null,
      duration_min: duration_min || null,
      questions_seen: questions_seen || [],
      notes: notes || null,
    }, { onConflict: 'user_id,job_id,stage_name' })

    // Validate and sanitise questions before touching shared tables.
    // Rules (enforced here AND in the Postgres upsert function):
    //   • cap at 20 questions per report (prevents bulk seeding)
    //   • strip HTML / control characters
    //   • reject anything < 10 or > 500 characters
    //   • strip patterns that look like personal data (email, phone, names)
    const rawQuestions = (questions_seen || []).slice(0, 20)
    const cleanQuestions = rawQuestions
      .map(q => q.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
      .filter(q => q.length >= 10 && q.length <= 500)
      // Reject question-shaped personal data (email addresses, phone numbers)
      .filter(q => !/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(q))
      .filter(q => !/\b\d{3}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/.test(q))

    if (cleanQuestions.length > 0) {
      // Privacy: company_intel_sources is readable by all authenticated users.
      // Store only the stage name and sanitised questions — NO user ID, role,
      // notes, or any other personal/job-specific data.
      const { data: source } = await supabase
        .from('company_intel_sources')
        .insert({
          company_key: companyKey,
          source_type: 'user_report',
          // contributed_by intentionally omitted — prevents linking back to user
          extracted_findings: { stage, questions: cleanQuestions },
          confidence: 0.85,
          relevance_tags: [stage, 'questions'],
        })
        .select('id')
        .single()

      for (const q of cleanQuestions) {
        await supabase.rpc('upsert_company_question', {
          p_company_key: companyKey,
          p_role_family: roleFamily,
          p_stage: stage,
          p_question: q,
          p_source_id: source?.id ?? null,
          p_confidence: 0.85,
          p_is_ai_generated: false,
        })
      }
    }
  },

  // Fetch questions from the shared library for a given company.
  // Returns questions ordered by frequency desc so the most-confirmed
  // questions surface first.
  getCompanyQuestions: async (companyKey, { roleFamily, stage, limit = 30 } = {}) => {
    let q = supabase
      .from('company_questions')
      .select('id, stage, role_family, question, frequency, confidence, is_ai_generated')
      .eq('company_key', companyKey)
      .order('frequency', { ascending: false })
      .order('confidence', { ascending: false })
      .limit(limit)

    if (roleFamily) q = q.or(`role_family.eq.${roleFamily},role_family.is.null`)
    if (stage)      q = q.eq('stage', stage)

    const { data } = await q
    return data || []
  },

  // Export not available in hosted mode (needs server-side docx generation)
  exportResume: () => null,

  // Settings
  getSettings: async () => {
    const userId = await getUserId()
    const { data } = await supabase.from('user_settings').select('*').eq('user_id', userId).single()
    return data || { weekly_goal_applied: 10, weekly_goal_tailored: 5, weekly_goal_added: 15, has_extension: false }
  },

  updateSettings: async (patch) => {
    const userId = await getUserId()
    return throwIfError(
      await supabase.from('user_settings')
        .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() })
        .select().single()
    )
  },

  // ── Gmail Integration ──

  gmailAuthUrl: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')
    const base = import.meta.env.VITE_SUPABASE_URL
    const res = await fetch(`${base}/functions/v1/gmail-auth-init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to start Gmail auth')
    return data.url
  },

  gmailStatus: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { connected: false }
    const base = import.meta.env.VITE_SUPABASE_URL
    const res = await fetch(`${base}/functions/v1/gmail-status`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    })
    return res.json()
  },

  gmailRecentEmails: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')
    const base = import.meta.env.VITE_SUPABASE_URL
    const res = await fetch(`${base}/functions/v1/gmail-recent`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to fetch emails')
    return data.emails
  },

  gmailSync: async (force = false) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { skipped: true, reason: 'not_authenticated' }
    const base = import.meta.env.VITE_SUPABASE_URL
    const url = force ? `${base}/functions/v1/gmail-sync?force=true` : `${base}/functions/v1/gmail-sync`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    })
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { throw new Error(`Sync error ${res.status}: ${text.slice(0, 200)}`) }
    // Surface reconnect signal to caller instead of throwing, so App can set the reconnect banner
    if (!res.ok) {
      if (data.needsReconnect) return { needsReconnect: true, error: data.error }
      throw new Error(data.error || data.message || `HTTP ${res.status}`)
    }
    return data
  },

  getHiringEvents: async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const { data } = await supabase
      .from('hiring_events')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    return data || []
  },

  getHiringEventsForJob: async (jobId) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const { data } = await supabase
      .from('hiring_events')
      .select('*, email_classifications(summary, snippet, from_address, subject, direction, received_at)')
      .eq('user_id', user.id)
      .eq('matched_job_id', jobId)
      .neq('status', 'dismissed')
      .order('created_at', { ascending: false })
      .limit(20)
    return data || []
  },

  fetchEmailBody: async (emailId) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')
    const base = import.meta.env.VITE_SUPABASE_URL
    const res = await fetch(`${base}/functions/v1/gmail-fetch-email?emailId=${encodeURIComponent(emailId)}`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to fetch email content')
    return data.body
  },

  getUnreadEventCount: async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0
    const { count } = await supabase
      .from('hiring_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'pending')
    return count || 0
  },

  markEventStatus: async (id, status, userAction = null) => {
    const updates = { status }
    if (userAction) updates.user_action = userAction
    if (status === 'acted') updates.acted_at = new Date().toISOString()
    const { error } = await supabase.from('hiring_events').update(updates).eq('id', id)
    if (error) throw new Error(error.message)
  },

  markEventPopupShown: async (id) => {
    await supabase.from('hiring_events')
      .update({ popup_shown: true, popup_shown_at: new Date().toISOString() })
      .eq('id', id)
  },

  clearJobUnreadEvent: async (jobId) => {
    await supabase.from('jobs').update({ has_unread_event: false }).eq('id', jobId)
  },

  gmailClassifyRecent: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')
    const base = import.meta.env.VITE_SUPABASE_URL
    const res = await fetch(`${base}/functions/v1/gmail-classify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    })
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { throw new Error(`Server error ${res.status}: ${text.slice(0, 300)}`) }
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`)
    return data
  },

  importJobFromUrl: async (url) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const res = await fetch(`${supabaseUrl}/functions/v1/job-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ url }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    return data
  },

  // ── MCP API key management ─────────────────────────────────────────────────
  // Key is generated client-side; only the SHA-256 hash is stored in the DB.
  // The full key is returned once and never recoverable afterward.

  generateMcpKey: async () => {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    const b64 = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    const key = `jm_live_${b64}`

    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    const prefix = key.slice(0, 20) // 'jm_live_' + 12 chars

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('profiles')
      .update({ mcp_api_key_hash: hashHex, mcp_api_key_prefix: prefix })
      .eq('id', user.id)
    if (error) throw new Error(error.message)

    return { key, prefix } // full key shown once — never stored server-side
  },

  revokeMcpKey: async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('profiles')
      .update({ mcp_api_key_hash: null, mcp_api_key_prefix: null })
      .eq('id', user.id)
    if (error) throw new Error(error.message)
  },

  getMcpKeyStatus: async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('profiles')
      .select('mcp_api_key_prefix, mcp_api_key_hash')
      .eq('id', user.id).single()
    return {
      hasKey: !!data?.mcp_api_key_hash,
      prefix: data?.mcp_api_key_prefix || null,
    }
  },

  getRecommendations: async (jobId = null) => {
    const userId = await getUserId()
    let query = supabase
      .from('recommendations')
      .select('id, type, title, reason, priority, status, context, job_id, created_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('priority', { ascending: false })
    if (jobId) query = query.eq('job_id', jobId)
    return throwIfError(await query)
  },

  dismissRecommendation: async (id) => {
    return throwIfError(await supabase
      .from('recommendations')
      .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
      .eq('id', id))
  },
}
