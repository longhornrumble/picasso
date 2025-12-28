# ANNEX B: Conversations Dashboard - Build Specification

**Parent Document:** [USER_JOURNEY_ANALYTICS_PRD.md](USER_JOURNEY_ANALYTICS_PRD.md)
**Technical Reference:** [USER_JOURNEY_ANALYTICS_PLAN.md](USER_JOURNEY_ANALYTICS_PLAN.md)
**Version:** 1.1
**Date:** 2025-12-27
**Priority:** MVP Phase 5 (Conversations portion)
**Status:** ✅ COMPLETE

---

## Related Sections in Technical Plan

For implementation details, refer to these sections in `USER_JOURNEY_ANALYTICS_PLAN.md`:

| Topic | Section |
|-------|---------|
| Technology Stack | "Technology Stack" - React libraries, Nivo for heatmaps |
| Event Schemas | "Complete Event Schema" - Message event payloads |
| DynamoDB Tables | "Data Storage" - Session events, summaries |
| API Endpoints | "API Endpoints" - Analytics Lambda routes |
| Multi-Tenant Security | "Decision #9" - JWT authorizer, tenant_id injection |
| Phased Implementation | "Phase 5" - Dashboard build tasks |

---

## Visual Specification

**Mockup:** [conversations-dashboard.webp](conversations-dashboard.webp)

The mockup is the visual source of truth. This document specifies the logic, data, and behavior behind each component shown in the mockup.

---

## Problem Statement

Nonprofits need visibility into how visitors interact with their chatbot. They want to know:
- How many conversations happen and when (time patterns)
- What questions are asked most frequently
- How quickly the bot responds
- What percentage of engagement occurs after business hours

**User Need:** "Show me what visitors are asking and when, so I can optimize content and staffing."

---

## Feature Specifications

### 1. KPI Cards (Top Row)

Four cards showing key conversation metrics.

**Metrics:**

| KPI | Calculation | Example Display |
|-----|-------------|-----------------|
| Total Conversations | `COUNT(DISTINCT session_id)` where has messages | "276" |
| Total Messages | `COUNT(MESSAGE_SENT) + COUNT(MESSAGE_RECEIVED)` | "285" |
| Response Time | `AVG(response_time_ms) / 1000` | "2.1 sec" |
| After Hours % | `(after_hours_sessions / total_sessions) * 100` | "49.5%" |

**After Hours Definition:**
```javascript
// Business hours: 9 AM - 5 PM in tenant's timezone
function isAfterHours(timestamp, timezone = 'America/Chicago') {
  const localHour = new Date(timestamp).toLocaleString('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: timezone
  });
  const hour = parseInt(localHour, 10);
  return hour < 9 || hour >= 17;  // Before 9 AM or 5 PM or later
}
```

**API Endpoint:**
```
GET /conversations/summary?range={1d|7d|30d}
```

**Response:**
```json
{
  "metrics": {
    "total_conversations": 276,
    "total_messages": 285,
    "avg_response_time_seconds": 2.1,
    "after_hours_percentage": 49.5
  },
  "date_range": {
    "start": "2025-12-01T00:00:00Z",
    "end": "2025-12-25T23:59:59Z"
  }
}
```

**Acceptance Criteria:**
- KPI cards display current values with correct formatting
- Response time shown in seconds with 1 decimal place
- After hours percentage calculated based on tenant's timezone
- Cards have green border styling matching Bubble design

---

### 2. Conversation Heat Map

Day of week (columns) by hour of day (rows) grid showing conversation volume.

**Grid Structure:**
- **Columns:** Mon, Tue, Wed, Thu, Fri, Sat, Sun
- **Rows:** 12AM, 3AM, 6AM, 9AM, 12PM, 3PM, 6PM, 9PM (8 rows, 3-hour blocks)
- **Cells:** Contain count with color intensity based on volume

**Color Scale:**
```javascript
// Green intensity based on relative volume
const getHeatmapColor = (value, maxValue) => {
  if (value === 0) return '#ffffff';  // White for zero
  const intensity = Math.min(value / maxValue, 1);
  // Scale from light green to dark green
  const lightness = 95 - (intensity * 45);  // 95% to 50%
  return `hsl(142, 70%, ${lightness}%)`;
};
```

**Peak Detection:**
```javascript
// Find peak time slot
const findPeak = (heatmapData) => {
  let maxCount = 0;
  let peakSlot = null;

  heatmapData.forEach(row => {
    row.data.forEach(cell => {
      if (cell.value > maxCount) {
        maxCount = cell.value;
        peakSlot = { day: cell.day, hour: row.hour };
      }
    });
  });

  return peakSlot;  // e.g., { day: "Thursday", hour: "12PM" }
};
```

**API Endpoint:**
```
GET /conversations/heatmap?range={1d|7d|30d}
```

**Response:**
```json
{
  "heatmap": [
    {
      "hour_block": "12AM",
      "data": [
        { "day": "Mon", "value": 2 },
        { "day": "Tue", "value": 0 },
        { "day": "Wed", "value": 0 },
        { "day": "Thu", "value": 0 },
        { "day": "Fri", "value": 1 },
        { "day": "Sat", "value": 0 },
        { "day": "Sun", "value": 1 }
      ]
    },
    {
      "hour_block": "9AM",
      "data": [
        { "day": "Mon", "value": 9 },
        { "day": "Tue", "value": 10 },
        { "day": "Wed", "value": 12 },
        { "day": "Thu", "value": 8 },
        { "day": "Fri", "value": 9 },
        { "day": "Sat", "value": 10 },
        { "day": "Sun", "value": 5 }
      ]
    }
  ],
  "peak": {
    "day": "Thursday",
    "hour_block": "12PM",
    "count": 25
  },
  "total_conversations": 276
}
```

**Visual Reference:** Grid with day headers across top, hour labels on left. Each cell shows count with green background color intensity. "Peak: Thursday at 12pm" label in header.

**Acceptance Criteria:**
- Heat map displays 7 columns (days) x 8 rows (3-hour blocks)
- Cell values show conversation counts
- Color intensity scales with volume (0 = white, max = dark green)
- Peak time slot identified and displayed in header
- Zero values shown as "0" (not blank)

---

### 3. Top Five Questions

Ranked list of most frequently asked questions with counts and percentages.

**Metrics:**

| Field | Calculation | Display |
|-------|-------------|---------|
| Question Text | First user message in session (truncated to 50 chars) | "How can I donate to..." |
| Count | Number of sessions starting with similar question | "71 times" |
| Percentage | `(question_count / total_questions) * 100` | "24.9% of all questions" |

**Question Grouping (Similarity):**
```python
# Group similar questions using simple keyword matching
# Future: Use embeddings for semantic similarity

def group_questions(questions):
    groups = {}

    for q in questions:
        # Normalize: lowercase, remove punctuation
        normalized = normalize(q)

        # Find matching group or create new
        group_key = find_similar_group(normalized, groups)
        if group_key:
            groups[group_key]['count'] += 1
        else:
            groups[normalized] = {
                'sample': q,  # Keep original for display
                'count': 1
            }

    return sorted(groups.items(), key=lambda x: x[1]['count'], reverse=True)[:5]
```

**API Endpoint:**
```
GET /conversations/top-questions?range={1d|7d|30d}&limit=5
```

**Response:**
```json
{
  "questions": [
    {
      "question_text": "How can I donate to [organization]?",
      "count": 71,
      "percentage": 24.9
    },
    {
      "question_text": "How can I request supplies?",
      "count": 49,
      "percentage": 17.2
    },
    {
      "question_text": "Tell me about your events and gatherings.",
      "count": 48,
      "percentage": 16.8
    },
    {
      "question_text": "What volunteer opportunities are available?",
      "count": 35,
      "percentage": 12.3
    },
    {
      "question_text": "What services do you offer?",
      "count": 30,
      "percentage": 10.5
    }
  ],
  "total_questions": 276
}
```

**Visual Reference:** List with question text on left, count below, percentage on right. Total count shown in header.

**Acceptance Criteria:**
- Top 5 questions displayed in ranked order
- Question text truncated with ellipsis if >50 characters
- Count and percentage shown for each question
- Total count displayed in section header
- Questions grouped by similarity (not exact match)

---

### 4. Recent Conversations

Expandable cards showing recent Q&A pairs with details.

**Card Fields:**

| Field | Source | Display |
|-------|--------|---------|
| Timestamp | Session start time | "Dec 01, 2025 5:34 pm" |
| Topic Label | Categorized by first question | "Volunteer" badge |
| Question Preview | First user message | Full text or truncated |
| Answer Preview | First bot response | Truncated with "Show full answer" link |
| Response Time | Time from question to response | "1.9s response" |

**Topic Categorization:**
```javascript
// Simple keyword-based categorization
const categorizeQuestion = (question) => {
  const q = question.toLowerCase();

  if (q.includes('volunteer')) return 'Volunteer';
  if (q.includes('donate') || q.includes('donation')) return 'Donation';
  if (q.includes('event') || q.includes('gathering')) return 'Events';
  if (q.includes('service') || q.includes('help')) return 'Services';
  if (q.includes('supplies') || q.includes('request')) return 'Supplies';

  return 'General';  // Default category
};
```

**API Endpoint:**
```
GET /conversations/recent?range={1d|7d|30d}&limit=10&page=1
```

**Response:**
```json
{
  "conversations": [
    {
      "session_id": "sess_abc123",
      "started_at": "2025-12-01T17:34:00Z",
      "topic": "Volunteer",
      "first_question": "What volunteer opportunities are available?",
      "first_answer": "[Organization] offers several meaningful volunteer opportunities for those passionate about supporting children and families in the foster care system.",
      "response_time_seconds": 1.9,
      "message_count": 4,
      "outcome": "form_started"
    },
    {
      "session_id": "sess_def456",
      "started_at": "2025-12-01T16:01:00Z",
      "topic": "Volunteer",
      "first_question": "Volunteer",
      "first_answer": "At [Organization] we offer a variety of meaningful volunteer opportunities to support children and families in the foster care system.",
      "response_time_seconds": 1.4,
      "message_count": 2,
      "outcome": null
    }
  ],
  "pagination": {
    "total_count": 50,
    "page": 1,
    "limit": 10,
    "has_next": true
  }
}
```

**Visual Reference:** Cards with green status dot, timestamp, topic badge, Q&A preview with truncation, response time indicator. "50 Q&A pairs" link in header.

**Acceptance Criteria:**
- Recent conversations displayed as cards (most recent first)
- Green status dot indicates active/completed session
- Topic badge shows categorized topic
- Answer preview truncated with "Show full answer" expandable
- Response time shown with lightning bolt icon
- Pagination for viewing more conversations
- "X Q&A pairs" total count in header as link

---

### 5. Conversations Trend

Line chart showing conversation/question volume over time.

**Chart Type:** Line chart with data points
- **X-axis:** Time (hourly for 1d, daily for 7d/30d)
- **Y-axis:** Count
- **Line:** Questions per period

**API Endpoint:**
```
GET /conversations/trend?range={1d|7d|30d}&granularity={hour|day}
```

**Response:**
```json
{
  "trend": [
    { "period": "12am", "value": 5 },
    { "period": "2am", "value": 3 },
    { "period": "4am", "value": 2 },
    { "period": "6am", "value": 8 },
    { "period": "8am", "value": 12 },
    { "period": "10am", "value": 15 },
    { "period": "12pm", "value": 18 },
    { "period": "2pm", "value": 22 },
    { "period": "4pm", "value": 25 },
    { "period": "6pm", "value": 28 },
    { "period": "8pm", "value": 20 },
    { "period": "10pm", "value": 12 }
  ],
  "legend": "Questions per hour"
}
```

**Visual Reference:** Line chart with green line, data point dots, Y-axis showing count, X-axis showing time periods. "Questions per hour" legend in header.

**Acceptance Criteria:**
- Line chart shows trend over selected time period
- Data points visible on line
- Y-axis scales appropriately to data range
- X-axis labels show readable time periods
- Legend indicates what metric is displayed
- Responsive to different screen sizes

---

## Data Requirements

### Events to Capture

**Frontend events (already captured by Picasso widget):**

```javascript
// Message sent by user
{
  type: 'MESSAGE_SENT',
  payload: {
    content_preview: 'What volunteer opportunities are available?',
    content_length: 42
  }
}

// Message received from bot
{
  type: 'MESSAGE_RECEIVED',
  payload: {
    content_preview: 'We offer several volunteer opportunities...',
    content_length: 156,
    response_time_ms: 1400,
    branch_id: 'volunteer_discussion'
  }
}

// Session started
{
  type: 'WIDGET_OPENED',
  payload: {
    trigger: 'button'
  }
}
```

### DynamoDB Schema

**Table:** `picasso-session-events`

```
PK: SESSION#{session_id}
SK: STEP#{step_number}

Attributes:
- tenant_hash: string
- event_type: string (MESSAGE_SENT | MESSAGE_RECEIVED | WIDGET_OPENED | etc.)
- timestamp: string (ISO 8601)
- content_preview: string (up to 500 chars)
- response_time_ms: number (for bot messages)
- metadata: map {
    branch_id: string,
    role: 'user' | 'assistant'
  }

TTL: 90 days

GSI: tenant-date-index
  PK: tenant_hash
  SK: timestamp
```

**Table:** `picasso-session-summaries`

```
PK: TENANT#{tenant_hash}
SK: SESSION#{session_id}

Attributes:
- started_at: string (ISO 8601)
- ended_at: string (ISO 8601)
- message_count: number
- first_question: string
- outcome: string (form_completed | link_clicked | abandoned)
- is_after_hours: boolean

TTL: 90 days

GSI: tenant-date-index
  PK: tenant_hash
  SK: started_at
```

---

## Error States & Edge Cases

### Error States

| Scenario | User Message | Technical Behavior |
|----------|-------------|-------------------|
| API timeout (>10s) | "Data is taking longer than expected. Please try a shorter date range." | Retry with exponential backoff |
| Invalid JWT | "Session expired. Please log in again." | Redirect to Bubble login |
| No data in range | "No conversations in this time period." | Show empty state with suggestion |
| Network error | "Connection lost. Please check your internet." | Show retry button |

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No conversations in date range | Show empty state: "No conversations yet. Check back later." |
| Session with only 1 message | Count as conversation, show in recent with no response |
| Very long question (>500 chars) | Truncate at 500 chars with ellipsis |
| Bot response time >10s | Cap display at "10+ sec" to avoid alarming values |
| Multiple messages per session | Use first Q&A pair for "Recent Conversations" |
| Questions containing org name | Redact org name with "[organization]" for privacy |

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Dashboard load time | <2s |
| API latency (p90) | <500ms |
| Heat map render | <100ms |
| Search/filter response | <500ms |
| Data freshness | <5 minutes |

---

## Component Reuse

**From Forms Dashboard:**
- `PageHeader` - Time range selector, filters, sign out
- `StatCard` - KPI display cards (needs green border variant)
- `SimpleTrendChart` - Line chart for trend

**New Components:**
- `ConversationHeatMap` - Day × Hour grid with color intensity
- `TopQuestions` - Ranked question list
- `RecentConversations` - Expandable Q&A cards

---

## Timeline

| Task | Estimate |
|------|----------|
| Create ANNEX_B specification | 0.5 day |
| Add API endpoints to Lambda | 1 day |
| Add types and API functions | 0.5 day |
| Build ConversationHeatMap | 1 day |
| Build TopQuestions component | 0.5 day |
| Build RecentConversations | 1 day |
| Create ConversationsDashboard page | 0.5 day |
| Add navigation between dashboards | 0.5 day |
| Testing and polish | 1 day |
| **Total** | **6.5 days** |

---

**Build Status:** ✅ COMPLETE (2025-12-26)

## Implementation Summary

The Conversations Dashboard has been fully implemented and deployed. Key accomplishments:

### Frontend Components (picasso-analytics-dashboard)
- **StatCard** - Reused from Forms Dashboard with green border variant
- **ConversationHeatMap** - Custom day × hour grid with color intensity (Nivo responsive heat map)
- **TopQuestions** - Ranked question list with counts and percentages
- **RecentConversations** - Expandable Q&A cards with topic badges
- **SimpleTrendChart** - Line chart for conversation volume trends
- **PageHeader** - Shared component with time range selector

### API Endpoints (Analytics_Dashboard_API Lambda)
- `GET /conversations/summary` - Total conversations, messages, response time, after-hours %
- `GET /conversations/heatmap` - Day × hour grid with peak detection
- `GET /conversations/top-questions` - Most frequent first questions
- `GET /conversations/recent` - Recent Q&A pairs with pagination
- `GET /conversations/trend` - Conversation volume over time

### Dashboard Features
- **Tab navigation** - Forms and Conversations tabs in single dashboard
- **Shared components** - StatCard, PageHeader, time range selector
- **Live data integration** - All endpoints connected to DynamoDB/Athena
- **Empty states** - Graceful handling when no data available
- **Responsive design** - Works on desktop and mobile

### Data Sources
- **picasso-session-summaries** - Session metadata, first question, outcome
- **picasso-session-events** - Individual MESSAGE_SENT/MESSAGE_RECEIVED events
- **Athena fallback** - For queries beyond DynamoDB TTL (90 days)

### Deployment
- Dashboard: `/picasso-analytics-dashboard/` (React + Vite + TypeScript)
- Lambda: `Analytics_Dashboard_API` (Python, DynamoDB + Athena)
- Live API URL: `https://uniywvlgstv2ymc46uyqs3z3du0vucst.lambda-url.us-east-1.on.aws`

---

**Forms Dashboard:** ✅ COMPLETE (see [ANNEX_C_FORMS_DASHBOARD.md](ANNEX_C_FORMS_DASHBOARD.md))

**Next Steps:** Phase 6 - ✅ CSV export complete, production deployment pending, pilot testing with 3 tenants
