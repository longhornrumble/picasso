# Scheduling v1 — Frozen Contracts (the seam between parallel workstreams)

**This is the seam.** Parallel workstreams ([PARALLEL_WORKSTREAMS.md](PARALLEL_WORKSTREAMS.md)) collide when one changes an interface another depends on. This registry locks those interfaces. **Workstream agents code AGAINST these; they NEVER redefine one.** A contract that is wrong or missing is **escalated to the integrator** — not forked.

Each entry names the **authoritative source** (canonical design § or an already-shipped artifact) so nothing here is invented — it is *cited and locked*. The canonical design is `scheduling/docs/scheduling_design.md`.

---

## A. Already frozen (shipped — do not touch)

These exist in code today; treat as immutable.

| Contract | Locked value | Authoritative source | Consumed by |
|---|---|---|---|
| **Booking table** | PK `tenantId` · SK `booking_id`; GSIs `tenantId-start_at-index`, `tenantId-coordinator_email-index`; PAY_PER_REQUEST; PITR | `infra/modules/ddb-booking/main.tf`; canonical §5.2 | C8 (writes), WS-EUI/B9/B10/B11 (read) |
| **AppointmentType table** | PK `tenantId` · SK `appointment_type_id` | `infra/modules/ddb-appointment-type/main.tf`; canonical §5.4/§18 | C5, C6, C8 |
| **RoutingPolicy table** | PK `tenantId` · SK `routing_policy_id`; round-robin state = `last_assigned_resource_id` + `last_assigned_at` (non-key) | `infra/modules/ddb-routing-policy/main.tf`; canonical §10.1/§10.2 | WS-C5, C6 |
| **ConversationSchedulingSession table** | PK `tenantId` · SK `session_id`; state machine state = non-key attr | `infra/modules/ddb-conversation-scheduling-session/main.tf`; canonical §9.2 | WS-C9 |
| **form_submissions session GSI** | `tenant-session-index` — hash `tenant_id`, range `session_id`, projection ALL | `infra/modules/ddb-form-submissions-staging/main.tf` (C1) | WS-C2 (query) |
| **Booking.status vocabulary** | `booked` · `canceled` · `completed` · `no_show` · `coordinator_no_show` (the ONLY 5; CI-3c locks them) | `shared/booking-status.js` (lambda repo); canonical §9.2/§11.2 | WS-C9, C8, WS-EUI |
| **Listener dispatch interface** | 7 typed `booking.*` events; platform ownership via `extendedProperties.private.booking_id`; SQS FIFO `MessageGroupId=event_id`; dedupe `(event_id, last_calendar_mutation_at)` | `scheduling/docs/listener_dispatch_interface.md` (B0/B2) | C8 (writes `booking_id` into the calendar event), B9/B10/B11 |
| **Booking → calendar-event ownership tag** | C8 MUST set `extendedProperties.private.booking_id = <Booking PK>` on every `events.insert` | `listener_dispatch_interface.md` "Delta Discovery" + §C8 | C8 (writes), B2 listener (reads) |

---

## B. To freeze BEFORE Wave 1 launch (integrator proposes; locks on launch)

These are NEW interfaces the parallel workstreams produce/consume. The signatures below are **derived from the canonical design** and proposed by the integrator. **The integrator confirms/locks each at launch**; once a Wave-1 session starts against it, it is frozen for that wave (changes ⇒ integrator coordinates a re-sync).

> Convention: Node 20 Lambda modules, CommonJS, async functions, plain-object returns (match the existing `Calendar_Watch_*` style). No new abstraction layers (canonical §4.3 "concrete-first").

### B1 — `AvailabilitySource` (produced by WS-C4, consumed by C6) — canonical §4.3/§10.2
```js
// Calendar availability behind a concrete source (v1 = Google freeBusy only).
// module: <BSH or a scheduling lib>/availability/freeBusyAvailabilitySource.js
async function getBusyIntervals({ tenantId, resourceId, coordinatorId, windowStart, windowEnd })
//   → { busy: [ { start: ISO8601, end: ISO8601 } ], cachedAt: ISO8601, source: 'google_freebusy' }
// - 60s TTL cache; cache key MUST be `${tenantId}:${coordinatorId}:${windowBucket}` (Security P2 — tenant-prefixed, no cross-tenant leak).
// - invalidate(tenantId, coordinatorId) hook called by the B2 listener on calendar push.
```

### B2 — `evaluatePool` (produced by WS-C5, consumed by C6) — canonical §10.1/§10.2
```js
// module: <scheduling lib>/routing/evaluatePool.js
async function evaluatePool({ tenantId, appointmentType, routingPolicy, candidates, freeBusyByResource })
//   → { ordered: [ resourceId, ... ], tieBreaker: 'round_robin'|'first_available', roundRobinCursor: <opaque> }
// - tag-condition eligibility filter → freeBusy intersection → tie-breaker (round_robin first, first_available fallback).
// - round-robin advance is a SEPARATE call committed only on booking success (C8); provide:
async function advanceRoundRobin({ tenantId, routingPolicyId, assignedResourceId })   // atomic UpdateItem
async function revertRoundRobin({ tenantId, routingPolicyId, previousResourceId, previousAt }) // compensating
```

### B3 — slot generation output (produced by WS-C7, consumed by C6 + WS-EUI) — canonical §9.3
```js
// module: <scheduling lib>/slots/generateSlots.js
function generateSlots({ busyIntervals, appointmentType, userTimeZone, alreadyRejected })
//   → [ { slotId, start: ISO8601, end: ISO8601, label: "Tue, Jun 3 · 2:00 PM", resourceId } ]  // 3–5 chips
// - user-timezone respect; DST spring-forward + fall-back safety; rejected-slot dedup. label is display-ready.
```

### B4 — token purpose enum (produced by WS-D1a, consumed by D consumers + CI-3d) — canonical §13
```js
// module: <scheduling lib>/tokens/purposes.js  — the SoT, mirrored signer/verifier (CI-3d contract test)
const TOKEN_PURPOSES = ['reschedule','cancel','attendance_confirm','attendance_yes','attendance_no','admin_disposition'];
// (confirm the exact 6 against canonical §13 at launch; one-time-use; HMAC-signed; per-purpose TTL.)
```

### B5 — form-injection context block (produced by WS-C2) — canonical §5.6
```
// C2 injects same-session form data into the Bedrock prompt as:
<user_application_context>
  ...sanitized field/value pairs (escape JSON, strip control chars, cap field lengths, reject structural-injection markers)...
</user_application_context>
// fetched via the tenant-session-index GSI (A); 4 §5.6 red-team cases must fail to compromise the prompt.
```

### B6 — `ConferenceProvider` (consumed by C8 — Wave 2; documented now so WS-C9/EUI know the shape) — canonical §5.2 item 4
```js
// interface: createConference(...) → { provider, conferenceId, joinUrl }; implementations:
// GoogleMeetProvider (conferenceData.createRequest.requestId idempotency) · ZoomProvider (read-before-write idempotency) · NullConferenceProvider (no-op synthetic ids).
```

---

## C. Contract-change protocol
1. A workstream that believes a contract is wrong/insufficient **stops and posts the issue to the integrator** (PR comment or status report) — it does NOT edit this file or fork the contract.
2. The integrator decides: amend the contract (and notify every consuming workstream) or hold.
3. Only the **integrator** edits this file. Each change is logged below.

## Change log
| Date | Change |
|---|---|
| 2026-05-30 | Created. §A frozen (shipped: 4 tables + C1 GSI + booking-status + dispatch-interface). §B proposed for Wave-1 lock (AvailabilitySource, evaluatePool, slot output, token purposes, form-injection block, ConferenceProvider). |
