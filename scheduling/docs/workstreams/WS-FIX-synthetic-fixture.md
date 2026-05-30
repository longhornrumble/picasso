# WS-FIX — Synthetic scheduling test fixture

**Plan task:** enabler for C/E integration tests (plan "Phase 3 testing" + C exit-criteria re-test of B9/B11). **Lever #5.**
**Repo / branch / base:** `picasso` · `feature/scheduling-ws-fix` · base `staging`.
**Quality gate:** `verify-before-commit` · weave audit = **light** (test infra, no prod surface).

## Goal / done-bar
- An **idempotent seed script** stands up a read-only synthetic tenant `TEN-SCHED-FIXTURE` in staging with: ≥2 `AppointmentType` rows (one `individual` format), ≥2 `RoutingPolicy` rows (one `round_robin`, one `first_available`), ≥3 `Booking` rows (`booked` status, varied `start_at`/`coordinator_email` so the `tenantId-start_at-index` + `tenantId-coordinator_email-index` GSIs return ranges). Tables already exist (C3/A8c).
- Re-running the script is a no-op (conditional writes). A **teardown** path deletes all `TEN-SCHED-FIXTURE` rows.
- A one-page runbook documents how every C/E integration test references the fixture (read-only).

## You OWN (create/edit ONLY these) — [proposed; integrator confirms in §4.0]
- `scheduling/fixtures/seed-scheduling-fixture.{mjs,json}` + a teardown script
- `scheduling/docs/runbooks/SCHEDULING_TEST_FIXTURE.md`

## You CONSUME (frozen — never modify; [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md) §A)
- Booking / AppointmentType / RoutingPolicy table schemas; Booking.status vocabulary.

## OUT OF SCOPE / do NOT
- Do NOT write to any real tenant. Use ONLY `TEN-SCHED-FIXTURE`. Do NOT touch shared docs/IaC — the seed is data, not infra.
- The actual staging seed-run is a **credential mutation** → operator-gated; deliver the script + runbook, the operator runs it (don't assume you can write to staging DDB unprompted).

## References
- Pattern precedent: the PII project's `picasso-pii-dsar-int-staging` fixture. Canonical §5.2 (Booking), §10 (RoutingPolicy). `CLAUDE.md` (credential-mutation gate, schema discipline).

## Report-back
- PR `feat(scheduling): WS-FIX synthetic test fixture` → staging. Snippet: a one-line plan note ("fixture available: TEN-SCHED-FIXTURE"). Tell the integrator the exact tenant id + row keys so other workstreams' tests can reference them.
