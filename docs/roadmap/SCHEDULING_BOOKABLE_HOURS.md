# Scheduling Bookable Hours — Design & P1

**Status:** P1 BUILT 2026-07-04 (ADA + dashboard PRs; this doc records the agreed model)
**Origin:** 2026-07-03 scheduling dead-air incident → design conversation, Chris + build lead, 2026-07-04
**Decision owner:** Chris (model approved verbatim in chat, 2026-07-04)

---

## The problem

`shared/scheduling/slots.js` (generateSlots) hard-requires `availability_windows` and
`timezone` on every appointment type — and **no product surface wrote either field**. Every
dashboard-created appointment type was born unbookable; the in-chat agent's slot lookup
failed on all of them (the 2026-07-03 dead-air incident).

## The agreed model — two layers, one of them is just the calendar

**Layer 1 — the org's outer bound (admin-set, appointment type).** A Calendly-style weekly
grid on the appointment type: per-day on/off + hour range(s), in the appointment type's
IANA timezone. "Intro calls happen M–F 9–5 Central." Admins set it in the dashboard's
Scheduling §2 editor; it is the *event type's* schedule, not a personal one.

**Layer 2 — each coordinator's real calendar.** FreeBusy against the connected Google
calendar already filters slots inside the outer bound. Meetings, out-of-office, and blocked
time make a person unbookable with no product surface at all. A part-timer who works
Tue/Thu expresses that with recurring busy blocks — a workflow every Workspace user knows,
visible to their whole team, honored by every tool they use.

**Explicitly rejected: a personal hour-picker (self-service or otherwise).**
Coordinators have portal access (metrics, submissions, light CRM) but availability is not a
portal concern: a picker would be a second source of truth only our engine respects, and its
failure mode is invisible slot starvation ("why isn't Maya bookable?" with no legible
answer). With calendar-as-truth the answer is always *look at her calendar*. Precedent:
Calendly's unit is the individual so it needs personal schedules; the org-pool analogs
(Microsoft Bookings, Google appointment schedules) default to business hours + calendar
busy, which is the dominant real-world configuration.

**Dormant engine hook (kept, not surfaced):** the candidate pool already intersects
per-person `availability_windows` + honors `max_bookings_per_day` from the employee
registry row (G4/G5) when present. If a real need emerges, the cheap v2 is an **admin-set**
per-person hours field in the §1 person-edit modal — hours are org decisions; personal
exceptions stay on calendars. NOT a self-service picker.

## P1 (built 2026-07-04)

- **ADA** (`Analytics_Dashboard_API`): appointment-type write accepts + validates
  `availability_windows` (day keys `sun..sat` = slots.js DAY_KEYS; HH:MM ranges, sorted,
  non-overlapping, ≤4/day) and `timezone` (IANA, zoneinfo-validated when the runtime has
  tzdata; shape-checked otherwise — the Node engine re-validates via Intl at propose time).
  **Create defaults when absent: M–F 09:00–17:00 + `America/New_York`** — "never born
  unbookable". PATCH without the fields leaves them unchanged (agenda pattern).
- **Dashboard** (Scheduling §2 editor): "Bookable hours" block — timezone `<Select>`
  (prefilled from the admin's browser zone) + Mon-first day rows (checkbox + start/end time
  inputs). One range per day in the UI (schema allows more; a multi-range day loaded from
  the API is preserved unless edited, shown as "+N more"). Save disabled when nothing is
  bookable or a range is inverted. **Opening a legacy row pre-fills defaults so a plain
  re-save heals it.**
- Engine, BCH, BSH: **zero changes** — they already consumed these fields.

## Operational notes

- Legacy rows (created before P1) stay unbookable until re-saved through the editor —
  after the dashboard deploy, open each appointment type and hit Save. (Staging test
  tenant's `intro-call` was hand-seeded 2026-07-03 during the incident and is already live.)
- A propose failure no longer dead-airs the widget (lambda#373): the visitor gets the
  "we'll follow up" fallback line.

## Deferred (revisit only on real demand)

- Multi-range-per-day editing in the UI (split shifts) — schema + server already accept it.
- Admin-set per-person hours (§1 person-edit modal) — the dormant G4 hook.
- Date-specific overrides — deliberately NOT planned; "block it on your calendar" is the answer.
- Timezone list beyond US zones + UTC — the picker prepends any unlisted zone already on a row.
