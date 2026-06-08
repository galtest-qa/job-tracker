-- Classifier v3: outcome-based classification diagnostics + recommendation engine

-- Signal detection diagnostics on email classifications
ALTER TABLE email_classifications
  ADD COLUMN IF NOT EXISTS detected_signals      jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS winning_signal        text,
  ADD COLUMN IF NOT EXISTS signal_selection_reason text;

-- Recommendation engine + description on hiring events
ALTER TABLE hiring_events
  ADD COLUMN IF NOT EXISTS description           text,
  ADD COLUMN IF NOT EXISTS recommended_action    text,
  ADD COLUMN IF NOT EXISTS recommendation_reason text;
