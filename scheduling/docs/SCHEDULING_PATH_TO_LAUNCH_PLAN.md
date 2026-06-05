# Scheduling v1 — Path-to-Launch Plan

**Status:** v2 — tech-lead review incorporated (2026-06-05). Planning doc only — no code, no contracts locked.
**Authored:** 2026-06-05
**Sources:** `SCHEDULING_UX_DECISIONS.md` (D1–D8, LOCKED), `SUBPHASE_E_BUILD_PLAN.md`, `scheduling_implementation_plan.md` §7/§8, `PARALLEL_WORKSTREAMS.md`, `FROZEN_CONTRACTS.md`, `scheduling_ui_plan.md`.

---

## 1. Executive Summary

**What is left:** sub-phase E (17 tasks: reminders, missed-event escalation, Customer Portal UI, OAuth consent flow, CI-6 synthetic monitor) + cross-phase items unlocked by D1–D8 decisions (Surface-4 calendar fallback in B-remainder, C8 SMS branch, E13b Appointment Types + Teams CRUD) + sub-phase F (pilot prep + launch).

**Re-sized total:** ~22–30 effort-days. The original 20–28 day estimate was backend-heavy; ground-truth says the reminder backend is compressed (dispatch foundation shipped) but the UI/OAuth track grew by ~1.5 surfaces from D4/D5 decisions.

**Critical path in one sentence:** E11 (Calendar Connection OAuth consent flow) → E16 (Calendar embed) + E13b (Appointment Types + Teams CRUD) is the serial long pole; nothing on the reminder-backend track blocks launch, but E11 must be audited + merged before E16 can start and before the staff can self-onboard.

---

## 2. Scope

### 2a. In scope

| Track | Items |
|---|---|
| **Sub-phase E (17 tasks)** | E1a/E1b (`text_en`), E2/E4 (EventBridge reminder rule lifecycle), E3 (dispatch Lambda), E5 (attendance check rule), E6 (disposition tokens), E7 (LLM re-engagement copy), E8 (TCPA consent gate + lifecycle channel logic, widened by D7), E9 (reconciliation scan), E10 (missed-event escalation cadence), E11 (Calendar Connection OAuth consent flow + Secrets Manager + revocation, reframed by D2), E12 (My Bookings + nav wire + `/scheduling/bookings` API + admin overrides), E13 (Team scheduling settings extension), E14 (notification template overrides, un-deferred SMS variants by D7), E15 (scheduling analytics), E16 (calendar embed, depends on E11), CI-6 (synthetic monitor) |
| **E13b (new, from D4)** | Appointment Types + Teams CRUD in Customer Portal; maps 1:1 onto existing routing-policy engine with zero backend change |
| **C8 SMS branch (from D6/D7)** | Add consent-gated SMS branch to booking confirmation (`send_email` + `notify.js`); wired at C8 deploy time |
| **Surface-4 calendar fallback (from D5)** | B-remainder / §B16 extension: bounded derived-slot calendar pop when no conversational chips fit; NOT part of E |
| **F0 PII gate** | Unwaivable: full identity-graph deletion path operational before F1 prod flag-flip (Booking + form-submissions + notification-sends + sms-usage + Google Calendar event); already has a named owner (Chris) + a working P1 purge pipeline in staging |
| **Sub-phase F** | F1 pilot tenant config, F2 coordinator onboarding, F3 UAT, F4 smoke plan, F5 prod deploy, F6 rollback rehearsal, F7 monitoring, F8 runbook, F9 ops handoff, F10 retention TTLs |

### 2b. Out of scope (explicitly)

- V4 → V5.0 agentic migration (sub-phase G; separate sprint, own Phase 0 prerequisites)
- Prod cutover beyond F's gated flag-flip; never `terraform apply` prod during E
- Microsoft 365 calendar
- Multi-language / Spanish reminder templates (§15.5 deferred)
- AC #13 full coordinator-override surface (direct booking, blackout time, booking modification) — deferred to v1.1; v1 ships the two minimal admin-card actions from E12
- Panel / group appointment format (v2)
- Google app verification (operator-external, long-lead; deferred to Beta; Testing-mode covers the operator-tenant test — **DECISION Q3=YES, locked**)
- New super-admin Config Builder UI for Appointment Types or Teams (D8 decision: admin-first, Config Builder fallback writes same stores)
- D2 dual-key validator (§D deferred; not a gate for E or F)
- D5 failure-page polish, D8 post-application recovery flow (deferred to Wave D-2)
- Fix 108 red dashboard tests — **deferred to post-pilot / v1.1** (tracked item; see C4 note in §5)

---

## 3. Milestones

### M0 — Prerequisites (integrator, before any worker launches)

**Goal:** freeze the §E contracts, repair dashboard CI, confirm flag names, seed the kanban, and lock the `is_synthetic` / CI-6 time-compression mechanism. Without M0, workers code against a moving target and dashboard merges cannot be gated.

**Entry preconditions:**
- D1–D8 decisions locked (`SCHEDULING_UX_DECISIONS.md` approved)
- B-remainder (WS-NEWBOOK-PROPOSE, WS-C12, WS-NEWBOOK-FLOW) confirmed merged or in-flight; its status does not gate M0 but confirms the §B16 surface is not revisited

**Exit criteria (verifiable):**
1. `FROZEN_CONTRACTS.md` contains a new `§E` section covering: §E1 EventBridge rule naming + payload, §E2 reminder cadence tiers, §E3 TCPA consent gate shape, §E4 missed-event state machine, §E5 `text_en` write contract, §E6 Booking row additions (`is_synthetic`, reminder state flags), §E7 `/scheduling/bookings` API shape. Each contract cites an authoritative source.
2. Dashboard CI: `vitest` runner wired in `picasso-analytics-dashboard`; a `test` script exists in `package.json`; a GH Actions job runs it on PR; at least a smoke assertion passes (the existing 108 red tests do not need to be green to pass this gate — just the runner must exist and not crash on a passing test).
3. Flag names confirmed: `scheduling_enabled` (Flag A, super-admin entitlement) and `calendar_integration_enabled` (Flag B, tenant-admin org-level) locked per D1 open item O1.
4. Kanban §E wave block seeded in `PARALLEL_WORKSTREAMS.md` with one row per WS (WS-E-REMIND, WS-E-ATTEND, WS-E-TCPA, WS-E-COPY, WS-E-TEXTEN, WS-E-OAUTH, WS-E-PORTAL, WS-E-CI6) and the E13b row.
5. Surface-4 calendar fallback scheduled into the B-remainder thread as §B16c (open item O3 closed).
6. **CI-6 time-compression mechanism locked in §E6 contract (SR-3):** the approach is a synthetic booking with `start_at = now+N_min` so lead-time rules fire immediately, double-gated by `STAGING_TEST_MODE=true AND is_synthetic=true`. Real bookings are never affected. This ~20-line contract is frozen here so WS-E-CI6 cannot invent an incompatible approach at M6.

**Gate:** integrator review only; no phase-completion-audit required. Must complete before M1 workers launch.

**Risk:** The §E contract drafting is non-trivial — §E1 (EventBridge rule naming + payload) requires the integrator to confirm the exact `picasso-scheduled-messages` row shape `Scheduled_Message_Sender` already consumes, so the E2/E4 workers produce compatible inputs. A mistake here ships a broken reminder-dispatch that silently does nothing. Verify the existing `Scheduled_Message_Sender/index.mjs:107` consumer contract before locking §E1.

---

### M1 — Backend foundations (parallel build, file-disjoint)

**Goal:** ship the genuine new backend surfaces in parallel: EventBridge rule lifecycle, TCPA consent gate + channel logic, `text_en` plumbing, LLM copy, attendance check. These are the only truly new backend surfaces; everything else reuses shipped primitives.

**Entry preconditions:**
- M0 complete (§E contracts locked, kanban seeded)
- B-remainder new-booking flow confirmed at minimum MERGED (E2 writes reminder rules at booking commit — needs a live commit path to integrate against)

**Workstreams launched concurrently (file-disjoint):**

| WS | Tasks | Owns | Risk | Gate |
|---|---|---|---|---|
| WS-E-TEXTEN | E1a, E1b | `text_en` across BSH + Master_Function + analytics ingestion + dashboard read-path | MED (3-writer collision) | Light verify; **launch solo first before other lambda workers** (C2 gate — see §8) |
| WS-E-REMIND | E2, E4, E9 | New `Reminder_Scheduler/` dir + EventBridge rule lib (create/upsert/delete) + reconciler | MED | Light verify + integrator smoke |
| WS-E-TCPA | E8 | TCPA opt-in capture at booking end + quiet-hours gate + lifecycle channel-selection logic (D7 scope) | HIGH | Security-Reviewer + phase-completion-audit, no auto-merge |
| WS-E-COPY | E7 | LLM re-engagement prompt + programmatic compliance injection | MED | Data-AI-RAG + light audit (verify STOP/unsubscribe always present) |
| WS-E-ATTEND | E5, E6, E10, C13 | `Attendance_Check_*` + `Reminder_Dispatch` Lambda dirs; consumes D tokens (D4 stubbed `/attended/*`) | HIGH | Full adversarial audit (token + commit paths); E6 after E5 |

**Sequencing note — E3 dispatch Lambda (B1):** E3 is NOT concurrent with M1. E3 (reminder dispatch) merges **after** WS-E-TCPA ships the quiet-hours gate contract, because E3's SMS path invokes that gate. Until then, E3 integration tests must stub the quiet-hours gate and the work order must explicitly state: **"the quiet-hours path is untested until WS-E-TCPA merges; E3 + WS-E-TCPA integration is a separate M2 exit criterion."** See M2 for E3's formal exit criterion.

**Exit criteria:**
6. WS-E-TEXTEN: every conversation writer emits `text_en`; dashboard read-path falls back correctly on old-shape records; deployed in lockstep.
7. WS-E-REMIND: booking commit creates the correct EventBridge Scheduler rules; reschedule upserts; cancel deletes; orphan-fire safety test passes; reconciler finds the `(tenantId, start_at)` GSI and does not full-table-scan (named page-size + time-window bound, not open-ended); **a named test confirms that a `booking.calendar_moved` listener event causes reminder-rule re-derivation and re-binding to the new `start_at`** (this is the exact silent-failure class CI-6 is designed to catch; it must be validated at unit/seam level here, not left to CI-6 alone).
8. WS-E-TCPA: opt-in captured at booking end; consent record is self-contained (phone on record, TTL `now+4yr+30d`); quiet-hours gate drops SMS at 8pm–8am recipient-local; lifecycle channel logic matches D7 channel-selection spec; Security-Reviewer sign-off.
9. WS-E-COPY: all compliance elements (STOP, reschedule link, unsubscribe) present in every generated output; tone-snapshot test committed.
10. WS-E-ATTEND: E5 fires at `event_end + 30min`; E6 branches (completed / no_show / coordinator_no_show) each produce the correct `Booking.status` transition and outbound action; E10 cadence T+24h/72h/7d dispatches correctly; C13 Zoom T-15 page tested.

**Gate:** WS-E-TCPA + WS-E-ATTEND require full phase-completion-audit + operator go-ahead, no auto-merge.

---

### M2 — Dashboard CI repair + E3 dispatch Lambda

**Goal:** wire the reminder dispatch Lambda (E3, including its quiet-hours integration with WS-E-TCPA) and complete the dashboard CI repair that unblocks all UI merges. These run in parallel with M1; E3 merges after WS-E-TCPA lands (B1 sequencing constraint).

**Entry preconditions:**
- M0 complete.
- **E3 additionally requires WS-E-TCPA merged** (quiet-hours gate must be real, not stubbed, for E3's M2 exit criterion).

**Work:**
- **E3 (WS-E-REMIND extension):** Reminder dispatch Lambda; triggered by EventBridge Scheduler; reads current `Booking.start_at` at fire-time (never snapshot); invokes the real WS-E-TCPA quiet-hours gate; invokes `SMS_Sender` (consent-gated) + `send_email`.
- **Dashboard CI repair (integrator glue):** wire vitest runner + test script + GH Actions job. **This is a prerequisite for the M4 MERGE gate** — not just M4 entry. No portal merge-approval cycle may begin before CI repair lands. (The portal deploys directly to prod on merge; without CI, the operator-gated merge has no correctness signal.)

**Exit criteria:**
11. E3: reminder fires at the correct scheduled time; **quiet-hours drop path covered with the real gate (not a stub)**; integration test confirms SMS path skipped when not opted-in.
12. Dashboard CI: a PR to `picasso-analytics-dashboard` that includes a passing test gets a green CI run; a failing test fails CI. Verified by the integrator running a canary PR.

**Note — green CI as merge-gate, not correctness signal (C4):** with 108 red pre-existing tests remaining, a green CI run on a portal PR means only that no new failures were introduced — it does not confirm the changed surface is correct. The operator must read green-CI on portal PRs accordingly. The 108 red tests are a tracked post-pilot/v1.1 item (§2b).

**Gate:** Light verify for E3; dashboard CI repair is integrator-owned.

---

### M3 — OAuth consent flow (critical path, HIGH-risk, solo)

**Goal:** ship E11 — the interactive Google Calendar consent flow that enables staff to self-onboard. This is the phase's critical-path long pole. Nothing else on the UI track that touches calendar state (E16) can run until E11 is audited and merged. Without E11, the operator is the only path to onboarding coordinators (hand-provisioning, as today).

**Entry preconditions:**
- M0 complete (§E contracts locked)
- Dashboard CI repair from M2 complete (E11 is a dashboard + lambda PR; merges must be gated)
- Confirm A8 AdminEmployee `scheduling_tags` / `bookable` / `calendar_email_override` fields are deployed (E13 depends on them; E11 also writes `calendar_integration_enabled` flag transition)

**Workstream:** WS-E-OAUTH (solo, HIGH-risk)

**DECISION Q2 — E11 is split into two PRs (locked):**
- **Backend PR first** (credential path: redirect → code-exchange → secret-write → fire-B5). This PR goes to Security audit immediately; frontend build begins in parallel.
- **Frontend PR second** (Connected / Reconnect / Disconnect UI). Revocation seam stubbed in the backend PR (returns "connected") until the frontend ships and the seam is wired.
- This split lets the Security-Reviewer audit the credential-handling path without being blocked on frontend review.

Workstream owns: Calendar Connection UI (`/settings/calendar`); redirect handler on `staging.schedule.myrecruiter.ai` (existing D3 domain); `code`→`refresh_token` exchange via existing `oauth-client.js`; write secret to Secrets Manager at `picasso/scheduling/oauth/{tenantId}/{coordinatorId}` (per-coordinator, per D2); fire existing B5 onboarding (watch channel); mid-session revocation detection seam (no-op `freeBusy.query` on portal load); staff UI for Connected / Reconnect / Disconnect actions.

Does NOT own: `oauth-client.js` (already shipped), the B5 onboarding Lambda (already shipped). It calls them.

Consolidates the platform-owned Google OAuth app credentials out of per-coordinator secrets into one platform secret/env; the per-coordinator secret holds only `{ refresh_token, scopes, coordinator_email, calendar_id, connected_at }`.

**Exit criteria:**
13. Connect button → Google consent → redirect handler on `staging.schedule.myrecruiter.ai` → `code` exchange → `refresh_token` stored in Secrets Manager at the correct path; `aws secretsmanager describe-secret` returns the expected secret name.
14. Reconnect flow re-establishes a revoked token; Disconnect removes the secret and fires B6 Offboarder (watch channel teardown).
15. Mid-session revocation: manually revoke the OAuth grant, reload the portal; staff sees Disconnected state within 5 minutes; email sent to staff member; `bookable: false` set. **Named unit test distinguishes `401 invalid_grant` (→ flip Disconnected + bookable:false) from transient `5xx` (→ log, serve stale Connected state, do NOT flip bookable:false).** This distinction must be a named test case — not prose — in the work order (C1).
16. Security-Reviewer sign-off: per-tenant IAM scope (`picasso/scheduling/oauth/{tenantId}/*`), CSRF-signed `state` parameter, no OAuth credentials in logs, redirect-URI allowlist, scope minimization (`calendar.events` + free/busy; avoid full `calendar`).
17. PII Living-Inventory Rule: E11 adds the OAuth refresh-token surface to `pii-inventory.md`; update coordinated with PII session before merge.

**Gate:** Full phase-completion-audit, Security-Reviewer mandatory, operator go-ahead, no auto-merge. This is the highest-risk merge in E.

---

### M4 — Customer Portal UI surfaces (operator-gated merges)

**Goal:** ship E12 (My Bookings), E13 (Team settings extension), E13b (Appointment Types + Teams CRUD), E14 (notification template overrides), E15 (scheduling analytics). These are the operational surfaces tenant admins need to self-serve the pilot.

**Entry preconditions:**
- M0 complete (§E contracts locked, including §E7 `/scheduling/bookings` API contract)
- **M2 complete (dashboard CI repair — this is a hard prerequisite for the M4 merge gate, not just entry).** No portal merge-approval cycle begins before CI repair lands. The portal deploys directly to prod on merge; without CI the operator-gated merge has no correctness signal (no staging buffer exists).
- **F0 PII coordination checkpoint (SR-2, integrator-owned calendar task):** at M4 entry (or mid-M4 at the latest), the integrator must confirm the PII session's prod-promotion of the purge pipeline is on track. This checkpoint exists because discovering a PII slip at M6 entry leaves no runway — only the CI-6 soak window — before F. M4 entry gives 8–14 elapsed days to unblock. See §8 owners for the named trigger.
- Confirm A8 AdminEmployee fields are deployed (E13 dependency)
- E13b sequence: after A8 confirmed, do not run concurrently with other `TeamManagement.tsx` edits (1,400-line file collision risk)
- E13b does NOT require M3 (E11); it writes AppointmentType + RoutingPolicy DDB tables, which have zero dependency on OAuth
- **C2 gate (integrator-owned):** do NOT hand out WS-E-REMIND / WS-E-TCPA / WS-E-COPY / WS-E-ATTEND work orders until WS-E-TEXTEN's PR is open and no-collision is confirmed. This constraint applies to M1 launches and is restated here for portal work order sequencing.

**Workstream:** WS-E-PORTAL (one session, because the portal files overlap)
- **E12 nav-wire + `/scheduling/bookings` endpoint + admin overrides:** nav wire into `App.tsx`; integrator builds the `Analytics_Dashboard_API` endpoint (§E7 contract); E12 adds the cancel-on-behalf and trigger-reschedule-link admin-card actions.
- **E13 team-settings extension:** bookable toggle, scheduling_tags chip editor, calendar_email_override field, "not on any team" warning, "calendar required" warning. Admin-only for other staff; self-service own record.
- **E13b Appointment Types + Teams CRUD (new from D4):** admin creates Teams (friendly name → `scheduling_tag`), assigns staff to teams, creates Appointment Types (name + duration + which team handles it). Writes `AppointmentType` + `RoutingPolicy` DDB tables directly. Under the hood maps exactly to the shipped `resolveCandidates`/`evaluatePool`/`pool.select` routing engine; the word "tag" never surfaces to the admin. No super-admin UI built (D8 decision). **Sizing note (SR-1): a 4-hour M0 spike counting actual UI states from the existing `TeamManagement.tsx` pattern is acceptable before issuing the E13b work order.** The current 4–6 day estimate (revised from 2–3) reflects empty-state, loading, error, membership-diff, and confirmation UX states. **`modified_at` (timestamp + last-modifier) is a named exit-criterion field on `AppointmentType`/`RoutingPolicy` rows** — additive, forward-compatible, surfaced in both the tenant-admin UI and Config Builder. This resolves the dual-write last-write-wins hazard and is ~30 min of work, not a v1.1 item.
- **E14 notification template overrides:** existing template UI extended; SMS variant per moment (D7 un-deferred).
- **E15 scheduling analytics:** connects the orphaned `SchedulingAnalytics.tsx` render-slice (dash#5, already shipped) to the real `/scheduling/bookings` + metrics APIs.

**Exit criteria:**
18. E12: My Bookings list renders; filter chips and status filters work; admin-only cancel-on-behalf fires `events.delete` + listener status transition; admin trigger-reschedule generates a fresh `reschedule` token and emails the volunteer; permissions enforced (only admin role sees these buttons).
19. E13: bookable toggle, tag editor, and override field persist; "not on any team" warning fires when bookable=true but no team assigned; "calendar required" warning fires when bookable=true but no E11 connection.
20. E13b: a tenant admin can create a Team, assign staff to it, create an Appointment Type pointing to that team; the routing engine's `evaluatePool` returns the correct pool for that AppointmentType without any backend change; the CRUD surfaces write the same `AppointmentType`/`RoutingPolicy` DDB schema as the existing engine expects; **`modified_at` field present on every create/update and surfaced in the UI (both tenant-admin portal and Config Builder write path).**
21. E14: tenant can edit confirmation, reminder, cancellation, re-engagement templates including SMS copy; substitution variables render correctly; defaults restore on clear.
22. E15: scheduling analytics render correctly for both admin and staff views; staff cannot see other-staff data.

**Gate:** Every portal merge is operator-gated (dashboard deploys straight to prod on merge — no staging buffer). Low-risk surfaces get light verify + operator approval; HIGH-risk designation is the merge-to-prod risk, not code risk. Batch merges by logical surface if they can be reviewed atomically.

**Surface-4 ordering note (C5):** E13b can configure Appointment Types whose end-user booking fallback (Surface-4 calendar) may not be live yet. F3 UAT must not test the full booking flow for a newly-created Appointment Type until Surface-4 is confirmed live. This constraint is noted in M7/F3 sequencing.

---

### M5 — E16 Calendar embed (depends on M3)

**Goal:** Ship the read-only Google Calendar iframe embed for staff. Straightforward once E11 credentials are available.

**Entry preconditions:** M3 complete (E11 merged; OAuth credentials available for the embed auth).

**Exit criteria:**
23. Calendar iframe renders staff member's primary calendar in week view; "Open in Google Calendar" opens new tab; permissions enforced (own calendar only); no raw token exposed in client-side JS.

**Gate:** Light verify + operator-gated merge (portal deploy risk).

---

### M6 — CI-6 synthetic monitor (last)

**Goal:** Ship the synthetic monitor that continuously exercises the full scheduling stack in staging. This is the sub-phase E exit gate; F cannot start until CI-6 has been green for 24+ continuous hours.

**Entry preconditions:** M1/M2 backends complete (reminder dispatch, attendance check); E11 merged (OAuth path exercised); `is_synthetic` booking flag and time-compression approach confirmed in §E6 contract (locked at M0 — SR-3).

**Workstream:** WS-E-CI6
- Five cycles: cancel (hourly), happy-path attendance (daily), reminder cadence with `STAGING_TEST_MODE` time-window compression (daily — using `start_at = now+N_min` double-gated by `STAGING_TEST_MODE=true AND is_synthetic=true`, as locked in §E6), missed-event disposition (daily), **token revocation (manual-trigger step: operator revokes via Google console, CI monitors for `bookable:false` flip within 5 min — NOT fully automated, per Q7 decision).**
- Nightly cleanup of synthetic bookings older than 7 days.
- **Hard production guard:** handler init refuses to start if `STAGING_TEST_MODE=true` AND `ENVIRONMENT=production`.

**Exit criteria:**
24. All five cycles green for 24+ continuous hours in staging; alarms fire on synthetic failures; nightly cleanup deletes old synthetic rows; production-guard test passes (handler init with `STAGING_TEST_MODE=true` + `ENVIRONMENT=production` fails fast with an explicit error, never reaches booking logic).

**Gate:** Integrator review; the production-guard test is the one non-negotiable.

**Over-engineering check:** CI-6 is the one task most at risk of scope creep. The 5 cycles are the minimum spec. Resist adding "extended" scenarios beyond them until the 5 are green. ~1 week of focused work is the honest estimate; don't compress it.

---

### M7 — Sub-phase F (pilot prep + launch, gated by M6 + F0)

**Goal:** Prepare and execute the production launch for the pilot tenant.

**Entry preconditions:**
- M6 complete (CI-6 green 24+ hours; sub-phase E phase-completion-audit approved)
- **F0 HARD GATE:** Full identity-graph deletion path operational and verified (Booking + form-submissions + notification-sends + sms-usage + Google Calendar event purge). The PII P1 purge pipeline is built and deployed to staging (as of 2026-06-03); F0 requires it to be production-promoted and end-to-end verified against a seeded test identity. F1 does not start until F0 sign-off is recorded in `scheduling/docs/f0_pii_remediation_gate_<date>.md`. This gate cannot be waived. **(PII coordination checkpoint established at M4 entry — see §8.)**
- Pilot tenant coordinators' Google OAuth provisioned (E11 flow run for real coordinators in staging; B3 Renewer live + at least one successful channel renewal observed)
- Google app verification status confirmed: **DECISION Q3=YES (locked) — Testing-mode for the operator-tenant MYR384719 is acceptable for v1 pilot; Google verification deferred to Beta.** Start the verification submission at Beta entry (operator-external, long-lead — see Risk R1).

**Tasks (sequential):** F1 (tenant config) → F2 (coordinator onboarding; B3 live gate) → F3 (UAT, written sign-off) → F4 (smoke-test plan) → F5 (prod deploy; mid-week only) → F6 (rollback rehearsal) → F7 (monitoring confirmed) → F8 (runbook) → F9 (ops handoff) → F10 (retention TTLs).

**F2 named step (Q3 decision):** the coordinator onboarding script must include an explicit expectation-set: "you will need to reconnect your Google Calendar weekly during the pilot period (Testing-mode 7-day token expiry)." This is a required named step, not a footnote.

**F3 sequencing note (C5):** UAT must not test the full booking flow for a newly-created Appointment Type until Surface-4 (calendar fallback) is confirmed live in the pilot environment.

**Exit criteria:**
25. F0 gate documented with synthetic-volunteer purge verified across all 5 stores.
26. Pilot coordinator's watch channels active in production DDB; B3 Renewer has renewed at least one channel before F2 runs against any real coordinator.
27. Written UAT sign-off from pilot stakeholder on all canonical §21 scenarios.
28. Production smoke tests (5 scenarios) pass post-deploy.
29. Rollback to `scheduling_enabled: false` tested in staging and confirmed to preserve existing calendar events.
30. All three CloudWatch scheduling alarms fire correctly in production.
31. CI-6 green in staging for the full F-phase soak window (continuous, not just at M6).

**Gate:** Pre-deployment Security-Reviewer final pass (full scope A–E). Tech-lead sign-off on phase-completion-audit.

---

## 4. Dependency Graph + Critical Path

```
M0 (contracts + CI repair + §E6 is_synthetic contract locked)
 │
 ├──▶ M1 (parallel backends) ──────────────────────────────┐
 │     WS-E-TEXTEN (solo/first; C2 gate before others)      │
 │     WS-E-REMIND + WS-E-TCPA + WS-E-COPY concurrent      │
 │     WS-E-ATTEND (after E5 lands in REMIND)               │
 │                                                          │
 ├──▶ M2 (E3 dispatch [after WS-E-TCPA] + CI repair) ────── ┤
 │     ▲ CI repair is M4 MERGE prerequisite (not just entry)│
 │                                                          │
 ├──▶ M3 (E11 OAuth — CRITICAL PATH, solo, HIGH-risk) ──────┼──▶ M5 (E16 embed)
 │     Backend PR → Security audit; Frontend PR parallel    │
 │     (blocks E16 only)                                    │
 │                                                          │
 ├──▶ M4 (portal UI — operator-gated) ────────────────────┤
 │     Requires M2 CI repair to MERGE (not just enter)      │
 │     F0 PII checkpoint at M4 entry (integrator calendar)  │
 │     E12/E13/E13b/E14/E15 (E13b after A8 confirmed)       │
 │     E13b has zero backend dependency — runs parallel      │
 │                                                          │
 └──(M1+M2+M3+M4+M5 complete)──▶ M6 (CI-6) ──▶ M7 (F)
```

**The critical path is:** M0 → M3 (E11) → [E11 backend audit + merge → frontend PR] → M5 (E16) → M6 (CI-6) → M7 (F).

**Not the critical path:** the reminder-backend track (M1/M2). Those are important but file-disjoint and can run in parallel with E11 development. If E11 slips, the reminder backend waits at CI-6; the reverse is not true.

**E13b is not on the critical path** but is on the UAT path — the pilot tenant needs to be able to configure teams and appointment types before F3 UAT. Plan for E13b to land before F3, not before M6.

**B1 serial constraint (explicitly annotated):** E3 (reminder dispatch) → must merge AFTER WS-E-TCPA ships the quiet-hours gate. M2 CI repair → must land BEFORE the M4 merge gate opens. Both edges are explicit prerequisites, not soft sequencing preferences.

---

## 5. Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| **R1** | Google app verification lead time for Beta (sensitive scope = multi-tenant production requires "In production" status; review can take weeks to months) | HIGH (external process, not under our control) | HIGH (blocks real-tenant staff from completing the E11 consent flow in production; Testing-mode covers the operator-tenant only — Q3=YES, locked) | Start the verification submission the moment the first Beta tenant is confirmed. Do not wait until Beta entry day. Assign a dedicated operator calendar reminder at F3 UAT sign-off. Prototype the UX in Testing-mode; functional parity at launch. Note: Testing-mode tokens expire in 7 days — coordinators reconnect weekly during pilot (named F2 step). | Operator (Chris) — external |
| **R2** | Dashboard no-staging-buffer prod-exposure (portal merges deploy directly to prod on merge; a bad merge affects live production users, not just staging) | MED (each portal merge is low-risk individually but the constraint never goes away) | HIGH (any portal regression is an immediate prod incident) | M2 must repair dashboard CI **before the M4 merge gate opens** (hard prerequisite, B2). All portal merges are operator-gated — no auto-merge even on green CI. Note: green CI is a merge-gate signal only, not a correctness signal, while 108 red tests remain (C4). Batch merges by logical surface for minimal blast radius. | Integrator + operator |
| **R3** | TCPA compliance scope (E8 widened by D7 now covers the entire lifecycle, not just reminders; a gap in opt-in capture, STOP handling, or consent-record self-containment exposes to regulatory risk) | LOW (the infra is correct; the risk is implementation gaps in E8) | CRITICAL (regulatory, not technical) | Mandatory Security-Reviewer pass on WS-E-TCPA; phase-completion-audit no auto-merge; consent record must be self-contained (phone + TTL `now+4yr+30d` verified on every write); STOP/HELP on every outbound message verified by the synthetic monitor CI-6. | Security-Reviewer + integrator |
| **R4** | E13b scope creep (Appointment Types + Teams CRUD is "pattern-following" per D4 but the Customer Portal admin pattern is complex; a builder who doesn't read the existing routing engine may add unnecessary abstraction or invent a new schema instead of writing to the shipped tables) | MED | MED (extra build time; possible schema divergence that breaks `evaluatePool`) | Work order for E13b must explicitly cite the `AppointmentType` + `RoutingPolicy` DDB schemas from `FROZEN_CONTRACTS.md §A` as the write target. The CRUD surfaces MUST produce rows that `evaluatePool` (lambda#183) can consume without modification. Acceptance test: create an AppointmentType + RoutingPolicy via the new UI, then call the existing `evaluatePool` function with that data and confirm it routes correctly. `modified_at` field added as a named exit criterion (SR-1) — resolves dual-write hazard without a separate v1.1 ticket. | Integrator (locks the E13b work order to the frozen schema) |
| **R5** | EventBridge rule lifecycle new surface (nobody creates Scheduler rules today; `Scheduled_Message_Sender` only consumes them; the rule-create/upsert/delete surface is genuinely new and has per-account quota implications) | LOW (quota is generous at pilot scale; rule naming bugs are the real risk) | MED (orphan rules accumulate silently; duplicate reminders fire on reschedule if upsert is wrong) | Deterministic naming (`reminder-{tier}-{booking_id}`, `attendance-check-{booking_id}`) locked in §E1 before workers launch. Reconciler (E9) explicitly handles EventBridge cleanup for terminal-state bookings older than 7 days. CI-6 exercises the upsert path on every reschedule cycle. **Real limits (C3):** EventBridge Scheduler quota ~1M rules/account; create rate limit ~200 CreateSchedule/sec; at ~5 rules/booking with BCH reserved-concurrency 5 → ~25 calls/sec, well within quota at pilot scale. Reconciler GSI query is bounded by a named page-size + time-window (not a full-table-scan) — locked in §E1 contract at M0. | Integrator (§E1 contract) + WS-E-REMIND |
| **R6** | F0 PII gate slipping F1 (the per-tenant purge pipeline is deployed to staging but not yet production-promoted; F1 cannot start until the full 5-store purge is verified in prod) | MED (the code is built and soak-validated; the gap is the prod promotion + a verified test run) | HIGH (F0 is an unwaivable gate; slipping it delays the pilot) | **F0 coordination checkpoint moved to M4 entry (SR-2, integrator-owned calendar task — see §8).** M4 entry gives 8–14 elapsed days of runway to surface and unblock a PII slip before CI-6 starts. Raising this at M6 entry leaves only the CI-6 soak window as runway — insufficient. | PII session (code) + operator (verification sign-off) + integrator (checkpoint at M4 entry) |
| **R7** | E11 OAuth mid-session revocation detection false positives (the no-op `freeBusy.query` on every portal load could mark a coordinator as disconnected due to a transient Google API error, causing unnecessary `bookable:false` flips) | LOW | MED (coordinator wrongly marked unavailable, potentially missing bookings until they reconnect) | **The revocation gate MUST distinguish `401 invalid_grant` (→ flip Disconnected + bookable:false) from transient `5xx` (→ log, serve stale Connected state, do NOT flip).** This distinction is a named unit test in the E11 work order (C1) — not prose. See exit criterion 15. | WS-E-OAUTH + Security-Reviewer |
| **R8** | A8 AdminEmployee field dependency for E13 (E13 extends `TeamManagement.tsx` and depends on `scheduling_tags` / `bookable` / `calendar_email_override` fields being deployed; if A8 is not confirmed live, E13 is blocked) | LOW (A8 appears to be deployed; confirmation is an M0 check) | MED (E13 is on a near-critical path for UAT) | M0 exit criterion: confirm A8 AdminEmployee scheduling fields are live in staging before seeding the E13 work order. If not, A8 becomes M0 blocking work. | Integrator (M0 verification) |

---

## 6. Sizing and Timeline

**Assumptions:** parallel-workstreams model (1 integrator + 3–4 workers); backend workers run 6–8 hours/day focused; portal merges are operator-gated so they add elapsed time even when ready. The critical-path constraint is E11 development + audit, not raw worker throughput.

| Milestone | Effort (worker-days) | Wall-clock (parallel model) | Notes |
|---|---|---|---|
| M0 (prerequisites) | 1–2 (integrator) | 1–2 days | Contract drafting is the long task; §E1 needs care; §E6 is_synthetic contract locked here |
| M1 (parallel backends) | 8–12 total across 4–5 workers | 3–5 days elapsed | WS-E-TEXTEN solo first (1 day); then concurrent; WS-E-ATTEND must wait for E5 complete |
| M2 (E3 + CI repair) | 2–4 | 1–2 days (runs in parallel with M1; E3 merges after WS-E-TCPA) | CI repair is 2–4 hours; E3 is 1 day; E3 waits on WS-E-TCPA quiet-hours gate |
| M3 (E11 OAuth) | 4–6 (solo; split into backend + frontend PRs) | 5–8 days elapsed | Extra elapsed time is audit cycle; backend PR goes to Security audit while frontend builds |
| M4 (portal UI) | 8–12 total | 5–8 days elapsed | Operator-gated merges add elapsed time; **E13b is 4–6 days** (revised from 2–3; SR-1); E12 is 2–3 days; E13/E14/E15 are 1–2 each |
| M5 (E16 embed) | 1–2 | 1–2 days (after M3) | Straightforward once auth is available |
| M6 (CI-6) | 5–7 (solo) | 5–7 days | Realistic; do not compress; 24-hour green soak adds elapsed time |
| M7 (sub-phase F) | 4–7 | 5–8 days elapsed | F0 gate + UAT sign-off are the elapsed-time drivers, not build work |
| **Total** | **~33–52 worker-days** | **~22–30 elapsed days (parallel model)** | **Range reflects audit cycle uncertainty on E11 and F0 gate timing** |

**The UI track grew vs. the SUBPHASE_E_BUILD_PLAN baseline** (E13b + Surface-4 calendar add ~3–5 effort-days; E13b re-sized to 4–6 days from 2–3). The reminder backend shrank (foundation shipped). The net is roughly flat in total effort but the critical path is now solidly the UI/OAuth track, not the reminder backend.

**Honest caveat:** the 22–30 elapsed day estimate assumes M3 (E11) takes 5–8 days including the audit cycle and operator approval. If the Security-Reviewer is unavailable or the audit finds a blocker, this milestone alone can slip by a week. That is the single highest-variance item in the estimate.

---

## 7. Sequencing and Launch Order

**Sequential gates (must respect):**
1. M0 → all other milestones (contract and CI gate)
2. A8 AdminEmployee fields confirmed → E13 work order (M4)
3. E5 complete → E6 (token-redemption + disposition; attendance trigger is E6's input)
4. E11 merged + audited → E16 (OAuth credentials required)
5. WS-E-TEXTEN solo → then all other lambda workers (3-writer collision prevention; C2 integrator gate)
6. **WS-E-TCPA merged → E3 dispatch Lambda merges** (quiet-hours gate must be real at E3 merge, not stubbed — B1)
7. **M2 CI repair complete → M4 merge gate opens** (no portal merge-approval cycle before CI repair — B2)
8. M1 + M2 + M3 + M4 + M5 all complete → M6 (CI-6 exercises the full stack)
9. M6 green 24+ hours → M7 (F-phase)
10. **F0 PII coordination checkpoint at M4 entry** (integrator-owned calendar task — SR-2)
11. F0 PII gate satisfied → F1 (prod flag-flip)
12. B3 Renewer live + at least one renewal observed → F2 (coordinator onboarding)

**Concurrent tracks (safe):**
- M1 workers are file-disjoint and can all run after WS-E-TEXTEN completes
- M2, M3, M4 can all run in parallel after M0; M4's E13b has zero dependency on M3
- Surface-4 calendar fallback (B-remainder §B16c) runs independently on the B-remainder track and does not block any E milestone
- E11 backend PR goes to Security audit while E11 frontend PR is being built

**What to do first (solo):**
1. M0 integrator setup — do not skip or compress
2. WS-E-TEXTEN (shared-writer collision is the one thing that must not run concurrently)

**What to do concurrently once M0 is done:**
- WS-E-REMIND + WS-E-TCPA + WS-E-COPY (file-disjoint lambda workers)
- WS-E-OAUTH (E11 solo, but launch it the same day — it is the long pole)
- Dashboard CI repair (integrator glue, unblocks portal merge gate)

**What to do last:** CI-6 (it exercises everything else); do not attempt CI-6 until all backend surfaces are merged.

---

## 8. Owners

| Role | Responsible for | Notes |
|---|---|---|
| **Integrator** | M0 contract locks; kanban management; weaving PRs in dep order; phase-completion-audits at weave time; shared docs (FROZEN_CONTRACTS, PARALLEL_WORKSTREAMS, pii-inventory); staging→main drift cap; Surface-4 scheduling into B-remainder; **C2 gate: hold all other lambda work orders until WS-E-TEXTEN PR is open and no-collision confirmed; F0 PII coordination checkpoint at M4 entry (named calendar task: confirm PII session prod-promotion on track before M4 merge gate opens)** | Single session; owns the seam |
| **WS-E-TEXTEN worker** | E1a + E1b (`text_en` writers + dashboard read-path); deployed in lockstep | Launch solo first |
| **WS-E-REMIND worker** | E2, E4, E9 (EventBridge rule create/upsert/delete + reconciler); **named test: `booking.calendar_moved` causes reminder re-derivation + re-bind to new `start_at`** | |
| **WS-E-TCPA worker** | E8 (opt-in + quiet-hours + lifecycle channel logic) | HIGH-risk; Security-Reviewer required |
| **WS-E-ATTEND worker** | E5, E6, E10, C13 (attendance check + disposition + escalation cadence) | HIGH-risk; E6 after E5 |
| **WS-E-COPY worker** | E7 (LLM re-engagement copy) | Data-AI-RAG agent |
| **WS-E-OAUTH worker** | E11 (Calendar Connection consent flow) — **split: backend PR first (to Security audit), frontend PR second; `401 vs 5xx` revocation distinction is a named unit test** | HIGH-risk; solo; Security-Reviewer + phase-completion-audit; PII session coordination at build |
| **WS-E-PORTAL worker** | E12, E13, E13b, E14, E15, E16 (all Customer Portal surfaces); **E13b includes `modified_at` as a named exit criterion** | Operator-gated merges; E13b separate work order from E13 to manage collision risk |
| **WS-E-CI6 worker** | CI-6 (synthetic monitor); **token-revocation cycle = manual-trigger step (operator revokes via Google console, monitor watches for `bookable:false` flip within 5 min)** | Last; integrator may own directly |
| **Integrator glue** | E3 dispatch Lambda (merges after WS-E-TCPA); `/scheduling/bookings` API endpoint; `App.tsx` nav wire; EventBridge IAM grants; E11 redirect handler on D3 domain; per-secret IAM module | These cross ownership boundaries — integrator builds, not a worker |
| **Operator (Chris)** | M0 flag-name confirmation (O1); Surface-4 scheduling into B-remainder (O3); portal merge approvals; Google app verification submission at Beta; F3 UAT facilitation; F5 prod deploy; F0 PII verification sign-off; **token-revocation CI-6 manual step (revoke via Google console on cue)** | Operator-external tasks cannot be delegated |
| **PII Governance session** | F0 gate: prod-promotion of the P1 purge pipeline + end-to-end verification; pii-inventory coordination on E8 (TCPA consent) and E11 (OAuth refresh tokens) at build time; **must signal on-track status to integrator at M4 entry** | Separate session; coordinate, do not merge-conflict |
| **Security-Reviewer** | WS-E-TCPA, WS-E-ATTEND (E6), WS-E-OAUTH (E11 backend PR first), WS-E-COPY (E7 compliance injection), final F-phase pre-deployment pass | Required for the HIGH-risk gates; cannot be skipped |

---

## 9. Open Questions

The following tech-lead questions have been resolved and are now decisions:

**DECISION Q2 (locked):** E11 split into backend PR (credential path: redirect→code-exchange→secret-write→fire-B5) then frontend PR. Backend PR to Security audit while frontend builds. Revocation seam stubbed in backend until frontend ships. See M3 workstream.

**DECISION Q3 (locked, operator-confirmed):** Testing-mode stands for the v1 pilot; Google verification deferred to Beta. Coordinators reconnect weekly — named as an explicit F2 onboarding step. See §2b out-of-scope and M7 F2 step.

**DECISION Q4 (locked):** Operator-gated merge is the gate. Accept that portal work ships straight to prod and focus review energy on pre-merge verification. No staging-flag workaround. CI is merge-gate-only signal while 108 red tests remain — operator reads green CI accordingly. 108 red tests fixed post-pilot (tracked, §2b).

**DECISION Q5 (resolved via SR-1):** `modified_at` field (timestamp + last-modifier) on `AppointmentType`/`RoutingPolicy` rows is a named exit criterion for E13b — not a v1.1 item. ~30 min. Resolves the dual-write last-write-wins hazard. See M4 exit criterion 20.

**DECISION Q6 (resolved via SR-2):** F0 PII checkpoint moved to M4 entry. Integrator-owned calendar task. See M4 entry preconditions and §8.

**DECISION Q7 (locked):** Token revocation in CI-6 is a manual-trigger step. Operator revokes via Google console; monitor watches for `bookable:false` flip within 5 min. Not fully automated. See M6 workstream and §8.

**Remaining genuinely open:**

**Q1 — Is E13b correctly sized even at 4–6 days?**
A 4-hour M0 spike to count actual UI states from the `TeamManagement.tsx` pattern is acceptable before finalizing. The 4–6 day revised estimate reflects empty-state, loading, error, membership-diff, and confirmation states. If the spike reveals >6 days of work, the integrator must decide whether to scope-cut (e.g., defer bulk-assignment UX to v1.1) before issuing the work order.

---

## Appendix A — Shipped Foundation (do not rebuild)

All of the following are live on staging. Any E workstream that touches these surfaces CONSUMES them; it does not redefine them.

| Surface | What is live | Cited location |
|---|---|---|
| SMS dispatch | `SMS_Sender` (Telnyx, E.164, consent-gated, segment calc) | `Lambdas/lambda/SMS_Sender/index.mjs:186` |
| SMS inbound | `SMS_Webhook_Handler` (STOP/HELP/UNSTOP + delivery events → consent update) | `Lambdas/lambda/SMS_Webhook_Handler/index.mjs:98,273` |
| TCPA consent store | `picasso-sms-consent` (pk/sk, phone-lookup GSI, 4-yr, no TTL) | `infra/modules/picasso-form-tables/main.tf:18` |
| Scheduled dispatch consumer | `Scheduled_Message_Sender` + `picasso-scheduled-messages` (consumes EventBridge Scheduler, renders template, consent-checks, invokes SMS_Sender) | `Lambdas/lambda/Scheduled_Message_Sender/index.mjs:107` |
| Email + .ics | `send_email` Lambda (SES, MIME, .ics) | `Lambdas/lambda/send_email/lambda_function.py:194` |
| Volunteer notices | `notify.js` `dispatchVolunteerNotice()` live in lifecycle consumers | `Lambdas/lambda/shared/scheduling/notify.js:236` |
| Token library + redemption endpoints | `tokens.js` (HS256, 6 purposes, one-time-use); `Scheduling_Redemption_Handler` (6 endpoints, stubbed `/attended/*`) | §B4 LOCKED; lambda#205 LIVE |
| Reschedule / cancel execution | `reschedule.js` / `cancel.js` (§B9, audited) | lambda#204/#203 MERGED |
| Google OAuth machinery | `Calendar_Watch_Onboarder/oauth-client.js` + per-user secret pattern `picasso/scheduling/oauth/{tenantId}/{coordinatorId}` | lambda#170 / lambda#165 |
| E12/E15 render-slices | `MyBookings.tsx` + `SchedulingAnalytics.tsx` (orphaned, no nav, no API) | dash#5 MERGED |
| §14.2 Listener (7 typed events) | Full pipeline: 7 typed `booking.*` events, SNS FIFO fan-out, 2 live consumers, GSI fallback for `external_event_id` lookup | lambda#234–236 MERGED; GSI ACTIVE |
| Tag-based routing | `resolveCandidates` / `evaluatePool` / `pool.select` | lambda#183/#189 MERGED |
| B-minimal recovery loop | `schedulingFlow.js` + `bindingContext.js` + Tier-2 executor live | lambda#213/#220 MERGED; LIVE |
| New-booking B-remainder | WS-NEWBOOK-PROPOSE / WS-C12 / WS-NEWBOOK-FLOW | READY per PARALLEL_WORKSTREAMS §4.3 |

---

## Appendix B — The §E contracts that MUST be locked in M0

These surfaces are currently unlocked. Workers cannot launch until they are frozen in `FROZEN_CONTRACTS.md §E`:

1. **§E1 — EventBridge Scheduler rule contract:** deterministic name pattern (`reminder-{tier}-{booking_id}`, `attendance-check-{booking_id}`), the exact payload shape fired into `picasso-scheduled-messages` (must match the live `Scheduled_Message_Sender` consumer), the upsert-on-reschedule / delete-on-cancel semantics including the listener-driven re-bind seam, and the **reconciler GSI page-size + time-window bound** (not open-ended). Verify `Scheduled_Message_Sender/index.mjs:107` consumer contract before locking.
2. **§E2 — Reminder cadence tiers:** the 4-tier lead-time → reminder-set mapping; read-`start_at`-at-fire-time rule; quiet-hours drop semantics; D7 channel-selection model (email-always + SMS-if-opted-in-and-not-quiet-hours).
3. **§E3 — TCPA consent gate:** where opt-in is captured (booking-end); the consent record shape (reuse `picasso-sms-consent` — confirm phone-on-record + TTL `now+4yr+30d`); the pre-send validation contract for all 4 D7 lifecycle moments.
4. **§E4 — Missed-event escalation state machine:** `pending_attendance → {completed, no_show, coordinator_no_show}` + T+24h/72h/7d silence cadence + no-auto-completion rule.
5. **§E5 — `text_en` write contract:** `text_en = text` (v1), 3 writer touch-points, dashboard read-path fallback order.
6. **§E6 — Booking row additions:** `is_synthetic` (CI-6 double-gate), reminder-schedule state flags. Schema-discipline: additive; readers tolerate absence. **CI-6 time-compression contract locked here:** synthetic booking with `start_at = now+N_min`, double-gated by `STAGING_TEST_MODE=true AND is_synthetic=true`. WS-E-CI6 consumes this contract; it does not invent it.
7. **§E7 — `/scheduling/bookings` API contract:** the `Analytics_Dashboard_API` endpoint shape (query by viewer role, Booking projection, pagination). Today E12/E15 take `Booking[]` as a prop with no transport.

---

## Revision log

**v2 (2026-06-05):** incorporated tech-lead review — blockers B1/B2, strong recommendations SR-1/2/3, concerns C1–C5, and Q-verdicts for Q2/Q3/Q4/Q5/Q6/Q7.

- **B1:** Re-sequenced E3 to merge after WS-E-TCPA (not parallel with M1); added named exit criterion to WS-E-REMIND for `booking.calendar_moved` re-derivation/re-bind test.
- **B2:** Made M2 CI repair an explicit prerequisite of the M4 merge gate (not just M4 entry); annotated in graph, M4 preconditions, §7 sequencing, R2, and §8.
- **SR-1:** Re-sized E13b to 4–6 days in sizing table; added 4-hour M0 spike option; added `modified_at` as named exit criterion on E13b (M4 criterion 20, §8 PORTAL worker, R4 mitigation, §9 Q5 decision).
- **SR-2:** Moved F0 PII checkpoint from M6 entry to M4 entry; made it an integrator-owned calendar task in §8; updated M4 preconditions, M7 entry, R6, and §7 sequencing.
- **SR-3:** Locked CI-6 time-compression mechanism (`start_at = now+N_min`, double-gated by `STAGING_TEST_MODE AND is_synthetic`) in M0 exit criterion and §E6 Appendix B contract; M6 workstream references the locked contract rather than deferring the design.
- **C1:** Named unit test for `401 invalid_grant` vs `5xx` added to M3 exit criterion 15 and §8 OAUTH worker.
- **C2:** WS-E-TEXTEN solo-first constraint made an integrator-owned gate in §8 and M4 preconditions.
- **C3:** EventBridge real quota numbers cited in R5 (~1M rules/account, ~200 CreateSchedule/sec, ~25 calls/sec at pilot scale); reconciler GSI bounded-query constraint added to R5 and §E1.
- **C4:** Green-CI-as-merge-gate-only caveat added to M2 and R2; 108 red tests tracked as post-pilot item in §2b.
- **C5:** Surface-4 / E13b ordering note added to M4 and M7/F3.
- **Q2:** E11 split into backend-first + frontend-second PRs locked as a decision; M3 workstream and graph updated.
- **Q3:** Testing-mode decision locked; weekly reconnect added as named F2 step; §2b out-of-scope updated.
- **Q4:** Operator-gated merge confirmed as the gate; CI merge-gate caveat noted.
- **Q5:** `modified_at` folded into SR-1 (not a separate question).
- **Q6:** F0 checkpoint folded into SR-2 (not a separate question).
- **Q7:** Token-revocation CI-6 cycle reworded as manual-trigger step (operator revokes, monitor watches); M6 workstream and §8 CI6 worker updated.
- Q1 retained as the one genuinely open question (E13b sizing spike acceptable at M0).
