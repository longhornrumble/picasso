# Emerald High-Velocity Lead Workspace Drawer - Implementation Plan

## Document Control

| Attribute | Value |
|-----------|-------|
| **Document ID** | IMPL-PICASSO-2025-001 |
| **Based On PRD** | PRD-PICASSO-2025-001 |
| **Target Project** | picasso-analytics-dashboard |
| **Status** | **COMPLETE - FULLY IMPLEMENTED** |
| **Estimated Effort** | 5-7 Days (DONE) |
| **Created** | 2025-12-28 |
| **Completed** | 2025-12-30 |

## Implementation Status

### Frontend Components (All Complete)

| Component | File | Status |
|-----------|------|--------|
| LeadWorkspaceDrawer | `src/components/lead-workspace/LeadWorkspaceDrawer.tsx` | ✅ Complete |
| DrawerHeader | `src/components/lead-workspace/DrawerHeader.tsx` | ✅ Complete |
| MetadataGrid | `src/components/lead-workspace/MetadataGrid.tsx` | ✅ Complete |
| PipelineStepper | `src/components/lead-workspace/PipelineStepper.tsx` | ✅ Complete |
| FormDataManifest | `src/components/lead-workspace/FormDataManifest.tsx` | ✅ Complete |
| CommunicationsCard | `src/components/lead-workspace/CommunicationsCard.tsx` | ✅ Complete |
| InternalNotesSection | `src/components/lead-workspace/InternalNotesSection.tsx` | ✅ Complete |
| TerminalActions | `src/components/lead-workspace/TerminalActions.tsx` | ✅ Complete |

### Backend Integration (All Complete)

| Endpoint | Status |
|----------|--------|
| `GET /leads/{id}` | ✅ Complete |
| `PATCH /leads/{id}/status` | ✅ Complete |
| `PATCH /leads/{id}/notes` | ✅ Complete |
| `POST /leads/{id}/reactivate` | ✅ Complete |
| `GET /leads/queue` | ✅ Complete |

### API Client (Complete)

All endpoints integrated in `src/services/analyticsApi.ts` with full TypeScript types.

---

## 1. Executive Summary

This implementation plan details the technical approach for building the **Emerald High-Velocity Lead Workspace Drawer** feature for the Picasso Analytics Dashboard. The drawer will be triggered from the Actions ellipsis in the Recent Submissions table and provide a comprehensive lead processing workspace.

### Key Technical Decisions

1. **Drawer Pattern**: Use a slide-in drawer component (not a modal dialog like SessionTimeline) for contextual processing while maintaining dashboard visibility
2. **State Management**: React useState/useCallback at Dashboard level with prop drilling (consistent with existing patterns)
3. **Data Flow**: Leverage existing `FormSubmissionAPI` type and extend with pipeline status
4. **Styling**: Glassmorphic design using existing Tailwind config + CSS variables from `@picasso/shared-styles`
5. **API Integration**: Extend `analyticsApi.ts` with new PATCH endpoints

---

## 2. Codebase Analysis

### Existing Patterns Identified

| Pattern | File Reference | Relevance |
|---------|---------------|-----------|
| **Data Table with Actions** | `/src/components/shared/DataTable.tsx` | Actions column already supports `renderActions` prop |
| **Modal Dialog** | `/src/components/sessions/SessionTimeline.tsx` | Reference for loading states, error handling, close behavior |
| **Card Components** | `/src/components/sessions/SessionCard.tsx` | Reference for formatting utilities (date, duration) |
| **API Service** | `/src/services/analyticsApi.ts` | Pattern for authenticated requests, error handling |
| **Type Definitions** | `/src/types/analytics.ts` | Existing `FormSubmissionAPI` interface to extend |
| **Auth Context** | `/src/context/AuthContext.tsx` | JWT token retrieval for API calls |
| **Premium Design** | `/src/index.css` | Card variants, typography, color system |

### Design System Constants (Premium Emerald)

All styling MUST follow the Premium Emerald Design System documented in `/docs/STYLE_GUIDE.md`.

```typescript
// Brand colors - use CSS variables from @picasso/shared-styles
const EMERALD = '#50C878';           // var(--color-primary-500)
const EMERALD_GLOW = 'rgba(80, 200, 120, 0.15)';

// Use semantic colors from tokens.css
// --color-primary-* for success/positive
// --color-danger-* for archive/errors
// --color-info-* for informational badges

// Typography: Plus Jakarta Sans
// Font loaded in index.css, used throughout
```

### Style Guide Compliance Checklist

| Element | Style Guide Requirement | Implementation |
|---------|------------------------|----------------|
| **Typography** | Plus Jakarta Sans, font-black for labels | Inherit from body |
| **Aviation Labels** | text-[10px] font-black uppercase tracking-[0.2em] | All section headers |
| **Border Radius** | Super-ellipse: 2rem (32px) to 4rem (64px) | Drawer cards: rounded-[2rem] |
| **Elevation** | Use --elevation-hero, --elevation-card | CSS variables |
| **Primary CTA** | rounded-[2rem], emerald shadow glow | "Next Lead" button |
| **Secondary CTA** | border-2 border-slate-100, rounded-[2rem] | "Archive" button |
| **Motion** | hover:scale-[1.03] active:scale-[0.97] | All buttons |
| **Scrollbar** | 4px emerald-tinted | Drawer content area |

---

## 3. Component Architecture

### Component Hierarchy

```
src/components/
  lead-workspace/
    LeadWorkspaceDrawer.tsx          # Main drawer container
    DrawerHeader.tsx                  # Sticky header with ref ID, name, close/next
    MetadataGrid.tsx                  # Program ID, Zip, Timestamp, Source Badge
    PipelineStepper.tsx              # NEW -> REVIEWING -> CONTACTED
    FormDataManifest.tsx             # Parsed form data display
    LeadVoiceBlock.tsx               # Comments/message highlight
    CommunicationsCard.tsx           # mailto link with pre-filled subject
    InternalNotesSection.tsx         # Auto-expanding textarea with auto-save
    TerminalActions.tsx              # Next Lead, Archive, Save & Exit buttons
    index.ts                          # Barrel export
```

### Data Flow Diagram

```
Dashboard.tsx
  │
  ├── [State: selectedLeadId, isDrawerOpen]
  │
  ├── DataTable (Recent Submissions)
  │     │
  │     └── renderActions: (row) => <EllipsisButton onClick={openDrawer(row.id)} />
  │
  └── LeadWorkspaceDrawer
        │
        ├── [Props: leadId, isOpen, onClose, onNext, onArchive]
        ├── [Local State: leadData, pipelineStatus, notes, isSaving]
        │
        ├── DrawerHeader
        ├── MetadataGrid
        ├── PipelineStepper (onStatusChange)
        ├── FormDataManifest
        ├── CommunicationsCard
        ├── InternalNotesSection (auto-save)
        └── TerminalActions (onNext, onArchive)
```

---

## 4. Type Definitions

### New Types Required

```typescript
// src/types/analytics.ts - Additions

/** Pipeline status values for lead processing */
export type PipelineStatus = 'new' | 'reviewing' | 'contacted' | 'archived';

/** Submission type for badge coloring */
export type SubmissionType = 'volunteer' | 'donor' | 'general';

/** Extended form submission with pipeline data */
export interface LeadWorkspaceData extends FormSubmissionAPI {
  pipeline_status: PipelineStatus;
  internal_notes?: string;
  processed_by?: string;
  contacted_at?: string;
  archived_at?: string;
  submission_type: SubmissionType;
}

/** Parsed form field for display */
export interface ParsedFormField {
  label: string;          // Title Case converted
  value: string;          // Formatted value
  rawKey: string;         // Original snake_case key
  type: 'text' | 'email' | 'tel' | 'boolean' | 'array';
  isExpandable: boolean;  // For truncated values
}

/** API response for lead detail */
export interface LeadDetailResponse {
  lead: LeadWorkspaceData;
  tenant_name: string;    // For email subject
}

/** API response for status update */
export interface StatusUpdateResponse {
  ref_id: string;
  pipeline_status: PipelineStatus;
  updated_at: string;
}

/** API response for notes update */
export interface NotesUpdateResponse {
  ref_id: string;
  internal_notes: string;
  updated_at: string;
}

/** Lead queue for Next Lead navigation */
export interface LeadQueueResponse {
  next_lead_id: string | null;
  queue_count: number;
}
```

---

## 5. API Integration

### New API Functions

```typescript
// src/services/analyticsApi.ts - Additions

/**
 * Fetch single lead detail for workspace
 * GET /forms/submissions/{ref_id}
 */
export async function fetchLeadDetail(refId: string): Promise<LeadDetailResponse> {
  return apiRequest<LeadDetailResponse>(`/forms/submissions/${encodeURIComponent(refId)}`);
}

/**
 * Update lead pipeline status
 * PATCH /forms/submissions/{ref_id}
 */
export async function updateLeadStatus(
  refId: string,
  status: PipelineStatus
): Promise<StatusUpdateResponse> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/forms/submissions/${encodeURIComponent(refId)}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pipeline_status: status }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Failed to update status: ${response.status}`);
  }

  return response.json();
}

/**
 * Update lead internal notes (debounced auto-save)
 * PATCH /forms/submissions/{ref_id}/notes
 */
export async function updateLeadNotes(
  refId: string,
  notes: string
): Promise<NotesUpdateResponse> {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const response = await fetch(`${API_BASE_URL}/forms/submissions/${encodeURIComponent(refId)}/notes`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ internal_notes: notes }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Failed to save notes: ${response.status}`);
  }

  return response.json();
}

/**
 * Get next unprocessed lead in queue
 * GET /forms/submissions/queue?status=new&limit=1&after={current_ref_id}
 */
export async function fetchNextLead(
  currentRefId: string,
  range: TimeRange = '30d'
): Promise<LeadQueueResponse> {
  return apiRequest<LeadQueueResponse>('/forms/submissions/queue', {
    status: 'new',
    limit: '1',
    after: currentRefId,
    range,
  });
}
```

---

## 6. Implementation Phases

### Phase 1: Foundation & Drawer Shell (Day 1)

**Complexity**: Medium

**Tasks**:
1. Create `src/components/lead-workspace/` directory structure
2. Implement `LeadWorkspaceDrawer.tsx` with:
   - Slide-in animation from right (max-w-xl, 576px)
   - Backdrop blur overlay (`.drawer-backdrop` class - 8px blur, 40% opacity)
   - Body scroll lock when open
   - ESC key to close
   - Transition timing: 300ms cubic-bezier(0.4, 0, 0.2, 1) per Style Guide
3. Add drawer state to `Dashboard.tsx`:
   - `selectedLeadId: string | null`
   - `isDrawerOpen: boolean`
4. Wire up DataTable Actions column with ellipsis button

**Style Guide CSS Classes**:
- `.lead-workspace-drawer` - Main container with premium elevation
- `.drawer-backdrop` - Glassmorphic blur overlay
- Emerald scrollbar styling inherited from drawer container

**Deliverables**:
- Empty drawer slides in when clicking row actions
- Drawer closes with X button, ESC key, or backdrop click
- Backdrop blur effect on main dashboard

**Dependencies**: None (foundational)

---

### Phase 2: Header & Metadata (Day 2)

**Complexity**: Low

**Tasks**:
1. Implement `DrawerHeader.tsx`:
   - Sticky positioning during scroll
   - Close (X) button with hover scale effect
   - "Next Lead" button (`.btn-next-lead` class - rounded-[2rem], emerald shadow)
   - Ref ID badge using `.metadata-badge-emerald` (monospace, pill shape)
   - Lead name: text-2xl font-bold text-white
2. Implement `MetadataGrid.tsx`:
   - Program ID with tooltip
   - Zip Code
   - Timestamp (formatted: "Dec 28, 2025 2:34 PM")
   - Source Badges using `.metadata-badge-*` classes (emerald/blue/slate)
   - Section labels using `.label-aviation-muted`
3. Add type definitions to `analytics.ts`

**Style Guide CSS Classes**:
- `.metadata-badge-emerald` - Volunteer submissions
- `.metadata-badge-blue` - Donor submissions
- `.metadata-badge-slate` - General submissions
- `.label-aviation-muted` - Section headers (10px, uppercase, tracking-[0.2em])

**Deliverables**:
- Header displays lead identity with proper typography
- Metadata grid shows attribution info with pill badges
- Source badge color-coded by submission_type

**Dependencies**: Phase 1

---

### Phase 3: Pipeline Stepper (Day 2-3)

**Complexity**: Medium-High

**Tasks**:
1. Implement `PipelineStepper.tsx`:
   - Three states: NEW, REVIEWING, CONTACTED
   - Visual states using `.pipeline-stepper-btn.*` classes:
     - `.completed` - Emerald background with colored shadow
     - `.current` - Emerald border with subtle bg tint
     - Default - Outline only
   - Click handler for state transitions
   - Motion: hover:scale-[1.03] active:scale-[0.97] per Style Guide
   - Optimistic UI updates
   - Loading spinner on active button during API call
2. Add `updateLeadStatus()` to `analyticsApi.ts`
3. Implement toast notifications for success/error

**Style Guide CSS Classes**:
- `.pipeline-stepper-btn` - Base button with super-ellipse (1.25rem)
- `.pipeline-stepper-btn.completed` - Emerald with colored shadow
- `.pipeline-stepper-btn.current` - Emerald border with rgba(80,200,120,0.08) bg
- `.label-aviation` - Step labels (10px, uppercase, emerald)

**Deliverables**:
- Click any state to transition with scale micro-interaction
- Completed steps show emerald glow shadow
- Optimistic update with rollback on failure
- Toast: "Status updated to [State]"

**Dependencies**: Phase 2, API endpoint ready

---

### Phase 4: Form Data Manifest (Day 3)

**Complexity**: Medium

**Tasks**:
1. Create form data parser utilities:
   - `snakeCaseToTitleCase()` function
   - `parseFormData()` function
   - `formatFieldValue()` for arrays, booleans, nulls
2. Implement `LeadVoiceBlock.tsx`:
   - Extract comments/message field
   - Use `.lead-voice-block` class (gradient bg, 4px emerald left border)
   - Attribution using italic text: "-- {Name}'s comments"
3. Implement `FormDataManifest.tsx`:
   - Use `.drawer-card` class for container (1.5rem radius, glassmorphic)
   - Section header using `.label-aviation-muted`
   - Grid layout (label | value)
   - Truncation at 50 chars with "Show more" link
   - System fields exclusion
   - Empty state handling (em dash in slate-500)

**Style Guide CSS Classes**:
- `.drawer-card` - Container with glassmorphic effect
- `.lead-voice-block` - Quote styling with emerald accent
- `.label-aviation-muted` - "FORM DATA" section header

**Deliverables**:
- Comments displayed prominently as "Lead Voice" with emerald accent
- Form fields in glassmorphic card with proper typography
- Long values expandable on click

**Dependencies**: Phase 2

---

### Phase 5: Communications Card (Day 4)

**Complexity**: Low

**Tasks**:
1. Implement `CommunicationsCard.tsx`:
   - Use `.communications-card` class (1.5rem radius, interactive hover)
   - Display email address with mail icon
   - Construct `mailto:` link with dynamic subject
   - Subject templates by submission_type
   - Hover effect per Style Guide:
     - Emerald border on hover
     - Glow shadow: `0 0 0 4px rgba(80,200,120,0.15)`
     - Scale: 1.02
   - Disabled state when email missing (opacity-50)
   - "Copy email" fallback using `.btn-ghost` class
2. Add analytics event logging for `EMAIL_INITIATED`

**Style Guide CSS Classes**:
- `.communications-card` - Interactive card with hover glow
- `.btn-ghost` - Secondary "Copy" button
- `.label-aviation` - "CONTACT" section header (emerald)

**Deliverables**:
- Click opens default email client with emerald hover glow
- Pre-filled subject line
- Copy button with ghost styling as fallback

**Dependencies**: Phase 2

---

### Phase 6: Internal Notes (Day 4)

**Complexity**: Medium

**Tasks**:
1. Implement `InternalNotesSection.tsx`:
   - Use `.drawer-card` class for container
   - Section header using `.label-aviation-muted` ("INTERNAL NOTES")
   - Textarea using `.notes-textarea` class:
     - 1rem border radius
     - Glassmorphic background
     - Emerald focus ring with glow
   - Auto-expanding textarea (4-12 rows)
   - Character counter (current / 2000) in slate-400
   - Save indicator using `.save-indicator.*` classes:
     - `.saving` - Amber "Saving..."
     - `.saved` - Emerald "Saved ✓"
   - Debounced auto-save (1 second)
2. Add `updateLeadNotes()` to `analyticsApi.ts`
3. Implement localStorage fallback for offline

**Style Guide CSS Classes**:
- `.drawer-card` - Container
- `.notes-textarea` - Styled textarea with emerald focus
- `.save-indicator.saving` - Amber text
- `.save-indicator.saved` - Emerald text
- `.label-aviation-muted` - Section header

**Deliverables**:
- Notes auto-save with visual feedback (emerald on saved)
- Character limit enforced
- Offline draft persistence

**Dependencies**: Phase 2, API endpoint ready

---

### Phase 7: Terminal Actions (Day 5)

**Complexity**: Medium

**Tasks**:
1. Implement `TerminalActions.tsx`:
   - "Next Lead" button using `.btn-next-lead` class:
     - Emerald background with colored shadow glow
     - rounded-[2rem] per Style Guide
     - hover:scale-[1.03], active:scale-[0.97]
     - Disabled state: opacity-50, no shadow
   - "Archive Lead" button using `.btn-archive` class:
     - Rose outline, rose-400 text
     - rounded-[2rem] per Style Guide
     - Hover: rose background tint
   - "Save & Exit" button using `.btn-ghost` class
   - Click-hold confirmation for Archive (1s)
2. Implement "Next Lead" logic:
   - Fetch next `status=new` lead
   - Slide content transition (150ms)
   - Disable when queue empty (`.btn-next-lead:disabled`)
3. Implement "Archive" logic:
   - Update status to 'archived'
   - Close drawer
   - Toast with 5-second undo window
4. Add keyboard shortcut: Cmd/Ctrl + Arrow Right

**Style Guide CSS Classes**:
- `.btn-next-lead` - Primary CTA with emerald shadow glow
- `.btn-archive` - Rose outline secondary CTA
- `.btn-ghost` - Tertiary ghost button

**Motion per Style Guide**:
- All buttons: hover:scale-[1.03], active:scale-[0.97]
- Transition: 200ms ease

**Deliverables**:
- Seamless navigation with premium button styling
- Emerald glow on "Next Lead" button
- Safe archive with confirmation
- Undo capability

**Dependencies**: Phase 3 (status update), API endpoints

---

### Phase 8: Polish & Accessibility (Day 6)

**Complexity**: Medium

**Tasks**:
1. Keyboard navigation:
   - Tab order through all interactive elements
   - Focus trap within drawer
   - ESC to close
   - Cmd/Ctrl + Arrow shortcuts
2. ARIA attributes:
   - `role="dialog"`, `aria-modal="true"`
   - `aria-labelledby` for header
   - Status announcements for screen readers
3. Mobile responsive:
   - 90vw width on mobile
   - Touch gestures (swipe to close)
   - Larger touch targets (44x44px)
4. Animation refinement:
   - Smooth enter/exit transitions
   - Micro-interactions on buttons
   - Loading skeletons

**Deliverables**:
- WCAG 2.1 AA compliant
- Mobile-friendly layout
- Polished animations

**Dependencies**: All previous phases

---

### Phase 9: Testing & Integration (Day 7)

**Complexity**: Low-Medium

**Tasks**:
1. Unit tests for:
   - Form data parser utilities
   - Pipeline stepper state transitions
   - Auto-save debounce logic
2. Integration testing:
   - Drawer open/close flow
   - API error handling
   - Optimistic update rollback
3. E2E testing:
   - Full lead processing workflow
   - Navigation between leads
   - Archive with undo

**Deliverables**:
- Test coverage > 80%
- All acceptance criteria verified
- Bug fixes from testing

**Dependencies**: All previous phases

---

## 7. File Structure Summary

```
picasso-analytics-dashboard/
  src/
    components/
      lead-workspace/
        LeadWorkspaceDrawer.tsx       # Main drawer container
        DrawerHeader.tsx              # Sticky header
        MetadataGrid.tsx              # Attribution info
        PipelineStepper.tsx           # Status transitions
        FormDataManifest.tsx          # Parsed form fields
        LeadVoiceBlock.tsx            # Comments highlight
        CommunicationsCard.tsx        # Email contact
        InternalNotesSection.tsx      # Notes with auto-save
        TerminalActions.tsx           # Next/Archive buttons
        hooks/
          useAutoSave.ts              # Debounced save hook
          useLeadQueue.ts             # Next lead navigation
        utils/
          formDataParser.ts           # snake_case -> Title Case
          emailTemplates.ts           # Subject line templates
        index.ts                      # Barrel export
      shared/
        Toast.tsx                     # NEW: Toast notification component
    services/
      analyticsApi.ts                 # Extended with PATCH endpoints
    types/
      analytics.ts                    # Extended with Lead types
    pages/
      Dashboard.tsx                   # Modified: drawer state + trigger
```

---

## 8. CSS Additions (Premium Emerald Design System)

All CSS additions follow the Premium Emerald Design System documented in `/docs/STYLE_GUIDE.md`.

```css
/* src/index.css - Additions */

/* ========================================
   LEAD WORKSPACE DRAWER - Premium Emerald Design
   Follows STYLE_GUIDE.md specifications
   ======================================== */

.lead-workspace-drawer {
  @apply fixed top-0 right-0 h-full z-50 overflow-hidden;
  width: 576px; /* max-w-xl */
  background: #0F172A; /* slate-900 */
  /* Premium elevation - deeper than standard cards */
  box-shadow: -16px 0 48px rgba(0, 0, 0, 0.25),
              -8px 0 24px rgba(0, 0, 0, 0.15);
  transform: translateX(100%);
  transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

.lead-workspace-drawer.open {
  transform: translateX(0);
}

@media (max-width: 640px) {
  .lead-workspace-drawer {
    width: 90vw;
  }
}

/* Drawer backdrop - Glassmorphic blur */
.drawer-backdrop {
  @apply fixed inset-0 z-40;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 300ms ease;
}

.drawer-backdrop.open {
  opacity: 1;
  pointer-events: auto;
}

/* ========================================
   DRAWER CARDS - Super-ellipse geometry
   Style Guide: rounded-[2rem] (32px)
   ======================================== */

.drawer-card {
  @apply p-6 border border-slate-700;
  border-radius: 1.5rem; /* 24px - interior cards */
  background: rgba(30, 41, 59, 0.6); /* slate-800 @ 60% */
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* ========================================
   PIPELINE STEPPER - Interactive states
   Style Guide: hover:scale-[1.03] active:scale-[0.97]
   ======================================== */

.pipeline-stepper-btn {
  @apply flex flex-col items-center gap-2 px-5 py-4 border-2 cursor-pointer;
  border-radius: 1.25rem; /* 20px - super-ellipse */
  transition: all 200ms ease;
}

.pipeline-stepper-btn:hover {
  transform: scale(1.03);
  border-color: #50C878;
  /* Style Guide: emerald glow on hover */
  box-shadow: 0 0 0 4px rgba(80, 200, 120, 0.15);
}

.pipeline-stepper-btn:active {
  transform: scale(0.97);
}

.pipeline-stepper-btn.completed {
  background: #50C878;
  border-color: #50C878;
  color: white;
  /* Style Guide: colored shadow on active/success states */
  box-shadow: 0 8px 24px -4px rgba(80, 200, 120, 0.4);
}

.pipeline-stepper-btn.current {
  border-color: #50C878;
  background: rgba(80, 200, 120, 0.08);
}

/* ========================================
   LEAD VOICE BLOCK - Quote styling
   Style Guide: emerald accent border
   ======================================== */

.lead-voice-block {
  @apply p-6;
  border-radius: 1.25rem; /* 20px */
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%);
  border-left: 4px solid #50C878;
}

/* ========================================
   COMMUNICATIONS CARD - Interactive card
   Style Guide: hover effects with emerald glow
   ======================================== */

.communications-card {
  @apply border-2 border-slate-700 p-6;
  border-radius: 1.5rem; /* 24px */
  transition: all 200ms ease;
}

.communications-card:hover {
  border-color: #50C878;
  /* Style Guide: emerald glow shadow */
  box-shadow: 0 0 0 4px rgba(80, 200, 120, 0.15),
              0 8px 24px -4px rgba(80, 200, 120, 0.2);
  transform: scale(1.02);
}

/* ========================================
   TERMINAL ACTIONS - Primary & Secondary CTAs
   Style Guide: rounded-[2rem], colored shadows
   ======================================== */

/* Primary CTA - "Next Lead" */
.btn-next-lead {
  @apply px-8 py-4 text-white font-semibold;
  border-radius: 2rem; /* 32px - Style Guide CTA radius */
  background-color: #50C878;
  /* Style Guide: colored shadow for primary CTAs */
  box-shadow: 0 16px 32px -8px rgba(80, 200, 120, 0.4),
              0 6px 12px -6px rgba(80, 200, 120, 0.3);
  transition: all 200ms ease;
}

.btn-next-lead:hover {
  transform: scale(1.03);
  box-shadow: 0 20px 40px -10px rgba(80, 200, 120, 0.5),
              0 8px 16px -8px rgba(80, 200, 120, 0.4);
}

.btn-next-lead:active {
  transform: scale(0.97);
}

.btn-next-lead:disabled {
  @apply opacity-50 cursor-not-allowed;
  transform: none;
  box-shadow: none;
}

/* Secondary CTA - "Archive Lead" */
.btn-archive {
  @apply px-6 py-3 font-semibold border-2;
  border-radius: 2rem; /* 32px - Style Guide CTA radius */
  border-color: rgba(244, 63, 94, 0.3);
  color: #fb7185; /* rose-400 */
  transition: all 200ms ease;
}

.btn-archive:hover {
  background: rgba(244, 63, 94, 0.1);
  border-color: rgba(244, 63, 94, 0.5);
  transform: scale(1.03);
}

.btn-archive:active {
  transform: scale(0.97);
}

/* Ghost Button - "Save & Exit" */
.btn-ghost {
  @apply px-6 py-3 font-semibold border-2 border-slate-600;
  border-radius: 2rem;
  color: #94a3b8; /* slate-400 */
  transition: all 200ms ease;
}

.btn-ghost:hover {
  @apply bg-slate-800 border-slate-500;
  transform: scale(1.02);
}

/* ========================================
   AVIATION-STYLE LABELS
   Style Guide: text-[10px] font-black uppercase tracking-[0.2em]
   ======================================== */

.label-aviation {
  @apply text-[10px] font-black uppercase;
  letter-spacing: 0.2em;
  color: #50C878;
}

.label-aviation-muted {
  @apply text-[10px] font-black uppercase;
  letter-spacing: 0.2em;
  color: #64748b; /* slate-500 */
}

/* ========================================
   METADATA GRID - Attribution info
   ======================================== */

.metadata-badge {
  @apply px-3 py-1.5 text-xs font-semibold;
  border-radius: 2rem; /* pill shape */
}

.metadata-badge-emerald {
  background: rgba(80, 200, 120, 0.12);
  color: #50C878;
}

.metadata-badge-blue {
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}

.metadata-badge-slate {
  background: rgba(148, 163, 184, 0.12);
  color: #94a3b8;
}

/* ========================================
   DRAWER SCROLLBAR - Emerald accent
   Style Guide: 4px thin, emerald-tinted
   ======================================== */

.lead-workspace-drawer ::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.lead-workspace-drawer ::-webkit-scrollbar-track {
  background: transparent;
}

.lead-workspace-drawer ::-webkit-scrollbar-thumb {
  border-radius: 9999px;
  background-color: rgba(80, 200, 120, 0.3);
  transition: background-color 200ms ease;
}

.lead-workspace-drawer ::-webkit-scrollbar-thumb:hover {
  background-color: rgba(80, 200, 120, 0.5);
}

/* Firefox scrollbar */
.lead-workspace-drawer * {
  scrollbar-width: thin;
  scrollbar-color: rgba(80, 200, 120, 0.3) transparent;
}

/* ========================================
   INTERNAL NOTES - Auto-expanding textarea
   ======================================== */

.notes-textarea {
  @apply w-full px-4 py-3 border-2 border-slate-700 text-sm text-slate-200;
  @apply focus:border-emerald-400 focus:outline-none resize-none;
  border-radius: 1rem; /* 16px */
  background: rgba(30, 41, 59, 0.4);
  transition: border-color 200ms ease, box-shadow 200ms ease;
  min-height: 100px;
}

.notes-textarea:focus {
  box-shadow: 0 0 0 3px rgba(80, 200, 120, 0.1);
}

/* Save indicator */
.save-indicator {
  @apply text-xs font-medium;
  transition: opacity 200ms ease;
}

.save-indicator.saving {
  color: #fbbf24; /* amber-400 */
}

.save-indicator.saved {
  color: #50C878;
}
```

---

## 9. Risk Mitigation

| Risk | Mitigation Strategy |
|------|---------------------|
| **API endpoints not ready** | Use mock data in drawer until backend complete; extend existing mock pattern |
| **Performance with large form data** | Implement virtualization if > 30 fields; lazy load manifest section |
| **Race conditions on status update** | Implement optimistic locking with version field; show conflict toast |
| **Mobile UX issues** | Test on iPhone SE viewport; use CSS container queries |
| **Email client compatibility** | Provide copy-to-clipboard fallback; log `EMAIL_CLIENT_FALLBACK` events |

---

## 10. Success Metrics Tracking

### Frontend Events to Emit

```typescript
// Analytics events for drawer usage tracking
const DRAWER_EVENTS = {
  DRAWER_OPENED: 'drawer_opened',
  STATUS_UPDATED: 'status_updated',
  EMAIL_INITIATED: 'email_initiated',
  EMAIL_COPIED: 'email_copied',
  NOTES_SAVED: 'notes_saved',
  LEAD_ARCHIVED: 'lead_archived',
  NEXT_LEAD_CLICKED: 'next_lead_clicked',
  DRAWER_CLOSED: 'drawer_closed',
};
```

---

## 11. Estimated Timeline

| Phase | Days | Dependencies |
|-------|------|--------------|
| Phase 1: Foundation | 1 | None |
| Phase 2: Header & Metadata | 0.5 | Phase 1 |
| Phase 3: Pipeline Stepper | 1 | Phase 2, API |
| Phase 4: Form Data Manifest | 1 | Phase 2 |
| Phase 5: Communications Card | 0.5 | Phase 2 |
| Phase 6: Internal Notes | 0.5 | Phase 2, API |
| Phase 7: Terminal Actions | 1 | Phases 3, 6, API |
| Phase 8: Polish & Accessibility | 1 | All |
| Phase 9: Testing | 1 | All |
| **Total** | **7 days** | |

---

## 12. Critical Files for Implementation

| File | Purpose |
|------|---------|
| `src/pages/Dashboard.tsx` | Core integration point: add drawer state, wire up DataTable actions |
| `src/components/shared/DataTable.tsx` | Reference for `renderActions` prop pattern |
| `src/types/analytics.ts` | Extend with `PipelineStatus`, `LeadWorkspaceData` types |
| `src/services/analyticsApi.ts` | Add PATCH endpoints for status/notes updates |
| `src/index.css` | Add glassmorphic drawer styles, pipeline stepper CSS |

---

## 13. Definition of Done

### Per Phase
- [ ] Code compiles without TypeScript errors
- [ ] Eslint passes with no warnings
- [ ] Component renders correctly in browser
- [ ] Responsive on mobile (375px) and desktop (1440px)
- [ ] **Matches Premium Emerald Design System (STYLE_GUIDE.md)**

### Style Guide Compliance (Required for Each Component)
- [ ] Typography: Plus Jakarta Sans, correct font weights
- [ ] Aviation labels: text-[10px] font-black uppercase tracking-[0.2em]
- [ ] Border radius: Super-ellipse geometry (1.25rem - 2rem)
- [ ] Primary CTAs: rounded-[2rem], emerald colored shadow glow
- [ ] Secondary CTAs: rounded-[2rem], ghost button styling
- [ ] Motion: hover:scale-[1.03], active:scale-[0.97]
- [ ] Scrollbar: 4px emerald-tinted
- [ ] Elevation: Uses --elevation-* CSS variables where applicable
- [ ] Colors: Uses #50C878 for primary, rose-* for danger/archive

### Feature Complete
- [ ] All 9 phases implemented
- [ ] Unit test coverage > 80%
- [ ] E2E tests pass
- [ ] Accessibility audit passes (WCAG 2.1 AA)
- [ ] Performance: Drawer opens < 200ms
- [ ] **Visual QA against Style Guide** (/docs/STYLE_GUIDE.md)
- [ ] Documentation updated

---

## 14. Style Guide Quick Reference

For implementation, refer to these key Style Guide sections:

| Element | Style Guide Reference | CSS Class / Value |
|---------|----------------------|-------------------|
| **Typography** | Plus Jakarta Sans | Loaded in index.css |
| **Aviation Labels** | Section 2 - Typography | `.label-aviation`, `.label-aviation-muted` |
| **Border Radius** | Section 4 | 1.25rem (20px) to 2rem (32px) |
| **Primary CTA** | Section 7 - Buttons | `.btn-next-lead` |
| **Secondary CTA** | Section 7 - Buttons | `.btn-archive`, `.btn-ghost` |
| **Card Elevation** | Section 5 | Use --elevation-* variables |
| **Emerald Color** | Section 1 | #50C878 |
| **Motion** | Section 8 | hover:scale-[1.03] active:scale-[0.97] |
| **Scrollbar** | Section 9 | 4px emerald-tinted |

**Full Style Guide**: `/docs/STYLE_GUIDE.md`

---

*Implementation Plan Version 1.1*
*Last Updated: 2025-12-28*
*Updated to align with Premium Emerald Design System (STYLE_GUIDE.md)*
