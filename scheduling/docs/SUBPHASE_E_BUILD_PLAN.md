# Sub-phase E — Build Plan (integrator draft, 2026-06-05)

**Status:** DRAFT for operator review. No code started. This plan re-sizes the stale 20–28 day estimate against live ground-truth, decomposes E into file-disjoint workstreams, names the contracts to LOCK before any worker launches, and flags the HIGH-risk audit gates.

**Source of truth:** [`scheduling_implementation_plan.md` §7](scheduling_implementation_plan.md) (the 17-task spec) + [`scheduling_ui_plan.md`](scheduling_ui_plan.md) (Surfaces 1/2/3/7/8/9) + [`scheduling_ci_strategy.md`](scheduling_ci_strategy.md) §5.1 (CI-6). This doc sits on top of them, like `PARALLEL_WORKSTREAMS.md` did for C/D.

---

## 1. TL;DR — the estimate shifted shape, not just size

The original 20–28 day estimate assumed a **backend-heavy** phase (build the whole SMS/reminder/notification stack from scratch). Ground-truth says otherwise:

- **The transactional dispatch foundation is ALREADY SHIPPED** — `SMS_Sender` (Telnyx, E.164, segment calc, consent-gated), `SMS_Webhook_Handler` (STOP/HELP/UNSTOP + delivery events), `picasso-sms-consent` table (TCPA, 4-yr, no TTL), `Scheduled_Message_Sender` + `picasso-scheduled-messages` table, `send_email` (SES + `.ics`), and `notify.js` (§B8). → **E3/E8/E10 backend shrinks 30–40%.**
- **E12 + E15 render-slices already SHIPPED** (dash#5, orphaned/unwired) → the UI track is partly done.
- **BUT the UI/OAuth track is heavier than credited:** E11 (Calendar-Connection OAuth + Secrets Manager + revocation detection) is now the phase's **critical-path long pole**, and **4 of 6 UI surfaces (E11/E13/E14/E16) are 100% greenfield.** The dashboard also has **broken CI** (no vitest runner wired) and **no staging buffer** (merge-to-main = live prod deploy).

**Net re-size:** total effort roughly flat (~22–30 effort-days), but the critical path **moved from reminders-backend → E11-OAuth→E16**. Parallelized across 3–4 workers, wall-clock ≈ **2.5–3.5 weeks** (gated by the UI/OAuth track + CI-6).

**The genuine NEW backend surface is narrow and specific:** per-booking **EventBridge Scheduler rule lifecycle** (create/upsert/delete) — *nobody creates the schedules today; `Scheduled_Message_Sender` only consumes them* — plus the **quiet-hours enforcement gate** (schema exists, never enforced at dispatch).

---

## 2. Ground-truth delta — shipped vs greenfield (with citations)

### Already shipped (E CONSUMES — do not rebuild)
| Surface | What exists | Cite |
|---|---|---|
| SMS send | `SMS_Sender` Telnyx, consent-gated, audit→notification-sends | `Lambdas/lambda/SMS_Sender/index.mjs:186` |
| SMS inbound | `SMS_Webhook_Handler` STOP/HELP/UNSTOP + delivery events → consent update | `Lambdas/lambda/SMS_Webhook_Handler/index.mjs:98,273` |
| TCPA consent store | `picasso-sms-consent` (pk/sk, phone-lookup GSI, 4-yr no TTL) | `infra/modules/picasso-form-tables/main.tf:18` |
| Scheduled dispatch consumer | `Scheduled_Message_Sender` + `picasso-scheduled-messages` (consumes EventBridge Scheduler, renders template, consent-checks, invokes SMS_Sender) | `Lambdas/lambda/Scheduled_Message_Sender/index.mjs:107` |
| Email + `.ics` | `send_email` Lambda, SES SendRawEmail, MIME attachments | `Lambdas/lambda/send_email/lambda_function.py:194` |
| Volunteer notices (§B8) | `notify.js` `dispatchVolunteerNotice()` — live in lifecycle consumers | `Lambdas/lambda/shared/scheduling/notify.js:236` |
| Reminder SMS template | `appointment_reminder` defined (unwired) | `Lambdas/lambda/Master_Function_Staging/notification_templates.json:45` |
| Quiet-hours schema | `notificationPrefs.sms_quiet_hours` (read/write, **NOT enforced**) | `Analytics_Dashboard_API/lambda_function.py:1788` |
| Token library (D) | `tokens.js` — sign/verify/redeem, 6 purposes, one-time-use | §B4 LOCKED; shipped |
| Redemption endpoints (D) | `Scheduling_Redemption_Handler` 6 endpoints incl. stubbed `/attended/*` | lambda#205, LIVE |
| reschedule/cancel exec (D) | `reschedule.js` / `cancel.js` (§B9) | lambda#204/#203 |
| UI render-slices | E12 `MyBookings.tsx` + E15 `SchedulingAnalytics.tsx` (orphaned, no nav, no API) | dash#5 |
| §14.2 listener | 7 typed `booking.*` events, SNS FIFO fan-out, 2 live consumers | just closed this session |

### Greenfield / the genuine new work (E DEFINES + BUILDS)
| Gap | Owner task | Size signal |
|---|---|---|
| **Per-booking EventBridge Scheduler rule create/upsert/delete** | E2/E4 | the core new backend surface — *zero* rule-creation code exists |
| Quiet-hours enforcement at dispatch | E3/E8 | small — gate before `SMS_Sender` invoke |
| Attendance-check rule (end+30min → `pending_attendance` → 3-option) | E5 | moderate |
| 3-option interviewer disposition wiring (D4 stubbed the security path) | E6 | moderate (consumes D tokens) |
| LLM re-engagement copy + compliance injection | E7 | moderate (Bedrock prompt) |
| TCPA opt-in capture at booking end + consent record w/ phone + TTL | E8 | **HIGH-risk**, smaller than planned |
| Missed-event escalation cadence T+24h/72h/7d | E10 | moderate |
| Reconciliation scan (bounded GSI) + EventBridge cleanup + D6-outcome-(ii) | E9 | moderate |
| `text_en` plumbing (3 writers + dashboard read-path) | E1a/E1b | small — **collision risk** (3 shared writers) |
| **E11 Calendar-Connection OAuth UI + Secrets Manager + revocation** | E11 | **HEAVY — critical-path long pole**; blocks E16 |
| E12 nav-wire + `/scheduling/bookings` API + reschedule/cancel/admin-override actions | E12 | moderate (render-slice done; wiring + actions not) |
| E13 team-settings extension (bookable/tags/override) | E13 | moderate, **greenfield + collision risk** (extends 1,400-line `TeamManagement.tsx`; A8 dep) |
| E14 notification-template overrides | E14 | moderate, greenfield |
| E15 historical metrics (volume, no-show rate) — only op-debt shipped | E15 | moderate |
| E16 calendar iframe embed (depends on E11) | E16 | moderate, greenfield |
| CI-6 synthetic monitor (5 cycles, STAGING_TEST_MODE guard) | CI-6 | ~1 week, **gates E exit** |
| Dashboard CI repair (no vitest runner; deploys straight to prod) | infra | ~2–4h, prerequisite for UI merge gate |

---

## 3. Contracts to LOCK before any worker launches (the §E additions)

§B1–B16 are all LOCKED and consumable. E introduces **new surfaces that are currently UNLOCKED** — these must be frozen in `FROZEN_CONTRACTS.md` (new §E section) *before* parallel build, or workers code to a moving target:

1. **§E1 — EventBridge Scheduler rule contract**: deterministic name pattern (`reminder-{tier}-{booking_id}`, `attendance-check-{booking_id}`), the payload fired into the dispatch path (`{pk, sk, message_id}` into `picasso-scheduled-messages`, matching the shipped `Scheduled_Message_Sender` consumer), and the upsert-on-reschedule / delete-on-cancel semantics.
2. **§E2 — Reminder cadence tiers**: the lead-time→reminder-set mapping (≥24h / 4–24h / 1–4h / <1h), read-`start_at`-at-fire-time rule, quiet-hours drop semantics.
3. **§E3 — TCPA consent gate**: where opt-in is captured (booking-end), the consent record shape (reuse `picasso-sms-consent` — already exists; confirm phone-on-record + TTL `now+4yr+30d`), and the pre-send validation contract.
4. **§E4 — Missed-event escalation state machine**: `pending_attendance → {completed,no_show,coordinator_no_show}` + the T+24h/72h/7d silence cadence + no-auto-completion rule.
5. **§E5 — `text_en` write contract**: `text_en = text` (v1), the 3 writer touch-points, dashboard read-path fallback order.
6. **§E6 — Booking row additions**: `is_synthetic` (CI-6 double-gate), reminder-schedule state flags. (Schema-discipline: additive, readers tolerate absence.)
7. **§E7 — `/scheduling/bookings` API contract**: the Analytics_Dashboard_API endpoint shape the UI consumes (query by viewer role, the Booking projection, pagination). Today the UI takes `Booking[]` as a prop with no transport.

**E4-listener tie-in:** the §14.2 `booking.calendar_moved` event already carries `new_start_at` — E4's "re-derive reminders on coordinator move" consumes it. Confirm the consumer→EventBridge re-bind seam in §E1.

---

## 4. Workstream decomposition (file-disjoint slices)

Decomposed by **file ownership**, not task-label count. Collisions merged into one slice; greenfield-vs-shared flagged.

| WS | Tasks | Repo → base | Owns | Risk | Notes |
|---|---|---|---|---|---|
| **WS-E-REMIND** | E2, E3, E4, E9 | lambda → main | new `Reminder_Scheduler/` dir + EventBridge rule lib + reconciler | MED | the core new backend; owns rule lifecycle |
| **WS-E-ATTEND** | E5, E6, E10 + C13 | lambda → main | new `Attendance_*` dir; consumes D tokens (D4 stubbed `/attended/*`) | **HIGH** (commit/disposition + token) | audit-gated |
| **WS-E-TCPA** | E8 | lambda → main | opt-in capture + quiet-hours gate (isolated) | **HIGH** (TCPA, mandatory Security review) | audit-gated; consent table exists |
| **WS-E-COPY** | E7 | lambda → main (or BSH) | LLM re-engagement prompt + compliance injection | MED (prompt-injection-adjacent) | Data-AI-RAG agent |
| **WS-E-TEXTEN** | E1a, E1b | lambda + dashboard | `text_en` across 3 writers + dashboard read | **MED — collision** | 3 shared writers; integrator may own or tightly sequence |
| **WS-E-OAUTH** | E11 | dashboard + lambda + IAM | Calendar-Connection UI + Secrets Manager + revocation | **HIGH** (OAuth/secrets/IAM) | **critical-path long pole; blocks E16**; audit-gated |
| **WS-E-PORTAL** | E12-wire, E13, E14, E15-metrics, E16 | dashboard → (gated) | the 6 Customer-Portal surfaces | MED (E13 collision w/ 1,400-line file) | **no staging buffer — operator-gated merge**; needs CI repair first |
| **WS-E-CI6** | CI-6 | lambda → main | synthetic monitor (5 cycles, prod-guard) | MED | **lands last** — exercises the rest; gates E exit |
| *(integrator glue)* | nav-wire, `/scheduling/bookings` endpoint, EventBridge IAM grants, §E contract locks, dashboard CI repair | — | shared/IaC | — | not a worker slice |

**Collision calls (per the skill — merge or sequence, don't force):**
- **E1a `text_en`** touches BSH + Master_Function + analytics ingestion — three writers other work also touches. → integrator owns E1a directly, or run it **solo/first** before other lambda workers.
- **E13** extends `TeamManagement.tsx` (1,400 lines) and depends on A8 AdminEmployee fields. → sequence after A8 confirmed; do not run concurrently with other team-mgmt edits.
- **E16** uses E11's OAuth refresh token. → sequence after E11.

---

## 5. Dependency / sequencing map

```
                 ┌─ WS-E-REMIND (E2/E3/E4/E9) ──┐
 §E contracts ──▶├─ WS-E-TCPA (E8) ─────────────┤
   LOCKED  +     ├─ WS-E-COPY (E7) ─────────────┤
 dashboard CI    ├─ WS-E-ATTEND (E5/E6/E10/C13)─┤──▶ CI-6 ──▶ E exit
   repair        │     (needs E5 trigger)        │   (exercises
                 ├─ WS-E-TEXTEN (E1) [solo/first]┤    all cycles)
                 └─ WS-E-OAUTH (E11) ──▶ E16 ────┘
                        │
                        └─▶ WS-E-PORTAL (E12-wire/E13/E14/E15)  [operator-gated merge]
```

- **Launch first / solo:** WS-E-TEXTEN (shared-writer collision) + dashboard CI repair (integrator glue).
- **Launch concurrently:** WS-E-REMIND, WS-E-TCPA, WS-E-COPY, WS-E-OAUTH (file-disjoint).
- **Sequenced:** E6 after E5 (attendance trigger); E16 after E11; E13 after A8; WS-E-PORTAL merge after operator go-ahead (live prod deploy).
- **Last:** CI-6 (needs the cycles it exercises to exist).

---

## 6. HIGH-risk audit gates (phase-completion-audit + operator go-ahead, NO auto-merge)

Per the integrator weave protocol + the kanban's full-audit rule (prompt-injection / commit / token / auth / IAM / PII / external surface):
- **WS-E-TCPA (E8)** — TCPA compliance scope: consent capture, STOP/HELP on every message, quiet-hours, 4-yr retention. Mandatory Security-Reviewer.
- **WS-E-ATTEND (E6)** — consumes signed tokens against the disposition path; commit-adjacent state transitions.
- **WS-E-OAUTH (E11)** — OAuth refresh-token storage in Secrets Manager, IAM scoping, mid-session revocation. Mandatory Security-Reviewer.
- **WS-E-COPY (E7)** — LLM output with programmatic compliance injection (verify STOP/unsubscribe always present).

LOW-risk (light verify → merge): WS-E-REMIND, WS-E-TEXTEN, WS-E-PORTAL render work (UI is gated separately by the no-staging-buffer operator-approval, not by risk).

---

## 7. Recommended build mode + first actions

**Recommend: parallel-workstreams** (same framework that built A–D; E has 4+ genuinely independent slices). If you prefer lower coordination overhead, sequential is viable but ~2× wall-clock given E11 is the pole.

**Integrator setup sequence (before launching any worker):**
1. **Lock §E1–§E7 contracts** in `FROZEN_CONTRACTS.md` (new §E section + change-log entry).
2. **Repair dashboard CI** (wire vitest runner + `test` script + a GH Actions job) — prerequisite for any UI merge gate.
3. **Define the `/scheduling/bookings` endpoint contract** (integrator glue; unblocks E12/E15 wiring).
4. Write **work-orders** (OWN/CONSUME/PRODUCE/OUT-OF-SCOPE) + **launch prompts** per WS.
5. Seed the kanban rows in `PARALLEL_WORKSTREAMS.md` (new §E wave block).
6. Launch order: WS-E-TEXTEN solo → then REMIND/TCPA/COPY/OAUTH concurrent → ATTEND (after E5) → PORTAL (gated) → CI-6 last.

---

## 8. Open decisions for operator

- **Q-E1 — Build mode:** parallel-workstreams (recommended) vs sequential?
- **Q-E2 — E11 OAuth scope:** reuse the existing per-coordinator secret pattern (`picasso/scheduling/oauth/{tenantId}/{coordinatorId}`) staff-facing, or is E11 strictly the *UI* over the already-live B5 onboarding API? (Changes E11 from "heavy" to "moderate.")
- **Q-E3 — A8 status:** are the AdminEmployee `scheduling_tags` / `bookable` / `calendar_email_override` fields shipped? E13 is blocked on them.
- **Q-E4 — UI merge gate:** the dashboard deploys straight to prod on merge. Confirm WS-E-PORTAL merges are operator-gated (no auto-merge even when low-risk), consistent with the WS-EUI precedent.
- **Q-E5 — text_en ownership:** integrator builds E1a directly (avoids the 3-writer collision), or a solo-first worker?
- **Q-E6 — CI-6 timing:** build CI-6 last (gates exit) — confirm it's in-scope for E and not deferred to F.

---

## 9. What this plan deliberately does NOT do
- No code. No contracts locked yet (that's integrator setup step 1, after operator review of this plan).
- No prod cutover (staging-only per the whole build; F owns pilot/prod).
- No re-opening the §14.2 listener (closed + proven).
- No editing `pii-inventory.md` without PII-session coordination (E8 TCPA consent + E11 OAuth secrets are PII-inventory surfaces → Living-Inventory Rule applies at build time, coordinated).
