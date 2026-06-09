-- Telegram notification deduplication for hiring events
ALTER TABLE hiring_events
  ADD COLUMN IF NOT EXISTS telegram_notified_at timestamptz;
