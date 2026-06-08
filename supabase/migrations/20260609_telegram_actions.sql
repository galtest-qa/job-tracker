-- Telegram action buttons: soft-cancel support
-- Adds cancelled_at to reminders for soft cancel (preserves history, invisible to existing UI)
ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
