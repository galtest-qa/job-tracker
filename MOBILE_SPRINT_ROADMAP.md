# Mobile Sprint 2 Implementation Roadmap

**Sprint:** 4 weeks  
**Focus:** Mobile entry into system (first 30 seconds)  
**Goal:** Users can create a job in <10 seconds on phone  
**Team:** 1 full-stack engineer (40 hrs/week)

---

## Week 1: Mobile Import Foundation (20 hours)

### Day 1-2: `MobileImportModal.jsx` (8 hours)
**Files to create:** `src/components/MobileImportModal.jsx`

```jsx
// MobileImportModal.jsx
// Purpose: Three-flow import modal optimized for mobile

// Flows:
// 1. URL Import: Paste URL → Auto-extract → Tap Save
// 2. Screenshot: Take photo → OCR → Review → Tap Save
// 3. Manual: Type company + role → Tap Save

// State machine:
// entry → flow_selection
//   ↓
// url_input → extracting → preview → saving → success
// screenshot_input → processing → preview → saving → success
// manual_input → validating → saving → success

// Key props:
// - onJobCreated(job): Called when job saved
// - onClose(): Called when user dismisses

// Exports:
// - <MobileImportModal />
// - Uses api.importJobFromUrl(), api.createJob()

import { useState, useRef } from 'react'
import { api } from '../api.js'

export default function MobileImportModal({ onJobCreated, onClose }) {
  const [screen, setScreen] = useState('entry') // 'entry' | 'url' | 'screenshot' | 'manual' | 'preview' | 'processing' | 'success'
  const [importedData, setImportedData] = useState(null)
  const [formData, setFormData] = useState({ company: '', role: '', location: '' })
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)
  
  // ... (implement three flows)
  
  return (
    <div className="mobile-import-modal">
      {/* Flow: entry → URL flow or screenshot flow or manual flow */}
      {screen === 'entry' && <EntryScreen />}
      {screen === 'url' && <URLInputScreen />}
      {screen === 'screenshot' && <ScreenshotScreen />}
      {screen === 'manual' && <ManualInputScreen />}
      {screen === 'preview' && <PreviewScreen />}
      {screen === 'processing' && <ProcessingScreen />}
      {screen === 'success' && <SuccessScreen />}
    </div>
  )
}
```

**Subtasks:**
- [ ] Set up component structure + state machine
- [ ] Entry screen (3 button options: URL, Screenshot, Manual)
- [ ] URL input screen (paste + search button)
- [ ] Screenshot input screen (camera/gallery options)
- [ ] Manual input screen (company + role fields)
- [ ] Preview screen (show extracted data + edit buttons)
- [ ] Processing screen (spinner + status text)
- [ ] Success screen (confirmation + next action)

**Testing:**
- [ ] All 3 flows navigate correctly
- [ ] Data flows through state properly
- [ ] Callbacks (onJobCreated, onClose) fire correctly

---

### Day 3-4: Mobile Styles (4 hours)
**Files to create:** `src/mobile.css`

```css
/* Mobile-first breakpoints and styles */

@media (max-width: 640px) {
  /* Global mobile styles */
  
  /* Typography: 16px minimum on inputs (prevents iOS zoom) */
  input, textarea, select { font-size: 16px; }
  
  /* Touch targets: 44x44px minimum */
  button, input, a { min-height: 44px; padding: 12px 16px; }
  
  /* Spacing: 1rem on mobile */
  .mobile-import-modal { padding: 1rem; }
  .mobile-import-field { margin-bottom: 1.5rem; }
  
  /* Full-width layouts */
  .mobile-import-input { width: 100%; }
  .mobile-import-button { width: 100%; }
  
  /* Responsive font sizes */
  h1 { font-size: 1.25rem; }
  h2 { font-size: 1.125rem; }
  
  /* No multi-column layouts */
  .form-grid { grid-template-columns: 1fr; }
  
  /* Better spacing */
  gap: 1rem; /* instead of 0.75rem */
}
```

**Subtasks:**
- [ ] Create `mobile.css` with mobile-first breakpoints
- [ ] Touch target audit (44px minimum)
- [ ] Spacing audit (1rem on mobile)
- [ ] Font size audit (16px inputs)
- [ ] Contrast audit (4.5:1 ratio)

**Testing:**
- [ ] Open on actual mobile device (iOS/Android)
- [ ] All buttons are 44px+ tall
- [ ] Spacing is even and 1rem

---

### Day 5: Routing & App Integration (4 hours)
**Files to modify:** `src/App.jsx`, `src/components/JobForm.jsx`

**Changes:**
```jsx
// App.jsx: Detect mobile and route to MobileImportModal

const isMobile = window.innerWidth < 640

// Show MobileImportModal on mobile, JobForm on desktop
return (
  <>
    {isMobile ? (
      <MobileImportModal onJobCreated={handleJobCreated} onClose={handleClose} />
    ) : (
      <JobForm onSave={handleJobCreated} onCancel={handleClose} />
    )}
  </>
)
```

**Subtasks:**
- [ ] Add mobile detection utility: `const isMobile = () => window.innerWidth < 640`
- [ ] Conditionally render MobileImportModal vs JobForm
- [ ] Pass through callbacks (onJobCreated, onClose)
- [ ] Hide desktop-specific components on mobile (e.g., side-by-side layout)
- [ ] Test routing: resize browser, verify component switches

---

### Day 5: Testing (2 hours)
**Deliverables:**
- [ ] Working import flows on phone
- [ ] All buttons touch-friendly
- [ ] No scrolling required for main actions

**Testing Checklist:**
- [ ] On iPhone 12 (393x852px): URL → Save (5 seconds)
- [ ] On Pixel 6 (412x915px): Screenshot → Save (8 seconds)
- [ ] On iPad (768x1024px): Verify tablet layout works
- [ ] Touch targets: All ≥ 44px

---

## Week 2: Job Cards & Dashboard (16 hours)

### Day 6-7: Redesigned JobCard (6 hours)
**Files to modify:** `src/components/KanbanCard.jsx`

**Changes:**
```jsx
// KanbanCard.jsx: Mobile-optimized layout

// Desktop: company @ role | score | badges | action buttons
// Mobile:  ▲ Company
//          → Role
//          ✅ Score (or ⏳ if pending)

// New mobile card layout:
export function KanbanCard({ job, onEdit, onPin }) {
  const isMobile = window.innerWidth < 640
  
  if (isMobile) {
    return (
      <div className="job-card-mobile" onClick={() => onOpen(job)}>
        <div className="job-card-mobile-header">
          <strong>{job.company}</strong>
          <span className="job-card-mobile-badge">
            {job.match_score ? `🎯 ${job.match_score}%` : '⏳ Analyzing...'}
          </span>
        </div>
        <div className="job-card-mobile-role">{job.role}</div>
        <div className="job-card-mobile-meta">
          {job.location && <span>📍 {job.location}</span>}
        </div>
      </div>
    )
  }
  
  // Desktop layout (unchanged)
  return <JobCardDesktop {...props} />
}
```

**Subtasks:**
- [ ] Mobile card: Full-width tap target
- [ ] Mobile card: Score is primary (not secondary)
- [ ] Mobile card: Compact spacing
- [ ] Mobile card: Pin button moved to corner
- [ ] Mobile card: Status badge (✅ / ⏳)
- [ ] Swipe-to-delete (use react-swipeable)

**Testing:**
- [ ] Card fits in viewport (no horizontal scroll)
- [ ] Entire card is tappable (not just title)
- [ ] Pin button works via long-press

---

### Day 8: MobileHomeDashboard (6 hours)
**Files to create:** `src/components/MobileHomeDashboard.jsx`

```jsx
// MobileHomeDashboard.jsx
// Purpose: Mobile home screen with recent jobs + quick stats

// Layout:
// - Quick stats: "24 jobs in Backlog"
// - Quick add: 3 buttons (URL, Screenshot, Manual)
// - Recent jobs: List of last 5 jobs
// - Job count by status

import { useState, useEffect } from 'react'
import { api } from '../api.js'

export default function MobileHomeDashboard({ onCreateJob, onOpenJob }) {
  const [stats, setStats] = useState(null)
  const [recentJobs, setRecentJobs] = useState([])
  
  useEffect(() => {
    api.getStats().then(setStats)
    api.getJobs({ limit: 5, order: 'created_at' }).then(setRecentJobs)
  }, [])
  
  return (
    <div className="mobile-home-dashboard">
      <header className="mobile-home-header">
        <h1>Welcome back!</h1>
        <p>Let's add a job in 10 seconds</p>
      </header>
      
      <section className="mobile-quick-stats">
        <div className="stat-card">
          <div className="stat-number">{stats?.backlog || 0}</div>
          <div className="stat-label">In Backlog</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats?.pending || 0}</div>
          <div className="stat-label">Analyzing</div>
        </div>
      </section>
      
      <section className="mobile-quick-add">
        <button onClick={() => onCreateJob('url')} className="btn btn-primary btn-block">
          🔗 Import from URL
        </button>
        <button onClick={() => onCreateJob('screenshot')} className="btn btn-secondary btn-block">
          📷 Screenshot
        </button>
        <button onClick={() => onCreateJob('manual')} className="btn btn-ghost btn-block">
          ✏️ Type Manually
        </button>
      </section>
      
      <section className="mobile-recent-jobs">
        <h2>Recent Jobs</h2>
        {recentJobs.map(job => (
          <div key={job.id} className="job-card-mobile" onClick={() => onOpenJob(job.id)}>
            {/* Job card */}
          </div>
        ))}
      </section>
    </div>
  )
}
```

**Subtasks:**
- [ ] Quick stats display (backlog count, analyzing count)
- [ ] 3 quick-add buttons
- [ ] Recent jobs list (5 most recent)
- [ ] Styling: Mobile-first, big buttons, clear hierarchy

**Testing:**
- [ ] Stats load correctly
- [ ] Recent jobs appear
- [ ] Buttons navigate to correct flows

---

### Day 9: Bottom Navigation (4 hours)
**Files to create:** `src/components/BottomNavigation.jsx`

```jsx
// BottomNavigation.jsx
// Purpose: Mobile-only bottom tab bar

export default function BottomNavigation({ activeTab, onTabChange }) {
  return (
    <nav className="bottom-navigation">
      <button
        className={`nav-tab ${activeTab === 'home' ? 'active' : ''}`}
        onClick={() => onTabChange('home')}
      >
        🏠 Home
      </button>
      <button
        className={`nav-tab ${activeTab === 'board' ? 'active' : ''}`}
        onClick={() => onTabChange('board')}
      >
        📊 Board
      </button>
      <button
        className={`nav-tab ${activeTab === 'notifications' ? 'active' : ''}`}
        onClick={() => onTabChange('notifications')}
      >
        🔔 Updates
      </button>
      <button
        className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => onTabChange('settings')}
      >
        ⚙️ Settings
      </button>
    </nav>
  )
}

// Styles:
.bottom-navigation {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  display: flex;
  justify-content: space-around;
  border-top: 1px solid var(--border-light);
  background: var(--surface);
  z-index: 100;
}

.nav-tab {
  flex: 1;
  height: 60px;
  border: none;
  background: transparent;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background 0.2s;
}

.nav-tab.active {
  background: var(--surface-hover);
  border-top: 2px solid var(--primary);
}

.nav-tab:active {
  background: var(--surface-active);
}
```

**Subtasks:**
- [ ] Create bottom nav component (5 tabs)
- [ ] Tab styling (44px height minimum)
- [ ] Active state (highlight + border)
- [ ] Integrate with App.jsx (state management)

**Testing:**
- [ ] All 5 tabs clickable
- [ ] Active state shows correctly
- [ ] Content switches when tab changes

---

### Day 10: Testing & Refinement (2 hours)
**Deliverables:**
- [ ] Smooth job browsing on mobile
- [ ] Card taps open detail view
- [ ] Bottom navigation works

---

## Week 3: Mobile Navigation & Routing (12 hours)

### Day 11-12: Mobile JobDetail (6 hours)
**Files to modify:** `src/components/JobDetail.jsx`

**Changes:**
```jsx
// JobDetail.jsx: Full-screen modal on mobile, side panel on desktop

const isMobile = window.innerWidth < 640

if (isMobile) {
  return (
    <div className="mobile-job-detail-fullscreen">
      <header className="mobile-job-detail-header">
        <button onClick={onClose} className="btn-close">← Back</button>
        <h1>{job.role}</h1>
        <div className="job-actions">
          {/* Pin, Edit, More buttons */}
        </div>
      </header>
      
      <TabsContainer tabs={['Overview', 'Resume', 'Interview', 'Events']}>
        {/* Tab content */}
      </TabsContainer>
    </div>
  )
}

// Desktop: side panel (unchanged)
```

**Subtasks:**
- [ ] Full-screen layout on mobile
- [ ] Back button (top-left, large)
- [ ] Tab navigation (swipeable on mobile)
- [ ] All content fit for vertical scrolling
- [ ] Action buttons (pin, edit, more) accessible

---

### Day 13: Route & Flow Integration (3 hours)
**Files to modify:** `src/App.jsx`

**Changes:**
```jsx
// App.jsx: Mobile-specific routing

const [mobileTab, setMobileTab] = useState('home')
const [selectedJobId, setSelectedJobId] = useState(null)
const isMobile = window.innerWidth < 640

return (
  <>
    {isMobile ? (
      <>
        {/* Mobile view */}
        {mobileTab === 'home' && (
          <MobileHomeDashboard
            onCreateJob={(flow) => { /* open modal */ }}
            onOpenJob={(jobId) => setSelectedJobId(jobId)}
          />
        )}
        
        {mobileTab === 'board' && (
          <KanbanBoard
            onCardClick={(jobId) => setSelectedJobId(jobId)}
          />
        )}
        
        {selectedJobId && (
          <JobDetail
            jobId={selectedJobId}
            onClose={() => setSelectedJobId(null)}
          />
        )}
        
        <BottomNavigation
          activeTab={mobileTab}
          onTabChange={setMobileTab}
        />
      </>
    ) : (
      <>
        {/* Desktop view (unchanged) */}
      </>
    )}
  </>
)
```

**Subtasks:**
- [ ] Mobile tab state management
- [ ] Route between home/board/notifications/settings
- [ ] Job detail modal (full-screen on mobile)
- [ ] Back button handling
- [ ] Floating action button (+Add) on mobile

---

### Day 14: End-to-End Testing (3 hours)
**Deliverables:**
- [ ] Complete mobile flow working end-to-end

**Testing Scenarios:**
- [ ] Home → Click recent job → Open detail → Back → Home
- [ ] Home → + Add → URL → Save → Success
- [ ] Board → Click card → Detail → Pin → Back
- [ ] Board → Swipe card → Delete
- [ ] All bottom nav tabs work

---

## Week 4: Polish & Performance (12 hours)

### Day 15-16: Touch Target & Spacing Audit (5 hours)
**Deliverables:**
- [ ] All buttons ≥ 44px
- [ ] All inputs ≥ 44px
- [ ] All spacing ≥ 1rem on mobile

**Audit Checklist:**
- [ ] Home screen: buttons 44px
- [ ] Import modal: input 44px, buttons 44px
- [ ] Job cards: full-width, 1rem margins
- [ ] Bottom nav: 60px height
- [ ] JobDetail: all buttons 44px
- [ ] Touch spacing between elements: ≥ 0.5rem

**Tools:**
- Use browser dev tools to inspect element sizes
- Test on actual devices (iOS, Android)
- Use a 44x44px overlay tool to verify targets

---

### Day 17: Performance & Optimization (3 hours)
**Optimizations:**
- [ ] Lazy load screenshot OCR (only when screenshot tab active)
- [ ] Debounce form inputs (500ms)
- [ ] Cache recent jobs list (5 min TTL)
- [ ] Preload job detail on card hover (desktop) / tap (mobile)

**Profiling:**
- [ ] Chrome DevTools: Measure import modal load time
- [ ] Timeline: Verify 60fps scrolling on job lists
- [ ] Network: Check bundle size increase

---

### Day 18: iOS/Android Testing (3 hours)
**Devices:**
- [ ] iPhone 12 (393x852px) — Safari
- [ ] Pixel 6 (412x915px) — Chrome
- [ ] iPad (768x1024px) — tablet behavior

**Testing:**
- [ ] Touch feels responsive (no lag)
- [ ] Keyboard appears/disappears correctly
- [ ] Safe area respected (notch, home bar)
- [ ] Portrait + landscape modes work
- [ ] Camera/gallery access works (screenshot)

---

### Day 19-20: Bug Fixes & Final Polish (2 hours)
**Final Review:**
- [ ] No console errors
- [ ] All flows work end-to-end
- [ ] Accessibility: Tab through all interactive elements
- [ ] Performance: Page load < 3 seconds on 4G

---

## File Structure (After Sprint 2)

```
src/
├── components/
│   ├── MobileImportModal.jsx       (new)
│   ├── MobileHomeDashboard.jsx     (new)
│   ├── BottomNavigation.jsx        (new)
│   ├── JobForm.jsx                 (modified - desktop only)
│   ├── KanbanCard.jsx              (modified - mobile styles)
│   ├── JobDetail.jsx               (modified - mobile fullscreen)
│   └── KanbanBoard.jsx             (modified - mobile swipe)
├── App.jsx                         (modified - mobile routing)
├── App.css                         (existing)
└── mobile.css                      (new)
```

---

## Git Commits Timeline

**Week 1:** Mobile import foundation
```
commit: "mobile: Import modal foundation (URL, screenshot, manual flows)"
commit: "mobile: Responsive styles and touch targets"
commit: "mobile: Route mobile users to MobileImportModal"
```

**Week 2:** Cards and dashboard
```
commit: "mobile: Redesigned JobCard with score-first layout"
commit: "mobile: MobileHomeDashboard with quick stats and recent jobs"
commit: "mobile: Bottom navigation for mobile"
```

**Week 3:** Navigation and routing
```
commit: "mobile: Full-screen JobDetail on mobile"
commit: "mobile: Complete mobile routing and flow"
commit: "mobile: End-to-end testing and refinement"
```

**Week 4:** Polish
```
commit: "mobile: Touch target and spacing audit"
commit: "mobile: Performance optimizations"
commit: "mobile: iOS/Android testing and bug fixes"
```

---

## Success Metrics (Sprint 2 Complete)

### Time-to-Create
| Flow | Target | Expected |
|---|---|---|
| URL import | <10 sec | 5-6 sec |
| Screenshot | <10 sec | 8-10 sec |
| Manual | <15 sec | 12-15 sec |

### Touch Targets
| Element | Target | Audit Result |
|---|---|---|
| Buttons | ≥ 44px | ✅ |
| Inputs | ≥ 44px | ✅ |
| Spacing | ≥ 1rem | ✅ |

### Performance
| Metric | Target | Expected |
|---|---|---|
| Page load | < 3 sec | < 2 sec |
| Scroll FPS | 60 fps | 58+ fps |
| Import modal open | < 500ms | < 300ms |

### User Feedback
- "Creating a job on my phone is fast and easy" (NPS ≥ 7)
- "Faster than desktop import" (80%+ users)
- "Navigation makes sense" (95%+ users find features)

---

## Risk Mitigation

**Risk:** Mobile CSS breaks desktop view  
**Mitigation:** Use `@media (max-width: 640px)` only; never change desktop in shared CSS

**Risk:** Screenshot OCR too slow  
**Mitigation:** Lazy load OCR library; show "processing" spinner; set 10 sec timeout

**Risk:** Touch targets not big enough in testing  
**Mitigation:** Audit weekly; fix anything < 44px immediately; use browser tools

**Risk:** Users don't know about bottom nav  
**Mitigation:** Highlight bottom nav on first load; tooltip on first tap

---

## Rollout Strategy

**Week 4 Friday:** Deploy to production (feature flag off)  
**Week 5 Monday:** Enable for 10% of iOS users  
**Week 5 Wednesday:** 25% of iOS + Android  
**Week 5 Friday:** 100% all users

**Monitoring:**
- Error rate on mobile imports
- Time-to-create metric trending
- Crash rate on iOS/Android
