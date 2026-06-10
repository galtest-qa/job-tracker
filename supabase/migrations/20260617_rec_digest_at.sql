-- Track when the last recommendations digest was sent per user
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_rec_digest_at timestamptz;
