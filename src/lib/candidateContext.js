import { supabase } from './supabase.js'

// Builds a rich candidate profile string for AI prompts
// Combines: profile questions + resume text

export async function getCandidateContext() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'No candidate information available.'

  const parts = []

  // Profile questions
  const { data: profile } = await supabase.from('profiles').select('profile_context').eq('id', user.id).single()
  const ctx = profile?.profile_context || {}

  if (Object.values(ctx).some(v => v)) {
    parts.push('CANDIDATE PROFILE:')
    if (ctx.current_role) parts.push(`Current/Recent Role: ${ctx.current_role}`)
    if (ctx.years_experience) parts.push(`Experience: ${ctx.years_experience}`)
    if (ctx.key_skills) parts.push(`Key Skills: ${ctx.key_skills}`)
    if (ctx.career_goals) parts.push(`Target Roles: ${ctx.career_goals}`)
    if (ctx.strengths) parts.push(`Strengths: ${ctx.strengths}`)
    if (ctx.gaps) parts.push(`Growth Areas: ${ctx.gaps}`)
    if (ctx.preferences) parts.push(`Preferences: ${ctx.preferences}`)
    parts.push('')
  }

  // Resume
  const { data: resume } = await supabase.from('resumes').select('raw_text').eq('user_id', user.id).limit(1).single()
  if (resume?.raw_text?.trim()) {
    parts.push('CANDIDATE RESUME:')
    parts.push(resume.raw_text)
  } else if (parts.length === 0) {
    parts.push('No resume or profile information provided.')
  }

  return parts.join('\n')
}
