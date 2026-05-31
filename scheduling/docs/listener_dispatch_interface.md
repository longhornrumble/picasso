# Calendar_Watch_Listener — Dispatch Interface

**Purpose.** Contract between `Calendar_Watch_Listener` (sub-phase B2) and the booking-lifecycle consumers built in sub-phases C and E (C4 freeBusy cache, C8 booking record sync, C9 state machine). Engineers building B2 and C-phase consumers read this spec; it is not narrative.

**Reference.** Canonical design §14.2 (event taxonomy), §13 (token format), §5.1 (agent-of-CoR principle). Implementation plan B-phase tasks.

---

## Event-Type Vocabulary

Every event the listener may dispatch. No other event types exist in v1.

| Event type | Trigger condition |
|---|---|
| `booking.calendar_deleted` | Google `X-Goog-Resource-State: exists` → `events.get` returns 404 for a platform-owned event |
| `booking.calendar_moved` | Google push → `events.get` `start.dateTime` differs from `Booking.start_at` |
| `booking.calendar_reassigned` | Google push → `events.get` organizer or accepted attendee no longer matches `Booking.resource_id` |
| `booking.ooo_overlap_detected` | Google push → new OOO-type event's time range overlaps ≥1 `booked` booking for the same coordinator |
| `booking.attendee_accepted` | Google push → `events.get` attendee `responseStatus` changed to `accepted` |
| `booking.attendee_declined` | Google push → `events.get` attendee `responseStatus` changed to `declined` |
| `booking.event_made_private` | Google push → `events.get` `visibility` changed to `private` |

---

## Payload Schema

All events share a common envelope. Per-type fields follow.

### Common envelope

```json
{
  "event_type": "string",           // one of the seven types above
  "event_id": "string",             // == Booking PK (booking_id); stable across retries
  "tenant_id": "string",
  "booking_id": "string",
  "last_calendar_mutation_at": "string", // ISO-8601; from events.get updated field
  "dispatched_at": "string",        // ISO-8601; wall clock at listener invocation
  "calendar_provider": "google"     // "microsoft" reserved for v2
}
```

### booking.calendar_moved — additional fields

```json
{
  "previous_start_at": "string",    // ISO-8601; from Booking.start_at before update
  "new_start_at": "string",         // ISO-8601; from events.get start.dateTime
  "previous_end_at": "string",
  "new_end_at": "string"
}
```

### booking.calendar_reassigned — additional fields

```json
{
  "previous_resource_id": "string", // coordinator email before reassignment
  "new_resource_id": "string"       // new organizer/accepted-attendee email
}
```

### booking.ooo_overlap_detected — additional fields

```json
{
  "ooo_start_at": "string",         // ISO-8601
  "ooo_end_at": "string",
  "overlapping_booking_ids": ["string"]  // all affected booking_ids
}
```

Note: `booking_id` in the envelope is set to the first overlapping booking; the full list is in `overlapping_booking_ids`.

> **⚠️ Consumer guidance (Phase 2b audit, 2026-05-29 — code-reviewer + tech-lead convergent finding).** The "first overlapping booking" is whichever the DynamoDB GSI query returns first — **non-deterministic** across pages, NOT a meaningful priority. The single-envelope aggregate design is intentional (one OOO event = one SQS message), but it means the FIFO `MessageGroupId = event_id` ordering guarantee only covers `overlapping_booking_ids[0]`. **Consumers (C4 freeBusy, C9 state-machine) MUST act on the full `overlapping_booking_ids` array, not just `booking_id`/`event_id`.** A C9 design that keys remediation off `event_id` alone will silently miss bookings 2..N. C-phase must define how C9 handles the multi-booking case before C9 is built.

### booking.attendee_accepted / booking.attendee_declined — additional fields

```json
{
  "attendee_email": "string",       // the attendee whose responseStatus changed
  "response_status": "accepted | declined"
}
```

### booking.event_made_private — no additional fields

---

## Idempotency Expectations

Each consumer MUST be idempotent. The same event may arrive more than once (SQS at-least-once delivery; Google may send duplicate push notifications).

**Dedupe key:** `(event_id, last_calendar_mutation_at)`. Consumers check this pair against a processed-events record before acting. Processing the same `(event_id, last_calendar_mutation_at)` twice produces the same outcome as processing it once.

No consumer may reject a message solely because it has already processed it — log and discard; do not DLQ.

---

## Error Contract

| Scenario | B2 behavior |
|---|---|
| Consumer absent (no SQS subscriber yet) | B2 logs the event and continues. v1 ships consumer stubs for C4, C8, C9 so the queue always has a subscriber. |
| Consumer throws / returns non-2xx | SQS redrive to DLQ after configured max-receive-count. DLQ alarm fires (wired to `picasso-ops-alerts-{env}` — staging: `picasso-ops-alerts-staging` per [plan §4 line 132 VERIFIED](scheduling_implementation_plan.md#L132); prod: `picasso-ops-alerts-prod` reserved for Phase-2 cutover). |
| Payload fails schema validation | B2 logs full payload + validation error, sends to DLQ, fires alarm. Listener Lambda does NOT crash — process continues for subsequent push notifications. |
| `events.get` returns 403 (event made private) | Emit `booking.event_made_private`. Do not attempt to read event body. Log degradation. |

---

## Ordering Guarantees

- Events for the same `event_id` (same booking) are sent to an **SQS FIFO queue** and processed in order. Message group key = `event_id`.
- Events for different `event_id` values may be processed concurrently. Consumers must not assume cross-booking ordering.
- Listener Lambda may coalesce multiple Google push notifications for the same calendar into a single `events.get` call before dispatching — this is an optimization detail internal to B2 and does not affect the dispatch contract.

---

## Delta Discovery (B2 Phase 2b precondition)

The "Event-Type Vocabulary" table above speaks in terms of `events.get(eventId)` returning 404 / showing a `visibility` change / etc. **Google Calendar push notifications identify a watched calendar, not a specific event** — `X-Goog-Resource-ID` + `X-Goog-Resource-URI` point at the calendar resource. The listener must run a delta-discovery step to map a push notification to the specific event_id(s) that changed before it can call `events.get` per the table.

**Standard pattern:** `events.list(calendarId, syncToken)`.
1. Initial registration (B5 onboarding hook) calls `events.list(calendarId)` (no syncToken) → records `nextSyncToken` on the channel row as `last_sync_token`.
2. On every push notification, listener calls `events.list(calendarId, syncToken=last_sync_token)` → response contains only events that changed since last sync + a new `nextSyncToken`.
3. Listener atomically updates `last_sync_token` on the channel row (conditional write keyed on prior value to prevent races with concurrent invocations for the same channel — SQS FIFO MessageGroupId=channel_id today; this becomes redundant once Phase 2b lands but is belt-and-suspenders).
4. For each returned event, derive the matching event_type per the table above (deleted / moved / reassigned / private / attendee_accepted / attendee_declined). OOO overlap derivation (`booking.ooo_overlap_detected`) is a separate path triggered when the changed event is an OOO/working-location event and a GSI lookup on overlapping bookings returns matches.

**Schema impact (lands with Phase 2b infra change):** `picasso-calendar-watch-channels-{env}` row gains `last_sync_token` (S, optional) + `coordinator_id` (S, required for the OAuth secret-path lookup `picasso/scheduling/oauth/{tenant_id}/{coordinator_id}`). B1 runbook + canonical §14.1 update with Phase 2b.

**Status:** B2 **Phase 2b IMPLEMENTED** ([lambda#173](https://github.com/longhornrumble/lambda/pull/173)) — the handler runs delta-discovery + typed-event derivation; pending deploy + smoke. Phase 2a shipped the OAuth + Calendar API foundation modules ([`oauth-client.js`](https://github.com/longhornrumble/lambda/blob/main/Calendar_Watch_Listener/oauth-client.js) + [`calendar-api.js`](https://github.com/longhornrumble/lambda/blob/main/Calendar_Watch_Listener/calendar-api.js)).

## Phase 2b implementation notes (2026-05-29 audit reconciliation)

These reconcile this spec with the shipped implementation (lambda#173) so C-phase consumer authors aren't misled. Recorded per the phase-completion-audit; full matrix in `project_pii_*`/scheduling audit memory.

- **Derivation reads the `events.list(syncToken)` delta payload, NOT a per-event `events.get`.** The "Event-Type Vocabulary" trigger column phrases conditions as `events.get` returning 404 / showing a `visibility` change — those describe the *logical* condition. The implementation satisfies them directly from each changed delta item's fields (`status === 'cancelled'` → deleted; `visibility` private/confidential → private; `start`/`attendees`/`extendedProperties` for moved/reassigned/attendee). `getEvent` (per-event) remains available in `calendar-api.js` but the handler derives from the delta. (audit row 2 — tech-lead contract-drift)
- **Platform ownership + C8 forward-contract.** An event is platform-owned iff `extendedProperties.private.booking_id` is set. **Sub-phase C8 MUST write `extendedProperties.private.booking_id` on every calendar event it creates**, or the entire typed system silently degrades to `skipped_non_platform_event`. There is no machine-enforceable gate today — C8's exit criteria must verify this property is set on a real booking's calendar event. (audit row 10 — tech-lead I1)
- **All-day vs timed events (date-format contract).** Google all-day events carry `start.date` (`YYYY-MM-DD`); timed events carry `start.dateTime` (RFC 3339). `calendar_moved` compares the event start against `Booking.start_at`, and the OOO GSI range query compares lexicographically — **a date-only value compared against a dateTime value is wrong** (spurious `moved`, missed OOO overlaps). **C8 must store `Booking.start_at` in a format comparable to what Google returns for that event** (or the derivation must normalize both bounds to RFC 3339 before comparing). Tracked for the C8/derivation hardening. (audit row 9 — convergent)
- **`workingLocation` is EXCLUDED from OOO-overlap (RESOLVED 2026-05-31, operator decision; closes the audit-row-12 §14.2 open question).** Only `eventType === 'outOfOffice'` is treated as absence; `workingLocation` (WFH/office/travel) is **not** absence and must NOT fire `booking.ooo_overlap_detected` (it would false-positive-reoffer/cancel valid bookings). **Listener derivation change (integrator-owned, lands before/with WS-B9B10):** drop `|| 'workingLocation'` from the OOO trigger so the consumer (B9) only ever receives real-absence OOO. B9 consumers can therefore treat every `ooo_overlap_detected` envelope as a genuine absence with no subtype filtering (the envelope carries no subtype). (audit row 12 — RESOLVED: exclude)

---

## Named Consumers

| Consumer | Sub-phase | Event types consumed |
|---|---|---|
| **C4** freeBusy cache invalidation | C | `booking.calendar_moved`, `booking.calendar_deleted`, `booking.ooo_overlap_detected` |
| **C8** booking record sync | C | All types |
| **C9** state machine transitions | C | `booking.calendar_deleted`, `booking.attendee_declined`, `booking.calendar_moved` |

---

## Change log

| Date | Change | Author |
|---|---|---|
| 2026-05-02 | Initial — derived from canonical §14.2 event taxonomy and §13 token/payload constraints | Chris + Claude |
| 2026-05-25 | Drift correction: SNS topic name `picasso-ops-alerts` → `picasso-ops-alerts-{env}` (`-staging` is canonical in staging-525 per `{name}-{env}` naming convention). Closes audit row 8 from `project_scheduling_subphase_b_phase_completion_audit_2026-05-25`. | Chris + Claude |
| 2026-05-26 | Added "Delta Discovery" section as Phase 2b precondition — clarifies that `events.list(syncToken)` is required between Google's calendar-level push and the per-event `events.get` calls the table assumes. Surfaces schema additions (`last_sync_token`, `coordinator_id`) that land with Phase 2b infra change. Phase 2a (OAuth + Calendar API foundation modules) shipped via [lambda#165](https://github.com/longhornrumble/lambda/pull/165). | Chris + Claude |
| 2026-05-29 | **Phase 2b IMPLEMENTED** ([lambda#173](https://github.com/longhornrumble/lambda/pull/173), OPEN) — handler now runs delta-discovery + derives the 7 typed `booking.*` events + dispatches to SQS FIFO (`MessageGroupId=event_id`); replaces the Phase 1 `raw.calendar_push` envelope. Mandatory Security-Reviewer pass + remediation (cross-tenant booking-id guard, dispatch-before-advance ordering, 410 syncToken-expiry handling, channel_id in dedup basis, PII-log strip). 92 unit tests + CI-3b contract test. **NOT yet deployed/smoked/audited** — `booking_id` mapping via `extendedProperties.private.booking_id` is a forward-contract for sub-phase C8 (no real bookings exist yet; derivations tested against seeded fixtures). | Chris + Claude |
| 2026-05-29 | **Phase 2b phase-completion-audit (code-reviewer + tech-lead + test-engineer + the prior Security pass).** Added the "Phase 2b implementation notes" section + OOO consumer-guidance note reconciling this spec with the implementation: (row 2) derivation reads the `events.list` delta payload, not per-event `events.get`; (row 8) OOO aggregate envelope's first-booking selection is non-deterministic — consumers must use `overlapping_booking_ids`; (row 9) all-day vs dateTime format contract for C8/derivation; (row 10) C8 must write `extendedProperties.private.booking_id`; (row 12) `workingLocation`-as-OOO flagged for canonical §14.2 review. Code/test/IaC audit fixes ship in lambda#173 + a picasso IaC PR (Booking start_at-index IAM grant). | Chris + Claude |
| 2026-05-31 | **Audit row 12 RESOLVED (operator decision): `workingLocation` EXCLUDED from OOO-overlap** — only `outOfOffice` is absence. Integrator-owned Listener derivation change (drop `\|\| 'workingLocation'`) lands before/with the WS-B9B10 consumer build, so B9 receives only real-absence OOO. Wave-3 consumer work-orders authored: WS-B9B10 (OOO reoffer + accept/decline) + WS-B11 (stranded-booking). | Chris + Claude |
