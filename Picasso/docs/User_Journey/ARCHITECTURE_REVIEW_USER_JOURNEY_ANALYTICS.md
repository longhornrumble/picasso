# User Journey Analytics - Architectural Review

**Document Version**: 1.0
**Review Date**: December 18, 2025
**Reviewed By**: System Architect
**Plan Under Review**: `/Picasso/docs/User_Journey/USER_JOURNEY_ANALYTICS_PLAN.md`

---

## Executive Summary

**Architectural Verdict**: ✅ **APPROVED WITH RECOMMENDATIONS**

The proposed User Journey Analytics architecture is fundamentally sound and well-aligned with business requirements. The plan demonstrates strong technical rigor with clear separation of concerns, appropriate technology choices, and a realistic phased implementation approach.

**Key Strengths**:
- Event-driven architecture with proper durability (SQS buffering)
- DynamoDB-first approach eliminates CloudWatch query limitations
- Clear multi-tier data retention strategy (7-day hot, 90-day warm, archival)
- Standalone React analytics app decision is architecturally correct
- Comprehensive event schema covers all required tracking points
- Proper tenant isolation and security controls

**Areas Requiring Attention**:
1. **Session boundary management** - Need explicit timeout/inactivity handling
2. **Event ordering guarantees** - Distributed clock skew mitigation required
3. **GA4 integration authentication** - OAuth flow needs detailed specification
4. **Dashboard performance** - Query optimization strategy needs refinement
5. **Schema evolution** - Version migration strategy required
6. **Cost optimization** - DynamoDB provisioning model needs definition

**Overall Risk Level**: LOW (with recommended mitigations implemented)

---

## 1. Architectural Assessment

### 1.1 Overall Architecture Evaluation

**Rating**: ✅ EXCELLENT (9/10)

The proposed architecture follows industry best practices for event-driven analytics systems with strong separation of concerns:

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA COLLECTION TIER                      │
├─────────────────────────────────────────────────────────────────┤
│  Frontend Widget (React)                                         │
│    ├─── Event Emission Layer (notifyParentEvent)                │
│    ├─── Step Counter (frontend-owned)                           │
│    └─── Attribution Capture (UTM params, referrer)              │
│                           │                                      │
│                           ▼                                      │
│  widget-host.js (postMessage Bridge)                            │
│    ├─── Parent page access (window.location)                   │
│    ├─── UTM parameter capture                                  │
│    └─── Session initialization                                 │
│                           │                                      │
│                           ▼                                      │
├─────────────────────────────────────────────────────────────────┤
│                      DATA INGESTION TIER                         │
├─────────────────────────────────────────────────────────────────┤
│  API Gateway                                                     │
│    └─── POST /events (batch endpoint)                          │
│                           │                                      │
│                           ▼                                      │
│  SQS Queue: picasso-analytics-events                            │
│    ├─── Durability: At-least-once delivery                     │
│    ├─── Buffering: Absorbs traffic spikes                      │
│    ├─── DLQ: picasso-analytics-events-dlq                      │
│    └─── Retention: 14 days                                     │
│                           │                                      │
│                           ▼                                      │
│  Lambda: Event Processor                                        │
│    ├─── Validates event schema                                 │
│    ├─── Enriches with metadata (timestamp normalization)       │
│    ├─── Deduplicates (idempotency key)                         │
│    └─── Routes to storage tier                                 │
│                           │                                      │
│                           ▼                                      │
├─────────────────────────────────────────────────────────────────┤
│                       DATA STORAGE TIER                          │
├─────────────────────────────────────────────────────────────────┤
│  DynamoDB: picasso-session-events                               │
│    PK: SESSION#{session_id}                                     │
│    SK: STEP#{step_number}#{timestamp_ms}                        │
│    TTL: 7 days                                                  │
│    GSI: tenant-date-index (for cross-session queries)           │
│                                                                  │
│  DynamoDB: picasso-session-summaries                            │
│    PK: TENANT#{tenant_hash}                                     │
│    SK: SESSION#{session_id}                                     │
│    TTL: 90 days                                                 │
│    GSI: tenant-date-index, outcome-index                        │
│                                                                  │
│  DynamoDB: picasso-item-clicks                                  │
│    PK: TENANT#{tenant_hash}                                     │
│    SK: ITEM#{item_type}#{item_id}                               │
│    TTL: 90 days                                                 │
│                                                                  │
│  DynamoDB: picasso-analytics-daily                              │
│    PK: TENANT#{tenant_hash}                                     │
│    SK: DATE#{YYYY-MM-DD}                                        │
│    TTL: 90 days                                                 │
│    (Pre-computed aggregates for historical queries)             │
│                           │                                      │
│                           ▼                                      │
│  S3: picasso-analytics-archive                                  │
│    └─── Glacier Instant Retrieval (91-365 days)                │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                     DATA AGGREGATION TIER                        │
├─────────────────────────────────────────────────────────────────┤
│  Lambda: Aggregator_Function (EventBridge Schedule)             │
│    ├─── Runs daily at 00:00 UTC                                │
│    ├─── Reads picasso-session-summaries                        │
│    ├─── Computes daily aggregates                              │
│    ├─── Writes to picasso-analytics-daily                      │
│    └─── Archives to S3 (for sessions > 90 days)                │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                       DATA QUERY TIER                            │
├─────────────────────────────────────────────────────────────────┤
│  Lambda: Analytics_Function (API Gateway integration)           │
│    ├─── GET /analytics/journey/{session_id}                    │
│    ├─── GET /analytics/popularity/{tenant_id}                  │
│    ├─── GET /analytics/gaps/{tenant_id}                        │
│    ├─── GET /analytics/patterns/{tenant_id}                    │
│    ├─── GET /analytics/forms/funnel/{tenant_id}                │
│    └─── GET /analytics/attribution/{tenant_id}                 │
│                           │                                      │
│  New Modules:                                                   │
│    ├─── journey_reconstructor.py (session timeline queries)    │
│    ├─── gap_analyzer.py (inventory vs usage comparison)        │
│    ├─── inventory_extractor.py (config parsing)                │
│    └─── ga4_integration.py (GA4 Data API client)               │
│                           │                                      │
│                           ▼                                      │
├─────────────────────────────────────────────────────────────────┤
│                     PRESENTATION TIER                            │
├─────────────────────────────────────────────────────────────────┤
│  Standalone React Analytics App                                 │
│    ├─── Authentication: Bubble SSO/JWT                         │
│    ├─── Dashboards:                                            │
│    │     ├─── Conversations Dashboard (enhanced)              │
│    │     ├─── Attribution Dashboard (new)                      │
│    │     └─── Forms Dashboard (new)                            │
│    ├─── Export functionality (CSV, JSON)                       │
│    └─── Real-time updates (WebSocket/SSE)                      │
│                                                                  │
│  Integration with Bubble                                        │
│    ├─── Tenant management (stays in Bubble)                    │
│    ├─── Roles/permissions (stays in Bubble)                    │
│    ├─── Config editing (stays in Bubble)                       │
│    └─── Form completion alerts (existing webhook)              │
└─────────────────────────────────────────────────────────────────┘
```

**Why This Architecture Excels**:

1. **Event Durability**: SQS buffer ensures zero event loss even during Lambda failures or throttling
2. **Multi-Tier Storage**: 7-day hot (session-events), 90-day warm (summaries/daily), archival (S3) balances cost and performance
3. **Proper Separation**: Event capture → Ingestion → Storage → Aggregation → Query → Presentation
4. **Tenant Isolation**: Partition keys include tenant_hash for strict multi-tenant separation
5. **Scalability**: DynamoDB auto-scaling, Lambda concurrency, SQS buffering handle traffic spikes
6. **Auditability**: Immutable event log with step numbers enables complete session reconstruction

### 1.2 Technology Stack Evaluation

| Component | Chosen Technology | Rating | Justification |
|-----------|------------------|--------|---------------|
| **Event Collection** | JavaScript (React) | ✅ EXCELLENT | Native to existing widget, minimal overhead |
| **Event Transport** | API Gateway + SQS | ✅ EXCELLENT | Durable, scalable, managed service |
| **Event Processing** | Lambda (Python) | ✅ EXCELLENT | Serverless, auto-scaling, cost-effective |
| **Hot Storage** | DynamoDB | ✅ EXCELLENT | Sub-10ms queries, auto-scaling, TTL support |
| **Warm Storage** | DynamoDB | ✅ EXCELLENT | Pre-computed aggregates for historical queries |
| **Cold Storage** | S3 Glacier IR | ✅ GOOD | Cost-effective, instant retrieval for compliance |
| **Analytics Frontend** | React (standalone) | ✅ EXCELLENT | Reusable components, rich ecosystem |
| **Authentication** | Bubble JWT/SSO | ⚠️ GOOD | Pragmatic for MVP, consider Cognito long-term |
| **GA4 Integration** | GA4 Data API | ✅ EXCELLENT | Standard approach, well-documented |

**Recommended Technology Additions**:
- **EventBridge** (instead of cron) for Aggregator scheduling - Better observability, retry logic
- **CloudWatch Insights** for DLQ monitoring and alerting
- **X-Ray** for distributed tracing across Lambda functions

### 1.3 Schema Design Review

**Event Schema**: ✅ WELL-DESIGNED

```json
{
  "event_id": "evt_abc123xyz789",  // Idempotency key
  "timestamp": "2025-12-18T14:30:00.123Z",  // ISO 8601
  "session_id": "sess_abc123def456",
  "tenant_hash": "my87674d777bf9",
  "step_number": 5,
  "event_type": "CTA_CLICKED",
  "payload": {
    "cta_id": "volunteer_apply",
    "cta_label": "Apply to Volunteer",
    "cta_action": "form_trigger",
    "triggers_form": "volunteer_application"
  },
  "context": {
    "user_agent": "Mozilla/5.0...",
    "viewport_width": 1920,
    "viewport_height": 1080
  },
  "attribution": {
    "utm_source": "facebook",
    "utm_medium": "social",
    "utm_campaign": "spring_2025",
    "referrer": "https://facebook.com"
  }
}
```

**Strengths**:
- Idempotency key (`event_id`) prevents duplicate processing
- Composite sort key (`STEP#{step_number}#{timestamp_ms}`) handles clock skew
- Rich payload captures all required business context
- Attribution captured at session start and persisted

**Improvement Recommendations**:

1. **Add schema versioning**:
```json
{
  "schema_version": "1.0",
  "event_id": "evt_...",
  // ... rest of event
}
```

2. **Add client-side timestamp** (for clock skew detection):
```json
{
  "timestamp_client": "2025-12-18T14:30:00.123Z",
  "timestamp_server": "2025-12-18T14:30:00.456Z",  // Added by Lambda
  // ... rest of event
}
```

3. **Add sequence number** (for ordering guarantee):
```json
{
  "sequence_number": 12,  // Client-side monotonic counter
  "step_number": 5,  // Logical step (user-facing)
  // ... rest of event
}
```

---

## 2. Component Boundaries & Responsibilities

### 2.1 Frontend (Picasso Widget)

**Responsibility**: Event capture and initial enrichment

| Component | Responsibility | Input | Output |
|-----------|---------------|-------|--------|
| **widget-host.js** | Attribution capture | window.location, document.referrer | UTM params, referrer |
| **iframe-main.jsx** | Step counter management | User interactions | step_number |
| **notifyParentEvent()** | Event emission | Component events | Formatted event payloads |
| **CTAButton.jsx** | CTA click tracking | Button clicks | CTA_CLICKED events |
| **FormFieldPrompt.jsx** | Form interaction tracking | Field interactions | FORM_* events |

**✅ Well-Defined**: Clear single responsibility per component

**Recommended Additions**:
- **Event Buffer** (localStorage) for offline resilience:
  ```javascript
  // Store events locally if API is unavailable
  const eventBuffer = {
    queue: [],
    maxSize: 100,
    flush: async () => { /* Send buffered events when online */ }
  };
  ```

- **Client-Side Deduplication** (prevent double-sends):
  ```javascript
  const sentEvents = new Set(); // event_id cache
  function emitEvent(event) {
    if (sentEvents.has(event.event_id)) return;
    sentEvents.add(event.event_id);
    // ... send event
  }
  ```

### 2.2 Backend (Lambda Functions)

**Responsibility**: Event processing, storage, aggregation, and querying

| Function | Responsibility | Runtime | Memory | Timeout |
|----------|---------------|---------|--------|---------|
| **Event Processor** | Validate, enrich, deduplicate events | Python 3.13 | 512 MB | 60s |
| **Aggregator_Function** | Daily batch aggregation | Python 3.13 | 1024 MB | 900s (15 min) |
| **Analytics_Function** | Query API for dashboards | Python 3.13 | 1024 MB | 30s |
| **GA4 Integration** | Fetch GA4 data | Python 3.13 | 512 MB | 60s |

**✅ Well-Defined**: Clear separation between real-time (Event Processor), batch (Aggregator), and query (Analytics)

**Recommended Refinements**:

1. **Event Processor** - Add idempotency layer:
```python
# In Event Processor Lambda
def process_event(event_payload):
    event_id = event_payload['event_id']

    # Check DynamoDB for existing event_id
    existing = dynamodb.get_item(
        TableName='picasso-event-dedup',
        Key={'event_id': event_id}
    )

    if existing:
        return {'status': 'duplicate', 'event_id': event_id}

    # Process event...
    # Store event_id in dedup table (TTL: 24 hours)
    dynamodb.put_item(
        TableName='picasso-event-dedup',
        Item={
            'event_id': event_id,
            'processed_at': timestamp,
            'ttl': timestamp + 86400  # 24-hour TTL
        }
    )
```

2. **Aggregator_Function** - Add incremental processing:
```python
# Instead of full daily recomputation, use checkpointing
def aggregate_sessions(tenant_hash, date):
    # Check for last processed session_id
    checkpoint = get_checkpoint(tenant_hash, date)

    # Query only new sessions since checkpoint
    new_sessions = query_sessions(
        tenant_hash=tenant_hash,
        date=date,
        start_after=checkpoint['last_session_id']
    )

    # Update aggregates incrementally
    update_aggregates(new_sessions)

    # Save new checkpoint
    save_checkpoint(tenant_hash, date, last_session_id)
```

### 2.3 Infrastructure (DynamoDB, S3, SQS)

**Responsibility**: Durable storage, buffering, and archival

| Component | Responsibility | Configuration |
|-----------|---------------|---------------|
| **SQS Queue** | Event buffering | Visibility timeout: 120s, DLQ threshold: 3 retries |
| **DynamoDB (session-events)** | Hot storage (7 days) | On-demand billing, TTL enabled |
| **DynamoDB (session-summaries)** | Warm storage (90 days) | On-demand billing, GSI for date queries |
| **DynamoDB (analytics-daily)** | Pre-computed aggregates (90 days) | Provisioned capacity (low cost) |
| **S3 (archive)** | Cold storage (91-365 days) | Glacier IR, lifecycle policy |

**✅ Well-Defined**: Clear data lifecycle with cost optimization

**Recommended Additions**:

1. **DynamoDB Capacity Planning**:
```
Estimated Traffic (per tenant):
- 1,000 sessions/day
- 10 events/session average
- 10,000 events/day

DynamoDB Writes (session-events):
- 10,000 writes/day = 0.12 writes/second average
- Peak (5x average) = 0.6 writes/second
- Recommended: On-demand billing (variable traffic)

DynamoDB Reads (session-events):
- Assume 10% of sessions queried within 7 days = 100 queries/day
- Average 10 events/session = 1,000 reads/day = 0.01 reads/second
- Recommended: On-demand billing (variable traffic)

DynamoDB Writes (session-summaries):
- 1,000 writes/day = 0.01 writes/second
- Recommended: On-demand billing

DynamoDB Reads (session-summaries):
- Dashboard queries: 100 reads/day = 0.001 reads/second
- Recommended: On-demand billing

DynamoDB (analytics-daily):
- Writes: 1/day per tenant (daily aggregation)
- Reads: 10-50/day (dashboard queries)
- Recommended: Provisioned capacity (1 WCU, 5 RCU per tenant)
```

2. **S3 Lifecycle Policy**:
```json
{
  "Rules": [
    {
      "Id": "ArchiveOldSessions",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "sessions/"
      },
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "GLACIER_IR"
        }
      ],
      "Expiration": {
        "Days": 365
      }
    }
  ]
}
```

---

## 3. Data Flow Analysis

### 3.1 Event Flow (Widget → Backend → Storage)

**Path 1: User Interaction → Event Capture → Storage**

```
USER ACTION (e.g., clicks CTA button)
    │
    ▼
CTAButton.jsx (onClick handler)
    │
    ├─── Generate event_id (UUID)
    ├─── Capture step_number (from context)
    ├─── Build payload { cta_id, cta_label, ... }
    │
    ▼
notifyParentEvent({ type: 'CTA_CLICKED', payload: {...} })
    │
    ▼
widget-host.js (receives postMessage)
    │
    ├─── Enrich with attribution (if session start)
    ├─── Enrich with context (user_agent, viewport)
    │
    ▼
Batch events (send every 5 seconds OR when 10 events queued)
    │
    ▼
POST /events (API Gateway)
    │
    ▼
SQS Queue: picasso-analytics-events
    │
    ├─── Buffer (handles spike traffic)
    ├─── Retry (3 attempts)
    ├─── DLQ (failed events)
    │
    ▼
Lambda: Event Processor (triggered by SQS)
    │
    ├─── Validate schema (Zod or JSON Schema)
    ├─── Check idempotency (DynamoDB dedup table)
    ├─── Enrich timestamp_server
    ├─── Normalize data types
    │
    ▼
DynamoDB: picasso-session-events
    PK: SESSION#{session_id}
    SK: STEP#{step_number}#{timestamp_ms}
    Item: { event_type, payload, context, attribution }
    TTL: timestamp + 7 days
```

**✅ CORRECT**: Proper buffering, deduplication, and durability

**Path 2: Session End → Summary Generation**

```
WIDGET_CLOSED event received
    │
    ▼
Lambda: Event Processor
    │
    ├─── Query all events for session (DynamoDB)
    ├─── Compute summary:
    │       ├─── duration_seconds = end_time - start_time
    │       ├─── message_count = count(MESSAGE_SENT | MESSAGE_RECEIVED)
    │       ├─── outcome = determine_outcome(events)
    │       ├─── topics = extract_branch_ids(events)
    │       └─── first_question = first(MESSAGE_SENT).content
    │
    ▼
DynamoDB: picasso-session-summaries
    PK: TENANT#{tenant_hash}
    SK: SESSION#{session_id}
    Item: { started_at, ended_at, duration, outcome, ... }
    TTL: timestamp + 90 days
```

**⚠️ ISSUE IDENTIFIED**: Session boundary detection

**Problem**: How does the system know when a session has "ended"?

**Proposed Solutions**:

**Option 1: Frontend-Driven Session End** (Recommended)
```javascript
// In widget-host.js
window.addEventListener('beforeunload', () => {
  // Send session end event (beacon API for reliability)
  navigator.sendBeacon('/events', JSON.stringify({
    type: 'SESSION_ENDED',
    session_id: currentSessionId,
    reason: 'page_unload'
  }));
});

// Also send session end on explicit close
function closeWidget() {
  notifyParentEvent({ type: 'WIDGET_CLOSED' });
  // Widget close doesn't necessarily mean session end
  // Session continues for 30 minutes (inactivity timeout)
}
```

**Option 2: Backend-Driven Session Timeout**
```python
# In Aggregator_Function (runs hourly)
def close_inactive_sessions():
    cutoff_time = now() - timedelta(minutes=30)

    # Query sessions without WIDGET_CLOSED event and last event > 30 min ago
    inactive_sessions = query_sessions_without_close(cutoff_time)

    for session in inactive_sessions:
        # Generate synthetic SESSION_ENDED event
        create_summary_for_session(session)
```

**Recommendation**: Hybrid approach
- Frontend sends WIDGET_CLOSED when possible (best-effort)
- Backend timeout creates summary after 30 minutes of inactivity
- Ensures all sessions eventually get summarized

### 3.2 Attribution Flow (GA4 → Picasso)

**Path 3: GA4 Data → Attribution Dashboard**

```
USER VISITS SITE (from Facebook ad)
    │
    ├─── URL: nonprofitsite.org/foster?utm_source=facebook&utm_medium=social
    │
    ▼
GA4 (Google Analytics 4) - Captures page view
    │
    ├─── Records: session_id, utm_source, utm_medium, page_path
    ├─── Stores in GA4 backend
    │
    ▼
widget-host.js loads on page
    │
    ├─── Reads window.location.search
    ├─── Extracts: { utm_source: 'facebook', utm_medium: 'social' }
    ├─── Reads document.referrer: "https://facebook.com"
    │
    ▼
Picasso session starts
    │
    ├─── Create session_id (Picasso-scoped)
    ├─── Store attribution with session
    │
    ▼
Dashboard Query Time:
    │
    ▼
Lambda: GA4 Integration
    │
    ├─── Authenticate with GA4 (OAuth 2.0)
    ├─── Query GA4 Data API:
    │       GET /v1beta/{property}/runReport
    │       {
    │         "dateRanges": [{"startDate": "7daysAgo", "endDate": "today"}],
    │         "dimensions": ["sessionSource", "sessionMedium", "pagePath"],
    │         "metrics": ["sessions", "totalUsers"]
    │       }
    ├─── Receive GA4 data:
    │       {
    │         "rows": [
    │           {"dimensionValues": ["facebook", "social", "/foster"], "metricValues": ["150", "120"]},
    │           {"dimensionValues": ["organic", "none", "/foster"], "metricValues": ["50", "45"]}
    │         ]
    │       }
    │
    ▼
Lambda: Analytics_Function
    │
    ├─── Query Picasso session-summaries (filter by date range)
    ├─── JOIN on attribution.utm_source + attribution.utm_medium
    ├─── Compute conversion rates:
    │       Facebook: 150 sessions (GA4) → 45 conversations (Picasso) → 12 form completions
    │       Organic: 50 sessions (GA4) → 8 conversations (Picasso) → 1 form completion
    │
    ▼
Attribution Dashboard displays:
    "Facebook traffic converted at 8% vs 2% for organic"
```

**✅ CORRECT**: Proper separation of concerns - GA4 tracks site-wide, Picasso tracks widget engagement

**⚠️ ISSUE IDENTIFIED**: GA4 OAuth flow not fully specified

**Required Implementation**:

1. **GA4 OAuth Configuration**:
```python
# In Lambda: GA4 Integration
from google.oauth2.credentials import Credentials
from google.analytics.data_v1beta import BetaAnalyticsDataClient

def get_ga4_client(tenant_id):
    # Load OAuth credentials from Secrets Manager
    secret = secretsmanager.get_secret_value(
        SecretId=f'picasso/ga4/{tenant_id}/oauth'
    )

    credentials_info = json.loads(secret['SecretString'])
    credentials = Credentials.from_authorized_user_info(credentials_info)

    # Create GA4 client
    client = BetaAnalyticsDataClient(credentials=credentials)
    return client
```

2. **OAuth Setup Flow** (Admin UI):
```
Admin clicks "Connect GA4" in Bubble
    ↓
Bubble opens OAuth popup:
    https://accounts.google.com/o/oauth2/auth
        ?client_id={CLIENT_ID}
        &redirect_uri=https://app.bubble.io/oauth-callback
        &scope=https://www.googleapis.com/auth/analytics.readonly
        &response_type=code
    ↓
User authorizes in Google
    ↓
Google redirects to Bubble with code
    ↓
Bubble exchanges code for access_token + refresh_token
    ↓
Bubble stores tokens in Secrets Manager:
    picasso/ga4/{tenant_id}/oauth
    {
      "access_token": "...",
      "refresh_token": "...",
      "token_uri": "https://oauth2.googleapis.com/token",
      "client_id": "...",
      "client_secret": "...",
      "scopes": ["https://www.googleapis.com/auth/analytics.readonly"]
    }
    ↓
Bubble updates tenant config:
    config.ga4_integration = {
      "enabled": true,
      "property_id": "123456789"  // User provides this
    }
```

**Recommendation**: Add GA4 OAuth setup wizard to Bubble admin console (Phase 3)

### 3.3 Aggregation Flow (Daily Batch)

**Path 4: Session Summaries → Daily Aggregates**

```
EventBridge Rule (cron: 0 0 * * ? *)  // Daily at midnight UTC
    │
    ▼
Lambda: Aggregator_Function
    │
    ├─── FOR EACH tenant:
    │       │
    │       ├─── Query picasso-session-summaries
    │       │       WHERE PK = TENANT#{tenant_hash}
    │       │       AND started_at BETWEEN yesterday 00:00 AND yesterday 23:59
    │       │
    │       ├─── Compute aggregates:
    │       │       total_sessions = count(sessions)
    │       │       total_messages = sum(message_count)
    │       │       form_completions = count(outcome == 'form_completed')
    │       │       avg_duration = avg(duration_seconds)
    │       │       conversation_depth_distribution = histogram(message_count)
    │       │       top_topics = count_by(topics) ORDER BY count DESC LIMIT 10
    │       │
    │       ├─── Query picasso-item-clicks
    │       │       WHERE PK = TENANT#{tenant_hash}
    │       │       (Item clicks are updated real-time, read here for daily snapshot)
    │       │
    │       ├─── Compute item aggregates:
    │       │       top_action_chips = sort_by_clicks(action_chips) LIMIT 10
    │       │       top_ctas = sort_by_clicks(ctas) LIMIT 10
    │       │       top_links = sort_by_clicks(links) LIMIT 10
    │       │       never_clicked_items = items_with_zero_clicks()
    │       │
    │       ▼
    │   DynamoDB: picasso-analytics-daily
    │       PK: TENANT#{tenant_hash}
    │       SK: DATE#{YYYY-MM-DD}
    │       Item: {
    │         total_sessions,
    │         total_messages,
    │         form_completions,
    │         avg_duration,
    │         conversation_depth_distribution,
    │         top_topics,
    │         top_action_chips,
    │         top_ctas,
    │         top_links,
    │         never_clicked_items
    │       }
    │       TTL: timestamp + 90 days
    │
    ├─── Archive sessions > 90 days to S3
    │       │
    │       ├─── Query picasso-session-summaries WHERE ttl < now() + 7 days
    │       ├─── Export to S3: s3://picasso-analytics-archive/{tenant_hash}/{year}/{month}/{day}/sessions.jsonl.gz
    │       ├─── Delete from DynamoDB (DynamoDB auto-deletes via TTL, this is cleanup)
    │
    ▼
CloudWatch Logs: Aggregation metrics (duration, record count, errors)
```

**✅ CORRECT**: Batch processing with incremental archival

**Recommended Optimization**:

**Parallel Processing** (reduce aggregation time):
```python
# In Aggregator_Function
import concurrent.futures

def aggregate_all_tenants(date):
    tenants = get_all_tenants()  # Query tenant list

    # Process tenants in parallel (up to 10 concurrent)
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [
            executor.submit(aggregate_tenant, tenant_hash, date)
            for tenant_hash in tenants
        ]

        # Wait for all to complete
        results = [f.result() for f in concurrent.futures.as_completed(futures)]

    return results
```

---

## 4. Integration Points

### 4.1 GA4 Integration

**Status**: ⚠️ REQUIRES SPECIFICATION

**Current Plan**:
- Direction: GA4 → Picasso (pull site visit data)
- Method: GA4 Data API
- Authentication: OAuth 2.0

**Missing Specifications**:
1. OAuth token refresh strategy
2. API rate limiting (10k requests/day per property)
3. Data freshness (GA4 data is typically 24-48 hours delayed)
4. Correlation strategy (how to JOIN GA4 sessions with Picasso sessions?)

**Recommended Implementation**:

**1. OAuth Token Refresh**:
```python
# In ga4_integration.py
def get_refreshed_credentials(tenant_id):
    # Load credentials from Secrets Manager
    secret = load_credentials(tenant_id)
    credentials = Credentials.from_authorized_user_info(secret)

    # Check if expired
    if credentials.expired:
        credentials.refresh(Request())

        # Save refreshed token
        save_credentials(tenant_id, credentials.to_json())

    return credentials
```

**2. Rate Limiting**:
```python
# In ga4_integration.py
import time
from functools import wraps

# GA4 API limits: 10 requests/second, 10k requests/day
def rate_limit(max_per_second=10):
    min_interval = 1.0 / max_per_second
    last_called = [0.0]

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            elapsed = time.time() - last_called[0]
            if elapsed < min_interval:
                time.sleep(min_interval - elapsed)

            result = func(*args, **kwargs)
            last_called[0] = time.time()
            return result
        return wrapper
    return decorator

@rate_limit(max_per_second=5)  # Conservative limit
def query_ga4(client, property_id, request):
    return client.run_report(property=f"properties/{property_id}", request=request)
```

**3. Data Freshness**:
```python
# In analytics_function.py
def get_attribution_funnel(tenant_id, date_range):
    # GA4 data is delayed 24-48 hours
    # For "Today" queries, show disclaimer
    if date_range == 'today':
        return {
            'data': get_picasso_data_only(tenant_id),
            'ga4_available': False,
            'message': 'GA4 data is delayed 24-48 hours. Showing Picasso data only.'
        }

    # For historical queries, fetch GA4 data
    ga4_data = fetch_ga4_data(tenant_id, date_range)
    picasso_data = get_picasso_data(tenant_id, date_range)

    # Merge datasets
    return merge_attribution_data(ga4_data, picasso_data)
```

**4. Correlation Strategy**:

**Problem**: GA4 uses its own session_id, Picasso uses its own session_id. How to correlate?

**Solution**: Use **time-based correlation** with **UTM parameters**:

```python
def correlate_ga4_and_picasso(ga4_data, picasso_data):
    """
    Correlate GA4 site visitors with Picasso widget users

    Strategy:
    - GA4 provides: Total site visitors by source/medium/campaign
    - Picasso provides: Widget conversations by attribution.utm_*
    - JOIN on: utm_source + utm_medium + date

    Returns funnel:
    {
      'facebook_social': {
        'site_visitors': 1200,      # From GA4
        'widget_opened': 350,        # From Picasso
        'conversations': 95,         # From Picasso
        'form_completions': 28       # From Picasso
      }
    }
    """
    funnel = {}

    # Group GA4 data by source/medium
    for row in ga4_data['rows']:
        source = row['dimensionValues'][0]
        medium = row['dimensionValues'][1]
        sessions = int(row['metricValues'][0])

        key = f"{source}_{medium}"
        funnel[key] = {'site_visitors': sessions}

    # Group Picasso data by utm_source/utm_medium
    for session in picasso_data:
        source = session.get('attribution', {}).get('utm_source', 'direct')
        medium = session.get('attribution', {}).get('utm_medium', 'none')

        key = f"{source}_{medium}"
        if key not in funnel:
            funnel[key] = {'site_visitors': 0}  # GA4 data missing

        funnel[key]['widget_opened'] = funnel[key].get('widget_opened', 0) + 1

        if session['message_count'] > 0:
            funnel[key]['conversations'] = funnel[key].get('conversations', 0) + 1

        if session['outcome'] == 'form_completed':
            funnel[key]['form_completions'] = funnel[key].get('form_completions', 0) + 1

    return funnel
```

**Recommendation**: Document GA4 integration as a separate specification document (GA4_INTEGRATION_SPEC.md)

### 4.2 Bubble Integration

**Status**: ✅ WELL-DEFINED

**Integration Points**:

| Function | Location | Integration Method |
|----------|----------|-------------------|
| **Tenant Management** | Bubble | Stays in Bubble (no change) |
| **Roles/Permissions** | Bubble | Stays in Bubble (RBAC) |
| **Config Editing** | Bubble | Stays in Bubble (Web Config Builder) |
| **Authentication** | Bubble | SSO/JWT for analytics app |
| **Form Completion Alerts** | Bubble | Existing webhook (no change) |
| **Analytics Dashboards** | New React App | Bubble → Analytics App link |

**Authentication Flow**:

```
User logs into Bubble
    │
    ▼
Bubble generates JWT token
    {
      "sub": "user_123",
      "tenant_hash": "my87674d777bf9",
      "role": "admin",
      "exp": 1640000000
    }
    │
    ▼
Bubble redirects to Analytics App:
    https://analytics.myrecruiter.ai?token={JWT}
    │
    ▼
Analytics App validates JWT
    ├─── Verify signature (using shared secret)
    ├─── Check expiration
    ├─── Extract tenant_hash and role
    │
    ▼
Analytics App loads dashboards
    ├─── Filters data by tenant_hash (multi-tenant isolation)
    ├─── Shows UI based on role (admin sees all, viewer sees limited)
```

**✅ CORRECT**: Bubble remains the "source of truth" for tenant management and auth

**Recommended Addition**:

**Single Sign-On (SSO) Link**:
```html
<!-- In Bubble dashboard -->
<a href="https://analytics.myrecruiter.ai?token={current_user.jwt_token}">
  View Analytics →
</a>
```

**Token Validation** (in Analytics App):
```javascript
// In Analytics App - src/auth/validateToken.js
import jwt from 'jsonwebtoken';

export function validateBubbleToken(token) {
  try {
    // Verify JWT signature with shared secret
    const decoded = jwt.verify(token, process.env.BUBBLE_JWT_SECRET);

    // Check required claims
    if (!decoded.tenant_hash || !decoded.role) {
      throw new Error('Invalid token claims');
    }

    return {
      isValid: true,
      tenant_hash: decoded.tenant_hash,
      role: decoded.role,
      user_id: decoded.sub
    };
  } catch (error) {
    return {
      isValid: false,
      error: error.message
    };
  }
}
```

### 4.3 Existing Systems Integration

**Status**: ✅ WELL-DESIGNED

| System | Integration Point | Data Flow | Change Required |
|--------|------------------|-----------|----------------|
| **Bedrock Streaming Handler** | QA_COMPLETE logging | Lambda → CloudWatch | ⚠️ Add DynamoDB write |
| **Master Function** | Conversation routing | Lambda → DynamoDB | ✅ No change (already writes) |
| **Form Submissions** | Form completion | Lambda → DynamoDB → Webhook | ✅ No change |
| **Tenant Configs (S3)** | Inventory extraction | S3 → Lambda | ✅ No change |

**Required Change - Bedrock Streaming Handler**:

Currently: QA_COMPLETE only writes to CloudWatch
Required: QA_COMPLETE must ALSO write to DynamoDB

```javascript
// In Bedrock_Streaming_Handler_Staging/index.js

// BEFORE (current implementation):
console.log('QA_COMPLETE', JSON.stringify({
  session_id: sessionId,
  tenant: tenantHash,
  question: userMessage,
  answer: botResponse,
  routing_tier: routingTier
}));

// AFTER (required implementation):
// 1. Write to CloudWatch (keep for legacy)
console.log('QA_COMPLETE', JSON.stringify({ /* same as before */ }));

// 2. ALSO write to DynamoDB (new requirement)
await dynamodb.putItem({
  TableName: 'picasso-session-events',
  Item: {
    PK: { S: `SESSION#${sessionId}` },
    SK: { S: `STEP#${stepNumber}#${Date.now()}` },
    tenant_hash: { S: tenantHash },
    event_type: { S: 'QA_COMPLETE' },
    timestamp: { S: new Date().toISOString() },
    payload: {
      M: {
        question: { S: userMessage },
        answer: { S: botResponse },
        routing_tier: { S: routingTier },
        response_time_ms: { N: responseTime.toString() }
      }
    }
  }
});
```

**Recommendation**: Add this change to Phase 1 (Event Capture)

---

## 5. Scalability Considerations

### 5.1 Traffic Projections

**Current State** (as of December 2025):
- Active tenants: ~10
- Sessions per tenant per day: ~100
- Events per session: ~10
- **Total events per day: 10,000**

**Growth Projections** (3-year horizon):

| Metric | Year 1 (2026) | Year 2 (2027) | Year 3 (2028) |
|--------|---------------|---------------|---------------|
| Active tenants | 50 | 200 | 500 |
| Sessions/tenant/day | 200 | 300 | 500 |
| Events/session | 12 | 15 | 15 |
| **Events/day** | 120k | 900k | 3.75M |
| **Events/second (avg)** | 1.4 | 10.4 | 43.4 |
| **Events/second (peak 10x)** | 14 | 104 | 434 |

### 5.2 Component Scaling Analysis

| Component | Bottleneck | Scaling Strategy | Max Capacity |
|-----------|-----------|------------------|--------------|
| **API Gateway** | Requests/second | Auto-scales | 10,000 req/s (default) |
| **SQS Queue** | Throughput | Auto-scales | Unlimited (practically) |
| **Lambda (Event Processor)** | Concurrency | Reserved concurrency + auto-scale | 1,000 concurrent executions (configurable) |
| **DynamoDB (session-events)** | Write capacity | On-demand auto-scaling | 40,000 WCU (default), 100k+ with limit increase |
| **DynamoDB (session-summaries)** | Write capacity | On-demand auto-scaling | 40,000 WCU |
| **Lambda (Aggregator)** | Memory/timeout | Increase memory to 3008 MB | Single-tenant serial processing |
| **Lambda (Analytics)** | Query latency | Read replicas, caching | 1,000 concurrent queries |

**Bottleneck Analysis**:

**Projected Load at Year 3**:
- 434 events/second (peak)
- DynamoDB writes: 434 WCU (well within 40k limit)
- Lambda concurrency: ~44 concurrent executions (assuming 100ms processing time)
- SQS throughput: 434 messages/second (no limit)

**Verdict**: ✅ **Architecture will scale to 500 tenants without modification**

**Recommended Optimizations** (when needed):

1. **DynamoDB Global Secondary Indexes** (when query patterns become complex):
```
GSI: tenant-date-outcome-index
PK: TENANT#{tenant_hash}#DATE#{YYYY-MM-DD}
SK: OUTCOME#{outcome}#SESSION#{session_id}

Enables fast queries like:
- "Show all form completions for tenant X on date Y"
- Without scanning entire session-summaries table
```

2. **Lambda Reserved Concurrency** (prevent throttling):
```
Event Processor Lambda:
- Reserved concurrency: 100 (guarantees capacity)
- Provisioned concurrency: 10 (pre-warmed instances)

Analytics Lambda:
- Reserved concurrency: 50
- Provisioned concurrency: 5
```

3. **ElastiCache (Redis)** for hot data caching (when query latency > 500ms):
```python
# In analytics_function.py
import redis

cache = redis.Redis(host='picasso-analytics-cache.abc123.use1.cache.amazonaws.com')

def get_top_questions(tenant_id, date_range):
    cache_key = f"top_questions:{tenant_id}:{date_range}"

    # Try cache first
    cached = cache.get(cache_key)
    if cached:
        return json.loads(cached)

    # Cache miss - query DynamoDB
    result = query_dynamodb(tenant_id, date_range)

    # Cache for 5 minutes
    cache.setex(cache_key, 300, json.dumps(result))
    return result
```

### 5.3 Cost Projections

**Current Cost** (10 tenants, 10k events/day):

| Component | Monthly Cost |
|-----------|-------------|
| API Gateway | $0.35 (10k requests/day × $3.50/M) |
| SQS | $0.04 (10k messages/day × $0.40/M) |
| Lambda (Event Processor) | $0.20 (10k invocations × $0.20/M + 100ms × $0.0000166667/GB-s) |
| DynamoDB (session-events) | $1.25 (10k writes × $1.25/M WCU on-demand) |
| DynamoDB (session-summaries) | $0.13 (1k writes × $1.25/M WCU) |
| DynamoDB (analytics-daily) | $0.01 (10 writes × $1.25/M WCU) |
| S3 (Glacier IR) | $4.00 (100 GB × $0.004/GB) |
| Lambda (Aggregator) | $0.05 (30 invocations × $0.20/M) |
| Lambda (Analytics) | $1.00 (100 queries/day × $0.20/M) |
| **TOTAL** | **~$7/month** |

**Year 3 Cost** (500 tenants, 3.75M events/day):

| Component | Monthly Cost |
|-----------|-------------|
| API Gateway | $131 (3.75M requests/day × $3.50/M) |
| SQS | $15 (3.75M messages/day × $0.40/M) |
| Lambda (Event Processor) | $75 (3.75M invocations + compute) |
| DynamoDB (session-events) | $469 (3.75M writes × $1.25/M WCU) |
| DynamoDB (session-summaries) | $47 (375k writes × $1.25/M WCU) |
| DynamoDB (analytics-daily) | $0.63 (500 writes/day × $1.25/M WCU) |
| S3 (Glacier IR) | $200 (5 TB × $0.004/GB) |
| Lambda (Aggregator) | $2.50 (30 invocations, longer duration) |
| Lambda (Analytics) | $50 (5k queries/day) |
| **TOTAL** | **~$990/month** |

**Cost per Tenant** (Year 3): $990 / 500 = **$1.98/month**

**Revenue Assumption**: If MyRecruiter charges $100/month per tenant, infrastructure cost is **2% of revenue** (excellent margin)

**Verdict**: ✅ **Architecture is cost-effective at scale**

---

## 6. Implementation Sequencing

### 6.1 Proposed Phased Approach Evaluation

The plan proposes 4 phases over 8 weeks:

| Phase | Duration | Focus | Risk Level |
|-------|----------|-------|-----------|
| **Phase 1: Event Capture** | Weeks 1-2 | Frontend event emission, backend ingestion | 🟢 LOW |
| **Phase 2: Inventory & Aggregation** | Weeks 3-4 | Config parsing, daily batch processing | 🟢 LOW |
| **Phase 3: Query APIs & GA4** | Weeks 5-6 | Analytics endpoints, GA4 integration | 🟡 MEDIUM |
| **Phase 4: Dashboards** | Weeks 7-8 | React app, visualizations, export | 🟡 MEDIUM |

**Overall Assessment**: ✅ **REALISTIC and WELL-SEQUENCED**

### 6.2 Recommended Refinements

**Phase 0: Foundation (NEW - Week 0)**

Before starting Phase 1, establish foundational infrastructure:

```
Tasks:
☐ Create DynamoDB tables (session-events, session-summaries, item-clicks, analytics-daily)
☐ Create SQS queue and DLQ
☐ Deploy Event Processor Lambda (skeleton - just writes to DynamoDB)
☐ Create API Gateway endpoint (POST /events)
☐ Set up CloudWatch dashboards for monitoring
☐ Define event schema (JSON Schema files)
☐ Create test event generator (for load testing)

Success Criteria:
✅ Can send test event via API Gateway
✅ Event appears in DynamoDB
✅ CloudWatch shows metrics

Duration: 2-3 days
```

**Phase 1: Event Capture (Refined)**

```
Week 1: Frontend Event Emission
  Day 1-2: Extend notifyParentEvent() with step tracking
    ☐ Add step counter to iframe-main.jsx
    ☐ Increment on MESSAGE_SENT, CTA_CLICKED, FORM_STARTED
    ☐ Add sequence_number for ordering guarantee

  Day 3: Attribution capture in widget-host.js
    ☐ Parse window.location.search for UTM params
    ☐ Capture document.referrer
    ☐ Add captureAttribution() function

  Day 4-5: Component-level tracking
    ☐ CTAButton.jsx - emit CTA_CLICKED
    ☐ FormFieldPrompt.jsx - emit FORM_FIELD_SUBMITTED
    ☐ MessageBubble.jsx - emit LINK_CLICKED
    ☐ ChatWidget.jsx - emit ACTION_CHIP_CLICKED

Week 2: Backend Event Processing
  Day 6-7: Event Processor Lambda
    ☐ Schema validation (Zod)
    ☐ Idempotency check (DynamoDB dedup table)
    ☐ Timestamp normalization (client vs server)
    ☐ Write to session-events table

  Day 8: Session summary generation
    ☐ Detect WIDGET_CLOSED event
    ☐ Query all events for session
    ☐ Compute summary metrics
    ☐ Write to session-summaries table

  Day 9: Testing
    ☐ Unit tests (Jest + pytest)
    ☐ Integration test (end-to-end event flow)
    ☐ Load test (100 events/second)

  Day 10: Deployment
    ☐ Deploy to staging environment
    ☐ Monitor CloudWatch for errors
    ☐ Verify DynamoDB writes

Success Criteria:
✅ All component interactions emit events
✅ Events stored in DynamoDB with <100ms latency
✅ Session summaries generated within 5 seconds of widget close
✅ Zero event loss during load test
✅ <50ms overhead on frontend
```

**Phase 2: Inventory & Aggregation (Refined)**

```
Week 3: Inventory Extraction
  Day 11-12: inventory_extractor.py module
    ☐ Parse action_chips from config (v1.3 and v1.4.1 formats)
    ☐ Parse cta_definitions
    ☐ Parse quick_help.prompts
    ☐ Parse content_showcase
    ☐ Handle both array and dict formats

  Day 13: KB link extraction
    ☐ Modify RAG upload pipeline to extract links
    ☐ Store in config.kb_inventory.links
    ☐ Update schema to include kb_inventory

  Day 14-15: item-clicks table management
    ☐ Create DynamoDB table (tenant-item composite key)
    ☐ Update Event Processor to increment click counts
    ☐ Add click_count, last_7_days, last_30_days attributes

Week 4: Daily Aggregation
  Day 16-17: Aggregator_Function enhancements
    ☐ Query session-summaries for yesterday
    ☐ Compute session aggregates
    ☐ Compute conversation depth distribution
    ☐ Extract top topics (branch_ids)
    ☐ Write to analytics-daily table

  Day 18: Item aggregation
    ☐ Read item-clicks table
    ☐ Sort by click count
    ☐ Identify never-clicked items
    ☐ Store in analytics-daily (top_items section)

  Day 19: S3 archival
    ☐ Query sessions > 90 days old
    ☐ Export to S3 (gzip JSONL format)
    ☐ Verify lifecycle policy (transition to Glacier IR)

  Day 20: Testing
    ☐ Test with synthetic data (1000 sessions)
    ☐ Verify aggregates match expected values
    ☐ Test archival (mock old sessions)

Success Criteria:
✅ Inventory extracted from all tenant configs
✅ Daily aggregation runs in <5 minutes
✅ Aggregates match source data (100% accuracy)
✅ Sessions archived to S3 after 90 days
```

**Phase 3: Query APIs & GA4 (Refined)**

```
Week 5: Analytics APIs
  Day 21-22: journey_reconstructor.py
    ☐ Endpoint: GET /analytics/journey/{session_id}
    ☐ Query session-events (all steps for session)
    ☐ Return timeline with timestamps
    ☐ Include message content, clicks, form interactions

  Day 23: gap_analyzer.py
    ☐ Endpoint: GET /analytics/gaps/{tenant_id}
    ☐ Load inventory from config
    ☐ Load item-clicks from DynamoDB
    ☐ Compare inventory vs usage
    ☐ Return never-clicked items

  Day 24: Popularity endpoint
    ☐ Endpoint: GET /analytics/popularity/{tenant_id}
    ☐ Query item-clicks table
    ☐ Sort by click count
    ☐ Return top 10 items per type

  Day 25: Forms funnel endpoint
    ☐ Endpoint: GET /analytics/forms/funnel/{tenant_id}
    ☐ Query session-summaries for form events
    ☐ Compute: viewed → started → completed
    ☐ Identify abandonment field (last_field_id)

Week 6: GA4 Integration
  Day 26-27: GA4 OAuth setup
    ☐ Create OAuth client in Google Cloud Console
    ☐ Build OAuth flow in Bubble admin UI
    ☐ Store credentials in Secrets Manager
    ☐ Test token refresh

  Day 28: ga4_integration.py module
    ☐ Implement get_ga4_client()
    ☐ Implement query_ga4_sessions()
    ☐ Add rate limiting (5 req/second)
    ☐ Add error handling (API failures)

  Day 29: Attribution endpoint
    ☐ Endpoint: GET /analytics/attribution/{tenant_id}
    ☐ Fetch GA4 site visitors (by source/medium)
    ☐ Fetch Picasso widget sessions (by utm_source/utm_medium)
    ☐ Correlate datasets (time-based JOIN)
    ☐ Return funnel (visitors → opened → conversations → forms)

  Day 30: Testing
    ☐ Test all endpoints with real data
    ☐ Verify response times (<500ms)
    ☐ Test GA4 API with mock data
    ☐ Load test (100 concurrent requests)

Success Criteria:
✅ All API endpoints functional
✅ Journey reconstruction <500ms
✅ GA4 integration working (with test property)
✅ Attribution funnel shows correct conversion rates
```

**Phase 4: Dashboards (Refined)**

```
Week 7: Dashboard Development
  Day 31-32: Project setup
    ☐ Create React app (Vite + TypeScript)
    ☐ Set up authentication (JWT validation)
    ☐ Create layout components (nav, header, sidebar)
    ☐ Set up routing (react-router)

  Day 33-34: Conversations Dashboard
    ☐ Build conversation depth chart (histogram)
    ☐ Build top questions table
    ☐ Build recent conversations table
    ☐ Build session detail modal (full timeline)

  Day 35-36: Attribution Dashboard
    ☐ Build visitor funnel (Sankey diagram or funnel chart)
    ☐ Build traffic source ROI table
    ☐ Build top converting topics chart
    ☐ Build link analytics table

  Day 37: Forms Dashboard
    ☐ Build conversion funnel (form views → started → completed)
    ☐ Build field bottlenecks chart (bar chart, sorted by abandon rate)
    ☐ Build top performing forms table
    ☐ Build recent submissions table

Week 8: Polish & Deployment
  Day 38: Export functionality
    ☐ CSV export for tables
    ☐ JSON export for raw data
    ☐ PDF export for reports (optional)

  Day 39: Testing
    ☐ Unit tests (Vitest)
    ☐ E2E tests (Playwright)
    ☐ Accessibility audit (WCAG 2.1 AA)
    ☐ Performance audit (Lighthouse)

  Day 40: Deployment
    ☐ Build production bundle
    ☐ Deploy to S3 + CloudFront
    ☐ Configure custom domain (analytics.myrecruiter.ai)
    ☐ Set up Bubble SSO link
    ☐ User acceptance testing with 2-3 pilot tenants

  Day 41-42: Documentation & Handoff
    ☐ User guide (how to use dashboards)
    ☐ Admin guide (GA4 setup, troubleshooting)
    ☐ API documentation (Swagger/OpenAPI)
    ☐ Runbook (incident response)

Success Criteria:
✅ All dashboards functional and accurate
✅ Dashboard loads in <2 seconds
✅ Export functionality works
✅ Pilot tenants approve UI/UX
✅ Zero critical bugs
```

### 6.3 Critical Path Analysis

**Dependencies**:

```
Phase 0 (Foundation)
    │
    ├──> Phase 1 (Event Capture)
    │       │
    │       ├──> Phase 2 (Aggregation) - DEPENDS ON: Event data flowing
    │       │       │
    │       │       └──> Phase 3 (APIs) - DEPENDS ON: Aggregates available
    │       │               │
    │       │               └──> Phase 4 (Dashboards) - DEPENDS ON: APIs working
    │       │
    │       └──> Phase 3 (GA4 Integration) - CAN RUN IN PARALLEL with Phase 2
    │
    └──> BLOCKER: Cannot proceed without DynamoDB tables, SQS queue
```

**Parallelization Opportunities**:

1. **Phase 2 + Phase 3 (GA4) can overlap** - GA4 integration doesn't depend on daily aggregation
2. **Frontend dashboard development can start in Week 6** - Use mock data while APIs are being built
3. **Documentation can be written incrementally** - Technical writer can work alongside developers

**Recommended Schedule Optimization**:

```
Week 0: Foundation (Infrastructure setup)
Week 1-2: Phase 1 (Event Capture)
Week 3-4: Phase 2 (Aggregation) + START Phase 3 (GA4 OAuth setup)
Week 5: Phase 3 (APIs + GA4 integration)
Week 6-7: Phase 4 (Dashboards)
Week 8: Testing, deployment, documentation

Total: 8 weeks (unchanged) but with more parallelization
```

### 6.4 Risk Mitigation

**Identified Risks**:

| Risk | Probability | Impact | Mitigation Strategy |
|------|------------|--------|---------------------|
| **GA4 API quota exceeded** | MEDIUM | HIGH | Implement rate limiting, caching, daily quota monitoring |
| **Event loss during failures** | LOW | HIGH | SQS DLQ, idempotency checks, retry logic |
| **Dashboard performance** | MEDIUM | MEDIUM | Pre-computed aggregates, caching (ElastiCache), pagination |
| **Schema evolution breaks queries** | MEDIUM | HIGH | Schema versioning, backward compatibility tests |
| **Clock skew (client vs server)** | MEDIUM | MEDIUM | Composite sort key (step + timestamp), server timestamp normalization |
| **Session boundary detection fails** | LOW | MEDIUM | Hybrid approach (frontend + backend timeout), synthetic events |
| **DynamoDB cost overrun** | LOW | MEDIUM | On-demand billing with alarms, TTL for automatic deletion |
| **Bubble SSO token expired** | LOW | LOW | Token refresh logic, graceful error handling |

**Phase-Specific Risks**:

**Phase 1**:
- **Risk**: Frontend event emission adds latency
- **Mitigation**: Batch events (send every 5 seconds), use `navigator.sendBeacon()` for critical events

**Phase 2**:
- **Risk**: Aggregator timeout (Lambda 15-minute max)
- **Mitigation**: Process tenants in parallel, checkpoint progress, resume on failure

**Phase 3**:
- **Risk**: GA4 OAuth flow confusing for users
- **Mitigation**: Step-by-step wizard in Bubble, video tutorial, support documentation

**Phase 4**:
- **Risk**: Dashboard UI doesn't match mockups
- **Mitigation**: Weekly design reviews, clickable prototypes in Week 5, early feedback from pilot tenants

---

## 7. Recommendations & Action Items

### 7.1 Architecture Improvements

**IMMEDIATE (Before Phase 1)**:

1. **Add Event Schema Versioning**:
```json
{
  "schema_version": "1.0",
  "event_id": "evt_...",
  // ... rest of event
}
```

2. **Add DynamoDB Deduplication Table**:
```
Table: picasso-event-dedup
PK: event_id (string)
Attributes: processed_at, ttl
TTL: 24 hours
```

3. **Add Client-Side Sequence Numbers**:
```javascript
let sequenceNumber = 0;
function emitEvent(eventType, payload) {
  sequenceNumber++;
  sendEvent({
    sequence_number: sequenceNumber,
    step_number: currentStep,
    // ... rest of event
  });
}
```

**SHORT-TERM (Phase 1-2)**:

4. **Implement Session Timeout Strategy**:
   - Frontend: Send `WIDGET_CLOSED` on `beforeunload` (best-effort)
   - Backend: Hourly job to close sessions inactive > 30 minutes
   - Both: Generate session summary

5. **Add EventBridge Scheduling** (instead of cron):
```yaml
EventBridgeRule:
  Name: DailyAggregation
  ScheduleExpression: cron(0 0 * * ? *)
  Target: Aggregator_Function
  DeadLetterConfig:
    Arn: arn:aws:sqs:us-east-1:123456789:aggregator-dlq
```

6. **Extend Bedrock Handler to Write DynamoDB**:
   - Add DynamoDB client
   - Write QA_COMPLETE event to session-events table
   - Keep CloudWatch logging for legacy compatibility

**MEDIUM-TERM (Phase 3-4)**:

7. **Create GA4 Integration Specification Document**:
   - OAuth setup wizard (step-by-step)
   - API rate limiting strategy
   - Data freshness disclaimer
   - Correlation methodology
   - Error handling (API failures, expired credentials)

8. **Add Query Optimization**:
   - ElastiCache (Redis) for hot data (optional, when latency > 500ms)
   - DynamoDB Global Secondary Indexes for complex queries
   - Pagination for large result sets (>100 items)

9. **Implement Export Functionality**:
   - CSV export (Excel-compatible)
   - JSON export (API integration)
   - PDF reports (optional)

### 7.2 Documentation Requirements

**REQUIRED (Before Implementation)**:

1. **Event Schema Reference**:
   - All event types with payload examples
   - Validation rules (JSON Schema files)
   - Versioning policy

2. **API Documentation**:
   - OpenAPI/Swagger spec
   - Request/response examples
   - Error codes and handling
   - Rate limits

3. **GA4 Integration Guide**:
   - OAuth setup wizard (screenshots)
   - Troubleshooting common issues
   - Data correlation methodology
   - Privacy considerations

4. **Runbook**:
   - Incident response procedures
   - Common issues and fixes
   - Monitoring and alerting setup
   - Escalation paths

### 7.3 Testing Strategy

**Unit Tests** (90%+ coverage):
- Frontend: Jest + React Testing Library
- Backend: pytest (Python), Jest (Node.js)
- Focus: Event emission, schema validation, aggregation logic

**Integration Tests**:
- End-to-end event flow (widget → API → DynamoDB)
- Session summary generation
- Daily aggregation (with synthetic data)
- API endpoint responses

**Load Tests**:
- 100 events/second sustained (Phase 1)
- 1,000 concurrent dashboard users (Phase 4)
- DynamoDB auto-scaling behavior
- Lambda cold start mitigation

**User Acceptance Tests**:
- Pilot with 2-3 friendly tenants (Week 8)
- Dashboard usability testing
- Export functionality validation
- GA4 integration verification

### 7.4 Monitoring & Alerting

**CloudWatch Dashboards**:
- Event ingestion rate (events/second)
- DynamoDB write/read capacity usage
- Lambda error rate, duration, throttles
- SQS queue depth (should be ~0, spikes indicate backlog)
- API endpoint latency (p50, p95, p99)

**CloudWatch Alarms**:
- Lambda error rate > 5% (CRITICAL)
- DynamoDB consumed capacity > 80% (WARNING)
- SQS DLQ depth > 0 (CRITICAL - investigate immediately)
- API endpoint latency p95 > 1000ms (WARNING)
- GA4 API quota exceeded (WARNING)

**X-Ray Tracing**:
- Enable for all Lambda functions
- Trace event flow from API Gateway → SQS → Lambda → DynamoDB
- Identify latency bottlenecks

---

## 8. Conclusion

### 8.1 Final Verdict

✅ **APPROVED FOR IMPLEMENTATION**

The User Journey Analytics Plan is architecturally sound, business-aligned, and technically feasible. The proposed design demonstrates:

1. **Strong separation of concerns** - Clear boundaries between data collection, ingestion, storage, aggregation, and presentation
2. **Appropriate technology choices** - DynamoDB for hot data, S3 for archival, SQS for durability, Lambda for serverless processing
3. **Scalability** - Will handle 500 tenants (3.75M events/day) without architectural changes
4. **Cost-effectiveness** - $1.98/month per tenant at scale (2% of revenue if charging $100/month)
5. **Realistic timeline** - 8 weeks is achievable with recommended refinements

### 8.2 Critical Success Factors

**Must-Haves** (Non-Negotiable):
1. Event durability (SQS buffering, idempotency)
2. Session boundary detection (hybrid frontend + backend)
3. Tenant isolation (strict filtering on tenant_hash)
4. GA4 integration (required for attribution funnel)
5. Forms Dashboard (mandatory for clients post-Lex migration)

**Should-Haves** (Highly Recommended):
1. Schema versioning (future-proofing)
2. ElastiCache for query optimization (when needed)
3. EventBridge scheduling (better than cron)
4. Export functionality (CSV, JSON)
5. Comprehensive monitoring and alerting

**Nice-to-Haves** (Optional Enhancements):
1. Real-time dashboard updates (WebSocket/SSE)
2. PDF report generation
3. Anomaly detection (ML-based)
4. Custom date range queries (beyond pre-computed daily)
5. Tenant-specific branding in analytics app

### 8.3 Risk Level Assessment

**Overall Risk**: 🟢 **LOW**

| Category | Risk Level | Justification |
|----------|-----------|---------------|
| **Technical Complexity** | 🟢 LOW | Uses proven AWS services, no custom infrastructure |
| **Integration Complexity** | 🟡 MEDIUM | GA4 OAuth requires careful implementation |
| **Scalability Risk** | 🟢 LOW | Architecture scales to 500+ tenants without changes |
| **Cost Risk** | 🟢 LOW | Predictable costs, excellent margin (2% of revenue) |
| **Timeline Risk** | 🟡 MEDIUM | 8 weeks is tight but achievable with Phase 0 foundation |
| **User Adoption Risk** | 🟢 LOW | Addresses validated business need (ROI visibility) |

### 8.4 Next Steps

**Immediate (This Week)**:
1. ✅ **Approve architecture** - Review and sign off on this document
2. ☐ **Create Phase 0 tasks** - Set up DynamoDB tables, SQS queue, skeleton Lambda
3. ☐ **Assign team roles** - Frontend dev, backend dev, DevOps, technical writer
4. ☐ **Schedule kickoff meeting** - Align team on timeline and responsibilities

**Week 0 (Foundation)**:
1. ☐ Deploy infrastructure (DynamoDB, SQS, Lambda skeleton)
2. ☐ Create event schema files (JSON Schema)
3. ☐ Set up CloudWatch dashboards and alarms
4. ☐ Create test event generator for load testing

**Week 1 (Phase 1 Start)**:
1. ☐ Extend `notifyParentEvent()` with step tracking
2. ☐ Add attribution capture to `widget-host.js`
3. ☐ Implement component-level event tracking (CTAButton, FormFieldPrompt, etc.)
4. ☐ Deploy Event Processor Lambda with schema validation

**Ongoing**:
1. ☐ Weekly progress reviews (every Friday)
2. ☐ Daily standups (15 minutes)
3. ☐ Increment documentation as features are completed
4. ☐ Prepare pilot tenant list (Week 6)

### 8.5 Questions for Stakeholders

Before proceeding with implementation:

1. **GA4 Integration Timing**: Should GA4 integration be in Phase 3 (Week 5-6) or can it be deferred to Phase 5 (post-MVP)?
2. **Dashboard Branding**: Should the analytics app use MyRecruiter branding or tenant-specific branding?
3. **Export Formats**: Are CSV and JSON sufficient, or is PDF required for MVP?
4. **Real-Time Updates**: Is real-time dashboard updating required (WebSocket/SSE) or is 5-minute refresh acceptable?
5. **Pilot Tenants**: Which 2-3 tenants should be selected for UAT in Week 8?

---

**Document Prepared By**: System Architect
**Review Date**: December 18, 2025
**Approval Status**: ✅ RECOMMENDED FOR APPROVAL
**Next Review Date**: Post-Phase 1 (Week 2)

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Session** | A single user interaction with the Picasso widget, bounded by widget open and close (or 30-minute inactivity timeout) |
| **Step** | A logical interaction within a session (e.g., message sent, CTA clicked, form submitted) |
| **Event** | An atomic action captured by the system (e.g., CTA_CLICKED, FORM_STARTED) |
| **Attribution** | UTM parameters and referrer data captured at session start to track traffic source |
| **Inventory** | The set of clickable items defined in tenant config (action chips, CTAs, links) |
| **Usage** | The actual clicks on inventory items by users |
| **Gap Analysis** | Comparison of inventory vs usage to identify never-clicked items |
| **Session Summary** | Aggregated metrics for a single session (duration, message count, outcome) |
| **Daily Aggregate** | Pre-computed metrics for all sessions on a given date (for fast historical queries) |

## Appendix B: Reference Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER BROWSER                                │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Picasso Widget (React App in Iframe)                            │   │
│  │  ├─ Event Emitters (CTAButton, FormFieldPrompt, etc.)           │   │
│  │  ├─ Step Counter (local state)                                   │   │
│  │  └─ notifyParentEvent() → postMessage                            │   │
│  └───────────────────────────┬──────────────────────────────────────┘   │
│                              │                                           │
│  ┌───────────────────────────▼──────────────────────────────────────┐   │
│  │  widget-host.js (Parent Page)                                    │   │
│  │  ├─ Attribution Capture (UTM params, referrer)                   │   │
│  │  ├─ Event Batching (5 seconds OR 10 events)                      │   │
│  │  └─ API Call: POST /events                                       │   │
│  └───────────────────────────┬──────────────────────────────────────┘   │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                           AWS CLOUD                                       │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  API Gateway                                                      │   │
│  │  └─ POST /events (batch endpoint)                                │   │
│  └───────────────────────────┬──────────────────────────────────────┘   │
│                              │                                           │
│  ┌───────────────────────────▼──────────────────────────────────────┐   │
│  │  SQS Queue: picasso-analytics-events                             │   │
│  │  ├─ Visibility Timeout: 120 seconds                              │   │
│  │  ├─ DLQ: picasso-analytics-events-dlq (3 retries)                │   │
│  │  └─ Retention: 14 days                                            │   │
│  └───────────────────────────┬──────────────────────────────────────┘   │
│                              │                                           │
│  ┌───────────────────────────▼──────────────────────────────────────┐   │
│  │  Lambda: Event Processor (Python 3.13)                           │   │
│  │  ├─ Validate schema (Zod)                                        │   │
│  │  ├─ Check idempotency (DynamoDB dedup table)                     │   │
│  │  ├─ Enrich timestamp_server                                      │   │
│  │  ├─ Write to session-events table                                │   │
│  │  └─ If WIDGET_CLOSED: Generate session summary                   │   │
│  └───────────────────────────┬──────────────────────────────────────┘   │
│                              │                                           │
│         ┌────────────────────┼────────────────────┐                     │
│         │                    │                    │                     │
│  ┌──────▼────────┐  ┌────────▼─────────┐  ┌──────▼──────────┐         │
│  │  DynamoDB     │  │  DynamoDB        │  │  DynamoDB       │         │
│  │  session-     │  │  session-        │  │  item-clicks    │         │
│  │  events       │  │  summaries       │  │                 │         │
│  │  (7-day TTL)  │  │  (90-day TTL)    │  │  (90-day TTL)   │         │
│  └───────────────┘  └──────────────────┘  └─────────────────┘         │
│                              │                                           │
│  ┌───────────────────────────▼──────────────────────────────────────┐   │
│  │  EventBridge Rule: Daily Aggregation (0 0 * * ? *)              │   │
│  └───────────────────────────┬──────────────────────────────────────┘   │
│                              │                                           │
│  ┌───────────────────────────▼──────────────────────────────────────┐   │
│  │  Lambda: Aggregator_Function (Python 3.13)                       │   │
│  │  ├─ Query session-summaries (yesterday)                          │   │
│  │  ├─ Compute daily aggregates                                     │   │
│  │  ├─ Write to analytics-daily table                               │   │
│  │  └─ Archive sessions > 90 days to S3                             │   │
│  └───────────────────────────┬──────────────────────────────────────┘   │
│                              │                                           │
│         ┌────────────────────┼────────────────────┐                     │
│         │                    │                    │                     │
│  ┌──────▼────────┐  ┌────────▼─────────┐                               │
│  │  DynamoDB     │  │  S3 Glacier IR   │                               │
│  │  analytics-   │  │  picasso-        │                               │
│  │  daily        │  │  analytics-      │                               │
│  │  (90-day TTL) │  │  archive         │                               │
│  └───────────────┘  │  (365-day TTL)   │                               │
│                     └──────────────────┘                               │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Lambda: Analytics_Function (Python 3.13)                        │   │
│  │  ├─ GET /analytics/journey/{session_id}                          │   │
│  │  ├─ GET /analytics/popularity/{tenant_id}                        │   │
│  │  ├─ GET /analytics/gaps/{tenant_id}                              │   │
│  │  ├─ GET /analytics/forms/funnel/{tenant_id}                      │   │
│  │  └─ GET /analytics/attribution/{tenant_id}                       │   │
│  └───────────────────────────┬──────────────────────────────────────┘   │
│                              │                                           │
│  ┌───────────────────────────▼──────────────────────────────────────┐   │
│  │  Lambda: GA4 Integration (Python 3.13)                           │   │
│  │  ├─ OAuth with GA4 (credentials in Secrets Manager)              │   │
│  │  ├─ Query GA4 Data API (site visitors by source/medium)          │   │
│  │  └─ Return data for attribution funnel                           │   │
│  └───────────────────────────┬──────────────────────────────────────┘   │
│                              │                                           │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    ANALYTICS DASHBOARD (React App)                       │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Authentication: Bubble SSO (JWT)                                │   │
│  │  ├─ Conversations Dashboard (enhanced)                           │   │
│  │  ├─ Attribution Dashboard (new)                                  │   │
│  │  └─ Forms Dashboard (new)                                        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

**END OF DOCUMENT**
