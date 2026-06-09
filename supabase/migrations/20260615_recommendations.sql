-- Recommendation engine: proactive job search suggestions
CREATE TABLE IF NOT EXISTS recommendations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id       uuid REFERENCES jobs(id) ON DELETE CASCADE,
  type         text NOT NULL,
  title        text NOT NULL,
  reason       text,
  priority     int  DEFAULT 50,
  status       text DEFAULT 'active',  -- active | dismissed | acted
  dismissed_at timestamptz,
  acted_at     timestamptz,
  expires_at   timestamptz,
  context      jsonb,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, job_id, type)
);

CREATE INDEX IF NOT EXISTS recommendations_user_status
  ON recommendations(user_id, status);
