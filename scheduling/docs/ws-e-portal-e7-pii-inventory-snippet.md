# pii-inventory snippet — WS-E-PORTAL / §E7 bookings read API

**Status:** DELIVERABLE for the PII session to merge into
[`docs/roadmap/PII-Project/pii-inventory.md`](../../docs/roadmap/PII-Project/pii-inventory.md).
**Per CLAUDE.md the PII session owns `pii-inventory.md`; this snippet is the coordinated
hand-off (Living-Inventory PR Rule) — the integrator does NOT edit that file directly.**

Triggered by: **lambda#255** adds a new **read/egress surface** — `Analytics_Dashboard_API`
gains `GET /scheduling/bookings` (§E7), which **reads the `picasso-booking` table and returns
attendee PII (name/email/phone) to the dashboard client**. No new table, no new at-rest sink, no
write — it is a new *reader* of already-inventoried booking PII. (FROZEN_CONTRACTS §E7, ratified
2026-06-06 picasso#432.)

---

## 1. Processing surface — AMEND the existing `Analytics_Dashboard_API` row (§A Lambda table)

The current inventory row reads: *"`Analytics_Dashboard_API` — Reads analytics tables for the
dashboard UI — (no writes) — Read-path Lambda."* Proposed amendment to its **"PII handled
(transit)"** cell:

| Lambda | Runtime | PII handled (transit) | Writes to | Notes |
|---|---|---|---|---|
| `Analytics_Dashboard_API` | Python | analytics tables (existing) **+ NEW (§E7, lambda#255): reads `picasso-booking` and returns to the Clerk-authed dashboard client an attendee projection — `attendee.name` / `attendee.email` / `attendee.phone` (Tier 2) + `coordinator_email` (operator/coordinator-tier) + non-PII booking attrs**. PII transits in memory only; the response is the §E7 projection (a fixed allow-list — raw item attrs are NOT echoed). | (no writes) | Read-path Lambda. **§E7 minimization controls:** `tenant_id` from the authenticated session (never a param) → no cross-tenant read; `staff_self` returns only the viewer's own `coordinator_email` rows; `tenant_aggregate` (all coordinators, bounded ±90d) is **admin/super_admin only, server-enforced**; per-page Limit (cap 200); cursor server-validated to this tenant's partition. Error/success logs carry `redact_tenant_id` + scope + count only — **no attendee PII in logs**. IaC owed: `dynamodb:Query` grant on `picasso-booking` + the 2 GSIs on this Lambda's role (NEW grant). |

## 2. Storage surface — `picasso-booking` (NO change — new reader only)

`picasso-booking` (PK `tenantId` · SK `booking_id`; GSIs `tenantId-start_at-index`,
`tenantId-coordinator_email-index`) already holds `attendee_email` (Tier 2), `attendee_name`,
`attendee_phone` (Tier 2), `coordinator_email`, and is inventoried as the storage surface of
the calendar-consumer rows. **§E7 adds no attribute and no writer** — it adds one **read
accessor** (`Analytics_Dashboard_API` via §E7). The PII session may want to add
`Analytics_Dashboard_API (§E7)` to this row's **"Read access (coarse)"** / **"Who has read
access"** column.

## 3. Tier classification (per `data-classification.md`)

| Surface | Tier | One-line justification |
|---|---|---|
| `Analytics_Dashboard_API` §E7 read path | **2** | Egresses Tier-2 attendee phone + email (and coordinator email) to an authenticated dashboard client. No Tier-3 free-text/transcript content. The scoping controls (session-tenant, own-email for staff, admin-gate for aggregate, projection allow-list) are the minimization — this is a *new egress of existing Tier-2 PII*, not a new collection. |

## 4. Notes / open items flagged for the PII session (do not resolve unilaterally)

- **New egress, not new collection.** This is the first dashboard-client read path for booking
  attendee PII. The Scope/retention of `picasso-booking` itself is unchanged by this PR; §E7 is
  a consumer. If the PII session maintains a per-surface "who can read" matrix, add the §E7
  reader (scoped: staff = own coordinator rows; admin = tenant aggregate, bounded).
- **DSAR/delete:** §E7 is read-only and does not affect the delete pipeline; a subject delete on
  `picasso-booking` removes the attendee fields this endpoint would return. No new delete scope.
- **Deferred (operator decision, recorded in the §E7 weave audit):** a `scheduling_enabled`
  feature-flag gate on the endpoint (SR-3). No live PII risk today (the booking table is empty
  for non-scheduling tenants), so deferred — but if added it would be a second access control on
  this surface; note it if the PII session wants belt-and-suspenders gating.
