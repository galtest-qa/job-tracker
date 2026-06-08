-- Gmail sync health tracking fields on user_integrations
ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS last_successful_sync_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_status         text,
  ADD COLUMN IF NOT EXISTS last_sync_error          text,
  ADD COLUMN IF NOT EXISTS needs_reconnect          boolean DEFAULT false;