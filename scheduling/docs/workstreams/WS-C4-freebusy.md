# WS-C4 — FreeBusy availability source (§10.2)

**Plan task:** C4 — [plan](../scheduling_implementation_plan.md) row C4.
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-c4` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **medium** (external API + the tenant-prefixed cache key is a Security item — a security pass on the cache isolation).

## Goal / done-bar
- Concrete `FreeBusyAvailabilitySource` calling Google `freeBusy.query`; **60-second TTL cache**; an `invalidate()` hook the B2 listener calls on a calendar push.
- **Cross-tenant cache-isolation test:** the same coordinator email from two tenant contexts produces two distinct cache entries; tenant-A cannot read tenant-B's cached result. Cache key = `${tenantId}:${coordinatorId}:${windowBucket}` (Security P2 — non-negotiable).
- Unit tests + an integration test against the real Google API (mocks-alone insufficient per `feedback_testing_rigor`).

## You OWN (create/edit ONLY these) — [proposed; integrator confirms in §4.0]
- `shared/scheduling/availability.js` + `shared/scheduling/__tests__/availability.test.js`

## You CONSUME (frozen — never modify; [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md))
- Google OAuth via the existing per-`(tenantId, coordinatorId)` `oauth-client.js` pattern (no process cache, no wildcard secret). §A tables.

## You PRODUCE
- §B1 `getBusyIntervals({tenantId, resourceId, coordinatorId, windowStart, windowEnd}) → {busy[], cachedAt, source}` + `invalidate(tenantId, coordinatorId)`. **Honor this signature exactly** — C6 integrates against it.

## OUT OF SCOPE / do NOT
- Do NOT add a provider abstraction (concrete Google-only in v1, canonical §4.3). Do NOT touch the listener (the invalidation hook is a function the listener will call later; just export it). Per-tenant OAuth scope only — never key a secret by coordinator alone.

## References
- Canonical §4.3, §10.2; Security-Reviewer P2 (cache key) 2026-05-02. Plan C4. `CLAUDE.md`.

## Report-back
- PR `feat(scheduling): WS-C4 freeBusy availability source` → main. Snippet: plan C4 → 🟡/🟢 + cross-tenant-isolation test result. Confirm the produced signature matches §B1.
