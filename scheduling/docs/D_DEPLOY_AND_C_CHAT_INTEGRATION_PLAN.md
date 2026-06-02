# Sub-phase D deploy + the C-chat integration sub-phase — scoping plan (2026-06-02)

**Status:** PLAN ONLY — operator chose "full plan, build neither yet." No code/IaC/deploys until this is approved + contracts are locked.

**Why this doc exists.** Closing out the Wave-D-core weave (D3/D4/D6/D7 all merged + audited) surfaced that the "in-chat wiring" everyone (incl. the master plan) called *integrator glue* is in fact **greenfield**. This doc reframes the remaining work into two honestly-sized tracks and scopes each.

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
- **Sequencing vs sub-phase E:** B and E both build on the merged C/D logic. B unblocks the *recovery loop* (the dead email links); E builds reminders/missed-event/portal. **Recommend:** Track A now (cheap, lights the edge), then decide B-vs-E ordering as a deliberate roadmap call — B if the email-link recovery loop is the priority demo; E if reminders/portal are.

---

## Open questions for the operator

- **Q-B1 (gating B1):** confirm the widget already knows its tenant on load + can read a `?session=` param (the frontend explorer couldn't run this session). If a bare uuid is all the redirect can carry, B1 needs a tenant-carrying redirect (D4 could append `&t=<tenant>` — a tiny D4 follow-up).
- **Q-seq:** after Track A, build Track B next, or sub-phase E next? (Both are multi-day; B = recovery loop, E = reminders/portal.)
- **Q-A-now:** is Track A authorized to **execute now** (it's deploy/IaC + a live apply touching the minters via G8), or also plan-only until the B-vs-E call?

---

## Links
- Wave-D-core weave: kanban [`PARALLEL_WORKSTREAMS.md`](PARALLEL_WORKSTREAMS.md) §4.1 + §7 · contracts [`FROZEN_CONTRACTS.md`](FROZEN_CONTRACTS.md) §B9/§B10 · plan [`scheduling_implementation_plan.md`](scheduling_implementation_plan.md) §6
- Merged: lambda #203 (D7) · #204 (D6) · #205 (D4) · picasso #347/#348 (D3) · #352 (weave docs)
