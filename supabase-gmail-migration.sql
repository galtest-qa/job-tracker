-- Gmail integration: user_integrations table
-- Run in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS user_integrations (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 uuid REFERENCES auth.users NOT NULL,
  provider                text NOT NULL,                  -- e.g. 'gmail'
  email                   text,                           -- plain, non-sensitive
  encrypted_access_token  text,                           -- AES-GCM ciphertext (JSON: {iv, ct})
  encrypted_refresh_token text,                           -- AES-GCM ciphertext (JSON: {iv, ct})
  expires_at              timestamptz,
  scopes                  text[],
  connected_at            timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  last_sync_at            timestamptz,
  UNIQUE(user_id, provider)
);

ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their integrations"
  ON user_integrations
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
