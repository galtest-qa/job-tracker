-- Interview Intelligence: per-job profile with stages, prep, and mock tracking
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS interview_profile jsonb;
