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
| WS-D4 (Wave D-core) | feature/scheduling-ws-d4-redemption | — | READY | New `Scheduling_Redemption_Handler/` Lambda; 6 endpoints, §13.8 slug→purpose map, single-key validate+one-time-redeem via shipped `tokens.js`, writes §B10 binding + redirects to chat. `/attended/*` action = `TODO(E6)` stub. **FULL audit + operator go-ahead at weave.** IaC+deploy = integrator glue. |
| WS-D6 (Wave D-core) | feature/scheduling-ws-d6-reschedule | — | READY | `shared/scheduling/reschedule.js` — §B9 `executeReschedule`, 4-outcome insert-first/delete-second + Zoom PATCH. In-chat caller = glue. FULL audit. |
| WS-D7 (Wave D-core) | feature/scheduling-ws-d7-cancel | [lambda#203](https://github.com/longhornrumble/lambda/pull/203) | **MERGED 2026-06-02** | `shared/scheduling/cancel.js` — §B9 `executeCancel`, `events.delete` + `pending_calendar_sync`; **does NOT flip status** (cal-lifecycle listener owns that, already built). CI green (18 tests). **FULL audit (Security pass): NO blockers** — no-status-flip / no-ddb / PII-safe-log / immutability all hold on every branch. **§C escalation RESOLVED:** §B9 calendar-facade shape pinned to `deleteEvent(booking)` (matches #203); facade wiring reqs (per-tenant OAuth / dual-casing / PII-free err) added to §B9 from the Security pass (SR-2/C-1/C-3). **Defer-ok tidy (fold into the in-chat wiring):** SR-1 (success path returns booking by reference vs pending path's copy — canonicalize both to a spread copy + add the alias test) + nits N-1/N-2/N-3. Unconsumed shared module (no deploy). In-chat caller = glue. |

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
