# Scheduling — Burn-In Log

**Purpose.** Operational log of manual exercise findings during sub-phases B–F. Per [`scheduling_ci_strategy.md`](scheduling_ci_strategy.md) §5.2, every new flow shipped must be manually exercised against `MYR384719` within 24 hours of the PR merging, and findings committed here. This log is the operator's running record — it persists across sessions and is visible to future engineers and AI agents working on this codebase.

**Committed, not local.** This file lives in the repo. A log that isn't committed disappears with a session reset.

---

## Format

Each entry:

| Field | Value |
|---|---|
| **Date** | YYYY-MM-DD |
| **Sub-phase** | e.g. B, C3, E |
| **PR / commit** | short SHA or PR number |
| **Flow exercised** | one-line description |
| **Observation** | what was found |
| **Category** | (a) explained + known / (b) explained + fixed / (c) unexplained, not reproducible / (d) unexplained, reproducible |
| **Resolution** | ticket link, fix description, or "transient — to revisit" |

Category definitions from CI strategy §5.3:
- **(a)** Known issue with a tracking ticket — fine to proceed.
- **(b)** Already fixed in this session — fine.
- **(c)** Unexplained, not reproducible — log and start 48-hour investigation window; if still unreproducible at 48h, mark "transient — to revisit."
- **(d)** Unexplained, reproducible — **launch blocker** until resolved.

---

## Example Entries (synthetic — format reference only)

| Date | Sub-phase | PR | Flow exercised | Observation | Category | Resolution |
|---|---|---|---|---|---|---|
| 2026-05-10 | B | #61 | First booking write via `Scheduling_Handler` → DDB | Write succeeded; GSI `(tenantId, start_at)` queryable within 200ms | (a) | No action needed |
| 2026-05-12 | B | #63 | Calendar_Watch_Listener receives push notification → dispatches `booking.calendar_deleted` | Deletion event dispatched correctly; DLQ empty after 5 min | (b) | — |
| 2026-05-14 | C | #67 | Volunteer cancels via signed link → calendar event removed → status → `canceled` | One spurious `booking.calendar_deleted` event fired 3s after the expected one; second event processed idempotently, no double-notification | (c) | Duplicate push from Google; dedupe key absorbed it cleanly. Not reproducible after retry. Monitoring for recurrence. |

---

## Log

_No entries yet. First entry added when sub-phase B manual exercise runs._

| Date | Sub-phase | PR | Flow exercised | Observation | Category | Resolution |
|---|---|---|---|---|---|---|
| | | | | | | |

---

## Reference

- Manual exercise protocol: [`scheduling_ci_strategy.md`](scheduling_ci_strategy.md) §5.2
- Category triage thresholds: [`scheduling_ci_strategy.md`](scheduling_ci_strategy.md) §5.3
- Weekly review procedure: [`scheduling_ci_strategy.md`](scheduling_ci_strategy.md) §5.3
