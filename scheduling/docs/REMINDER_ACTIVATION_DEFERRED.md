# WS-E-REMIND activation — ✅ ACTIVATED + LIVE (2026-06-13)

> **STATUS SUPERSEDED 2026-06-13 — reminders are ACTIVATED and LIVE on staging.** The "DEFERRED /
> INERT" body below is **historical** (true as of 2026-06-10); the activation glue landed afterward
> (Track-3 weave era) and is now ground-truthed live. Kept for provenance — read the ACTIVATION-STATE
> section immediately below for current truth, not the historical body.
>
> ## ACTIVATION STATE (ground-truthed against live AWS, acct 525, 2026-06-13)
>
> - **Booking commit creates reminder schedules.** Live EventBridge Scheduler group
>   `picasso-scheduling-reminders-staging` (ACTIVE) holds real one-time schedules from real bookings:
>   `sched-reminder-t24h-{booking_id}`, `sched-reminder-t1h-{booking_id}`, `sched-attendance-{booking_id}`
>   (e.g. `…-booking-263c0b03…` / `…-booking-0939cd18…`, both targeting `Scheduled_Message_Sender`;
>   one t1h fires `at(2026-06-15T17:30:00)`), plus the nightly reconciler `picasso-reminder-scheduler-nightly-staging`.
> - **IAM is real.** The BCH exec role `Booking_Commit_Handler-exec-staging` (inline policy
>   `booking-commit-exec`) holds `scheduler:CreateSchedule`, `scheduler:DeleteSchedule`, and `iam:PassRole`
>   on `picasso-reminder-scheduler-exec-staging` (trust `scheduler.amazonaws.com`). Env vars
>   `SCHEDULER_ROLE_ARN` / `SCHEDULER_GROUP_NAME` / `SCHEDULER_TARGET_ARN` set live on BCH.
> - **Dispatch runs clean.** `Scheduled_Message_Sender` invoked 7×/24h with **0 errors** (CloudWatch).
> - **Delivery confirmed (operator, 2026-06-13):** reminder/notification **emails land in the inbox every
>   test** (post the `notify@staging.myrecruiter.ai` DMARC fix), and **SMS reaches Telnyx with positive
>   API response codes**. End-to-end send path is proven.
> - **Call-site wiring is live (verify against `origin/main`):** `scheduleReminders` at BCH commit
>   (`Booking_Commit_Handler/index.js` `scheduleBookingReminders` call site), `rebindReminders` on
>   token-reschedule (`Booking_Commit_Handler/scheduling-mutate.js`), `deleteReminders` on cancel /
>   `calendar_moved` (`Calendar_Lifecycle_Consumer/booking-reconcile.js`).
>
> **Residual (verification, not build — not launch-blocking):** no *natural* t24h/t1h schedule has fired
> yet (the live bookings' reminders fire Jun 14/15), so the moment-specific fire-time path (§E14 override
> body read for `reminder_24h`/`reminder_1h`, and SMS-channel-at-fire-time vs email-floor) is inferred
> from the proven shared send path + the live schedules, not yet observed on a real reminder fire. First
> natural fire (Jun 14/15) or a time-compressed `start_at≈now+70m` test will self-confirm those two.
> The §E14 reminder-body override-feed decision (deferred-doc step 4) should be re-read against current
> `Scheduled_Message_Sender` (it reads `picasso-scheduling-notif-template` for t24h/t1h at fire-time).

---

## (HISTORICAL — true as of 2026-06-10) WS-E-REMIND activation — DEFERRED

**Status:** deferred 2026-06-10 (operator decision). This documents the *real* blocker behind
WS-E-PORTAL "row 2" (confirmation / reminder_24h / reminder_1h template editing) so the next
session resumes from ground truth instead of re-discovering it. **(Superseded — see ACTIVATION STATE above.)**

## The finding: lambda#242 is MERGED but INERT

`Reminder_Scheduler/` (lambda#242 — `scheduler.js` rule lifecycle + `index.js` reconciler +
`cadence.js` + `reconciler.js`) is merged to lambda `main`, but its library functions
`scheduleReminders` / `rebindReminders` / `deleteReminders` are **wired into NOTHING**:

```
git grep -nE "scheduleReminders\(|rebindReminders\(|deleteReminders\(" origin/main \
  -- ':!Reminder_Scheduler/*' ':!*.test.*'   # → no hits (only the dispatcher's own comment)
```

Consequences (ground-truthed against lambda `origin/main`, 2026-06-10):
- No EventBridge Scheduler rules are created at booking-commit → no rows land in
  `picasso-scheduled-messages` → `Scheduled_Message_Sender` never fires for a real booking.
- Therefore **`confirmation` / `reminder_24h` / `reminder_1h` do not dispatch today.**
- Reminder bodies come from the `picasso-scheduled-messages` row (composed by `Reminder_Scheduler`),
  **not** from the §E14 template-override table. So even the override plumbing for reminders does
  not exist yet.

**Why the portal can't just expose the moments:** adding `confirmation`/`reminder_24h`/`reminder_1h`
to the §E14 ADA editor allowlist is a trivial 3-line change — but it would create *editable copy with
no delivery path*, the exact anti-pattern that blocks portal rows 2/3. The §E14 editor deliberately
exposes ONLY the moments that actually dispatch (reschedule_link / reoffer / cancel_notice).

## The real unblock (the deferred workstream)

WS-E-REMIND activation is integrator glue against the BCH commit path — **HIGH-risk** (money/commit
path + turns on live scheduled sends in staging). It is NOT a follow-up; it is its own gated workstream.

1. **Wire `scheduleReminders` into the commit path** — `Reminder_Scheduler/DEPLOY_NOTE.md §5`:
   - at BCH commit (after `bookingStore.writeBooking`): `scheduleReminders({ booking, tenantPrefs }, deps)`
   - on token-reschedule (after `executeReschedule`): `rebindReminders({ booking, tenantPrefs }, deps)`
     — the ONLY re-bind trigger; named §E1 exit-criterion test (`calendar_moved` re-derives the time).
   - on any cancel incl. `calendar_moved` (cal-lifecycle consumer): `deleteReminders({ booking }, deps)`.
   - `tenantPrefs = { notificationPrefs, sms_quiet_hours }` from the already-loaded tenant config.
2. **EventBridge Scheduler IAM role** (§E1: trust `scheduler.amazonaws.com` + `lambda:InvokeFunction`,
   `RoleArn` at CreateSchedule) + the per-booking rule lifecycle grants on the BCH role. IaC.
3. **§E1 email-floor branch in `Scheduled_Message_Sender`** + wire the shipped `selectChannels` gate
   at fire-time (the dispatcher already has the seam: `deps.selectChannels` + `message.tenant_prefs`,
   currently injected as `undefined` → email-floor only). NOTE: the dispatcher's `selectChannels` call
   currently passes `tenantPrefs:` but channels.js's signature takes `orgSmsEnabled` — reconcile that
   seam when wiring (it has never run end-to-end).
4. **Decide the §E14-override → reminder-body feed**: either `Reminder_Scheduler` reads the §E14
   override when composing the `picasso-scheduled-messages` row, OR `Scheduled_Message_Sender` reads it
   at fire-time. Until this is decided + built, exposing the reminder moments in the §E14 editor is
   premature.
5. **Then** add `confirmation`/`reminder_24h`/`reminder_1h` to the ADA §E14 allowlist (+ SMS defaults)
   → the portal editor picks them up with a trivial change (same editor loop).
6. E9 reconciler activation (nightly orphan-rule cleanup) + the synthetic-monitor time-compression
   path (CI-6) — already built in `reconciler.js`, needs the EventBridge cron trigger + a burn-in tenant.

**Gate:** HIGH-risk (commit-path + live sends) → `phase-completion-audit` + explicit operator go-ahead,
no auto-merge. Pairs with WS-E-TCPA (already merged) for the SMS half of reminders.

## What IS done (so this doc isn't mistaken for "reminders are nowhere")

- The dispatch *stack* is shipped: `SMS_Sender` (real Telnyx), `Scheduled_Message_Sender`,
  `picasso-sms-consent`, `send_email`, `notify.js`, `channels.js` (selectChannels), `consent.js`.
- **G7b (the reschedule-link SMS supplement) IS shipped** — see `FROZEN_CONTRACTS.md` §C 2026-06-10.
  That path does NOT depend on Reminder_Scheduler (it's a one-shot notify on an admin action).
- The only missing piece for reminders is the **activation glue above** — building the rules + turning
  them on.
