# WS-E-CI6 — synthetic monitoring Lambda (CI-6)

**Plan task(s):** CI-6. [implementation plan](../scheduling_implementation_plan.md) §7; [CI strategy](../scheduling_ci_strategy.md) §5.1.
**Repo / branch / base:** `lambda` (+ `infra/` deploy-note) · `feature/scheduling-ws-e-ci6` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **full** (production-safety guard + it exercises the commit path). Primary agent: lambda-orchestrator + Backend-Engineer.
**⚠ LANDS LAST — gates sub-phase E exit.** It exercises the flows the other §E workstreams build; launch after they're merged + deployed on staging.

## Goal / done-bar (verifiable)
A synthetic monitor that runs five cycles continuously on staging, proving the E surface end-to-end so F's pre-flag-flip checklist can be satisfied.
1. **Five cycles:** cancel (hourly) · happy-path attendance (daily) · reminder cadence (daily) · missed-event disposition (daily) · token revocation (daily).
2. **Time-compression (per §E1, LOCKED at M0):** synthetic bookings are created with `is_synthetic=true` + `start_at = now + N_min` so the lead-time rules fire immediately. **DOUBLE-gated** (`STAGING_TEST_MODE && is_synthetic`) so real bookings are NEVER affected.
3. **Token-revocation cycle = MANUAL-TRIGGER** (per tech-lead): the operator revokes the OAuth grant via the Google console; CI-6 monitors for the `bookable:false` flip within 5min. Do NOT assume a Google-admin API to auto-revoke (the platform likely lacks it) — wire it as an operator-triggered step the monitor watches.
4. **HARD production-safety guard:** handler init **refuses to start** if `STAGING_TEST_MODE=true` AND the environment is `production`. One-line check at init.
5. **Nightly cleanup:** delete synthetic bookings (`is_synthetic=true`) older than 7 days (no `MYR384719` bloat).

- **Done-bar:** all five cycles green for 24+ hours continuous staging operation; alarms fire on a synthetic failure; nightly cleanup actually deletes >7d synthetic rows; **production-safety test:** handler init with `STAGING_TEST_MODE=true` + `ENVIRONMENT=production` fails fast with an explicit error.

## You OWN (create/edit ONLY these)
- the synthetic-monitor Lambda dir (the 5 cycles + the prod-guard + cleanup) + tests + a deploy-note for its EventBridge schedules/alarms (integrator applies IaC).

## You CONSUME (frozen — never modify)
- **§E1** (`is_synthetic` + time-compression + the prod-guard), **§E6** (`is_synthetic` Booking attr), the full booking/reminder/disposition/cancel/token flows the other §E + D workstreams expose, the §B16 propose/commit path.

## You PRODUCE
- The staging synthetic-monitor (F's pre-flag-flip evidence: ≥50 booked-and-confirmed, ≥5 DST-boundary reminders, token-revocation E2E).

## OUT OF SCOPE / do NOT
- Do NOT run `STAGING_TEST_MODE` logic in production — the init guard must refuse. Do NOT let `is_synthetic` affect real bookings (double-gate).
- Do NOT auto-revoke OAuth (no platform Google-admin API assumed) — the revocation cycle is operator-triggered + monitored.
- Do NOT build the flows it tests — CONSUME them.

## References
- Plan CI-6; CI strategy §5.1; FROZEN §E1/E6; `CLAUDE.md` (never `terraform apply` prod, staging-only). The prod-safety guard is mandatory (Security-Reviewer strategic).

## Report-back (in your PR)
- PR `feat(scheduling): WS-E-CI6 synthetic monitor (CI-6)` → main. **Flag for the full audit (prod-safety guard).**
- Doc-snippet: plan CI-6 status; the EventBridge schedules/alarms deploy-note; confirm the double-gate + the prod-init-refusal test + the manual-trigger revocation cycle.
- Branch, PR#, done-bar status, any contract issue (STOP + flag, don't fork).
