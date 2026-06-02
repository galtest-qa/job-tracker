-- Add position_closed and process_cancelled to email_classifications category constraint
-- Run in Supabase Dashboard → SQL Editor

ALTER TABLE email_classifications
  DROP CONSTRAINT IF EXISTS email_classifications_category_check;

ALTER TABLE email_classifications
  ADD CONSTRAINT email_classifications_category_check
  CHECK (category IN (
    'application_confirmation', 'application_sent',
    'recruiter_response', 'interview_invite',
    'interview_scheduled', 'interview_rescheduled',
    'technical_assignment', 'take_home_assignment',
    'reference_request', 'salary_discussion',
    'offer', 'offer_discussion', 'rejection',
    'position_closed', 'process_cancelled',
    'follow_up_sent', 'follow_up_received',
    'networking_outreach', 'other'
  ));
