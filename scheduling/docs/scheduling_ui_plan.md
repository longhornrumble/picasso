# Scheduling — UI Plan (v1)

**Status.** Planning artifact. Sibling to [`scheduling_design.md`](scheduling_design.md) (canonical design) and [`scheduling_implementation_plan.md`](scheduling_implementation_plan.md) (build plan). Resolves the UI gap identified mid-execution of sub-phase A.

**Reference.** Paradox AI's conversational scheduling product is the closest analog. Their interaction patterns translate well; their hiring-specific labels and operational ceremony do not. Patterns we explicitly adopt vs. reject are called out per surface.

**Design principles (in priority order).**

1. **The tenant's enterprise calendar (Google Workspace / Microsoft 365) is the calendar of record.** Picasso is an orchestration layer that reads free/busy, writes confirmed events back, and stores Picasso-specific metadata separately. We do not duplicate calendar functionality, do not become a calendar UI, do not build features the calendar already provides natively (block time, daily availability overrides, drag-to-reschedule).

2. **Conversational-first.** End users book in chat. Web fallback exists for edge cases.

3. **List views over grids** for operational surfaces. Grids belong in the calendar.

4. **No reschedule by staff selection.** Staff can request reschedules; guests choose new times.

5. **Coordinator UI is operational, not theatrical.** Staff come here to triage exceptions, not to live in a workspace.

6. **Users are not bound to the UI.** Every action that an end user, staff member, or admin can take has a tokenized email path. Confirmation, disposition, reschedule, cancel — all reachable from email without logging in. Logins are for browsing/configuration; email tokens are for action. The unified signed-token mechanism is specified in canonical `scheduling_design.md` §13 (HS256, six purposes, bearer semantics, one-time-use enforcement via the A6 jti-blacklist table). Bearer semantics make admin-cc dispositions automatic — admin and staff hold the same signed link in their respective inboxes; whichever clicks first wins. No new token classes needed for v1.

---

## 1. Audiences and surfaces

Three audiences, three products:

| Audience | Product | Role |
|---|---|---|
| Super admin (operator) | Config Builder | Configures the scheduling block per tenant |
| Tenant staff / admins | Customer Portal (formerly "Analytics Dashboard") | Self-service scheduling operations |
| End user (volunteer / candidate / constituent) | Picasso widget | Books appointments via chat |

Each audience sees a deliberately different surface area. The super admin configures the system; the tenant operates within it; the end user simply books.

---

## 2. Information architecture

Five logical surfaces, distributed across the three products:

| # | Surface | Product | Audience |
|---|---|---|---|
| 1 | Calendar connection | Customer Portal | Tenant staff |
| 2 | My Bookings (operational view) | Customer Portal | Tenant staff |
| 3 | Team scheduling settings | Customer Portal | Tenant admin |
| 4 | Conversation booking flow | Picasso widget | End user |
| 5 | Reschedule / cancel / reminders | Picasso widget + email | End user |

Plus two configuration surfaces:

| # | Surface | Product | Audience |
|---|---|---|---|
| 6 | Scheduling configuration | Config Builder | Super admin |
| 7 | Notification template overrides | Customer Portal | Tenant admin |
| 8 | Scheduling analytics | Customer Portal | Tenant admin |
| 9 | Calendar (read-only embed) | Customer Portal | Tenant staff |
| 10 | Hosted reschedule/cancel page | Standalone (`schedule.myrecruiter.ai`) | End user (anonymous, token-authenticated) |

This is the Paradox spine — calendar connection, operational view, availability, conversational booking, reschedule/reminders — adapted to our three-product surface area.

---

## 3. Surface-by-surface spec

### Surface 1 — Calendar Connection (Customer Portal)

**Purpose.** Each staff member who is bookable must authorize Picasso to read their free/busy and write events to their calendar. Without this, no one is bookable.

**Adopted from Paradox.**
- Connected-account card with email, provider, status, last-synced timestamp
- Connect / Reconnect / Disconnect actions
- Calendar selector (primary calendar + optional secondaries for free/busy)
- Timezone display (read-only — staff edit in Google's settings)

**Adapted.**
- "Coordinator" → "Staff member"
- We do not surface a "Use selected calendars for free/busy checks" toggle for v1; default to primary calendar. Multi-calendar free/busy is a v1.5 enhancement.

**Rejected.**
- No "Create confirmed appointments on this calendar" choice — always write to the primary. Splitting writes across calendars complicates routing and adds zero v1 value.

**v1 must:** OAuth connect/reconnect, single primary calendar, status display.
**v1 should:** Per-staff disconnect.
**Defer:** Secondary calendars for free/busy, custom write-target calendar.

**Fields stored.** Refresh token (per Security-Reviewer 2026-05-02: **must be Secrets Manager, not DDB** — see implementation plan E11; named `picasso/scheduling/oauth/{tenantId}/{coordinatorId}` with per-secret IAM policy scoped to `secretsmanager:GetSecretValue` on `picasso/scheduling/oauth/*`). Other fields: provider (`google` | `microsoft`), connected_email, connected_at, last_sync_at, calendar_id (primary).

**Mid-session token revocation detection (per Frontend-Engineer review 2026-05-02).** A staff member's refresh token can be revoked by Google out-of-band (password change, security event, admin revocation in Workspace admin console). The Customer Portal must detect this proactively, not just on next booking attempt:
- On every staff Customer Portal page load, the backend attempts a no-op `freeBusy.query` for the next 24h using the cached token. If it returns 401 with `invalid_grant`, the connection is marked disconnected.
- Disconnection emits two notifications: (a) email to the staff member ("your calendar disconnected — please reconnect to remain bookable"), (b) admin notification on the disconnected staff member's name in the team dashboard
- Staff member is auto-marked `bookable: false` for the disconnect window
- Re-OAuth from the Calendar Connection page restores `bookable: true` (admin can also force-toggle if needed)

---

### Surface 2 — My Bookings (Customer Portal)

**Purpose.** Staff need a focused operational view of *Picasso bookings* — not a calendar replacement. They check Google Calendar for the full picture; they come here to manage exceptions and triage.

**Adopted from Paradox.**
- Filter chips above a single agenda list: Today / This week / Upcoming / Past
- Status filters: Booked, Reschedule requested, Cancelled, Missed, Follow-up needed
- Booking cards with: name, appointment type, date/time, channel/location, assigned staff, status chip
- Per-card actions: Reschedule, Cancel, Open in Google Calendar

**Adapted.**
- **List only, no calendar grid.** Paradox offers a grid toggle; we don't. The grid duplicates Google.
- Single-column layout, not their two-column rail + main panel. Filters are chips above the list.

**Rejected.**
- "Block time" button → Google Calendar handles this; we link out instead.
- "Edit recurring availability" → Surface 3 instead, and at the team level not per-staff page.
- Optional calendar grid view → never.
- "Sync now" button → free/busy is queried at offer time; sync is implicit.

**v1 must:** List view, filters, status chips, cancel-with-reason, "Open in Google Calendar" link.
**v1 should:** Reschedule action that triggers a token-authenticated reschedule link to the guest.
**Defer:** Bulk actions, per-card messaging, per-card notes editing.

**Notes.** Reschedule from a staff card is **not** the same as the staff picking a new time — it sends a reschedule link to the guest, who picks. This avoids the "staff picks a time the guest can't make" anti-pattern.

---

### Surface 3 — Team Scheduling Settings (Customer Portal)

**Purpose.** Tenant admin configures *which* team members are bookable, *for what*, and via *which* calendar email if it differs from their login. This is the per-tenant routing surface.

**Architecture.** Extension of the existing team-management UI. Each row in the existing AdminEmployee table gains scheduling-specific controls.

**Per-staff fields (new):**
- **Bookable toggle** — on/off
- **scheduling_tags** — multi-select chip input drawing from the tenant's `scheduling_tag_vocabulary` (e.g. program affiliations, languages, certifications)
- **calendar_email_override** — optional; populates only if their login email differs from their booking calendar email

**Bulk operations:** none for v1. Per-row only.

**Validation.**
- A staff member with `bookable: true` must have a connected calendar (Surface 1). Otherwise show an inline warning ("Connect calendar to be bookable").
- Tags must be in the tenant's vocabulary; reject unknown tags.

**Vocabulary validation path (per system-architect review 2026-05-02).** The `scheduling_tag_vocabulary` lives in the tenant config in S3 (managed via Config Builder). When Surface 3 saves a staff member's `scheduling_tags`, the Customer Portal Lambda backing the save **must load the tenant config from S3 (or an in-memory cache with TTL ≤ 5 min) and validate every tag against the vocabulary** before persisting to the AdminEmployee record. Validation lives in the Lambda, not the frontend, because the frontend cannot be trusted as the security boundary. UI optimistically shows the chip (post-save) but rolls back on Lambda 400 with explicit error. **Note operationally:** the vocabulary-edit surface (Config Builder, super-admin only) and the per-staff-tag surface (Customer Portal Surface 3, tenant-admin) are in different products. A Config Builder change to the vocabulary that removes a tag does not retroactively scrub already-persisted AdminEmployee tags — a separate runbook task (out of v1 scope) handles vocabulary drift cleanup.

**Rejected from Paradox.**
- Per-coordinator round-robin / fixed-assignee toggle — our `routing_policies.tie_breaker` lives in Config Builder (super-admin) and is per-appointment-type, not per-staff.
- Per-coordinator availability hours — handled in Google Calendar working-hours settings.

**v1 must:** Bookable toggle, tag editor, calendar_email_override field, calendar-required warning.
**v1 should:** Filter team list by "bookable" / "not bookable" / "missing connection".
**Defer:** Per-staff appointment-type allow-list, per-staff buffer overrides.

---

### Surface 4 — Conversation Booking Flow (Picasso widget)

**Purpose.** End users book in chat. This is the primary path; the web fallback exists for edge cases.

**Adopted from Paradox.**
- Bot offers 3 curated slots inline (quick-reply chips)
- "Show more times" → richer set
- "Different day" → date selector
- "Open scheduling page" → web fallback

**Flow states (matches Paradox).** Intent detected → context capture → availability lookup → slots offered → slot selected → confirmation collected → booking created → reminder scheduled.

**Adapted.**
- **Routing happens silently before slot generation.** See routing walk-through below.
- **Pre-call form is optional and inline.** If the appointment type has a `pre_call_form_id`, the bot collects those fields conversationally before showing slots — same conversational-form pattern Picasso already uses.

**Rejected.**
- "Talk to a person" — Paradox can offer this because they have recruiters on the other end. We don't have live agents. Replaced with "no fit" terminal state below.

**Slot-conflict retry cap (per Frontend-Engineer review 2026-05-02).** When the slot-lock revalidation at booking time fails (selected slot got taken between offer and confirm), the bot reoffers 3 fresh slots from a pool re-query. **Maximum 3 reoffer cycles** before the bot transitions to async-escape (no-fit terminal state below). Without a cap, a high-traffic tenant with a small staff pool can produce an infinite reoffer loop. Each reoffer message degrades gracefully — the second reoffer says *"Looks like times are getting picked up quickly — here are three more"*; the third says *"Things are moving fast today — let me try a different approach."*

**Mobile slot picker layout (Picasso is 99% mobile).** At viewports ≤375px:
- Chip label budget: max 28 characters per chip (e.g., `Tue, May 7 · 10:00 AM ET`)
- Chips wrap to vertical list (one per line) below 375px; no horizontal scroll
- "Show more times" expands to a scrollable list bounded to 8 visible items at a time, with "Load more" footer
- "Different day" opens a date strip (7 days visible at a time, swipe-able)
- Falls back to Surface 10 (hosted reschedule/cancel page) if more than 3 reoffer cycles complete without resolution

**No-fit fallback (per canonical §9.3 — tiered, never says "no availability"):**
1. **Suggest a different day** — bot prompts user to pick a different day from a date strip
2. **Expand search window** — bot widens the search to a longer horizon (additional days beyond `max_advance_days` if config allows, otherwise more granular times within the same window)
3. **Async escape** — bot offers asynchronous follow-up. Suggested copy (per Frontend-Engineer review 2026-05-02 — this is the highest-stakes copy in the feature; the user did not get what they came for):
   - First message: *"I'm not finding times that work for you right now — but I don't want to give up. Tell me what days and times usually work, and I'll have someone reach out with options that fit."*
   - On user response: collect free-text + optional structured day-of-week chips
   - Acknowledge: *"Got it. I've noted your preferences and {tenant_admin_first_name} will be in touch within {2 business days}. You'll hear back at {volunteer_email}."*

**Constraint on async-escape copy:** must avoid the words "no availability" (canonical §9.3). Must commit to a concrete follow-up window (e.g., "within 2 business days") so the user has a calibrated expectation. Must name a real human contact (the tenant admin's first name, not "the team") because nonprofit-context users respond to specific people more than generic system messages.

This is preferred over a tenant-contact-email handoff (which the original UI plan briefly considered) because the platform retains the relationship and data; the user doesn't have to re-engage outside chat. Async escape implementation reuses the existing email/SMS notification path. **The async-escape commitment requires a downstream task** (likely E14 notification template overrides) so the tenant admin actually receives the captured preferences and can act on the commitment.

**Confirmation.** Inline chat message, not a screen. Contains: date/time in user's timezone, location/meeting link, reschedule link, cancel link.

**v1 must:** 3 curated slots, "show more", "different day", inline confirmation, pre-call form gating, reschedule + cancel links in confirmation, no-fit terminal state.
**Defer:** SMS-driven slot selection, multi-channel synchronization.

#### Routing walk-through (v1)

When booking intent is detected, four steps determine who the booking gets assigned to:

1. **Appointment type → routing policy.** The end user's intent maps to one appointment type. The appointment type names exactly one `routing_policy_id`.

2. **Policy filters the candidate pool.** The policy's `tag_conditions` (e.g. `program=weekend_food_pantry AND language=es`) are evaluated against every staff member's `scheduling_tags`. Staff who match all conditions form the candidate pool. Staff with `bookable: false` or no connected calendar are excluded.

3. **Free/busy intersection.** For each candidate, query Google free/busy for the next `max_advance_days`. Compute the union — any time at least one candidate is free becomes a potential slot.

4. **Tie-breaker assigns the host.** When the user picks a slot, multiple candidates may be available at that time. The policy's `tie_breaker: 'round_robin'` picks one. See round-robin section below.

v1 always produces **N candidates → 1 host per slot** (1:1 format). Group/panel formats are v2.

#### Round-robin algorithm (v1)

**See canonical `scheduling_design.md` §10.1–§10.2 for the authoritative specification.** Summary:

- `tie_breaker: 'round_robin'` is the only v1 value (`first_available` is also in the v1 set; `load_balance` and others are v2).
- Round-robin state lives on `RoutingPolicy` itself: `last_assigned_resource_id` and `last_assigned_at`.
- State advances **only after event creation succeeds.** If event creation fails after slot lock, the state is unchanged; retry uses the same coordinator assignment, capped at 3 retries before falling back to re-running pool selection.
- OOO / vacation handling requires no special case — absent coordinators surface as busy in `freeBusy` and are excluded from the candidate pool at the intersection step. Round-robin "misses their turn" naturally.
- A separate per-coordinator `freeBusy` cache (60s TTL, listener-invalidated) keeps repeated booking attempts from hammering Google's API.

This is **not** a Booking-history-derived computation. Stateful, atomically-updated, gated on event-creation success — the canonical design is more careful about partial-failure scenarios than a naive booking-count would be.

---

### Surface 5 — Reschedule / Cancel / Reminders (Picasso + email)

**Purpose.** Make rescheduling first-class. Most no-shows happen because rescheduling is harder than cancelling silently.

**Adopted from Paradox.**
- Reminder cadence: immediate confirmation → 24h before → 1h before
- Reschedule via tokenized link in confirmation/reminder emails — opens a minimal slot picker
- Reschedule preserves context (same appointment type, same routing policy outcome)
- Update the existing Google event rather than creating a duplicate

**Adapted.**
- The reschedule link target is **a hosted page**, not an authenticated portal — guests don't have logins. The token (a JWT with `jti` recorded in the blacklist table from A6) authenticates the request and is single-use after a successful reschedule.

**Missed-event flow.** Per canonical §11. The system pushes harder for human input rather than presuming the answer.

| When | Action | Booking status |
|---|---|---|
| Meeting end + 30 min | Email **staff**: three tokenized buttons (We met / Sam didn't show / We didn't connect) | `pending_attendance` (session state) |
| T+24h, no response | Resend to **staff + admin (cc)**. Admin can disposition on staff's behalf. | `pending_attendance` |
| T+72h, no response | Urgent escalation: dedicated email to admin with subject highlighting count of unresolved bookings, **and** Customer Portal inbox alert visible on next login | `pending_attendance` |
| T+7 days, still unresolved | Weekly digest to admin enumerating all `pending_attendance` bookings older than 7 days, oldest first; recurs every 7 days until resolved | `pending_attendance` |
| Any time, on disposition (staff click or admin click) | Confirmation email to staff naming: action taken, applicant name, program affiliation | resolved per click |

**No auto-completion.** A booking that nobody dispositions remains `pending_attendance` indefinitely. The queue is bounded by *attention* (escalation visibility), not *status* (auto-rolled-forward state). Fabricating a `completed` status would lie about attendance, pollute analytics (no-show rate, completion rate), and hide broken disposition workflows. Better to surface the unresolved-bookings count as an operational-debt metric (Surface 8).

**Why admin cc on the resend.** Applicants falling through cracks is the worst failure mode. Looping the admin in at T+24h creates social pressure for resolution and a second pair of eyes.

**Why weekly digest.** A T+72h email may itself get neglected. The recurring weekly nudge keeps unresolved bookings *visible* — the alternative is that they sit forever, which is exactly what canonical §11 explicitly prevents.

**Rejected from Paradox.**
- Auto-detection of attendance via calendar API
- Auto-completion of unresolved bookings
- "Optional running-late prompt" — defer to v1.5
- In-app inbox / push notifications — except the Customer Portal inbox alert at T+72h; broader inbox infrastructure deferred

**v1 must:** Tokenized reschedule + cancel links, immediate confirmation email, 24h + 1h reminders, staff disposition cadence above (T+30min staff, T+24h staff+admin cc, T+72h urgent escalation, T+7day weekly digest), post-disposition confirmation email.
**Defer:** Running-late prompts, broader push notification infrastructure, configurable cadence per tenant beyond §12 schema.

---

### Surface 6 — Scheduling Configuration (Config Builder)

**Purpose.** Super admin (Chris) configures the entire `scheduling` block from `scheduling.schema.ts` per tenant. This is a private operator surface; tenants never see it.

**Layout.** New top-level "Scheduling" tab in Config Builder, alongside existing Forms / CTAs / Branches / Programs.

**Sections (all populated from the schema):**
1. **Toggle** — `feature_flags.scheduling_enabled`
2. **Workspace** — `workspace_domains[]`, `default_locale`, `available_locales[]`
3. **Tag vocabulary** — `scheduling_tag_vocabulary[]` (chip editor)
4. **Appointment types** — repeatable rows: name, duration, location_mode, routing_policy_id (dropdown), buffers, lead time, max advance, slot granularity
5. **Routing policies** — repeatable rows: name, tag_conditions builder (program=X AND language=Y), tie_breaker
6. **Pre-call form** — dropdown of existing conversational forms
7. **Reminder cadence** — tier rows + offsets + channels (email/SMS)

**CTA editor extension.** The existing CTA editor's action dropdown gains `start_scheduling` and `resume_scheduling`. This is the trivial part of original task A7.

**v1 must:** Toggle, workspace, vocabulary, appointment types editor, routing policies editor, CTA dropdown extension.
**v1 should:** Pre-call form dropdown, reminder cadence editor.
**Defer:** Localization editor (default to `en` until a non-English tenant lands).

---

### Surface 7 — Notification Template Overrides (Customer Portal)

**Purpose.** Tenants customize the wording of booking-related emails (confirmation, reminders, cancellation, missed-event re-engagement). Extension of the existing notification-template UI.

**v1 must:** Confirmation email + 24h reminder + cancellation email overrides.
**v1 should:** 1h reminder, missed-event re-engagement.
**Defer:** SMS template overrides (reuse default SMS until tenant demand surfaces).

---

### Surface 8 — Scheduling Analytics (Customer Portal)

**Purpose.** Tenant admins see what only Picasso knows: the conversation-to-booking funnel. Extension of the existing analytics dashboard.

**Audience-specific views.** Two distinct dashboards driven by the same data:

**Admin view (aggregate, full team):**
- Booking volume (daily / weekly)
- Time-to-book (intent detected → confirmation)
- No-show rate by appointment type and by program tag
- Cancellation rate, reschedule rate
- **Operational-debt metrics** (per canonical §11):
  - Count of `pending_attendance` bookings older than 24h, 72h, 7 days, 30 days
  - List of staff with the most unresolved dispositions, sortable; admin can drill from any aggregate row to the individual staff member's queue
- Routing tie-break distribution (which staff member got assigned how often) — defer to v1.5

**Staff view (own bookings only):**
- Their own pending dispositions (list of `pending_attendance` bookings awaiting their click; oldest first)
- Their own no-show rate vs. tenant average (private, not shared with team)
- Their own booking volume and completion stats

The point of the staff view: each individual sees what they personally need to disposition before any escalation reaches admin. The point of the admin view: identify systemic workflow gaps (one staff member with 50 unresolved bookings vs evenly distributed) without micromanaging.

**Why these specific metrics.** Nonprofits live and die by volunteer/donor interactions. Failing to disposition a booking is failing to track an interaction. Surfacing the gap measurably is what makes disposition workflows improvable — and gives Customer Success a concrete artifact to discuss change management against.

**v1 must:** Booking volume, no-show rate, operational-debt counts (24h / 72h / 7d / 30d unresolved), staff-level drill-down.
**v1 should:** Time-to-book, cancellation/reschedule rates, per-staff own-view dashboard.
**Defer:** Routing tie-break distribution, cross-tenant benchmarking.

**Refresh cadence (per Frontend-Engineer review 2026-05-02).** All operational-debt metrics are **near-real-time, max 5-minute lag**. Implementation: read directly from the `Booking` table's `(tenantId, start_at)` GSI on every dashboard load (cache 5 minutes server-side via the existing `Analytics_Dashboard_API` pattern). Other metrics (booking volume, no-show rate, time-to-book) update at the existing analytics aggregation cadence (hourly EventBridge job — `Analytics_Aggregator`) since they are historical aggregates and don't drive operator action urgency.

**API contract for admin/staff view split (per system-architect review 2026-05-02).** New query parameter `?scope=staff_self|tenant_aggregate` on the `Analytics_Dashboard_API` scheduling endpoints:
- `staff_self` — Lambda filters by `assigned_staff_id == claims.sub`; rejects with 403 if claims.sub is null. Available to any authenticated portal user.
- `tenant_aggregate` — Lambda returns tenant-wide data unfiltered; rejects with 403 if claims.role !== `admin`. Drill-down sub-queries pass `?scope=tenant_aggregate&staff_id={id}` to view a specific staff member's data.
- A staff member who is also an admin defaults to `staff_self` view; admin-aggregate view is opt-in via UI toggle.

---

### Surface 9 — Calendar (Customer Portal, embedded Google iframe)

**Purpose.** Give staff visual context for their bookings without app-switching. Read-only inside MyRecruiter; click any event → opens in Google Calendar in a new tab for any action.

**Implementation.** Google Calendar's free embed (`https://calendar.google.com/calendar/embed?src=...`) inside an iframe on a "Calendar" tab in the Customer Portal. Configurable views (week / agenda); defaults to week.

**Critical degradation case (per Frontend-Engineer + system-architect reviews 2026-05-02).** Google Calendar iframe embed is **blocked by default in privacy-hardened browsers** — Safari (ITP), Chrome with strict third-party cookies, Firefox with enhanced tracking protection, Brave. The iframe also silently shows a blank frame if the staff member is signed into Google with a different account in the same browser than their Workspace account. **The iframe must be treated as progressive enhancement, not a load-bearing surface.**

**Degraded-state UX (required, not optional):**
- Detect iframe load failure (5-second timeout on `load` event) OR detect blank-frame state (postMessage probe with no response within 2 seconds)
- On failure, replace the iframe with a fallback panel: *"Your calendar can't be embedded here — your browser is blocking the connection or you're signed into a different Google account. To view your schedule, [open Google Calendar directly]."* with a deep-link to the staff member's calendar
- Log the degradation event for analytics (proportion of users hitting the fallback informs whether to invest in Surface 9 vs deprioritize it)

**Adopted.** Visual schedule context without rebuilding a calendar widget.

**Rejected.**
- Building a custom React calendar grid — significant maintenance burden
- Two-way edit-in-iframe — Google's iframe is read-only by design, and we want it that way (forces actions through the source-of-truth UI)

**v1 must:** Embed of the staff member's primary calendar in week view. "Open in Google Calendar" button for new tab.
**v1 should:** Toggle between week / agenda views.
**Defer:** Multi-calendar overlay (showing the team's calendars side-by-side), custom event styling for Picasso bookings vs other events.

**Permissions note.** Each staff member sees their own calendar embedded. Admin sees their own; admin role does not grant viewing other staff's calendars in this surface (use My Bookings filtered view for cross-staff visibility).

---

### Surface 10 — Hosted Reschedule/Cancel Page (standalone, `schedule.myrecruiter.ai`)

**Purpose.** End users who click reschedule/cancel links from confirmation or reminder emails land on this page — not in the Picasso widget, not in the Customer Portal. It is the only product surface authenticated via signed token (bearer semantics). Both Frontend-Engineer and system-architect adversarial reviews independently flagged the absence of this surface from the original IA as a gap.

**Architecture.**
- Hosted at `https://schedule.myrecruiter.ai/{cancel|reschedule|resume|attended/met|attended/noshow|attended/noconnect}?t=<jwt>`
- Provisioned by D3 (CloudFront distribution + ACM cert)
- Static-shell HTML for failure pages (§13.9 thin static pages); React micro-app for the reschedule slot picker (the only surface needing dynamic re-query of pool-at-commit + slot rendering)
- No login. Token authenticates the request. Token redemption sets `rescheduling_intent` or `cancellation_intent` session-context binding (canonical §13.4) which authorizes downstream slot selection within a 30-minute TTL — no second token needed for the slot-pick + confirm step.

**States and UX:**

| State | When | UX |
|---|---|---|
| Loading | Initial page load | Skeleton showing booking metadata fields; aborts after 5s with retry option |
| Valid token + valid booking | Happy path | For reschedule: 3 slot chips + "show more" + "different day"; same routing as Surface 4. For cancel: confirmation prompt + non-judgmental copy. |
| Expired token | `jti` blacklist hit OR `exp < now` | Friendly low-information message: *"This link has expired. To reschedule, please reach out to {tenant_contact_email}."* Coordinator contact embedded server-side from validated booking lookup (canonical §13.9). |
| Already-used token | `jti` blacklist hit on first lookup | *"It looks like this link was already used. Your booking is at {time}. To make changes, [click here to start a new request]."* Link to `/resume` with a fresh token if available, otherwise to `tenant_contact_email`. |
| State-incompatible token | E.g., reschedule token but booking is already canceled | *"This booking has already been canceled. If you'd like to schedule again, please [start a new conversation]."* with the tenant's chat widget URL |
| Tampered token / signature failure | JWT verification fails | Generic 400. No detail leak per canonical §13.9. |
| Network failure / Lambda unreachable | Server-side error | *"We're having trouble loading this. Please try again in a moment, or [reach {tenant_contact_email}]."* Logs the error for ops alerting. |

**Mobile.** Page must function on mobile-first viewports (375px). Slot chips wrap to vertical list at small widths (no horizontal scroll). Form fields stack. Confirmation collapses to single-column.

**v1 must:** All seven states above; mobile-first layout; coordinator contact embedded on failure pages (per §13.9).
**Defer:** Custom branded chrome per tenant (defaults to MyRecruiter brand for v1).

---

## 4. Status taxonomy

**Source of truth: canonical `scheduling_design.md` §9.2.** This section reproduces the taxonomy for UI reference; canonical wins in any conflict.

Two distinct vocabularies — they are not interchangeable:

### Session states (chat sub-flow only)

These describe what the chat session is currently doing. They are not persisted on the Booking record.

| Session state | Meaning |
|---|---|
| `qualifying` | Agent collects routing context (often a no-op for known users) |
| `proposing` | 3–5 candidate slot chips presented in chat |
| `confirming` | User has selected a slot; echo-back + commit |
| `booked` | Sub-flow exits; conversation hands back to LLM |
| `rescheduling` | Re-engagement to change a booking; loops through `proposing → confirming` as atomic cancel-and-rebook |
| `canceling` | Re-engagement to cancel; one tap, no mandatory reason |
| `pending_attendance` | Auto-entered at `event_end + 30min`; awaits interviewer's three-option disposition |
| `coordinator_no_show` | Terminal session state when interviewer answered "we didn't connect"; no outbound to volunteer |

Per canonical §9.2: `idle`, `intent_detected`, `slots_offered`, `booking_pending`, etc. are **not** first-class — they're folded into the eight states above.

### Booking.status (database row, persisted)

| Booking.status | Meaning |
|---|---|
| `booked` | Confirmed; calendar event written |
| `canceled` | Canceled by guest, coordinator, or system reconciliation (note canonical's single-l spelling) |
| `completed` | Set when interviewer dispositioned "we met" |
| `no_show` | Set when interviewer dispositioned "Sam didn't show" |
| `coordinator_no_show` | Set when interviewer dispositioned "we didn't connect" |

A booking that nobody dispositions remains in **session state** `pending_attendance` indefinitely; **Booking.status** stays `booked` until human disposition (per canonical §11 — auto-completion is never a fallback). The disposition cadence (T+30min, T+24h cc admin, T+72h urgent escalation, weekly digest) is documented in canonical §11.2 and Surface 5 below.

Status chips on UI surfaces are color-coded **and text-labeled** (accessibility). Color palette draws from `picasso-shared-styles` semantic tokens; mapping below uses tokens the design-system already provides where possible, with proposed additions where needed:

| Status | Token (existing or proposed) | Rationale |
|---|---|---|
| `booked` | `--status-success` (green) | Confirmed, healthy |
| `pending_attendance` (session) | `--status-warning` (amber) | Action needed; awaiting human disposition |
| `completed` | `--status-success` (green) | Terminal happy state |
| `canceled` | `--status-neutral-muted` (gray) | Not erroneous, just no longer active |
| `no_show` | `--status-warning` (amber) | Visible attention but not a system failure |
| `coordinator_no_show` | `--status-info` (blue) | Distinct from volunteer no-show; admin audit only |

All status chips meet WCAG 2.1 AA contrast (4.5:1 for chip text on chip background) — verified at implementation time via the existing accessibility tooling (axe / WAVE) used by the Customer Portal repo.

---

## 5. Edge cases

Adopted from the Paradox research; pruned to ones that bite v1 traffic:

| Case | UX response |
|---|---|
| No availability in next 14 days | Bot says so; offers waitlist or "talk to a person" |
| User timezone unknown | Bot asks; defaults to tenant timezone if user skips |
| Staff disconnected calendar | Inline warning on team settings; staff member auto-marked not-bookable |
| Slot taken between offer and confirmation | Re-query free/busy at booking time; if slot now busy, surface inline error + offer 3 alternates |
| Calendar API timeout | Show "couldn't reach calendar — try again in a moment"; do not write a Booking row |
| Double-booking detected post-write | Email staff with the conflict; do not auto-cancel — let staff arbitrate |
| Guest wants a person | Existing live-handoff pattern; pause scheduling intent |
| Staff blocks time after slot offered | Slot expires when guest tries to confirm; same UX as "slot taken" |

**Always degrade gracefully:** explain in one sentence, offer one next action, never leave the user at a dead end.

---

## 6. What we explicitly do NOT build

These are scope exclusions. Each one is something Paradox builds but we don't, with rationale.

| Not building | Why |
|---|---|
| Custom React calendar grid component | Surface 9 uses Google's free embed instead |
| Per-staff recurring availability editor | Staff manage working hours in Google Calendar settings |
| Daily availability override editor | Staff mark themselves busy in Google Calendar |
| "Block time" UI | Google handles it natively |
| Hold-slot-during-booking timer | FreeBusy revalidation at booking is sufficient for v1 traffic |
| Auto-detection of missed events | Cannot observe attendance reliably; staff disposition with admin cc handles it |
| "Talk to a person" escalation | We don't have live agents; no-fit terminal state directs to tenant contact email |
| Coordinator notification preferences (channel/urgency/cadence) | Reuse existing notification mechanisms |
| Booking confirmation as a separate page | Confirmation is a chat message |
| In-app inbox for staff | Email is sufficient for v1 |
| Web scheduling page as primary path | Conversational-first; web is fallback only |
| Multi-channel SMS booking flow | Defer to v1.5 |
| Panel / group / multi-interviewer scheduling | v1 is `format: 'one_to_one'` only |
| Login-required action surfaces | Per design principle #6, every action has a tokenized email path |

If a tenant requests one of these, evaluate at that time. v1 holds the line.

---

## 7. Implementation plan additions

The current `scheduling_implementation_plan.md` does not enumerate Customer Portal UI work. The following tasks need to be inserted, with proposed sub-phase placement:

| New task | Surface | Proposed sub-phase | Rationale |
|---|---|---|---|
| Calendar connection page (OAuth Google) | 1 | E (Customer Portal integration) | Heaviest single UI task; depends on D (booking-token & FreeBusy plumbing) |
| My Bookings list view | 2 | E | Depends on Booking table (A8c) and routing being wired |
| Team scheduling settings extension | 3 | E | Extends existing team UI; AdminEmployee fields land in A8 |
| Notification template overrides | 7 | E | Extends existing notification UI |
| Scheduling analytics | 8 | F (pre-launch polish) | Read-side only; can ship after first booking lands |
| **Calendar embed page (Surface 9)** | 9 | E | Iframe-only; minimal effort. Requires OAuth from Surface 1. |
| Calendar connection page (OAuth Microsoft 365) | 1 | post-v1 | v1 is Google-only per `scheduling_design.md` §11 |

Existing tasks that should be updated:

- **A7** — narrow to "CTA dropdown + scheduling toggle" only (it was already scoped this way, but the wording invited scope expansion)
- **A8** — make explicit that the registry-write path needs to be exposed via the team-management UI extension (Surface 3); creating fields without a UI to populate them strands them
- **A8c** — gains a **second GSI** requirement: `(tenantId#assigned_staff_id, start_at)`. Required for round-robin tie-breaking (Surface 4) which queries each candidate's most recent booking under a routing policy. Without this GSI, routing falls back to first-match-wins, which violates the schema's `tie_breaker: 'round_robin'` contract.
- **New A9 (proposed)** — "Stub the Customer Portal scheduling-tab nav entries" so later sub-phase E doesn't have to build navigation scaffolding from scratch
- **New B-series task — tokenized action middleware.** Per design principle #6, every staff/admin/guest action available from email needs to validate a JWT, check the jti blacklist (A6 table), and either execute or 410 Gone. Should be a shared helper in Lambda layer or shared utility, not bespoke per endpoint. Lands in sub-phase B alongside the first action that needs it (probably the reschedule/cancel guest links).

---

## 8. Open questions for resolution before sub-phase E starts

These don't block sub-phases A–D but should be answered before the bulk Customer Portal UI work begins:

1. **OAuth scope minimization.** Google's `calendar.events` and `calendar.freebusy` are minimum; do we ever need `calendar.readonly` for richer integrations? Probably not for v1.
2. **Refresh token storage.** DDB column vs Secrets Manager? DDB is simpler operationally; Secrets Manager is the more secure default. Need a security review opinion before sub-phase D codes against either.
3. **Reschedule link expiration.** How long is a reschedule token valid? Suggest: until the original appointment's start time, then auto-expire. Confirm with §12 reminder cadence.
4. **Missed-event grace period.** 5 minutes feels right; needs a policy decision. Consider per-appointment-type override.
5. ~~**Tenant admin vs staff member permissions.**~~ **Resolved 2026-05-02.** Two-tier model: admin has full powers; staff control their own calendar settings. Concrete matrix:

| Action | Staff | Admin |
|---|---|---|
| Connect/reconnect own calendar | ✅ | ✅ (own only) |
| Disconnect own calendar | ✅ | ✅ (own only) |
| Toggle own bookable status | ✅ | ✅ |
| Toggle other staff's bookable status | ❌ | ✅ |
| Edit own `scheduling_tags` | ❌ | ✅ |
| Edit other staff's `scheduling_tags` | ❌ | ✅ |
| Set/change own `calendar_email_override` | ✅ | ✅ |
| View own bookings | ✅ | ✅ |
| View all bookings | ❌ (own only) | ✅ |
| Cancel/reschedule own bookings | ✅ | ✅ |
| Cancel/reschedule any booking | ❌ | ✅ |
| Add/remove staff members | ❌ | ✅ (existing role) |
| Edit notification templates | ❌ | ✅ |
| View analytics (own data only) | ✅ | ✅ |
| View analytics (tenant aggregate) | ❌ | ✅ |
| Edit `scheduling_tag_vocabulary` | ❌ | ❌ — super-admin only (Config Builder) |
| Receive T+72h urgent escalation email | N/A (sent to admin only by design) | ✅ |
| Receive T+7d weekly digest | N/A | ✅ |
| Cancel-on-volunteer's-behalf (Surface 2 admin override) | ❌ | ✅ |
| Trigger reschedule link (Surface 2 admin override) | ❌ | ✅ |

Notable choices:
- **`scheduling_tags` are admin-curated.** Preserves the closed-vocabulary model and prevents routing drift as staff self-describe their qualifications. If a staff member thinks they should be tagged differently, they tell their admin.
- **`calendar_email_override` is staff-editable.** Only the staff member knows whether their booking calendar is the same as their login.

Maps to existing Customer Portal admin/staff role model — no new roles required.

---

## 9. Karpathy alignment

- **Think before coding.** This document exists because the original implementation plan ran without a UI design pass. Stating UI assumptions explicitly fixes that drift.
- **Simplicity first.** Section 6 ("do NOT build") is intentionally longer than most sections — every excluded feature is a reduction in complexity.
- **Surgical changes.** Section 7 lists only the new tasks the implementation plan needs — not a whole-plan rewrite.
- **Goal-driven execution.** Each surface has v1 must / should / defer tags. Each task has a verifiable outcome (a working page, a measurable metric, a successful OAuth round-trip).

---

## 10. Change log

| Date | Change | Author |
|---|---|---|
| 2026-05-02 | Initial draft. Paradox interaction model adopted as reference; Customer Portal surfaces enumerated; implementation plan additions proposed. | Chris + Claude |
| 2026-05-02 | Revisions: dropped "Talk to a person" (Surface 4); added no-fit terminal state with tenant contact email; rewrote missed-event flow as staff disposition + admin escalation (no auto-detection); added Surface 9 (Google Calendar iframe embed) as v1 must; added routing walk-through and round-robin algorithm under Surface 4; added design principle #6 (no UI binding, tokenized email actions); resolved permissions matrix in §8 item 5; updated implementation plan additions to require A8c second GSI and a new B-series tokenized action middleware task. | Chris + Claude |
| 2026-05-02 | **Canonical reconciliation pass.** Six items reconciled: (1) round-robin algorithm reverted to canonical §10.1/§10.2 stateful design — A8c second GSI removed; (2) status taxonomy replaced with canonical §9.2 vocabulary (session states + Booking.status, distinct concepts); (3) no-fit terminal aligned to canonical §9.3 tiered async-escape; (4) missed-event cadence updated to escalate-and-keep model — auto-completion explicitly rejected per canonical §11; T+72h urgent escalation + T+7d weekly digest added; (5) principle #6 cites canonical §13 unified-token mechanism; (6) Surface 8 analytics expanded with admin/staff drill-down and operational-debt metrics (count of unresolved `pending_attendance` bookings by age) — surfaces interaction-tracking gaps that nonprofits can't afford to lose. | Chris + Claude |
| 2026-05-02 (review) | **Two-reviewer adversarial pass on UI plan** (Frontend-Engineer + system-architect). Substantial revisions: **Surface 10 added** (Hosted Reschedule/Cancel Page, served from `schedule.myrecruiter.ai`) — both reviewers independently flagged absence of this surface from the IA. Surface 4 — slot-conflict retry capped at 3 cycles (avoid infinite loop); explicit mobile slot picker layout (≤375px, chip char budget, vertical wrap, "show more" pagination). Surface 5 — full state taxonomy for Surface 10 (loading, valid, expired, already-used, state-incompatible, tampered, network failure). Surface 9 — degraded-state UX for blocked iframe (Safari ITP, hardened Chrome/Firefox). Surface 1 — Secrets Manager named (not DDB) for OAuth refresh tokens; mid-session token revocation detection added. Surface 3 — vocabulary-validation path made explicit (Lambda not frontend). Surface 8 — refresh cadence specified (5-min near-real-time for operational-debt; hourly aggregation for historical metrics); admin/staff API contract via `?scope=` parameter. Status taxonomy — color palette specified mapping to picasso-shared-styles tokens with WCAG 2.1 AA constraint. Permissions matrix — 6 silent gaps closed (vocabulary editing, T+72h notification routing, role intersection, Surface 2 admin override visibility). No-fit async-escape copy with concrete commitment language. | Chris + Claude |
