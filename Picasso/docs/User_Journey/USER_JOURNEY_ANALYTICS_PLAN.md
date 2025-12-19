# User Journey Analytics - Requirements & Design Plan

## Business Context

### Why This Initiative?

**The Goal:** Answer the #1 question nonprofits ask: **"Is my investment in MyRecruiter worth it?"**

Nonprofits need to demonstrate ROI on their MyRecruiter investment. The Attribution Dashboard makes the invisible visible—nonprofits simply don't have this information today. If we can show them smarter ways to spend their time and money, MyRecruiter becomes indispensable.

### The Three Dashboards

#### 1. Forms Dashboard (Mandatory for Clients)

With the recent migration away from Amazon Lex to Picasso's native conversational forms, we now collect structured data directly. **This data MUST be presented to clients.**

The Forms Dashboard shows:
- **Conversion Funnel**: Form Views → Started → Completed (with abandon rate)
- **Field Bottlenecks**: Which fields cause drop-offs (e.g., "Background Check causes 38% of drop-offs—add a trust badge to reduce anxiety")
- **Top Performing Forms**: Conversion rates by form type
- **Recent Submissions**: Searchable table with name, email, type, comments, date

#### 2. Attribution Dashboard (Core Value Proposition)

This is the heart of MyRecruiter's value. It connects the full visitor journey:

```
Site Visitors (12,450) → Widget Opened (3,850) → Conversation Started (1,045) → Link/Form Clicked (480) → Form Completed (142)
      [GA4]                  -69% dropoff           -73% dropoff                    -54% dropoff              -70% dropoff
```

Key insights enabled:
- **Traffic Source ROI**: "Facebook traffic completed forms at 3.2x the rate of organic traffic"
- **Est. Value Generated**: $34,500 based on assigned goal values
- **Top Converting Topics**: Volunteering (25.8%), Donations (35%), Program Eligibility (4.7%)
- **Link Analytics**: Which shared resources drive engagement

This helps nonprofits optimize content creation and helps MyRecruiter optimize features.

#### 3. Conversations Dashboard (Already Exists)

Shows aggregate metrics, heat maps, top questions, and recent Q&A pairs.

### The Problem: QA_COMPLETE Tracking Limitations

The current `QA_COMPLETE` logging in CloudWatch has critical limitations:

1. **Doesn't capture all Q&As in a session** - Messages go unaccounted
2. **No beginning-to-end tracking** - Can't follow a user's complete journey
3. **Can't tie sessions to outcomes** - Did the user donate? Volunteer? Abandon?

**Real example of the pain point:**
> "It's frustrating when analytics say 20 conversations and 27 messages, and I can't account for the 7 messages. Which sessions do they belong to? What was asked? Did the user have an outcome like a donation or volunteer request? That information is missing."

**This is why we're moving from CloudWatch logs to DynamoDB** - to enable step-based session tracking where every interaction is captured in sequence and tied to outcomes.

### What This Enables

1. **Attribution Tracking** - Connect site visits (GA4) → widget engagement → form completions to show "Of 12,450 visitors, 1,045 started a conversation, 142 completed a form, and Facebook drove 3.2x the conversion rate"

2. **Inventory vs. Usage Analysis** - Show what CAN be clicked vs what WAS clicked (identifying "never clicked" items to optimize or remove)

3. **Field Bottleneck Analysis** - Identify which form fields cause drop-offs with actionable recommendations

4. **Complete Session Reconstruction** - Every message, click, and outcome in sequence—no more missing messages

---

## Executive Summary

Build comprehensive event tracking across the Picasso widget to power **three analytics dashboards**:

1. **Conversations Dashboard** (Exists) - Q&A metrics, heat maps, top questions
2. **Attribution Dashboard** (Build) - Visitor journey funnel, traffic source conversion, link analytics
3. **Forms Dashboard** (Build) - Form funnel, field bottlenecks, completion rates

**Architecture Decision:** Standalone React analytics app (not Bubble) for customer-facing dashboards. Bubble remains backoffice for tenant management, roles/permissions.

### Bubble Relationship

| Function | Location | Notes |
|----------|----------|-------|
| Tenant management | **Bubble** | Stays in Bubble |
| Roles/permissions | **Bubble** | Stays in Bubble |
| Config editing | **Bubble** | Stays in Bubble |
| Authentication | **Bubble** | SSO/auth gateway for new analytics app |
| Form completion alerts | **Bubble** | Via existing Lambda webhook |
| Conversations Dashboard | Bubble → **New React App** | Sunset Bubble version once new app is live |
| Attribution Dashboard | **New React App** | New build |
| Forms Dashboard | **New React App** | New build |

**Auth Flow:**
```
User → Bubble login → JWT/session token → New Analytics App (validates token)
```

### Core Concept: Inventory vs. Usage Analysis

```
AVAILABLE INVENTORY          vs.          ACTUAL USAGE
(What CAN be clicked)                    (What WAS clicked)
────────────────────                     ─────────────────
• Action Chips (config)                  • Clicked 150x (Popular)
• CTAs (config)                          • Clicked 50x (Moderate)
• Help Menu Items (config)               • Clicked 5x (Low)
• Showcase Items (config)                • Never clicked (Optimize!)
• KB Links (pre-scan during KB upload)
```

---

## Technology Stack

### Architecture Decision: Custom React Dashboard

**Decision Date:** December 18, 2025

**Choice:** Custom React dashboard (not Metabase/Superset)

**Rationale:**
1. Dashboard mockups validated with customers - they're excited about THIS design
2. Building Metabase MVP then rebuilding custom = two development cycles (waste)
3. Custom visualizations (funnel with dropoff %, insight callouts) are core to the value proposition
4. Full control over UX iteration based on customer feedback
5. Polished, branded experience is a competitive differentiator

### Full Stack Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND                                  │
├─────────────────────────────────────────────────────────────┤
│  Custom React Dashboard                                      │
│  ├── React 18 + TypeScript                                  │
│  ├── Recharts (funnels, bars, lines)                        │
│  ├── Nivo (heat maps)                                       │
│  ├── TanStack Table (data tables)                           │
│  ├── Tailwind CSS (styling)                                 │
│  └── React Query (data fetching + caching)                  │
│                                                             │
│  Hosting: S3 + CloudFront                                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    API LAYER                                 │
├─────────────────────────────────────────────────────────────┤
│  Lambda + API Gateway                                        │
│  ├── JWT Authorizer (tenant_id from Bubble)                 │
│  ├── Forced tenant_id injection (security)                  │
│  └── Query routing (DynamoDB < 90 days, Athena > 90 days)   │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
┌─────────────────────────┐   ┌──────────────────────────────┐
│  DynamoDB (Hot)         │   │  S3 + Athena (Cold)          │
│  - 90-day TTL           │   │  - Partitioned JSON          │
│  - Real-time dashboards │   │  - Historical trends         │
│  - ~$20/month           │   │  - No Glue needed            │
└─────────────────────────┘   └──────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    ATTRIBUTION                               │
├─────────────────────────────────────────────────────────────┤
│  GA4 Stitching: ga_client_id captured in widget-host.js     │
│  Dub.co: Webhook → Lambda → DynamoDB                        │
│  GA4 Data: BigQuery export → S3 (daily)                     │
└─────────────────────────────────────────────────────────────┘
```

### Frontend Libraries

| Library | Purpose | Why This Choice |
|---------|---------|-----------------|
| **React 18** | UI framework | Already used in Picasso ecosystem |
| **TypeScript** | Type safety | Reduces bugs, better DX |
| **Recharts** | Charts (funnel, bar, line) | React-native, composable, lightweight |
| **Nivo** | Heat maps | Best React heat map library |
| **TanStack Table** | Data tables | Headless, sortable, filterable |
| **Tailwind CSS** | Styling | Matches mockup design system |
| **React Query** | Data fetching | Caching, refetching, loading states |
| **date-fns** | Date handling | Lightweight, tree-shakeable |

### What We're NOT Using

| Technology | Why Not |
|------------|---------|
| **Metabase/Superset** | Can't match validated mockups; would require rebuild |
| **AWS Glue** | Overkill at ~2 events/min; Athena queries JSON directly |
| **Kinesis Firehose** | Overkill at current scale; Lambda batching sufficient |
| **Redshift** | Never needed; Athena scales to petabytes |
| **ElastiCache** | Defer until 100+ tenants; Lambda-level caching for now |

### Monthly Cost Estimate (20 tenants, ~80k events/month)

| Component | Cost |
|-----------|------|
| DynamoDB (on-demand) | ~$20 |
| S3 storage | ~$5 |
| Athena queries | ~$5 |
| Lambda (API + ingestion) | ~$5 |
| CloudFront | ~$5 |
| **Total** | **~$40/month** |

### Scale Considerations

**Current:** ~2 events/minute, 20 tenants

**When to revisit architecture:**
- **Add Firehose:** If events exceed 1,000/minute sustained
- **Add ElastiCache:** If API latency exceeds 500ms at 100+ tenants
- **Add Glue:** If S3 data exceeds 100GB and Parquet conversion needed

---

## Dashboard-Driven Event Requirements

### Conversations Dashboard (Exists - Needs Enhancement)

**Current:** Shows aggregate metrics + isolated Q&A pairs
**Need:** Full conversation threads + depth distribution

| New Component | Data Required |
|---------------|---------------|
| Conversation Depth Distribution | message_count per session |
| Messages per Session | User vs bot message counts |
| Full Conversation Thread | All messages in sequence with timestamps |
| Session Outcome | form_completed, link_clicked, abandoned |
| Conversation Duration | start_time, end_time |

**Key Insight:** Move from "Q&A pairs" to "Session with messages" mental model.

```
SESSION DETAIL VIEW:
10:30:15  USER  "How can I volunteer?"
10:30:17  BOT   "We offer several..." [1.2s response]
10:30:45  USER  "What are the requirements?"
10:30:47  BOT   "To volunteer, you'll need..." [1.4s]
          ↓ [Form Started]
10:33:30  ✓ Form Completed
```

### Attribution Dashboard (from mockup)

```
VISITOR JOURNEY FUNNEL:
Site Visitors (12,450) → Widget Opened (3,850) → Conversation Started (1,045) → Link/Form Clicked (480) → Form Completed (142)
     [GA4]                  -69% dropoff           -73% dropoff               -54% dropoff            -70% dropoff
```

| Dashboard Component | Event Required | Key Fields |
|---------------------|----------------|------------|
| Site Visitors | GA4 Data API | session count |
| Widget Opened | `WIDGET_OPENED` | tenant_id, timestamp, trigger |
| Conversation Started | `CONVERSATION_STARTED` | session_id (first message) |
| Link/Form Clicked | `LINK_CLICKED`, `CTA_CLICKED` | url, cta_id, item_label |
| Form Completed | `FORM_COMPLETED` | form_id, duration |
| Conversion by Traffic Source | GA4 correlation | source, medium |
| Top Converting Topics | Branch tracking | branch_id on form completion |
| Link Analytics | `LINK_CLICKED` | url, link_text, category, clicks |

### Forms Dashboard (from mockup)

```
CONVERSION FUNNEL:
Form Views (1,240) → Started (843) → Completed (521)
                        42% Conversion Rate | 57.9% Abandon Rate
```

| Dashboard Component | Event Required | Key Fields |
|---------------------|----------------|------------|
| Form Views | `FORM_VIEWED` | form_id, trigger_source |
| Form Started | `FORM_STARTED` | form_id, field_count |
| Form Completed | `FORM_COMPLETED` | form_id, duration_seconds |
| Form Abandoned | `FORM_ABANDONED` | form_id, last_field, fields_completed |
| **Field Bottlenecks** | `FORM_FIELD_ABANDONED` | **field_id, field_label, abandon_count** |
| Avg Completion Time | Duration tracking | start_time, end_time |
| Top Performing Forms | Aggregation | by form_id with conversion rate |

**Critical:** Field Bottlenecks requires tracking WHICH FIELD the user was on when they abandoned. This enables insights like "Background Check causes 38% of drop-offs."

---

## Refined Requirements

### 1. User Journey Tracking (Per-Session)
Track every interaction in sequence to visualize the user's path:
- Widget open → Messages → Clicks → Form interactions → Outcome
- Show timeline with timestamps
- Calculate session duration, message count, outcome

### 2. Popularity Aggregates (Cross-Session)
Aggregate all clicks to show what's resonating:
- Top clicked action chips, CTAs, links
- Click counts by item
- Trend over time (is popularity increasing/decreasing?)

### 3. Optimization Opportunities (Inventory Gap Analysis)
Compare what's available vs. what's used:
- Items with zero clicks → Consider removing
- Items with low clicks → Consider rewording/repositioning
- Seasonal patterns → Don't disable, just note

### Trackable Item Types

| Item Type | Source | Inventory Location |
|-----------|--------|-------------------|
| Action Chips | Tenant config | `config.action_chips.default_chips` |
| CTAs | Tenant config | `config.cta_definitions` |
| Help Menu Items | Tenant config | `config.quick_help.prompts` |
| Showcase Items | Tenant config | `config.content_showcase` |
| KB Links | Knowledge Base | Pre-scan during KB upload |

---

## Current State Analysis

### What Exists Today

**Frontend Event System (Partial):**
- `notifyParentEvent()` function in `iframe-main.jsx`
- Events: `CHAT_OPENED`, `CHAT_CLOSED`, `MESSAGE_SENT`, `RESIZE_REQUEST`
- postMessage bridge for iframe ↔ host communication

**Backend Infrastructure (Robust):**
- `Analytics_Function` Lambda - 3-tier query engine (CloudWatch/DynamoDB/S3)
- `Aggregator_Function` Lambda - Daily batch processing
- `QA_COMPLETE` logging in Bedrock handler with session_id, tenant, Q&A pairs
- DynamoDB table: `picasso-analytics-daily`
- S3 archive: `picasso-analytics-archive`

---

## Gap Analysis: Current vs. Required Capabilities

| Current State | User Requirement | Gap |
|---------------|------------------|-----|
| 8 core events defined | "Track everything in the widget" | Need component-level tracking |
| Form completion tracking | Field-level analytics | Add field interaction events |
| CTA clicks logged | "Button X clicked 150 times" | Add component instance tracking |
| Session-level metrics | User journey flow visualization | Need path visualization |
| After-hours percentage | Where users go in session | Need conversation path tracking |

---

## Key Questions for Requirements

1. **Granularity:** Track every button click individually, or group by type?
2. **Journey Visualization:** Sankey diagram? Funnel? Timeline?
3. **Real-time vs Batch:** Need live dashboard or daily updates sufficient?
4. **Component Naming:** Use technical IDs or friendly labels?
5. **Historical Data:** Backfill from existing logs or start fresh?

---

## Component Inventory - What Can Be Tracked

### Interactive Components (20 total)

| Component | Key Interactions |
|-----------|------------------|
| **ChatWidget** | Widget open/close, minimize, callout click |
| **ChatHeader** | Close button, settings button |
| **InputBar** | Text input, send button, attachment menu |
| **MessageBubble** | Action chips, CTA buttons, links, retry |
| **CTAButton** | Click with action type (form_trigger, external_link, etc.) |
| **ShowcaseCard** | Image load, primary/secondary CTAs |
| **AttachmentMenu** | File/camera/photo/video selection |
| **FollowUpPromptBar** | Quick help toggle, prompt selection |
| **FormFieldPrompt** | Field input, validation, submit/cancel |
| **CompositeFieldGroup** | Multi-field input, submit |
| **FormCompletionCard** | End session, continue conversation |

### User Actions to Track (100+ identified)

**Widget Lifecycle:**
- Widget open (trigger: button/callout/auto-open)
- Widget close (trigger: button/outside-click)
- Session start/end, dwell time

**Conversation Flow:**
- Message sent (with metadata)
- Message received (with branch_id, response time)
- Scroll behavior, unread count changes

**Action Chips & CTAs (Critical for User Journey):**
- Action chip clicked (chip_id, label, target_branch)
- CTA button clicked (cta_id, action_type, triggers_form)
- Link clicked (url, link_text, message context)

**Form Interactions:**
- Form started, completed, abandoned
- Field-level: input, validation, time-per-field
- Composite field submission
- Eligibility gate results

**Content Interactions:**
- Showcase card displayed, CTA clicked
- Quick help menu usage
- Retry button clicks

---

## Implementation Design

### Complete Event Schema

**All events include base fields:**
```json
{
  "timestamp": "2025-12-18T14:30:00.123Z",
  "session_id": "sess_abc123def456",
  "tenant_hash": "fo85e6a06dcdf4",
  "step_number": 5
}
```

#### Widget Lifecycle Events

| Event | Purpose | Key Payload Fields |
|-------|---------|-------------------|
| `WIDGET_OPENED` | Attribution funnel | trigger (button/callout/auto) |
| `WIDGET_CLOSED` | Session end | dwell_time_seconds |
| `CONVERSATION_STARTED` | First message | - |

#### Item Click Events

| Event | Purpose | Key Payload Fields |
|-------|---------|-------------------|
| `ACTION_CHIP_CLICKED` | Chip tracking | chip_id, chip_label, target_branch |
| `CTA_CLICKED` | CTA tracking | cta_id, cta_label, cta_action, triggers_form |
| `LINK_CLICKED` | Link analytics | url, link_text, link_domain, category |
| `HELP_MENU_CLICKED` | Help menu usage | prompt_index, prompt_text |
| `SHOWCASE_CTA_CLICKED` | Showcase tracking | showcase_id, cta_type (primary/secondary) |

#### Form Events (Critical for Forms Dashboard)

| Event | Purpose | Key Payload Fields |
|-------|---------|-------------------|
| `FORM_VIEWED` | Funnel top | form_id, form_label, trigger_source |
| `FORM_STARTED` | User began filling | form_id, field_count, start_time |
| `FORM_FIELD_SUBMITTED` | Field completion | form_id, field_id, field_label, field_index |
| `FORM_COMPLETED` | Success | form_id, duration_seconds, fields_completed |
| `FORM_ABANDONED` | **Field bottlenecks** | form_id, **last_field_id**, **last_field_label**, fields_completed, reason |

**FORM_ABANDONED payload (critical for bottleneck analysis):**
```json
{
  "type": "FORM_ABANDONED",
  "payload": {
    "form_id": "volunteer_application",
    "form_label": "Volunteer Application",
    "last_field_id": "background_check",
    "last_field_label": "Background Check Consent",
    "last_field_index": 4,
    "fields_completed": 3,
    "total_fields": 8,
    "duration_seconds": 45,
    "reason": "closed|timeout|navigated"
  }
}
```

#### Backend Enrichment (QA_COMPLETE Extension)

```json
{
  "type": "QA_COMPLETE",
  "step_number": 3,
  "items_in_response": {
    "ctas_shown": ["lovebox_apply", "view_requirements"],
    "links_included": ["https://example.org/apply"]
  },
  "routing_context": {
    "routing_tier": "action_chip_direct|cta_explicit|ai_suggested",
    "branch_id": "lovebox_discussion"
  }
}
```

---

### Data Storage

| Data Type | Storage | Retention |
|-----------|---------|-----------|
| Session events (messages + clicks) | DynamoDB `picasso-session-events` | 90 days TTL |
| Session summaries | DynamoDB `picasso-session-summaries` | 90 days TTL |
| Daily aggregates | DynamoDB `picasso-analytics-daily` | 90 days TTL |
| Item aggregates | DynamoDB `picasso-item-clicks` | 90 days TTL |
| Historical archives | S3 (partitioned JSON) | 13 months (then Glacier) |
| Inventory snapshots | DynamoDB | Current only |

**Hot/Cold Data Split:**
- **Hot (DynamoDB):** Last 90 days - real-time dashboard queries (<100ms)
- **Cold (S3 + Athena):** 90 days to 13 months - historical trend queries (2-10s)
- **Archive (Glacier):** 13+ months - compliance/annual reports

**Note:** CloudWatch (`QA_COMPLETE` logs) remains for legacy compatibility but is NOT used for new analytics. All new event tracking flows through DynamoDB for step-based querying. **No AWS Glue needed** - Athena queries partitioned JSON directly at current scale.

**New DynamoDB Tables:**

### 1. `picasso-session-events` (Conversation Messages + All Events)
```
PK: SESSION#{session_id}
SK: STEP#{step_number}  (STEP#001, STEP#002, etc.)

Attributes:
- tenant_hash: string
- event_type: MESSAGE_SENT | MESSAGE_RECEIVED | CTA_CLICKED | FORM_STARTED | etc.
- timestamp: ISO
- role: "user" | "assistant" (for messages)
- content_preview: string (full content, up to 500 chars)
- content_length: number
- response_time_ms: number (for bot messages)
- metadata: map (ctas_shown, branch_id, etc.)
- ga_client_id: string (for GA4 stitching)

TTL: 90 days

GSIs:
- tenant-date-index: tenant_hash (PK) + timestamp (SK) - for tenant-wide queries
- ga_client_id-index: ga_client_id (PK) + timestamp (SK) - for attribution stitching
```

**Query: Get full conversation**
```
pk = SESSION#abc123 → Returns all messages + events in order
```

### 2. `picasso-session-summaries` (Aggregated Session Metrics)
```
PK: TENANT#{tenant_hash}
SK: SESSION#{session_id}

Attributes:
- started_at: ISO timestamp
- ended_at: ISO timestamp
- duration_seconds: number
- message_count: number
- user_message_count: number
- bot_message_count: number
- outcome: "form_completed" | "link_clicked" | "abandoned" | "browsing"
- form_id: string (if form completed)
- topics: list (branch_ids touched)
- first_question: string (full content, up to 500 chars)

TTL: 90 days
GSI: tenant-date-index (for querying by date range)
```

**Query: Conversation depth distribution**
```
pk = TENANT#fo85e6a06dcdf4
→ Group by message_count → "32% had 2 messages, 26% had 3 messages"
```

### 3. `picasso-item-clicks` (Click Aggregates)
```
PK: TENANT#{tenant_id}
SK: ITEM#{item_type}#{item_id}

Attributes: total_clicks, last_7_days, last_30_days, trend, conversion_rate
TTL: 90 days
```

---

### API Endpoints (Analytics Lambda)

| Endpoint | Purpose |
|----------|---------|
| `GET /analytics/journey/{session_id}` | Reconstruct session timeline |
| `GET /analytics/popularity/{tenant_id}` | Top clicked items with counts |
| `GET /analytics/gaps/{tenant_id}` | Inventory vs usage comparison |
| `GET /analytics/patterns/{tenant_id}` | Common successful journey paths |

---

### Inventory Extraction

Create `/Lambdas/lambda/Analytics_Function/inventory_extractor.py`:
- Extract action chips from `config.action_chips.default_chips`
- Extract CTAs from `config.cta_definitions`
- Extract help menu from `config.quick_help.prompts`
- Extract showcase from `config.content_showcase`
- Handle both v1.3 (array) and v1.4.1 (dict) formats

**KB Links:** Pre-scan markdown during upload, store in `config.kb_inventory.links`

---

## Files to Modify

### Frontend (Picasso)

| File | Changes |
|------|---------|
| `src/iframe-main.jsx` | Add step counter, extend `notifyParentEvent()` |
| `src/widget-host.js` | Handle ITEM_CLICKED events, add `captureAttribution()` |
| `src/components/chat/ChatWidget.jsx` | Track action chip clicks |
| `src/components/chat/MessageBubble.jsx` | Track link clicks |
| `src/components/chat/CTAButton.jsx` | Emit ITEM_CLICKED with metadata |
| `src/context/FormModeContext.jsx` | Track form lifecycle |

### Backend (Lambdas)

| File | Changes |
|------|---------|
| `Bedrock_Streaming_Handler_Staging/index.js` | Extend QA_COMPLETE, accept attribution |
| `Analytics_Function/lambda_function.py` | Add journey/gap endpoints, GA4 integration |
| `Analytics_Function/inventory_extractor.py` | NEW: Extract inventory |
| `Analytics_Function/journey_reconstructor.py` | NEW: Timeline queries |
| `Analytics_Function/gap_analyzer.py` | NEW: Usage comparison |
| `Aggregator_Function/lambda_function.py` | Item-level aggregation |

### Infrastructure

| Resource | Changes |
|----------|---------|
| DynamoDB | New table: `picasso-session-events` |
| DynamoDB | New table: `picasso-item-clicks` |
| SQS | New queue: `picasso-analytics-events` |
| SQS | New DLQ: `picasso-analytics-events-dlq` |

---

## Phased Implementation

**Total Timeline:** 10 weeks to production-ready dashboards

---

### Implementation Status Summary

| Phase | Status | Completed |
|-------|--------|-----------|
| Phase 1: Event Capture | ✅ **COMPLETE** | 2025-12-19 |
| Phase 2: Analytics API | ✅ **COMPLETE** | 2025-12-19 |
| Phase 3: GA4 Integration | ⏸️ Deferred to v2.0 | - |
| Phase 4: Attribution Dashboard | ⏸️ Deferred to v2.0 | - |
| Phase 5: Forms Dashboard | 🔶 **IN PROGRESS** | - |
| Phase 6: Polish & Launch | ⏳ Not Started | - |

**Architecture Decision (2025-12-19):** Using Athena-only for MVP (3-8s latency acceptable). DynamoDB hot path deferred until scale demands it.

---

### Phase 1: Event Capture & Infrastructure (Weeks 1-2) ✅ COMPLETE

- [x] Extend `notifyParentEvent()` with step tracking and schema versioning
- [x] Add GA4 client_id capture to `widget-host.js` (session stitching)
- [x] Add ITEM_CLICKED events to action chips, CTAs, help menu, links
- [x] Add `captureAttribution()` with UTM params to widget-host.js
- [x] Create SQS queue + DLQ for event durability
- [x] Deploy updated Picasso widget
- [x] Create `Analytics_Event_Processor` Lambda (SQS → S3)
- [x] S3 partitioned storage with Hive-style paths
- [ ] ~~Create `picasso-session-events` DynamoDB table~~ (Deferred - using Athena-only)
- [ ] ~~Create `picasso-session-summaries` DynamoDB table~~ (Deferred - using Athena-only)

**Implementation Details:**
- Event constants: `/Picasso/src/analytics/eventConstants.js`
- Event emission: `/Picasso/src/iframe-main.jsx` (`notifyParentEvent()`)
- GA4 capture: `/Picasso/src/widget-host.js` (`getGAClientId()`, `captureAttribution()`)
- Form events: `/Picasso/src/context/FormModeContext.jsx`
- CTA events: `/Picasso/src/components/chat/CTAButton.jsx`
- Event processor: `/Lambdas/lambda/Analytics_Event_Processor/lambda_function.py`

**Success Criteria:** ✅ MET
- All clicks captured with item metadata
- ga_client_id captured for sessions with GA4
- Event emission <50ms overhead
- Zero event loss (SQS buffer with partial batch failure reporting)

### Phase 2: Analytics API & Data Pipeline (Weeks 3-4) ✅ COMPLETE

- [x] Create Analytics API Lambda with JWT authorizer
- [x] Implement forced tenant_id injection (security)
- [x] SQL injection protection (`sanitize_tenant_id`, `sanitize_event_type`)
- [x] Build API endpoints:
  - [x] `GET /analytics/summary` - Overview metrics
  - [x] `GET /analytics/sessions` - Session counts over time
  - [x] `GET /analytics/events` - Event breakdown by type
  - [x] `GET /analytics/funnel` - Conversion funnel analysis
- [x] Set up S3 partitioned storage for cold data
- [x] Configure Athena queries (no Glue needed)
- [ ] ~~Implement query routing (DynamoDB < 90 days, Athena > 90 days)~~ (Deferred - Athena-only for MVP)

**Implementation Details:**
- API Lambda: `/Lambdas/lambda/Analytics_Dashboard_API/lambda_function.py`
- JWT validation with Secrets Manager caching
- ISO date comparison for cross-month-boundary filtering

**Success Criteria:** ✅ MET
- API endpoints return correct data
- Query latency 3-8s (Athena) - acceptable for MVP
- Multi-tenant security verified (tenant_id forced from JWT)

### Phase 3: GA4 Integration (Week 5)
- [ ] Set up GA4 BigQuery export for each tenant
- [ ] Create daily ETL: BigQuery → S3
- [ ] Build Athena join queries for attribution funnel
- [ ] Test session stitching accuracy
- [ ] Add GA4 connection UI in Bubble (OAuth flow)

**Success Criteria:**
- GA4 data flowing daily to S3
- Attribution funnel shows complete journey (GA4 → Picasso → Conversion)
- Session stitching accuracy >85%

### Phase 4: Attribution Dashboard (Weeks 6-7)
- [ ] Scaffold React app (React 18 + TypeScript + Tailwind)
- [ ] Implement Bubble JWT authentication
- [ ] Build components:
  - KPI cards (Site Visits, Engagement Rate, Conversions, Est. Value)
  - Visitor Journey Funnel (with dropoff %)
  - Conversion by Traffic Source (bar chart)
  - Top Converting Topics (ranked list)
  - Link Analytics (sortable table)
- [ ] Add time range selector (1 week, 1 month, 3 months, custom)
- [ ] Add tenant filter (for multi-tenant admins)
- [ ] Deploy to S3 + CloudFront

**Success Criteria:**
- Dashboard matches mockup design
- Loads in <2s
- All data accurate vs. raw DynamoDB

### Phase 5: Conversations & Forms Dashboards (Weeks 8-9) 🔶 IN PROGRESS

**Completed:**
- [x] Scaffold React app (Vite + React 18 + TypeScript + Tailwind)
- [x] Create shared design tokens package (`@picasso/shared-styles`)
- [x] Brand color system (#50C878 Emerald Green)
- [x] Login page with Bubble SSO placeholder
- [x] Dashboard layout with mock components

**In Progress:**
- [ ] Forms Dashboard:
  - [x] StatCard component (KPIs)
  - [x] ConversionFunnel component
  - [x] FieldBottlenecks component
  - [x] TopPerformingForms component
  - [x] RecentSubmissions component
  - [ ] Wire to real Analytics API endpoints
  - [ ] Add forms-specific API endpoints (bottlenecks, submissions)
- [ ] Conversations Dashboard:
  - [ ] KPI cards (Total Conversations, Messages, Response Time, After Hours %)
  - [ ] Conversation Heat Map (Nivo)
  - [ ] Top 5 Questions (ranked list)
  - [ ] Recent Conversations (expandable Q&A)
  - [ ] Conversations Trend (line chart)
- [ ] Add CSV export functionality
- [ ] Implement dashboard navigation (tabs)

**Implementation Details:**
- React app: `/picasso-analytics-dashboard/`
- Shared styles: `/picasso-shared-styles/`
- GitHub repos:
  - https://github.com/longhornrumble/picasso-analytics-dashboard
  - https://github.com/longhornrumble/picasso-shared-styles

**Success Criteria:**
- All three dashboards functional
- Insight callouts generating automatically
- Export working for all data types

### Phase 6: Polish & Launch (Week 10)
- [ ] Performance optimization (React Query caching, lazy loading)
- [ ] Mobile responsive testing
- [ ] Error handling and loading states
- [ ] User acceptance testing with 3 pilot tenants
- [ ] Documentation (user guide, API docs)
- [ ] Production deployment
- [ ] Sunset Bubble conversations dashboard

**Success Criteria:**
- Dashboard loads <2s on mobile
- Zero critical bugs from pilot testing
- 3 tenants actively using dashboards

---

### Development Effort Summary

| Component | Effort | Owner |
|-----------|--------|-------|
| Event Capture (Widget updates) | 1 week | Frontend |
| Analytics API + Infrastructure | 2 weeks | Backend |
| GA4 Integration | 1 week | Backend |
| Attribution Dashboard | 2 weeks | Frontend |
| Conversations Dashboard | 1.5 weeks | Frontend |
| Forms Dashboard | 1.5 weeks | Frontend |
| Polish & Launch | 1 week | Full team |
| **Total** | **10 weeks** | |

---

## Performance & Privacy

**Performance Budget:**
- Event emission: <50ms overhead
- "Today" queries: <500ms (DynamoDB session-summaries)
- Historical queries: <200ms (DynamoDB pre-computed daily)
- Archive queries: <2s (S3 Glacier IR decompress)

**Privacy & Data Handling:**
- Full content stored (no redaction) - tenant-authorized access only
- Form submissions stored with full PII (like a CRM)
- Session IDs anonymous, widget-scoped
- Multi-tenant isolation via tenant_hash (strict query filtering)
- Role-based access control for dashboard
- Data export + deletion on tenant offboarding (see roadmap doc)

---

## Decisions Log

### 1. Session Identity
**Decision:** Use existing frontend `session_id` from widget. 30-minute inactivity timeout already implemented. Backend trusts frontend session_id.

### 2. Message Content & PII
**Decision:** Store full content - no redaction needed.

**Rationale:**
1. Only tenant-authorized personnel have access (like a CRM)
2. Business value requires seeing actual questions and contact info
3. No financial/medical/SSN data being collected
4. Matches dashboard mockups exactly (Top Questions, Recent Conversations, Form Submissions)

**Security Controls (instead of redaction):**
- Strict tenant isolation (`tenant_hash` in all queries)
- Role-based access control (tenant admins only)
- Audit logging of dashboard access
- Data retention policy (configurable per tenant)
- Tenant offboarding with data export + deletion (see roadmap doc)

### 3. Event Ordering & Step Numbers
**Decision:** Frontend owns the step counter; backend correlates via `in_response_to_step`.

**DynamoDB Sort Key:**
```
SK: STEP#{step_number}#{timestamp_ms}
# Examples:
# STEP#001#1734531000123 (MESSAGE_SENT)
# STEP#001#1734531001456 (MESSAGE_RECEIVED - same logical step)
# STEP#002#1734531030789 (CTA_CLICKED)
```

### 4. Real-time vs. Pre-computed Aggregates
**Decision:** DynamoDB-first for all new analytics (NOT CloudWatch). Apply existing retention policy.

**Why NOT CloudWatch for new analytics:**
- CloudWatch can't do per-session queries with step numbers
- CloudWatch can't reconstruct user journeys
- CloudWatch is log-oriented, not event-oriented
- CloudWatch stays only for legacy `QA_COMPLETE` logs

**Dashboard Query Strategy:**
| Time Range | Source | Method |
|------------|--------|--------|
| Today | `picasso-session-summaries` | Live compute from DynamoDB |
| 1-90 days | `picasso-analytics-daily` | Read pre-computed daily records |
| 91-365 days | S3 Glacier IR | Decompress gzip, read |
| >365 days | Deleted | Lifecycle policy auto-purge |

### 5. Attribution & GA4 Integration
**Decision:** GA4 integration is REQUIRED (not optional) for full funnel visibility.

**The Goal:** Answer the #1 question nonprofits ask: "Is my investment in MyRecruiter worth it?"

**Division of Responsibility:**
| Data | Owner | Notes |
|------|-------|-------|
| Site-wide traffic (visits, page views, bounce rate) | **GA4** | Customers already have this |
| Widget engagement (conversations, forms, CTAs) | **Picasso** | New analytics we're building |
| Attribution for widget users | **Picasso** | UTM capture links traffic source to outcomes |

**How Attribution Capture Works:**

The tenant embed script stays exactly the same:
```html
<script src="https://chat.myrecruiter.ai/widget.js" data-tenant="xxx" async></script>
```

This script runs on the parent page and has access to `window.location` (the page URL with UTM params).

**Technical Flow:**
```
1. User clicks UTM link → lands on nonprofitsite.org/foster?utm_source=facebook

2. widget-host.js loads on parent page, captures:
   - window.location.search → utm_source, utm_medium, utm_campaign, etc.
   - document.referrer → "facebook.com" (when available)
   - window.location.pathname → /foster

3. Sends to iframe via postMessage:
   { type: 'PICASSO_INIT', attribution: { utm_source: 'facebook', ... } }

4. React app receives attribution, stores with session

5. First message to backend includes attribution data

6. Backend stores attribution with session record in DynamoDB
```

**Works with any UTM source:**
| Method | Example | Captured? |
|--------|---------|-----------|
| Client creates manually | `site.org/page?utm_source=facebook` | ✅ |
| Dub.co with params | `dub.co/abc` → redirects with UTMs | ✅ |
| Bitly with params | `bit.ly/xyz` → redirects with UTMs | ✅ |
| Google Ads (gclid) | `site.org/page?gclid=abc123` | ✅ |
| Facebook Ads (fbclid) | `site.org/page?fbclid=xyz` | ✅ |
| No params | `site.org/page` | Falls back to `document.referrer` |

**Zero setup for tenants** - attribution capture is automatic.

**GA4 Integration Requirements:**
| Direction | Purpose | Priority |
|-----------|---------|----------|
| **GA4 → Picasso** | Pull site visit data to show top of funnel | **Required** |
| **Picasso → GA4** | Push widget events to their GA4 | Optional (nice-to-have) |

#### GA4 Session Stitching (Critical for Attribution)

**The Problem:** GA4 tracks visitors with `client_id`. Picasso tracks with `session_id`. How do we connect them to build the full funnel?

**Solution: Client-Side Cookie Stitching**

```javascript
// In widget-host.js - capture GA4 client_id from cookie
function getGAClientId() {
  const gaCookie = document.cookie
    .split('; ')
    .find(row => row.startsWith('_ga='));

  if (gaCookie) {
    // _ga=GA1.2.123456789.1702900000 → extract "123456789.1702900000"
    const parts = gaCookie.split('.');
    return parts.slice(2).join('.');
  }
  return null;
}

// Capture on widget initialization
const attribution = {
  ga_client_id: getGAClientId(),  // <-- Stitching key
  utm_source: getUrlParam('utm_source'),
  utm_medium: getUrlParam('utm_medium'),
  utm_campaign: getUrlParam('utm_campaign'),
  referrer: document.referrer,
  landing_page: window.location.pathname
};

// Send to iframe
iframe.contentWindow.postMessage({
  type: 'PICASSO_INIT',
  attribution: attribution
}, '*');
```

**Event Payload with Stitching Key:**
```json
{
  "session_id": "sess_abc123def456",
  "tenant_hash": "fo85e6a06dcdf4",
  "ga_client_id": "123456789.1702900000",
  "attribution": {
    "utm_source": "facebook",
    "utm_medium": "cpc",
    "utm_campaign": "foster_awareness_2025"
  },
  "event_type": "WIDGET_OPENED",
  "timestamp": "2025-12-18T14:30:00.123Z"
}
```

**DynamoDB GSI for Stitching:**
```
GSI: ga_client_id-index
PK: ga_client_id
SK: timestamp
```

This enables queries like: "For GA client 123456789, show all Picasso sessions and outcomes."

#### GA4 Data Import (BigQuery Export)

**Daily ETL Pipeline:**
```
GA4 → BigQuery (free daily export) → Cloud Function → S3 → Athena
```

**BigQuery Query (run daily):**
```sql
SELECT
  user_pseudo_id as ga_client_id,
  event_timestamp,
  event_name,
  (SELECT value.string_value FROM UNNEST(event_params)
   WHERE key = 'page_location') as page_url,
  traffic_source.source,
  traffic_source.medium,
  traffic_source.name as campaign
FROM `project.analytics_PROPERTY_ID.events_*`
WHERE _TABLE_SUFFIX = FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))
  AND event_name IN ('page_view', 'session_start')
```

**Athena Join for Attribution Funnel:**
```sql
WITH ga_visits AS (
  SELECT ga_client_id, COUNT(DISTINCT session_id) as site_visits
  FROM ga4_pageviews
  WHERE date = '2025-12-18'
  GROUP BY ga_client_id
),
picasso_sessions AS (
  SELECT ga_client_id, session_id,
         MAX(CASE WHEN event_type = 'FORM_COMPLETED' THEN 1 ELSE 0 END) as converted
  FROM picasso_events
  WHERE date_partition = '2025-12-18'
  GROUP BY ga_client_id, session_id
)
SELECT
  SUM(gv.site_visits) as total_site_visitors,
  COUNT(DISTINCT ps.session_id) as widget_sessions,
  SUM(ps.converted) as form_completions,
  ROUND(SUM(ps.converted) * 100.0 / NULLIF(COUNT(DISTINCT ps.session_id), 0), 1) as conversion_rate
FROM ga_visits gv
LEFT JOIN picasso_sessions ps ON gv.ga_client_id = ps.ga_client_id;
```

### 6. Event Reliability (SQS Buffer)
**Decision:** Add SQS buffer between API Gateway and Lambda for event durability.

**Architecture:**
```
Frontend → API Gateway → SQS Queue → Lambda (event processor) → DynamoDB
                              ↓
                         DLQ (failed events)
```

**Benefits:**
- Zero event loss even during Lambda failures or throttling
- Handles traffic spikes gracefully (SQS absorbs burst)
- Failed events preserved for debugging and replay

### 7. Data Export Capability
**Decision:** Full data export as part of tenant offboarding flow.

**Documentation:** See `/docs/roadmap/TENANT_DATA_OFFBOARDING_RECOMMENDATIONS.md`

**Export Package Contents:**
- `conversations.csv` - All Q&A pairs with timestamps
- `form_submissions.csv` - All form data (names, emails, etc.)
- `analytics_summary.json` - Aggregate statistics
- `configuration.json` - Tenant config for migration

### 8. Alerting/Notifications
**Decision:** No new alerting needed - existing infrastructure handles it.

**Already Implemented:**
- Form completion webhook in `Bedrock_Streaming_Handler_Staging/form_handler.js`
- Webhook sends form data to Bubble on completion
- Bubble handles notifications (email, etc.) from there

**Architecture:**
```
Form Completed → Lambda webhook → Bubble → Email/SMS notifications
```

### 9. Multi-Tenant Security Architecture
**Decision:** Enforce tenant isolation at the API layer, not the UI layer.

**Security Layers:**
```
1. JWT Validation (API Gateway Lambda Authorizer)
   ↓
2. Tenant ID Extraction (from JWT claims)
   ↓
3. Query Injection (FORCE tenant_id filter on ALL queries)
   ↓
4. Row-Level Security (DynamoDB: partition key includes tenant_id)
```

**API Gateway Authorizer (Lambda):**
```python
def lambda_handler(event, context):
    token = event['authorizationToken'].replace('Bearer ', '')

    # Validate JWT issued by Bubble
    claims = verify_jwt(token, BUBBLE_JWT_SECRET)

    tenant_id = claims['tenant_id']
    user_role = claims['role']  # admin, viewer, etc.

    return {
        'principalId': claims['user_id'],
        'policyDocument': generate_allow_policy(event['methodArn']),
        'context': {
            'tenant_id': tenant_id,  # Passed to downstream Lambdas
            'user_role': user_role
        }
    }
```

**Analytics API Lambda (Enforces tenant_id):**
```python
def get_attribution_funnel(event, context):
    # Extract from authorizer context - NOT from query params
    tenant_id = event['requestContext']['authorizer']['tenant_id']

    # User CANNOT override tenant_id in query params
    # Even if they try ?tenant_id=OTHER_TENANT, we ignore it

    response = dynamodb.query(
        TableName='picasso-session-summaries',
        KeyConditionExpression='pk = :pk',
        ExpressionAttributeValues={
            ':pk': f'TENANT#{tenant_id}'  # FORCED from JWT
        }
    )

    return format_funnel_response(response)
```

**Why This Matters:**
- One leaked tenant_id in a query param could expose another tenant's data
- UI-level filtering is not security - it's convenience
- API-level enforcement is the only reliable approach

### 10. Schema Versioning (Envelope Pattern)
**Decision:** Use envelope pattern for event schema to enable future evolution.

**Event Envelope:**
```json
{
  "schema_version": "1.0.0",
  "tenant_id": "fo85e6a06dcdf4",
  "session_id": "sess_abc123def456",
  "timestamp": "2025-12-18T14:30:00.123Z",
  "event": {
    "type": "FORM_FIELD_COMPLETED",
    "payload": {
      "form_id": "volunteer_application",
      "field_id": "background_check",
      "field_type": "checkbox",
      "time_to_complete_ms": 12000
    }
  }
}
```

**Why Envelope Pattern:**
1. Athena queries won't break when v1.1.0 adds new fields
2. Can validate schema at ingestion time
3. Can migrate old events via backfill Lambda
4. Enables gradual rollout of new event types

**Schema Registry (S3):**
```
s3://myrecruiter-picasso/schemas/
├── events/
│   ├── v1.0.0.json
│   └── v1.1.0.json
└── latest.json → v1.0.0.json
```

### 11. Dashboard Technology Stack
**Decision:** Custom React dashboard (not Metabase/Superset)

**Decision Date:** December 18, 2025

**Rationale:**
1. Dashboard mockups already validated with customers - high excitement
2. Building Metabase MVP then rebuilding custom = two development cycles (waste)
3. Custom visualizations (funnel with dropoff %, insight callouts) are core value
4. Full control over UX iteration based on customer feedback
5. Polished, branded experience is competitive differentiator

**Rejected Alternatives:**
| Alternative | Why Rejected |
|-------------|--------------|
| Metabase | 60-70% visual match; would need rebuild anyway |
| Superset | More complex than Metabase; still can't match mockups |
| AWS QuickSight | Expensive ($24/user/mo); less flexible |
| Google Data Studio | Adds GCP to AWS stack; being sunset |

**See "Technology Stack" section for full architecture details.**

---

*Document created: December 18, 2025*
*Last updated: December 18, 2025*
*Source: Migrated from `.claude/plans/functional-whistling-dongarra.md`*

**Revision History:**
| Date | Change |
|------|--------|
| 2025-12-18 | Added Technology Stack section (Custom React decision) |
| 2025-12-18 | Added GA4 Session Stitching technical implementation |
| 2025-12-18 | Added Multi-Tenant Security Architecture (Decision #9) |
| 2025-12-18 | Added Schema Versioning envelope pattern (Decision #10) |
| 2025-12-18 | Added Dashboard Technology Stack decision (Decision #11) |
| 2025-12-18 | Updated data retention: 7-day → 90-day hot path |
| 2025-12-18 | Updated implementation timeline: 8 weeks → 10 weeks |
| 2025-12-18 | Clarified: No Glue, No Firehose, No Redshift at current scale |
