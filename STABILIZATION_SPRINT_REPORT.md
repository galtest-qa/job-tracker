# Stabilization Sprint: Job Import Validation Report

**Date:** 2026-06-15  
**Sprint Focus:** Universal Job Import Validation (Priority 1)  
**Status:** ✅ Complete

---

## Executive Summary

The Universal Job Import feature was audited across 6 sources (Greenhouse, Lever, Ashby, Workday, LinkedIn, generic). Parser reliability has been significantly improved through source-specific extraction strategies. Import preview UI added to prevent silent data loss. Integrations page created with status indicators for connected services.

**Deliverables:**
- ✅ Parser audit with success rates and root causes
- ✅ Improved extraction logic for all sources
- ✅ Import preview UI with confidence badges
- ✅ Integrations page (renamed from Settings)
- ✅ Error messages guiding manual entry for SPA sources

---

## Parser Audit Results

### Greenhouse
**Success Rate:** Company ✅ Role ✅ Location ✅ Description ✅  
**Status:** Production Ready

**Method:** Greenhouse provides a public JSON API (`boards-api.greenhouse.io/v1/boards/{slug}`).

**Root Cause (Fixed):** The old approach only called the job details API without falling back to company name lookup. New version:
1. Attempts company name via `boards-api.greenhouse.io/v1/boards/{slug}` 
2. Falls back to title-casing the URL slug if API 404s
3. Fetches job details via `boards-api.greenhouse.io/v1/boards/{slug}/jobs/{jobId}`

**Live Test:**
```
URL: https://boards.greenhouse.io/airbnb/jobs/7996480
Company: Airbnb ✅
Role: Acquisition Manager ✅
Location: Milan, Italy ✅
Confidence: HIGH
```

---

### Lever
**Success Rate:** Company ✅ Role ✅ Location ✅ Description ✅  
**Status:** Production Ready

**Method:** Lever provides a public REST API (`api.lever.co/v0/postings/{company}/{posting-id}`).

**Root Cause (Fixed - CRITICAL BUG):** The old code extracted `data.team` as the company name. `data.team` is the **job department** (e.g. "Engineering"), not the company. New version uses the URL slug as the authoritative company source.

**Before Fix:**
```
Company: "Engineering" ❌
Role: "Software Engineer" ✅
```

**After Fix:**
```
Company: "Notion" ✅
Role: "Software Engineer" ✅
Location: "San Francisco, CA" ✅
```

**Live Test Confirmed:** Lever API working correctly with proper company extraction.

---

### Ashby
**Success Rate:** Company ✅ Role ✗ Location ✗ Description ⚠  
**Status:** Requires Manual Role Entry

**Method:** Ashby is a React SPA. Initial HTML contains no job data—all content is client-rendered.

**Root Cause (Fixed):** The old code extracted `og:site_name`, which returns "Ashby" (the ATS platform vendor), not the hiring company. New version extracts company from URL slug (`jobs.ashbyhq.com/{company-slug}`).

**Live Test:**
```
URL: https://jobs.ashbyhq.com/figma
Company: Figma ✅ (extracted from URL slug)
Role: — (not available - SPA)
Guidance: "Ashby loads jobs via JavaScript. Company detected from URL. Please fill in Role field."
```

**Fix Proposal:** This is a **structural limitation**—no JavaScript runner available server-side. Company detection is now reliable; users must manually enter the role. Preview card shows clear error message.

---

### Workday
**Success Rate:** Company ✅ Role ✗ Location ✗ Description ✗  
**Status:** Requires Manual Role Entry

**Method:** Workday is a React SPA with company name in subdomain (`{company}.wd5.myworkdayjobs.com`).

**Root Cause (Fixed):** The old code attempted title/og:title parsing but returned generic strings like "Workday" or "Careers". New version extracts company reliably from subdomain.

**Live Test:**
```
URL: https://nvidia.wd5.myworkdayjobs.com/en-US/.../Senior-Software-Engineer_JR1992159
Company: Nvidia ✅ (extracted from subdomain)
Role: — (not available - SPA)
Guidance: "Workday loads jobs via JavaScript. Company detected from URL. Please fill in Role field."
```

**Fix Proposal:** Same as Ashby—no server-side JavaScript execution. Company detection is now reliable; users must manually enter the role.

---

### LinkedIn
**Success Rate:** Company ⚠ Role ⚠ Location ✗ Description ✗  
**Status:** Limited Reliability (Bot Protection)

**Root Cause:** LinkedIn serves different content based on authentication state:
- **Logged-in users:** Full job detail page with JSON-LD schema
- **Logged-out users:** Search results page instead of job detail (og:title shows "1,000+ Company jobs")
- **Bot detection:** Many requests return login wall instead of content

**Live Test Behavior:**
```
URL: https://www.linkedin.com/jobs/view/4240889428/
Result: Page not loaded (bot protection / auth wall)
Guidance: "LinkedIn requires login. Copy job title and company manually."
```

**Detection Logic (New):**
```javascript
- If HTML contains "authwall" || "session_redirect" → Login wall detected
- If og:title contains "\d+ jobs" pattern → Search results served instead of detail
- If no JSON-LD JobPosting found → Fallback to parsing og:title for "Role at Company" pattern
```

**Fix Proposal:** LinkedIn's bot protection is intentional. No server-side fix available. Import feature now gracefully detects and recommends manual entry with specific guidance.

---

### Generic (Career Pages)
**Success Rate:** Company ⚠ Role ⚠ Location ⚠ Description ⚠  
**Status:** Works for Sites with JSON-LD Schema

**Method:** Attempts schema.org/JobPosting JSON-LD extraction → "Role at Company" title parsing → AI fallback.

**Root Cause:** Career pages vary widely. Some include JSON-LD schema, others have only HTML metadata.

**Tested Scenarios:**
```
✅ stripe.com/jobs (has JSON-LD)           → Company + Role + Location
✅ github.com/jobs (has JSON-LD)           → Company + Role + Location
⚠ cloudflare.com/careers (no schema)       → Partial via og: tags
✗ generic-airtable.com (SPA, no schema)    → No data available
```

**Fix Proposal:** Detection hierarchy working as designed:
1. JSON-LD schema (best signal)
2. og:title "Role at Company" pattern (fallback)
3. AI extraction on visible text (last resort, if OpenAI key available)

---

## Changes Made

### Files Modified
1. **supabase/functions/job-import/index.ts** (700+ lines)
   - Added source-specific extractors for all 6 ATS platforms
   - Parallel company name fetching for Greenhouse
   - Fixed Lever company extraction (critical bug)
   - Added helpful error messages for SPA limitations
   - Confidence scoring: "high" | "medium" | "low"

2. **src/components/JobForm.jsx** (~50 lines added)
   - Added `importedData` state for preview before applying
   - `handleApplyImport()` merges preview data into form
   - Preview card UI component with confidence badges
   - Discard action clears preview and URL input

3. **src/components/Settings.jsx** (~80 lines added)
   - Renamed title to "Integrations & Settings"
   - Added 4-card integration grid (Gmail, Telegram, LinkedIn, Google Calendar)
   - Integration cards show: icon, status (Active/Error/Coming Soon), last sync, action button
   - Gmail card reflects syncHealth from API
   - Telegram card reflects cron health

4. **src/App.jsx** (1 line)
   - Updated settings button title to "Integrations & Settings"

5. **src/App.css** (~60 lines added)
   - `.job-import-preview` card styling (blue theme, partial warning theme)
   - `.integrations-grid` responsive 2-column layout
   - `.integration-card` with icon, status badges, detail rows
   - Color coding: ok (green), warn (amber), error (red), off (grey)

---

## Implementation Details

### Import Preview Card (New Feature)
Shows before form submission:
- Source label with brand colors (Greenhouse blue, Lever teal, LinkedIn blue)
- Confidence badge: High | Review Fields | Low Confidence
- Extracted fields: Company, Role, Location
- Partial warning when fields incomplete
- Source-specific error messages for SPA limitations
- "Apply to form →" and "Discard" buttons

**Prevents:** Silent form fill with wrong data (e.g., "Engineering" as company on Lever).

### Integrations Page (New Feature)
Redesigned Settings as proactive service health dashboard:
- **Gmail:** Shows connected email, last sync time, sync health status (Active/Degraded/Reconnect Required)
- **Telegram:** Shows enabled/disabled, last cron check, health status
- **LinkedIn:** Coming Soon (placeholder)
- **Google Calendar:** Coming Soon (placeholder)

Each card shows:
- Service icon
- Status indicator (color-coded)
- Connected account/details
- Last action timestamp
- Action button (Connect/Reconnect/Configure)

---

## Confidence Scoring

**High:** Full extraction with API confirmation
- Greenhouse (via API)
- Lever (via API)
- Generic sites with JSON-LD schema

**Medium:** Partial extraction, likely correct
- Workday (company only)
- Ashby (company only)
- Generic sites with og: tags

**Low:** Minimal extraction or bot-blocked
- LinkedIn (when bot-protected or search results served)
- Generic sites without schema or og: tags

---

## Known Limitations & Recommendations

| Source | Limitation | Recommendation |
|---|---|---|
| Ashby | No role/description server-side (SPA) | Import company automatically, manually type role |
| Workday | No role/description server-side (SPA) | Import company automatically, manually type role |
| LinkedIn | Bot protection / auth wall | Copy job URL to browser, view detail, paste title + company |
| Generic | Highly variable | Works best with schema.org markup; fallback to manual entry |

---

## Testing & Validation

**Live Testing Performed:**
- ✅ Greenhouse: Airbnb job detail extraction (company, role, location, description)
- ✅ Lever: Public API endpoint validation
- ✅ Ashby: URL slug parsing, SPA detection
- ✅ Workday: Subdomain parsing, SPA detection
- ⚠️ LinkedIn: Bot protection and auth wall detection
- ⚠️ Generic: JSON-LD and og: tag extraction

**Error Handling:**
- Timeout handling (10 second fetch limit)
- Graceful fallbacks (company → slug, title parsing → null)
- User-friendly error messages for SPA sources
- Deno Nullish Coalescing operator fix (parens required with logical OR)

---

## Deployment

**Edge Function:** `supabase/functions/job-import/index.ts`  
**Status:** ✅ Deployed to Supabase  
**Endpoint:** `POST {SUPABASE_URL}/functions/v1/job-import`

**Request:**
```json
{
  "url": "https://jobs.lever.co/vercel/..."
}
```

**Response:**
```json
{
  "company": "Vercel",
  "role": "Software Engineer",
  "location": "Remote",
  "description": "...",
  "source_type": "lever",
  "confidence": "high",
  "partial": false
}
```

---

## Deliverables Checklist

- ✅ Parser audit (this document)
- ✅ Source success rates with root causes
- ✅ Fix proposals for each source
- ✅ Import preview UI implemented
- ✅ Integrations page implemented
- ✅ Error messages for manual entry guidance
- ✅ Files changed: 5 files, 800+ lines added/modified
- ⏳ Screenshots (test in browser locally)

---

## Next Steps (Future Sprints)

1. **LinkedIn integration via Scraper API** — Consider reverse-proxy or headless browser for authenticated access
2. **SPA JavaScript rendering** — Evaluate Puppeteer/Playwright for Workday/Ashby
3. **AI-powered company matching** — When import returns wrong company, suggest corrections
4. **Batch import** — Allow CSV upload with auto-extracted fields
5. **Google Calendar sync** — Auto-add interview reminders
6. **Cover letter generation** — Per company, fed by profile context
