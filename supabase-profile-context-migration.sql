-- Run this in Supabase SQL Editor
alter table profiles add column if not exists profile_context jsonb default '{}'::jsonb;
