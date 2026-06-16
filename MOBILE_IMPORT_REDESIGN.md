# Mobile-First Import Redesign

**Focus:** Reduce time-to-create from minutes to <10 seconds  
**Primary KPI:** User can add a job without manual editing (or with minimal corrections)  
**Target Market:** Israel (LinkedIn + company career pages dominant)

---

## 1. Confidence Tiers Framework

### Tier 1: Fully Supported (High Confidence)
**Sources:** Greenhouse, Lever (public APIs)  
**Expected Extraction:** Company + Role + Location + Description  
**UX Response:** Auto-fill all fields, show preview, one-tap save

| Field | Accuracy | Auto-fill |
|---|---|---|
| Company | 100% | ✅ Yes |
| Role | 95%+ | ✅ Yes |
| Location | 90%+ | ✅ Yes |
| Description | 95%+ | ✅ Yes |

**Flow:** URL → API → Preview (2 sec) → Tap "Save" → Done

---

### Tier 2: Partially Supported (Medium Confidence)
**Sources:** Ashby, Workday (SPAs), Generic career pages with schema  
**Expected Extraction:** Company + Location OR Role + Description  
**UX Response:** Auto-fill available fields, require user to complete missing ones

| Field | Accuracy | Auto-fill |
|---|---|---|
| Company | 80%+ | ✅ Yes (from URL) |
| Role | 0% | ❌ Highlight for manual |
| Location | 50% | ⚠️ Conditional |
| Description | 60% | ✅ Yes (if available) |

**Flow:** URL → Partial Extract → Form with hints → User types role (required) → Preview → Save

**Critical UX:** Make missing fields obvious without being punitive. Pre-focus on role input. Show character counter to motivate quick typing.

---

### Tier 3: Manual Assistance (Low Confidence)
**Sources:** LinkedIn (bot-protected), generic pages without markup  
**Expected Extraction:** None or minimal  
**UX Response:** Offer screenshot import instead; guide user to alternative flows

| Field | Accuracy | Auto-fill |
|---|---|---|
| Company | 0% | ❌ Manual |
| Role | 0% | ❌ Manual |
| Location | 0% | ❌ Manual |
| Description | 0% | ❌ Manual |

**Flow:** URL → Bot detected → Offer: [Screenshot Import] [Share from LinkedIn] [Paste text]

---

## 2. Improved Correction Experience

### Current Problem
- URL → Extraction → Empty form if failed → User starts from scratch = 3–5 minutes

### New Approach: Prefill + Guided Editing

**Rule 1: Never show an empty form**
- Always prefill company (from URL slug if needed)
- Always prefill role placeholder or extract attempt
- Show location if found, otherwise empty with hint
- Show description snippet if found, otherwise empty

**Rule 2: Make editing frictionless**
- Role field: autofocus on form load (mobile keyboard auto-opens)
- Character counter: "Role (e.g. 'Senior PM' — 20+ chars recommended)"
- Quick-fix buttons for common patterns:
  - "Too long?" → Suggest first 5 words
  - "Unsure?" → Show extracted text as suggestion
  - "Skip" → Leave empty (optional field for mobile)

**Rule 3: Highlight only what's missing**
- Green checkmark for auto-filled high-confidence fields (company, description)
- Amber warning for partially-filled fields
- Red highlight for required fields (role, company) if empty

**Rule 4: Optimize for mobile touch**
```
Desktop: 8 visible fields + scrollable details
Mobile:  3 visible fields (company, role, optional)
         Collapse company info, contact, notes into "More" button
         Scroll to see only what user needs to complete
```

### Form Layout for Tier 2 (Partially Supported)

```
┌─────────────────────────────────┐
│ Import from Ashby               │ ← Breadcrumb
├─────────────────────────────────┤
│                                 │
│ Company                         │
│ ┌──────────────────────────────┐│ ← Prefilled (green checkmark)
│ │ Figma                        ││
│ └──────────────────────────────┘│
│                                 │
│ Role *                          │ ← Required, red if empty
│ ┌──────────────────────────────┐│
│ │ [Type role...] ← Autofocus   ││ ← Mobile keyboard opens
│ │ e.g. "Product Manager"       ││ ← Helpful hint
│ └──────────────────────────────┘│
│                                 │
│ More details ▼                  │ ← Collapsible (location, industry, etc.)
│                                 │
│ [Save Job]  [Cancel]            │ ← Big touch targets
│                                 │
└─────────────────────────────────┘
```

### Correction Workflow (10-second target)

1. **User opens job URL** (anywhere: mobile browser, LinkedIn, email)
2. **Job Maker app receives URL via deep link or share**
3. **Extraction runs in background** (2 sec)
4. **Form loads with auto-filled fields** (0.5 sec)
5. **User taps role field → keyboard opens** (0.5 sec)
6. **User types role quickly** (3-5 sec for "Senior PM")
7. **User taps "Save"** (0.5 sec)
8. **Job created in Backlog** (1 sec)
9. **Total: 7-10 seconds** ✅

---

## 3. Screenshot Import Flow

### Problem Solved
- User sees job on LinkedIn app → Cannot directly share to Job Maker → Has to leave app, copy URL, open Job Maker = friction
- Alternative: User takes screenshot → OCR extracts text → AI parses job details → Saves

### Target Accuracy
- OCR: 90%+ text recognition
- AI extraction: 70%+ accuracy on company, role, location
- Field accuracy: Company 60%, Role 70%, Location 40%, Description 80%

### Flow

```
┌──────────────────────────┐
│ Job Maker Home           │
├──────────────────────────┤
│ [Add Job] ┌────────────┐ │
│           │ Import URL │ │ ← Existing
│ [📸]◄─────│    URL     │ │
│ Screenshot│ [Screenshot]│ ← NEW
│ Import    └────────────┘ │
│           ┌────────────┐ │
│           │ Share from │ │
│           │ LinkedIn   │ ← NEW
│           └────────────┘ │
└──────────────────────────┘
    ↓
    User taps [📸]
    ↓
┌──────────────────────────┐
│ Select Image             │
├──────────────────────────┤
│ 📷 Take Screenshot       │ ← Camera
│ 🖼️ Choose from Gallery  │ ← Photos
│ 📎 Paste from Clipboard  │ ← If screenshot copied
└──────────────────────────┘
    ↓
    User selects LinkedIn job screenshot
    ↓
┌──────────────────────────────────┐
│ Processing...                    │
│ 🔄 Extracting text from image   │
│ 🤖 Analyzing with AI             │
│ ⏱ This takes 3-5 seconds         │
└──────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Found Job from Screenshot            │
├─────────────────────────────────────┤
│                                     │
│ Company: LinkedIn *                 │ ← Low conf (60%)
│ [Edit] ► Figma                      │
│                                     │
│ Role: Product Manager, USA *        │ ← High conf (85%)
│ [Edit] ► Product Manager            │
│                                     │
│ Location: San Francisco, CA *       │ ← Medium conf (70%)
│ [Edit] ► San Francisco              │
│                                     │
│ Industry: Tech                      │
│ [Edit] ► Software/SaaS              │
│                                     │
│ [Save Job]  [Cancel]                │
│                                     │
└─────────────────────────────────────┘
```

### Implementation Details

**Backend (new edge function):**
```typescript
POST /functions/v1/screenshot-import
{
  "image_base64": "...",
  "compress": true  // 512px max width for speed
}

Response:
{
  "company": "Figma",
  "role": "Product Manager",
  "location": "San Francisco, CA",
  "description": "...",
  "ocr_text": "...",
  "confidence": {
    "company": 0.60,
    "role": 0.85,
    "location": 0.70
  }
}
```

**Libraries:**
- Frontend: `tesseract.js` (OCR in browser, no backend needed)
- Backend: OpenAI Vision (gpt-4-vision) for fallback when OCR fails

**Process:**
1. Compress image to 512px width (reduce cost/latency)
2. Extract text via `tesseract.js` in browser (free, no quota)
3. If OCR confidence < 70%, send full image to gpt-4-vision
4. Parse extracted text with prompt:
   ```
   Extract: company, role, location, description
   Return JSON with confidence scores (0-1).
   If unsure of a field, set to null.
   ```
5. Return results with confidence scores

**Expected Times:**
- Image compression: 0.2 sec
- OCR (tesseract.js): 2-4 sec
- Parsing: 0.1 sec
- **Total: 2-5 seconds**

**Mobile UX:**
- Show skeleton loader with "Extracting text..." message
- If OCR fails, show "Using AI to read image..." (uploads to OpenAI, adds 2-3 sec)
- Never block on OCR failure — suggest manual fallback

---

## 4. Share from LinkedIn / Mobile Browser

### Problem Solved
User browsing LinkedIn or career page → Sees job → One tap to add to Job Maker

### Implementation Options

#### Option A: Chrome Extension + Deep Link (Fastest)
Already have Chrome extension (LinkedIn button).  
**Proposal:** Add protocol handler to app:

```javascript
// In mobile app (Register intent handler)
window.location.href = "jobmaker://import?url=https://www.linkedin.com/jobs/view/4240889428&source=share"
```

**Desktop to Mobile:** User on desktop Chrome:
1. Clicks "Save to Job Maker" button
2. Extension shows: [Save to Web App] [Send to Mobile]
3. User scans QR code or enters phone number
4. Sends URL + job context to user's device
5. Mobile app opens and imports

#### Option B: LinkedIn Share Sheet (iOS) + Web Fallback (Most Compatible)

**iOS:**
- User shares job post → Select "Job Maker"
- iOS app receives URL via share extension
- Deep link: `jobmaker://import?url=...`

**Android:**
- User shares job post → Select "Job Maker"
- Android app receives URL via intent
- Intent: `ACTION_VIEW` with custom URI scheme

**Web Fallback (no app installed):**
- Share opens `jobmaker.web.app/import?url=...&source=linkedin`
- Web app auto-detects source and starts import flow

### Flow Diagram

```
LinkedIn → [Share] → [More...] → [Job Maker]
           ↓
         iOS app opens with URL
           ↓
    ┌──────────────────────┐
    │ Importing from       │
    │ LinkedIn             │
    ├──────────────────────┤
    │ 🤖 Analyzing...      │
    │ Bot protection?      │
    │ Trying screenshot    │
    │ fallback...          │
    └──────────────────────┘
           ↓
    ┌─────────────────────────┐
    │ Could not extract from  │
    │ URL (bot protected)     │
    ├─────────────────────────┤
    │ [📸 Use Screenshot]     │ ← Go to camera
    │ [📝 Paste Text]         │ ← Paste from clipboard
    │ [✏️ Type Manually]      │ ← Empty form
    └─────────────────────────┘
           ↓
    User selects [📸 Use Screenshot]
           ↓
    Camera opens, user captures job details
           ↓
    OCR + AI extraction (same as flow above)
           ↓
    Preview → Save
```

### Expected Behavior by Source

| Source | Share | Link | Fallback |
|---|---|---|---|
| LinkedIn App | ✅ Share ext. | ⏳ Bot-protected | Screenshot |
| LinkedIn Web | ✅ Share sheet | ⏳ Bot-protected | Screenshot |
| Greenhouse | ✅ Share | ✅ Full extract | — |
| Lever | ✅ Share | ✅ Full extract | — |
| Ashby | ✅ Share | ⚠️ Company only | Type role |
| Workday | ✅ Share | ⚠️ Company only | Type role |
| Generic | ✅ Share | ⚠️ Schema-dependent | Screenshot |

---

## 5. Success Metrics & KPIs

### Primary KPI: Time to Create
**Target:** User can add a job in <10 seconds, 80% of the time

**Measurement:**
```
Time = (job_created_at - import_started_at)
Broken down by source:
- Greenhouse: <5 sec (auto-fill all, one tap)
- Lever: <5 sec (auto-fill all, one tap)
- Ashby/Workday: 10-15 sec (one field to type)
- Screenshot: 5-8 sec (OCR + preview + save)
- LinkedIn (fallback): 8-12 sec (screenshot flow)
```

### Secondary KPIs

| Metric | Target | Notes |
|---|---|---|
| Jobs completed without edits | 70%+ | % of jobs saved with no manual changes |
| Avg fields edited per job | <1.2 | Average number of fields user corrects |
| Screenshot success rate | 80%+ | % of screenshots successfully parsed |
| User abandonment rate | <5% | % of users who start import but don't save |
| Import source distribution | 40% URL, 35% Screenshot, 25% Share | Expected breakdown by flow |

### Tracking Implementation

**Frontend events (Supabase or analytics):**
```typescript
// When import starts
trackEvent('import_started', {
  source: 'url' | 'screenshot' | 'share',
  confidence_tier: 1 | 2 | 3,
  url_source: 'greenhouse' | 'lever' | 'ashby' | 'linkedin' | 'generic',
  timestamp: Date.now()
})

// When user makes edits
trackEvent('import_field_edited', {
  field: 'company' | 'role' | 'location',
  original_value: '...',
  final_value: '...'
})

// When job is saved
trackEvent('job_created', {
  duration_ms: 8500,
  fields_edited: ['role'],
  source: 'url' | 'screenshot' | 'share'
})
```

---

## 6. Implementation Roadmap

### Phase 1: URL Import Improvements (Week 1 – Already Done)
- ✅ Tier 1 & Tier 2 detection for Greenhouse, Lever, Ashby, Workday
- ✅ Improved form prefill (never empty)
- ✅ Import preview card
- ✅ Field highlighting (required vs optional)

**Effort:** 20 hours (COMPLETED)

**Metrics to monitor:**
- Time to create for Greenhouse/Lever (target: <5 sec)
- Time to create for Ashby/Workday (target: 10-15 sec)
- Abandonment rate when role field required

---

### Phase 2: Screenshot Import (Week 2)
- Add screenshot button to home screen and import modal
- Implement tesseract.js OCR (browser-side)
- Build AI extraction endpoint (OpenAI Vision fallback)
- Preview card with confidence scores
- Mobile camera integration

**Effort:** 28 hours

**Breakdown:**
- Frontend: Camera UI + image upload (6h)
- Frontend: tesseract.js integration (4h)
- Backend: `screenshot-import` edge function (8h)
- AI prompt engineering & testing (6h)
- Mobile testing & UX refinement (4h)

**Dependencies:** None (can run in parallel with Phase 3)

---

### Phase 3: LinkedIn Share Integration (Week 2-3)
- Register URL scheme handlers (iOS + Android)
- Update Chrome extension with "Send to Mobile" option
- Build import redirect page (`/import?url=...&source=linkedin`)
- Implement share fallback detection
- Error handling for bot-protected pages

**Effort:** 16 hours

**Breakdown:**
- iOS intent handler registration (3h)
- Android intent handler registration (3h)
- Extension "Send to Mobile" feature (4h)
- Redirect page & error UI (3h)
- Testing on real devices (3h)

**Dependencies:** None (can run in parallel with Phase 2)

---

### Phase 4: Analytics & Optimization (Week 3)
- Implement event tracking (import_started, field_edited, job_created)
- Build dashboard: time-to-create by source, abandonment rate, field edit frequency
- A/B test: auto-fill vs. empty form (current vs. baseline)
- Iterate on UX based on real user data

**Effort:** 20 hours

**Breakdown:**
- Event tracking implementation (6h)
- Analytics dashboard (8h)
- A/B test setup (4h)
- Data analysis & iteration (2h)

**Dependencies:** Phase 1 + 2 + 3 deployed

---

## 7. Recommended Rollout Order

### Week 1 (Completed)
✅ **Phase 1:** URL Import improvements (Greenhouse, Lever, Ashby, Workday)
- Release to production
- Monitor time-to-create metrics
- Gather user feedback

### Week 2
🚀 **Phase 2 & 3 (in parallel):**
- Screenshot import (Phase 2)
- LinkedIn share integration (Phase 3)
- Beta test with 20% of users (gradual rollout)

### Week 3
✅ **Phase 4:** Analytics & optimization
- Release full analytics dashboard
- Monitor KPIs against targets
- Iterate based on data

### Rollout Strategy
```
Day 1-3: Alpha (internal testing)
Day 4-7: Beta 20% (gradual iOS rollout)
Day 8-14: Beta 50% (add Android)
Day 15+: General availability (100% users)
```

---

## 8. Expected Time-to-Create by Flow

### Best Case (Greenhouse/Lever)
```
User opens job URL in browser
↓ (0.5 sec)
URL → App deep link detected
↓ (0.5 sec)
App launches with URL
↓ (2 sec)
API extraction (company, role, location, description)
↓ (0.5 sec)
Form loads with all fields auto-filled (preview shown)
↓ (0.5 sec)
User taps "Save Job"
↓ (1 sec)
Job created in Backlog

TOTAL: 5-6 seconds ✅
```

### Medium Case (Ashby/Workday)
```
User opens job URL
↓ (1 sec)
Partial extraction (company only)
↓ (0.5 sec)
Form loads with company pre-filled, role field highlighted
↓ (5 sec)
User types role ("Senior PM")
↓ (0.5 sec)
User taps "Save"
↓ (1 sec)
Job created

TOTAL: 8-10 seconds ✅
```

### Fallback Case (LinkedIn → Screenshot)
```
User shares LinkedIn job to app
↓ (1 sec)
App receives URL, detects bot protection
↓ (0.5 sec)
"Could not extract. Use screenshot?" prompt shown
↓ (1 sec)
User taps [📸 Take Screenshot]
↓ (5 sec)
Camera, user captures job details
↓ (3-5 sec)
OCR + AI extraction
↓ (0.5 sec)
Preview form shown with extracted data
↓ (2 sec)
User corrects/approves
↓ (1 sec)
User taps "Save"
↓ (1 sec)
Job created

TOTAL: 14-16 seconds ⚠️
(Still better than copy URL + paste + manual typing = 3-5 min)
```

---

## 9. Effort & Resource Estimates

| Phase | Duration | Hours | Developer | Priority |
|---|---|---|---|---|
| Phase 1: URL Improvements | Week 1 | 20 | Done ✅ | P0 |
| Phase 2: Screenshot Import | Week 2 | 28 | 1 full-stack | P1 |
| Phase 3: LinkedIn Share | Week 2-3 | 16 | 1 full-stack | P1 |
| Phase 4: Analytics | Week 3 | 20 | 1 full-stack | P2 |
| **TOTAL** | **3 weeks** | **84 hours** | **1 person** | — |

**With 1 full-stack engineer (40 hrs/week):**
- Week 1: Phase 1 complete (already done)
- Week 2: Phase 2 & 3 in parallel (32h) + Phase 4 start (8h)
- Week 3: Phase 4 complete + optimization

---

## 10. Success Criteria

### Launch Success
- ✅ 80% of Greenhouse/Lever imports complete in <5 seconds
- ✅ 70% of Ashby/Workday imports complete in <15 seconds (with 1 field typed)
- ✅ 60% of screenshot imports recognize company + role correctly
- ✅ <5% abandonment rate during import flow

### Post-Launch (Week 3)
- ✅ Average time-to-create across all sources: <12 seconds
- ✅ 70% of jobs saved without manual editing
- ✅ Screenshot import: 80% success rate
- ✅ LinkedIn share integration: 60% of users use it

---

## Conclusion

**Instead of fighting LinkedIn bot protection**, we offer three equally fast paths:

1. **URL Import (Tier 1):** 5 sec (Greenhouse, Lever)
2. **Partial Import + Quick Edit (Tier 2):** 10 sec (Ashby, Workday)
3. **Screenshot Import (Tier 3):** 8-12 sec (LinkedIn, generic pages)

**The real KPI is time-to-create, not extraction accuracy.** A 90% accurate form that takes 2 minutes is worse than an 70% accurate form that takes 30 seconds (because users fix the 30% quickly).

**Next step:** Implement Phase 2 (Screenshot Import) and Phase 3 (LinkedIn Share) in parallel over Week 2-3.
