# ANNEX C: Forms Dashboard - Build Specification

**Parent Document:** [USER_JOURNEY_ANALYTICS_PRD.md](USER_JOURNEY_ANALYTICS_PRD.md)
**Technical Reference:** [USER_JOURNEY_ANALYTICS_PLAN.md](USER_JOURNEY_ANALYTICS_PLAN.md)
**Version:** 1.0
**Date:** 2025-12-18
**Priority:** MVP CRITICAL (Weeks 5-6)

---

## Related Sections in Technical Plan

For implementation details, refer to these sections in `USER_JOURNEY_ANALYTICS_PLAN.md`:

| Topic | Section |
|-------|---------|
| Technology Stack | "Technology Stack" - React libraries, hosting |
| Event Schemas | "Complete Event Schema" - Form event payloads |
| DynamoDB Tables | "Data Storage" - Table schemas, GSIs, TTLs |
| API Endpoints | "API Endpoints" - Analytics Lambda routes |
| Multi-Tenant Security | "Decision #9" - JWT authorizer, tenant_id injection |
| Phased Implementation | "Phased Implementation" - Week-by-week tasks |

---

## Visual Specification

**Mockup:** [forms-dashboard.webp](forms-dashboard.webp)

![Forms Dashboard Mockup](forms-dashboard.webp)

The mockup is the visual source of truth. This document specifies the logic, data, and behavior behind each component shown in the mockup.

---

## Problem Statement

After migrating from Amazon Lex to Picasso native conversational forms, clients have zero visibility into form performance. They cannot see completion rates, identify abandonment points, or access submission data. This must be exposed immediately post-migration.

**User Need:** "Show me which form fields cause users to abandon, and tell me how to fix it."

---

## Feature Specifications

### 1. KPI Cards (Top Row)

Four cards showing key form metrics with 7-day trend comparison.

**Metrics:**

| KPI | Calculation | Example Display |
|-----|-------------|-----------------|
| Form Views | `COUNT(FORM_VIEWED)` | "1,240" with "+12.5%" trend arrow |
| Completions | `COUNT(FORM_COMPLETED)` | "521" with "+8.2%" trend arrow |
| Avg Completion Time | `AVG(duration_seconds)` from completed forms | "2m 45s" with "-5.1%" trend arrow |
| Abandon Rate | `((Started - Completed) / Started) * 100` | "57.9%" with "-3.2%" trend arrow |

**Trend Calculation:**
```javascript
// Compare current period vs previous equal period
current_period = last_7_days
previous_period = days_8_to_14
trend_percentage = ((current - previous) / previous) * 100

// Display logic
if (trend_percentage > 0) show_green_up_arrow
if (trend_percentage < 0) show_red_down_arrow
if (Math.abs(trend_percentage) < 1) show_neutral_dash
```

**API Endpoint:**
```
GET /api/forms/summary?tenant_id={tenant_id}&date_range={7d|30d|90d}
```

**Response:**
```json
{
  "form_views": {
    "current": 1240,
    "previous": 1105,
    "trend_percentage": 12.5
  },
  "completions": {
    "current": 521,
    "previous": 481,
    "trend_percentage": 8.2
  },
  "avg_completion_time_seconds": {
    "current": 165,
    "previous": 174,
    "trend_percentage": -5.1
  },
  "abandon_rate": {
    "current": 57.9,
    "previous": 59.8,
    "trend_percentage": -3.2
  }
}
```

**Acceptance Criteria:**
- KPI cards display current value with correct trend arrow direction
- Trend percentage calculated correctly (current vs previous period)
- Green up arrow for improvements (more completions, faster time, lower abandon rate)
- Red down arrow for regressions
- Clicking card filters dashboard to that metric's details

---

### 2. Conversion Funnel

Horizontal bar chart showing progression: Form Views → Started → Completed with dropoff percentages.

**Metrics:**

| Stage | Calculation | Display |
|-------|-------------|---------|
| Form Views | `COUNT(FORM_VIEWED)` | "1,240 (100%)" |
| Form Started | `COUNT(FORM_STARTED)` | "843 (68%)" with "-32% dropoff" |
| Form Completed | `COUNT(FORM_COMPLETED)` | "521 (42%)" with "-38% dropoff" |

**Dropoff Calculation:**
```javascript
// Stage to next stage dropoff
dropoff_percentage = ((current_stage - next_stage) / current_stage) * 100

// Example: Views to Started
views = 1240
started = 843
dropoff = ((1240 - 843) / 1240) * 100 = 32.0%
```

**Conversion Rate:**
```javascript
conversion_rate = (completed / started) * 100
// Example: (521 / 843) * 100 = 61.8%

// Display as primary metric
"42% Conversion Rate (Started → Completed)"
```

**API Endpoint:**
```
GET /api/forms/funnel?tenant_id={tenant_id}&date_range={7d|30d|90d}&form_id={optional}
```

**Response:**
```json
{
  "funnel": [
    {
      "stage": "viewed",
      "count": 1240,
      "percentage": 100.0,
      "dropoff_to_next": 32.0
    },
    {
      "stage": "started",
      "count": 843,
      "percentage": 68.0,
      "dropoff_to_next": 38.2
    },
    {
      "stage": "completed",
      "count": 521,
      "percentage": 42.0,
      "dropoff_to_next": null
    }
  ],
  "conversion_rate": 61.8,
  "abandon_rate": 38.2
}
```

**Visual Reference:** Horizontal bar chart with bars sized proportionally, labels showing count and percentage, dropoff text between stages.

**Acceptance Criteria:**
- Funnel displays three stages with correct counts and percentages
- Dropoff percentages calculated correctly between consecutive stages
- Conversion rate prominently displayed
- Bars sized proportionally to counts
- Optional form_id filter applies to all metrics

---

### 3. Field Bottlenecks (Critical Insight)

Horizontal bar chart showing form fields with highest abandonment counts, sorted descending.

**Data Source:** `FORM_ABANDONED` event with `last_field_id` and `last_field_label`

**Metrics:**

| Field | Calculation | Display |
|-------|-------------|---------|
| Abandon Count | `COUNT(FORM_ABANDONED WHERE last_field_id = X)` | "162 abandonments" |
| Abandon % | `(field_abandon_count / total_abandonments) * 100` | "38% of all abandonments" |

**Aggregation Query (DynamoDB):**
```python
# Query all FORM_ABANDONED events for tenant in date range
events = query_dynamodb(
    table='picasso-session-events',
    index='tenant-date-index',
    pk=f'TENANT#{tenant_id}',
    filter='event_type = FORM_ABANDONED'
)

# Count by last_field_id
bottlenecks = {}
for event in events:
    field_id = event['metadata']['last_field_id']
    field_label = event['metadata']['last_field_label']
    bottlenecks[field_id] = {
        'count': bottlenecks.get(field_id, {}).get('count', 0) + 1,
        'label': field_label
    }

# Sort by count descending, take top 5
top_5 = sorted(bottlenecks.items(), key=lambda x: x[1]['count'], reverse=True)[:5]
```

**Insight Generation:**

```javascript
// Rule-based insights based on field characteristics
function generateInsight(field_id, field_label, field_type) {
  // Pattern matching for common abandonment reasons
  if (field_label.match(/background check|consent|agree/i)) {
    return {
      insight: "Trust and privacy concerns may cause hesitation.",
      recommendation: "Add a trust badge or explanatory text: 'Background checks help us ensure child safety and are required by state law.'"
    }
  }

  if (field_type === 'tel') {
    return {
      insight: "Phone number requests often trigger privacy concerns.",
      recommendation: "Add reassuring text: 'We'll only call to schedule your orientation.'"
    }
  }

  if (field_type === 'email') {
    return {
      insight: "Email requests may cause spam anxiety.",
      recommendation: "Add text: 'We'll never share your email or send spam.'"
    }
  }

  if (field_type === 'address') {
    return {
      insight: "Address fields are perceived as high-friction.",
      recommendation: "Consider deferring to a follow-up form after initial contact."
    }
  }

  // Default insight
  return {
    insight: "This field has high abandonment.",
    recommendation: "Review field placement, wording, and necessity."
  }
}
```

**API Endpoint:**
```
GET /api/forms/bottlenecks?tenant_id={tenant_id}&date_range={7d|30d|90d}&form_id={optional}&limit=5
```

**Response:**
```json
{
  "bottlenecks": [
    {
      "field_id": "background_check_consent",
      "field_label": "Background Check Consent",
      "field_type": "checkbox",
      "abandon_count": 162,
      "abandon_percentage": 38.2,
      "insight": "Trust and privacy concerns may cause hesitation.",
      "recommendation": "Add a trust badge or explanatory text: 'Background checks help us ensure child safety and are required by state law.'"
    },
    {
      "field_id": "phone_number",
      "field_label": "Phone Number",
      "field_type": "tel",
      "abandon_count": 102,
      "abandon_percentage": 24.1,
      "insight": "Phone number requests often trigger privacy concerns.",
      "recommendation": "Add reassuring text: 'We'll only call to schedule your orientation.'"
    },
    {
      "field_id": "availability",
      "field_label": "Availability",
      "field_type": "textarea",
      "abandon_count": 64,
      "abandon_percentage": 15.1,
      "insight": "This field has high abandonment.",
      "recommendation": "Review field placement, wording, and necessity."
    }
  ],
  "total_abandonments": 424
}
```

**Visual Reference:** Horizontal bar chart with bars sized by abandon_count, labels showing field name and percentage. Insight callout box below chart with icon and recommendation text.

**Acceptance Criteria:**
- Chart displays top 5 fields by abandon count, sorted descending
- Abandon percentage calculated correctly (field_count / total_abandonments * 100)
- Insight callout auto-generates based on field characteristics
- Recommendation text is actionable and specific
- At least 2 insights generate automatically per tenant (if data available)
- Clicking bar shows detailed breakdown for that field

---

### 4. Top Performing Forms

Card grid showing forms ranked by conversion rate.

**Metrics:**

| Metric | Calculation | Display |
|--------|-------------|---------|
| Conversion Rate | `(completed / started) * 100` | "68% Conversion Rate" |
| Completions | `COUNT(FORM_COMPLETED WHERE form_id = X)` | "142 completions" |
| Avg Time | `AVG(duration_seconds WHERE form_id = X)` | "1m 12s avg time" |

**Sorting:** Default sort by conversion_rate descending. User can change sort to completions or avg_time.

**API Endpoint:**
```
GET /api/forms/top-performers?tenant_id={tenant_id}&date_range={7d|30d|90d}&limit=5&sort_by={conversion_rate|completions|avg_time}
```

**Response:**
```json
{
  "forms": [
    {
      "form_id": "donation_form",
      "form_label": "Donation Form",
      "views": 209,
      "started": 209,
      "completions": 142,
      "conversion_rate": 67.9,
      "avg_completion_time_seconds": 72,
      "abandon_rate": 32.1
    },
    {
      "form_id": "volunteer_application",
      "form_label": "Volunteer Application",
      "views": 1240,
      "started": 843,
      "completions": 521,
      "conversion_rate": 61.8,
      "avg_completion_time_seconds": 165,
      "abandon_rate": 38.2
    }
  ]
}
```

**Visual Reference:** Card grid (2-3 columns) with form name as header, large conversion rate number, secondary stats below.

**Acceptance Criteria:**
- Forms sorted by conversion rate descending by default
- User can change sort order (conversion rate, completions, avg time)
- Each card shows form name, conversion rate, completions, avg time
- Clicking card filters entire dashboard to that form
- "View All" button shows full list if more than 5 forms

---

### 5. Recent Submissions Table

Searchable, sortable, paginated table of form submissions.

**Columns:**
- Name (First + Last)
- Email
- Phone
- Form Type
- Submitted Date
- Actions (View, Export)

**Features:**
- Search by name, email, or form type (debounced 300ms)
- Sort by any column (click header)
- Pagination (25 per page)
- Row expansion for full submission details
- CSV export for selected date range

**API Endpoint:**
```
GET /api/forms/submissions?tenant_id={tenant_id}&date_range={7d|30d|90d}&search={query}&page={1}&limit={25}&sort_by={submitted_at}&sort_order={desc}
```

**Response:**
```json
{
  "submissions": [
    {
      "submission_id": "sub_abc123",
      "form_id": "volunteer_application",
      "form_label": "Volunteer Application",
      "submitted_at": "2025-12-18T14:32:15Z",
      "fields": {
        "first_name": "Sarah",
        "last_name": "Johnson",
        "email": "sarah.j@example.com",
        "phone": "(512) 555-0123",
        "comments": "I've worked with kids for 5 years and would love to help with tutoring programs."
      },
      "session_id": "sess_xyz789",
      "duration_seconds": 187
    }
  ],
  "pagination": {
    "total_count": 521,
    "page": 1,
    "limit": 25,
    "total_pages": 21,
    "has_next_page": true,
    "has_previous_page": false
  }
}
```

**Export Endpoint:**
```
GET /api/forms/submissions/export?tenant_id={tenant_id}&date_range={7d|30d|90d}&format=csv
```

Returns CSV file with headers:
```
Submission ID,Form Type,First Name,Last Name,Email,Phone,Comments,Submitted Date,Duration (seconds)
```

**Acceptance Criteria:**
- Table displays 25 submissions per page with pagination controls
- Search filters results by name, email, or form type (case-insensitive)
- Clicking column header toggles sort order (asc/desc)
- Clicking row expands to show all submitted fields
- CSV export downloads all submissions for date range (not just current page)
- Export completes in <10s for up to 1000 submissions
- Loading states shown during search and pagination

---

## Data Requirements

### Events to Capture

**Frontend events (emitted by Picasso widget):**

```javascript
// Form viewed (user sees form start)
{
  type: 'FORM_VIEWED',
  payload: {
    form_id: 'volunteer_application',
    form_label: 'Volunteer Application',
    trigger_source: 'cta_button' // or 'action_chip', 'ai_suggested'
  }
}

// Form started (user submits first field)
{
  type: 'FORM_STARTED',
  payload: {
    form_id: 'volunteer_application',
    field_count: 8,
    start_time: '2025-12-18T14:30:00Z'
  }
}

// Form completed (user submits final field)
{
  type: 'FORM_COMPLETED',
  payload: {
    form_id: 'volunteer_application',
    duration_seconds: 187,
    fields_completed: 8
  }
}

// Form abandoned (user closes widget or navigates away)
{
  type: 'FORM_ABANDONED',
  payload: {
    form_id: 'volunteer_application',
    last_field_id: 'background_check_consent',
    last_field_label: 'Background Check Consent',
    last_field_index: 4,
    last_field_type: 'checkbox',
    fields_completed: 3,
    total_fields: 8,
    duration_seconds: 45,
    reason: 'widget_closed' // or 'timeout', 'navigated'
  }
}
```

### DynamoDB Schema

**Table:** `picasso-session-events`

```
PK: SESSION#{session_id}
SK: STEP#{step_number}#{timestamp_ms}

Attributes:
- tenant_hash: string
- event_type: string (FORM_VIEWED | FORM_STARTED | FORM_COMPLETED | FORM_ABANDONED)
- timestamp: string (ISO 8601)
- metadata: map {
    form_id: string,
    form_label: string,
    last_field_id: string (for FORM_ABANDONED),
    last_field_label: string (for FORM_ABANDONED),
    last_field_type: string (for FORM_ABANDONED),
    duration_seconds: number,
    fields_completed: number,
    trigger_source: string
  }

TTL: 90 days

GSI: tenant-date-index
  PK: tenant_hash
  SK: timestamp
```

**Table:** `picasso-form-submissions`

```
PK: TENANT#{tenant_hash}
SK: SUBMISSION#{submission_id}

Attributes:
- form_id: string
- form_label: string
- submitted_at: string (ISO 8601)
- session_id: string
- duration_seconds: number
- fields: map {
    first_name: string,
    last_name: string,
    email: string,
    phone: string,
    ...custom fields
  }

TTL: 90 days

GSI: submitted-date-index
  PK: tenant_hash
  SK: submitted_at
```

---

## Error States & Edge Cases

### Error States

| Scenario | User Message | Technical Behavior |
|----------|-------------|-------------------|
| API timeout (>10s) | "Data is taking longer than expected. Please try a shorter date range." | Retry with exponential backoff, max 3 attempts |
| DynamoDB throttling | "High traffic detected. Retrying..." | Use on-demand billing burst capacity, exponential backoff |
| Invalid JWT | "Session expired. Please log in again." | Redirect to Bubble login page |
| Tenant not found | "Account not configured. Contact support." | Log error to CloudWatch, display support email |
| Export >10k rows | "Export too large. Please select a shorter date range or contact support." | Suggest 30-day max for self-service export |
| Network error | "Connection lost. Please check your internet and try again." | Show retry button, cache last successful data |

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No form submissions in date range | Show empty state: "No form submissions yet. Expand date range or check back later." |
| Form started but zero fields completed | Count as "abandoned at first field" in bottleneck analysis |
| Form completed in <5 seconds | Flag as potential bot/test, exclude from metrics (configurable threshold) |
| User abandons, returns later, completes | Two separate sessions: 1 abandonment + 1 completion (different session_ids) |
| Multiple abandonments at same field | Aggregate count, show as top bottleneck with combined percentage |
| Form config changed mid-period | Use field_label from event metadata (snapshot at event time), note if field no longer exists |
| Tenant has zero forms configured | Show empty state: "No forms configured. Visit Config Builder to create your first form." |
| Date range >90 days | Query S3/Athena instead of DynamoDB, show loading message "Querying historical data..." |
| User searches with special characters | Sanitize input, escape for DynamoDB query, prevent injection |

---

## API Security

**Authentication:** API Gateway Lambda Authorizer validates JWT from Bubble.

**Authorization Flow:**

```python
# Lambda Authorizer extracts tenant_id from JWT
def lambda_handler(event, context):
    token = event['authorizationToken'].replace('Bearer ', '')

    # Validate JWT signature
    claims = jwt.decode(token, BUBBLE_JWT_SECRET, algorithms=['HS256'])

    tenant_id = claims['tenant_id']  # Extracted from JWT
    user_role = claims.get('role', 'viewer')

    return {
        'principalId': claims['user_id'],
        'policyDocument': generate_allow_policy(event['methodArn']),
        'context': {
            'tenant_id': tenant_id,  # Injected into downstream Lambda
            'user_role': user_role
        }
    }
```

**Query Enforcement:**

```python
# Analytics API Lambda FORCES tenant_id from authorizer
def get_forms_summary(event, context):
    # Extract from authorizer context - NOT from query params
    tenant_id = event['requestContext']['authorizer']['tenant_id']

    # User cannot override tenant_id even if they try ?tenant_id=OTHER_TENANT

    response = dynamodb.query(
        TableName='picasso-session-events',
        IndexName='tenant-date-index',
        KeyConditionExpression='tenant_hash = :tenant',
        ExpressionAttributeValues={
            ':tenant': tenant_id  # FORCED from JWT
        }
    )

    return format_response(response)
```

**Critical:** Never trust tenant_id from query params or request body. Always use authorizer context.

---

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Dashboard load time | <2s | Chrome DevTools Performance tab, 3G throttle |
| API latency (p90) | <500ms | CloudWatch metrics on Analytics Lambda |
| API latency (p99) | <1s | CloudWatch metrics |
| Export (1000 rows) | <10s | End-to-end timing from click to download |
| Search debounce | 300ms | User stops typing → query fires |
| Data freshness | <5 minutes | Event emission → visible in dashboard |

**Optimization Strategies:**
- DynamoDB on-demand billing for burst capacity
- React Query caching (5-minute stale time for aggregates)
- Lazy loading for table rows (virtualization if >100 rows)
- CloudFront caching for static assets
- Athena query results cached in S3

---

## Testing Requirements

### Unit Tests (Vitest)

- KPICard calculates trend percentage correctly
- Conversion funnel calculates dropoff percentages correctly
- Field bottlenecks sort by abandon_count descending
- Insight generation produces correct recommendations based on field_type
- CSV export formats data correctly with proper headers

### Integration Tests (Playwright)

- User logs in via Bubble JWT, redirected to dashboard
- User selects 30-day date range, dashboard updates with correct data
- User searches submissions table by email, results filter correctly
- User exports CSV, file downloads with expected columns
- User with invalid JWT redirected to login
- User cannot access other tenant's data (inject tenant_id in URL, verify blocked)

### Load Tests

- 100 concurrent users querying dashboard, API maintains <500ms p90
- Export 1000 submissions completes in <10s
- DynamoDB queries under load do not throttle (on-demand scales)

---

## Success Metrics

| Metric | Target | Timeline |
|--------|--------|----------|
| Dashboard engagement | 60%+ tenants check weekly | 30 days post-launch |
| Insight actionability | 50%+ tenants act on ≥1 recommendation | Survey 60 days post-launch |
| Time to insight | <3 minutes from login to "aha moment" | User session analytics |
| Export usage | 40%+ tenants export monthly | Track export endpoint calls |
| Zero critical bugs | 3 pilot tenants, 2-week usage | Bug tracker count |

---

## Dependencies

1. **Phase 1 complete:** Event capture system deployed, events flowing to DynamoDB
2. **Phase 2 complete:** Analytics API deployed with JWT authorizer and forced tenant_id injection
3. **DynamoDB tables provisioned:** `picasso-session-events`, `picasso-form-submissions`
4. **Bubble JWT integration:** SSO flow tested and working
5. **React app scaffold:** Routing, authentication, base layout ready

---

## Timeline

| Week | Deliverable |
|------|-------------|
| Week 5 | React components built (KPICard, Funnel, Bottlenecks, Table), API integration complete |
| Week 6 | Dashboard assembled, CSV export functional, pilot testing with 3 tenants, bug fixes |

---

**Build Status:** ✅ COMPLETE (2025-12-25)

## Implementation Summary

The Forms Dashboard has been fully implemented and deployed. Key accomplishments:

### Frontend Components (picasso-analytics-dashboard)
- **StatCard** - KPI cards with trend indicators
- **Funnel** - Shared conversion funnel component (reusable across dashboards)
- **FieldBottlenecks** - Drop-off analysis with empty state UI
- **RankedCards** - Top performing forms with conversion rates
- **DataTable** - Paginated submissions table with search
- **PageHeader** - Time range selector, filters, export button

### API Endpoints (Analytics_Dashboard_API Lambda)
- `GET /forms/summary` - Form views, starts, completions, abandons, rates
- `GET /forms/bottlenecks` - Field-level abandonment with insights
- `GET /forms/submissions` - Paginated submission data from DynamoDB
- `GET /forms/top-performers` - Forms ranked by conversion rate

### Event Tracking Fixes (Picasso FormModeContext)
- Fixed FORM_ABANDONED to only fire when FORM_STARTED was emitted
- Fixed formStartedEmittedRef reset after FORM_COMPLETED
- Ensures accurate funnel math: Starts = Completions + Abandons

### Deployment
- Dashboard: `/picasso-analytics-dashboard/` (React + Vite + TypeScript)
- Lambda: `Analytics_Dashboard_API` (Python, Athena queries)
- Widget: Picasso production with corrected event tracking

**Next Steps:** Conversations Dashboard, CSV export, pilot testing with 3 tenants
