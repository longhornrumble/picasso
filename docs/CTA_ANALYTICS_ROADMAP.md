# CTA Analytics Roadmap

## Purpose

This document captures the analytics gaps and proposed enhancements for tracking CTA (Call-to-Action) button performance within the Picasso chat widget. It serves as a foundation for a future PRD.

---

## Current State

### What We Track Today

The existing analytics pipeline captures **demand-side** CTA data:

| Event | Source | Pipeline | Storage |
|-------|--------|----------|---------|
| `CTA_CLICKED` | Frontend (CTAButton.jsx) | SQS -> Event Processor -> S3/DynamoDB | Session timeline, lead workspace |
| `FORM_STARTED` | Frontend | Same pipeline | Form analytics |
| `FORM_COMPLETED` | Frontend | Same pipeline | Form analytics |
| `FORM_ABANDONED` | Frontend | Same pipeline | Form analytics |

The frontend emits `CTA_CLICKED` with: `cta_id`, `cta_label`, `cta_action`, `triggers_form`.

### What We Don't Track

**Supply-side data is missing.** We know which buttons users clicked, but not:

- Which buttons were **shown** to users (the menu they chose from)
- Which buttons were shown but **not clicked** (rejection signal)
- How button **combinations** perform (does "Learn About Love Box" + "How to Get Involved" convert better than "Learn About Love Box" + "Contact Us"?)
- **Click-through rate per button** (clicked / shown)

### Where Supply Data Exists Today

The streaming handler logs a `QA_COMPLETE` event to CloudWatch with an `ai_actions` field containing the full CTA array sent to the frontend. This data exists but is:

- Only in CloudWatch (not queryable by the analytics dashboard)
- Not correlated with click events
- Not aggregated or visualized

---

## Proposed Enhancements

### 1. New Event: `CTA_SHOWN`

**What:** Frontend emits a `CTA_SHOWN` event every time CTA buttons render in the chat.

**Payload:**
```json
{
  "event_type": "CTA_SHOWN",
  "session_id": "abc-123",
  "tenant_id": "TESTV3ATL",
  "timestamp": "2026-02-16T...",
  "turn_number": 2,
  "ctas_shown": [
    { "id": "get_involved", "label": "How to Get Involved", "action": "send_query", "position": "primary" },
    { "id": "dd_apply", "label": "Learn About Dare to Dream", "action": "send_query", "position": "secondary" }
  ],
  "cta_count": 2
}
```

**Pipeline fit:** Flows through the existing SQS -> Analytics_Event_Processor -> S3/DynamoDB pipeline with no structural changes. The Event Processor already handles arbitrary event types and stores them by `event_type` partition.

**Frontend change:** Emit from `CTAButtonGroup` when buttons render (with deduplication to avoid re-emitting on re-renders).

### 2. Session Context Extension: `ctas_clicked`

**What:** The frontend passes a `ctas_clicked` array with each chat request, tracking which CTA buttons the user has clicked during the session.

**Payload (added to existing session_context):**
```json
{
  "session_context": {
    "completed_forms": ["lovebox"],
    "ctas_clicked": [
      { "id": "get_involved", "turn": 2 },
      { "id": "discovery", "turn": 3 }
    ]
  }
}
```

**Dual purpose:**

1. **Better button selection:** Code-side vocabulary pre-filtering can remove buttons the user already clicked. No prompt changes needed -- just filter the vocabulary array before building the prompt.

2. **Journey analytics:** The sequence of clicked CTAs tells the user's decision story. Combined with `CTA_SHOWN`, we can reconstruct the full funnel: what was offered -> what was chosen -> what converted.

### 3. Dashboard Correlation Views

With both `CTA_SHOWN` and `CTA_CLICKED` events in the pipeline, the analytics dashboard can surface:

| Metric | Calculation | Insight |
|--------|-------------|---------|
| **CTR per button** | clicked / shown | Which buttons users actually want |
| **Button combination effectiveness** | conversion rate by combination | Which button sets drive action |
| **Offer-to-click latency** | time between shown and clicked | How quickly users decide |
| **Rejection rate** | shown but never clicked | Buttons to deprioritize or remove |
| **Journey sequences** | ordered CTA clicks per session | Common paths to conversion |

**Dashboard location:** New tab or section in the existing picasso-analytics-dashboard, alongside the current Conversations, Forms, and Heatmap views.

---

## How This Connects to Button Selection Accuracy

The v3.5 Tag & Map system gives the AI a predefined vocabulary of buttons to choose from. Today, the AI sees the full vocabulary every turn. Two levers improve selection:

### Lever 1: Shrink the Menu Per Turn (Code-Side Pre-Filtering)

Using `ctas_clicked` from session_context, code removes already-clicked buttons from the vocabulary before building the prompt. The AI can't pick a button it can't see.

**Example:** User clicked "How to Get Involved" on turn 2. On turn 3, `query:get_involved` is removed from the vocabulary. The AI naturally progresses to `query:discovery` or `apply:` actions.

**Implementation:** Filter `formEntries`, `queryEntries`, `linkEntries` arrays in `buildV3Prompt()` based on `sessionContext.ctas_clicked`. Zero prompt text changes, zero latency impact.

### Lever 2: Better Descriptions in Vocabulary

The vocabulary entries include brief descriptions that guide the AI's selection:

```
Explore:
  learn:lb_apply -- Tell them more about Love Box
  learn:dd_apply -- Tell them more about Dare to Dream
Commit:
  apply:lb_apply -- Love Box application form
  query:get_involved -- Explain the volunteer process
```

Refining these descriptions (informed by analytics data on what actually converts) improves selection without changing the prompt structure.

### Feedback Loop

Analytics data closes the loop:

1. **CTA_SHOWN** tells us what the AI offered
2. **CTA_CLICKED** tells us what users wanted
3. **CTR per button** identifies mismatches (high-shown, low-clicked = bad selection)
4. **Journey sequences** reveal natural progressions
5. Insights feed back into vocabulary descriptions and pre-filtering rules

---

## Implementation Priority

| Phase | Work | Effort | Impact |
|-------|------|--------|--------|
| **Phase 1** | `CTA_SHOWN` event from frontend | Small (frontend emit + existing pipeline) | Unlocks all supply-side metrics |
| **Phase 2** | `ctas_clicked` in session_context | Medium (frontend state + Lambda parsing + vocabulary filtering) | Better button selection + journey data |
| **Phase 3** | Dashboard correlation views | Medium (new dashboard components + queries) | Visibility into CTA effectiveness |
| **Phase 4** | Vocabulary tuning based on data | Ongoing | Continuous improvement of button relevance |

---

## Architecture Notes

- **No new infrastructure required.** All events flow through the existing SQS -> Event Processor -> S3/DynamoDB pipeline.
- **Event Processor** already partitions by `event_type` and enriches with session metadata.
- **Analytics Dashboard API** already supports flexible queries against DynamoDB with Athena fallback for older data.
- **CloudWatch QA_COMPLETE logs** can serve as a backfill source for historical `CTA_SHOWN` data if needed.

---

*Created: 2026-02-16 | Context: Picasso v3.5 Tag & Map CTA system (Lambda v76)*
