# Job Description Requirement Design

**Critical Product Rule:** A job is not considered fully imported until a job description is available.

**Success Metric:** Imported AND analyzed jobs (not just created).

**Implications:**
- Job creation ≠ value delivered
- Without description → no Match Score, no Resume Coach, no Interview Prep
- Users need a complete job record, not a stub

---

## Three-Tier Description Acquisition Strategy

### Tier 1: Direct Extraction (Immediate)
**Sources:** Greenhouse, Lever, generic career pages with JSON-LD/structured data  
**When:** At import time (2-5 sec)  
**Status:** Job created → Immediately available for analysis  
**Success Rate:** 95%+

```
User imports Greenhouse job URL
↓
API returns: company, role, location, description (2000+ chars)
↓
Job created in Backlog with full description
↓
AI analysis runs immediately (Match Score, Interview Prep, etc.)
↓
User sees complete job card with insights

Time: 5 seconds
```

---

### Tier 2: Background Enrichment (Automatic)
**Sources:** LinkedIn, Workday, Ashby, generic pages without metadata  
**When:** After job creation (in background)  
**Status:** Job created with "analysis_pending" → Enrichment runs → Auto-triggers analysis when description found  
**Success Rate:** 60-80% (depending on source)

```
User imports LinkedIn job via screenshot
↓
OCR extracts: company="Figma", role="Product Manager"
↓
Job created in Backlog with status="analysis_pending"
↓ (in background)
Enrichment function starts:
  1. Extract company slug: "figma"
  2. Extract role keywords: "product manager"
  3. Search Figma careers: /figma/jobs/product-manager-123
  4. Fetch full job description from careers page
  5. Update job with description
  6. Trigger AI analysis
↓
User returns to app → Job now shows Match Score, Interview Prep
(User took no action after initial import)

Time: 5 sec upload + 10-30 sec background enrichment
```

**Implementation:**
- New job status: `"analysis_pending"` (visual: amber/loading state)
- Background function: `enrich-job-description` (runs in Supabase scheduler)
- Auto-trigger analysis: Once description available, call `generate-recommendations`
- User notification: Badge changes from "⏳ Analyzing..." to "✓ Ready"

---

### Tier 3: User-Assisted Enrichment (Fallback)
**When:** Automatic enrichment fails after 5 minutes  
**Action:** Ask user for help (multi-image screenshot upload)  
**Success Rate:** 90%+ (user provides direct evidence)

```
Job created with: company="Startup Inc", role="Senior Engineer"
Status: "analysis_pending"
↓ (after 5 min background enrichment fails)
User notification:
  "We found the company and role, but couldn't retrieve
   the job description yet."
  
  "Add more details to unlock:
   • Match Score
   • Resume Coach
   • Interview Prep"
  
  [📸 Upload Screenshots]
↓
User uploads 2-3 screenshots of LinkedIn job posting
↓
Multi-image merge:
  Screenshot 1 (header): Company + Role + Location
  Screenshot 2 (description): Full job description
  Screenshot 3 (requirements): Requirements/benefits
↓
OCR combines all text → Creates description
↓
Description added to job → Analysis triggered
↓
Job now fully analyzed

Time: 30 sec (upload 3 screenshots) + 8 sec (OCR merge) + 10 sec (analysis)
```

---

## Architecture: Three-Layer Description Retrieval

```
┌─────────────────────────────────────────────────────┐
│         Import Flow Entry Point                      │
│  (URL, screenshot, or share)                         │
└────────────────────┬────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
   ┌─────────────┐        ┌──────────────┐
   │ Tier 1:     │        │ Tier 1:      │
   │ Direct      │        │ Direct       │
   │ Extraction  │        │ Extraction   │
   │ (URLs)      │        │ (Greenhouse, │
   │             │        │  Lever)      │
   │ Time: 2-5s  │        │              │
   │ Success: 95%│        │ Status: NONE │
   │ Status:     │        │ (analyzed)   │
   │ BACKLOG     │        │              │
   └────┬────────┘        └──────┬───────┘
        │                         │
        │ ✅ Description found    │ ✅ Description found
        │                         │
        ▼                         ▼
    Job fully ready          Job fully ready
    Backlog → Analyzed       Backlog → Analyzed
    immediately              immediately
        │                         │
        └────────────┬────────────┘
                     │
              ┌──────▼──────────────────────────────┐
              │  Job has description & status info  │
              │  Ready for AI analysis              │
              │  ✓ Match Score                      │
              │  ✓ Resume Coach                     │
              │  ✓ Interview Prep                   │
              │  ✓ ATS Analysis                     │
              └─────────────────────────────────────┘
        
        ▼ Different path: No description found
        
   ┌─────────────────────────────────────┐
   │ Tier 2: Background Enrichment       │
   │ (LinkedIn, Workday, Ashby)          │
   │                                     │
   │ Status: ANALYSIS_PENDING (⏳)       │
   │ Time: 10-30 sec in background       │
   │ Success rate: 60-80%                │
   │                                     │
   │ Process:                            │
   │ 1. Extract company + role           │
   │ 2. Search company careers site      │
   │ 3. Fetch full description           │
   │ 4. Update job                       │
   │ 5. Auto-trigger analysis            │
   └────┬────────────────────────────────┘
        │
        ├─ ✅ Description found
        │  └─> Update job → Trigger analysis
        │      Job now: Backlog + Analyzed
        │
        └─ ❌ Description not found (5+ min)
           └─> Job stays in ANALYSIS_PENDING
               User sees notification
               ▼
           ┌─────────────────────────────────┐
           │ Tier 3: User-Assisted           │
           │ (Multi-image screenshot upload) │
           │                                 │
           │ User uploads 2-3 screenshots    │
           │ OCR merges all text             │
           │ Creates description             │
           │ Updates job                     │
           │ Triggers analysis               │
           │                                 │
           │ Time: 30-45 sec user action     │
           │ Success: 90%+                   │
           └────┬────────────────────────────┘
                │
                └─> Job fully analyzed
                    Ready for all features
```

---

## Implementation: Database Changes

### New Job Status
Add `"analysis_pending"` to kanban columns:

```sql
-- supabase/migrations/20260616_analysis_pending_status.sql

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS 
  enrichment_status TEXT DEFAULT 'none';
  -- 'none' (skip enrichment), 'pending' (waiting), 'completed' (done), 'failed' (gave up)

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS 
  enrichment_attempted_at TIMESTAMP;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS 
  enrichment_completed_at TIMESTAMP;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS 
  enrichment_source TEXT;
  -- 'direct', 'background', 'user_screenshot', 'user_manual'

CREATE INDEX idx_jobs_enrichment_status 
  ON jobs(enrichment_status) 
  WHERE enrichment_status = 'pending';

-- Add job_enrichments table for audit trail
CREATE TABLE job_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  attempt_number INT DEFAULT 1,
  source TEXT NOT NULL,
  -- 'background_search', 'user_screenshots', 'user_manual'
  data JSONB,
  -- { screenshots_count, ocr_text, merged_description, etc. }
  success BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

### UI Status Indicator

```javascript
// In JobDetail and KanbanCard:
const enrichmentStatus = {
  'none': { label: '', icon: '' },                    // Not enrichable
  'pending': { label: '⏳ Analysis pending...', icon: '🔄' },
  'completed': { label: '✓ Ready', icon: '✅' },
  'failed': { label: '⚠️ Needs manual input', icon: '⚠️' }
}
```

---

## Implementation: Background Enrichment Function

### Function: `enrich-job-description` (Edge Function)

```typescript
// supabase/functions/enrich-job-description/index.ts

export default async function enrichJob(jobId: string, userId: string) {
  try {
    const job = await db.jobs.findById(jobId);
    
    // Tier 2a: Try automatic career site search
    const description = await searchCompanyCareersForRole(
      job.company,
      job.role,
      job.location
    );
    
    if (description && description.length > 200) {
      // Success: Update job with description
      await db.jobs.update(jobId, {
        description,
        enrichment_status: 'completed',
        enrichment_completed_at: new Date(),
        enrichment_source: 'background_search'
      });
      
      // Auto-trigger analysis
      await triggerAnalysis(jobId, userId);
      
      return { success: true, source: 'background_search' };
    }
    
    // Tier 2b: Fallback to AI extraction (if description is partial but not empty)
    if (job.description && job.description.length > 100) {
      // Partial description exists, enhance with AI
      const enhanced = await enhanceDescriptionWithAI(
        job.company,
        job.role,
        job.description
      );
      
      if (enhanced) {
        await db.jobs.update(jobId, {
          description: enhanced,
          enrichment_status: 'completed',
          enrichment_completed_at: new Date(),
          enrichment_source: 'ai_enhancement'
        });
        
        await triggerAnalysis(jobId, userId);
        return { success: true, source: 'ai_enhancement' };
      }
    }
    
    // Tier 3 trigger: Enrichment failed, ask user for screenshots
    await notifyUserForScreenshots(jobId, userId);
    
    // Mark as failed but keep job in analysis_pending
    await db.jobs.update(jobId, {
      enrichment_status: 'failed',
      enrichment_attempted_at: new Date()
    });
    
    return { success: false, reason: 'requires_user_screenshots' };
    
  } catch (err) {
    console.error(`Enrichment failed for job ${jobId}:`, err);
    return { success: false, reason: 'error', error: err.message };
  }
}

// Helper: Search company careers site for matching job
async function searchCompanyCareersForRole(
  company: string,
  role: string,
  location?: string
): Promise<string | null> {
  try {
    // Try known ATS platforms first
    for (const ats of ['greenhouse', 'lever', 'ashby', 'workday']) {
      const url = buildCareersUrl(company, ats);
      const page = await fetchWithRetry(url, { timeout: 8000 });
      
      const job = matchJobByTitle(page, role, location);
      if (job) {
        return extractDescription(job);
      }
    }
    
    // Fallback: Search generic careers page
    const careersUrl = `https://${company.toLowerCase().replace(/\s+/g, '')}.com/careers`;
    const page = await fetchWithRetry(careersUrl, { timeout: 8000 });
    const job = matchJobByTitle(page, role);
    if (job) {
      return extractDescription(job);
    }
    
    return null;
  } catch {
    return null;
  }
}

// Helper: Enhance partial description with AI
async function enhanceDescriptionWithAI(
  company: string,
  role: string,
  partialDescription: string
): Promise<string | null> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `Complete and enhance this job description for ${role} at ${company}.
          
Current text:
${partialDescription}

Provide a complete, professional job description (500+ words). Fill in missing sections:
- Responsibilities
- Requirements
- Nice to haves
- Benefits

Return ONLY the enhanced description, no commentary.`
        }],
        temperature: 0.7,
        max_tokens: 1500
      })
    });
    
    if (!response.ok) return null;
    const data = await response.json();
    return data.choices[0].message.content;
  } catch {
    return null;
  }
}

// Helper: Notify user to upload screenshots
async function notifyUserForScreenshots(jobId: string, userId: string) {
  const job = await db.jobs.findById(jobId);
  
  // Create notification
  await db.notifications.create({
    user_id: userId,
    type: 'job_enrichment_needed',
    title: `Help complete ${job.company} analysis`,
    body: `We found "${job.role}" at ${job.company}, but need the full description to analyze it.`,
    action: 'upload_screenshots',
    data: { job_id: jobId },
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  });
  
  // Send push notification (if available)
  if (user.push_token) {
    sendPushNotification(user.push_token, {
      title: `Add ${job.company}`,
      body: 'Upload screenshots to unlock Match Score & Resume Coach'
    });
  }
}

// Helper: Trigger analysis once description available
async function triggerAnalysis(jobId: string, userId: string) {
  // Call existing generate-recommendations function
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-recommendations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ job_id: jobId, user_id: userId })
  });
}
```

---

## Implementation: Multi-Image Screenshot Merge

### Function: `merge-job-screenshots` (Edge Function)

```typescript
// supabase/functions/merge-job-screenshots/index.ts

interface MergeRequest {
  job_id: string;
  user_id: string;
  screenshots: { // Array of base64 images
    order: number;
    data: string;
    label?: string; // "header", "description", "requirements"
  }[];
}

export default async function mergeScreenshots(req: MergeRequest) {
  try {
    // Step 1: OCR all images
    const ocrResults = await Promise.all(
      req.screenshots
        .sort((a, b) => a.order - b.order)
        .map((ss) => ocrImage(ss.data))
    );
    
    // Step 2: Merge OCR text
    const mergedText = mergeOCRResults(ocrResults);
    
    // Step 3: Extract structured data
    const extracted = extractJobData(mergedText);
    
    // Step 4: Update job
    const job = await db.jobs.findById(req.job_id);
    
    const updatedJob = {
      ...job,
      company: extracted.company || job.company,
      role: extracted.role || job.role,
      location: extracted.location || job.location,
      description: extracted.description || mergedText,
      enrichment_status: 'completed',
      enrichment_source: 'user_screenshots'
    };
    
    await db.jobs.update(req.job_id, updatedJob);
    
    // Step 5: Trigger analysis
    await triggerAnalysis(req.job_id, req.user_id);
    
    return {
      success: true,
      data: {
        company: updatedJob.company,
        role: updatedJob.role,
        location: updatedJob.location,
        description_length: (updatedJob.description || '').length,
        enrichment_source: 'user_screenshots'
      }
    };
    
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// OCR single image (tesseract.js or Anthropic Vision)
async function ocrImage(base64Data: string): Promise<string> {
  try {
    // Try Anthropic Claude Vision first (more reliable for handwriting, complex layouts)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY'),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [{
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64Data
            }
          }, {
            type: 'text',
            text: 'Extract all text from this job posting screenshot. Return only the raw text, preserving line breaks and structure.'
          }]
        }]
      })
    });
    
    if (!response.ok) throw new Error('Vision API failed');
    const data = await response.json();
    return data.content[0].text;
    
  } catch {
    // Fallback to tesseract.js (client-side, if available)
    return '';
  }
}

// Merge multiple OCR results
function mergeOCRResults(results: string[]): string {
  // Remove duplicates and merge intelligently
  const lines = results
    .flatMap(r => r.split('\n'))
    .map(l => l.trim())
    .filter(l => l.length > 0);
  
  // Deduplicate consecutive lines
  const unique = [];
  for (const line of lines) {
    if (!unique[unique.length - 1] || unique[unique.length - 1] !== line) {
      unique.push(line);
    }
  }
  
  return unique.join('\n');
}

// Extract structured data from merged text
function extractJobData(text: string) {
  const lines = text.split('\n').map(l => l.trim());
  
  return {
    company: extractCompany(lines),
    role: extractRole(lines),
    location: extractLocation(lines),
    description: text // Use full merged text as description
  };
}
```

### Frontend: Multi-Image Upload UI

```jsx
// src/components/ScreenshotUpload.jsx

export function ScreenshotUpload({ jobId, onComplete }) {
  const [screenshots, setScreenshots] = useState([]);
  const [merging, setMerging] = useState(false);
  
  const addScreenshot = async (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setScreenshots([
        ...screenshots,
        {
          order: screenshots.length + 1,
          data: e.target.result.split(',')[1], // base64
          preview: e.target.result
        }
      ]);
    };
    reader.readAsDataURL(file);
  };
  
  const handleMerge = async () => {
    setMerging(true);
    try {
      const result = await api.mergeJobScreenshots(jobId, screenshots);
      onComplete(result);
    } catch (err) {
      alert('Error merging screenshots: ' + err.message);
    }
    setMerging(false);
  };
  
  return (
    <div className="screenshot-upload">
      <h3>Upload Job Description Screenshots</h3>
      
      <div className="upload-area">
        <p>Step 1: Header (Company, Role, Location)</p>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => addScreenshot(e.target.files[0])}
          disabled={merging}
        />
      </div>
      
      <div className="upload-area">
        <p>Step 2: Description (optional — add 1 or more)</p>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => addScreenshot(e.target.files[0])}
          disabled={merging}
          multiple
        />
      </div>
      
      <div className="screenshot-preview">
        {screenshots.map((ss, i) => (
          <div key={i} className="preview-item">
            <img src={ss.preview} alt={`Screenshot ${i + 1}`} />
            <span className="order-badge">{ss.order}</span>
            <button
              onClick={() => setScreenshots(screenshots.filter((_, j) => j !== i))}
              className="btn-remove"
            >×</button>
          </div>
        ))}
      </div>
      
      <button
        onClick={handleMerge}
        disabled={merging || screenshots.length === 0}
        className="btn btn-primary"
      >
        {merging ? 'Merging...' : `Merge & Analyze (${screenshots.length} images)`}
      </button>
    </div>
  );
}
```

---

## Expected Description Acquisition Rates

### By Source

| Source | Tier | Direct Extraction | Background Enrichment | User Assist | Overall Success |
|---|---|---|---|---|---|
| **Greenhouse** | 1 | 95% | — | — | **95%** |
| **Lever** | 1 | 95% | — | — | **95%** |
| **Generic (JSON-LD)** | 1 | 90% | — | — | **90%** |
| **Ashby** | 2 | 20% | 70% | 90% | **86%** |
| **Workday** | 2 | 15% | 65% | 90% | **82%** |
| **LinkedIn** | 2 | 0% | 40% | 90% | **78%** |
| **Generic (no schema)** | 2 | 30% | 50% | 90% | **75%** |

**Weighted average (assuming 35% Greenhouse, 30% LinkedIn, 20% generic, 15% other):**
**Overall success rate: ~85% description acquisition without user screenshots**
**With user screenshots (Tier 3): ~95% success rate**

---

## Implementation Effort Estimates

### Phase 1: Data Layer & Background Job
**Duration:** 2 weeks  
**Effort:** 40 hours

- 8h: Database migration (enrichment_status, job_enrichments table)
- 12h: Background enrichment function (career site search, AI enhancement)
- 8h: Trigger analysis integration
- 8h: Testing & monitoring
- 4h: Documentation

**Dependencies:** None (can start immediately)

---

### Phase 2: User Notification & Tier 3 UI
**Duration:** 1 week  
**Effort:** 24 hours

- 6h: Notification system (in-app badge, push notifications)
- 6h: "Analysis pending" UI state (job card, detail view, kanban status)
- 6h: Multi-image screenshot upload UI
- 4h: Mobile UX refinement
- 2h: Testing

**Dependencies:** Phase 1 complete

---

### Phase 3: Frontend Integration
**Duration:** 1 week  
**Effort:** 20 hours

- 6h: Import flow modification (Tier 2 → analysis_pending)
- 6h: Screenshot merge function integration
- 4h: Error handling & fallbacks
- 4h: Testing & QA

**Dependencies:** Phase 1, Phase 2

---

### Phase 4: Analytics & Monitoring
**Duration:** 3 days  
**Effort:** 12 hours

- 4h: Enrichment success metrics dashboard
- 4h: Description acquisition tracking
- 2h: Alert setup (enrichment failures)
- 2h: Data analysis & reporting

**Dependencies:** Phase 1-3 deployed

---

## Rollout Plan

### Week 1-2: Phase 1 (Backend Ready)
- Database migration
- Background enrichment function deployed
- Testing with internal jobs

### Week 2-3: Phase 2 (Notifications & UI)
- Notification system live
- "Analysis pending" UI visible
- Screenshot upload beta (10% of users)

### Week 3-4: Phase 3 (Full Integration)
- Import flow updated (Tier 2 jobs → analysis_pending)
- Screenshot merge live (25% of users)
- Monitor enrichment success rates

### Week 4+: Phase 4 (Optimization)
- Analytics dashboard deployed
- Fine-tune enrichment logic based on data
- Scale to 100% users

---

## Success Metrics

### Primary KPI: Description Acquisition Rate
**Target:** 85% without user action, 95% with Tier 3  
**Measurement:**
```
= (jobs with description) / (total jobs imported)
Breakdown:
  - Tier 1: 95% (immediate, direct extraction)
  - Tier 2: 70% (background enrichment)
  - Tier 3: 90% (user screenshots)
  - Combined: 85-95%
```

### Secondary KPIs

| Metric | Target | Notes |
|---|---|---|
| Time to analysis | <60 sec (Tier 1), <5 min (Tier 2) | From import to analysis complete |
| User assist rate | <15% | % of jobs requiring Tier 3 |
| Screenshot merge success | 85%+ | % of uploads resulting in valid description |
| Enrichment function latency | <30 sec | Background job completion time |
| User notification engagement | 40%+ | % of users clicking screenshot upload prompt |

---

## Example Flows

### Greenhouse (Tier 1 — Immediate)
```
14:30:00 User imports: https://boards.greenhouse.io/figma/jobs/123
14:30:02 API returns full description
14:30:03 Job created in Backlog
14:30:05 Analysis runs (Match Score, Resume Coach, Interview Prep visible)

✅ Total time: 5 seconds
✅ User action: 1 (paste URL)
✅ Result: Job fully analyzed
```

### Ashby (Tier 2 — Background Enrichment)
```
14:30:00 User uploads screenshot of Ashby job
14:30:05 OCR extracts: company="Figma", role="Product Manager"
14:30:06 Job created with status="analysis_pending"
         UI shows: "⏳ Analyzing... Retrieving job description"
14:30:07 Background enrichment starts:
         - Search figma.com/careers
         - Find "Product Manager" role
         - Fetch full description
14:30:25 Background enrichment complete
         Job updated with description
         Analysis triggered (Match Score, etc.)
14:30:30 User returns to app → Job now fully analyzed

✅ Total time: 30 seconds
✅ User action: 1 (upload screenshot)
✅ Result: Job fully analyzed (automatic)
```

### LinkedIn with Tier 3 Fallback
```
14:30:00 User shares LinkedIn job to Job Maker
14:30:05 Screenshot OCR extracts: company="LinkedIn", role="Product Manager"
14:30:06 Job created with status="analysis_pending"
14:30:07 Background enrichment starts (tries to find on LinkedIn careers site)
14:35:00 Background enrichment fails (LinkedIn bot protection)
         Notification sent: "Help complete LinkedIn analysis"
         Button: [📸 Upload Screenshots]
14:35:30 User taps button, uploads 2 screenshots of job description
14:35:35 OCR merges both screenshots → Creates full description
14:35:40 Job updated → Analysis triggered
14:35:45 User sees complete analysis

✅ Total time: 5:45
✅ User action: 2 (share + upload screenshots)
✅ Result: Job fully analyzed
```

---

## Comparison: Old vs. New

### Old Workflow
```
User imports job → Form shows partial data
User manually types missing fields
User manually pastes description
(5-10 minutes, job stub with no analysis)
```

### New Workflow
```
Tier 1 (Greenhouse, Lever):
  Import → Full data immediately → Analysis runs
  (5 seconds, fully analyzed)

Tier 2 (Ashby, Workday, LinkedIn):
  Import → Background enrichment runs → Job analyzed
  (30 seconds, user takes no action, fully analyzed)

Tier 3 (enrichment failed):
  Import → Background fails → User sees notification
  User uploads screenshots → Job analyzed
  (2-5 minutes, but only if user assists)
```

**Key difference:** Jobs default to "fully analyzed" state unless enrichment explicitly fails. Users are not burdened with manual description entry unless necessary.

---

## Monitoring & Alerting

### Enrichment Health Dashboard
```
Timeline: Last 24 hours

Tier 1 success rate:       95% ✅
Tier 2 success rate:       72% ⚠️ (target: 70%)
Tier 3 engagement rate:    8% (target: <15%)

Average time to analysis:
  - Tier 1: 5.2 sec ✅
  - Tier 2: 28.4 sec ✅
  - Tier 3: 4m 32s ⚠️ (expected)

Failures requiring manual intervention:
  - LinkedIn: 35 jobs ⚠️ (check bot detection)
  - Workday: 12 jobs ✅
  - Generic: 8 jobs ✅

User engagement:
  - Screenshot uploads: 128 (8% of Tier 3 candidates)
  - Average images per upload: 2.1
  - Merge success rate: 94%
```

### Alerts
- Tier 2 success rate drops below 60% → Check enrichment function
- Enrichment function latency > 60 sec → Check API quotas
- User screenshot engagement < 5% → UX issue, review notification messaging
