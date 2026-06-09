-- Shared company interview profiles (reused across all users, TTL 30 days)
CREATE TABLE IF NOT EXISTS company_interview_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name    text NOT NULL,
  -- Normalized key used for lookups (lower-trimmed)
  company_key     text GENERATED ALWAYS AS (lower(trim(company_name))) STORED,
  profile         jsonb NOT NULL,
  generated_at    timestamptz DEFAULT now(),
  expires_at      timestamptz DEFAULT now() + interval '30 days',
  UNIQUE (company_key)
);

-- Index for the only query pattern we run (point lookup by key + expiry check)
CREATE INDEX IF NOT EXISTS idx_company_profiles_key_expires
  ON company_interview_profiles (company_key, expires_at);

-- RLS: authenticated users can read; any user can upsert (shared knowledge resource)
ALTER TABLE company_interview_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_profiles_select"
  ON company_interview_profiles FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "company_profiles_insert"
  ON company_interview_profiles FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "company_profiles_update"
  ON company_interview_profiles FOR UPDATE
  TO authenticated USING (true);
