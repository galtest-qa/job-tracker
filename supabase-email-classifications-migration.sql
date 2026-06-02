-- Hiring Process Event Detection — email_classifications table
-- Run in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS email_classifications (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 uuid REFERENCES auth.users NOT NULL,
  email_id                text NOT NULL,
  thread_id               text,

  -- Input snapshot (no full body ever; snippet capped at 500 chars)
  from_address            text,
  subject                 text,
  snippet                 text,
  direction               text CHECK (direction IN ('inbound', 'outbound')),
  gmail_labels            text[],
  received_at             timestamptz,

  -- Hiring event classification
  category                text CHECK (category IN (
                            'application_confirmation', 'application_sent',
                            'recruiter_response', 'interview_invite',
                            'interview_scheduled', 'interview_rescheduled',
                            'technical_assignment', 'take_home_assignment',
                            'reference_request', 'salary_discussion',
                            'offer', 'offer_discussion', 'rejection',
                            'follow_up_sent', 'follow_up_received',
                            'networking_outreach', 'other'
                          )),
  confidence              float CHECK (confidence >= 0 AND confidence <= 1),
  confidence_level        text CHECK (confidence_level IN ('high', 'medium', 'low')),
  is_job_related          boolean NOT NULL DEFAULT false,
  priority_score          integer CHECK (priority_score >= 0 AND priority_score <= 100),
  action_type             text CHECK (action_type IN (
                            'none', 'review_email', 'schedule_interview',
                            'submit_assignment', 'reply_to_recruiter',
                            'prepare_for_interview', 'follow_up',
                            'review_offer', 'provide_references',
                            'salary_discussion'
                          )),

  -- Human-readable output (capped at 300 chars each)
  summary                 text,
  reasoning               text,
  important_signals       text[],
  suggested_next_action   text,

  -- Extracted entities
  detected_company        text,
  detected_role           text,
  recruiter_name          text,
  recruiter_email         text,

  -- Flags
  action_required         boolean,
  interview_link_detected boolean,
  deadline_mentioned      boolean,

  -- Structured links [{type, url}]
  links                   jsonb,

  -- Processing metadata (for versioning and replay)
  pre_filtered            boolean NOT NULL DEFAULT false,
  model_used              text,
  classifier_version      text,
  prompt_version          text,
  classified_at           timestamptz DEFAULT now(),

  UNIQUE(user_id, email_id)
);

ALTER TABLE email_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their classifications"
  ON email_classifications
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
