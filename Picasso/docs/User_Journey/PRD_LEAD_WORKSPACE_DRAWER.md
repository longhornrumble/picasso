# Product Requirements Document: Emerald High-Velocity Lead Workspace (Drawer)

---

## Document Control

| Attribute | Value |
|-----------|-------|
| **Document ID** | PRD-PICASSO-2025-001 |
| **Status** | **IMPLEMENTED** |
| **Version** | 1.1 |
| **Author** | Senior Product Manager, Mission Intelligence |
| **Target Release** | v4.2.0-STABLE |
| **Last Updated** | 2025-12-30 |
| **Approval Required** | Engineering Lead, Design Director, Product VP |

### Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2025-12-15 | PM Team | Initial draft from stakeholder interviews |
| 0.5 | 2025-12-20 | PM Team | Added technical architecture and API specs |
| 1.0 | 2025-12-28 | Senior PM | Final review - ready for stakeholder approval |
| 1.1 | 2025-12-30 | Engineering | **IMPLEMENTED** - Frontend and backend complete |

### Implementation Status

| Component | Status | Details |
|-----------|--------|---------|
| **Frontend Components** | ✅ Complete | All 8 components built and tested |
| **Backend API Endpoints** | ✅ Complete | 5 endpoints in Analytics_Dashboard_API |
| **DynamoDB Schema** | ✅ Complete | GSI and all fields present |
| **Form Submission Init** | ✅ Complete | Bedrock handler initializes pipeline fields |
| **API Client Integration** | ✅ Complete | TypeScript types and fetch methods |

---

## 1. Executive Summary

The **Emerald High-Velocity Lead Workspace Drawer** is the central operational hub for processing inbound form submissions within the Picasso Analytics Dashboard. This feature enables high-volume intake administrators to view, contact, annotate, and transition leads without navigating away from the primary analytics dashboard.

**Business Impact**: By reducing lead processing time from an estimated 3-5 minutes to under 60 seconds per record, this feature directly accelerates conversion velocity for mission-critical volunteer and donor acquisition pipelines.

**Design Philosophy**: The workspace prioritizes speed, semantic clarity, and direct data transparency from DynamoDB, presenting technical backend data in human-readable formats while maintaining the Premium Emerald Design System aesthetic (#50C878 brand color, Plus Jakarta Sans typography, Super-Ellipse geometry).

---

## Visual Reference: Design Mockup

The Lead Workspace Drawer slides in from the right side of the viewport, maintaining the dashboard context with a frosted glass blur effect.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              MAIN DASHBOARD (BLURRED)                           │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │ MyRecruiter    CONVERSATIONS   FORMS   ATTRIBUTION        ENTERPRISE ADMIN  ││
│  ├─────────────────────────────────────────────────────────────────────────────┤│
│  │                                                         ╔═════════════════╗ ││
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  (blurred funnel)                   ║ LEAD WORKSPACE  ║ ││
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓                                          ║ REF: SUB_82931  ║ ││
│  │  ▓▓▓▓▓▓▓▓▓                                              ║                 ║ ││
│  │                                                         ║ Sarah Jenkins   ║ ││
│  │  1,240      322        521                              ║ ─────────────── ║ ││
│  │  (blurred KPIs)                                         ║ PROGRAM ID      ║ ││
│  │                                                         ║ EMERALD_CORE_V1 ║ ││
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                    ║ ZIP: 90210      ║ ││
│  │  (blurred performance cards)                            ║                 ║ ││
│  │                                                         ║ EXECUTION PHASE ║ ││
│  │  78.2%    64.5%    52.1%    45.8%                       ║ [NEW]  REVIEW   ║ ││
│  │                                                         ║ CONTACTED       ║ ││
│  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                    ║                 ║ ││
│  │  (Recent Submissions table with ellipsis actions)       ║ PRIMARY CONTACT ║ ││
│  │                                                         ║ ✉ sarah.j@email ║ ││
│  │  Sarah Jenkins    sarah.j@email   (555)123-4567  ⋮      ║                 ║ ││
│  │  Michael Chen     m.chen@email    (555)234-5678  ⋮      ║ FORM MANIFEST   ║ ││
│  │  Jessica Ford     jess.ford@...   (555)345-6789  ⋮      ║ First: Sarah    ║ ││
│  │                                                         ║ Last: Jenkins   ║ ││
│  │                                                         ║ Interests: ...  ║ ││
│  │                                                         ║                 ║ ││
│  │                                                         ║ WORKSPACE NOTES ║ ││
│  │                                                         ║ [Live Sync ✓]   ║ ││
│  │                                                         ║                 ║ ││
│  │                                                         ║ [ARCHIVE] [NEXT]║ ││
│  └─────────────────────────────────────────────────────────║ SAVE & EXIT     ║─┘│
│                                                            ╚═════════════════╝  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Entry Point: Actions Ellipsis (⋮)

Users click the **Actions ellipsis** (⋮) in the Recent Submissions table row to open the Lead Workspace Drawer for that specific record.

### Key Visual Elements

| Element | Specification |
|---------|---------------|
| **Drawer Width** | `max-w-xl` (576px) |
| **Background Blur** | `backdrop-blur-sm` on overlay |
| **Header Badge** | Emerald pill with REF ID |
| **Stepper States** | NEW (lit) → REVIEWING → CONTACTED |
| **Primary Contact Card** | Emerald glow on hover |
| **Form Manifest** | Parsed JSON → Title Case labels |
| **Notes Section** | Auto-expanding with "Live Sync Active" |
| **Action Buttons** | "Archive" (rose) + "Next Record" (emerald) |

---

## 2. Problem Statement

### Current State
Intake administrators currently face **"context switching fatigue"** when processing form submissions:

1. **Navigation Overhead**: Moving between list views and detail screens causes loss of context and workflow momentum
2. **Data Opacity**: DynamoDB JSON blobs with snake_case keys and nested structures are technically opaque to non-developer administrators
3. **Fragmented Actions**: Contact operations, status updates, and note-taking require multiple application contexts
4. **Progress Tracking**: No visual indication of pipeline position or next-action clarity

### Impact
- Average processing time: 3-5 minutes per lead
- Context retention: 40% of admins report losing track of which records they've processed
- Data extraction: 60% of form submission data goes unreviewed due to access friction

### Desired State
A unified workspace that:
- Reduces lead processing time to under 60 seconds
- Surfaces DynamoDB technical data in human-readable manifests
- Maintains dashboard context with non-destructive overlay UI
- Provides single-click status transitions with clear visual feedback

---

## 3. Target Users

### Primary Persona: The Mission Admin

**Profile**:
- Role: Intake Coordinator / Volunteer Operations Manager
- Volume: 100-500 submissions per day
- Technical Comfort: Medium (can use CRM systems, uncomfortable with raw JSON)
- Primary Goals: Speed, accuracy, clear follow-up paths

**Workflow Requirements**:
- High-density information display
- Tactile UI feedback for confidence in actions taken
- Immediate visibility into: Who (name), Where (zip), What (form data), When (timestamp)
- Single-screen context for multi-action workflows (review → contact → annotate → transition)

**Pain Points**:
- Losing place in large submission queues
- Uncertainty about whether data was saved
- Manual copy-paste for email composition
- Unclear differentiation between volunteer vs. donor leads

---

## 4. Jobs-to-be-Done

When processing a new form submission, the Mission Admin needs to:

1. **JTBD-1**: Quickly assess lead identity and origin (name, zip, submission type)
2. **JTBD-2**: Review complete form responses without technical jargon or raw JSON
3. **JTBD-3**: Update pipeline status with single-click confidence
4. **JTBD-4**: Initiate contact via pre-composed email with contextual subject lines
5. **JTBD-5**: Record internal observations for team handoff or future reference
6. **JTBD-6**: Move to next lead in queue without closing workspace context
7. **JTBD-7**: Archive processed leads to maintain clean active workspace

---

## 5. Non-Functional Requirements

### Performance
- **NFR-1**: Drawer open animation must complete in < 200ms
- **NFR-2**: DynamoDB queries for lead detail must return in < 500ms (p95)
- **NFR-3**: Auto-save on notes must debounce at 1 second with optimistic UI update
- **NFR-4**: "Next Lead" navigation must feel instantaneous (< 100ms perceived latency)

### Accessibility
- **NFR-5**: WCAG 2.1 AA compliance (4.5:1 contrast ratio minimum)
- **NFR-6**: Full keyboard navigation support (Tab, Shift+Tab, Esc to close)
- **NFR-7**: Screen reader compatibility for all status indicators and form labels

### Scalability
- **NFR-8**: Must handle lead records with up to 50 form fields without layout degradation
- **NFR-9**: Notes field must support up to 2,000 characters with graceful overflow

### Security
- **NFR-10**: All PII (email, name, comments) must be masked in client-side logs
- **NFR-11**: Status updates must validate user permissions before allowing transitions

---

## 6. Out of Scope

The following capabilities are explicitly excluded from v4.2.0:

1. **Bulk Operations**: Multi-select and batch status updates (planned for v4.3)
2. **Lead Assignment**: Routing submissions to specific team members (requires org structure config)
3. **Custom Pipeline States**: Beyond [New, Reviewing, Contacted] (v4.4 customization engine)
4. **SMS/Phone Integration**: Telephony beyond mailto links (requires third-party integration)
5. **Lead DNA Visualization**: Path-to-purchase referral mapping (future roadmap)
6. **Ghost Notes**: Inline list-view editing without opening drawer (v4.5)
7. **Snooze Function**: Temporary lead hiding with follow-up dates (v4.3)
8. **Export to CRM**: Salesforce/HubSpot sync (post-v4.5 integrations track)

---

## 7. Functional Requirements

### 7.1 Workspace Navigation & Header

**FR-1.1**: Drawer must slide in from the right edge of viewport with smooth easing (cubic-bezier)

**FR-1.2**: Panel width must be exactly `max-w-xl` (Tailwind: 576px) with responsive fallback to 90vw on mobile

**FR-1.3**: Background overlay must apply `backdrop-blur-sm` and `bg-black/40` for spatial context preservation

**FR-1.4**: Header must remain sticky during scroll with the following hierarchy:
```
┌─────────────────────────────────────────────────┐
│ [X Close]               Lead Workspace    [Next]│
├─────────────────────────────────────────────────┤
│ Ref: FORM_aus123_20251228_1234              🔵  │
│ Sarah Martinez                                  │
│ Program: AUS123957 | Zip: 78701                 │
└─────────────────────────────────────────────────┘
```

**FR-1.5**: Close action (X button or ESC key) must save draft notes before dismissing

---

### 7.2 Metadata & Attribution Grid

**FR-2.1**: Technical context grid must display:
- **Ref ID**: DynamoDB partition key (e.g., `FORM_aus123_20251228_1234`)
- **Lead Name**: `full_name` field with fallback to `first_name + last_name`
- **Program ID**: `tenant_id` with tooltip showing full tenant name
- **Zip Code**: `zip_code` field for geographic qualification
- **Timestamp**: Submission datetime in `MMM DD, YYYY h:mm A` format (e.g., "Dec 28, 2025 2:34 PM")

**FR-2.2**: Source Badge must use semantic color-coding:
- **Volunteer Submissions**: Emerald background (#50C878) with white text
- **Donor Inquiries**: Blue background (#3B82F6) with white text
- **General Contact**: Slate background (#64748B) with white text

**FR-2.3**: Badge must be determined by `submission_type` field from DynamoDB

---

### 7.3 Pipeline Execution (Status Stepper)

**FR-3.1**: Standard pipeline states must be:
1. **New**: Default state for unprocessed submissions
2. **Reviewing**: Admin has opened the drawer and is actively assessing
3. **Contacted**: Admin has initiated outreach (email sent or attempted)

**FR-3.2**: Visual stepper representation:
```
┌─────────────────────────────────────────────────┐
│  Pipeline Status                                │
│                                                 │
│  [●] New  →  [○] Reviewing  →  [○] Contacted   │
│                                                 │
│  Click any state to update                      │
└─────────────────────────────────────────────────┘
```

**FR-3.3**: State transition behavior:
- Clicking a state button immediately triggers backend PATCH request
- Optimistic UI update: button visually "lights up" before API response
- Current state indicated by filled circle (●), future states by outline (○)
- Completed states show checkmark instead of circle (✓)

**FR-3.4**: Backend sync requirements:
- Endpoint: `PATCH /api/forms/submissions/{ref_id}`
- Payload: `{ "pipeline_status": "reviewing" }`
- Response: Updated submission object with `updated_at` timestamp

**FR-3.5**: On successful update, show toast notification: "Status updated to [State]"

**FR-3.6**: On failure, revert optimistic update and show error: "Failed to update status. Retry?"

---

### 7.4 Form Data Manifest (JSON Parser)

**The Challenge**: DynamoDB stores `form_data_json` as a blob with snake_case keys like:
```json
{
  "full_name": "Sarah Martinez",
  "email_address": "sarah@example.com",
  "zip_code": "78701",
  "volunteer_interests": ["canvassing", "phone_banking"],
  "availability": "weekends",
  "comments": "I'm passionate about education reform and want to help!"
}
```

**The Solution**: The Form Data Manifest parser must transform this into human-readable output.

**FR-4.1**: Parser logic:
1. Extract `comments` field first (if present)
2. Iterate over remaining key-value pairs
3. Transform snake_case keys to Title Case (e.g., `email_address` → "Email Address")
4. Format arrays as comma-separated strings (e.g., `["canvassing", "phone_banking"]` → "Canvassing, Phone Banking")
5. Skip system fields: `tenant_id`, `submission_id`, `created_at`, `updated_at`

**FR-4.2**: Comments block (prioritized display):
```
┌─────────────────────────────────────────────────┐
│ 💬 Lead Voice                                   │
│                                                 │
│ "I'm passionate about education reform and      │
│  want to help!"                                 │
│                                                 │
│  — Sarah's comments                             │
└─────────────────────────────────────────────────┘
```

**FR-4.3**: Form fields grid:
```
┌─────────────────────────────────────────────────┐
│ Full Name:              Sarah Martinez          │
│ Email Address:          sarah@example.com       │
│ Zip Code:               78701                   │
│ Volunteer Interests:    Canvassing, Phone...    │
│ Availability:           Weekends                │
└─────────────────────────────────────────────────┘
```

**FR-4.4**: Long text values must truncate at 50 characters with "..." and expand on click

**FR-4.5**: Boolean values must render as "Yes" / "No" instead of `true` / `false`

**FR-4.6**: Null or empty values must show as "—" (em dash) in slate-400 color

---

### 7.5 Communications Channel

**FR-5.1**: Primary action card must construct a `mailto:` link with:
- **To**: `email_address` from form data
- **Subject**: Dynamic based on submission type:
  - Volunteer: "Thank you for volunteering with [Program Name]"
  - Donor: "Thank you for your interest in supporting [Program Name]"
  - General: "Thank you for contacting [Program Name]"
- **Body**: Pre-filled template with admin signature placeholder

**FR-5.2**: Card visual design:
```
┌─────────────────────────────────────────────────┐
│  📧 Contact Lead                                │
│                                                 │
│  sarah@example.com                              │
│                                                 │
│  [Send Email →]                                 │
│                                                 │
│  Subject: Thank you for volunteering with...    │
└─────────────────────────────────────────────────┘
```

**FR-5.3**: Hover state must apply Emerald glow effect:
- Border color: `#50C878`
- Box shadow: `0 0 0 3px rgba(80, 200, 120, 0.1)`
- Scale transform: `scale(1.01)`

**FR-5.4**: Click action must open default email client and log "EMAIL_INITIATED" event to analytics

**FR-5.5**: If `email_address` is missing, show disabled state with message: "No email address provided"

---

### 7.6 Operational Workspace (Internal Notes)

**FR-6.1**: Notes section must include:
- Text area with auto-expanding height (min 4 rows, max 12 rows)
- Character counter displaying `{current} / 2000`
- Placeholder text: "Add internal notes about this lead (visible only to your team)..."

**FR-6.2**: Auto-save behavior:
- Debounce user input at 1 second
- Show "Saving..." indicator during API call
- Show "Saved ✓" indicator on success (2 second timeout)
- Show "Draft saved locally" if offline

**FR-6.3**: Backend sync:
- Endpoint: `PATCH /api/forms/submissions/{ref_id}/notes`
- Payload: `{ "internal_notes": "text content" }`
- Optimistic update: Display typed text immediately

**FR-6.4**: Visual design:
```
┌─────────────────────────────────────────────────┐
│ 📝 Internal Notes                               │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ Follow up on education reform interest.     │ │
│ │ Strong candidate for field organizing.      │ │
│ │                                             │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ 145 / 2000                       Saved ✓        │
└─────────────────────────────────────────────────┘
```

**FR-6.5**: Notes must persist across drawer close/reopen cycles

---

### 7.7 Terminal Command Actions

**FR-7.1**: Next Lead Button:
- Position: Top-right corner of sticky header (next to Close button)
- Action: Close current drawer and immediately open next unprocessed lead
- Logic: Query for next submission in current filter set with `pipeline_status = "new"`
- Visual feedback: Button must show loading spinner during fetch
- Keyboard shortcut: `Cmd/Ctrl + →`

**FR-7.2**: Archive Button:
- Position: Bottom of drawer (secondary action zone)
- Color: Rose background (#F43F5E) to signify removal action
- Action: Update `pipeline_status` to "archived" and close drawer
- Confirmation: Require click-hold for 1 second OR double-click to prevent accidents
- Toast on success: "Lead archived. Undo?" (with 5-second undo window)

**FR-7.3**: Visual hierarchy:
```
┌─────────────────────────────────────────────────┐
│                                                 │
│  [Next Lead →]  (Primary - Emerald)             │
│                                                 │
│  [Archive Lead]  (Secondary - Rose, outline)    │
│                                                 │
└─────────────────────────────────────────────────┘
```

**FR-7.4**: Tactile feedback:
- All buttons must apply `scale-[0.98]` transform on click
- Active state duration: 100ms before reverting to normal scale

---

## 8. Acceptance Criteria

### AC-1: Drawer Launch & Navigation
1. Clicking a lead from Forms Dashboard opens drawer in < 200ms
2. Background dashboard dims with blur effect
3. Drawer width is exactly 576px on desktop, 90vw on mobile
4. ESC key closes drawer and saves draft notes
5. "Next Lead" button cycles through unprocessed submissions without closing drawer

### AC-2: Header & Metadata Display
1. Ref ID displays DynamoDB partition key in monospace font
2. Lead name displays `full_name` or concatenates `first_name + last_name`
3. Program ID shows `tenant_id` with tooltip containing full tenant name
4. Zip code displays `zip_code` field with proper formatting
5. Timestamp shows submission time in "MMM DD, YYYY h:mm A" format
6. Source badge color matches submission type (Emerald = volunteer, Blue = donor)

### AC-3: Pipeline Status Stepper
1. Three states visible: New, Reviewing, Contacted
2. Current state shows filled circle (●), future states show outline (○)
3. Clicking any state triggers PATCH request to backend
4. Optimistic UI updates state immediately before API response
5. Success toast shows "Status updated to [State]"
6. Failure reverts UI and shows error message with retry option
7. Completed states show checkmark (✓) instead of circle

### AC-4: Form Data Manifest Parser
1. Comments field (if present) displays in prioritized "Lead Voice" block
2. All snake_case keys convert to Title Case labels
3. Arrays format as comma-separated strings
4. Boolean values render as "Yes" / "No"
5. Null/empty values show as "—" in slate-400
6. System fields (tenant_id, created_at, etc.) are excluded from display
7. Values over 50 characters truncate with "..." and expand on click
8. Manifest handles up to 50 form fields without layout breaking

### AC-5: Communications Channel
1. "Contact Lead" card displays email address from form data
2. Subject line dynamically generates based on submission type
3. Mailto link opens default email client on click
4. Hover applies Emerald glow effect (border, shadow, scale)
5. Missing email shows disabled state with explanation message
6. Click logs "EMAIL_INITIATED" event to analytics pipeline

### AC-6: Internal Notes Workspace
1. Text area auto-expands from 4 to 12 rows based on content
2. Character counter displays "{current} / 2000"
3. Input debounces at 1 second before triggering save
4. "Saving..." indicator appears during API call
5. "Saved ✓" indicator shows for 2 seconds on success
6. Offline saves show "Draft saved locally" message
7. Notes persist across drawer close/reopen cycles

### AC-7: Terminal Command Actions
1. "Next Lead" button queries for next `pipeline_status = "new"` submission
2. "Next Lead" shows loading spinner during fetch
3. Keyboard shortcut `Cmd/Ctrl + →` triggers "Next Lead" action
4. "Archive Lead" requires click-hold (1s) OR double-click to execute
5. Archive updates `pipeline_status` to "archived" and closes drawer
6. Archive shows toast with 5-second undo window
7. All buttons apply `scale-[0.98]` transform on click for 100ms

### AC-8: Design System Compliance
1. All Emerald accents use exact hex #50C878
2. Typography uses Plus Jakarta Sans font family
3. Metric numbers use weight 900 (Black)
4. Buttons use Super-Ellipse geometry (rounded-lg with slight squircle)
5. Glassmorphic effect on drawer background (backdrop-blur-sm)
6. WCAG 2.1 AA contrast ratios (4.5:1 minimum) on all text

### AC-9: Performance & Responsiveness
1. Drawer open animation completes in < 200ms
2. DynamoDB detail query returns in < 500ms (p95)
3. Auto-save debounce triggers at 1 second
4. "Next Lead" navigation feels instantaneous (< 100ms perceived latency)
5. No layout shift when expanding truncated field values
6. Smooth scroll performance with sticky header on mobile

### AC-10: Error Handling & Edge Cases
1. Missing form fields display "—" instead of breaking layout
2. Malformed JSON in `form_data_json` shows error message instead of crashing
3. API timeout (> 10s) shows retry button instead of infinite spinner
4. Concurrent edit conflicts show warning: "This lead was updated by another user"
5. Empty leads queue (no "New" submissions) disables "Next Lead" button with tooltip

---

## 9. Success Metrics & KPIs

### Primary Metrics (Must Track)

**M-1: Processing Velocity**
- **Metric**: Average time from drawer open to pipeline status = "Contacted"
- **Baseline**: 3-5 minutes (estimated from user interviews)
- **Target**: < 60 seconds (80% of sessions by week 4 post-launch)
- **Measurement**: Analytics event timestamps (`DRAWER_OPENED` → `STATUS_CONTACTED`)

**M-2: Completion Rate**
- **Metric**: % of opened drawers that result in status update OR internal note
- **Target**: > 85% (admins should take action on most leads they review)
- **Measurement**: (Sessions with action) / (Total drawer opens)

**M-3: Context Retention**
- **Metric**: % of admins who use "Next Lead" button vs. closing drawer to return to list
- **Target**: > 70% (indicating flow is maintained)
- **Measurement**: (`NEXT_LEAD_CLICKED` events) / (`DRAWER_CLOSED` events)

### Secondary Metrics (Monitor for Insights)

**M-4: Email Initiation Rate**
- **Metric**: % of drawer sessions where "Contact Lead" button is clicked
- **Target**: > 50% (high-intent leads should trigger outreach)
- **Measurement**: (`EMAIL_INITIATED` events) / (Total drawer opens)

**M-5: Notes Utilization**
- **Metric**: % of leads with internal notes saved
- **Target**: > 60% (indicates admins find notes valuable)
- **Measurement**: Count of submissions with `internal_notes` field populated

**M-6: Archive Rate**
- **Metric**: % of leads archived vs. processed through pipeline
- **Baseline**: Unknown (new capability)
- **Target**: < 15% (most leads should progress, not get discarded)
- **Measurement**: (Archived submissions) / (Total processed submissions)

### User Experience Metrics

**M-7: Drawer Load Time**
- **Technical**: p95 latency from click to drawer fully rendered
- **Target**: < 500ms
- **Measurement**: Client-side performance marks

**M-8: Auto-Save Reliability**
- **Technical**: % of note edits successfully saved within 2 seconds
- **Target**: > 99.5%
- **Measurement**: (`NOTES_SAVE_SUCCESS` events) / (`NOTES_SAVE_ATTEMPTED` events)

**M-9: Error Rate**
- **Technical**: % of drawer sessions with API errors (4xx/5xx)
- **Target**: < 1%
- **Measurement**: Error log aggregation by session

### Business Impact Metrics (6-Month Horizon)

**M-10: Lead-to-Conversion Time**
- **Metric**: Days from submission to first meaningful engagement (event signup, donation, etc.)
- **Target**: 20% reduction vs. baseline
- **Measurement**: Cross-reference with CRM/downstream systems

**M-11: Admin Productivity**
- **Metric**: Leads processed per hour per admin
- **Baseline**: ~12-20 leads/hour (estimated)
- **Target**: > 30 leads/hour
- **Measurement**: Aggregate pipeline status transitions per user session

---

## 10. Technical Architecture

### 10.1 Frontend Architecture

**Component Hierarchy**:
```
<LeadWorkspaceDrawer>
  ├─ <DrawerHeader>
  │   ├─ <RefIdBadge />
  │   ├─ <LeadNameDisplay />
  │   ├─ <MetadataGrid />
  │   └─ <SourceBadge />
  ├─ <PipelineStepper>
  │   └─ <StatusButton /> (x3)
  ├─ <FormDataManifest>
  │   ├─ <LeadVoiceBlock />
  │   └─ <FieldValueGrid />
  ├─ <CommunicationsCard>
  │   └─ <MailtoButton />
  ├─ <InternalNotesSection>
  │   ├─ <AutoExpandingTextarea />
  │   └─ <SaveIndicator />
  └─ <TerminalActions>
      ├─ <NextLeadButton />
      └─ <ArchiveButton />
```

**State Management**:
- **Global State** (React Context or Zustand):
  - `activeLeadId`: Currently displayed lead ref_id
  - `leadsQueue`: Array of unprocessed lead IDs for "Next Lead" cycling
  - `drawerOpen`: Boolean for drawer visibility

- **Local State** (Component-level):
  - `pipelineStatus`: Current status (optimistic updates)
  - `internalNotes`: Text area content (debounced)
  - `isSaving`: Loading state for async operations

**Data Fetching**:
- Use React Query or SWR for caching and optimistic updates
- Cache key pattern: `['lead-detail', refId]`
- Stale time: 30 seconds (leads don't change frequently)
- Refetch on drawer open to ensure fresh data

### 10.2 Backend Architecture

**API Endpoints**:

```
GET /api/forms/submissions/{ref_id}
Response:
{
  "ref_id": "FORM_aus123_20251228_1234",
  "tenant_id": "AUS123957",
  "full_name": "Sarah Martinez",
  "email_address": "sarah@example.com",
  "zip_code": "78701",
  "submission_type": "volunteer",
  "pipeline_status": "new",
  "form_data_json": { ... },
  "internal_notes": "",
  "created_at": "2025-12-28T14:34:22Z",
  "updated_at": "2025-12-28T14:34:22Z"
}
```

```
PATCH /api/forms/submissions/{ref_id}
Body:
{
  "pipeline_status": "reviewing"  // Optional
  "internal_notes": "text"        // Optional
}
Response:
{
  "ref_id": "FORM_aus123_20251228_1234",
  "pipeline_status": "reviewing",
  "updated_at": "2025-12-28T15:45:10Z"
}
```

```
GET /api/forms/submissions/queue?status=new&tenant_id={tenant}&limit=100
Response:
{
  "submissions": [
    { "ref_id": "FORM_...", "created_at": "..." },
    ...
  ],
  "total": 247,
  "has_more": true
}
```

**DynamoDB Table Schema**:

```
Table: FormSubmissions
Partition Key: ref_id (String)
Sort Key: None

Attributes:
- ref_id: String (PK) - Format: "FORM_{tenant}_{date}_{random}"
- tenant_id: String (GSI PK) - For tenant-scoped queries
- submission_type: String - "volunteer" | "donor" | "general"
- pipeline_status: String - "new" | "reviewing" | "contacted" | "archived"
- created_at: String (GSI SK) - ISO 8601 timestamp
- updated_at: String - ISO 8601 timestamp
- full_name: String
- email_address: String
- zip_code: String
- form_data_json: Map - Raw form field key-value pairs
- internal_notes: String
- processed_by: String - Admin user ID who last updated
- contacted_at: String - Timestamp when status → "contacted"

GSI: TenantStatusIndex
- PK: tenant_id
- SK: created_at
- Filters: pipeline_status
```

**Lambda Function** (Python):
```python
# GET /api/forms/submissions/{ref_id}
def get_submission_handler(event):
    ref_id = event['pathParameters']['ref_id']

    response = dynamodb.get_item(
        TableName='FormSubmissions',
        Key={'ref_id': ref_id}
    )

    if 'Item' not in response:
        return {
            'statusCode': 404,
            'body': json.dumps({'error': 'Submission not found'})
        }

    return {
        'statusCode': 200,
        'body': json.dumps(response['Item'])
    }

# PATCH /api/forms/submissions/{ref_id}
def update_submission_handler(event):
    ref_id = event['pathParameters']['ref_id']
    body = json.loads(event['body'])

    update_expr = "SET updated_at = :now"
    expr_values = {':now': datetime.utcnow().isoformat()}

    if 'pipeline_status' in body:
        update_expr += ", pipeline_status = :status"
        expr_values[':status'] = body['pipeline_status']

        if body['pipeline_status'] == 'contacted':
            update_expr += ", contacted_at = :contacted"
            expr_values[':contacted'] = datetime.utcnow().isoformat()

    if 'internal_notes' in body:
        update_expr += ", internal_notes = :notes"
        expr_values[':notes'] = body['internal_notes']

    response = dynamodb.update_item(
        TableName='FormSubmissions',
        Key={'ref_id': ref_id},
        UpdateExpression=update_expr,
        ExpressionAttributeValues=expr_values,
        ReturnValues='ALL_NEW'
    )

    # Emit analytics event
    emit_event('SUBMISSION_UPDATED', {
        'ref_id': ref_id,
        'status': body.get('pipeline_status'),
        'user_id': event['requestContext']['authorizer']['userId']
    })

    return {
        'statusCode': 200,
        'body': json.dumps(response['Attributes'])
    }
```

### 10.3 Analytics Integration

**Event Schema**:
```javascript
{
  event_type: "DRAWER_OPENED" | "STATUS_UPDATED" | "EMAIL_INITIATED" | "NOTES_SAVED" | "LEAD_ARCHIVED" | "NEXT_LEAD_CLICKED",
  timestamp: "2025-12-28T15:45:10.234Z",
  session_id: "sess_abc123",
  user_id: "admin_user_42",
  tenant_id: "AUS123957",
  lead_ref_id: "FORM_aus123_20251228_1234",
  metadata: {
    previous_status: "new",
    new_status: "reviewing",
    time_in_drawer_ms: 42300
  }
}
```

**Event Emission Points**:
1. Drawer open → `DRAWER_OPENED`
2. Pipeline status click → `STATUS_UPDATED`
3. Contact button click → `EMAIL_INITIATED`
4. Notes auto-save success → `NOTES_SAVED`
5. Archive button click → `LEAD_ARCHIVED`
6. Next Lead button click → `NEXT_LEAD_CLICKED`
7. Drawer close → `DRAWER_CLOSED` (with duration)

---

## 11. Data Model

### 11.1 FormSubmission Entity

```typescript
interface FormSubmission {
  // Identity
  ref_id: string;                    // PK: "FORM_{tenant}_{date}_{random}"
  tenant_id: string;                 // GSI PK

  // Contact Info
  full_name: string;
  email_address?: string;
  phone_number?: string;
  zip_code?: string;

  // Classification
  submission_type: 'volunteer' | 'donor' | 'general';
  pipeline_status: 'new' | 'reviewing' | 'contacted' | 'archived';

  // Form Data
  form_data_json: Record<string, any>;  // Raw form fields

  // Operational
  internal_notes?: string;
  processed_by?: string;             // Admin user ID

  // Timestamps
  created_at: string;                // ISO 8601
  updated_at: string;                // ISO 8601
  contacted_at?: string;             // ISO 8601 (when status → contacted)
  archived_at?: string;              // ISO 8601 (when status → archived)
}
```

### 11.2 Frontend Display Model

```typescript
interface LeadWorkspaceData {
  // Header
  refId: string;
  leadName: string;
  programId: string;
  programName: string;              // Resolved from tenant_id
  zipCode: string;
  submissionType: 'volunteer' | 'donor' | 'general';
  timestamp: Date;

  // Pipeline
  currentStatus: PipelineStatus;
  statusHistory?: StatusTransition[];

  // Form Data
  leadVoice?: string;               // Extracted comments
  formFields: FormField[];          // Parsed & formatted

  // Communications
  emailAddress?: string;
  phoneNumber?: string;
  emailSubject: string;             // Generated based on type

  // Workspace
  internalNotes: string;
  processedBy?: string;

  // Navigation
  nextLeadId?: string;              // For "Next Lead" button
}

interface FormField {
  label: string;                    // Title Case converted
  value: string | string[];         // Formatted for display
  rawKey: string;                   // Original snake_case key
  type: 'text' | 'email' | 'tel' | 'boolean' | 'array';
}

interface StatusTransition {
  from: PipelineStatus;
  to: PipelineStatus;
  timestamp: Date;
  userId: string;
}

type PipelineStatus = 'new' | 'reviewing' | 'contacted' | 'archived';
```

### 11.3 Data Transformation Logic

**Snake Case to Title Case**:
```typescript
function snakeCaseToTitleCase(key: string): string {
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Examples:
// "email_address" → "Email Address"
// "volunteer_interests" → "Volunteer Interests"
// "zip_code" → "Zip Code"
```

**Form Data Parser**:
```typescript
function parseFormData(formDataJson: Record<string, any>): {
  leadVoice?: string;
  formFields: FormField[];
} {
  const SYSTEM_FIELDS = ['tenant_id', 'submission_id', 'created_at', 'updated_at'];
  const COMMENTS_FIELDS = ['comments', 'message', 'additional_info'];

  let leadVoice: string | undefined;
  const formFields: FormField[] = [];

  for (const [key, value] of Object.entries(formDataJson)) {
    // Skip system fields
    if (SYSTEM_FIELDS.includes(key)) continue;

    // Extract lead voice
    if (COMMENTS_FIELDS.includes(key) && value) {
      leadVoice = String(value);
      continue;
    }

    // Format field
    const field: FormField = {
      label: snakeCaseToTitleCase(key),
      value: formatFieldValue(value),
      rawKey: key,
      type: inferFieldType(value)
    };

    formFields.push(field);
  }

  return { leadVoice, formFields };
}

function formatFieldValue(value: any): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (Array.isArray(value)) {
    return value.map(v => String(v)).join(', ');
  }

  return String(value);
}
```

---

## 12. Risk Assessment & Mitigation

### Risk 1: Performance Degradation with Large Form Data
**Severity**: HIGH
**Probability**: MEDIUM

**Description**: Forms with 50+ fields or very long text responses (5000+ chars in comments) could cause drawer render lag.

**Mitigation**:
- Implement virtualized list for form fields (react-window) if count > 30
- Truncate long text at 200 characters with "Show more" expansion
- Lazy-load form data manifest only when user scrolls to that section
- Add loading skeleton during initial data fetch

**Contingency**: If p95 render time exceeds 500ms in production, implement pagination (show 20 fields at a time with "Load more")

---

### Risk 2: Race Conditions on Concurrent Edits
**Severity**: MEDIUM
**Probability**: MEDIUM

**Description**: Two admins opening the same lead simultaneously could overwrite each other's notes or status updates.

**Mitigation**:
- Implement optimistic locking with `version` field in DynamoDB
- Show toast warning if update fails due to version conflict: "This lead was updated by [Admin Name]. Refresh to see latest changes."
- Add visual indicator (yellow banner) if lead was modified in last 60 seconds by another user
- Use WebSocket or polling (every 30s) to detect concurrent sessions

**Contingency**: If conflicts become frequent (> 2% of updates), implement operational transform for notes field (CRDT-style merging)

---

### Risk 3: Email Client Compatibility Issues
**Severity**: LOW
**Probability**: MEDIUM

**Description**: `mailto:` links may not work consistently across browsers/OS (especially on Linux systems without default mail client configured).

**Mitigation**:
- Provide "Copy Email" button as alternative to direct mailto launch
- Show toast after mailto click: "Email client opened. Didn't work? [Copy email address]"
- Log `EMAIL_CLIENT_FALLBACK` event when copy button is used to track failure rate
- Document email client requirements in admin onboarding guide

**Contingency**: If > 20% of users resort to copy button, implement in-app email composer modal (v4.3 roadmap item)

---

### Risk 4: Mobile UX Degradation
**Severity**: MEDIUM
**Probability**: LOW

**Description**: Drawer UI optimized for desktop may feel cramped on tablets/phones, especially the form data grid.

**Mitigation**:
- Full-screen drawer on mobile (100vw instead of max-w-xl)
- Stack form fields vertically instead of grid layout on < 640px screens
- Increase touch target sizes to 44x44px minimum for buttons
- Test on iPhone SE (smallest common viewport) and iPad Pro
- Add swipe-to-close gesture for mobile drawer

**Contingency**: If mobile usage analytics show > 15% of admin sessions on mobile, create dedicated mobile-first layout variant

---

### Risk 5: Data Privacy Compliance
**Severity**: HIGH
**Probability**: LOW

**Description**: Displaying PII (email, phone, comments) in drawer could violate GDPR/CCPA if accessed by unauthorized users or logged improperly.

**Mitigation**:
- Require admin authentication with role-based access control (RBAC)
- Mask PII in client-side error logs (e.g., email → "s***@example.com")
- Implement audit log for all drawer opens: who, when, which lead
- Add "View access log" link in drawer footer for compliance transparency
- Encrypt `internal_notes` field at rest in DynamoDB

**Contingency**: If compliance audit identifies issues, implement field-level encryption for all PII fields and require MFA for drawer access

---

## 13. Dependencies

### Internal Dependencies

**DEP-1**: Forms Dashboard (List View)
- **Status**: Complete (v4.0)
- **Integration Point**: Drawer triggered by clicking list item
- **Risk**: None - existing functionality

**DEP-2**: Analytics Pipeline
- **Status**: Complete (v4.1)
- **Integration Point**: Event emission for drawer actions
- **Risk**: Low - analytics is fire-and-forget, no blocking dependency

**DEP-3**: Authentication Service
- **Status**: Complete (v3.5)
- **Integration Point**: User ID and permissions for RBAC
- **Risk**: None - stable system

**DEP-4**: Tenant Configuration API
- **Status**: Complete (v3.0)
- **Integration Point**: Resolve tenant_id to program name for display
- **Risk**: Low - cached in frontend, stale data acceptable

### External Dependencies

**DEP-5**: DynamoDB FormSubmissions Table
- **Status**: REQUIRES CREATION
- **Owner**: Backend Team
- **Timeline**: Week 1 (table setup + GSI)
- **Blocker Risk**: HIGH - Cannot proceed without table schema

**DEP-6**: Lambda API Endpoints
- **Status**: REQUIRES DEVELOPMENT
- **Owner**: Backend Team
- **Timeline**: Week 2-3 (GET /submissions/{id}, PATCH /submissions/{id})
- **Blocker Risk**: MEDIUM - Can use mock data in frontend during development

**DEP-7**: Design System Components
- **Status**: Partial - Button, Badge exist; Stepper and Drawer are new
- **Owner**: Design Team
- **Timeline**: Week 1 (Figma specs) → Week 2 (React components)
- **Blocker Risk**: MEDIUM - Can use temporary styling while official components finalize

### Third-Party Dependencies

**DEP-8**: React Query (or SWR)
- **Status**: Package installation required
- **Risk**: None - well-established library

**DEP-9**: Tailwind CSS (already in project)
- **Status**: Complete
- **Risk**: None

**DEP-10**: Email Clients (User's System)
- **Status**: External - no control
- **Risk**: See Risk 3 - mitigated with fallback copy button

---

## 14. Timeline & Milestones

### Phase 1: Foundation (Weeks 1-2)

**Week 1: Backend Setup**
- DynamoDB table creation with GSI (2 days)
- Lambda API endpoints implementation (3 days)
  - GET /submissions/{ref_id}
  - PATCH /submissions/{ref_id}
  - GET /submissions/queue
- API integration testing (1 day)

**Week 2: Design & Frontend Scaffolding**
- Finalize Figma specs for Drawer, Stepper, Cards (2 days)
- Implement base Drawer component with open/close (1 day)
- Build Header and Metadata Grid components (2 days)
- Integrate with Forms Dashboard list view (1 day)

**Milestone 1**: Drawer opens with static mock data on lead click

---

### Phase 2: Core Features (Weeks 3-4)

**Week 3: Data & Parser**
- Implement Form Data Manifest parser logic (2 days)
- Build Lead Voice Block and Field Value Grid (2 days)
- Integrate with DynamoDB API (GET endpoint) (1 day)
- Add loading states and error handling (1 day)

**Week 4: Pipeline & Actions**
- Build Pipeline Stepper component (2 days)
- Implement status update logic with optimistic UI (2 days)
- Create Communications Card with mailto functionality (1 day)
- Add Internal Notes section with auto-save (1 day)

**Milestone 2**: Drawer displays real data and allows status updates

---

### Phase 3: Polish & Navigation (Week 5)

**Week 5: Terminal Actions & UX**
- Implement "Next Lead" button with queue logic (2 days)
- Build Archive functionality with confirmation (1 day)
- Add keyboard shortcuts (ESC, Cmd+→) (1 day)
- Polish animations, hover states, tactile feedback (1 day)
- Mobile responsive layout refinement (1 day)

**Milestone 3**: Feature-complete drawer ready for QA

---

### Phase 4: Testing & Launch (Weeks 6-7)

**Week 6: QA & Fixes**
- Functional testing against all acceptance criteria (2 days)
- Performance testing (load time, auto-save latency) (1 day)
- Accessibility audit (WCAG 2.1 AA compliance) (1 day)
- Bug fixes from QA (2 days)

**Week 7: Analytics & Soft Launch**
- Integrate analytics events (1 day)
- Internal beta with 5 pilot admins (3 days)
- Gather feedback and iterate (2 days)
- Production deployment (1 day)

**Milestone 4**: v4.2.0-STABLE released to production

---

### Phase 5: Post-Launch (Week 8+)

**Week 8: Monitoring**
- Monitor success metrics (processing time, completion rate)
- Address any critical bugs or UX issues
- Gather user feedback for v4.3 roadmap

**Success Gate**: 80% of admins process leads in < 60 seconds by Week 10

---

## 15. UX & Design Specifications

### 15.1 Visual Design Language

**Aesthetic Philosophy**: "Glassmorphic Mission Intelligence Instrument"

The drawer should evoke the feeling of a high-precision control panel - tactile, responsive, and data-dense without being cluttered. Think aerospace HUD meets premium productivity software.

**Color Palette**:
```
Primary (Emerald):    #50C878
Background (Slate):   #0F172A (drawer bg), #1E293B (card bg)
Text Primary:         #F1F5F9 (slate-100)
Text Secondary:       #94A3B8 (slate-400)
Borders:              #334155 (slate-700)
Success:              #10B981 (emerald-500)
Warning:              #F59E0B (amber-500)
Danger:               #F43F5E (rose-500)
Info:                 #3B82F6 (blue-500)
```

**Typography** (Plus Jakarta Sans):
```
Metric Numbers:       900 weight (Black), 32px
Section Headers:      700 weight (Bold), 18px
Field Labels:         600 weight (SemiBold), 14px, uppercase, tracking-wide
Field Values:         400 weight (Regular), 16px
Body Text:            400 weight (Regular), 14px
Monospace (Ref ID):   'JetBrains Mono', 12px
```

**Spacing System** (Tailwind Scale):
```
Component Padding:    p-6 (24px)
Section Gaps:         space-y-6 (24px)
Field Gaps:           space-y-3 (12px)
Inline Gaps:          gap-2 (8px)
```

**Border Radius** (Super-Ellipse Approximation):
```
Buttons:              rounded-lg (8px)
Cards:                rounded-xl (12px)
Badges:               rounded-full (pill shape)
Drawer:               rounded-l-2xl (16px left corners only)
```

### 15.2 Component-Level Specs

**Drawer Container**:
```css
.lead-workspace-drawer {
  width: 576px;               /* max-w-xl */
  height: 100vh;
  background: #0F172A;        /* slate-900 */
  backdrop-filter: blur(12px);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.5);
  transform: translateX(100%);
  transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.lead-workspace-drawer.open {
  transform: translateX(0);
}

@media (max-width: 640px) {
  .lead-workspace-drawer {
    width: 90vw;
  }
}
```

**Header (Sticky)**:
```css
.drawer-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: linear-gradient(to bottom, #0F172A 90%, transparent);
  padding: 24px;
  border-bottom: 1px solid #334155;
}

.ref-id-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #94A3B8;              /* slate-400 */
  background: #1E293B;         /* slate-800 */
  padding: 4px 12px;
  border-radius: 9999px;
  display: inline-block;
}

.lead-name {
  font-size: 24px;
  font-weight: 700;
  color: #F1F5F9;              /* slate-100 */
  margin: 8px 0;
}
```

**Pipeline Stepper**:
```
Visual representation:

┌─────────────────────────────────────────────────┐
│ Pipeline Status                                 │
│                                                 │
│  ┌───────┐     ┌───────────┐     ┌──────────┐  │
│  │  ✓    │ ──→ │     ●     │ ──→ │    ○     │  │
│  │  New  │     │ Reviewing │     │Contacted │  │
│  └───────┘     └───────────┘     └──────────┘  │
│  Completed     In Progress        Next          │
└─────────────────────────────────────────────────┘

States:
- Completed: Checkmark, Emerald bg, white text
- Current: Filled circle, Emerald border (2px), white bg
- Future: Outline circle, Slate border, transparent bg

Hover: Scale 1.02, glow effect
Active (click): Scale 0.98, duration 100ms
```

```css
.status-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border: 2px solid #334155;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: all 150ms ease;
}

.status-button:hover {
  transform: scale(1.02);
  border-color: #50C878;
  box-shadow: 0 0 0 3px rgba(80, 200, 120, 0.1);
}

.status-button:active {
  transform: scale(0.98);
}

.status-button.current {
  border-color: #50C878;
  background: rgba(80, 200, 120, 0.05);
}

.status-button.completed {
  background: #50C878;
  border-color: #50C878;
  color: white;
}
```

**Lead Voice Block** (Prioritized Comments):
```css
.lead-voice-block {
  background: linear-gradient(135deg, #1E293B 0%, #0F172A 100%);
  border-left: 4px solid #50C878;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 24px;
}

.lead-voice-icon {
  font-size: 24px;
  margin-bottom: 12px;
}

.lead-voice-text {
  font-size: 16px;
  font-style: italic;
  color: #E2E8F0;              /* slate-200 */
  line-height: 1.6;
  quotes: """ """ "'" "'";
}

.lead-voice-text::before {
  content: open-quote;
}

.lead-voice-text::after {
  content: close-quote;
}

.lead-voice-attribution {
  margin-top: 12px;
  font-size: 14px;
  color: #94A3B8;              /* slate-400 */
  text-align: right;
}
```

**Form Fields Grid**:
```css
.form-field-grid {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 16px 24px;
  padding: 20px;
  background: #1E293B;
  border-radius: 12px;
}

.field-label {
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94A3B8;              /* slate-400 */
  align-self: start;
}

.field-value {
  font-size: 16px;
  color: #F1F5F9;              /* slate-100 */
  word-break: break-word;
}

.field-value.empty {
  color: #64748B;              /* slate-500 */
}

.field-value.truncated {
  position: relative;
  cursor: pointer;
}

.field-value.truncated:hover {
  color: #50C878;
}
```

**Communications Card**:
```css
.communications-card {
  background: #1E293B;
  border: 2px solid #334155;
  border-radius: 12px;
  padding: 24px;
  transition: all 200ms ease;
}

.communications-card:hover {
  border-color: #50C878;
  box-shadow: 0 0 0 3px rgba(80, 200, 120, 0.1);
  transform: scale(1.01);
}

.email-button {
  width: 100%;
  padding: 14px 20px;
  background: linear-gradient(135deg, #50C878 0%, #3BA564 100%);
  color: white;
  font-weight: 600;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
}

.email-button:hover {
  background: linear-gradient(135deg, #3BA564 0%, #2D8B50 100%);
  box-shadow: 0 4px 12px rgba(80, 200, 120, 0.3);
}

.email-button:active {
  transform: scale(0.98);
}
```

**Internal Notes Section**:
```css
.notes-textarea {
  width: 100%;
  min-height: 96px;            /* 4 rows */
  max-height: 288px;           /* 12 rows */
  padding: 12px 16px;
  background: #0F172A;
  border: 2px solid #334155;
  border-radius: 8px;
  color: #F1F5F9;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  transition: border-color 150ms ease;
}

.notes-textarea:focus {
  outline: none;
  border-color: #50C878;
  box-shadow: 0 0 0 3px rgba(80, 200, 120, 0.1);
}

.save-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #94A3B8;
}

.save-indicator.saving {
  color: #F59E0B;              /* amber-500 */
}

.save-indicator.saved {
  color: #10B981;              /* emerald-500 */
}

.save-indicator-icon {
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

**Terminal Actions Zone**:
```css
.terminal-actions {
  position: sticky;
  bottom: 0;
  background: linear-gradient(to top, #0F172A 90%, transparent);
  padding: 24px;
  border-top: 1px solid #334155;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.next-lead-button {
  width: 100%;
  padding: 14px 20px;
  background: #50C878;
  color: white;
  font-weight: 600;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.archive-button {
  width: 100%;
  padding: 12px 20px;
  background: transparent;
  color: #F43F5E;              /* rose-500 */
  border: 2px solid #F43F5E;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
}

.archive-button:hover {
  background: rgba(244, 63, 94, 0.1);
}
```

### 15.3 Interaction Patterns

**Drawer Open Animation**:
```javascript
// Timing function: cubic-bezier(0.4, 0, 0.2, 1)
// Duration: 200ms
// Transform: translateX(100%) → translateX(0)
// Backdrop: opacity 0 → 0.4 (simultaneously)
```

**Optimistic Status Update**:
```javascript
1. User clicks "Reviewing" button
2. Immediately update UI (current state = reviewing)
3. Show subtle spinner on button
4. Send PATCH request
5. On success: Hide spinner, show success toast (2s)
6. On failure: Revert UI, show error toast with retry
```

**Auto-Save Notes Flow**:
```javascript
1. User types in notes textarea
2. After 1000ms of inactivity, show "Saving..." indicator
3. Send PATCH request with debounced content
4. On success: Show "Saved ✓" for 2000ms, then hide
5. On failure: Show "Draft saved locally" (persist in localStorage)
6. On next successful save, sync local draft
```

**Next Lead Navigation**:
```javascript
1. User clicks "Next Lead" button (or Cmd+→)
2. Show loading spinner on button
3. Query GET /submissions/queue?status=new&limit=1&after={current_ref_id}
4. If next lead exists:
   - Fetch full details GET /submissions/{next_ref_id}
   - Slide current content out (left), new content in (right)
   - Duration: 150ms
5. If no more leads:
   - Show toast: "No more new leads to process"
   - Disable button with tooltip
```

**Archive Confirmation**:
```javascript
1. User clicks "Archive Lead" button
2. Button text changes to "Hold to confirm..."
3. If held for 1000ms:
   - Send PATCH request (status = archived)
   - Show success toast with undo link (5s timeout)
   - Close drawer
4. If released before 1000ms:
   - Revert button text
   - No action taken
```

### 15.4 ASCII Wireframe (Full Drawer)

```
┌─────────────────────────────────────────────────────────────┐
│ [X Close]            Lead Workspace          [Next Lead →]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Ref: FORM_aus123_20251228_1234                         🟢   │
│ Sarah Martinez                                              │
│ Program: AUS123957 | Zip: 78701 | Dec 28, 2025 2:34 PM     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Pipeline Status                                             │
│                                                             │
│  ┌───────┐       ┌───────────┐       ┌──────────┐          │
│  │   ✓   │  ───→ │     ●     │  ───→ │    ○     │          │
│  │  New  │       │ Reviewing │       │Contacted │          │
│  └───────┘       └───────────┘       └──────────┘          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ 💬 Lead Voice                                               │
│                                                             │
│ "I'm passionate about education reform and want to help!   │
│  I have experience with community organizing and can        │
│  commit 10 hours per week."                                 │
│                                                             │
│                                     — Sarah's comments      │
├─────────────────────────────────────────────────────────────┤
│ Form Submission Details                                     │
│                                                             │
│ Full Name:              Sarah Martinez                      │
│ Email Address:          sarah.martinez@example.com          │
│ Phone Number:           (512) 555-0123                      │
│ Zip Code:               78701                               │
│ Volunteer Interests:    Canvassing, Phone Banking, Event... │
│ Availability:           Weekends                            │
│ Previous Experience:    Yes                                 │
│ Referral Source:        Website                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ 📧 Contact Lead                                             │
│                                                             │
│ sarah.martinez@example.com                                  │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │              [Send Email →]                             │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Subject: Thank you for volunteering with AUS123957         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ 📝 Internal Notes                                           │
│                                                             │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ Strong candidate for field organizing team.           │   │
│ │ Follow up on education reform interest - may be good   │   │
│ │ for policy advocacy track.                             │   │
│ │                                                         │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                             │
│ 145 / 2000                               Saved ✓            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │              [Next Lead →]                              │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │              [Archive Lead]                             │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 16. Future Roadmap (Post-v4.2)

### v4.3: Enhanced Workflow (Q1 2026)

**Lead Assignment & Routing**:
- Assign leads to specific team members
- Automated routing rules based on zip code, interests, or availability
- Team inbox view with "My Leads" filter

**Snooze Function**:
- Temporarily hide leads with follow-up date picker
- Automated re-surfacing when follow-up date arrives
- Calendar integration for scheduling

**Bulk Operations**:
- Multi-select leads from list view
- Batch status updates
- Bulk export to CSV

### v4.4: Customization Engine (Q2 2026)

**Custom Pipeline States**:
- Tenant-configurable pipeline (e.g., New → Qualified → Onboarded → Active)
- Custom status colors and icons
- Workflow automation triggers (send email when status changes)

**Custom Form Field Mapping**:
- Tenant-defined field labels and display order
- Conditional field visibility based on submission type
- Field grouping into collapsible sections

**Template Library**:
- Pre-configured email templates by submission type
- Variable substitution (e.g., `{{lead_name}}`, `{{program_name}}`)
- Template versioning and A/B testing

### v4.5: Intelligence & Automation (Q3 2026)

**Lead DNA Visualization**:
- Path-to-purchase journey mapping
- Referral source attribution graph
- Touchpoint timeline (form submit → email open → event signup)

**Ghost Notes**:
- Inline editing from list view without opening drawer
- Quick-add status tags (e.g., "Hot Lead", "Spanish Speaker")
- Keyboard shortcuts for power users

**AI-Powered Insights**:
- Sentiment analysis on comments field
- Auto-categorization by interest/intent
- Predictive lead scoring (likelihood to convert)

### v4.6: Integrations (Q4 2026)

**CRM Sync**:
- Two-way sync with Salesforce, HubSpot, Pipedrive
- Field mapping configuration UI
- Conflict resolution rules

**Telephony Integration**:
- Click-to-call via Twilio
- Call logging and recording
- SMS outreach templates

**Calendar & Scheduling**:
- Embedded Calendly/Chili Piper for event signup
- Automated event invitations based on interests
- RSVP tracking

---

## 17. Open Questions & Decisions Needed

### Q1: Mobile-First Strategy
**Question**: Should we build a separate mobile app or optimize the drawer for mobile web?

**Options**:
1. Optimize current drawer for mobile (responsive design)
2. Build dedicated React Native app for field admins
3. Progressive Web App (PWA) with offline support

**Recommendation**: Start with Option 1 (responsive drawer), evaluate mobile usage in first 60 days. If > 20% of sessions are mobile, prioritize PWA in v4.4.

**Decision Owner**: Product VP
**Deadline**: Week 2 (before frontend development starts)

---

### Q2: Real-Time Collaboration
**Question**: How do we handle two admins working on the same lead simultaneously?

**Options**:
1. Optimistic locking with conflict warnings (current plan)
2. Real-time presence indicators (WebSocket) showing who's viewing
3. Operational transforms for collaborative note editing (CRDT)

**Recommendation**: Start with Option 1, monitor conflict rate. If > 5% of updates conflict, implement Option 2 in v4.3.

**Decision Owner**: Engineering Lead
**Deadline**: Week 3 (during implementation)

---

### Q3: Email Composer Strategy
**Question**: Should we build an in-app email composer or rely on mailto links?

**Options**:
1. Mailto links with copy-to-clipboard fallback (current plan)
2. In-app composer modal with template support
3. Integration with SendGrid/Mailgun for tracked sends

**Recommendation**: Start with Option 1 for v4.2 speed. If > 20% of users use copy fallback, prioritize Option 2 in v4.3.

**Decision Owner**: Product Manager
**Deadline**: Week 4 (before QA starts)

---

### Q4: Analytics Event Schema
**Question**: Should we use existing analytics pipeline or create dedicated lead workspace events?

**Options**:
1. Extend current event schema with new event types
2. Create separate "LeadWorkspace" namespace with custom schema
3. Hybrid: Use existing for standard events, custom for workspace-specific

**Recommendation**: Option 3 - use existing `MESSAGE_SENT` pattern for status updates, add custom events for drawer-specific actions (drawer open duration, field expansions, etc.)

**Decision Owner**: Analytics Lead
**Deadline**: Week 5 (before analytics integration)

---

### Q5: Permission Model
**Question**: What level of access control do we need for the drawer?

**Options**:
1. All authenticated admins have full access
2. Role-based: View vs. Edit vs. Admin
3. Tenant-scoped: Admins only see their own organization's leads

**Recommendation**: Start with Option 3 (tenant-scoped) for v4.2. Add Option 2 (RBAC) in v4.3 when we introduce team assignment.

**Decision Owner**: Security Team
**Deadline**: Week 1 (before backend schema finalized)

---

## 18. Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| **Lead** | A person who submitted a form (volunteer inquiry, donor interest, general contact) |
| **Ref ID** | DynamoDB partition key for a form submission (format: `FORM_{tenant}_{date}_{random}`) |
| **Pipeline Status** | Current stage of lead processing (new, reviewing, contacted, archived) |
| **Lead Voice** | The comments/message field from form submission, prioritized for display |
| **Form Data Manifest** | Human-readable transformation of raw JSON form data |
| **Mission Admin** | User persona: intake coordinator processing high-volume submissions |
| **Terminal Actions** | Final workflow actions (Next Lead, Archive) at bottom of drawer |
| **Glassmorphic** | Design aesthetic using backdrop blur and translucent surfaces |
| **Super-Ellipse** | Geometric shape between circle and rounded square (Tailwind rounded-lg approximation) |

### B. Related Documentation

- **Picasso Analytics Architecture**: `/Users/chrismiller/Desktop/Working_Folder/picasso-analytics-dashboard/Picasso/docs/User_Journey/PICASSO_ANALYTICS_ARCHITECTURE.md`
- **Forms Dashboard PRD**: `/Users/chrismiller/Desktop/Working_Folder/picasso-analytics-dashboard/Picasso/docs/User_Journey/ANNEX_C_FORMS_DASHBOARD.md`
- **Emerald Design System**: (To be created - design team deliverable)
- **Analytics Event Schema**: (Existing - reference analytics pipeline docs)
- **DynamoDB Table Schemas**: (To be created - backend team deliverable)

### C. Figma Design Links

*(To be added by Design Team in Week 1)*

- High-fidelity drawer mockups
- Component library (Stepper, Cards, Badges)
- Interaction prototypes
- Mobile responsive layouts

### D. API Endpoint Reference

**Base URL**: `https://api.picasso.example.com/v1`

**Authentication**: JWT token in `Authorization: Bearer {token}` header

**Endpoints**:
```
GET    /forms/submissions/{ref_id}
PATCH  /forms/submissions/{ref_id}
GET    /forms/submissions/queue?status={status}&tenant_id={tenant}&limit={limit}&after={ref_id}
GET    /tenants/{tenant_id}
```

**Full API specification**: (To be created in Week 2 by Backend Team)

### E. Change Log

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-12-28 | 1.0 | Senior PM | Initial comprehensive PRD from stakeholder draft |

---

## 19. Approval & Sign-Off

| Role | Name | Status | Date | Signature |
|------|------|--------|------|-----------|
| **Product VP** | _______________ | ⬜ Pending | __________ | _______________ |
| **Engineering Lead** | _______________ | ⬜ Pending | __________ | _______________ |
| **Design Director** | _______________ | ⬜ Pending | __________ | _______________ |
| **Security Lead** | _______________ | ⬜ Pending | __________ | _______________ |
| **Analytics Lead** | _______________ | ⬜ Pending | __________ | _______________ |

**Approval Criteria**:
- All stakeholders must sign off before Week 1 development begins
- Any "Major Concerns" must be resolved with PRD amendments
- "Minor Concerns" can be tracked as inline comments for iteration

**Next Steps After Approval**:
1. Schedule kickoff meeting with full cross-functional team
2. Create Jira epic and break down into user stories
3. Backend team begins DynamoDB schema creation (Week 1)
4. Design team begins Figma high-fidelity mockups (Week 1)
5. Frontend team sets up component scaffolding (Week 2)

---

**End of Document**

*Last Updated: 2025-12-28*
*Document ID: PRD-PICASSO-2025-001*
*Version: 1.0*
