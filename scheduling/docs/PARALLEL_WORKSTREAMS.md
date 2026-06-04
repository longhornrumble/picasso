# Scheduling v1 — Parallel Workstreams (coordination)

**Purpose.** Let several Claude sessions build the sub-phase C logic layer (and start the sub-phase E long pole) **in parallel** without the collision / churn / quality drift that uncoordinated parallel work produces. This doc is the operating model; it does not replace the [implementation plan](scheduling_implementation_plan.md) (the task spec) — it sits on top of it.

> **Why this exists.** On 2026-05-29 three overlapping B6 remediation efforts (lambda #177/#178/#179 + picasso #290) collided — duplicate audits, merge conflicts on shared docs, rework. That is the failure mode this doc prevents. The rule that prevents it: **parallelize the *building*, single-thread the *integration*.**

---

## 1. The model

```
                 ┌─────────── parallel build (disjoint modules, one branch each) ───────────┐
 FROZEN_CONTRACTS │  WS-C2   WS-C4   WS-C5   WS-C7   WS-C9   WS-EUI   WS-D1a   WS-FIX        │
   (the seam) ────┤    │       │       │       │       │       │        │        │           │
                 └────┼───────┼───────┼───────┼───────┼───────┼────────┼────────┼───────────┘
                      └───────┴───────┴───────┴───────┴───────┴────────┴────────┘
                                              │  PRs
                                              ▼
                            ┌──────── single integrator session ────────┐
                            │ weave PRs (dep order) · run calibrated     │
                            │ audits · own the shared docs · drift cap   │
                            └────────────────────────────────────────────┘
                                              │
                                  sequential integration tasks
                                     C6 (pool-at-commit) → C8 (commit, Zoom-gated)
```

- **Build = parallel.** Each workstream is one session, one feature branch, a **disjoint set of new modules** it exclusively owns. Agents never touch each other's files or the shared docs.
- **Integration = single-threaded.** One integrator session weaves the PRs in dependency order, runs the risk-calibrated audit on the security-sensitive ones, updates the shared docs in one pass, and manages the drift-cap / promote cadence.
- **The seam between workstreams = [FROZEN_CONTRACTS.md](FROZEN_CONTRACTS.md).** Agents code *against* the frozen contracts; they never redefine one. A contract change is escalated to the integrator, not edited unilaterally.

---

## 2. Roles

| Role | Who | Does |
|---|---|---|
| **Integrator** | one designated session (default: the orchestrating/main session) | Authors + freezes contracts; weaves PRs in dep order; runs calibrated audits; **solely owns the shared docs** (the plan, `infra/main.tf`, `pii-inventory.md`, this kanban); resolves cross-workstream contract drift; runs the staging→main promote cadence + drift cap. |
| **Workstream agent** | one session per work-order | Builds ONLY its owned modules on its own branch; runs `verify-before-commit`; opens a PR with a **doc-snippet** (the plan-row + any pii-inventory line) for the integrator to apply; reports status to the integrator (does NOT edit the kanban or shared docs). |

---

## 3. Hard rules (the drift killers)

1. **Disjoint ownership.** Each work-order lists the files/modules it may touch. You may create + edit ONLY those. If you think you need a file outside your set, stop and escalate to the integrator — do not edit it.
2. **Shared docs are integrator-only.** The plan, `infra/main.tf`, `pii-inventory.md`, this kanban, and `FROZEN_CONTRACTS.md` are edited **only by the integrator**, at weave time. Agents propose their plan-row / inventory updates as a **markdown snippet in the PR description**, not as a file edit.
   - **⚠️ Cross-project: `docs/roadmap/PII-Project/pii-inventory.md` is SHARED with the separate PII Governance program** (M1–M9), built in its own session, which also edits this file (per the CLAUDE.md Living-Inventory PR Rule — scheduling tables like `Booking` + `conversation-scheduling-session` hold consumer PII the PII program governs). The two programs WILL merge-conflict on it if they edit it at the same time (already happened once: scheduling #289 vs audit #290). **Rule:** before merging any scheduling PR that edits `pii-inventory.md`, the integrator **coordinates with the PII Governance session** (ping it / take turns) so the two never touch the file simultaneously. PII session owns the M1–M9 rows; the scheduling integrator owns the scheduling-surface rows; non-overlapping sections.
3. **Code against frozen contracts; never redefine them.** If a contract is wrong or missing, escalate — don't fork it.
4. **One workstream, one branch, one PR.** Branch naming: `feature/scheduling-<ws-id>` (lambda code → base `main`; picasso code/IaC → base `staging`). No cross-workstream commits.
5. **`verify-before-commit` on every commit** (the per-repo marker). No exceptions.
6. **Risk-calibrated audit at weave time** (§5). The integrator runs the full `phase-completion-audit` on security-sensitive merges; light smoke-verify on low-risk ones.
7. **Honor CLAUDE.md** — the SOP, the drift hard-cap (≤5 staging↔main merges; merge-commit strategy on promotes), the Living-Inventory PR rule, the schema-discipline (forward-compatible reads), the never-share-IAM-roles rule, the auto-mode credential-mutation gate.

---

## 4. Wave plan + dependency graph

### 4.0 Pre-launch (integrator) — ✅ DONE 2026-05-30
1. ✅ **§B contracts LOCKED** in `FROZEN_CONTRACTS.md`. Verified against canonical; **B4 corrected** (the 6 token purposes were wrong in the draft — now `cancel`/`reschedule`/`post_application_recovery`/`attended_yes`/`no_show`/`didnt_connect` per §13.4; one-time-use reuses the *existing* jti-blacklist table) and **B5 corrected** (the 4 verbatim §5.6 red-team cases + sanitization sub-steps).
2. ✅ **`shared/scheduling/` scaffolded** in the lambda repo ([lambda#181](https://github.com/longhornrumble/lambda/pull/181) — package.json + lockfile + jest + runtime deps pre-populated + README). Each Wave-1 pure-logic session (C4/C5/C7/C9/D1a) ADDS only its own `shared/scheduling/<module>.js` + `__tests__/<module>.test.js` and never touches `package.json`. C2 = BSH module; C8 = a Wave-2 commit Lambda; WS-EUI frontend home = **integrator confirms with the WS-EUI agent at launch** (the one remaining placement to settle).
3. ✅ **Zoom OAuth runbook published** — [`runbooks/ZOOM_OAUTH_PROVISIONING.md`](runbooks/ZOOM_OAUTH_PROVISIONING.md). Operator runs it in the background (credential mutation; ~30 min) before C8's Zoom path.

**Wave 1 is now LAUNCHABLE.** Spin up one session per work-order (WS-FIX first).

**Wave 1 — parallel (all owned modules are disjoint):**

| WS | Work-order | Plan task | Repo / base | Independent because |
|---|---|---|---|---|
| **WS-FIX** | [synthetic fixture](workstreams/WS-FIX-synthetic-fixture.md) | (enabler) | picasso → staging | seeds a read-only test tenant; everyone's integ tests use it |
| **WS-C2** | [form-data injection](workstreams/WS-C2-form-injection.md) | C2 | lambda → main | consumes the C1 GSI (frozen); no other WS dep |
| **WS-C4** | [freeBusy availability](workstreams/WS-C4-freebusy.md) | C4 | lambda → main | produces `AvailabilitySource` (frozen); consumes Google OAuth (done) |
| **WS-C5** | [routing eval](workstreams/WS-C5-routing-eval.md) | C5 | lambda → main | produces `evaluatePool` (frozen); consumes RoutingPolicy table (done) |
| **WS-C7** | [slot generation](workstreams/WS-C7-slot-gen.md) | C7 | lambda → main | pure logic; produces slot-chip shape (frozen) |
| **WS-C9** | [state machine](workstreams/WS-C9-state-machine.md) | C9 | lambda → main | consumes `booking-status` + ConvSchedSession table (done) |
| **WS-D1a** | [token middleware](workstreams/WS-D1a-token-middleware.md) | D1a, CI-3d | lambda → main | security-isolated; produces token-purpose enum (frozen) |
| **WS-EUI** | [Customer Portal UI](workstreams/WS-EUI-customer-portal.md) | E10–E16 | picasso → staging | builds against Booking schema + fixtures, not C8 internals |

**Wave 2 — sequential integration (integrator or a dedicated session, AFTER its inputs land):**

| Task | Plan | Depends on | Notes |
|---|---|---|---|
| **C6 pool-at-commit** | C6 | WS-C4 + WS-C5 + WS-C7 merged | integrates the three; full audit (race conditions) |
| **C8 booking commit** | C8 | C6 + **Zoom OAuth provisioned** (§6) | the keystone; writes Booking rows → unblocks B9/B10/B11; full audit |
| **B9 / B10 / B11** | (routed from B) | C8 (real Booking writes) | the consumer logic deferred from sub-phase B |

**Recommended launch order:** WS-FIX **first** (others' integ tests want it), then WS-C4 / WS-C5 / WS-C7 / WS-C9 / WS-C2 / WS-D1a / WS-EUI in any order (all independent). Launch as many concurrently as you can supervise.

### 4.1 Wave D-core (sub-phase D — token redemption / recovery paths) — **READY 2026-06-02**

Sub-phase D closes the human-facing loop: the cancel/reschedule links being minted today point at a host that doesn't exist (`schedule.myrecruiter.ai` = NXDOMAIN). **Operator decisions (2026-06-02):** host = **`staging.schedule.myrecruiter.ai`** (staging-only, no prod cutover); scope = **lean core** (D3+D4+D6+D7 now; **D2 dual-key / D5 failure-pages / D8 recovery deferred to Wave D-2**). Contracts **§B9 + §B10 LOCKED**, **§B11 reserved** (FROZEN_CONTRACTS change-log 2026-06-02).

**Key architecture fact (reconciled vs canonical §13.4/§9.4):** the token authenticates **ENTRY only** — the state-changing calendar op runs **in-chat after the volunteer confirms**, not at the endpoint. So WS-D4 is thin (validate → one-time-redeem → write §B10 binding → land in chat); WS-D6/WS-D7 are DI-seam'd **execution modules** the in-chat confirm step calls. That in-chat call site + the chat-session bootstrap are **integrator glue**, not a worker slice.

| WS | Work-order | Plan task | Repo / base | Independent because |
|---|---|---|---|---|
| **WS-D3** | [redemption domain](workstreams/WS-D3-DOMAIN.md) | D3 | picasso → staging | self-contained IaC module; **launch FIRST** (ACM cert validation latency) |
| **WS-D4** | [redemption endpoint](workstreams/WS-D4-REDEMPTION.md) | D4 | lambda → main | new Lambda dir; consumes the shipped `tokens.js` (§B4); writes §B10 — imports no other D slice |
| **WS-D6** | [reschedule execution](workstreams/WS-D6-RESCHEDULE.md) | D6 | lambda → main | owns `shared/scheduling/reschedule.js`; produces §B9; invoked in-chat (glue) |
| **WS-D7** | [cancel execution](workstreams/WS-D7-CANCEL.md) | D7 | lambda → main | owns `shared/scheduling/cancel.js`; produces §B9; listener-flip half already built |

**Launch order:** **WS-D3 first** (cert latency), then WS-D4 / WS-D6 / WS-D7 in any order (file-disjoint). **Weave order:** D3 + D6 + D7 land independently; D4 last is convenient (it's the keystone full-audit), but D4 imports none of them so order is not strict. **Integrator glue owed after the wave:** wire the D4 Lambda infra module + Function URL (mirror `lambda-booking-commit-staging`) → set WS-D3's `redemption_function_url_domain`; reconcile `SCHEDULE_BASE_URL` across `lambda-booking-commit` (`staging.chat...`) + `lambda-calendar-event-consumer` (`schedule.myrecruiter.ai`) → both to `https://staging.schedule.myrecruiter.ai`; wire the in-chat confirm → `executeReschedule`/`executeCancel` call sites + chat-session bootstrap.

**Wave D-2 (deferred):** WS-D2 dual-key validator (Python Master_Function refactor — HIGH risk, live chat auth; locks §B11) · WS-D5 failure-page polish (server-side coordinator name+email render, §13.9) · WS-D8 post-application recovery flow (`/resume` + form-injection). E6 owns the interviewer `/attended/*` disposition (D4 ships those endpoints' security path with the action stubbed).

### 4.2 B-minimal (C-chat integration — the recovery loop) — **READY 2026-06-02**

The Wave-D weave found the in-chat side is greenfield (sub-phase C is logic-complete but never chat-integrated). B-minimal lights the **reschedule/cancel-from-email-link recovery loop** end-to-end. Plan: [`D_DEPLOY_AND_C_CHAT_INTEGRATION_PLAN.md`](D_DEPLOY_AND_C_CHAT_INTEGRATION_PLAN.md) (tech-lead + architect advised: **B-minimal → A → B-remainder → E**). Contracts **§B12–§B15 LOCKED**.

| WS | Work-order | Repo / base | Independent because |
|---|---|---|---|
| **WS-FACADE** | [calendar facade](workstreams/WS-FACADE-calendar-facade.md) | lambda → main | new `shared/scheduling/calendarFacade.js`; produces §B13 (= the §B9 `deps.calendar`) |
| **WS-BINDING** | [session binding](workstreams/WS-BINDING-session-binding.md) | lambda → main | new `shared/scheduling/sessionBinding.js`; produces §B12 (reads the §B10 row) |
| **WS-WIDGET** | [forward ?session=](workstreams/WS-WIDGET-session-forward.md) | picasso → staging | widget param plumbing; tenant-from-context (§B12) — Q-B1 resolved |
| **WS-ZOOM** | [updateMeeting](workstreams/WS-ZOOM-update-meeting.md) | lambda → main | adds one method to `zoom-client.js`; produces §B15; no other slice touches it |
| **WS-CONVO** | [reschedule/cancel flow](workstreams/WS-CONVO-scheduling-flow.md) | lambda → main | BSH `scheduling/` flow + index.js wiring; **keystone — after the 4 land** |

**Launch order:** WS-FACADE / WS-BINDING / WS-ZOOM / WS-WIDGET in parallel (disjoint); **WS-CONVO is the integrator-sequenced keystone** (consumes §B12/B13/B15) — launch after those three merge. **Architecture (locked, §B14):** extend BSH (not a new Lambda); state-machine authoritative / LLM advisory; execute only on a focused-post-stream structured action (V4.0-Action-Selector-style — BSH has no native tool-use). **Deferred to B-remainder:** new-booking entry (`qualifying`), C10–C13. **Track A (D4/D6 deploy)** follows B-minimal so its smoke test is meaningful.

### 4.3 B-remainder (new-booking in-chat) — **READY 2026-06-03**

The recovery loop (B-minimal, §B9–§B15) only CHANGES an existing booking. B-remainder builds the OTHER half: booking a NEW appointment from scratch in chat (`qualifying → proposing → confirming → booked`). Contracts **§B16 LOCKED 2026-06-03**. Operator scope (2026-06-03): **keystone only** — D2/D5/D8 + sub-phase E + F deferred to later waves.

**Architecture (load-bearing, §B16):** `availability.js` (C4) + `pool.js` (C6) pull `googleapis`, which BSH cannot bundle (the lambda#222 crash boundary) → the `proposing` step (availability+routing+slot-gen) AND the `booked` commit BOTH run in `Booking_Commit_Handler`, reached from BSH by Lambda invoke (mirrors the Tier-2 executor). **BSH owns the conversation; BCH owns everything calendar-bound.**

| WS | Work-order | Repo / base | Independent because |
|---|---|---|---|
| **WS-NEWBOOK-PROPOSE** | [scheduling_propose route](workstreams/WS-NEWBOOK-PROPOSE-scheduling-propose-route.md) | lambda → main | new BCH route (`Booking_Commit_Handler/scheduling-propose.js`); reuses shipped C6 `pool.select`; READ-ONLY |
| **WS-C12** | [new-booking frontend](workstreams/WS-C12-new-booking-frontend.md) | picasso → staging | widget slot-chips + echo-back + CTA-start signal; file-disjoint from the lambda slices |
| **WS-NEWBOOK-FLOW** | [new-booking flow](workstreams/WS-NEWBOOK-FLOW-new-booking-flow.md) | lambda → main | new BSH module (`scheduling/newBookingFlow.js`); **keystone — consumes §B16a**, weaves after PROPOSE |

**Launch order:** **WS-NEWBOOK-PROPOSE + WS-C12 in parallel** (BCH route vs picasso widget — file-disjoint). **WS-NEWBOOK-FLOW is the integrator-sequenced keystone** — code against frozen §B16 now, weave after PROPOSE merges. **Already shipped (NOT in scope):** C10 (calendar-event PII/sanitization — live in `calendar-events.js`), C11 (commit idempotency gate). **Deferred (honest):** C13 (Zoom-outage T-15 paging) is BLOCKED on the SMS dispatch path that doesn't exist until sub-phase E → goes to E, not folded here. **Integrator glue owed after the wave:** the BSH `index.js` entry-hook wiring + live deps injection (real `LambdaClient` invoke of BCH for propose+commit, the state store, IAM `lambda:InvokeFunction` grant, the `scheduling_intent:'new_booking'` bootstrap) per §B16d — mirrors the B-minimal Tier-1/Tier-2 deps-wiring.

---

## 5. Risk-calibrated audit rule (lever #4)

> **Full `phase-completion-audit`** (≥3 adversarial reviewers + remediation) at weave time for any workstream touching: **prompt-injection / LLM input (C2)**, **race conditions or money/commit paths (C6, C8)**, **signed tokens / auth (D1a)**, **IAM / external surface / PII**.
>
> **Light verify** (the agent's `verify-before-commit` + an integrator smoke) for: **config / IaC tables, pure-logic modules with full unit coverage and no external surface (C7), additive UI surfaces (WS-EUI early)**.
>
> Rationale: B6's audit found real account-suspended-path bugs the live smoke couldn't — worth it. The 3 C3 tables were smoke-verified without a full audit — also right. Calibrate; don't reflexively over- or under-audit.

---

## 6. Operator gate — Zoom S2S OAuth (lever #3, do in background)

> **Full runbook: [`runbooks/ZOOM_OAUTH_PROVISIONING.md`](runbooks/ZOOM_OAUTH_PROVISIONING.md)** (published pre-launch). Summary below.

C8 is the only C task with an external gate. Provision ahead of reaching C8 so it's not a serial wait:

1. In the Zoom Marketplace, create a **Server-to-Server OAuth** app for the pilot tenant; scopes: `meeting:write:admin` (+ `meeting:read:admin`).
2. Store the creds in Secrets Manager at **`picasso/scheduling/zoom/{tenant_id}`** (mirror the Google OAuth secret shape — `account_id` / `client_id` / `client_secret`). Tag for the C8 exec role's per-tenant scope (no wildcard, per the never-share-IAM-roles + per-tenant-scope convention).
3. Verifier: `aws secretsmanager list-secrets --profile myrecruiter-staging --query "SecretList[?starts_with(Name,'picasso/scheduling/zoom/')].Name"`.

Until provisioned, C8 builds **Meet-first** (`conferenceData.createRequest`, rides the existing Google OAuth) + the `NullConferenceProvider` (no-op) per canonical §5.2 item 4; the `ZoomProvider` path lands once the secret exists.

---

## 7. Kanban (integrator-owned — agents report status in their PR, integrator updates here)

| WS | Branch | PR | Status | Blockers |
|---|---|---|---|---|
| WS-FIX | feature/scheduling-ws-fix | [#301](https://github.com/longhornrumble/picasso/pull/301) | MERGED 2026-05-30 | fixture `TEN-SCHED-FIXTURE` now available (staging, read-only) — see note below |
| WS-C2 | feature/scheduling-ws-c2 | [#184](https://github.com/longhornrumble/lambda/pull/184) | MERGED 2026-05-30 | re-cut clean + all fix-now remediated (timeout/Limit+pickLatest/mixed-case regex/key-sanitize/tests), re-reviewed correct, operator-approved. **Named residual:** live-GSI integration test runs at first `TEN-SCHED-FIXTURE` seed (operator-gated). |
| WS-C4 | feature/scheduling-ws-c4 | [#182](https://github.com/longhornrumble/lambda/pull/182) | MERGED 2026-05-30 | — |
| WS-C5 | feature/scheduling-ws-c5 | [#183](https://github.com/longhornrumble/lambda/pull/183) | MERGED 2026-05-30 | — |
| WS-C7 | feature/scheduling-ws-c7 | [#187](https://github.com/longhornrumble/lambda/pull/187) | MERGED 2026-05-30 | slot-gen; native-Intl DST (spring-forward skip + fall-back de-dup) verified. §C escalation resolved: optional `resourceId` input (caller supplies per-resource) — §B3 clarified. |
| WS-C9 | feature/scheduling-ws-c9 | [#185](https://github.com/longhornrumble/lambda/pull/185) | MERGED 2026-05-30 | — |
| WS-D1a | feature/scheduling-ws-d1a | [#186](https://github.com/longhornrumble/lambda/pull/186) | MERGED 2026-05-30 | remediated (empty-key/jti/expectedPurpose+tenant guards + fail-closed tests + SM-isolation), re-reviewed correct, operator-approved; CI green incl. the now-gating `shared/scheduling` job. Staging-safe (shared lib, no prod deploy). |
| WS-EUI | feature/scheduling-ws-eui | [dash#5](https://github.com/longhornrumble/picasso-analytics-dashboard/pull/5) | MERGED 2026-05-31 | **E12+E15 shipped** (dash#5 merged after the Clerk unblock dash#6; prod-deployed, gated). Nav deliberately unwired (separate App.tsx task) → deployed unreachable. **E11/E13/E14/E16 deferred** to integrator-sequenced follow-ups. Dashboard-repo debt flagged (no vitest CI + 108 red tests on main; pre-existing js-cookie advisory cleared by dash#6) — out of scheduling scope. |
| C6 (Wave 2) | feature/scheduling-ws-c6 | [#189](https://github.com/longhornrumble/lambda/pull/189) | MERGED 2026-05-31 | `shared/scheduling/pool.js` — §10.2 select() + lockSlot() (conditional write on existing Booking table) + circuit-breaker + field-shim. 3-reviewer audit + verified remediation (re-offer dedup / poolSize+nextAttempt / breaker prune / booking_id). Deferred to C8: unconditional lock release + stale-lock runbook; propagate `format` to chip; durable degraded-state. |
| C8 (Wave 2) | feature/scheduling-ws-c8 | [#190](https://github.com/longhornrumble/lambda/pull/190) (code) · picasso[#317](https://github.com/longhornrumble/picasso/pull/317) (IaC) · lambda[#191](https://github.com/longhornrumble/lambda/pull/191) (deploy) | MERGED + PROVISIONED 2026-05-31 | Code `Booking_Commit_Handler/` (4-reviewer audit + verified remediation). **IaC #317 applied on staging** (Terraform success: Lambda + dedicated least-privilege IAM role — Booking 4-verbs + RoutingPolicy UpdateItem + per-tenant OAuth/Zoom/JWT secrets; timeout 90s/mem 512/reserved-conc 5; **function runs the placeholder zip** per `ignore_changes`). **DLQ removed (picasso#321):** C8 is synchronous so the SNS DLQ + DeadLetterErrors alarm could never fire — removed; failure observability = handler-returns-to-caller + `alertAdmin()`→ops-alerts + Errors alarm. **Deploy wired (#191).** **Unblocks B9/B10/B11.** **OPERATOR RESIDUAL (gates kanban→Done):** initial C8 code-deploy (`gh workflow run "Deploy Lambda — Staging" -f lambda=Booking_Commit_Handler`) + live smoke (Calendar/Zoom/SES/DDB; confirm `SCHEDULE_BASE_URL`). **Integrator follow-ups status:** ✅ token-min-lifetime floor APPLIED (lambda#192, tokens.js + §B4), ✅ `@googleapis/calendar` pinned (lambda#193), ✅ pii-inventory Booking-writer + routing/C9 rows (this docs PR); **still-owed:** Zoom prod published-OAuth pivot (pre-tenant-2). |
| WS-B9B10 (Wave 3) | feature/scheduling-ws-b9b10 | [lambda#195](https://github.com/longhornrumble/lambda/pull/195) | **MERGED 2026-06-01** | `Calendar_Event_Consumer/` — B9 `ooo_overlap_detected` conflict-flag + admin-alert on full `overlapping_booking_ids`; B10 `attendee_declined`→`Booking.status=canceled`. 5-reviewer audit + verified remediation (PII-redact malformed-body, bundle `@smithy/node-http-handler`, partial-failure + redelivery tests). **B9 reoffer = stub** (I6 deferred — blocked on the pool-resolver(X) + notification-dispatch(Y) contracts); **B10 reminders = TODO(E)**. Integrator-owed: CI registration (I3), IaC (I4). |
| WS-B11 (Wave 3) | feature/scheduling-ws-b11 | [lambda#194](https://github.com/longhornrumble/lambda/pull/194) | **MERGED 2026-06-01** | `Stranded_Booking_Remediator/` — `coordinator_email`-GSI detection + reassign/cancel/leave + default cascade. 5-reviewer audit + verified remediation (404/410→cascade-to-cancel while 401 propagates, `sdkConfig` timeouts, 3 PII redactions, +propagation tests, `attribute_exists` guard). `loadCandidates` = injected seam default-`[]` (integrator wires the real roster, I4). **cancel path relies on WS-CAL-LIFECYCLE (I2-A) to flip status booked→canceled — not yet built.** Account-suspended OAuth → `failed[]` (auth-model follow-up). |
| WS-B11-UI (deferred) | — | — | DEFERRED | "N bookings need attention" admin surface + the (a)/(b)/(c) choice — greenfield frontend, a later EUI-style task once WS-B11 backend lands. |
| WS-CAL-LIFECYCLE (Wave 4) | feature/scheduling-ws-cal-lifecycle | [lambda#196](https://github.com/longhornrumble/lambda/pull/196) | **MERGED 2026-06-01** | `Calendar_Lifecycle_Consumer/` — §14.2 reconciliation: `calendar_deleted`→`canceled`(+Y stub); `calendar_reassigned`→`resource_id` (no notify); `calendar_moved`→mark canceled + `cancel_reason='coordinator_moved'` (**F2: self-anchor `rescheduleOfBookingId` dropped**); `event_made_private`→channels-table `event_body_private`. 5-reviewer audit + verified F1–F6 (requireStrings, degradeChannel tenant-guard, err.name log, EMAIL_RE, tests). **Inert until: (a) the integrator Listener `channel_id`-in-envelope change, (b) the SNS fan-out routes the 4 types to its queue (WS-IAC #328).** |
| WS-SCHED-FOUNDATIONS (Wave 4) | feature/scheduling-ws-sched-foundations | [lambda#197](https://github.com/longhornrumble/lambda/pull/197) | **MERGED 2026-06-01** | `shared/scheduling/candidate-resolver.js` (X) + `notify.js` (Y) — see FROZEN §B7/§B8. 4-reviewer audit + verified G1–G4 (attemptSms guard, `safeUrl()` https-only, `ProjectionExpression`, tests). **Consumers must wire it:** B9 reoffer + B11 `loadCandidates` seam (X); WS-CAL-LIFECYCLE + B9 (Y). SMS = `TODO(SMS-E)` stub. |
| WS-IAC (Wave 4, I4) | feature/scheduling-ws-iac-consumers | [picasso#328](https://github.com/longhornrumble/picasso/pull/328) + [#330](https://github.com/longhornrumble/picasso/pull/330) | **MERGED + APPLIED on staging 2026-06-01** | SNS-FIFO fan-out topic (Listener-only publish policy + KMS) + 2 filtered FIFO SQS subscriptions + DLQs/alarms + `Calendar_Event_Consumer` & `Stranded_Booking_Remediator` Lambda modules (placeholder zips) + least-priv IAM + `ReportBatchItemFailures` ESM. Security re-audit B-1/SR-1/2/3 fixed; **#330 repaired the partial apply** (topic policy `SNS:*`→explicit topic-scoped actions — `SNS:*` is invalid in a resource policy). Promoted to main #331. **OWED (integrator coupled-changes, NOT yet done):** the Listener SQS→SNS publish flip + `sns:Publish` grant + `EVENTS_TOPIC_ARN` (the live cutover); the B11 offboarding-trigger wiring; the `channel_id`-in-`event_made_private` Listener change. The `Calendar_Lifecycle_Consumer` queue+subscription exist but its Lambda is undeployed (lifecycle-backlog alarm = EXPECTED until WS-CAL-LIFECYCLE deploys). |
| **Integrator coupled change** | — | — | OWED | Listener `workingLocation`-exclusion (only `outOfOffice` = absence; resolves the §14.2 open question, operator 2026-05-31) — small `Calendar_Watch_Listener` derivation fix + `listener_dispatch_interface.md` contract update. Lands before/with WS-B9B10 so B9 only receives real-absence OOO. |
| WS-D3 (Wave D-core) | feature/scheduling-ws-d3-domain | [#347](https://github.com/longhornrumble/picasso/pull/347) | **MERGED 2026-06-02** | `staging.schedule.myrecruiter.ai` ACM+CloudFront module (validate-clean; light-full review passed — HTTPS-only/TLSv1.2_2021/AllViewerExceptHostHeader/CachingDisabled/CWL access-logs/no-WAF[P22]). **Hosted-zone escalation RESOLVED:** `myrecruiter.ai` is GoDaddy not Route53 (mirrors `acm-chat-staging`) → module creates NO DNS records, surfaces `validation_record` + `dns_alias_record` outputs for the operator to add by hand; omits `aws_acm_certificate_validation`. Two-apply cert-ISSUED sequencing via `enable_custom_domain` (default false). **Integrator glue (#348):** `infra/main.tf` wiring only. **`SCHEDULE_BASE_URL` reconcile DEFERRED** to the WS-D4 deploy — changing it now would force a G8-risky re-apply of the 2 live minter lambdas (booking-commit, event-consumer) for zero benefit (the host is NXDOMAIN until D3 is live); bundle it with the D4 deploy when those minters redeploy anyway. **Operator-owed:** Apply 1 (cert PENDING) → GoDaddy validation CNAME → Apply 2 (alias) → GoDaddy alias CNAME. `var.redemption_function_url_domain` = placeholder until WS-D4. |
| WS-D4 (Wave D-core) | [lambda#205](https://github.com/longhornrumble/lambda/pull/205) | **MERGED 2026-06-02** | `Scheduling_Redemption_Handler/` — 6 endpoints, §13.8 slug→purpose map, single-key validate+atomic one-time-redeem via `tokens.js`, §B10 binding write + fixed-base redirect. **FULL audit (Security): no blockers** (one-time-use burned before every action incl. the attendance stub; tenant-scoped GetItem; no open-redirect; leak-free failure pages; iss cross-class rejection tested). Remediated SR-2 (TTL load-validation) + C-3 (booking_id-less cancel/reschedule → clear 400). **Deferred:** SR-1/SR-3 + **prefetch-burn** (email scanners GET-prefetch one-time links → 410; v1-accept per §13.5; mitigation = confirm-interstitial in D5); C-2→D2 (key-rotation cache); C-4→D5 (coordinator-email scheme-validate). **Seam owed (integrator):** chat-session bootstrap (redirect carries `?session=<uuid>` — the widget resolves tenant + reads the §B10 binding to enforce ownership). IaC+deploy = integrator glue. |
| WS-D6 (Wave D-core) | [lambda#204](https://github.com/longhornrumble/lambda/pull/204) | **MERGED 2026-06-02** | `shared/scheduling/reschedule.js` — §B9 `executeReschedule`. **FULL audit (Security): 1 blocker B-1 resolved** — delete GUARDED on insertOk (operator "guard the delete"): insert✗ → (iv) failed/retryable, old event NEVER deleted; outcome (iii) `canceled_insert_failed` now UNREACHABLE (a transient insert hiccup must not strand the volunteer). Also remediated B-2 (write-back in caller's casing) + SR-2 (PII-safe err log) + SR-4 (id guards); SR-3 resolved as **mutate-in-place** (reviewer's test-authority option; lower-risk than copy). 28/28 tests. **Seams owed (integrator):** (1) `deps.calendar` auth-binding wrapper over C8 `calendar-events.js` (in-chat wiring); (2) Zoom **start-time** PATCH needs an `updateMeeting` on C8 `zoom-client.js` (not shipped — join-URL preservation works; time-PATCH is a C8 follow-up). |
| WS-D7 (Wave D-core) | feature/scheduling-ws-d7-cancel | [lambda#203](https://github.com/longhornrumble/lambda/pull/203) | **MERGED 2026-06-02** | `shared/scheduling/cancel.js` — §B9 `executeCancel`, `events.delete` + `pending_calendar_sync`; **does NOT flip status** (cal-lifecycle listener owns that, already built). CI green (18 tests). **FULL audit (Security pass): NO blockers** — no-status-flip / no-ddb / PII-safe-log / immutability all hold on every branch. **§C escalation RESOLVED:** §B9 calendar-facade shape pinned to `deleteEvent(booking)` (matches #203); facade wiring reqs (per-tenant OAuth / dual-casing / PII-free err) added to §B9 from the Security pass (SR-2/C-1/C-3). **Defer-ok tidy (fold into the in-chat wiring):** SR-1 (success path returns booking by reference vs pending path's copy — canonicalize both to a spread copy + add the alias test) + nits N-1/N-2/N-3. Unconsumed shared module (no deploy). In-chat caller = glue. |
| WS-FACADE (B-minimal) | [lambda#209](https://github.com/longhornrumble/lambda/pull/209) | **MERGED 2026-06-03** | `shared/scheduling/calendarFacade.js` — §B13 `buildCalendarFacade` (thin auth-currying wrapper; two-arg `insertEvent`/`deleteEvent`). FULL audit: auth bound to (tenant,coord), never caller-supplied; 2 cross-tenant proofs; 15 tests. **Surfaced the §B9/§B13 two-arg-vs-`deleteEvent(booking)` conflict → integrator reconciled (cancel.js re-synced [lambda#212]; §B9 corrected).** |
| WS-BINDING (B-minimal) | [lambda#211](https://github.com/longhornrumble/lambda/pull/211) | **MERGED 2026-06-03** | `shared/scheduling/sessionBinding.js` — §B12 `resolveBinding` (TTL-in-code, tenant-from-PK, fail-closed; 16 tests). Flags resolved: §B10 SK label corrected to `session_id`; session-id threading invariant locked in §B10. |
| WS-WIDGET (B-minimal) | [#359](https://github.com/longhornrumble/picasso/pull/359) | **MERGED 2026-06-03** | widget forwards opaque `?session=` → backend. LIGHT audit clean (mirrors the `nocache` host→iframe→backend precedent 1:1; opaque, tenant from config; 291/291). Two-hop iframe surface confirmed. |
| WS-ZOOM (B-minimal) | [lambda#210](https://github.com/longhornrumble/lambda/pull/210) | **MERGED 2026-06-03** | `Booking_Commit_Handler/zoom-client.js` +`updateMeeting` (§B15). FULL audit: sibling-parity (per-tenant token, 401-evict-retry, idempotent, throw-on-fail); exact §B15 signature. |
| WS-CONVO (B-minimal) | [lambda#213](https://github.com/longhornrumble/lambda/pull/213) | **MERGED 2026-06-03** | BSH `scheduling/schedulingFlow.js`+`bindingContext.js`+index.js — reschedule/cancel flow; §B14 action-boundary. **FULL adversarial Security audit: §B14 core CLEAN** (free-text→no-execute via action ALLOWLIST; booking_id always from the binding never the LLM; reschedule double-execute blocked; malformed detector fail-closed; tenant isolation). Weave-fixed B-1 (cancel-confirm advances state → no re-fire within TTL) + S-1 (cancel gates via `transition()`) + B-2 (empty-key guard) + S-4 (cancel.js err.code/name, no PII). 32 BSH + 330 shared tests. **OWED to integrator at deps-wiring/deploy (see below) — NOT live yet.** |
| **B-minimal — INTEGRATOR DEPS-WIRING** | picasso#372 + lambda#217 | **✅ DONE + LIVE 2026-06-03** | Tier-1 deps-wiring shipped: BSH `loadState`/`saveState`/`loadBooking` (`schedulingStateStore.js`) injected at both call-sites; **S-3 CTA gate on `result.handled`**; BSH exec-role `GetItem`+`PutItem` on the session table + `GetItem` on Booking (picasso#372). Activates only for sessions with a §B10 binding row → normal chat unaffected. Audit: no blockers; store made uniformly fail-soft (S-1) + state guard (S-2). |
| **Track A — D4/D6 deploy (redemption edge)** | picasso#366/#367/#369 + lambda#216 | **✅ DONE + LIVE 2026-06-03** | A1 D4 Lambda+FunctionURL IaC (picasso#366, FULL Security audit); A2 wire CloudFront origin + `enable_custom_domain` (picasso#367) → `staging.schedule.myrecruiter.ai` resolves + serves the real handler; A3 deploy real D4 code (lambda#216 matrix + dispatch) + `SCHEDULE_BASE_URL`→staging.schedule on the 3 minters (picasso#369). **Function-URL gotcha: needs a Console-added 2nd resource-policy stmt (`FunctionURLAllowInvokeAction`/`InvokedViaFunctionUrl`) — TF can't express; stmt #1 alone 403s.** N-4: CF access-log group KMS-encrypted + pii-inventory §D (picasso#373). |
| **Tier 2 — calendar-execution executor (architecture option d)** | lambda#220 + picasso#375 | **✅ DONE + AUDITED + ACTIVATED LIVE 2026-06-03** | BSH cannot bundle googleapis → it **invokes `Booking_Commit_Handler`** for an already-§B14-authorized reschedule/cancel. BCH `scheduling-mutate.js`: getOAuthClient → §B13 facade → resolveProvider (§B6) → executeReschedule/executeCancel → Zoom `updateMeeting` (§B15) → `booking-store.updateBookingReschedule` persist (cancel status = §14.2 listener). BSH `schedulingFlow._do{Reschedule,Cancel}` delegate via `deps.invokeSchedulingExecutor` (LambdaClient); **§B14 boundary stays in BSH** (transition() before invoke; BCH pure executor). `/phase-completion-audit` (Security+code-review): **no blockers**; remediated SR-1 cross-tenant guard / SR-2 fallback advances state (no re-fire double-execute) / SR-3 un-export raw executor / NTH1 PII-projected payload / CR-Low coordinatorId guard. **Activated** picasso#375 (BSH `lambda:InvokeFunction` on BCH ARN [scoped] + `SCHEDULING_EXECUTOR_FUNCTION_NAME` env, atomic). LIVE-verified (env+role set, 200, G8 clean). **Live calendar-mutation smoke HELD for F-phase** (needs real OAuth'd coordinator + event). |
| **F-phase live smoke + residuals** | — | **DEFERRED (tracked)** | (1) seeded-booking reschedule/cancel round-trip on `TEN-SCHED-FIXTURE` w/ real OAuth'd coordinator → F-phase; (2) SR-C1 cancel status-flip reconciler backstop if §14.2 push never fires → E9 scope; (3) BSH-index `invokeSchedulingExecutor` direct test → index-harness follow-up; (4) D5 CF-log token redaction-at-source (CW Logs data-protection policy) → PII/hardening workstream. None waived. |
| WS-NEWBOOK-PROPOSE (B-remainder, §4.3) | feature/scheduling-ws-newbook-propose | — | **READY** 2026-06-03 | §B16a `scheduling_propose` BCH route (availability+routing+slot-gen via shipped C6 `pool.select`; READ-ONLY; generic slots; identity-free). lambda→main. FULL audit. Launch in parallel with WS-C12. |
| WS-C12 (B-remainder, §4.3) | feature/scheduling-ws-c12 | — | **READY** 2026-06-03 | §B16b/d frontend — generic slot chips (no coordinator name) + echo-back confirm + `start_scheduling`→`scheduling_intent:'new_booking'` signal + `scheduling_notice` render. picasso→staging. LIGHT audit. Launch in parallel with PROPOSE. |
| WS-NEWBOOK-FLOW (B-remainder KEYSTONE, §4.3) | feature/scheduling-ws-newbook-flow | — | **READY** 2026-06-03 | §B16b in-chat new-booking flow (`qualifying→proposing→confirming→booked`; §B14 boundary; delegates propose+commit via injected deps; no googleapis). lambda→main. FULL audit. **Weave AFTER PROPOSE merges.** Integrator owes index.js entry-hook + live deps wiring (§B16d). |

**Status values:** NOT STARTED · IN PROGRESS · IN REVIEW (PR open) · MERGED · BLOCKED · READY (work-order written, awaiting worker) · DEFERRED.

**Shared fixture (WS-FIX #301, merged):** `TEN-SCHED-FIXTURE` (staging, read-only synthetic tenant) — appt types `appt_1to1_discovery_30`/`appt_1to1_interview_60`; routing policies `rp_round_robin`/`rp_first_available`; bookings `bk_fixture_001/002/003` (all `booked`). Seed/teardown scripts in `scheduling/fixtures/`; runbook `scheduling/docs/runbooks/SCHEDULING_TEST_FIXTURE.md`. Other workstreams' integration tests reference these keys read-only. **Seed is operator-gated** (credential mutation) — scripts delivered, not yet run.

---

## 8. How to launch a workstream session

> **Operator step-by-step + all 8 ready-to-paste prompts: [`LAUNCH_THE_WORKFORCE.md`](LAUNCH_THE_WORKFORCE.md).**

Paste into a fresh Claude Code session, in order:
1. *"Read `scheduling/docs/workstreams/<WS>.md` — that is your work-order. Read the contracts it cites in `scheduling/docs/FROZEN_CONTRACTS.md`, the plan task it cites in `scheduling/docs/scheduling_implementation_plan.md`, and `CLAUDE.md`. Then build it within the ownership boundary. Open a PR per the work-order; do NOT touch any file outside your owned set or any shared doc."*
2. The agent builds → opens its PR with the doc-snippet → reports to you.
3. The **integrator session** weaves: review → calibrated audit → apply the doc-snippets to the shared docs → merge → update this kanban → manage drift/promote.

---

## Change log
| Date | Change |
|---|---|
| 2026-05-30 | Created — parallel-workstream coordination for the sub-phase C logic layer + early E. Companion: [FROZEN_CONTRACTS.md](FROZEN_CONTRACTS.md) + `workstreams/`. |
| 2026-06-02 | **Wave D-core added** (§4.1 + 4 kanban rows): WS-D3/D4/D6/D7 for sub-phase D token redemption. Operator decisions: host `staging.schedule.myrecruiter.ai`, lean-core scope (D2/D5/D8 → Wave D-2). Contracts §B9+§B10 LOCKED, §B11 reserved. Launch prompts in [LAUNCH_THE_WORKFORCE.md](LAUNCH_THE_WORKFORCE.md). |
| 2026-06-03 | **RECOVERY LOOP LIVE.** Track A (D4 edge, picasso#366/#367/#369 + lambda#216) + deps-wiring Tier 1 (picasso#372 + lambda#217) + Tier 2 calendar executor (option d; lambda#220 audited + picasso#375 activation) all merged + deployed + LIVE on staging. In-chat reschedule/cancel now mutates the real Google Calendar end-to-end. Live smoke HELD for F-phase. Sequencing advisory (B-minimal→A→B-remainder→E) complete through A. **Next: parallel D/E/F workstreams** (B-remainder + E + F + D2/D5/D8). Also: verify+audit elevated to standing SOP ([[feedback_verify_and_audit_are_sop]]); CI smoke-retry (lambda#219). Handoff: [[project_scheduling_handoff_2026-06-03_recovery-loop-live]]. |
