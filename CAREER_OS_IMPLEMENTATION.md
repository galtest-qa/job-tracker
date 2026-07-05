# Career OS Mobile: Implementation Plan

**Shift:** From screen-oriented → workflow-oriented  
**Philosophy:** Career Operating System (proactive, background-visible) not mobile CRM  
**Timeline:** 4 weeks, 1 engineer

---

## Component Architecture (Redesigned)

### Current (Screen-Oriented)
```
App.jsx
├── MobileHomeDashboard.jsx (stats + quick add)
├── JobForm.jsx (create job)
├── KanbanBoard.jsx (browse jobs)
├── JobDetail.jsx (view job)
├── Notifications.jsx (events + notifications)
└── Settings.jsx (account)
```

### New (Workflow-Oriented)
```
App.jsx
├── CareerOSHome.jsx (THE MAIN SCREEN)
│   ├── TodaysFocusSection.jsx (one card, most important)
│   ├── AIRecommendedActionsSection.jsx (3-5 actions)
│   ├── ContinueWhereYouLeftOffSection.jsx (in-progress jobs)
│   ├── RecentActivitySection.jsx (timeline of progress)
│   └── QuickAddBar.jsx (import options)
├── ImportFlowModal.jsx (URL, screenshot, manual)
│   └── ImportProgressIndicator.jsx (visible steps)
├── JobDetailFullScreen.jsx (opened from CareerOS)
├── KanbanBoard.jsx (secondary tab)
└── SettingsScreen.jsx (account)
```

**Key difference:** `CareerOSHome.jsx` is THE destination, not just a dashboard.

---

## Week 1: Career OS Home Foundation (20 hours)

### Day 1-2: CareerOSHome Component (8 hours)
**File:** `src/components/CareerOSHome.jsx`

```jsx
import { useState, useEffect } from 'react'
import { api } from '../api.js'

export default function CareerOSHome({ 
  onImportStart, 
  onJobOpen, 
  onRecommendationClick 
}) {
  const [todaysFocus, setTodaysFocus] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [inProgressJobs, setInProgressJobs] = useState([])
  const [recentActivity, setRecentActivity] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load all Career OS sections
    Promise.all([
      api.getTodaysFocus(),           // Next interview / most urgent task
      api.getRecommendations(),       // AI-generated recommended actions
      api.getInProgressJobs(),        // Jobs with enrichment_status = pending/processing
      api.getRecentActivity()         // Timeline last 7 days
    ]).then(([focus, recs, inProgress, activity]) => {
      setTodaysFocus(focus)
      setRecommendations(recs)
      setInProgressJobs(inProgress)
      setRecentActivity(activity)
      setLoading(false)
    })

    // Subscribe to real-time updates
    // When job analysis completes, update inProgressJobs
    const unsubscribe = api.subscribeToJobUpdates((job) => {
      setInProgressJobs(prev => 
        prev.filter(j => j.id !== job.id) // Remove if complete
      )
    })

    return unsubscribe
  }, [])

  if (loading) return <LoadingState />

  return (
    <div className="career-os-home">
      {/* Section 1: Today's Focus */}
      <TodaysFocusSection
        focus={todaysFocus}
        onOpen={() => onJobOpen(todaysFocus.id)}
      />

      {/* Section 2: AI Recommended Actions */}
      <AIRecommendedActionsSection
        recommendations={recommendations}
        onAction={(rec) => onRecommendationClick(rec)}
      />

      {/* Section 3: Continue Where You Left Off */}
      <ContinueWhereYouLeftOffSection
        jobs={inProgressJobs}
        onJobOpen={onJobOpen}
      />

      {/* Section 4: Recent Activity */}
      <RecentActivitySection
        activity={recentActivity}
      />

      {/* Section 5: Quick Add */}
      <QuickAddBar
        onUrlImport={() => onImportStart('url')}
        onScreenshot={() => onImportStart('screenshot')}
        onManual={() => onImportStart('manual')}
      />
    </div>
  )
}
```

**Subtasks:**
- [ ] Set up component structure + state
- [ ] Implement data loading (all 4 sections)
- [ ] Real-time subscriptions for in-progress jobs
- [ ] Loading state (skeleton screens)
- [ ] Error handling

---

### Day 3: Section Components (6 hours)

#### TodaysFocusSection.jsx
```jsx
export function TodaysFocusSection({ focus, onOpen }) {
  if (!focus) return null

  return (
    <section className="career-os-section today-focus">
      <h2 className="section-title">🎯 TODAY'S FOCUS</h2>
      
      <Card className="focus-card" onClick={onOpen}>
        <div className="focus-card-header">
          {focus.type === 'interview' && '📅 Interview Prep'}
          {focus.type === 'application' && '✉️ Time to Apply'}
          {focus.type === 'followup' && '📞 Follow Up'}
        </div>
        
        <h3>{focus.job_title} @ {focus.company}</h3>
        
        {focus.type === 'interview' && (
          <p>Interview in {focus.days_until} days</p>
        )}
        
        {focus.type === 'application' && (
          <p>Match score: {focus.match_score}%</p>
        )}
        
        <ProgressBar
          current={focus.progress_current}
          total={focus.progress_total}
          label="Progress"
        />
        
        <Button primary onClick={onOpen}>
          {focus.type === 'interview' && '→ Continue Prep'}
          {focus.type === 'application' && '→ Start Application'}
          {focus.type === 'followup' && '→ Draft Email'}
        </Button>
      </Card>
    </section>
  )
}
```

#### AIRecommendedActionsSection.jsx
```jsx
export function AIRecommendedActionsSection({ recommendations, onAction }) {
  if (!recommendations.length) return null

  return (
    <section className="career-os-section ai-recommendations">
      <h2 className="section-title">🤖 AI RECOMMENDED NEXT STEPS</h2>
      
      {recommendations.map(rec => (
        <Card key={rec.id} className="recommendation-card" 
              onClick={() => onAction(rec)}>
          <div className="rec-icon">
            {rec.type === 'cover_letter' && '✏️'}
            {rec.type === 'followup' && '📞'}
            {rec.type === 'new_job' && '🎯'}
            {rec.type === 'interview_prep' && '📚'}
          </div>
          
          <div className="rec-content">
            <h3>{rec.title}</h3>
            <p className="rec-job">{rec.job_title} @ {rec.company}</p>
            <p className="rec-reason">Why: {rec.reason}</p>
            <p className="rec-context">{rec.context}</p>
          </div>
          
          <div className="rec-cta">
            {rec.cta_label} →
          </div>
        </Card>
      ))}
    </section>
  )
}
```

#### ContinueWhereYouLeftOffSection.jsx
```jsx
export function ContinueWhereYouLeftOffSection({ jobs, onJobOpen }) {
  if (!jobs.length) return null

  return (
    <section className="career-os-section continue-where">
      <h2 className="section-title">↻ CONTINUE WHERE YOU LEFT OFF</h2>
      
      {jobs.map(job => (
        <Card key={job.id} className="continue-card" 
              onClick={() => onJobOpen(job.id)}>
          <div className="continue-header">
            <h3>{job.company} {job.role && `— ${job.role}`}</h3>
            <span className="time-ago">{job.created_at_ago}</span>
          </div>
          
          <div className="continue-status">
            <span className="status-label">
              {job.enrichment_status === 'pending' && '⏳ Analysis Running'}
              {job.enrichment_status === 'background' && '⏳ Background Enrichment'}
              {job.enrichment_status === 'complete' && '✅ Complete'}
            </span>
          </div>
          
          <ProgressSteps
            steps={[
              { done: job.text_extracted, label: 'Text extracted' },
              { done: job.company_found, label: 'Company identified' },
              { done: job.role_found, label: 'Role identified' },
              { done: job.matched_to_resume, label: 'Matched to resume' },
              { done: job.recommendations_generated, label: 'Recommendations' }
            ]}
            etaRemaining={job.eta_remaining}
          />
          
          <Button secondary onClick={() => onJobOpen(job.id)}>
            → View Job
          </Button>
        </Card>
      ))}
    </section>
  )
}
```

#### RecentActivitySection.jsx
```jsx
export function RecentActivitySection({ activity }) {
  if (!activity.length) return null

  return (
    <section className="career-os-section recent-activity">
      <h2 className="section-title">📌 RECENT ACTIVITY</h2>
      
      {activity.map(item => (
        <div key={item.id} className="activity-item">
          <span className="activity-icon">
            {item.type === 'job_added' && '📊'}
            {item.type === 'analysis_complete' && '✓'}
            {item.type === 'hiring_event' && '📞'}
            {item.type === 'interview_confirmed' && '✅'}
            {item.type === 'email_sent' && '✉️'}
          </span>
          
          <div className="activity-content">
            <p className="activity-text">{item.text}</p>
            <p className="activity-time">{item.time_ago}</p>
          </div>
        </div>
      ))}
    </section>
  )
}
```

#### QuickAddBar.jsx
```jsx
export function QuickAddBar({ onUrlImport, onScreenshot, onManual }) {
  return (
    <section className="career-os-section quick-add">
      <h2 className="section-title">QUICK ADD</h2>
      
      <div className="quick-add-buttons">
        <Button 
          primary 
          block
          onClick={onUrlImport}
        >
          🔗 Import URL
        </Button>
        
        <Button 
          secondary 
          block
          onClick={onScreenshot}
        >
          📷 Screenshot
        </Button>
        
        <Button 
          ghost 
          block
          onClick={onManual}
        >
          ✏️ Type Manually
        </Button>
      </div>
    </section>
  )
}
```

**Subtasks:**
- [ ] TodaysFocusSection (1 card layout, progress bar)
- [ ] AIRecommendedActionsSection (3-5 cards, reason visible)
- [ ] ContinueWhereYouLeftOffSection (progress steps, ETA)
- [ ] RecentActivitySection (timeline, time-ago)
- [ ] QuickAddBar (3 buttons)

---

### Day 4-5: Styling + Integration (6 hours)

**Create: `src/career-os.css`**

```css
/* Career OS Home Layout */
.career-os-home {
  padding: 1rem;
  padding-bottom: 6rem; /* Space for bottom nav */
}

/* Sections */
.career-os-section {
  margin-bottom: 2.5rem;
}

.section-title {
  font-size: 0.95rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Today's Focus Card */
.focus-card {
  background: var(--surface-hover);
  border: 2px solid var(--primary);
  border-radius: var(--radius);
  padding: 1.25rem;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.focus-card:active {
  transform: scale(0.98);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.focus-card-header {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.focus-card h3 {
  font-size: 1.1rem;
  margin-bottom: 0.25rem;
}

/* Recommendation Cards */
.recommendation-card {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  cursor: pointer;
  transition: border-color 0.2s;
}

.recommendation-card:active {
  border-color: var(--primary);
}

.rec-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.rec-content {
  flex: 1;
}

.rec-content h3 {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.rec-job {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
}

.rec-reason {
  font-size: 0.8rem;
  color: #666;
  font-style: italic;
}

.rec-context {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

.rec-cta {
  font-size: 0.85rem;
  color: var(--primary);
  font-weight: 600;
  flex-shrink: 0;
  align-self: center;
}

/* Continue Where You Left Off */
.continue-card {
  padding: 1rem;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  cursor: pointer;
}

.continue-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.75rem;
}

.continue-header h3 {
  font-size: 0.95rem;
  font-weight: 600;
}

.time-ago {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.status-label {
  display: inline-block;
  font-size: 0.8rem;
  padding: 0.25rem 0.5rem;
  background: var(--surface-hover);
  border-radius: 10px;
  margin-bottom: 0.75rem;
}

/* Progress Steps */
.progress-steps {
  margin-bottom: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.progress-step {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.progress-step.done::before {
  content: '✓';
  color: #10b981;
  font-weight: 700;
}

.progress-step.pending::before {
  content: '○';
  color: var(--text-secondary);
}

.progress-step.pending {
  opacity: 0.6;
}

.eta-remaining {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

/* Recent Activity */
.activity-item {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem;
  border-left: 2px solid var(--border-light);
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.activity-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.activity-content {
  flex: 1;
}

.activity-text {
  margin: 0;
  color: var(--text-primary);
}

.activity-time {
  margin: 0.1rem 0 0 0;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

/* Quick Add */
.quick-add-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* Mobile styles */
@media (max-width: 640px) {
  .career-os-home {
    padding: 1rem 1rem 5rem 1rem; /* Adjust for bottom nav */
  }

  .section-title {
    font-size: 0.9rem;
  }

  .focus-card {
    padding: 1rem;
  }

  .recommendation-card {
    flex-direction: column;
  }

  .rec-cta {
    display: none; /* Tap anywhere on card */
  }
}
```

**Subtasks:**
- [ ] CSS for all sections
- [ ] Touch-friendly spacing (1rem)
- [ ] Buttons ≥ 44px
- [ ] Progress indicators
- [ ] Animation/transition states

---

## Week 2: Import Flow with Visible Progress (16 hours)

### Day 6-7: ImportProgressIndicator (6 hours)
**File:** `src/components/ImportProgressIndicator.jsx`

```jsx
export function ImportProgressIndicator({ job, step, total, message, etaSeconds }) {
  const progress = (step / total) * 100

  return (
    <div className="import-progress">
      <div className="progress-status">
        <span className="step-counter">{step}/{total}</span>
        <span className="progress-message">{message}</span>
      </div>

      <ProgressBar percentage={progress} />

      {etaSeconds && (
        <p className="eta-text">
          Est. {Math.ceil(etaSeconds / 60)} seconds remaining
        </p>
      )}
    </div>
  )
}
```

### Day 8: Updated ImportFlowModal (6 hours)
**File:** `src/components/ImportFlowModal.jsx` (refactored)

**Key change:** Show progress at EVERY step

```jsx
export default function ImportFlowModal({ onJobCreated, onClose }) {
  const [screen, setScreen] = useState('entry')
  const [importProgress, setImportProgress] = useState({
    step: 0,
    total: 5,
    message: '',
    eta: 0
  })

  const handleURLImport = async (url) => {
    setScreen('processing')
    
    try {
      // Step 1: Extract
      setImportProgress({ step: 1, total: 5, message: 'Extracting data...', eta: 2 })
      const extracted = await api.importJobFromUrl(url)
      
      // Step 2: Preview
      setImportProgress({ step: 2, total: 5, message: 'Preparing preview...', eta: 1 })
      setScreen('preview')
      setImportedData(extracted)
      
    } catch (err) {
      setImportError(err.message)
      setScreen('error')
    }
  }

  const handleSaveJob = async () => {
    // Step 3: Create
    setImportProgress({ step: 3, total: 5, message: 'Saving job...', eta: 1 })
    const job = await api.createJobWithEnrichment(importedData)
    
    // Step 4: Analyze (background, but show user)
    setImportProgress({ step: 4, total: 5, message: 'Analyzing against resume...', eta: 5 })
    
    // Step 5: Enrich (background, but show user)
    setImportProgress({ step: 5, total: 5, message: 'Completing background analysis...', eta: 0 })
    
    // Success
    setScreen('success')
    setTimeout(() => {
      onJobCreated(job)
      onClose()
    }, 2000)
  }

  // Render screens with progress indicators
  return (
    <div className="import-modal">
      {screen === 'entry' && <EntryScreen />}
      {screen === 'processing' && (
        <ImportProgressIndicator {...importProgress} />
      )}
      {screen === 'preview' && <PreviewScreen />}
      {screen === 'success' && <SuccessScreen job={importedData} />}
    </div>
  )
}
```

### Day 9: Real-time Progress Updates (4 hours)
**Integrate with backend subscription:**

```javascript
// When job is created with enrichment_pending:
// Subscribe to updates

supabase
  .channel(`enrichment:${jobId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'jobs',
    filter: `id=eq.${jobId}`
  }, (payload) => {
    // Update progress indicator
    setImportProgress({
      step: getProgressStep(payload.new.enrichment_status),
      message: getProgressMessage(payload.new),
      eta: getETA(payload.new)
    })
  })
  .subscribe()
```

---

## Week 3: API & Data Layer (12 hours)

### Update API (`src/api.js`)

**New methods:**
```javascript
api.getTodaysFocus() 
  → Returns: { job, type: 'interview'|'application'|'followup', ... }

api.getRecommendations()
  → Returns: Array of { id, type, job_id, title, reason, cta_label, ... }

api.getInProgressJobs()
  → Returns: Jobs with enrichment_status = 'pending'|'processing'

api.getRecentActivity()
  → Returns: Timeline of events (jobs added, analysis complete, events received)

api.subscribeToJobUpdates(callback)
  → Real-time subscription to job status changes
  → Callback fired when enrichment completes
```

### Database Helpers

**New view: `get_today_focus()`**
```sql
SELECT 
  j.*,
  CASE 
    WHEN ji.interview_date BETWEEN now() AND now() + interval '7 days' 
      THEN 'interview'
    WHEN j.match_score >= 85 AND j.status = 'Backlog'
      THEN 'application'
    WHEN j.last_contact_at < now() - interval '3 days' 
      AND j.status = 'Applied/Waiting'
      THEN 'followup'
    ELSE NULL
  END as focus_type
FROM jobs j
LEFT JOIN job_interviews ji ON j.id = ji.job_id
WHERE j.user_id = $1
  AND (
    j.status != 'Rejected' OR j.status != 'Offer'
  )
ORDER BY focus_priority DESC
LIMIT 1;
```

---

## Week 4: Integration & Testing (12 hours)

### Routing in App.jsx

```jsx
const [view, setView] = useState('home') // 'home' | 'board' | 'coach' | 'settings'
const isMobile = window.innerWidth < 640

if (isMobile) {
  return (
    <>
      {view === 'home' && (
        <CareerOSHome
          onImportStart={(flow) => setShowImportModal(true)}
          onJobOpen={(jobId) => setSelectedJobId(jobId)}
          onRecommendationClick={(rec) => handleRecommendation(rec)}
        />
      )}

      {view === 'board' && (
        <KanbanBoard
          onCardClick={(jobId) => setSelectedJobId(jobId)}
        />
      )}

      {selectedJobId && (
        <JobDetailFullScreen
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
        />
      )}

      {showImportModal && (
        <ImportFlowModal
          flow={importFlow}
          onJobCreated={handleJobCreated}
          onClose={() => setShowImportModal(false)}
        />
      )}

      <BottomNavigation
        activeTab={view}
        onTabChange={setView}
      />
    </>
  )
}
```

---

## API Endpoints Needed

### Existing (modify)
- `POST /import` → Now returns with enrichment_status
- `POST /analyze` → Called on enrichment complete

### New
```
GET /api/today-focus
  Response: { job, focus_type, priority, ... }

GET /api/recommendations
  Response: [{ id, type, job_id, title, reason, cta, context }, ...]

GET /api/in-progress-jobs
  Response: [{ job, progress_step, total_steps, eta_remaining }, ...]

GET /api/recent-activity?days=7
  Response: [{ id, type, text, time_ago }, ...]

WebSocket: /realtime/job/:jobId
  On enrichment_status change
  → { enrichment_status, step, message, eta }
```

---

## Success Metrics: Career OS

### User Perception
- "Job Maker knows what I should do next": **NPS >8** (vs >7 before)
- "The system is helping me": **>85% agree** (vs 75% before)
- "I feel less overwhelmed": **>80% agree** (vs 65% before)

### Engagement (Workflow-Based)
- Actions taken per day: **>2.5** (vs 1.5 before)
- Time in app: **<5 min per session** (focused, not addictive)
- % users who click recommended action: **>60%**

### System Performance
- Time to recommendation: **<5 min** after job creation
- Accuracy of recommendations (user acts): **>70%**
- Background enrichment success: **>85%**

---

## Difference: Before vs After

### BEFORE (Screen-Oriented)
```
"You have 24 jobs"
└── User: "What should I do?"
    └── User scrolls through list
        └── User feels overwhelmed
```

### AFTER (Workflow-Oriented)
```
"Interview at Figma in 3 days — here's your prep"
└── User: "Perfect, that's what I need"
    └── User clicks → Interview Prep
        └── User feels guided and supported
```

---

## Git Commits Timeline

**Week 1:**
```
commit: "career-os: Home component with 5 sections (focus, recommendations, continue, activity, quick-add)"
commit: "career-os: Progress indicators and status tracking"
commit: "career-os: Styling and mobile layout"
```

**Week 2:**
```
commit: "import: Add step-by-step progress visualization"
commit: "import: Real-time subscription updates for background work"
```

**Week 3:**
```
commit: "api: Add getTodaysFocus, getRecommendations, getInProgressJobs endpoints"
commit: "db: New views for recommendation generation and focus prioritization"
```

**Week 4:**
```
commit: "career-os: Full integration with routing and real-time updates"
commit: "career-os: End-to-end testing and bug fixes"
```

---

## Implementation Notes

### Don't Show Metrics
❌ "87% match score" as a primary card  
✅ "87% match — you should apply" as a recommendation

❌ "3 new hiring events" counter  
✅ "Gmail just emailed you about Stripe" as activity

### Do Show Workflow Progress
✅ "Step 3/5: Matching to resume..."  
✅ "Est. 30 seconds remaining"  
✅ "✓ Description retrieved"

### Do Make Background Work Visible
✅ User starts import, system shows "Analysis in progress"  
✅ User can leave, come back, see progress updated  
✅ When done, shows up in recommendations

### Do Prioritize One Action
✅ "Today's Focus" section shows ONE card  
❌ Not a list of 5 options

---

## Outcome

Career OS Mobile is not "a faster way to browse jobs."

**It's a guide that tells users what to do next, shows them the system is working, and celebrates progress.**

When a user opens Job Maker on their phone, they should think:

"What should I do next?"

Not:

"How many jobs do I have?"
