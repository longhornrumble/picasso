# WS-SCHED-FOUNDATIONS — (X) candidate-pool resolver + (Y) notification dispatch

> Integrator-authored work-order; read-only brief. The two foundational contracts multiple features need. Wave 4 (I6 + the X/Y contracts). Unblocks B9 reoffer + B11 reassign-roster + WS-CAL-LIFECYCLE notifies.

**Plan task(s):** the (X)/(Y) contracts surfaced by the B9/B10/B11 audit (escalations in lambda#195 + #194). Canonical §10.1/§10.2 (routing), §5.6/§12.1 (notifications), §5.1 (agent-of-CoR).
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-sched-foundations` · base `main`.
**Quality gate:** `verify-before-commit` (always) · weave audit = **full** (`/phase-completion-audit`) — auth/PII-bearing notification surface + a resolver multiple commit-path features depend on.

## Goal / done-bar (verifiable)

### (X) Candidate-pool resolver — `shared/scheduling/candidate-resolver.js`
A pure-ish resolver that turns a booking/tenant context into the candidate pool the existing `routing.evaluatePool` / `pool.select` already consume. Done when:
- `resolveCandidates({ tenantId, routingPolicyId | appointmentTypeId }, deps)` → returns `[{ resourceId, scheduling_tags, coordinatorEmail }]`:
  1. read `picasso-routing-policy-{env}` for the policy's `tag_conditions`,
  2. Query `picasso-employee-registry-v2-{env}` (PK `tenantId`) for employees that have `scheduling_tags`,
  3. map each to `{ resourceId, scheduling_tags, coordinatorEmail }` (confirm in §A how `resourceId` relates to `employeeId`/`email` — the registry has `employeeId`+`email`; the calendar/booking `resource_id` is the coordinator's calendar id = email; **resolve + document the mapping, do not guess**),
  4. the result feeds `routing.evaluatePool(candidates, tag_conditions, freeBusyByResource)` unchanged.
- Empty `tag_conditions` → every scheduling-tagged employee eligible (solo policy §10.3). DI-seam for the registry read (unit-testable without live DDB). **This is exactly the loader B11's `loadCandidates` seam + B9's reoffer need — both will consume it.**
- Tests: tag-match (AND semantics), empty-conditions, no-eligible, registry-pagination, malformed-employee tolerance.

### (Y) Notification dispatch — `shared/scheduling/notify.js` (+ wiring to the existing infra)
A single dispatch the scheduling consumers call to send a volunteer notice, honoring agent-of-CoR §5.1 (notify only when adding value beyond Google's native email). Done when:
- `dispatchVolunteerNotice({ kind, tenantId, booking, channels })` where `kind ∈ {reschedule_link, reoffer, cancel_notice, move_optin_sms}`:
  - routes to the existing **`send_email`** Lambda / **`notification_hub`** (use `notification_templates.json`) for email; opt-in SMS routes via the existing SMS path (sub-phase-E/SMS-twin — **stub `move_optin_sms` with `TODO(SMS-E)` if that path isn't reachable yet, and say so**).
  - compliance elements (reschedule link, STOP/unsubscribe) injected per §5.6/§12.1.
  - **agent-of-CoR guard:** `reassigned`/plain-`moved` do NOT call this (Google's email covers them); `cancel_notice`+`reoffer`+`reschedule_link` do.
- Tests: each `kind` builds the right payload; the agent-of-CoR guard; send-failure is non-fatal (best-effort, logged PII-redacted).

## You OWN (create/edit ONLY these)
- `shared/scheduling/candidate-resolver.js` + `shared/scheduling/notify.js` + their `__tests__/*.test.js` + any `package.json` dep additions in `shared/scheduling/`.

## You CONSUME (frozen — never modify)
- `shared/scheduling/routing.js` (`evaluatePool`, candidate shape `{resourceId, scheduling_tags}`) + `pool.js` — your resolver FEEDS these; do not change them.
- FROZEN_CONTRACTS §A (Booking, RoutingPolicy `tag_conditions`, employee-registry-v2 keys). The `send_email` Lambda + `notification_hub` + `notification_templates.json` interfaces (consume, don't modify).

## You PRODUCE (the contracts X + Y — they become FROZEN once merged)
- `resolveCandidates(...)` signature + the `{resourceId, scheduling_tags, coordinatorEmail}` candidate record (document for §B codification).
- `dispatchVolunteerNotice(...)` signature + the `kind` enum (document for §B codification). These are what B9 reoffer, B11 reassign, and WS-CAL-LIFECYCLE will wire to.

## OUT OF SCOPE / do NOT
- Do NOT wire these into B9/B11/CAL-LIFECYCLE yourself (those are separate re-tasks the integrator sequences after this merges) — just ship the two contracts + tests.
- Do NOT build the sub-phase-E reminder *scheduler* (T+24h/72h/7d cadence) — only the dispatch primitive. Stub the SMS path if unreachable.
- Do NOT modify `routing.js`/`pool.js` or any other Lambda/shared module. Escalate contract issues.

## References
- §10.1/§10.2 (routing/pool), §5.6 (notification structure), §12.1 (reminder cadence — for the dispatch shape, not the scheduler), §5.1 (agent-of-CoR); the B9/B11 PR escalations; `CLAUDE.md`.

## Report-back (in your PR)
- PR title `feat(scheduling): WS-SCHED-FOUNDATIONS candidate-resolver (X) + notify dispatch (Y)`, base `main`.
- Doc-snippet: the X + Y signatures for FROZEN_CONTRACTS §B; the resourceId↔employee mapping you resolved; the IAM verbs (registry Query + routing-policy GetItem + invoke send_email / publish notification_hub); any SMS-path stub. **Do not edit pii-inventory.md yourself** (notify.js handles attendee email/phone — flag it for the integrator's inventory row).
- Tell the integrator: branch, PR#, done-bar status, the SMS stub, any contract issue.
