# Audit: scheduling parity — Messenger (FB/IG DM) vs the web widget (2026-07-14)

> Decision-support before turning scheduling on for the Messenger channel. **Both channels commit through the same `Booking_Commit_Handler` and the same `shared/scheduling/*` engine** — so the *outcome* (calendar event, conference link, confirmation email, reminders) is identical. The divergence is entirely in the **front half**: how a visitor is driven from intent to a committed slot. Messenger is a deliberate **v1 subset**.
>
> Citations are `Meta_Response_Processor/schedulingDriver.js` + `index.js` (`origin/main`). The headline finding (§ "What will surprise an operator" #2) was line-verified; the rest is a cited audit — see § Confidence.

## What will surprise an operator (read this first)

1. **Typing "book an appointment" in a DM does *nothing* schedule-y.** New bookings in Messenger start **only** from a button tap (a `start_scheduling` CTA / `PIC1:sched:start` payload; `index.js:2678–2710`). Free text goes to the KB. Only the **website widget** lets a visitor start booking by typing (its agentic path). A tenant who tests by *typing* will think scheduling is broken.
2. **With 2+ appointment types, scheduling silently won't start** unless each `start_scheduling` CTA carries a `program_id` matching a type. `resolveAppointmentTypeId` returns `null` for "2+ types, no program_id match" and the tap **falls through to a normal KB answer** instead of booking (`schedulingDriver.js:506–517`, verified). The widget would *ask* which type. **→ Mitigation: give every scheduling CTA a `program_id`.**
3. **Reschedule/cancel only works ~7 days, in the same DM thread, for the most recent booking.** Messenger tracks exactly one `last_booking` row (7-day TTL); older bookings are unaddressable, and there is **no email-link or admin-portal reschedule reachable *from* Messenger** (`schedulingDriver.js:194–198`). Widget bookings get signed email links + portal management.
4. **Slot times are shown in the org's configured timezone, not the visitor's.** Meta has no in-DM JavaScript, so Messenger can't read the visitor's device timezone — every slot is labeled with the business tz (e.g. "2:00 PM ET") rather than auto-localized (`schedulingDriver.js:60–65`). Correct + labeled, but the visitor does the mental conversion.
5. **The post-booking "what would you like to discuss?" prep note is never asked in Messenger** — that capture is widget-only. Coordinators relying on it won't get it from DM bookings.

## Parity table

| Capability | Web widget | Messenger (FB/IG DM) | Verdict |
|---|---|---|---|
| Start a new booking | Agentic NLU ("I'd like to book") **+** CTA click | **Button/payload only** (`start_scheduling` CTA); free text → RAG | Partial (v1) |
| Appointment-type resolution (2+ types) | Conversationally disambiguates | CTA `program_id` match, or sole type, else **null → declines to RAG** | Partial (v1) |
| Availability presentation | Client-rendered chips, unlimited | 1 numbered text msg + carousel **≤10 cards** (Meta cap) | Partial (v1) |
| Slot selection | Tap a chip | Tap a card **or** reply the slot number | Parity |
| Contact capture (email/phone) | Form/typed | Staged: email → phone → confirm (reuses form validators) | Parity (mechanism differs) |
| Phone requirement | Per config | **IG: mandatory; FB: skippable** ("skip") | Partial (platform) |
| Confirmation / commit | `Booking_Commit_Handler` | **Same** BCH; inline conflict auto-retry on `SLOT_UNAVAILABLE` | Parity |
| Reschedule | In-chat + signed email links + portal | **Single latest booking, ≤7d, same DM**, in-chat only | Partial (v1) |
| Cancel | In-chat + email links + portal | Same 7-day / single-booking constraint | Partial (v1) |
| Manage older / multiple bookings | Any booking via token/portal | **Not in Messenger** (only the latest is tracked) | Not in Messenger |
| Manage-intent detection | Agentic/structured | **Keyword regex** (can false-positive) | Partial |
| Post-booking prep note | Captured next turn | **Not in Messenger** | Not in Messenger |
| Reminders / follow-ups | Scheduled at commit (BCH) | **Same** (inherited); SMS-consent recorded | Parity* |
| Message tokenization | In-chat tokens + email tokens | Email tokens inherited; in-DM copy via `messenger_behavior.strings.*` | Partial |
| Program binding | Session-binding rows | CTA `program_id` → type match only | Partial (v1) |
| Timezone | Auto-localized to device | **Business tz, labeled** (no client JS) | Partial (v1) |
| Escalation during scheduling | Supported | Supported; escalation leaves the session intact | Parity |
| Meeting location (Meet/Zoom) | `conference_type` at commit | **Same** (inherited) | Parity |
| Group mode / seat capacity | Does not exist (Phase 2+) | Does not exist | N/A |
| Feature gating | `scheduling_enabled` | `scheduling_enabled` **AND** `MESSENGER_CHANNEL` **AND** state table **AND** wired BCH | Partial (stricter) |

\* Reminders are inert on *both* channels until `SCHEDULER_TARGET_ARN` is set on BCH — equal for both.

## Why it differs (load-bearing, mostly Meta-platform)

- **Button-only new-booking entry** — a v1 scope choice (no NLU booking entry on Messenger).
- **v1 SIMPLE type resolution** — resolves by CTA `program_id` or sole type; declines otherwise rather than guess.
- **No client timezone** — irreducible on Meta (no in-DM JS) → business-tz-labeled times.
- **Meta surface caps** — carousel ≤10, quick-reply/title/button limits.
- **Server-side session state, short TTLs** — no client to hold flow state: an active `scheduling_session` (1-hr idle TTL) + a `last_booking` row (7-day TTL) that is the *only* handle to a past booking → time-boxed, single-booking manage.
- **IG phone mandate / FB skip** — IG has no post-window SMS-free reminder lane.
- **Mutate subset** — Messenger uses `reschedule` + `cancel`; never mints the `reschedule_link` self-serve email path the widget/portal use.

## Practical guidance (to get the best Messenger scheduling experience)

- **Give every `start_scheduling` CTA a `program_id`** that matches an appointment type — this is the single most important config step; without it, tenants with multiple types get silent RAG fallbacks (surprise #2).
- **Set expectations in copy** (via `messenger_behavior.strings.*`) that times are in the org timezone.
- **Don't rely on Messenger for**: managing bookings older than ~7 days, prep-note capture, or letting visitors *type* their way into a booking — route those through the widget/portal/email links.
- Treat Messenger scheduling as **"tap-to-book + short-window self-manage,"** not a full clone of the widget's agentic scheduling.

## Confidence & method

- **Line-verified:** `resolveAppointmentTypeId` (2+ types → null; `schedulingDriver.js:506–517`).
- **Explicit-in-code (high):** carousel ≤10, timezone labeling, IG/FB phone asymmetry, the 7-day single-`last_booking` model, keyword (not NLU) manage detection, structured-only new-booking entry, the 3 extra Messenger gates, shared commit/mutate backend.
- **Absence-based (medium-high):** "no prep note in Messenger" / "no free-text booking entry" inferred from absence of any such handling in the self-contained Meta driver + wiring (not an exhaustive read of the 2700-line `index.js`).
- **Widget side (medium):** read the headers/exports of `schedulingFlow.js`, `agentTurn.js`, `newBookingEntry.js`, `postBookingPrepNote.js` + roadmap docs, not every line.
- None of this is live-proven — the Messenger channel isn't activated/soaked; this is a code-level parity read to inform activation.
