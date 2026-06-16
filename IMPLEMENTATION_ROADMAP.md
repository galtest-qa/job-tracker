# Implementation Roadmap: Job Description Requirement

**Objective:** Make job descriptions mandatory for analysis by implementing tiered acquisition strategy.

**Timeline:** 4 weeks, 1 engineer, 96 hours total

---

## Phase 1: Data Layer & Background Enrichment (Weeks 1-2, 40 hours)

### 1.1: Database Migration
**Time:** 8 hours  
**Files:** `supabase/migrations/20260616_analysis_pending_status.sql`

```sql
-- Add enrichment tracking columns
ALTER TABLE jobs ADD COLUMN enrichment_status TEXT DEFAULT 'none';
ALTER TABLE jobs ADD COLUMN enrichment_attempted_at TIMESTAMP;
ALTER TABLE jobs ADD COLUMN enrichment_completed_at TIMESTAMP;
ALTER TABLE jobs ADD COLUMN enrichment_source TEXT;

-- Create audit table
CREATE TABLE job_enrichments (...);

-- Index for query performance
CREATE INDEX idx_jobs_enrichment_status ON jobs(enrichment_status) 
  WHERE enrichment_status = 'pending';
```

**Deployment:** Run migration in Supabase Dashboard

---

### 1.2: Kanban Column Addition
**Time:** 4 hours  
**Files:** `src/lib/columns.js`

Currently:
```javascript
export const FIXED_COLUMNS = [
  { name: 'Backlog', is_default: true },
  { name: 'Want to Apply', order: 2 },
  { name: 'Applied/Waiting', order: 3 },
  { name: 'Interview', order: 4 },
  { name: 'Offer', order: 5 },
  { name: 'Rejected', order: 6 }
];
```

**Do NOT change FIXED_COLUMNS.** Instead, use `enrichment_status` as a transient UI state:
- Job status = "Backlog" + enrichment_status = "pending" → Visual: "Backlog 🔄"
- Job status = "Backlog" + enrichment_status = "completed" → Visual: "Backlog ✓"

**Why:** Avoid migration of existing jobs. Enrichment status is orthogonal to kanban column.

---

### 1.3: Background Enrichment Function
**Time:** 12 hours  
**Files:** `supabase/functions/enrich-job-description/index.ts`

Key steps:
1. Query jobs with `enrichment_status = 'pending'` (newly created Tier 2 jobs)
2. For each job:
   - Extract company slug + role keywords
   - Search matching job on company careers site
   - Fetch full description
   - Update job + set enrichment_status = 'completed'
3. Trigger analysis via `generate-recommendations`

**Helper functions:**
- `searchCompanyCareersForRole(company, role, location)` → Fetch description
- `enhanceDescriptionWithAI(company, role, description)` → AI fallback
- `triggerAnalysis(jobId, userId)` → Call existing function

**Deployment:**
```bash
supabase functions deploy enrich-job-description
```

**Scheduler setup:**
- Run every 5 minutes
- Check for jobs with enrichment_status = 'pending'
- Timeout: 30 seconds per job
- Max 10 jobs per run (avoid queue buildup)

---

### 1.4: API Endpoint Integration
**Time:** 6 hours  
**Files:** `src/api.js`

Add method:
```javascript
export const api = {
  // ... existing methods
  
  // Create job with Tier 2 enrichment pending
  async createJobWithEnrichment(jobData) {
    // jobData: { company, role, location, source_type, url }
    
    // Check if description available (Tier 1)
    if (jobData.description && jobData.description.length > 200) {
      // Direct creation with analysis
      return this.createJob(jobData); // Returns immediately analyzed
    }
    
    // Tier 2: Create with pending status
    const job = await supabase.from('jobs').insert({
      ...jobData,
      description: jobData.description || null,
      enrichment_status: 'pending',
      enrichment_attempted_at: new Date()
    }).select().single();
    
    // Trigger background enrichment
    fetch(`${SUPABASE_URL}/functions/v1/enrich-job-description`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ job_id: job.id, user_id: session.user.id })
    }).catch(err => console.error('Background enrichment queued', err));
    
    return job;
  }
}
```

---

### 1.5: Testing & Monitoring
**Time:** 10 hours

**Unit tests:**
- Career site search: Mock API responses
- Description extraction: Verify text parsing
- AI enhancement: Mock OpenAI response
- Analysis trigger: Verify webhook called

**Integration tests:**
- Create job → Verify enrichment_pending status
- Wait 5 min → Verify enrichment_completed
- Query job → Verify description updated

**Monitoring:**
- CloudWatch logs: Check enrichment function errors
- Supabase metrics: Query performance for enrichment_status index
- Manual test: Create Tier 2 job, wait for background completion

---

## Phase 2: Notifications & UI State (Weeks 2-3, 24 hours)

### 2.1: Job Status UI Component
**Time:** 8 hours  
**Files:** `src/components/JobCard.jsx`, `src/components/JobDetail.jsx`

**Changes:**
```jsx
// Show enrichment_status badge
function JobCard({ job }) {
  const enrichmentIcon = {
    'none': '',
    'pending': '⏳',
    'completed': '✓',
    'failed': '⚠️'
  };
  
  return (
    <div className="job-card">
      <div className="job-card-header">
        <h3>{job.role} @ {job.company}</h3>
        {job.enrichment_status === 'pending' && (
          <span className="enrichment-badge pending">
            {enrichmentIcon.pending} Analyzing...
          </span>
        )}
      </div>
      
      {job.enrichment_status === 'pending' && (
        <div className="enrichment-message">
          <p>🔄 Retrieving job description...</p>
          <p className="muted">This should take less than a minute.</p>
        </div>
      )}
      
      {job.enrichment_status === 'failed' && (
        <div className="enrichment-warning">
          <p>⚠️ We need your help to complete the analysis.</p>
          <button onClick={() => showScreenshotUpload(job.id)}>
            📸 Upload Screenshots
          </button>
        </div>
      )}
      
      {/* Show analysis results only if description available */}
      {job.description && job.enrichment_status !== 'pending' && (
        <div className="job-card-insights">
          <MatchScore score={job.match_score} />
          <InterviewPrep topics={job.interview_prep_topics} />
        </div>
      )}
    </div>
  );
}
```

**CSS additions:**
```css
.enrichment-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
}
.enrichment-badge.pending {
  background: #fef3c7;
  color: #92400e;
  animation: pulse 2s infinite;
}
.enrichment-badge.failed {
  background: #fee2e2;
  color: #991b1b;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
```

---

### 2.2: In-App Notifications
**Time:** 6 hours  
**Files:** `supabase/migrations/20260616_notifications_table.sql`, `src/api.js`

**Database:**
```sql
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  -- 'job_enrichment_needed', 'job_analyzed', 'error'
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action TEXT, -- 'upload_screenshots', 'view_analysis'
  data JSONB,
  read BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);
```

**API method:**
```javascript
async getNotifications() {
  return supabase
    .from('notifications')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('read', false)
    .order('created_at', { ascending: false })
    .limit(20);
}

async dismissNotification(notificationId) {
  return supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);
}
```

**UI component:**
```jsx
// src/components/NotificationBell.jsx
function NotificationBell() {
  const [notifs, setNotifs] = useState([]);
  
  const handleAction = (notif) => {
    if (notif.action === 'upload_screenshots') {
      showScreenshotUpload(notif.data.job_id);
    } else if (notif.action === 'view_analysis') {
      navigateToJob(notif.data.job_id);
    }
    dismissNotification(notif.id);
  };
  
  return (
    <div className="notification-panel">
      {notifs.map(n => (
        <div key={n.id} className="notification-item">
          <div>{n.title}</div>
          <p>{n.body}</p>
          {n.action && (
            <button onClick={() => handleAction(n)}>
              {n.action === 'upload_screenshots' ? '📸 Upload' : '→ View'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

### 2.3: Push Notifications
**Time:** 6 hours  
**Files:** `src/App.jsx`, Service Worker setup

**Implementation:**
- Request push permission on app load
- Store `push_subscription` in user profiles
- Send push when enrichment fails (Tier 3 fallback)

```javascript
// On app load
async function registerPushNotifications() {
  if (!('serviceWorker' in navigator)) return;
  
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: VAPID_PUBLIC_KEY
  });
  
  // Store subscription
  await supabase
    .from('profiles')
    .update({ push_subscription: subscription.toJSON() })
    .eq('id', session.user.id);
}
```

---

## Phase 3: Frontend Integration (Weeks 3-4, 20 hours)

### 3.1: Import Flow Modification
**Time:** 6 hours  
**Files:** `src/components/JobForm.jsx`, `src/api.js`

**Changes:**
```jsx
const handleApplyImport = () => {
  const jobData = {
    company: importedData.company,
    role: importedData.role,
    location: importedData.location,
    description: importedData.description, // May be null
    source_type: importedData.source_type,
    url: importedData.url
  };
  
  // Determine tier
  const hasTierOneSource = ['greenhouse', 'lever'].includes(jobData.source_type);
  const hasTierOneDescription = jobData.description && jobData.description.length > 200;
  
  if (hasTierOneSource && hasTierOneDescription) {
    // Tier 1: Create and analyze immediately
    createJobWithAnalysis(jobData);
  } else {
    // Tier 2: Create with enrichment pending
    createJobWithEnrichment(jobData);
  }
};
```

---

### 3.2: Screenshot Upload & Merge
**Time:** 8 hours  
**Files:** `src/components/ScreenshotUpload.jsx`, `src/api.js`

**Component:**
```jsx
export function ScreenshotUpload({ jobId, onComplete }) {
  const [screenshots, setScreenshots] = useState([]);
  const [merging, setMerging] = useState(false);
  
  const handleAddScreenshot = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setScreenshots([...screenshots, {
        order: screenshots.length + 1,
        data: e.target.result.split(',')[1],
        preview: e.target.result
      }]);
    };
    reader.readAsDataURL(file);
  };
  
  const handleMerge = async () => {
    setMerging(true);
    try {
      const result = await api.mergeJobScreenshots(jobId, screenshots);
      onComplete(result);
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setMerging(false);
  };
  
  return (
    <div className="screenshot-upload">
      <h3>Upload Job Screenshots to Complete Analysis</h3>
      
      <div className="upload-instructions">
        <p>📸 Upload one or more screenshots of the job posting.</p>
        <p className="muted">We'll extract the text and analyze it automatically.</p>
      </div>
      
      <input
        type="file"
        accept="image/*"
        onChange={(e) => handleAddScreenshot(e.target.files[0])}
        disabled={merging}
        multiple
      />
      
      <div className="screenshot-gallery">
        {screenshots.map((ss, i) => (
          <div key={i} className="screenshot-preview">
            <img src={ss.preview} alt={`Screenshot ${i + 1}`} />
            <span className="order">{ss.order}</span>
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
        className="btn btn-primary btn-lg"
      >
        {merging ? 'Processing...' : `Analyze ${screenshots.length} Image${screenshots.length !== 1 ? 's' : ''}`}
      </button>
    </div>
  );
}
```

**API method:**
```javascript
async mergeJobScreenshots(jobId, screenshots) {
  return fetch(`${SUPABASE_URL}/functions/v1/merge-job-screenshots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session.access_token}`
    },
    body: JSON.stringify({
      job_id: jobId,
      user_id: session.user.id,
      screenshots: screenshots
    })
  }).then(r => r.json());
}
```

---

### 3.3: Integration with JobDetail
**Time:** 4 hours  
**Files:** `src/components/JobDetail.jsx`

**Changes:**
```jsx
function JobDetail({ job, onClose }) {
  return (
    <div className="job-detail-panel">
      {job.enrichment_status === 'failed' && (
        <div className="enrichment-alert">
          <h3>Help Complete This Analysis</h3>
          <p>We found {job.company} {job.role}, but couldn't retrieve the full job description.</p>
          <p>Upload a screenshot to unlock:</p>
          <ul>
            <li>✓ Match Score</li>
            <li>✓ Resume Coach</li>
            <li>✓ Interview Prep</li>
          </ul>
          <button
            onClick={() => setShowScreenshotUpload(true)}
            className="btn btn-primary"
          >
            📸 Upload Screenshots
          </button>
        </div>
      )}
      
      {job.enrichment_status === 'pending' && (
        <div className="enrichment-loading">
          <div className="spinner" />
          <p>🔄 Analyzing job details...</p>
          <p className="muted">This usually takes less than a minute.</p>
        </div>
      )}
      
      {job.description && job.enrichment_status !== 'pending' && (
        <>
          {/* Existing JobDetail tabs: Analysis, Resume, Interview Prep, etc. */}
        </>
      )}
      
      {showScreenshotUpload && (
        <ScreenshotUpload
          jobId={job.id}
          onComplete={() => {
            setShowScreenshotUpload(false);
            // Reload job
            refreshJob(job.id);
          }}
        />
      )}
    </div>
  );
}
```

---

### 3.4: Testing & QA
**Time:** 2 hours

- Test Tier 1 flow (Greenhouse) → Immediate analysis
- Test Tier 2 flow (Ashby) → Pending status → Background enrichment → Analysis
- Test Tier 3 flow (enrichment fails) → Notification → Screenshot upload → Analysis
- Test screenshot merge: 2-3 images → Correct OCR merge → Description extracted
- Test mobile: Screenshot upload on iOS/Android

---

## Phase 4: Analytics & Optimization (Week 4, 12 hours)

### 4.1: Enrichment Metrics Dashboard
**Time:** 6 hours  
**Files:** New Supabase view + Frontend dashboard

**Metrics to track:**
```sql
-- View: enrichment_metrics_24h
SELECT
  COUNT(*) as total_jobs,
  SUM(CASE WHEN enrichment_status = 'completed' THEN 1 ELSE 0 END) as enriched_count,
  ROUND(100.0 * SUM(CASE WHEN enrichment_status = 'completed' THEN 1 ELSE 0 END) / COUNT(*), 1) as success_rate,
  AVG(EXTRACT(EPOCH FROM (enrichment_completed_at - created_at))) as avg_enrichment_time_sec,
  enrichment_source,
  created_at::date
FROM jobs
WHERE created_at > now() - interval '24 hours'
GROUP BY enrichment_source, created_at::date;
```

**Frontend dashboard:**
```jsx
// src/pages/EnrichmentMetrics.jsx
function EnrichmentMetrics() {
  return (
    <div className="metrics-dashboard">
      <h2>Job Enrichment Health</h2>
      
      <MetricCard
        title="Success Rate (24h)"
        value="87%"
        target="85%"
        status="✅ On track"
      />
      
      <MetricCard
        title="Avg Time to Analysis"
        value="18 sec"
        target="<30 sec"
        status="✅ Excellent"
      />
      
      <MetricCard
        title="User Assist Rate"
        value="12%"
        target="<15%"
        status="✅ Good"
      />
      
      <div className="chart">
        <h3>Success Rate by Source (Last 7 days)</h3>
        <BarChart
          data={{
            'Greenhouse': 96,
            'Lever': 94,
            'Ashby': 68,
            'Workday': 61,
            'LinkedIn': 38
          }}
        />
      </div>
    </div>
  );
}
```

---

### 4.2: Error Tracking & Alerting
**Time:** 4 hours

**Sentry integration:**
- Track enrichment function errors
- Alert if success rate drops below 70%
- Alert if average time exceeds 60 seconds

**Database monitoring:**
```sql
-- Jobs stuck in 'pending' > 10 minutes
SELECT COUNT(*) FROM jobs
WHERE enrichment_status = 'pending'
AND created_at < now() - interval '10 minutes';

-- Alert if > 5 jobs stuck
```

---

### 4.3: Data Analysis & Reporting
**Time:** 2 hours

**Weekly report:**
- Overall success rate by source
- Average time to analysis by source
- User assist rate trend
- Most common enrichment failures
- Screenshot merge success rate

---

## Deployment Timeline

### Week 1 (Days 1-5)
- Day 1-2: Database migration + enrich function
- Day 3: API integration testing
- Day 4: Deploy to production (with feature flag)
- Day 5: Internal testing

### Week 2 (Days 6-10)
- Day 6-7: Notification system + UI state
- Day 8: Push notification setup
- Day 9: Beta test with 10% users
- Day 10: Monitor enrichment metrics

### Week 3 (Days 11-15)
- Day 11-12: Screenshot upload integration
- Day 13: End-to-end testing
- Day 14: Beta test with 50% users
- Day 15: Monitor time to analysis

### Week 4 (Days 16-20)
- Day 16-17: Analytics dashboard
- Day 18-19: Data analysis & optimization
- Day 20: Full rollout (100% users)

---

## Risk Mitigation

### Risk: Background enrichment delays
**Mitigation:** Set function timeout to 30 sec, use queue with exponential backoff

### Risk: OCR fails for complex job postings
**Mitigation:** Fallback to manual text input, show error message with link to LinkedIn/Greenhouse

### Risk: Users don't upload screenshots
**Mitigation:** Show value proposition upfront (Match Score, Resume Coach icons), send push notification with 7-day reminder

### Risk: Tier 2 enrichment success rate low
**Mitigation:** Monitor by source, add manual training data for common job title variations

---

## Success Criteria

- ✅ 85%+ jobs have description (Tier 1 + 2 + 3)
- ✅ <30 sec average time to analysis
- ✅ <5% enrichment function error rate
- ✅ <15% user assist rate (Tier 3)
- ✅ 80%+ screenshot merge success
- ✅ 40%+ user engagement with notifications
