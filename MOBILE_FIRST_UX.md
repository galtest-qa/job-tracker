# Sprint 2: Mobile First UX Design

**Ownership:** Mobile entry into the system (first 30 seconds)  
**Target:** User can create a job in <10 seconds on phone  
**Focus:** Import experience, job creation, cards, navigation

---

## Current State Audit

### Problems Identified

**Desktop-First Architecture:**
- Form designed for wide screens (8+ fields visible)
- Side panel navigation (JobDetail slides from right) → doesn't work on mobile
- Top header navigation (Settings, Notifications buttons) → hard to tap on phone
- Small buttons throughout (btn-sm) → poor touch targets (< 44px)
- 16 media queries total → minimal mobile support

**Import Experience:**
- URL input + button on same row → button too small on mobile
- Preview card shows all fields at once → scrolling required
- "Apply to form" requires scrolling to see button
- No screenshot import visible on mobile

**Form Friction:**
- 8 visible fields (Company, Role, Link, Source, Department, Industry, Description, Status)
- Description textarea → 10 lines of height → massive scrolling
- Optional fields (Company Info, Contact, Notes) all visible → more scrolling
- Required validation on Company + Role → if missing, no validation UX

**Job Cards:**
- Small spacing (0.75rem gaps)
- Low visual hierarchy (role ≈ company size)
- Small CTA (edit, pin buttons) → hard to tap
- No quick-add action from card view

---

## Mobile-First Strategy

### Principle 1: Mobile Entry, Not Adaptation
Desktop users → Go to browser → Full form  
Mobile users → Quick import → 10 seconds → Done

**Not:** "Make desktop form responsive"  
**Yes:** "Create mobile-specific entry point"

### Principle 2: Progressive Disclosure
Show only what's needed to create a job:
1. Import URL (or screenshot)
2. Company + Role (auto-filled or quick-type)
3. Save
4. Everything else (optional fields) → opened on demand

### Principle 3: Touch-First Design
- 44px minimum touch targets (Apple HIG)
- Full-width buttons
- One action per screen
- Avoid hover states (no :hover on mobile)

---

## Mobile Import Experience (Complete Redesign)

### Home Screen: Entry Points (2 sec)

```
┌─────────────────────────────┐
│ Job Maker                   │ ← Top fixed header (minimal)
├─────────────────────────────┤
│                             │
│ ┌─────────────────────────┐ │
│ │                         │ │
│ │  Hi Sarah, let's add    │ │ ← Greeting (optional)
│ │  a job in 10 seconds 🚀 │ │
│ │                         │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ Backlog: 24 jobs ▶     │ │ ← Quick link to board
│ └─────────────────────────┘ │
│                             │
│ Quick Add (3 options)       │
│ ────────────────────────    │
│                             │
│ ┌────────────┐ ┌─────────┐ │
│ │ [🔗 URL]   │ │[📸 Pic] │ │ ← Two main actions
│ │ Paste link │ │Screenshot│ │ ← Text label
│ └────────────┘ └─────────┘ │
│                             │
│ ┌──────────────────────────┐│
│ │ [✏️ Manual]              ││ ← Fallback
│ │ Type from scratch        ││
│ └──────────────────────────┘│
│                             │
├─────────────────────────────┤
│ My Jobs (recent)            │
│ ─────────────────────────── │
│                             │
│ ┌──────────────────────────┐│
│ │ Senior PM @ Figma        ││ ← Recent jobs (quick access)
│ │ 📍 San Francisco, CA     ││
│ │ ⏳ Analysis pending      ││
│ └──────────────────────────┘│
│                             │
│ ┌──────────────────────────┐│
│ │ Product Manager @ Google ││
│ │ 📍 Remote               ││
│ │ ✅ 87% Match            ││
│ └──────────────────────────┘│
│                             │
├─────────────────────────────┤ ← Bottom tab bar
│ [🏠 Home] [🔍 Board] [⚙️]  │
└─────────────────────────────┘
```

**Design Rationale:**
- Two dominant buttons: URL (primary) + Screenshot (secondary)
- Recent jobs visible → Users can check status of pending jobs
- Bottom navigation → Easy thumb reach
- No scrolling required for main actions

---

### Flow 1: URL Import (5 seconds)

```
┌─────────────────────────────┐
│ Add Job from URL            │ ← Title
├─────────────────────────────┤
│                             │
│ Paste job URL:              │ ← Label
│ ┌─────────────────────────┐ │
│ │ https://jobs.lever.co/  │ │ ← Input (autofocus)
│ │ [X]                     │ │ ← Clear button (mobile UX)
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │  Search & Auto-Fill     │ │ ← Big button (44px+)
│ └─────────────────────────┘ │
│                             │
│ ✓ Import from LinkedIn      │ ← Helpful examples
│ ✓ Import from Greenhouse    │
│ ✓ Import from Lever         │
│ ✓ Or any career page        │
│                             │
│ [Close ✕]                  │ ← Dismiss (top-left close)
│                             │
└─────────────────────────────┘
                ↓ (user pastes URL + taps Search)
                
        ⏳ Searching... (loading state)
        "Extracting company, role, location..."
        
                ↓ (2 sec)
                
┌─────────────────────────────┐
│ ✓ Found: Lever Job          │
├─────────────────────────────┤
│                             │
│ Company:                    │
│ ┌─────────────────────────┐ │
│ │ Notion                  │ │ ← Prefilled
│ └─────────────────────────┘ │
│                             │
│ Role:                       │
│ ┌─────────────────────────┐ │
│ │ Senior Product Manager  │ │ ← Prefilled
│ └─────────────────────────┘ │
│                             │
│ Location:                   │
│ ┌─────────────────────────┐ │
│ │ San Francisco, CA       │ │ ← Prefilled
│ └─────────────────────────┘ │
│                             │
│ ⓘ Description will be      │
│   analyzed when you save    │
│                             │
│ ┌─────────────────────────┐ │
│ │  ✓ Save Job             │ │ ← Primary CTA (44px+)
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │  ← Back to Edit         │ │ ← Secondary
│ └─────────────────────────┘ │
│                             │
└─────────────────────────────┘
            ↓ (user taps Save)
            
        ✅ Job saved!
        
        "Analyzing job details..."
        ⏳ Analysis pending
        
        View in 10 seconds → [✓ Open Job]
```

**Time Breakdown:**
- 0-2 sec: User pastes URL, taps Search
- 2-5 sec: Extraction + preview loads
- 5-7 sec: User reviews + taps Save
- 7-10 sec: Job saved, notification shown

**Mobile Optimizations:**
- Full-width input + button (no side-by-side)
- Clear button on input (easier than selecting all + delete)
- Big buttons (44px minimum height)
- Minimal scrolling (4 fields fit in viewport)
- No optional fields shown initially

---

### Flow 2: Screenshot Import (8-10 seconds)

```
┌─────────────────────────────┐
│ Add Job from Screenshot     │
├─────────────────────────────┤
│                             │
│ Step 1: Upload Screenshots  │
│ ────────────────────────    │
│                             │
│ You can upload 1 or more    │
│ screenshots of the job      │
│ posting. We'll extract the  │
│ text and create a job.      │
│                             │
│ ┌─────────────────────────┐ │
│ │ 📷 Take Screenshot      │ │ ← Camera
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ 🖼️ Choose from Gallery  │ │ ← Photos
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ 📎 Paste from Clipboard │ │ ← Copy-paste
│ └─────────────────────────┘ │
│                             │
│ [Close ✕]                  │
│                             │
└─────────────────────────────┘
            ↓ (user selects photo)
            
┌─────────────────────────────┐
│ Processing...               │ ← Spinner + text
├─────────────────────────────┤
│                             │
│ 🔄 Extracting text...       │
│ 🤖 Analyzing with AI...     │
│ ⏱  About 3-5 seconds        │
│                             │
│ [Cancel]                    │ ← Allow abort
│                             │
└─────────────────────────────┘
            ↓ (3-5 sec)
            
┌─────────────────────────────┐
│ ✓ Found: LinkedIn Job       │
├─────────────────────────────┤
│                             │
│ Company:                    │
│ ┌─────────────────────────┐ │
│ │ Figma                   │ │ ← Extracted from OCR
│ └─────────────────────────┘ │
│                             │
│ Role:                       │
│ ┌─────────────────────────┐ │
│ │ Product Manager         │ │ ← May need correction
│ │ [Edit]                  │ │
│ └─────────────────────────┘ │
│                             │
│ Add more screenshots?       │
│ ┌─────────────────────────┐ │
│ │ + Add Description Photo │ │ ← Multi-image support
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │  ✓ Save Job             │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │  ← Back to Edit         │ │
│ └─────────────────────────┘ │
│                             │
└─────────────────────────────┘
            ↓ (user taps Save)
            
        ✅ Job saved!
        
        "Merging screenshots..."
        ⏳ Analysis pending
```

**Time Breakdown:**
- 0-3 sec: Select screenshot
- 3-5 sec: OCR + extraction
- 5-8 sec: User reviews + optional second photo
- 8-10 sec: Save

**Multi-Image Flow:**
If user taps "Add Description Photo":
```
(Same modal re-opens, allows multi-select)
Selected: 1 image ✓
Add more: [📷] or [🖼️]
→ Merge all images when user taps Save
```

---

### Flow 3: Manual Entry (10-15 seconds)

```
┌─────────────────────────────┐
│ Create Job Manually         │
├─────────────────────────────┤
│                             │
│ Company *                   │ ← Required
│ ┌─────────────────────────┐ │
│ │ [Type company name...]  │ │ ← Autofocus
│ └─────────────────────────┘ │
│                             │
│ Role *                      │ ← Required
│ ┌─────────────────────────┐ │
│ │ [Type role title...]    │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │  → Save & Continue      │ │ ← Minimal first
│ └─────────────────────────┘ │
│                             │
│ Optional fields (collapsed) │
│ ──────────────────────────  │
│ [▼ Add location, link...]  │ ← Expand if needed
│                             │
│ [Close ✕]                  │
│                             │
└─────────────────────────────┘
            ↓ (user types company + role)
            
        ✅ Job saved!
        
        "Keep it simple — add details later"
        
        [View Job] [← Back to Home]
```

**Time Breakdown:**
- 0-5 sec: Type company name
- 5-10 sec: Type role title
- 10-15 sec: Tap Save

---

## Redesigned Mobile Job Cards

### Current (Desktop-First)

```
┌─────────────────────────────────┐
│ Senior PM @ Figma               │ ← Role @ Company
│ 📍 San Francisco, CA            │
│ ▼ 87% Match                     │ ← Small score display
│                                 │
│ [Edit] [Pin] [Remove]          │ ← Hover buttons
│                                 │
│ AI Coach: "Strong cultural fit" │ ← Extra text
└─────────────────────────────────┘
```

**Issues:**
- Small buttons (easy to tap wrong one)
- Too many CTAs competing
- Score not prominent
- No quick action to open

### Redesigned (Mobile-First)

```
┌───────────────────────────────────────┐
│                                       │
│ ▲ Figma                               │ ← Company (prominent)
│ → Senior Product Manager              │ ← Role (secondary)
│                                       │
│ 📍 San Francisco, CA                  │ ← Location (small text)
│                                       │
│ ─────────────────────────────────────│
│                                       │
│ 🎯 87% Match                          │ ← Big score (primary info)
│                                       │ ← If pending: ⏳ Analyzing...
│                                       │
│ ─────────────────────────────────────│
│                                       │
│ [Full Screen: Tap anywhere]           │ ← Tap anywhere to open
│                                       │
│ ⚠️ Today's Focus              [📌]   │ ← Reminder badge + pin
│                                       │
└───────────────────────────────────────┘
```

**Improvements:**
- Big touch target: entire card is tap-to-open
- Score is the primary visual hierarchy
- Status clear: ✅, ⏳, or ⚠️
- Pin button moved to corner (less prominent, doesn't interfere)
- Swipe-to-delete (or long-press menu)

---

## Mobile Navigation (Bottom Tab Bar)

### Current (Desktop Top Header)

```
┌────────────────────────────────────────────┐
│ Job Maker  [Search 🔍] [Sync 🔄] [⚙️] [🔔] │ ← Hard to reach on mobile
└────────────────────────────────────────────┘
│ Kanban Board                              │
│ Column 1 | Column 2 | Column 3            │
│ ────────────────────────────────────────  │
│ [Job] [Job] [Job] [Job] [Job]             │
└────────────────────────────────────────────┘
```

**Issues:**
- Buttons in top-right corner (thumb has to reach)
- Search bar in header (small, hard to tap)
- Hamburger menu hidden

### Redesigned (Bottom Navigation)

```
┌────────────────────────────────────────────┐
│ Job Maker                    [Search 🔍]   │ ← Minimal top bar
├────────────────────────────────────────────┤
│                                            │
│ Kanban Board / Job List                    │
│ (Main content area)                        │
│                                            │
├────────────────────────────────────────────┤
│ [+ Add]  [🏠] [📊] [🔔] [⚙️]                │ ← Bottom nav (44px)
│ Add Job   Home Board Notif Settings        │
└────────────────────────────────────────────┘
```

**Improvements:**
- Floating action button (+ Add) → most important action
- Bottom navigation within thumb zone
- Home = quick view of recent jobs
- Board = kanban view
- Notifications = badge with count
- Settings = account + integrations

**Mobile Navigation Structure:**

```
Tab 1: Home (Dashboard)
  - Recent jobs
  - Quick stats
  - Quick add entry points

Tab 2: Board (Kanban)
  - Full kanban view
  - Swipe left/right to scroll columns
  - Tap card to detail

Tab 3: Notifications
  - Hiring events
  - Analysis status updates
  - Job alerts

Tab 4: Settings
  - Integrations status
  - Resume upload
  - Sync status
```

---

## Component Changes Required

### 1. New `MobileImportModal.jsx`
- Entry point for URL/screenshot/manual
- Handles all 3 flows in single component
- Replaces desktop JobForm for mobile

### 2. Modified `JobCard.jsx`
- New compact layout for mobile
- Full-width touch target
- Status badge (✅ / ⏳ / ⚠️)
- Swipe-to-delete on mobile

### 3. New `BottomNavigation.jsx`
- Fixed bottom bar
- 5 tabs: Home, Board, Notifications, Settings, + Add

### 4. New `MobileHomeDashboard.jsx`
- Recent jobs list
- Quick stats
- Quick add entry points

### 5. Modified `App.jsx`
- Route to mobile-specific components
- Add `const isMobile = window.innerWidth < 640`
- Hide desktop-only components on mobile

### 6. New CSS: `mobile.css`
- Mobile breakpoints (<640px)
- Touch-friendly spacing (44px buttons, 1rem gaps)
- Bottom navigation styles
- Full-width components
- No multi-column layouts

---

## Implementation Plan

### Phase 1: Foundation (Week 1, 20 hours)
**Goal:** Mobile-specific components ready

- [ ] `MobileImportModal.jsx` (URL + Screenshot flows) — 8h
- [ ] `BottomNavigation.jsx` — 4h
- [ ] `mobile.css` (responsive styles) — 4h
- [ ] Route detection in `App.jsx` — 2h
- [ ] Testing on actual phone — 2h

**Deliverable:** Working import flows on mobile device

---

### Phase 2: Cards & Dashboard (Week 2, 16 hours)
**Goal:** Job view and list optimized for mobile

- [ ] Redesigned `JobCard.jsx` (compact mobile layout) — 6h
- [ ] `MobileHomeDashboard.jsx` (recent jobs + quick stats) — 6h
- [ ] Swipe-to-delete + long-press menu — 3h
- [ ] Mobile testing & refinement — 1h

**Deliverable:** Smooth browsing experience on mobile

---

### Phase 3: Navigation & Routing (Week 3, 12 hours)
**Goal:** Full mobile navigation flow working

- [ ] Route all screens through bottom nav — 4h
- [ ] Mobile `JobDetail` side panel → full screen — 3h
- [ ] Back button handling (mobile) — 2h
- [ ] Testing all flows end-to-end — 3h

**Deliverable:** Complete mobile navigation working

---

### Phase 4: Polish & Performance (Week 4, 12 hours)
**Goal:** Production-ready mobile experience

- [ ] Touch target audit (all buttons ≥ 44px) — 3h
- [ ] Spacing audit (1rem gaps on mobile) — 2h
- [ ] Screenshot upload modal refinement — 3h
- [ ] Mobile performance optimization — 2h
- [ ] iOS/Android testing — 2h

**Deliverable:** Polished, fast, production-ready mobile experience

---

## Expected Metrics

### Time-to-Create
- **Greenhouse/Lever (URL):** 5-6 seconds ✅
- **Ashby/Workday (URL with partial):** 10-12 seconds ✅
- **Screenshot import:** 8-10 seconds ✅
- **Manual entry:** 12-15 seconds ✅

### Touch Target Audit
- ✅ All buttons: ≥ 44px (vertical)
- ✅ All inputs: ≥ 44px
- ✅ Spacing between targets: ≥ 0.5rem
- ✅ No hover-only actions

### Mobile Breakpoints
```css
/* Phones (320-640px) */
@media (max-width: 640px) {
  /* Full-width single-column layout */
  /* 44px buttons, 1rem spacing */
  /* Bottom navigation */
}

/* Tablets (641-1024px) */
@media (max-width: 1024px) {
  /* Slightly more spacious, but still mobile-first */
}

/* Desktop (1025px+) */
@media (min-width: 1025px) {
  /* Original desktop layout */
}
```

---

## Mobile-First Checklist

### Interaction Design
- [ ] All primary actions reachable with thumb
- [ ] No hover states (mobile doesn't support hover)
- [ ] Swipe gestures for secondary actions
- [ ] Long-press for context menus
- [ ] Double-tap to zoom (disabled, prevent confusion)

### Visual Design
- [ ] Typography: 16px minimum for inputs (prevents iOS zoom)
- [ ] Colors: ≥ 4.5:1 contrast ratio
- [ ] Icons: 24px minimum size
- [ ] Padding: 1rem minimum on mobile
- [ ] No tiny UI elements

### Performance
- [ ] Images lazy-loaded
- [ ] No heavy animations on scroll
- [ ] OCR component loaded on-demand
- [ ] Screenshots uploaded in background
- [ ] Network requests debounced

### Accessibility
- [ ] Focus visible on all interactive elements
- [ ] Semantic HTML (labels, buttons, links)
- [ ] Touch target minimum 44x44px
- [ ] Screen reader tested

---

## Success Criteria (Sprint 2 Complete)

**Primary Metric: Time-to-Create**
- ✅ 80% of mobile users complete import in <10 seconds
- ✅ Average time: <8 seconds

**Secondary Metrics**
- ✅ Touch target audit: 100% buttons ≥ 44px
- ✅ Scroll depth on import: <3 scrolls
- ✅ Error rate on form submission: <2%
- ✅ Abandonment rate: <5%

**User Feedback**
- ✅ "Creating a job on mobile is effortless" (NPS ≥ 7)
- ✅ "Faster than web" (mobile > desktop for job creation)

---

## Migration Path (Desktop Users)

**No breaking changes.** Desktop users continue using current interface:
- URL import bar (side-by-side) ✓
- Full form visible ✓
- Side panel JobDetail ✓
- Top header navigation ✓

**Responsive layout serves appropriate UI:**
- Desktop (<1025px) → Current experience
- Mobile (≥1025px) → New mobile-first experience

User routes automatically based on `window.innerWidth`.
