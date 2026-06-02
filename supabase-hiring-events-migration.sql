-- Hiring Events — user-facing events derived from email classifications
-- Run in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS hiring_events (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid REFERENCES auth.users NOT NULL,
  email_id          text NOT NULL,
  classification_id uuid REFERENCES email_classifications(id),

  -- Event
  event_type        text NOT NULL,
  title             text NOT NULL,
  priority_score    integer DEFAULT 0,

  -- Job matching
  matched_job_id    uuid REFERENCES jobs(id),
  match_confidence  text CHECK (match_confidence IN ('high','medium','low','none')) DEFAULT 'none',
  match_signals     text[] DEFAULT '{}',
  suggested_stage   text,

  -- User interaction
  status            text DEFAULT 'pending'
                    CHECK (status IN ('pending','reviewed','dismissed','acted')),
  user_action       text,
  acted_at          timestamptz,

  -- Popup control
  popup_shown       boolean DEFAULT false,
  popup_shown_at    timestamptz,

  created_at        timestamptz DEFAULT now(),

  UNIQUE(user_id, email_id)
);

ALTER TABLE hiring_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their hiring events"
  ON hiring_events FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add unread event indicator to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS has_unread_event boolean DEFAULT false;
