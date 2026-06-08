-- Resume Coach: score analysis and ATS keyword tracking per job
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS resume_score  jsonb,
  ADD COLUMN IF NOT EXISTS ats_keywords  jsonb;
