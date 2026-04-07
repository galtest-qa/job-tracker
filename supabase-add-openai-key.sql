-- Run this in Supabase SQL Editor to add OpenAI key support
alter table profiles add column if not exists openai_key text default '';
