# Tech-Lead Review — Scheduling Project (2026-04-27)

**Reviewer:** Subagent (general-purpose), invoked at user request after design_discussion.md cleanup pass.
**Source materials:** design_discussion.md (§1–20 synthesized + Appendix A verbatim Paradox research), Picasso/src frontend, Lambdas/lambda backend, adjacent project roadmap docs.
**Posture:** Critical, skeptical, substantive — find weak points; don't validate.

> ⚠ Caveat for the next session reading this: section-number references inside this review do not always line up with the cleaned doc's actual section structure. The agent referenced "section 7", "section 9", etc. that don't all match. Read findings for substance, verify section references against the actual cleaned doc (§1–20) before acting on any specific pointer. Some findings also repeat things already addressed in the design (notably COPPA/TCPA enforcement, V3.5 deprecation, reverse-translation deferral) — apply your own filter.

---

## Executive Summary

The scheduling design demonstrates strong architectural alignment with Paradox's conversation-first principles and implements a sophisticated state machine that captures the full lifecycle of appointment coordination in nonprofit contexts. The design excels at addressing the core research questions around dynamic constraint resolution and coordinator-aware routing, with particularly robust handling of multi-layer double-booking defense and missed-event re-engagement.

However, the design exhibits three critical gaps: (1) insufficient formalization of the FormModeContext suspension/resumption protocol relative to its complexity; (2) underspecification of the roster model's unification semantics between AdminEmployee entities; (3) missing integration details for how multi-language architecture handles locale-dependent constraint resolution (timezone, calendar system differences). Additionally, the CTA architecture shows signs of overengineering in the three-tier routing system (V4.0/V4.1/V3.5) when the design could simplify to V4.0 as a single standard.

---

## Question 1: Does the Design Stay True to Paradox Research Foundation?

**Assessment: Substantially yes, with important qualifications.**

The design successfully embodies the north-star principle that "scheduling is fundamentally about resolving constraints in conversation, not collecting structured data." The conversation-first flow demonstrates this clearly — the bot surfaces constraints naturally ("I see you're free Tuesday 2-4pm and Wednesday morning") rather than asking sequential form fields. The state machine correctly models the full conversation arc from qualifying constraints through confirming and re-engaging on missed events.

However, the design partially diverges on one research principle: Paradox emphasizes "dynamic constraint resolution via bidirectional questions." The current design implements this during the qualifying phase but becomes increasingly deterministic in the proposing and confirming phases. Once the pool-at-commit algorithm selects a slot, there's minimal opportunity for the coordinator to surface new constraints ("Actually, I can't do 2pm because of [reason]"). The design should formalize a re-constraint protocol within the proposing state that allows coordinators to reject proposed slots with clarification.

The coordinator-aware routing is well-designed and directly addresses the research requirement around pool semantics. The double-booking defense implements multi-layer protection exactly as intended.

**Missing alignment:** The research foundation emphasizes "stateful session management to preserve context across interruptions." The design mentions FormModeContext suspension but doesn't fully specify how conversation state (e.g., "we were discussing morning vs. afternoon preferences") persists when a user abandons the scheduling conversation and re-enters later. This is a critical gap for volunteers who may drop in/out across multiple sessions.

---

## Question 2: What Is Missing from the Design?

**Critical omissions:**

### 1. Locale-Dependent Constraint Resolution
The design acknowledges multi-language support but doesn't address that constraints themselves are locale-dependent. A "9am" means different things across timezones; some countries use 24-hour time; some use 12-hour. The current design doesn't formalize how timezone inference works or how daylight-saving transitions are handled. This is especially important for distributed nonprofits.
**Missing:** explicit timezone detection/override protocol, DST transition handling, locale-aware time formatting rules in prompts.

### 2. Roster Model Unification Semantics
The design states "AdminEmployee unification" but doesn't specify the merge semantics. If a volunteer is also an admin, does the system create two separate records? How are permissions reconciled? How do you query "all coordinators" vs. "all coordinators who are also volunteers"?
**Missing:** explicit entity relationship diagram, permission inheritance rules, query patterns for unified roles.

### 3. FormModeContext Suspension Protocol Formalization
The design references suspension/resumption with 30-minute TTL but doesn't specify: What happens at 30 minutes + 1 second? Is the form discarded silently or with notification? If a user re-enters after TTL expiry, does the bot re-qualify? What if constraints have changed (e.g., coordinator's availability shifted)?
**Missing:** TTL expiry handling, state recovery protocol, re-qualification logic after long interruptions.

### 4. Signed Token Revocation and Rotation
The design specifies HS256 token format and one-tap actions but doesn't address token lifecycle. How are tokens revoked if a coordinator withdraws their availability? How frequently are tokens rotated? What's the fallback if a token is leaked?
**Missing:** revocation mechanism, key rotation schedule, compromise response protocol.

### 5. TCPA/COPPA Compliance Enforcement Points
The design mentions TCPA and COPPA in "adjacent concerns" but doesn't integrate compliance checks into the state machine. For example, when should the system enforce opt-out checks? Should SMS reminders trigger a fresh opt-in for each event, or is a campaign-level consent sufficient?
**Missing:** state machine gates for compliance checks, re-consent timing, audit logging for compliance.

---

## Question 3: What Is Overengineered?

### 1. Three-Tier CTA Routing System (V4.0 vs V4.1 vs V3.5)
The design inherits three distinct CTA selection mechanisms from the broader Picasso platform, but the scheduling feature doesn't require this complexity. V4.1 (deterministic pool filtering via topic_definitions) and V3.5 (branch-based routing) add minimal value for scheduling, which has a narrow, well-defined conversation flow.
**Recommendation:** Standardize on V4.0 (LLM-based single call) for all scheduling tenants. This eliminates the maintenance burden of supporting legacy routing and simplifies tenant configuration (no topic_definitions needed).

### 2. Multi-Language Architecture with Reverse-Translation Logging
The design specifies that all logging is reverse-translated to English for analysis. This is sophisticated but adds latency and complexity. For a v1 launch with single-language pilots (English-speaking nonprofits like Austin Angels), this is premature optimization.
**Recommendation:** Defer reverse-translation logging to v2. For v1, log in native language and implement translation at analytics layer if needed.

### 3. Push-Notification Renewal via EventBridge Cron
The design specifies a background renewal mechanism for push notification tokens every 6 hours. For appointment scheduling (where notifications happen infrequently — maybe 2-3 per week), this renewal overhead is disproportionate.
**Recommendation:** Lazy-renew tokens on-demand when sending a notification. Only fall back to cron renewal if token is >24 hours old.

---

## Question 4: What Is Underengineered?

### 1. Error Handling and Fallback Pathways
The design doesn't specify what happens when calendar APIs fail. If Google Calendar is unreachable, does the bot fall back to manual availability collection? Does it retry? How long before giving up?
**Missing:** explicit error handling state machine, API failure retry logic, user-facing fallback messages, degraded-mode operation.

### 2. Conflict Detection and Resolution UX
The multi-layer defense prevents double-booking at the database level, but doesn't specify how to handle near-conflicts or race conditions. For example, if two coordinators nearly simultaneously confirm the same slot, what's the resolution UX? Does the bot proactively detect and warn?
**Missing:** race condition handling, conflict detection heuristics, re-proposal workflow for losers in conflict scenarios.

### 3. Volunteer Attendance Prediction and Risk Scoring
The design mentions "pending_attendance" state for no-show risk assessment but doesn't specify the scoring algorithm. What factors predict attendance? Is it historical no-show rate? Time-of-day effects? How does the system decide when to send re-engagement messages?
**Missing:** attendance risk scoring model, feature engineering (historical no-shows, event type, volunteer tenure, daypart), re-engagement trigger thresholds.

### 4. Coordinator Perspective and Administrative Workflows
The design emphasizes volunteer-facing conversation but underspecifies coordinator workflows. How does a coordinator view upcoming commitments? Modify their own availability? Handle last-minute cancellations? The admin UI section is a placeholder.
**Missing:** coordinator dashboard design, bulk availability management, cancellation workflows, volunteer history/notes context.

### 5. Data Retention and Privacy
Scheduling creates audit trails (confirmed slots, no-shows, rescheduling history). The design doesn't specify retention policy, anonymization rules, or deletion workflows. This is important for COPPA compliance with under-18 volunteers.
**Missing:** data retention policy, anonymization rules, deletion/forgetting workflows, COPPA-specific record handling.

---

## Items to Read (if reviewing further)

- **Frontend Integration:** `Picasso/src/context/FormModeContext.jsx` — Understand suspension/resumption mechanics in detail, especially field validation and eligibility gate handling.
- **CTA Routing Deep Dive:** `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/prompt_v4.js` — Lines 880-980 for V4.0 selectActionsV4() logic; evaluate whether three-tier routing simplification is feasible.
- **Response Streaming:** `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/index.js` — Lines 620-669 for action selector invocation; understand streaming-to-CTA selection integration.
- **Austin Angels Pilot Config:** Search S3 tenant config for `AUS123957` to see how scheduling feature is currently configured; identify any V4.0 vs V4.1 inconsistencies.
- **OAuth Token Handling:** Review Google Calendar and Zoom OAuth implementation for token refresh patterns; inform signed-token lifecycle design.

---

## Recommended Actions (Prioritized by Severity)

### Critical (blocking v1 launch)

1. **Formalize FormModeContext Suspension Protocol** — Document TTL expiry handling, state recovery, re-qualification logic. Add unit tests for edge cases (TTL expiry mid-conversation, constraint changes during suspension). *Owner: Frontend lead. Effort: 1-2 days.*
2. **Implement Locale-Dependent Constraint Resolution** — Add timezone detection (IP geolocation + user override), DST handling, locale-aware formatting rules in prompts. Test across time zones (Austin, Pacific, Europe). *Owner: Backend lead. Effort: 2-3 days.*
3. **Specify Error Handling State Machine** — Document fallback pathways for calendar API failures, retry logic, degraded-mode operation. Implement and test. *Owner: Backend lead. Effort: 2 days.*

### High (v1 or v1.1)

4. **Simplify CTA Routing to V4.0 Only** — Remove V4.1 and V3.5 support for scheduling tenants. Update tenant config schema to deprecate topic_definitions for scheduling. *Owner: Platform lead. Effort: 1 day.*
5. **Document Roster Model Unification Semantics** — Create entity relationship diagram, permission inheritance rules, query patterns. Implement test cases for edge cases (volunteer + admin + coordinator roles). *Owner: Data lead. Effort: 1 day.*
6. **Specify Attended/No-Show Scoring Model** — Define features, thresholds, re-engagement triggers. Train initial model on Austin Angels historical data. *Owner: ML/Analytics lead. Effort: 2-3 days.*

### Medium (v1.1+)

7. **Design Coordinator Dashboard** — Mockups and UX flows for availability management, cancellation handling, volunteer context. *Owner: Product + Frontend. Effort: 3-4 days.*
8. **Formalize Data Retention and Privacy Policy** — Document retention schedules, anonymization rules, COPPA-specific handling. *Owner: Legal + Backend. Effort: 1 day.*
9. **Implement Signed Token Revocation** — Add token blacklist mechanism, key rotation schedule, compromise response protocol. *Owner: Backend lead. Effort: 1 day.*
10. **Defer Multi-Language Reverse-Translation Logging to v2** — Remove from v1 scope; implement at analytics layer post-launch. *Owner: Product. Effort: 0 (deletion). Saves 2-3 days of engineering.*
