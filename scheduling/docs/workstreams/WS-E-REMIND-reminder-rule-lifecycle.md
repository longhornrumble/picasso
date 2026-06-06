# WS-E-REMIND — reminder EventBridge rule lifecycle + dispatch + reconciler (E2/E3-dispatch/E4-rules/E9)

**Plan task(s):** E2, E3 (dispatch wiring), E4 (EventBridge rule lifecycle), E9 (reconciler). [implementation plan](../scheduling_implementation_plan.md) §7.
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-e-remind` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **light** (additive infra + pure cadence logic; no auth/PII; the EventBridge Scheduler IAM role is integrator glue).

## Goal / done-bar (verifiable)
A new `Reminder_Scheduler/` module that owns the **per-booking EventBridge Scheduler rule lifecycle** (the ONLY new backend surface — see §E1). The dispatch *consumer* already exists (`Scheduled_Message_Sender`); you create the schedules it consumes, and you implement its missing email branch.
1. **At booking commit (E2):** derive the reminder tiers from `(start_at − now)` per §E2 (≥24h→{t24h,t1h} · 4–24h→{t1h} · 1–4h→{t15m} · <1h→{}); write N `picasso-scheduled-messages` rows (status:'pending') in the §E1 **write shape**; create N EventBridge schedules (+ the `sched-attendance-{booking_id}` rule) targeting `Scheduled_Message_Sender` with input `{pk, sk, message_id}`.
2. **Email branch (E3):** implement the `// Future` email channel stub in `Scheduled_Message_Sender` — `channel:'email'` rows invoke `send_email` (email-as-floor, §E1/D7).
3. **Re-bind / delete (E4):** **token-reschedule** (§B9, same `booking_id`, `start_at` updated in place) → delete old schedules+rows, recompute tiers vs new `start_at`, create fresh. **Any cancel — INCLUDING `booking.calendar_moved`** (the cal-lifecycle consumer CANCELS on a coordinator move) → delete all schedules+rows. ◀ **named exit-criterion test: a token-reschedule re-derives the schedule** (NOT calendar_moved — that's a delete).
4. **Reconciler (E9):** nightly **bounded GSI query** (`tenantId-start_at-index`, prior-7d window — NO full-table scan) for `event_end+35min`-past bookings lacking `attendance_state`; auto-correct clear cases; EventBridge-schedule cleanup for terminal-state bookings >7d; D6-outcome-(ii) orphan recovery.
5. **is_synthetic time-compression (§E1):** `STAGING_TEST_MODE && is_synthetic` → tiers as `start_at = now + N_min`; double-gated; handler-init prod-guard refusal.

## You OWN (create/edit ONLY these)
- `Reminder_Scheduler/` (rule-create/upsert/delete lib + cadence + reconciler + tests) + the email branch in `Scheduled_Message_Sender/index.mjs` (the stub at the `// Future` line) + its test.

## You CONSUME (frozen — never modify)
- **§E1** (rule naming/payload/write-shape/lifecycle), **§E2** (tiers), **§E3** (`selectChannels` at dispatch — channel chosen at fire-time), **§E6** (`is_synthetic`), **§A Booking** (read `start_at` AT FIRE TIME), **§B9** (`executeReschedule` triggers re-bind), the **§14.2 listener** `booking.calendar_moved` (= cancel → delete).

## You PRODUCE
- The EventBridge Scheduler rule lifecycle + the `picasso-scheduled-messages` write shape (CI-6 + the dispatch path depend on it).

## OUT OF SCOPE / do NOT
- Do NOT write the EventBridge Scheduler IAM execution role (trust `scheduler.amazonaws.com`) — that's **integrator glue**; deliver a deploy note listing the role/permissions needed (`scheduler:CreateSchedule/DeleteSchedule`, the RoleArn it must pass).
- Do NOT build the consent gate / quiet-hours logic (WS-E-TCPA owns §E3 `selectChannels`) — CONSUME it.
- Do NOT re-introduce "calendar_moved re-binds" — move = cancel = delete (§E1).

## References
- Plan E2/E3/E4/E9; canonical §12.1/§9.2; FROZEN §E1/E2/E6 + §B9; `CLAUDE.md` (schema discipline, never-share-IAM).

## Report-back (in your PR)
- PR `feat(scheduling): WS-E-REMIND reminder rule lifecycle + dispatch (E2/E3/E4/E9)` → main.
- Doc-snippet: plan E2/E4/E9 status; the deploy note (EventBridge Scheduler IAM role + env vars); confirm the §E1 write shape + the token-reschedule-not-calendar_moved re-bind semantics.
- Branch, PR#, done-bar status, any contract issue (STOP + flag, don't fork).
