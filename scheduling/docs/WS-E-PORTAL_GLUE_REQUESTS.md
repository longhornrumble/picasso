# WS-E-PORTAL → integrator: glue requests + proposed shapes

**From:** the WS-E-PORTAL worker. **Status:** request per FROZEN_CONTRACTS §C (worker posts the ask; the integrator owns + builds the glue, then locks the shape in `FROZEN_CONTRACTS.md`). **NOT a contract edit.** Each ask gives a concrete proposed shape so (a) the integrator can build to it and (b) my UI is a one-line wire when it lands — exactly how §E7 (dash#11) and §E13b (#13) went.

## Status update 2026-06-08 (close-out session)
G1/G2/G4/G5 all RESOLVED + deployed. G3 RETIRED (E16 CUT by operator). **Two NEW asks added: G6 (E12 booking actions — v1-MUST) and G7 (E14 SMS — operator pulled into v1).** Both are the gating backend work for a real WS-E-PORTAL "done."

## Shipped so far (no ask — context)
- **#11** E12/E15 nav + bookings (§E7, live). **#12** E15 metrics (client-derived). **#13** E13b Appointment Types + Teams (§E13b / lambda#258). **#14** E13 per-staff. **#15** E14 email templates. **#16** recovery (re-landed #12–#15). All MERGED to `main`.

## Asks (priority order)

| # | Surface | Glue needed | Priority | Status |
|---|---|---|---|---|
| G1 | E13 per-staff settings | employee scheduling-field read+write + tag-vocab read | HIGH | ✅ RESOLVED — lambda#259 (§E13c) |
| G2 | E14 template overrides | scheduling-template read/write | MED | ✅ RESOLVED — lambda#261 (§E14, **EMAIL only**) |
| G3 | E16 calendar embed | connection-status `calendar_id` | LOW | ❌ RETIRED — **E16 CUT** by operator 2026-06-07 (calendar_id shipped #267, now sunk) |
| G4 | E13b tag dropdown | `GET /scheduling/tag-vocabulary` | LOW | ✅ RESOLVED — lambda#259 (§E13c G4) |
| G5 | E15 richer metrics | `GET /scheduling/metrics` | LOW | ✅ RESOLVED — lambda#268 (per-type + status; `time_to_book`/`reschedule_rate` UNAVAILABLE by design) |
| **G6** | **E12 booking ACTIONS** | **cancel-with-reason + reschedule-link + admin overrides endpoint** | **HIGH (v1-MUST)** | 🔴 OPEN — endpoint does NOT exist |
| **G7** | **E14 SMS variants** | **extend §E14 to SMS templates** | **HIGH** | 🔴 OPEN — operator pulled SMS into v1 (2026-06-08) |

---

### G1 — E13 per-staff scheduling settings (Surface 3 / A8) — **HIGH** · ✅ RESOLVED (lambda#259 / §E13c)
**Why blocked:** §E13b shipped Appointment Types + Teams, but a Team = a `scheduling_tag` and **nothing assigns that tag to staff yet** → a created team routes to nobody. ui_plan Surface 3 + the §8 permission matrix define this surface; the registry fields are already specified in `scheduling_config_schema.md` v1.5 (`scheduling_tags`, `calendar_email_override`). No employee-scheduling-field write endpoint is deployed (verified: not in lambda#258, no other merged PR).

**Ask (mirror the §E13b pattern — ADA, Clerk-authed, fail-closed vocab validation):**
```js
// A8 registry fields (additive; readers tolerate absence):
//   scheduling_tags: string[]          // ADMIN-curated (§8 matrix)
//   calendar_email_override?: string   // STAFF-editable (own) or admin
//   bookable_override?: 'off' | null   // ADMIN force-OFF only; `bookable` itself is DERIVED (D3: connected-cal AND on ≥1 team) — never written here
//   modified_at: { at, by }            // same optimistic-lock token as §E13b
//
// READ: include the 3 fields in the existing employee projection (fetchTeamMembers / fetchAdminTenantEmployees).
// WRITE: EXTEND the shipped PATCH /admin/employees/{tenantId}/{employeeId} (updateAdminEmployee) to accept
//        scheduling_tags / calendar_email_override / bookable_override.
//   - scheduling_tags validated against scheduling.scheduling_tag_vocabulary (config S3) FAIL-CLOSED → 422 {unknownTags}
//     (reuse the §E13b _validate_tag_conditions vocabulary read).
//   - role: scheduling_tags + bookable_override = ADMIN-only; calendar_email_override = self-or-admin (§8 matrix).
```
**When it lands:** I build the E13 surface (extend the new "Scheduling" Settings sub-tab, or a per-staff column on the team list — NOT editing TeamManagement.tsx per SEAM-5) — list staff, edit their tags/override. One-line wire to the extended PATCH.

---

### G2 — E14 notification-template overrides — **MED** · ✅ RESOLVED (lambda#261 / §E14, EMAIL only — SMS now requested separately as G7)
**Why blocked:** the §E13b OUT-note says *"E14 reuses the shipped `PATCH /settings/notifications/templates/{form_id}` (no new endpoint)"* — but that store is **form-keyed**, and E14 needs **scheduling-moment** templates (confirmation / reminder_24h / reminder_1h / cancellation / reschedule / missed_event_reengagement), each with email{subject,body} + an SMS variant (D7). I can't tell from the dashboard whether scheduling templates live in that store.

**Ask — one decision + (if needed) a shape:**
1. **Where do scheduling-moment templates live?** Either (a) confirm a reserved key/namespace in the existing notification-template store + the read endpoint that returns them, OR (b) a small scheduling-template read/write:
```js
// GET  /scheduling/notification-templates → { templates: { <moment>: { email:{subject,body}, sms?:{template} } }, defaults }
// PUT  /scheduling/notification-templates (ADMIN) → upsert overrides over platform defaults
//   moments: confirmation | reminder_24h | reminder_1h | cancellation | reschedule | missed_event_reengagement
```
2. **STOP/HELP invariant** on every SMS template (D7) — confirm it's re-injected server-side (so the editor can't remove it) and coordinate with WS-E-TCPA (which owns the consent/footer spine).

**When decided:** I build the E14 override editor (extend the existing notification-templates UI surface, "overrides only" per SEAM-5) against whichever path you confirm. No fork until you answer (1).

---

### G3 — E16 calendar embed (Surface 9) — ❌ RETIRED (E16 CUT by operator 2026-06-07)
**Cut rationale (operator):** the read-only Google calendar iframe for a staff member = vanity / embedded tech-debt. My Bookings' "Open in Google Calendar" deep-link already covers the real need (jump to the appointment in the primary calendar, where two-way sync is authoritative). **Sunk cost:** G3's connection-status work shipped `calendar_id` in `/connection/status` (lambda#267) before the cut — note it, do not build E16 against it. No further E16 work.

---

### G4 — `GET /scheduling/tag-vocabulary` — **LOW** · ✅ RESOLVED (lambda#259 / §E13c G4)
E13b currently takes a team tag as **free-text**, validated fail-closed on save (422). A read endpoint:
```js
// GET /scheduling/tag-vocabulary → { scheduling_tag_vocabulary: string[] }   (reads config S3; staging read-only OK)
```
would let both E13b (team creation) and E13 (G1, staff tagging) offer a **dropdown** instead of free text. Pure UX; the fail-closed server validation stays authoritative either way.

---

### G5 — `GET /scheduling/metrics` — **LOW** · ✅ RESOLVED (lambda#268)
Deployed shape: `{ window, total, by_status, by_type:[{appointment_type_id,count,by_status}], unavailable:["time_to_book","reschedule_rate"] }` (ADMIN-only, feature-gated, bounded `tenantId-start_at-index`). **`time_to_book` + `reschedule_rate` are deliberately UNAVAILABLE** — no proposal-start timestamp / no `reschedule_count` on the row; surfaced under `unavailable` so the UI hides them (matches operator steer 2026-06-08: don't scope metrics we don't collect). The one natively-collected richer metric to surface = **per-appointment-type no-show** (`by_type` joined to `GET /scheduling/appointment-types` for names).

---

### G6 — E12 booking ACTIONS (Surface 2 / AC#18) — **HIGH (v1-MUST: cancel-with-reason)** · 🔴 OPEN
**Why blocked:** E12 My Bookings shipped read-only (list / filters / status chips / "Open in Google Calendar" deep-link / §E7 live data). The per-card **ACTIONS** were never built and have **no backend endpoint** (verified absent in §E + every lambda PR ≤#268, 2026-06-08):
- **cancel-with-reason** — Surface 2 **v1-MUST**
- **reschedule-link** — Surface 2 **v1-should** (sends a token link to the GUEST, who picks — NOT the staff picking a time)
- **admin overrides** (cancel-on-behalf + trigger-reschedule for OTHER staff's bookings) — **AC#18**

The underlying logic already exists as shared modules — `shared/scheduling/cancel.js` (WS-D7 `executeCancel`), `reschedule.js` (WS-D6), §B4 reschedule-token mint, `notify.js` `reschedule_link` dispatch — but is wired **ONLY into the in-chat WS-CONVO flow**. There is no portal HTTP surface.

**Ask — two ADA endpoints, Clerk-authed, auth/scope mirroring §E7:**
```js
// POST /scheduling/bookings/{booking_id}/cancel   body={ reason: string }
//   permission: staff may cancel their OWN booking (assigned_staff_id == claims.sub);
//               ADMIN may cancel ANY (§8 "cancel-on-volunteer's-behalf" override). 403 otherwise.
//   action: fire events.delete on booking.external_event_id (reuse shared/scheduling/cancel.js executeCancel) →
//           the calendar listener flips Booking.status=canceled + dispatches cancel_notice. Persist cancel_reason.
//   → 200 { booking_id, status:'canceled' }   (or 202 { status:'pending_calendar_sync' })
//
// POST /scheduling/bookings/{booking_id}/reschedule-link   (no body)
//   permission: staff OWN booking; ADMIN any (AC#18 admin trigger-reschedule).
//   action: mint a fresh `reschedule` JWT (§B4; jti → picasso-token-jti-blacklist) +
//           dispatch notify.js `reschedule_link` to the GUEST.
//   → 200 { booking_id, sent:true }
```
**⚠ Integrator note (cross-language):** §E7 read lives on ADA (**Python**); cancel.js / reschedule.js / notify.js are **Node**. Integrator decides whether ADA performs events.delete + token-mint + notify directly in Python, or proxies to a Node action Lambda. The dashboard only consumes the HTTP shapes above — architecture is yours.
**Permission source:** §8 permission matrix (`Cancel-on-volunteer's-behalf (Surface 2 admin override)` = staff ❌ / admin ✅). Confirm exact rows for the own-booking case.
**When it lands:** I wire the `BookingCard` actions one-line — cancel modal (reason required) + reschedule-link button, both role-gated. (`BookingCard.tsx:11` already documents these as the deferred slice.)

---

### G7 — E14 SMS template variants — **HIGH** · 🔴 OPEN (operator pulled SMS into v1, 2026-06-08)
**Why:** §E14 shipped **EMAIL-only** (deliberately scoped SMS out). Operator decision 2026-06-08: **SMS templates are in v1.** Extend the locked §E14 (integrator change — DDB schema + dispatch path + WS-E-TCPA coordination):
```
1. Storage: add  sms_text?  to the picasso-scheduling-notif-template-{env} row (additive; schema-discipline).
2. GET /scheduling/notification-templates: each moment ALSO returns
     sms_text, sms_is_override:bool, sms_default, sms_available_variables:[…]  (SMS-valid subset, no HTML vars)
   + a top-level  sms_footer_note  (the STOP/HELP analog to stop_footer_note).
3. PATCH /scheduling/notification-templates/{moment}: accept  sms_text?  alongside the email fields.
4. Dispatch: the SMS send path reads the override + appends the STOP/HELP footer AFTER render, OUTSIDE the
   editable body — the SAME compliance invariant already proven for the email STOP injection.
5. WS-E-TCPA coordination (load-bearing): the STOP/HELP footer spine is theirs (§E3 / §B8). Footer injected
   ONCE; an override can neither remove NOR duplicate it. Reuse the email STOP-injection invariant + parity test.
6. Defaults: notify.js authoritative default SMS per moment, mirrored in ADA (_SCHED_NOTIF_DEFAULTS SMS analog)
   for the editor reset/preview; parity-tested.
7. Length guard: validate/warn on rendered length (override + appended footer) vs 160-char SMS segments.
```
**Moment scope (decision):** only `reschedule_link` / `reoffer` / `cancel_notice` DISPATCH today; `confirmation` / `reminder_24h` / `reminder_1h` don't send until **WS-E-REMIND** lands. **Recommend SMS for the 3 sending moments now**, add reminders when REMIND lands (else the editor edits a template that never fires). Operator to confirm.
**When it lands:** I add an SMS field per moment to the template editor (one input + a segment-count hint + a "STOP appended automatically, can't be removed" note), one-line wire.

---

## Superseded (do not action)
My earlier §E7/§E13/§E13b/§E14 *contract drafts* are obsolete — your locked §E (2026-06-05/06) + lambda#255/#258 supersede them. This file is only the **open asks** above.
