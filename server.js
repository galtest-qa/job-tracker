import express from 'express'
import cors from 'cors'
import { getDb, all, get, run, save } from './db.js'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx'

const app = express()
app.use(cors())
app.use(express.json({ limit: '5mb' }))

const PORT = 3001

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null

// ── Resume ──

app.get('/api/resume', (req, res) => {
  const resume = get('SELECT * FROM resume WHERE id = 1')
  res.json({ ...resume, parsed: safeParseJSON(resume?.parsed, {}) })
})

app.put('/api/resume', (req, res) => {
  const { raw_text, filename } = req.body
  if (!raw_text) return res.status(400).json({ error: 'raw_text required' })

  const parsed = parseResumeText(raw_text)
  run("UPDATE resume SET raw_text = ?, parsed = ?, filename = ?, updated_at = datetime('now') WHERE id = 1",
    [raw_text, JSON.stringify(parsed), filename || ''])

  res.json({ raw_text, parsed, filename })
})

function parseResumeText(text) {
  const sections = {}
  let currentSection = 'summary'
  const lines = text.split('\n')
  const sectionHeaders = /^(summary|experience|education|skills|certifications|projects|awards|languages|objective|profile|work\s*experience|professional\s*experience)/i

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(sectionHeaders)
    if (match) {
      currentSection = match[1].toLowerCase().replace(/\s+/g, '_')
      if (!sections[currentSection]) sections[currentSection] = []
      continue
    }
    if (!sections[currentSection]) sections[currentSection] = []
    sections[currentSection].push(trimmed)
  }
  return sections
}

function getResumeContext() {
  const resume = get('SELECT * FROM resume WHERE id = 1')
  if (resume?.raw_text?.trim()) {
    return `CANDIDATE RESUME:\n${resume.raw_text}`
  }
  return `CANDIDATE PROFILE:\n${USER_PROFILE}`
}

// ── Reminders ──

app.get('/api/reminders', (req, res) => {
  const reminders = all('SELECT r.*, j.company, j.role FROM reminders r JOIN jobs j ON r.job_id = j.id ORDER BY r.due_at ASC')
  res.json(reminders)
})

app.get('/api/jobs/:id/reminders', (req, res) => {
  const reminders = all('SELECT * FROM reminders WHERE job_id = ? ORDER BY due_at ASC', [Number(req.params.id)])
  res.json(reminders)
})

app.post('/api/jobs/:id/reminders', (req, res) => {
  const { type, title, due_at, note } = req.body
  if (!title || !due_at) return res.status(400).json({ error: 'title and due_at required' })
  const result = run(
    'INSERT INTO reminders (job_id, type, title, due_at, note) VALUES (?, ?, ?, ?, ?)',
    [Number(req.params.id), type || 'custom', title, due_at, note || '']
  )
  const reminder = get('SELECT * FROM reminders WHERE id = ?', [result.lastInsertRowid])
  res.status(201).json(reminder)
})

app.put('/api/reminders/:id', (req, res) => {
  const existing = get('SELECT * FROM reminders WHERE id = ?', [Number(req.params.id)])
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const fields = ['title', 'due_at', 'note', 'completed', 'snoozed_until', 'type']
  const updates = []
  const values = []
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`)
      values.push(req.body[f])
    }
  }
  if (updates.length === 0) return res.json(existing)
  values.push(Number(req.params.id))
  run(`UPDATE reminders SET ${updates.join(', ')} WHERE id = ?`, values)
  const updated = get('SELECT * FROM reminders WHERE id = ?', [Number(req.params.id)])
  res.json(updated)
})

app.delete('/api/reminders/:id', (req, res) => {
  run('DELETE FROM reminders WHERE id = ?', [Number(req.params.id)])
  res.json({ ok: true })
})

// Suggest reminders when status changes
app.get('/api/jobs/:id/reminder-suggestions', (req, res) => {
  const job = get('SELECT * FROM jobs WHERE id = ?', [Number(req.params.id)])
  if (!job) return res.status(404).json({ error: 'Not found' })

  const status = (job.status || '').toLowerCase()
  const now = new Date()
  const suggestions = []

  if (status.includes('send')) {
    suggestions.push({
      type: 'send_resume', title: 'Send resume',
      due_at: now.toISOString().slice(0, 16),
    })
  }
  if (status.includes('applied')) {
    suggestions.push({
      type: 'follow_up_recruiter', title: 'Follow up recruiter',
      due_at: new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 16),
    })
  }
  if (status.includes('interview')) {
    suggestions.push({
      type: 'prepare_interview', title: 'Prepare for interview',
      due_at: new Date(now.getTime() + 86400000).toISOString().slice(0, 16),
    })
    suggestions.push({
      type: 'interview_reminder', title: 'Interview reminder',
      due_at: new Date(now.getTime() + 86400000).toISOString().slice(0, 16),
    })
    suggestions.push({
      type: 'check_feedback', title: 'Check feedback',
      due_at: new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 16),
    })
  }
  if (status.includes('assignment') || status.includes('task')) {
    suggestions.push({
      type: 'complete_assignment', title: 'Complete assignment',
      due_at: new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 16),
    })
  }
  if (status.includes('offer')) {
    suggestions.push({
      type: 'review_offer', title: 'Review offer',
      due_at: new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 16),
    })
  }

  res.json(suggestions)
})

// ── Columns ──

app.get('/api/columns', (req, res) => {
  const cols = all('SELECT * FROM columns ORDER BY sort_order ASC')
  res.json(cols)
})

app.post('/api/columns', (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'name required' })
  const maxOrder = get('SELECT MAX(sort_order) as mx FROM columns')
  const result = run('INSERT INTO columns (name, sort_order) VALUES (?, ?)', [name.trim(), (maxOrder?.mx || 0) + 1])
  const col = get('SELECT * FROM columns WHERE id = ?', [result.lastInsertRowid])
  res.status(201).json(col)
})

app.put('/api/columns/:id', (req, res) => {
  const col = get('SELECT * FROM columns WHERE id = ?', [Number(req.params.id)])
  if (!col) return res.status(404).json({ error: 'Not found' })
  const { name } = req.body
  if (name !== undefined) {
    // Rename column → also update all jobs with old status
    run('UPDATE jobs SET status = ? WHERE status = ?', [name.trim(), col.name])
    run('UPDATE columns SET name = ? WHERE id = ?', [name.trim(), Number(req.params.id)])
  }
  const updated = get('SELECT * FROM columns WHERE id = ?', [Number(req.params.id)])
  res.json(updated)
})

app.delete('/api/columns/:id', (req, res) => {
  const col = get('SELECT * FROM columns WHERE id = ?', [Number(req.params.id)])
  if (!col) return res.status(404).json({ error: 'Not found' })
  if (col.is_default) return res.status(400).json({ error: 'Cannot delete the default column' })
  // Move jobs in this column to the Backlog (default) column
  const backlog = get('SELECT * FROM columns WHERE is_default = 1')
  const target = backlog || get('SELECT * FROM columns WHERE id != ? ORDER BY sort_order ASC LIMIT 1', [Number(req.params.id)])
  if (target) {
    run('UPDATE jobs SET status = ? WHERE status = ?', [target.name, col.name])
  }
  run('DELETE FROM columns WHERE id = ?', [Number(req.params.id)])
  res.json({ ok: true })
})

app.post('/api/columns/reorder', (req, res) => {
  const { orderedIds } = req.body
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds required' })
  for (let i = 0; i < orderedIds.length; i++) {
    run('UPDATE columns SET sort_order = ? WHERE id = ?', [i, Number(orderedIds[i])])
  }
  const cols = all('SELECT * FROM columns ORDER BY sort_order ASC')
  res.json(cols)
})

// ── CRUD ──

app.get('/api/jobs', (req, res) => {
  const jobs = all('SELECT * FROM jobs ORDER BY sort_order ASC, created_at DESC')
  res.json(jobs.map(parseJob))
})

app.get('/api/jobs/:id', (req, res) => {
  const job = get('SELECT * FROM jobs WHERE id = ?', [Number(req.params.id)])
  if (!job) return res.status(404).json({ error: 'Not found' })
  res.json(parseJob(job))
})

app.post('/api/jobs', (req, res) => {
  const { company, role, link, description, source, status, tags, notes,
    interview_notes, company_overview, company_industry, company_size,
    contact_name, contact_role, contact_linkedin, contact_email } = req.body
  const result = run(`
    INSERT INTO jobs (company, role, link, description, source, status, tags, notes,
      interview_notes, company_overview, company_industry, company_size,
      contact_name, contact_role, contact_linkedin, contact_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    company, role, link || '', description || '', source || 'LinkedIn',
    status || 'Backlog', JSON.stringify(tags || []), notes || '',
    interview_notes || '', company_overview || '', company_industry || '', company_size || '',
    contact_name || '', contact_role || '', contact_linkedin || '', contact_email || ''
  ])
  const job = get('SELECT * FROM jobs WHERE id = ?', [result.lastInsertRowid])
  res.status(201).json(parseJob(job))
})

app.put('/api/jobs/:id', (req, res) => {
  const existing = get('SELECT * FROM jobs WHERE id = ?', [Number(req.params.id)])
  if (!existing) return res.status(404).json({ error: 'Not found' })

  const fields = ['company', 'role', 'link', 'description', 'summary', 'source',
    'status', 'notes', 'interview_notes', 'company_overview', 'company_industry',
    'company_size', 'match_score', 'positioning_tips', 'tailored_resume', 'interview_prep_ai',
    'contact_name', 'contact_role', 'contact_linkedin', 'contact_email', 'logo_url']
  const jsonFields = ['tags', 'requirements_met', 'requirements_partial', 'requirements_unmet', 'resume_improvements']

  const updates = []
  const values = []
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`)
      values.push(req.body[f])
    }
  }
  for (const f of jsonFields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`)
      values.push(JSON.stringify(req.body[f]))
    }
  }
  if (updates.length === 0) return res.json(parseJob(existing))

  updates.push("updated_at = datetime('now')")
  values.push(Number(req.params.id))
  run(`UPDATE jobs SET ${updates.join(', ')} WHERE id = ?`, values)

  const job = get('SELECT * FROM jobs WHERE id = ?', [Number(req.params.id)])
  res.json(parseJob(job))
})

app.delete('/api/jobs/:id', (req, res) => {
  run('DELETE FROM jobs WHERE id = ?', [Number(req.params.id)])
  res.json({ ok: true })
})

// ── Reorder ──

app.post('/api/jobs/reorder', (req, res) => {
  const { orderedIds } = req.body
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds required' })
  for (let i = 0; i < orderedIds.length; i++) {
    run('UPDATE jobs SET sort_order = ? WHERE id = ?', [i, Number(orderedIds[i])])
  }
  const jobs = all('SELECT * FROM jobs ORDER BY sort_order ASC, created_at DESC')
  res.json(jobs.map(parseJob))
})

// ── AI Analysis ──

const USER_PROFILE = `
Professional Background:
- 1.5 years at Upwind Security (cloud security startup)
  - 6 months as QA Engineer: manual and automated testing, QA coverage improvement, product readiness
  - 1 year as Release Operations Manager: built and scaled release operations, managed product release cycles
- Built and scaled product/release operations processes from scratch
- Managed PoCs (Proof of Concepts) and customer-facing workflows
- Worked cross-functionally with Product, R&D, and GTM teams
- Improved QA coverage and product readiness processes
- Turned customer insights into actionable product feedback
- Experience with cloud security domain

Key Skills:
- Release & product operations management
- QA engineering (manual + automated)
- Cross-functional collaboration (Product, R&D, GTM, Customer Success)
- PoC management and customer-facing workflows
- Process building and optimization
- Product readiness and release management
- Customer insights and feedback loops
- Cloud security domain knowledge
- Stakeholder management
`

app.post('/api/jobs/:id/analyze', async (req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(400).json({ error: 'AI features require OPENAI_API_KEY environment variable' })
  }

  const job = get('SELECT * FROM jobs WHERE id = ?', [Number(req.params.id)])
  if (!job) return res.status(404).json({ error: 'Not found' })

  try {
    const resumeContext = getResumeContext()
    const prompt = `Analyze this job posting against the candidate's profile. Be honest and practical.

JOB POSTING:
Company: ${job.company}
Role: ${job.role}
Description:
${job.description}

${resumeContext}

Respond in EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):
{
  "summary": "2-3 sentence summary of what this role involves",
  "company_overview": "1-2 sentence company description if inferable from the posting",
  "company_industry": "industry category",
  "requirements_met": ["requirement 1 the candidate clearly meets", "requirement 2..."],
  "requirements_partial": ["requirement the candidate partially meets with brief explanation"],
  "requirements_unmet": ["requirement the candidate doesn't meet with brief note"],
  "match_score": "<integer 0-100 based on how well the candidate matches, be honest and precise — do NOT default to 75>",
  "positioning_tips": "2-3 specific suggestions for how to position for this role, referencing actual experience",
  "tags": ["relevant", "tags", "for", "this", "role"]
}`

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    })

    if (!openaiRes.ok) {
      const err = await openaiRes.json().catch(() => ({}))
      throw new Error(err.error?.message || `OpenAI API error: ${openaiRes.status}`)
    }

    const data = await openaiRes.json()
    const text = data.choices[0].message.content.trim()

    let analysis
    try {
      analysis = JSON.parse(text)
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Could not parse AI response')
      }
    }

    // Save analysis to DB
    run(`
      UPDATE jobs SET
        summary = ?, company_overview = ?, company_industry = ?,
        requirements_met = ?, requirements_partial = ?, requirements_unmet = ?,
        match_score = ?, positioning_tips = ?, tags = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [
      analysis.summary || '',
      analysis.company_overview || '',
      analysis.company_industry || '',
      JSON.stringify(analysis.requirements_met || []),
      JSON.stringify(analysis.requirements_partial || []),
      JSON.stringify(analysis.requirements_unmet || []),
      analysis.match_score || null,
      analysis.positioning_tips || '',
      JSON.stringify(analysis.tags || []),
      Number(req.params.id)
    ])

    const updated = get('SELECT * FROM jobs WHERE id = ?', [Number(req.params.id)])
    res.json(parseJob(updated))
  } catch (err) {
    console.error('Analysis error:', err)
    res.status(500).json({ error: 'Analysis failed: ' + err.message })
  }
})

// ── Resume Tailoring per Job ──

app.post('/api/jobs/:id/tailor-resume', async (req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(400).json({ error: 'AI features require OPENAI_API_KEY environment variable' })
  }

  const job = get('SELECT * FROM jobs WHERE id = ?', [Number(req.params.id)])
  if (!job) return res.status(404).json({ error: 'Not found' })

  const resumeContext = getResumeContext()

  try {
    const prompt = `You are a professional resume consultant. Given the candidate's resume and a target job description, do two things:

1. TAILOR the resume specifically for this role. Rewrite bullet points to emphasize relevant experience, reorder sections to highlight the best matches, and adjust language to mirror the job posting's keywords. Keep it honest — don't fabricate experience, but frame existing experience to best match what they're looking for.

2. Provide specific IMPROVEMENT RECOMMENDATIONS — concrete things the candidate should add, change, or emphasize.

JOB POSTING:
Company: ${job.company}
Role: ${job.role}
Description:
${job.description}

${resumeContext}

Respond in EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):
{
  "tailored_resume": "The full tailored resume text, formatted with clear sections (SUMMARY, EXPERIENCE, SKILLS, EDUCATION). Use line breaks between sections. Write it ready to be exported to a Word document.",
  "improvements": [
    {"category": "Category name", "suggestion": "Specific actionable suggestion"},
    {"category": "Keywords", "suggestion": "Add these keywords from the job post: X, Y, Z"},
    {"category": "Experience", "suggestion": "Reframe your PoC management as program management experience"}
  ]
}`

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
      }),
    })

    if (!openaiRes.ok) {
      const err = await openaiRes.json().catch(() => ({}))
      throw new Error(err.error?.message || `OpenAI API error: ${openaiRes.status}`)
    }

    const data = await openaiRes.json()
    const text = data.choices[0].message.content.trim()
    let result
    try { result = JSON.parse(text) } catch {
      const m = text.match(/\{[\s\S]*\}/)
      result = m ? JSON.parse(m[0]) : null
      if (!result) throw new Error('Could not parse AI response')
    }

    run(`UPDATE jobs SET tailored_resume = ?, resume_improvements = ?, updated_at = datetime('now') WHERE id = ?`,
      [result.tailored_resume || '', JSON.stringify(result.improvements || []), Number(req.params.id)])

    const updated = get('SELECT * FROM jobs WHERE id = ?', [Number(req.params.id)])
    res.json(parseJob(updated))
  } catch (err) {
    console.error('Tailor error:', err)
    res.status(500).json({ error: 'Resume tailoring failed: ' + err.message })
  }
})

// ── AI Interview Prep ──

app.post('/api/jobs/:id/interview-prep', async (req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(400).json({ error: 'AI features require OPENAI_API_KEY environment variable' })
  }

  const job = get('SELECT * FROM jobs WHERE id = ?', [Number(req.params.id)])
  if (!job) return res.status(404).json({ error: 'Not found' })

  const resumeContext = getResumeContext()

  try {
    const prompt = `You are an expert interview coach. Prepare a comprehensive interview preparation guide for this specific role and candidate.

JOB POSTING:
Company: ${job.company}
Role: ${job.role}
Description:
${job.description}

${resumeContext}

${job.company_overview ? `Company context: ${job.company_overview}` : ''}
${job.company_industry ? `Industry: ${job.company_industry}` : ''}

Generate a practical interview prep guide. Respond in EXACTLY this JSON format (no markdown, no code blocks, just raw JSON):
{
  "likely_questions": [
    {"question": "Tell me about a time you...", "suggested_answer": "A concise STAR-format answer drawing from the candidate's actual experience..."},
    {"question": "...", "suggested_answer": "..."}
  ],
  "questions_to_ask": ["Insightful question about the role/company 1", "Question 2", "Question 3"],
  "key_talking_points": ["Specific experience to highlight 1", "Experience 2"],
  "potential_concerns": ["Concern the interviewer might have and how to address it"],
  "company_research_notes": "Key things to know about the company and industry before the interview"
}`

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
      }),
    })

    if (!openaiRes.ok) {
      const err = await openaiRes.json().catch(() => ({}))
      throw new Error(err.error?.message || `OpenAI API error: ${openaiRes.status}`)
    }

    const data = await openaiRes.json()
    const text = data.choices[0].message.content.trim()
    let result
    try { result = JSON.parse(text) } catch {
      const m = text.match(/\{[\s\S]*\}/)
      result = m ? JSON.parse(m[0]) : null
      if (!result) throw new Error('Could not parse AI response')
    }

    const prepText = JSON.stringify(result)
    run(`UPDATE jobs SET interview_prep_ai = ?, updated_at = datetime('now') WHERE id = ?`,
      [prepText, Number(req.params.id)])

    const updated = get('SELECT * FROM jobs WHERE id = ?', [Number(req.params.id)])
    res.json({ ...parseJob(updated), interview_prep_ai: result })
  } catch (err) {
    console.error('Interview prep error:', err)
    res.status(500).json({ error: 'Interview prep failed: ' + err.message })
  }
})

// ── Export Tailored Resume to Word ──

app.get('/api/jobs/:id/export-resume', async (req, res) => {
  const job = get('SELECT * FROM jobs WHERE id = ?', [Number(req.params.id)])
  if (!job) return res.status(404).json({ error: 'Not found' })
  if (!job.tailored_resume) return res.status(400).json({ error: 'No tailored resume to export. Run resume tailoring first.' })

  try {
    const lines = job.tailored_resume.split('\n')
    const children = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        children.push(new Paragraph({ text: '' }))
        continue
      }

      // Detect section headers (ALL CAPS or common headers)
      const isHeader = /^[A-Z][A-Z\s&\/]{2,}$/.test(trimmed) ||
        /^(SUMMARY|EXPERIENCE|EDUCATION|SKILLS|CERTIFICATIONS|PROJECTS|PROFESSIONAL SUMMARY|WORK EXPERIENCE|TECHNICAL SKILLS|PROFESSIONAL EXPERIENCE|OBJECTIVE|PROFILE)$/i.test(trimmed)

      if (isHeader) {
        children.push(new Paragraph({
          children: [new TextRun({ text: trimmed, bold: true, size: 26, font: 'Calibri' })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 80 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '999999' } },
        }))
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: trimmed.replace(/^[-•]\s*/, ''), size: 22, font: 'Calibri' })],
          bullet: { level: 0 },
          spacing: { before: 40, after: 40 },
        }))
      } else {
        // Check if it looks like a job title/company line (bold)
        const isTitleLine = /\d{4}/.test(trimmed) && (trimmed.includes('|') || trimmed.includes('–') || trimmed.includes('-'))
        children.push(new Paragraph({
          children: [new TextRun({
            text: trimmed,
            bold: isTitleLine,
            size: isTitleLine ? 24 : 22,
            font: 'Calibri',
          })],
          spacing: { before: isTitleLine ? 160 : 40, after: 40 },
        }))
      }
    }

    // Add candidate name as title (from resume or fallback)
    const resume = get('SELECT * FROM resume WHERE id = 1')
    const parsed = safeParseJSON(resume?.parsed, {})
    const nameGuess = parsed.summary?.[0] || 'Resume'

    const doc = new Document({
      sections: [{
        properties: {
          page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } },
        },
        children: [
          new Paragraph({
            children: [new TextRun({ text: `Tailored Resume — ${job.company} (${job.role})`, bold: true, size: 20, font: 'Calibri', color: '666666' })],
            alignment: AlignmentType.RIGHT,
            spacing: { after: 200 },
          }),
          ...children,
        ],
      }],
    })

    const buffer = await Packer.toBuffer(doc)

    const filename = `Resume_${job.company.replace(/[^a-zA-Z0-9]/g, '_')}_${job.role.replace(/[^a-zA-Z0-9]/g, '_')}.docx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(Buffer.from(buffer))
  } catch (err) {
    console.error('Export error:', err)
    res.status(500).json({ error: 'Export failed: ' + err.message })
  }
})

// ── Stats ──

app.get('/api/stats', (req, res) => {
  const total = get('SELECT COUNT(*) as count FROM jobs').count
  const byStatus = all('SELECT status, COUNT(*) as count FROM jobs GROUP BY status')
  const avgRow = get('SELECT AVG(match_score) as avg FROM jobs WHERE match_score IS NOT NULL')
  const avgScore = avgRow?.avg ? Math.round(avgRow.avg) : null
  res.json({ total, byStatus, avgScore })
})

// ── Helpers ──

function parseJob(job) {
  return {
    ...job,
    tags: safeParseJSON(job.tags, []),
    requirements_met: safeParseJSON(job.requirements_met, []),
    requirements_partial: safeParseJSON(job.requirements_partial, []),
    requirements_unmet: safeParseJSON(job.requirements_unmet, []),
    resume_improvements: safeParseJSON(job.resume_improvements, []),
  }
}

function safeParseJSON(str, fallback) {
  try { return JSON.parse(str) } catch { return fallback }
}

// ── Start ──

import { startTelegramBot } from './telegram-bot.js'

async function start() {
  await getDb()
  app.listen(PORT, () => {
    console.log(`Job Tracker API running on http://localhost:${PORT}`)
    console.log(OPENAI_API_KEY ? '✓ AI features enabled (OpenAI)' : '⚠ Set OPENAI_API_KEY for AI features')
  })
  startTelegramBot()
}

start()
