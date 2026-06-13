# Scheduling v1 — Gap-Closure Build Plan (backend; UI deferred)

**Status:** planning doc, 2026-06-13. No code yet. Authored from the canonical-self-scheduling gap map (Calendly + Google Workspace appointment schedules) vs the shipped Picasso scheduling engine, ground-truthed against lambda `origin/main`.
**Operator directive (2026-06-13):** build the obvious functional gaps now; **defer all UI** (operator is walking the UI surface-by-surface separately). This plan is backend + data-model only.
**Re-verify before building:** every code claim cites a snapshot as of 2026-06-13 — confirm against live `origin/main` first.

---

## Scope

**In scope (the functional gaps):** G1–G5 below. All backend / data-model / engine. Each is additive and forward-compatible (CLAUDE.md schema discipline — old-shape readers must not break).

**Explicitly deferred (NOT this plan):**
- **All staff/admin UI** — operator's hands-on pass owns it. Where a gap needs a value set before its UI exists, it is set via seed/config/Sandbox script (same pattern as the test fixtures), not a new screen.
- **Date-specific time-off** (vacation/holidays) → handled by the staff blocking time in Google for v1 (Google free/busy already subtracts it). Revisit if pilots need in-Picasso overrides.
- **F0 PII deletion** → handed to the PII session (`docs/roadmap/PII-Project/F0_SCHEDULING_IDENTITY_DELETION_BRIEFING.md`).

## Decisions

- **Google owns the invite + RSVP** (operator-decided 2026-06-13). Confirmed cheap: the attendee is *already* on the event (`calendar-events.js:73`); the event-write just never sets `sendUpdates`, so Google stays silent today. G3 flips that.
- **Picasso owns all proactive messaging** (reminders / cancellations / rebookings) — editable + SMS, which Google's appointment-schedule reminders structurally are not.
- **Per-staff availability = intersection, which makes "narrow-within-guardrails" automatic** (G4). Effective windows = staff windows ∩ appointment-type windows ∩ Google free/busy. A staff member can only *narrow* the admin envelope (intersection can't add hours the type doesn't offer), so the earlier narrow-vs-free decision resolves itself — no separate clamp logic.

---

## Gap items

### G1 — Reminder body enrichment (links + time + join)  · risk LOW · no UI
**Gap:** the reminder body today is bare — `"Reminder: your {type} with {org} is coming up {tomorrow/in an hour}."` (`Reminder_Scheduler/scheduler.js` `reminderBody` ~L121). No reschedule/cancel links, no actual time, no join link.
**Build:** enrich the composed body with (a) the appointment time (read at fire-time per the existing pattern), (b) the join URL, (c) the **tokenized** reschedule + cancel links (§B4 `tokens.js`; burned on action not view, expiry covers the meeting window → the same token may also ride the Google invite, G3). Honor §E14 override-or-default.
**Files:** `Reminder_Scheduler/scheduler.js` (body composition) + token minting dep; `Scheduled_Message_Sender` if any link rendering happens at fire-time.
**Done-bar:** a fired reminder (email + SMS) contains time + join + working reschedule/cancel links; tokens validate one-time; jest covers body shape + no-PII log; §E14 override still wins.
**Gate:** light verify; SMS path touches consent rendering → confirm STOP/HELP footer still appended (TCPA).

### G2 — Appointment-type `agenda` + render into Google event description  · risk LOW · no UI (set via config for now)
**Gap:** the event description today is `"Attendee: {fullName}\nManage this booking: {auth-gated deep link}"` (`calendar-events.js:62–70`) — no agenda, and the only "manage" link is **auth-gated** (works for logged-in staff, useless to a logged-out guest).
**Build:** add an optional `agenda` (a.k.a. `event_description_template`) field to the AppointmentType row (variables: org / attendee first name / type). Render it into BOTH (a) the **`.ics` DESCRIPTION** the guest receives (`confirmation-email.js:100` already emits a DESCRIPTION line — this is the guest-facing one per the corrected G3) and (b) the **API event description** (`calendar-events.js`, coordinator-facing). Keep both in sync.
**Files:** AppointmentType schema (FROZEN_CONTRACTS §A — integrator) + `confirmation-email.js` (.ics DESCRIPTION) + `calendar-events.js` (API event description) + `scheduling-propose.js`/commit context if the agenda needs to surface pre-book.
**Done-bar:** an appointment type with an `agenda` produces a Google event whose description carries the agenda; absent → today's behavior byte-identical (old-shape test). No attendee PII beyond what's already there.
**Gate:** light verify. Living-inventory: no new PII field (agenda is config text).

### G3 — Keep Picasso's .ics invite; fix its two rough edges in place (do NOT switch to Google-native)  · risk MED · verify-first DONE
**Current state (corrected 2026-06-13 from operator screenshot + `confirmation-email.js`):** Picasso ALREADY sends a real, cross-provider calendar invitation — `confirmation-email.js` builds an `.ics` with `METHOD:REQUEST` + `ORGANIZER:mailto:<coordinator>` + `ATTENDEE;RSVP=TRUE:mailto:<guest>` (L88–103), which renders the RSVP YES/MAYBE/NO card and adds to the guest's calendar. It carries join + tokenized reschedule/cancel links. Google's own API event is created **silently** (`insertEvent` never sets `sendUpdates`) — so there is exactly ONE invite (ours), no duplication. **Decision (operator 2026-06-13): keep this — it works, it's provider-neutral, and we control its content. Do NOT turn on Google `sendUpdates` (that would send a SECOND, duplicate invite) and do NOT cede to Google's plain native invite.**
**Two real rough edges to fix IN PLACE:**
  1. **Deliverability/spam** — the screenshot's invite was `notify@myrecruiter.ai` (hardcoded fallback) and spam-flagged. The aligned sender (`notify@staging.myrecruiter.ai`, lambda#315/#551) should fix this; the spammed sample is Jun 12 (likely pre-deploy). **Action: re-test a fresh booking and confirm the From is the aligned sender + not spam-flagged.** If it still spams, that's a sender/DKIM task, not an invite-architecture one.
  2. **RSVP round-trip (optional for v1)** — the .ics `UID` is `<bookingId>@myrecruiter.ai`, distinct from the coordinator's Google API-event id, so a guest's RSVP doesn't attach to the coordinator's real event. **Fix (if we want decline→reconcile): unify the UID** — set the API event's `iCalUID` to `<bookingId>@myrecruiter.ai` on insert (or read the API event's iCalUID and use it in the .ics) so the guest's invite and the coordinator's event are the same calendar object → native RSVP/decline round-trips into the existing `attendee_declined → canceled` listener. For v1 this is a nice-to-have (the booking is already human-confirmed); defer if scope is tight.
**Also (small, data):** the sample said "...with **the team**" — `organization_name` is defaulting; ensure the tenant's real org name flows into the .ics summary/body/description.
**Files:** `confirmation-email.js` (sender already env-driven; UID unification if pursued), `calendar-events.js` (`iCalUID` on insert if unifying), tenant config (org name).
**Done-bar:** a fresh real booking → ONE calendar invitation from the aligned sender, not spam-flagged, correct org name; (if UID-unify done) guest decline reconciles via the listener. No second/Google invite appears.
**Gate:** light–full verify (deliverability re-test is the gate; UID unification touches the commit/event path → phase-completion-audit if pursued). Independent of G2 (agenda enriches the same .ics/description).

### G4 — Per-staff availability (the one real limb)  · risk MED (slot/routing engine) · UI deferred
**Gap:** the work-week/hours live on the *appointment type* (admin), not the person. No per-staff availability — individual variation comes only from Google free/busy, which can't express "free but not bookable."
**Build:** add optional `availability_windows` to the **AdminEmployee/staff record** (same `{mon:[{start,end}],…}` shape as the appt type). In the pool's per-resource loop, compute **effective windows = staff windows ∩ appointment-type windows** and pass those to `generateSlots` (then ∩ Google free/busy as today). Absent staff windows → use the appt-type windows unchanged (current behavior).
**Files:** AdminEmployee schema (integrator) + `shared/scheduling/pool.js` (per-resource window intersect) + possibly `shared/scheduling/slots.js` (accept pre-intersected windows). NO change to the slot-chip shape.
**Done-bar:** a staff member with their own narrower windows yields only slots inside staff ∩ type ∩ free/busy; **regression-pinned: with no staff windows, slot output is byte-identical to today** (the agentic + deterministic + day-picker paths all consume this engine — this is the load-bearing safety test). Diverse-3 sampling (§B18a) still works on the narrowed candidate set.
**Gate:** phase-completion-audit (shared engine, multi-consumer blast radius). The byte-identical-default regression test is non-negotiable.
**UI deferred:** set staff windows via a Sandbox/config script for now; the staff-availability screen is the operator's UI pass.

### G5 — Max-bookings-per-day limit  · risk LOW–MED · UI deferred
**Gap:** a canonical primitive (Calendly "meeting limits", Google "max bookings per day") we don't model — nothing caps how many appointments a staff member / appointment type takes in a day.
**Build:** add an optional `max_bookings_per_day` limit (decide scope: per appointment type vs per staff — recommend **per staff** to match the "protect my day" intent) and enforce it in slot generation / at commit (a day already at cap yields no further slots).
**Files:** schema (integrator) + `shared/scheduling/pool.js`/`slots.js` (filter) and/or commit-time guard.
**Done-bar:** with cap=N, the (N+1)th slot on a day is not offered / not committable; absent → unlimited (current behavior); regression-pinned.
**Gate:** light–full verify depending on whether enforcement touches the commit path.

---

## Sequencing & parallelization

Mostly file-disjoint → a small parallel build:
- **Lane A (messaging):** G1 + the G3 description-links (Reminder_Scheduler + calendar-events description).
- **Lane B (engine):** G4 + G5 (pool.js / slots.js) — same files, so **one lane, sequential** (G4 then G5) to avoid self-collision.
- **Lane C (event/invite):** G2 then G3 (calendar-events.js + commit) — G3 after G2.
Integrator owns all FROZEN_CONTRACTS §A schema additions + the kanban. G3 and G4 are the audited HIGH-attention weaves; G1/G2/G5 are lighter.

**Dependencies:** G3 ⟵ G2 (description). G3 links + G1 links share the §B4 token-minting helper — build the helper once, both consume. G5 ⟵ G4 (same engine files).

## Gates (summary)
- **HIGH-attention (phase-completion-audit + operator go, no auto-merge):** G3 (commit path + guest comms), G4 (shared engine, multi-consumer).
- **Light verify:** G1, G2, G5.
- **Schema discipline on every item:** new fields optional; old-shape reader tests required; FROZEN_CONTRACTS §A updated in the same PR; pii-inventory only if a new PII field appears (none expected — all additions are config/availability, not personal data).

## What "done" buys
Closes the functional delta to the Calendly/Google baseline: real reminders with action links, Google-native invites carrying the agenda + guest self-serve, genuine per-staff availability, and per-day limits — leaving only the **UI polish pass** (operator-owned) and **F0** (PII session) between here and a pilot.
