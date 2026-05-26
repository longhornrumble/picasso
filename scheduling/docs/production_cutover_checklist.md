# Scheduling — Production Cutover Checklist

**Reference.** Authoritative checklist for the Layer 3 and Layer 4 flag-flip gates defined in [`scheduling_ci_strategy.md`](scheduling_ci_strategy.md) §4.3 and §6. Operators tick items off in order and record completion below. Do not flip the flag until every item in the relevant section is checked.

---

## Layer 3 — First Pilot Tenant

Run this section once, before any production `scheduling_enabled` flag is flipped for the first time. All items are mandatory. None can be waived.

### Coverage requirements

- [ ] Staging burn-in tenant (`MYR384719`) has reached ≥50 bookings with `Booking.status = booked` — each had a confirmation email sent, a calendar event written, and at least one reminder rule created.
- [ ] ≥10 bookings completed via cancellation — at minimum 1 via signed guest cancel-link AND at least 1 via in-chat intent.
- [ ] ≥5 bookings completed via reschedule (atomic cancel + rebook; calendar event preserved or recreated; original confirmation-link expiry correct).
- [ ] ≥5 missed-event dispositions exercised through each of the four paths: `attended_yes`, `no_show`, `didnt_connect`, and no-response-through-escalation-cadence (T+24h, T+72h, T+7d).
- [ ] ≥3 reminder windows (24h, 1h, or 30min) fired across a DST boundary (use the `STAGING_TEST_MODE` accelerated synthetic if a real DST boundary hasn't occurred).
- [ ] Synthetic monitoring has been running continuously and has emitted ≥24 consecutive hours of green hourly cancel-cycle results.
- [ ] Synthetic monitoring's last successful run completed ≤2 hours ago at time of this checklist review.
- [ ] jti revocation exercised end-to-end: token issued → jti blacklisted → token clicked again → 410 Gone confirmed in staging.
- [ ] CloudWatch alarm for jti-blacklist hit-rate spikes is wired and test-fired in staging (simulated token-replay attempt triggers alarm).

### Operational requirements

- [ ] CloudWatch alarm exists and is ACTIVE: scheduling Lambda errors (threshold ≥1 error in 5 min).
- [ ] CloudWatch alarm exists and is ACTIVE: missed-event-disposition Lambda errors.
- [ ] CloudWatch alarm exists and is ACTIVE: calendar API timeout rate.
- [ ] CloudWatch alarm exists and is ACTIVE: jti-blacklist hit rate (token replay attempt detector).
- [ ] CloudWatch alarm exists and is ACTIVE: Booking write failures.
- [ ] CloudWatch alarm exists and is ACTIVE: Lambda config-cache drain detector (flags if cache has not drained within 7 minutes of a flag change, per CI strategy §2 Layer 1 blast-radius note).
- [ ] All alarms route to SNS topic `arn:aws:sns:us-east-1:614056832592:picasso-ops-alerts` and chris@myrecruiter.ai is confirmed subscribed.
- [ ] Rollback rehearsed in staging: `scheduling_enabled` flipped to `false` → Lambda config cache drained within 5 minutes (verified via drain-detector alarm clearing) → no in-flight booking left orphaned (no calendar event without DB record, no EventBridge rule without a booking row, no confirmation email without a DB record). Documented scenario: booking initiated, flag flipped before user clicks Confirm, clean state verified after drain.
- [ ] Pilot tenant chosen and has explicitly opted in to canary status (written acknowledgment on file).
- [ ] Pilot tenant has a real booking use case and their staff calendars are connected.
- [ ] Pilot tenant has been briefed on the rollback path ("flag flip back; no code rollback needed").
- [ ] Direct communication channel to Chris established for the first 48 hours post-flip.
- [ ] Timing confirmed: not a Friday, not a holiday eve (per `feedback_deploy_timing.md`).
- [ ] Manual S3 backup of the pilot tenant's config taken (or automatic backup verified to exist within the last 24 hours).

---

## Layer 4 — Each Subsequent Tenant

Run this section for every tenant flip after the pilot. Pilot must have completed its Layer 3 gate first.

- [ ] Pilot tenant has been live ≥7 days including at least one Saturday and one Sunday.
- [ ] Pilot tenant has reached ≥10 real (non-synthetic) confirmed bookings.
- [ ] No unresolved incidents from the pilot tenant's active window.
- [ ] Target tenant's staff have connected their calendars.
- [ ] Target tenant's admin has configured `scheduling_tags` vocabulary and assigned tags to staff.
- [ ] Target tenant has been briefed on the disposition email cadence and the rollback path.
- [ ] Minimum 24-hour wait observed since the last tenant was enabled.
- [ ] Manual S3 backup of the target tenant's config taken.

---

## Per-Cutover Record

Fill in after each cutover (Layer 3 or Layer 4).

```
Tenant ID:         ___________________________
Tenant name:       ___________________________
Layer:             3 / 4  (circle one)
Date:              ___________________________
Time (ET):         ___________________________
Operator:          ___________________________
Completed-by (signature or initials): ___________________________

Checklist items all checked?    YES / NO
If NO — items skipped and rationale:
  _______________________________________________________________

Post-flip 30-min observation notes:
  _______________________________________________________________

Issues found:      YES / NO
If YES — incident ticket or description:
  _______________________________________________________________
```

---

## Rollback Rehearsal Checklist

Run this against staging before any Layer 3 flip. Demonstrates the rollback is clean before it's needed in production.

- [ ] Note the current `scheduling_enabled` value (should be `true` for `MYR384719` in staging).
- [ ] Initiate a test booking and leave it in `status = pending_confirmation` (do not click Confirm).
- [ ] Flip `scheduling_enabled` to `false` in the tenant config via Config Builder.
- [ ] Start a timer. Wait for the Lambda config-cache drain-detector alarm to clear (≤5 minutes).
- [ ] Verify: no calendar event exists for the in-flight booking in the test coordinator's Google Calendar.
- [ ] Verify: no EventBridge Scheduler rule for the in-flight booking's reminders (check AWS console or `aws scheduler list-schedules`).
- [ ] Verify: no confirmation email was sent for the in-flight booking (check SES send logs).
- [ ] Verify: the Booking row (if written) is in a state that makes the orphan unambiguous and loggable.
- [ ] Restore `scheduling_enabled` to `true` to return staging to its normal burn-in state.
- [ ] Document actual drain time and any orphaned artifacts found above.

---

## Reference

- Cutover protocol step-by-step: [`scheduling_ci_strategy.md`](scheduling_ci_strategy.md) §6
- Coverage and operational requirements source: [`scheduling_ci_strategy.md`](scheduling_ci_strategy.md) §4.3
- Layer 4 rollout as standing operational procedure: CI strategy §7

## Change log

| Date | Change | Operator |
|---|---|---|
| 2026-05-02 | Initial — authored from CI strategy §4.3 and §6 coverage and operational requirements | Chris + Claude |
