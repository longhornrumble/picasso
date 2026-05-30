# Runbook — Synthetic Scheduling Test Fixture (`TEN-SCHED-FIXTURE`)

**What:** a read-only synthetic tenant seeded into the staging scheduling tables so the sub-phase **C/E integration tests** have stable, known data to read against. **No real tenant is touched.**

**Owns:** `scheduling/fixtures/seed-scheduling-fixture.{mjs,json}` + `scheduling/fixtures/teardown-scheduling-fixture.mjs`.
**Codes against:** [`FROZEN_CONTRACTS.md`](../FROZEN_CONTRACTS.md) §A (Booking / AppointmentType / RoutingPolicy schemas + Booking.status vocabulary) — LOCKED.

---

## The fixture (stable identifiers — reference these from tests)

**Tenant:** `TEN-SCHED-FIXTURE` (PK `tenantId` on every table).

| Table (logical → staging name) | SK attr | Row keys |
|---|---|---|
| `picasso-appointment-type-staging` | `appointment_type_id` | `appt_1to1_discovery_30` (format `one_to_one`, 30 min) · `appt_1to1_interview_60` (format `one_to_one`, 60 min) |
| `picasso-routing-policy-staging` | `routing_policy_id` | `rp_round_robin` (tie_breaker `round_robin`, `last_assigned_resource_id=res_maya`) · `rp_first_available` (tie_breaker `first_available`) |
| `picasso-booking-staging` | `booking_id` | `bk_fixture_001` · `bk_fixture_002` · `bk_fixture_003` (all `status=booked`) |

**Booking rows are shaped so both Booking GSIs return ranges:**

| booking_id | start_at | coordinator_email | resource_id |
|---|---|---|---|
| `bk_fixture_001` | `2026-06-03T14:00:00Z` | `maya.fixture@example.invalid` | `res_maya` |
| `bk_fixture_002` | `2026-06-04T16:00:00Z` | `alex.fixture@example.invalid` | `res_alex` |
| `bk_fixture_003` | `2026-06-05T18:00:00Z` | `maya.fixture@example.invalid` | `res_maya` |

- `tenantId-start_at-index` → querying `TEN-SCHED-FIXTURE` returns the 3 bookings ordered across Jun 3–5 (range result).
- `tenantId-coordinator_email-index` → `maya.fixture@example.invalid` returns 2 rows, `alex.fixture@example.invalid` returns 1 (per-coordinator ranges).

> All PII-shaped fields are fabricated: emails use the RFC-2606 reserved domain `example.invalid`; phones are non-routable `+1555…`. Nothing is deliverable or real. The fixture writes synthetic rows to the **already-inventoried** Booking table — it adds no new table/Lambda/S3-prefix, so no `pii-inventory.md` change is required (flagged for the integrator in the PR).

---

## How tests reference it (read-only)

Integration tests **read** the fixture; they never mutate it. Reference the tenant + keys above directly. Examples:

- **WS-EUI** (booking list/detail screens): render `TEN-SCHED-FIXTURE`'s 3 bookings; assert ordering via the `start_at` GSI.
- **C5 routing / C6 pool-at-commit**: load `rp_round_robin` / `rp_first_available` + the two appointment types to exercise both tie-breakers without writing.
- **B9 / B11** (OOO overlap, stranded-booking): query the Booking GSIs against the seeded `booked` rows (the fixture is the "seeded Booking rows" the plan's B9/B11 verify checks call for; C8's real write path re-tests later).
- Any test needing a coordinator with >1 booking uses `maya.fixture@example.invalid`.

**Rule:** if a test needs to *mutate* booking state, it must create its own throwaway row under a different `booking_id` and delete it itself — never edit `bk_fixture_00x`. Keeping the fixture read-only is what makes it shared and stable across parallel workstreams.

---

## Operator: seed / teardown (credential mutation — operator-gated)

The seed/teardown **write to staging DynamoDB** = a credential mutation. Per CLAUDE.md the workstream agent does **not** run these; the operator does, after `aws sso login`.

```bash
cd scheduling/fixtures
aws sso login --profile myrecruiter-staging
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

# Preview (no writes):
AWS_PROFILE=myrecruiter-staging node seed-scheduling-fixture.mjs --dry-run

# Apply (idempotent — re-running is a no-op):
AWS_PROFILE=myrecruiter-staging node seed-scheduling-fixture.mjs

# Remove all fixture rows:
AWS_PROFILE=myrecruiter-staging node teardown-scheduling-fixture.mjs
```

**Before first run, confirm the live table names** (the defaults below are env-overridable):

```bash
aws dynamodb list-tables --profile myrecruiter-staging \
  --query "TableNames[?contains(@,'booking')||contains(@,'appointment-type')||contains(@,'routing-policy')]"
```

If a name differs, override per invocation:

```bash
BOOKING_TABLE=... APPOINTMENT_TYPE_TABLE=... ROUTING_POLICY_TABLE=... \
AWS_PROFILE=myrecruiter-staging node seed-scheduling-fixture.mjs
```

**Env knobs:** `AWS_REGION` (default `us-east-1`), `FIXTURE_TENANT_ID` (default `TEN-SCHED-FIXTURE`; both scripts refuse any id not containing "fixture"), `BOOKING_TABLE`, `APPOINTMENT_TYPE_TABLE`, `ROUTING_POLICY_TABLE`.

**Idempotency:** the seeder uses `PutItem` with `ConditionExpression: attribute_not_exists(tenantId)` — an existing row reports `exists` and is left untouched. **No npm install** is needed (the scripts shell out to the AWS CLI; no SDK dependency).

---

## Verify (no AWS required)

```bash
node --check scheduling/fixtures/seed-scheduling-fixture.mjs
node --check scheduling/fixtures/teardown-scheduling-fixture.mjs
node -e "JSON.parse(require('fs').readFileSync('scheduling/fixtures/seed-scheduling-fixture.json','utf8')); console.log('json ok')"
node scheduling/fixtures/seed-scheduling-fixture.mjs --dry-run     # prints the 7-row plan, writes nothing
```

Post-seed sanity (operator, after apply):

```bash
aws dynamodb query --profile myrecruiter-staging --table-name picasso-booking-staging \
  --index-name tenantId-coordinator_email-index \
  --key-condition-expression "tenantId = :t AND coordinator_email = :c" \
  --expression-attribute-values '{":t":{"S":"TEN-SCHED-FIXTURE"},":c":{"S":"maya.fixture@example.invalid"}}' \
  --query "Count"   # expect 2
```
