ALTER TABLE hiring_events
  ADD COLUMN IF NOT EXISTS extracted_company text,
  ADD COLUMN IF NOT EXISTS extracted_role text,
  ADD COLUMN IF NOT EXISTS extraction_sources text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS match_score integer DEFAULT 0;
