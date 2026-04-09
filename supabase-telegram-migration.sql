-- Run this in Supabase SQL Editor

-- Add Telegram config to profiles
alter table profiles add column if not exists telegram_bot_token text default '';
alter table profiles add column if not exists telegram_chat_id text default '';
alter table profiles add column if not exists telegram_enabled boolean default false;

-- Track which reminders have been notified
alter table reminders add column if not exists last_notified_at timestamptz;
