# Scheduling UX & Architecture Decisions (operator session, 2026-06-05)

**Status:** DRAFT for operator review. Captures the product/architecture decisions made in the 2026-06-05 design session so the build codes to a frozen spec, not a chat transcript. Each decision: **Decision · Rationale · Placement · Status.**

**Scope note:** these decisions span more than sub-phase E — several land in C8 (confirmation), D6/D7 (reschedule/cancel), and the new-booking flow (B-remainder / §B16). Placement is called out per decision. Companion doc: [`SUBPHASE_E_BUILD_PLAN.md`](SUBPHASE_E_BUILD_PLAN.md).

**Two auth systems (foundational framing):** **Clerk** authenticates a human *into MyRecruiter* (login/identity/roles). **Google OAuth** is a *staff member delegating access to their own Google Calendar* (read free/busy + write events → a per-user refresh token MyRecruiter stores). They are independent; a staff member is already Clerk-authed when they start the separate Google consent flow.

---

## D1 — Scheduling access: three gates, two flags

**Decision.** Access to scheduling is gated in three steps backed by two distinct flags:
1. **Super-admin grants scheduling** = paid-feature entitlement (**Flag A**, super-admin sets). Scheduling is something clients pay for.
2. **Tenant admin enables it for their org / connects to Google** = **Flag B** (separate, tenant-admin sets) — distinct purpose from Flag A.
3. **Each staff member grants their own Google Calendar access** (per-user OAuth).

**Rationale.** Scheduling is monetized → the entitlement is a super-admin act. The two flags have genuinely different purposes (entitle the feature vs connect the org to Google) and must be independent so config work can happen before any calendar is connected.

**Placement.** Flag A = tenant config, set via super-admin/Config Builder. Flag B = Customer Portal (tenant admin). Gate 3 = **E11**.

**Status.** ✅ Decided. (Confirm exact flag names: proposed `scheduling_enabled` [A] + `calendar_integration_enabled` [B].)

---

## D2 — Google OAuth model (E11)

**Decision.**
- Standard **Google 3-legged, per-user OAuth.** Each staff member consents individually → their own refresh token, stored in **Secrets Manager** at `picasso/scheduling/oauth/{tenantId}/{coordinatorId}`. (Reject Google Workspace domain-wide delegation — too heavy for nonprofit tenants, over-broad impersonation.)
- **One platform-owned Google OAuth app** (one `client_id`/`client_secret`) for all tenants. Consolidate the app credentials out of per-coordinator secrets into one platform secret/env; the per-coordinator secret holds only `{refresh_token, scopes, coordinator_email, calendar_id, connected_at}`.
- **Build the interactive consent flow** (the genuinely new work — today's `test-coordinator` token was hand-provisioned): Connect button → Google consent (`access_type=offline`, `prompt=consent`, signed `state` carrying tenant/coordinator + CSRF) → redirect handler (on the existing `staging.schedule.myrecruiter.ai` D3 domain) → exchange `code` → `refresh_token` → write secret → fire the already-built B5 onboarding (watch channel).
- **Scope minimization:** `calendar.events` + free/busy; avoid full `calendar`.

**Rationale.** Per-user 3LO matches the existing shipped machinery (`Calendar_Watch_Onboarder/oauth-client.js`, the live `freeBusy`/watch-channel layer). The consent flow is the only new piece; everything downstream of holding a token already works. One platform app = standard SaaS, one verification, one rotation point.

**Verification posture.** Calendar is a Google **"sensitive" scope** → production multi-tenant requires the OAuth app be **Verified/"In production."** **For the first test we use the MyRecruiter tenant (operator-controlled) in Testing mode** (7-day refresh-token expiry + 100-test-user cap accepted) → **Google app verification is deferred to Beta**, when a real tenant's staff need to connect. Start verification early then (external review lead time = the long pole, mirrors the D3 ACM-cert lesson).

**Placement.** **E11** (UI + consent endpoints) + integrator glue (redirect handler on the D3 domain; per-secret IAM). HIGH-risk → Security-Reviewer + phase-completion-audit, no auto-merge. PII Living-Inventory surface (refresh tokens) → coordinate with PII session at build.

**Status.** ✅ Decided.

---

## D3 — Bookability: enable-for-all (no per-user toggle)

**Decision.** No explicit per-user "bookable" toggle for v1. **Bookable = (connected calendar) AND (member of ≥1 team that an appointment type routes to).** Connecting a calendar *is* the opt-in. Keep a cheap **admin force-off override** as the on-leave / too-busy escape hatch.

**Rationale.** Team/tag-based routing already gates who receives which appointments (see D4), so "enable for all" is safe — an untagged person receives nothing. A per-user toggle is pure overhead for a small userbase. Mitigate the "connected but gets nothing" confusion with a "you're not on any team yet" warning.

**Placement.** **E13** (drops the bookable-toggle build; adds the force-off override + the two warnings: calendar-required, no-team).

**Status.** ✅ Decided.

---

## D4 — Routing: Teams + Appointment Types, admin-controlled

**Decision.** Present routing to tenant admins as **Teams + Appointment Types**, hiding the routing-policy machinery:
- **Team** = a friendly name for a `scheduling_tag` ("Volunteer Coordinators", "Development Team"). Admin creates teams and assigns staff to them.
- **Appointment Type** = *"who handles this?" → pick a team* ("Volunteer intake → Volunteer Coordinators"; "Donor meeting → Development Team").
- Under the hood this creates the `AppointmentType` + a `RoutingPolicy` (`tag_conditions` = the team, `tie_breaker` = round-robin). **Maps 1:1 onto the shipped tag-based routing — zero backend change** (`resolveCandidates` / `evaluatePool` / `pool.select` already do exactly this).
- Edges (already handled by shipped code): multiple eligible → round-robin; one → pool of one; empty conditions → everyone (solo-org fallback).

**Authorship.** **Tenant admin is the primary author** of teams, appointment types, and team membership (mirrors how admins already manage system notifications + distribution lists in the Customer Portal). **Super-admin (Config Builder) is the fallback/white-glove**, writing the *same* tenant-scoped DDB tables — **no new super-admin UI is built for E.**

**Rationale.** Control over "who handles what" belongs with the admin, not platform ops. The data is already tenant-scoped DDB (`AppointmentType`/`RoutingPolicy` keyed by `tenantId`), and the Customer-Portal admin-CRUD pattern already exists → this is pattern-following, not greenfield. Hiding "routing policies / tag_conditions" keeps it usable by a nonprofit admin (the word "tag" never appears; they think in teams).

**Placement.** **E13** (team membership + per-staff calendar settings) **+ E13b (new sibling surface: Appointment Types + Teams CRUD).** This **grows the UI track by ~one Customer-Portal surface** — see Sizing Impact.

**Status.** ✅ Decided.

---

## D5 — End-user slot UX: conversational default → calendar fallback

**Decision.**
- **Default:** offer choices **in conversation** — date/time **chips or links** — within `proposing` (self-loop accumulates `rejectedSlots[]` to dedupe).
- **Fallback:** when nothing offered fits, **pop a calendar** (pick a day → pick a time). The calendar is the *better* UX here because it cuts the conversational back-and-forth.
- **Guardrails (keep it dead-simple, not Calendly-heavy):** shows **derived available slots only — never the coordinator's raw calendar** (same `generateSlots`/freeBusy machinery, wider paginated window); bounded window; business hours + appointment duration + buffers pre-applied; mobile-first.

**⚠️ Supersedes a prior decision.** The earlier design **dropped `handoff_to_scheduler_page` as a "Calendly-ism"** ([scheduling_design.md:1160](scheduling_design.md)) in favor of a purely conversational tiered fallback. **This decision deliberately reverses that** — the operator prioritizes conversion (fewer round-trips) over conversational purity. The bounded-derived-slots guardrails preserve what that prior decision was protecting (privacy, simplicity).

**Placement.** **Surface 4 / new-booking flow (B-remainder / §B16) — NOT sub-phase E.** Tracked as a parallel UI concern so E stays focused.

**Status.** ✅ Decided (override recorded).

---

## D6 — Robust user-communication lifecycle (four moments)

**Decision.** End-user comms must be robust across **four** moments: **(1) initial schedule / confirmation, (2) reminders, (3) cancellation, (4) reschedule.** Every dispatch primitive already exists (`send_email` + `.ics`, `notify.js`, `SMS_Sender`, `Scheduled_Message_Sender`); the work is **cadence + wiring + content**, not building senders.

**Placement.**
- Confirmation → **C8** (booking-confirmation email + `.ics` via SES — partly shipped; verify SMS branch + tokenized links present).
- Reminders → **E2–E5** (the real new backend: per-booking EventBridge Scheduler rule lifecycle — *nobody creates the schedules today; `Scheduled_Message_Sender` only consumes them*).
- Cancellation → **D7 / listener + `notify.js` `cancel_notice`** (wire the user-facing notice on every cancel path: user-, coordinator-, system-initiated).
- Reschedule → **D6 + `notify.js` `reschedule_link`** (confirm the "new time confirmed" notice fires).

**Robustness model.** Deliverability is already instrumented (SES bounce/complaint via `ses_event_handler`; Telnyx delivery webhooks via `SMS_Webhook_Handler`) → failures are observable, not silent. Reminders idempotent via EventBridge rule + status check (no double-send, no orphan-fire). Every message embeds the tokenized cancel/reschedule links (D token library, shipped).

**Status.** ✅ Decided.

---

## D7 — SMS as a first-class channel (email = floor, SMS = opt-in supplement)

**Decision.** SMS is woven into **all four** comms moments, not just reminders:
- **Email is the floor** (always sent; carries `.ics` + full detail + links). **SMS is an opt-in supplement** (concise + tokenized link) across confirmation, reminders, cancellation, reschedule. **SMS is never the sole channel for confirmation** (the `.ics` needs email).
- **Per moment:** confirmation = email(full)+SMS(short); reminders = SMS primary (higher open rate) / email fallback; cancellation = both; reschedule = both.

**TCPA spine (non-negotiable, every SMS):**
- **Opt-in captured at booking** → **one opt-in covers the whole lifecycle** (all four moments, transactional).
- **STOP/HELP** handled on every message (`SMS_Webhook_Handler` shipped).
- **Quiet hours 8pm–8am recipient-local → drop SMS** (email still goes; never drop email for quiet hours).
- **Consent record holds the phone independently, TTL `now + 4yr + 30d`** — survives booking deletion so a late STOP still routes.
- **Transactional only** — no marketing.

**Channel fallback logic.** opted-in + outside quiet hours → SMS **and** email · opted-in + inside quiet hours → email now, SMS deferred (reminders) / skipped (confirmation) · no consent → email only · SMS delivery fails → email is already the backstop.

**Rationale.** SMS is the highest-engagement channel for time-sensitive appointment comms; the infra (`SMS_Sender` + consent table + `Scheduled_Message_Sender`'s consent-gated dispatch) already exists, so this is wiring + a channel model, not new senders. Email-as-floor guarantees the `.ics` and a no-consent path.

**Placement.**
- **E8** widens from "TCPA opt-in for reminders" → **the consent gate + channel-selection logic for the entire lifecycle.** Remains the HIGH-risk, Security-reviewed slice.
- **C8** (confirmation) and **`notify.js`** (cancellation) each gain a consent-gated SMS branch. Reminder SMS already wired.
- **E14** (template overrides) **un-defers SMS template variants** per moment — and per the admin-control theme, tenant admins can edit the SMS copy too.

**Status.** ✅ Decided (confirmed 2026-06-05, all sub-points): (a) SMS **supplements** email, never replaces it — opted-in users get both, confirmation always also emails for the `.ics`; (b) **one** opt-in at booking covers all four moments (transactional, not per-moment).

---

## D8 — Admin-control theme (cross-cutting)

**Decision.** Push configuration control to **tenant admins** wherever the existing Customer-Portal admin pattern supports it: Teams (D4), Appointment Types (D4), notification templates incl. SMS copy (D7/E14). Super-admin (Config Builder) retains write access to the same stores as fallback/white-glove. Mirrors how admins already manage system notifications + distribution lists.

**Rationale.** Admins are capable (they already run notifications + distribution lists) and closest to the operational reality; platform ops shouldn't be the bottleneck. Reuses an established pattern → low build risk.

**Status.** ✅ Decided.

---

## Sizing impact (vs the SUBPHASE_E_BUILD_PLAN baseline)

| Change | Direction | Note |
|---|---|---|
| E11 reframed as consent-flow over existing OAuth machinery (not a rebuild) | **↓ smaller** | reuse `oauth-client.js` + D3 domain; Testing-mode for the operator-tenant test defers Google verification |
| E13 split → E13 (membership + calendar) **+ E13b (Appointment Types + Teams CRUD)** | **↑ +~1 surface** | pattern-following UI, but real added scope on the UI track |
| E8 widened → lifecycle consent gate + channel logic (not just reminders) | **↑ modest** | infra exists; logic + Security review grows |
| E14 un-defers SMS template variants | **↑ modest** | per-moment SMS copy, tenant-editable |
| Surface 4 calendar fallback | **↑ new, NOT E** | B-remainder / §B16; tracked separately |

**Net:** the UI track remains the critical path; D4's E13b + the Surface-4 calendar add the most. The reminder/SMS backend stays compressed (foundation shipped). Re-cost at integrator setup.

---

## Open items (carry into integrator setup / next session)

- **O1** — Confirm flag names: `scheduling_enabled` (A) + `calendar_integration_enabled` (B)? (D1)
- ~~**O2** — Confirm the two D7 sub-points~~ → ✅ RESOLVED 2026-06-05 (confirmed: supplements-not-replaces; one opt-in covers all four).
- **O3** — Surface 4 calendar fallback: schedule it into the B-remainder thread (it's not E) — when?
- **O4** — Google app verification: operator task, start at Beta entry (deferred per D2). Track as an external-lead-time item.
- **O5** — E13b authorship boundary: tenant admin primary, super-admin Config-Builder fallback — confirm no new super-admin UI is in E scope.

## What this doc does NOT do
- No code; no contracts locked (that's integrator setup, after this is approved).
- No prod cutover (staging-only; F owns pilot/prod).
- The §E contract locks (EventBridge rule naming, cadence tiers, TCPA gate, channel-selection, `/scheduling/bookings` API) still need to be written into `FROZEN_CONTRACTS.md` before any parallel build — these decisions are inputs to that.
