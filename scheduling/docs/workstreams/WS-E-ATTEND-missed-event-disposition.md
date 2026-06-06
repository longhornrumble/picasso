# WS-E-ATTEND — attendance check + 3-option disposition + escalation (E5/E6/E10 + C13)

**Plan task(s):** E5, E6, E10, C13. [implementation plan](../scheduling_implementation_plan.md) §7.
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-e-attend` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **FULL — HIGH-RISK** (signed-token disposition + booking state transitions). Mandatory Security-Reviewer + operator go-ahead. NO auto-merge.
**Sequence:** launch AFTER WS-E-REMIND's E5 attendance-rule trigger exists (or stub the trigger + flag the seam).

## Goal / done-bar (verifiable)
The missed-event loop: attendance check → 3-option interviewer disposition → silence-escalation cadence, plus the C13 Zoom-outage page.
1. **E5 attendance rule:** at `event_end + 30min` set the NON-KEY `attendance_state='pending_attendance'` (**NOT** `Booking.status` — §E4; status stays `booked`); send the 3-option interviewer prompt via the SHIPPED D4 `/attended/*` endpoints (security path live, action **stubbed** — you wire the action).
2. **E6 disposition (wires D4's stub):** `attended_yes → Booking.status=completed` · `no_show → Booking.status=no_show` + auto-message the volunteer with a reschedule link · `didnt_connect → Booking.status=coordinator_no_show` (no outbound). Tokens = §B4 `attended_yes`/`no_show`/`didnt_connect`. **NO auto-completion** (§11.1) — `attendance_state` stays `pending_attendance` until human disposition or admin close.
3. **E10 escalation cadence (silence):** T+24h resend + admin cc · T+72h urgent + Customer-Portal inbox alert · T+7d weekly digest (recurs until resolved). Dispatch via WS-E-REMIND's EventBridge lifecycle + `send_email`/SMS (§E3 gate).
4. **C13 Zoom-outage T-15 paging:** at T-15min, on a Zoom-unreachable signal, page the coordinator via the SMS path (now exists). Folded here per the kanban (was SMS-blocked in C).

- **Done-bar:** E2E per disposition branch (yes/no-show/didnt-connect); `attendance_state` is non-key (CI-3c status stays the §A 5); each escalation step integration-tested (T+24h cc / T+72h urgent+inbox / T+7d digest); C13 pages on a simulated Zoom-outage.

## You OWN (create/edit ONLY these)
- a new `Attendance_*`/disposition module(s) + the escalation-cadence logic + C13 paging + tests. (The `attendance_state` write is additive on the Booking row.)

## You CONSUME (frozen — never modify)
- **§E4** (disposition state machine), **§E1** (EventBridge rules — CONSUME WS-E-REMIND's lifecycle), **§B4 + the D4 `/attended/*` endpoints** (security path SHIPPED — wire the stubbed action), **§E3** (`selectChannels` for escalation/C13 SMS), **WS-E-COPY** (re-engagement copy for the no-show auto-message), **§A Booking** (`attendance_state` additive).

## You PRODUCE
- The disposition + escalation flow (the Customer-Portal inbox alert surface is consumed by WS-E-PORTAL).

## OUT OF SCOPE / do NOT
- Do NOT add `pending_attendance` to the `Booking.status` vocabulary (§A locks the 5) — it is a non-key `attendance_state`.
- Do NOT build the EventBridge rule lib (WS-E-REMIND) or the consent gate (WS-E-TCPA) — CONSUME both.
- Do NOT auto-complete a booking — human disposition only.

## References
- Plan E5/E6/E10/C13; canonical §9.2/§11/§11.1/§11.2; FROZEN §E1/E3/E4 + §B4; `CLAUDE.md` (tokens/commit → full audit).

## Report-back (in your PR)
- PR `feat(scheduling): WS-E-ATTEND attendance + disposition + escalation (E5/E6/E10/C13)` → main. **Flag HIGH-RISK for the FULL audit.**
- Doc-snippet: plan E5/E6/E10/C13 status; confirm `attendance_state` non-key + the disposition→valid-status mapping; flag the WS-E-REMIND E5-trigger seam.
- Branch, PR#, done-bar status, any contract issue (STOP + flag, don't fork).
