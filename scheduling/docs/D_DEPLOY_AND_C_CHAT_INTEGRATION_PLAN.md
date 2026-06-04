# Sub-phase D deploy + the C-chat integration sub-phase — scoping plan (2026-06-02)

**Status:** PLAN ONLY — operator chose "full plan, build neither yet." No code/IaC/deploys until this is approved + contracts are locked.

**Why this doc exists.** Closing out the Wave-D-core weave (D3/D4/D6/D7 all merged + audited) surfaced that the "in-chat wiring" everyone (incl. the master plan) called *integrator glue* is in fact **greenfield**. This doc reframes the remaining work into two honestly-sized tracks and scopes each.

---

## ⭐ Recommendation (tech-lead + system-architect advised, 2026-06-02)

**Sequence: B-minimal → A → B-remainder → E.** (Both advisors converged.)

- **B-minimal BEFORE A**, not A-first. Deploying the redemption edge (A) while the conversation doesn't exist = a live edge fronting a dead conversation = *false confidence* — exactly the "deployed + CodeSha-verified ≠ works" failure this project already hit four times. The real integration bugs (the D4→D6/D7 session-context handoff, binding TTL, purpose→state routing) only surface when B exists; find them together. **Do A right after B-minimal works in staging**, so its smoke test actually means something.
- **B-minimal slice** = binding-resolution + C7 slot presentation + C9 state machine + C8 commit + the `proposing→confirming` path + the reschedule/cancel execute call sites. **Defer** to B-remainder: new-booking-from-scratch entry, C10 output-sanitization, C11 idempotency, C12 chip rendering, C13 Zoom-outage paging. **Do NOT** gate B on the full sub-phase-C exit criteria (13 tasks, all §5.6 red-team cases, 50-concurrent perf) — that's the *production* bar, not the staging-happy-path bar. Minimal slice ≈ 2–3 days to a working recovery loop; full B ≈ 8–14d.
- **E strictly last** — it has zero bearing on whether a booking can be made/rescheduled/canceled and recovers none of the D dead-end debt.

**Architecture decisions (lock these as contracts before launching B):**
1. **Extend the Bedrock streaming handler — do NOT build a separate scheduling-conversation Lambda.** The scheduling conversation is session-scoped context injection, structurally identical to the form-data injection BSH already does (one streaming lifecycle, one session store, one deploy unit). A pre-turn hook resolves the binding → injects `{intent, booking_id, coordinator_id, tenant_id}` into the prompt context.
2. **Tenant resolution (RESOLVES the Q-B1 gotcha — no D4 follow-up):** the widget already sends `tenant_id` (it must, for KB/config routing); the redirect carries only `?session=<uuid>`. The backend queries the binding with `(tenant_id from the authenticated request context, session_uuid from the param)` → cross-tenant-unforgeable (a tenant-A uuid simply misses under tenant-B). Contract: `getBinding(tenant_id, session_uuid) → {intent, booking_id, coordinator_id, expires_at} | 404`; **the handler enforces the TTL itself** (don't rely on DynamoDB TTL precision for the gate). `?t=<tenant>` on the redirect is NOT needed.
3. **`deps.calendar` facade = `shared/scheduling/calendarFacade.js`** — `buildCalendarFacade(tenantId, coordinatorId) → { buildEventBody, insertEvent, deleteEvent, extractMeetJoinUrl }` currying `oauth-client.getOAuthClient(...)`; DI-injected, built **once per turn**, shared by reschedule/cancel; C8 builds its own instance via the same factory. (Matches the §B9-pinned facade shape.)
4. **The boundary to lock FIRST — "state machine is authoritative, LLM is advisory."** The handler executes reschedule/cancel/commit ONLY on a discrete structured signal (a tool-use response), NEVER on free-text the LLM emits. The `conversation-scheduling-session` row is ground truth; the LLM can only *propose* a transition, the handler validates+commits it. If left informal, this produces double-book / silent-drop bugs that are near-impossible to reproduce. This is the one contract to write before wiring BSH.

**Biggest risk to avoid:** declaring Track A "done" as a milestone in isolation (false confidence), and over-scoping B to the full C-exit-criteria. Ship the minimal recovery loop, exercise it live, then add coverage.

---

## 0. The finding (ground-truthed on lambda `main`, 2026-06-02)

The reschedule/cancel email-link loop has **no chat side at all yet**:

| Probe | Result |
|---|---|
| `executeReschedule` / `executeCancel` callers | **none** (only their own tests) |
| `Booking_Commit_Handler` (C8) callers | **none** (deployed, never invoked) |
| §B10 binding (`conversation-scheduling-session`) readers | **none** (only `stateMachine.js` references the intents; `stateMachine.js` itself has no caller) |
| `Bedrock_Streaming_Handler` `shared/scheduling/` imports | **only** C2 `formInjection` — no availability/routing/slots/stateMachine/pool |

**Conclusion:** sub-phase C is **logic-complete but never chat-integrated**. The modules (availability/routing/slots/stateMachine/pool/commit) exist; no conversation drives them. D4 writes a §B10 binding nothing reads. So an end-to-end recovery flow is blocked on building the **scheduling conversation surface** — a real sub-phase, not glue.

Confirmed seams:
- `calendar-events.insertEvent(authClient, calendarId, body)` / `deleteEvent(authClient, …)` take **auth as the first arg** → the §B9 `deps.calendar` facade must curry `oauth-client.getOAuthClient({tenantId, coordinatorId})` (`Booking_Commit_Handler/oauth-client.js:66`).
- `zoom-client.js` has `createMeeting`/`getMeeting`/`deleteMeeting` but **no `updateMeeting`** → a reschedule preserves the join URL (via `createMeeting({existingMeetingId})`) but can't PATCH the meeting's start time.
- `aws_lambda_function_url` is an established pattern (10+ infra modules) → trivial for the D4 edge.

---

## Track A — D4/D6 **deploy** (real glue; small; ~1–2 days; do-now-eligible)

Makes the redemption edge live + testable. Security-sensitive (auth surface) but mechanical.

| # | Item | Spec | Verify |
|---|---|---|---|
| **A1** | D4 redemption Lambda IaC module | New `infra/modules/lambda-scheduling-redemption-handler-staging` (mirror `lambda-booking-commit-staging`): the `Scheduling_Redemption_Handler` Lambda (nodejs20.x, bundles `@smithy/node-http-handler`) + **dedicated least-priv role** — jti-blacklist `PutItem` on the composite-key table; Booking `GetItem`; conv-scheduling-session `PutItem`; jwt `GetSecretValue` scoped to `picasso/staging/jwt/signing-key-*` — + an **`aws_lambda_function_url`** (the CloudFront origin). Env: `ENV`, `CHAT_REDIRECT_BASE_URL=https://staging.chat.myrecruiter.ai`, `SESSION_BINDING_TTL_SECONDS=1800`, `JWT_SECRET_KEY_NAME`, the table names. | `terraform plan` clean; function Active; Function-URL reachable |
| **A2** | Wire D3 origin + go live | Set `redemption_function_url_domain` (the `main.tf` block already added in #348) to A1's Function-URL host; flip `enable_custom_domain=true` → **Apply-2** + GoDaddy **CNAME #2** (`staging.schedule` → `d3vmptlsuo7127.cloudfront.net`). Cert is already `ISSUED`. | `https://staging.schedule.myrecruiter.ai/cancel?t=…` reaches the Lambda (a 4xx proves the path) |
| **A3** | Deploy D4 code + reconcile `SCHEDULE_BASE_URL` | `gh workflow run "Deploy Lambda — Staging" -f lambda=Scheduling_Redemption_Handler`; **bundle the deferred `SCHEDULE_BASE_URL → https://staging.schedule.myrecruiter.ai`** here (the minters redeploy anyway). **G8 hazard:** re-verify `Booking_Commit_Handler` + `Calendar_Event_Consumer` CodeSha256 after the apply; re-deploy real zips if clobbered. | a live redeemed link writes a §B10 binding row + 302s; minters mint links at the new host |
| **A4** | (no separate D6/D7 deploy) | `reschedule.js`/`cancel.js` are `shared/scheduling/` modules with no bundler yet — they ship inside the Track-B conversation Lambda when built. | — |

**Rides Track A:** D7 SR-1 (mutate-in-place align — tiny) + the D4 prefetch-burn note. **Risk calibration:** A1/A3 = FULL audit (auth/IAM/Function-URL surface) at weave.

---

## Track B — the **C-chat integration** sub-phase (greenfield; the real build)

**Framing (operator-chosen):** this is *"finish sub-phase C by chat-integrating the logic modules + add the D recovery flows"* — a named sub-phase with its own plan/contracts/workforce, sequenced against sub-phase E.

### B-components

| # | Component | Owns / builds |
|---|---|---|
| **B1** | Session-binding resolution + widget bootstrap | Widget reads `?session=<uuid>` + passes **tenant**; backend loads the §B10 binding, enforces one-booking ownership + TTL (§13.4). **⚠️ Gotcha:** the binding is `tenantId`-PK — a bare uuid can't resolve it. Needs confirming the widget knows its tenant on load (it almost certainly does via config) and passes `tenant`+`session`. **(Frontend explorer couldn't run — confirm the widget URL-param + tenant-on-load surface before locking B1's contract.)** |
| **B2** | `deps.calendar` auth-bound facade (seam 1) | A wrapper currying `getOAuthClient({tenantId,coordinatorId})` into `calendar-events.{buildEventBody,insertEvent,deleteEvent,extractMeetJoinUrl}` + resolving the §B6 conference provider — the concrete object D6/D7/C8 consume. Lives where the conversation Lambda can inject it. |
| **B3** | The scheduling conversation in BSH (the keystone) | Intent recognition (reschedule/cancel/book) → slot presentation (wire C4 availability / C5 routing / C7 slots) → `proposing→confirming` (C9 `stateMachine`) → at confirm call `executeReschedule`(D6) / `executeCancel`(D7) / `Booking_Commit_Handler`(C8). **This retroactively chat-integrates the entire never-wired C-phase + C8.** |
| **B4** | Zoom start-time PATCH (seam 3) | Add `updateMeeting` to C8 `zoom-client.js` so a reschedule moves the reused meeting's time (URL preservation already works; time doesn't). Small, but C8-owned. |

### Contracts to lock before launch (FROZEN_CONTRACTS §B-new)
1. **Binding-resolution API** — how the chat backend loads + validates a §B10 binding (input: tenant+session; output: `{intent, booking_id, expires_at}` or reject). Gates B1↔B3.
2. **`deps.calendar` facade shape** — already pinned in §B9 (the WS-D7 amendment): `insertEvent(calendarId, body)` / `deleteEvent(calendarId, eventId)` (auth curried), `buildEventBody`, `extractMeetJoinUrl`; per-tenant OAuth from `booking.tenantId`. B2 produces it; D6/D7/C8 consume.
3. **Conversation-state contract** — the C9 `stateMachine` state vocabulary + the commit/reschedule/cancel trigger points (what the BSH flow calls at `confirming`). Gates B3.
4. **Zoom `updateMeeting`** signature (B4).

### Parallel-workstreams decomposition (sketch — file-disjoint)
- **WS-CHAT-FACADE (B2)** — `deps.calendar` auth-bound facade module + tests. lambda. Independent (consumes existing oauth-client + calendar-events + §B6).
- **WS-CHAT-BINDING (B1-backend)** — binding-resolution helper (load/validate §B10 row) + tests. lambda. Produces contract #1.
- **WS-WIDGET-BOOTSTRAP (B1-frontend)** — widget `?session=`/tenant ingestion + redirect-landing. picasso. **Blocked on the B1 confirm above.**
- **WS-CHAT-CONVO (B3)** — the BSH scheduling conversation (the keystone; consumes B1/B2 + the C modules + C9). lambda. **Sequential after B1/B2 contracts lock** (the integration point; FULL audit — commit path).
- **WS-ZOOM-UPDATE (B4)** — `updateMeeting` on C8 zoom-client. lambda. Independent.

B2/B1-backend/B4 launch in parallel (disjoint); B3 is the integrator-sequenced keystone after their contracts land; WS-WIDGET after the tenant-on-load confirm.

### Effort + sequencing
- **Rough effort:** B ≈ **8–14 days** (B3 is the bulk; the conversation flow + LLM intent + slot-presentation reuse is the heavy part). This is comparable to a small sub-phase, NOT glue.
- **Sequencing (advisor-revised — see the ⭐ Recommendation up top):** **B-minimal → A → B-remainder → E.** NOT A-first: a live edge fronting a dead conversation is false confidence. B-minimal (≈2–3d) lights the recovery loop end-to-end; A (≈1–2d) follows so its smoke test is meaningful; B-remainder completes the C-chat integration; E (reminders/portal) last.

---

## Open questions for the operator

- ~~**Q-B1**~~ **RESOLVED (architect):** the widget already sends `tenant_id` (KB/config routing) → tenant comes from the request context, `session_uuid` from the param; no `&t=` D4 follow-up. *(Still worth a 1-line confirm that the widget forwards a `?session=` query param to the backend — but the tenant half is settled.)*
- ~~**Q-seq**~~ **ADVISED:** B-minimal → A → B-remainder → E (tech-lead + architect). Remaining operator call: accept that sequence, or override (e.g., if a reminders/portal demo outranks the recovery loop, E could jump — but both advisors put E last).
- **Q-go:** with the advised sequence, the next concrete step is **B-minimal**, not Track A. Authorize me to (a) write the Track-B contracts + work-orders (the 4 to lock + the WS decomposition) and bring them back, or (b) hold entirely. Track A executes right after B-minimal lands (so its smoke test is meaningful) — its live-apply/G8 authorization can wait until then.

---

## Links
- Wave-D-core weave: kanban [`PARALLEL_WORKSTREAMS.md`](PARALLEL_WORKSTREAMS.md) §4.1 + §7 · contracts [`FROZEN_CONTRACTS.md`](FROZEN_CONTRACTS.md) §B9/§B10 · plan [`scheduling_implementation_plan.md`](scheduling_implementation_plan.md) §6
- Merged: lambda #203 (D7) · #204 (D6) · #205 (D4) · picasso #347/#348 (D3) · #352 (weave docs)
