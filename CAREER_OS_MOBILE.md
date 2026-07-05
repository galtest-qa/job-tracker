# Career OS Mobile: Workflow-Oriented Design

**Shift:** From "What screens do we show?" → "What should the user do next?"  
**Philosophy:** Career Operating System (proactive, background actions visible) not Mobile CRM (passive database)

---

## Core Principle: The User Never Waits Alone

Every action the user takes triggers background work **that they can see**.

```
User action          System response
──────────────────────────────────────────
Paste URL         →  ⏳ Importing...
                     [0/4] Extracting data
                     ↓
                     [1/4] Found: Notion, Senior PM
                     ↓
                     [2/4] Analysis pending...
                     ↓
                     ✅ Analysis ready
                     🎯 87% Match Score
                     
User sees progress, not waiting.
```

---

## Career OS Home: "What Should I Do Next?"

**NOT:** "You have 24 jobs in Backlog" (metric)  
**YES:** "Your Interview at Figma is in 3 days — here's your prep" (action)

### Home Layout (Workflow Priority)

```
┌─────────────────────────────────┐
│ Career OS                       │ ← Minimal header
├─────────────────────────────────┤
│                                 │
│ 🎯 TODAY'S FOCUS                │ ← Section 1: What to do TODAY
│ ────────────────────────────    │
│ ┌───────────────────────────┐   │
│ │ Interview Prep: Figma     │   │ ← One card, actionable
│ │ Senior PM Role            │   │
│ │ Interview in 3 days       │   │
│ │                           │   │
│ │ [📖 View Prep Guide]      │   │ ← CTA: continues in-flow
│ └───────────────────────────┘   │
│                                 │
│ 🤖 AI RECOMMENDED NEXT STEPS   │ ← Section 2: What system suggests
│ ────────────────────────────    │
│ ┌───────────────────────────┐   │
│ │ ✅ Apply to: Stripe       │   │ ← Action 1
│ │ You match 91% (cover      │   │
│ │ letter ready)             │   │
│ │ [→ Draft Cover Letter]    │   │
│ └───────────────────────────┘   │
│                                 │
│ ┌───────────────────────────┐   │
│ │ 📞 Follow Up: Google      │   │ ← Action 2
│ │ Last contact: 5 days ago  │   │
│ │ [→ Draft Email]           │   │
│ └───────────────────────────┘   │
│                                 │
│ ┌───────────────────────────┐   │
│ │ 📊 New Job: LinkedIn      │   │ ← Action 3
│ │ Posted 2 hours ago        │   │
│ │ Matches your profile      │   │
│ │ [→ Review & Save]         │   │
│ └───────────────────────────┘   │
│                                 │
│ ↻ CONTINUE WHERE YOU LEFT OFF  │ ← Section 3: In-progress
│ ────────────────────────────    │
│ ⏳ Notion: Analyzing...         │ ← Jobs awaiting analysis
│    Your description being       │
│    matched against resume.      │
│    Est. 2 minutes left.         │
│                                 │
│ ⏳ Figma: Analysis Pending      │ ← Jobs in background
│    Background enrichment        │
│    retrieving full posting.     │
│                                 │
│ 📌 RECENT ACTIVITY             │ ← Section 4: What changed
│ ────────────────────────────    │
│ • You matched 4 new jobs       │ ← Time-based activity
│ • 1 hiring event from Stripe   │
│ • Interview confirmed: Google  │
│                                 │
│ QUICK ADD                       │ ← Section 5: Create new
│ ────────────────────────────    │
│ ┌──────────────┐ ┌──────────┐   │
│ │ [🔗 URL]     │ │ [📷 Pic] │   │
│ │ Import Link  │ │Screenshot│   │
│ └──────────────┘ └──────────┘   │
│                                 │
├─────────────────────────────────┤ ← Bottom nav (fixed)
│ [◀ Focus] [📊 Board] [⚙️ More]  │
└─────────────────────────────────┘
```

**Information Architecture:**
1. **Today's Focus** (1 card max) — Your singular most important task
2. **AI Recommended Actions** (3-5 cards) — Next steps system suggests
3. **Continue Where You Left Off** — Jobs in progress, visible background work
4. **Recent Activity** — Social proof (jobs matched, events created, etc.)
5. **Quick Add** — Lowest friction entry points

**Why this order:**
- User knows what to do immediately (Today's Focus)
- System suggests next steps (AI Recommendations)
- User can monitor background work (Continue)
- User sees progress (Recent Activity)
- User can add new jobs if they want (Quick Add)

---

## Visible Background System: The Career OS Works For You

Every job creation triggers a visible progress sequence.

### Journey 1: URL Import (With Background Enrichment Visible)

```
┌─────────────────────────────────┐
│ 🔗 Import from URL              │
├─────────────────────────────────┤
│                                 │
│ Paste job link:                 │
│ ┌──────────────────────────────┐│
│ │ https://jobs.lever.co/...    ││
│ │ [X]                          ││
│ └──────────────────────────────┘│
│                                 │
│ [Search & Import]               │
│                                 │
└─────────────────────────────────┘
            ↓ (tap Search)
            
┌─────────────────────────────────┐
│ ⏳ Importing from Lever...      │
├─────────────────────────────────┤
│                                 │
│ Step 1/4: Extracting data       │
│ ████████░░ 50%                  │
│                                 │
│ Reading: Company, Role,         │
│ Location from job board...      │
│                                 │
└─────────────────────────────────┘
            ↓ (2 sec)
            
┌─────────────────────────────────┐
│ ✓ Notion: Senior Product Manager│
│ Found!                          │
├─────────────────────────────────┤
│                                 │
│ Step 2/4: Resuming...           │
│ ████████████░░ 75%              │
│                                 │
│ Analyzing against your          │
│ resume for match score...       │
│                                 │
│ This usually takes 5-10         │
│ seconds                         │
│                                 │
└─────────────────────────────────┘
            ↓ (5 sec)
            
┌─────────────────────────────────┐
│ ✓ Job Saved!                    │
├─────────────────────────────────┤
│                                 │
│ Notion: Senior PM               │
│ 🎯 88% Match                    │
│                                 │
│ Step 3/4: Background            │
│ enrichment                      │
│ ████████████░░ 75%              │
│                                 │
│ Fetching full description       │
│ from careers site...            │
│ This runs in background         │
│                                 │
│ Continue to next job (optional) │
│ or [← Back to Home]             │
│                                 │
└─────────────────────────────────┘
            ↓ (user taps Home)
            
┌─────────────────────────────────┐
│ Career OS Home                  │
├─────────────────────────────────┤
│                                 │
│ TODAY'S FOCUS                   │
│ ────────────────────────────    │
│ (No immediate action needed)    │
│                                 │
│ AI RECOMMENDED                  │
│ ────────────────────────────    │
│ (Generated after previous jobs) │
│                                 │
│ CONTINUE WHERE YOU LEFT OFF     │
│ ────────────────────────────    │
│ ⏳ Notion: Analysis ready       │ ← User just created this
│    🎯 88% Match (just updated)  │
│    [→ View Details]             │
│                                 │
│ ⏳ Figma: Still analyzing...    │
│    Enrichment 75% complete      │
│    [🔄 Refresh] [→ View]        │
│                                 │
│ RECENT ACTIVITY                 │
│ ────────────────────────────    │
│ • New job added: Notion         │
│ • Match calculated: 88%         │
│                                 │
└─────────────────────────────────┘

Total time: 7 seconds
User action: 1 (paste URL)
System actions: 4 (extract, analyze, save, enrich)
User experience: "I can see the system working"
```

**Key:** User taps "Import" once. System shows **every step** of what's happening.

---

### Journey 2: Screenshot Upload (Multi-Step Background Work)

```
┌─────────────────────────────────┐
│ 📷 Import from Screenshot       │
├─────────────────────────────────┤
│                                 │
│ Upload job posting screenshot:  │
│ ┌──────────────────────────────┐│
│ │ [📷 Take] [🖼️ Gallery] [📎]   ││
│ └──────────────────────────────┘│
│                                 │
│ Need multiple images?           │
│ You can upload 2-3 for better   │
│ accuracy                        │
│                                 │
└─────────────────────────────────┘
            ↓ (user selects photo)
            
┌─────────────────────────────────┐
│ ⏳ Processing Screenshot...     │
├─────────────────────────────────┤
│                                 │
│ Step 1/5: Reading image         │
│ ████░░░░░░ 20%                  │
│                                 │
│ Extracting text from            │
│ screenshot (OCR)...             │
│                                 │
└─────────────────────────────────┘
            ↓ (3 sec)
            
┌─────────────────────────────────┐
│ ⏳ Processing Screenshot...     │
├─────────────────────────────────┤
│                                 │
│ Step 2/5: Analyzing text        │
│ ████████░░░░░░ 50%              │
│                                 │
│ Extracting company, role,       │
│ location from text...           │
│                                 │
│ Found so far:                   │
│ • Company: Figma                │
│ • Role: Product Manager         │
│                                 │
└─────────────────────────────────┘
            ↓ (2 sec)
            
┌─────────────────────────────────┐
│ ⏳ Processing Screenshot...     │
├─────────────────────────────────┤
│                                 │
│ Step 3/5: Saving job            │
│ ████████████░░░░ 70%            │
│                                 │
│ Creating job in your tracker:   │
│ Figma — Product Manager         │
│                                 │
└─────────────────────────────────┘
            ↓ (1 sec)
            
┌─────────────────────────────────┐
│ ✓ Job Created!                  │
│ Figma: Product Manager          │
├─────────────────────────────────┤
│                                 │
│ Step 4/5: Analyzing against     │
│ your resume                     │
│ ████████████░░░░ 70%            │
│                                 │
│ Calculating match score and     │
│ generating recommendations...   │
│                                 │
│ Upload more screenshots?        │
│ ┌──────────────────────────────┐│
│ │ + Add job description photos ││
│ └──────────────────────────────┘│
│ or                              │
│ [← Back to Home]                │
│                                 │
└─────────────────────────────────┘
            ↓ (5 sec)
            
┌─────────────────────────────────┐
│ ✓ Analysis Ready!               │
│ Figma: Product Manager          │
├─────────────────────────────────┤
│                                 │
│ Step 5/5: Generating            │
│ recommendations                 │
│ ████████████████ 100%           │
│                                 │
│ 🎯 Match Score: 84%             │
│ ✓ Resume Coach: Ready           │
│ ✓ Interview Prep: Ready         │
│                                 │
│ Step 6 (background):            │
│ Sending to Interview Prep and   │
│ Resume Coach systems...         │
│ (You don't need to wait)        │
│                                 │
│ [→ View Full Analysis]          │
│ [← Back to Home]                │
│                                 │
└─────────────────────────────────┘
```

**Key Insight:** 
- Step 5/5 is **not** the end
- Step 6 (background) happens automatically
- User can leave immediately
- System continues working
- Recommendations appear in "AI Recommended" section when ready

---

## "Continue Where You Left Off" Section

This section **actively shows** what the system is doing.

```
CONTINUE WHERE YOU LEFT OFF
────────────────────────────────────────

⏳ Notion (Just created 1 min ago)
   Analysis Running
   ├─ ✓ Text extracted from image
   ├─ ✓ Company + Role identified
   ├─ ⏳ Matching against resume (30 sec remaining)
   └─ ⏳ Generating recommendations
   
   [Cancel] [Refresh] [→ View Job]

⏳ Figma (Created 15 min ago)
   Background Enrichment
   ├─ ✓ Found on careers.figma.com
   ├─ ✓ Full description retrieved
   ├─ ⏳ Analysis in progress (1 min remaining)
   └─ (will auto-update when done)
   
   [→ View Job]

⏳ Google (Created 45 min ago)
   Complete
   ├─ ✓ Full analysis done
   ├─ ✓ Match Score: 91%
   ├─ ✓ Recommendations generated
   └─ ✅ Ready for Interview Prep
   
   [→ Start Interview Prep]

✅ LinkedIn (From yesterday)
   Complete
   ├─ ✓ All analysis done
   ├─ ✓ Match: 78%
   └─ 📌 Marked as "Want to Apply"
   
   [→ View]
```

**User understands:**
- Which jobs are being processed right now
- How far along each is
- When it will be done
- What to do next

---

## AI Recommended Actions (System Knows What's Important)

This section appears once the system has data to recommend.

```
AI RECOMMENDED NEXT STEPS
────────────────────────────────────────

✅ Stripe: Draft Cover Letter Ready
   Job: Senior PM
   Score: 91% match
   Why: High match + you have relevant experience
   
   [→ Start Cover Letter]

📞 Google: Time to Follow Up
   Job: Product Manager
   Last contact: 5 days ago
   Why: No response yet, prime time to re-engage
   
   [→ Draft Follow-Up Email]

🎯 New Job Alert: Figma
   Posted 2 hours ago
   Matches your criteria: PM, Series B+, SF
   Match Score: 87% (preview)
   
   [→ Review & Save]

📚 Interview Prep: Microsoft
   Interview scheduled in 2 days
   Your prep is 60% complete
   
   [→ Continue Prep]

📊 Your Strength: You're strong in PM transitions
   Jobs you match best: Product Manager → Strategy roles
   Recommendation: Expand search to include Strategy Manager
   
   [→ See Strategy Manager Jobs]
```

**User experience:**
- System tells them what to do next (not just "here are all your jobs")
- Each action has reasoning (Why)
- CTAs are contextual and specific

---

## Today's Focus: The Single Most Important Task

```
TODAY'S FOCUS
────────────────────────────────────────

🎯 Interview Prep: Figma (Senior PM)
   Interview in 3 days (July 8)
   
   Progress: 30% complete
   ├─ ✓ Role summary reviewed
   ├─ ✓ Company research done
   ├─ ⏳ Interview scenarios (pending)
   ├─ ⏳ Talking points (pending)
   └─ ⏳ Practice questions (pending)
   
   Time estimate: 25 minutes to complete
   
   [→ Continue Prep]
   
────────────────────────────────────────

If no interview scheduled:
"Review 'AI Recommended Actions' above"
```

**Why single focus?**
- Users are overwhelmed with options
- One clear next step reduces friction
- System prioritizes the most time-sensitive

---

## Recent Activity: Social Proof of Progress

```
RECENT ACTIVITY
────────────────────────────────────────

Today, July 5
  📊 New match: LinkedIn (74% match)
  ✓ Analysis complete
  
Yesterday, July 4
  📊 You added: 3 new jobs from careers pages
  ✓ 2 analyses complete, 1 in progress
  📞 1 hiring event received (from Stripe)
  
July 3
  ✅ Interview confirmed: Google (July 12)
  ✓ Interview prep started
  
July 2
  ✅ Cover letter sent: Microsoft
  📞 Hiring event: Email from recruiter
```

**User feels:** "The system is tracking my progress. I'm making progress."

---

## Mobile Navigation: Activity-Focused, Not Page-Focused

```
┌─────────────────────────────────┐
│ Career OS                       │
├─────────────────────────────────┤
│ (Main content area - workflow)  │
│                                 │
├─────────────────────────────────┤
│ [◀ Focus] [📊 Jobs] [🤖 Coach] │  ← 3 tabs, not 5
│ [⚙️ Settings]                   │
└─────────────────────────────────┘

Tab 1: Focus (Today's Focus + Recommendations)
  - Where you are in your job search journey
  - Next immediate action
  - Progress on interviews/applications

Tab 2: Jobs (Browse all jobs)
  - Kanban view
  - Search
  - Filter by status/score

Tab 3: Coach (Resume Coach + Interview Prep)
  - In-progress prep sessions
  - Coaching notes
  - Practice

Tab 4: Settings (Account + integrations)
  - Email settings
  - Gmail sync status
  - LinkedIn connection
  - Resume upload
```

**Why 3-4 tabs instead of 5?**
- Reduce cognitive load
- Focus tab is primary (answers "what should I do?")
- Jobs tab is secondary (browse/manage)
- Coach tab is supportive (active interview prep)

---

## Implementation: Component Restructure

### New Component: `CareerOSHome.jsx`
Replaces `MobileHomeDashboard.jsx` and `JobForm.jsx` on mobile

**Sections:**
1. `<TodaysFocusSection />` — One card, most important
2. `<AIRecommendedSection />` — 3-5 actionable cards
3. `<ContinueWhereYouLeftOff />` — In-progress jobs with progress bars
4. `<RecentActivitySection />` — Timeline of user progress
5. `<QuickAddBar />` — Three import options

**State:**
```javascript
const [todaysFocus, setTodaysFocus] = useState(null)        // job or task
const [recommendations, setRecommendations] = useState([])  // array of actions
const [inProgressJobs, setInProgressJobs] = useState([])    // jobs being analyzed
const [recentActivity, setRecentActivity] = useState([])    // timeline
```

**Data flow:**
```
on Mount:
  → fetch today's focus (highest priority task)
  → fetch recommendations (AI generated)
  → fetch in-progress jobs (enrichment_status = pending/processing)
  → fetch recent activity (last 7 days)

on Job Creation:
  → Add to in-progress jobs section
  → Show progress step-by-step
  → Remove when complete
  → Update recommendations

on Background Enrichment Complete:
  → Update progress bar in "Continue"
  → Move to "Recent Activity"
  → Trigger recommendations re-fetch
```

### Modified: Progress Bar Component

```jsx
<JobProgressIndicator job={job} />

// Displays:
// ⏳ Notion (1 min ago)
//    Analysis Running
//    ├─ ✓ Text extracted
//    ├─ ✓ Company identified
//    ├─ ⏳ Matching to resume (30 sec left)
//    └─ ⏳ Generating recommendations
```

### Modified: Recommendation Card

```jsx
<RecommendationAction 
  type="cover_letter_ready"
  job={job}
  reason="91% match + you have relevant experience"
  cta={{ label: "Start Cover Letter", action: () => {} }}
/>
```

---

## Workflows Redesigned (Visible Background Work)

### Workflow 1: URL Import
```
Paste URL
  ↓
Import in progress (show all steps)
  1. Extracting data from URL
  2. Finding company + role
  ↓
Job saved (show success)
  ↓
Analysis in progress (background, optional continue)
  3. Matching to resume
  4. Generating recommendations
  5. Sending to Coach systems
  ↓
Go to Home
  User sees job in "Continue" section with progress
  When done, moves to "AI Recommended"
  ↓
User reviews recommendation
  ↓
Take action (apply, prep, follow up)
```

### Workflow 2: Screenshot Import
```
Upload screenshot
  ↓
Processing (show all steps)
  1. Reading image (OCR)
  2. Extracting company + role
  3. Saving job
  ↓
Job saved (show success)
  ↓
Analysis in progress (background)
  4. Matching to resume
  5. Generating recommendations
  ↓
Option: Upload more screenshots (for better description)
  ↓
Go to Home
  User sees job in "Continue" with step-by-step progress
  Can refresh to see updates in real-time
```

### Workflow 3: Background Enrichment (User Not Waiting)
```
Job created without full description
  ↓
Analysis Pending status in "Continue" section
  Progress: "Fetching full job description"
  ETA: "2-3 minutes"
  ↓
User can navigate away immediately
  ↓
Background enrichment runs
  - Searches company careers site
  - Fetches full description
  - Adds to job record
  ↓
Notification when ready
  Or user sees it in "Continue" section when they return
  Progress bar updates: "✓ Description retrieved"
  ↓
Analysis starts automatically
  ↓
Recommendations appear in "AI Recommended" section
```

---

## Career OS vs CRM Mentality

### CRM Mentality (DON'T DO THIS)
```
"You have 24 jobs"
"87% match score"
"3 new hiring events"
"Dashboard metrics"

Focus: Data tracking
User experience: Passive observation
```

### Career OS Mentality (DO THIS)
```
"Your interview at Figma is in 3 days — here's your prep"
"Stripe matches 91%, cover letter ready to draft"
"Google just emailed — 5 days since you applied"
"3 new opportunities that match your goals"

Focus: Guided action
User experience: Proactive assistance
```

---

## Success Metrics (Career OS Home)

### Engagement (Workflow)
- % users who take recommended action within 1 hour: **>50%**
- Average actions completed per day: **>2**
- Time spent in app: **<5 min per session** (efficient, not addictive)

### Perception
- "Job Maker knows what I should do next": **NPS >8**
- "The system is helping me": **>80% agreement**
- "I feel less overwhelmed": **>75% agreement**

### System Performance
- Time from job creation to recommendation: **<10 min**
- Accuracy of recommendations (user acts on them): **>60%**
- Background enrichment success rate: **>85%**

---

## No More Dashboard Thinking

**Remove:**
- ❌ "You have 24 jobs" counter
- ❌ "Application pipeline" chart
- ❌ "Time in each stage" metrics
- ❌ "Jobs by source" breakdown

**Replace with:**
- ✅ "Today's Focus" (singular)
- ✅ "AI Recommended Actions" (3-5 guided next steps)
- ✅ "Continue Where You Left Off" (progress on in-flight tasks)
- ✅ "Recent Activity" (proof of progress)

**Philosophy:** Career OS makes the user the protagonist, not a data point.
