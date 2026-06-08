# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Starts Express server (port 3001) + Vite dev server (port 5173) concurrently
npm run build    # Vite production build → dist/
npm start        # Express server only (no Vite)
```

No test runner is configured. No linting is configured.

## Architecture

This is a React 18 + Vite SPA deployed to Vercel, backed by Supabase.

### Two modes: local dev vs. production

**Local dev** (`npm run dev`) runs an Express server (`server.js`) backed by SQLite (`db.js`). All `/api/*` routes proxy from Vite to `localhost:3001`. The Express server also runs a Telegram bot.

**Production (Vercel)** has no Express server. All data goes directly through the Supabase JS client in the browser. `server.js` and `db.js` are not deployed. `vercel.json` is a single SPA rewrite rule.

### Data layer (`src/api.js`)

Single module that exports the `api` object — all Supabase reads/writes and OpenAI calls go through here. It also exports `initUserData()`, which runs once on login to ensure the user's kanban columns match `FIXED_COLUMNS` (migrating old columns if needed).

Columns are defined as a fixed list in `src/lib/columns.js`. Jobs store their column as `status` (a string matching the column name). `STAGE_MAP` maps column names to semantic stages (`pre_apply`, `applied`, `interview`, `terminal`).

### AI calls (`src/lib/openai.js`)

Dual-path: if the user stored a personal OpenAI key (in `profiles.openai_key`), calls go directly to OpenAI from the browser. Otherwise calls go to the `openai-proxy` Supabase Edge Function, which uses a shared server-side key. `getCandidateContext()` (`src/lib/candidateContext.js`) assembles the resume + profile questions into a string injected into every AI prompt.

### Gmail hiring event pipeline

`supabase/functions/gmail-sync/index.ts` is the core:
1. Fetches up to 30 recent Gmail messages via the Gmail API
2. Pre-filters obvious non-job emails (saves OpenAI cost)
3. Classifies remaining emails in batches of 10 using GPT-4o-mini with a strict hiring-event taxonomy
4. Extracts company/role from AI output, email headers, and subject line patterns
5. Matches extracted company to existing jobs using a score-based fuzzy match
6. Writes `email_classifications` rows and `hiring_events` rows to Supabase
7. Server-side throttle: 15 minutes. Client-side debounce: 2 minutes (bypassed by manual sync).

Sync is triggered: on app load, on tab reactivation after 2+ minutes hidden, and manually via the sync button in the header.

### State management

All app state lives in `App.jsx` (jobs, columns, session, hiring events, unread count, popup state, etc.). There is no global state library. `App.jsx` passes callbacks down (`onMoveJob`, `onRefresh`, etc.). Optimistic UI: `moveJob` updates local state immediately, then calls `api.updateJob` and rolls back on error.

### Component layout

- `KanbanBoard` — board view, filters (score, reminder, search), Today's Focus, column drag-drop
- `KanbanCard` — individual card with match score badge, reminder badge, hiring event indicator
- `JobDetail` — side panel with tabs: Analysis, Resume, Interview Prep, Hiring Events, Reminders, Notes/Edit. Tabs are swipeable on mobile. Opened as a slide-in panel from the right with a backdrop.
- `Notifications` — full hiring events list (slide-in panel)
- `HiringEventPopup` — toast popup for high-priority events (priority_score ≥ 70)
- `Settings` — sections: OpenAI key, Gmail integration, Telegram, profile questions, Chrome extension guide
- `FindJobs` — external job search links + AI chat assistant (`JobSearchChat`)

### Supabase Edge Functions

Located in `supabase/functions/`, each is a Deno HTTP handler deployed to Supabase. Key functions:
- `gmail-sync` — classify emails, create hiring events (see above)
- `gmail-auth-init` / `gmail-oauth-callback` — Gmail OAuth flow
- `gmail-recent` — fetch raw recent emails for debug view
- `gmail-fetch-email` — fetch full email body by ID
- `openai-proxy` — shared OpenAI key proxy
- `telegram-check` — cron: sends Telegram reminders for due tasks

Shared utilities in `supabase/functions/_shared/`: `gmail-api.ts`, `email-prefilter.ts`, `hiring-signal-detector.ts`, `crypto-utils.ts` (AES-GCM encryption for stored OAuth tokens).

### Chrome extension

`chrome-extension/` is a Manifest V3 extension that adds a one-click "Save to Job Tracker" button on LinkedIn job pages. It writes directly to Supabase using the anon key stored in extension storage. Load unpacked from Chrome → Extensions → Developer mode.

## Environment variables

```
VITE_SUPABASE_URL        # required
VITE_SUPABASE_ANON_KEY   # required
OPENAI_API_KEY           # local dev only (used by server.js)
TELEGRAM_BOT_TOKEN       # local dev only (used by server.js)
```

Edge Functions read `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INTEGRATION_ENCRYPTION_KEY` from Supabase secrets.

## Deployment

Push to `main` → auto-deploys to Vercel. The app is a pure SPA (no server-side rendering). `@` path alias resolves to `src/`.
