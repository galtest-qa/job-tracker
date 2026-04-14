---
name: project_job_tracker
description: Job Tracker app - full stack React + Supabase, deployed on Vercel. GitHub repo and full feature summary.
type: project
---

## Project: Job Tracker
**GitHub:** https://github.com/galtest-qa/job-tracker
**Live:** Deployed on Vercel (connected to GitHub main branch — auto-deploys on push)
**Backend:** Supabase (Postgres + Auth + Edge Functions)

## Stack
- React + Vite frontend
- Supabase (auth, DB, Edge Functions)
- Vercel (hosting, auto-deploy from GitHub)
- OpenAI GPT-4o (via Edge Function proxy OR user's own key in Settings)
- Telegram Bot API (per-user, configured in Settings)
- Chrome Extension (Manifest V3, saves jobs from LinkedIn)

## Features built
- Kanban board with drag-and-drop (columns + cards)
- AI job analysis: match score (0-100), score breakdown, positioning tips
- Resume upload (PDF/DOCX), tailoring, diff viewer (accept/reject per change), export to .docx
- CV builder from structured questions
- Reminder system with Telegram notifications (per-user bot)
- Find Jobs view — links to LinkedIn, Glassdoor, Indeed, Google Jobs, AllJobs, JobMaster, Drushim (Israel) with pre-filled search
- Department + Industry structured fields (replaced free-form tags)
- Reminder filters: Overdue / Today / Next 3 days / Next 7 days (chip in filter bar)
- Clickable overdue/today labels in top summary bar
- Today's Focus section (collapsible) with AI-suggested actions
- Settings: OpenAI key (shared fallback), Telegram config, profile questions, Chrome extension guide

## Key files
- `src/App.jsx` — auth wrapper, routing between views
- `src/api.js` — all Supabase + OpenAI calls
- `src/lib/openai.js` — dual path: personal key → direct, no key → Edge Function proxy
- `src/components/KanbanBoard.jsx` — board, filters, Today's Focus
- `src/components/KanbanCard.jsx` — card with dept/industry pills, reminder badge
- `src/components/JobDetail.jsx` — full job view with tabs
- `src/components/ResumeTab.jsx` — tailored resume + diff + suggestions
- `src/components/ResumeDiff.jsx` — section-aware diff with accept/reject
- `src/components/FindJobs.jsx` — external job search links
- `src/components/Settings.jsx` — OpenAI, Telegram, profile, extension
- `supabase/functions/openai-proxy/` — shared AI key Edge Function
- `supabase/functions/telegram-check/` — cron notification sender
- `chrome-extension/` — LinkedIn one-click save

## DB columns added manually via Supabase SQL editor
```sql
alter table jobs add column if not exists department text default '';
alter table jobs add column if not exists industry text default '';
```
(Run this if not already done)

## How to apply:** Always work in /Users/galamato/job-tracker. Push to main = auto-deploy to Vercel.
