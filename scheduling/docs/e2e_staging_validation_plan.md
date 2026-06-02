# Scheduling — E2E Staging Validation Plan

**Purpose.** Active end-to-end validation of the calendar-watch event pipeline now that all three
wiring gaps (A = Listener SQS→SNS cutover, B = Offboarder→Remediator trigger, C = X/Y foundation
wiring into B9/B11/cal-lifecycle) are merged and applied to staging. This is the "thoroughly test in
staging before production" campaign — it is **not** the production-cutover gate (that bar lives in
[`production_cutover_checklist.md`](production_cutover_checklist.md); this plan *feeds* it).

**Strategy context (operator, 2026-06-02):** staging-only deployment. No production cutover. Production
Zoom deferred; **staging Zoom is a go**.

---

## Why this is active E2E, not a "soak"

Staging carries **no organic traffic**. A passive soak — letting a deployment sit and watching for
drift under load — surfaces nothing here, because there is no load. The validation value comes from
**deliberately generating events and asserting every hop**. Each scenario below: trigger an input,
follow it through Listener → SNS FIFO → event_type filter → consumer → DynamoDB → notification, and
assert the observable outcome at each stage, including failure paths.

**The narrow exceptions that genuinely need wall-clock time** (bounded, targeted observation — still not
a general soak):

| Time-dependent path | Why time matters | Bounded observation |
|---|---|---|
| Watch-channel expiry / renewal (`Calendar_Watch_Renewer`) | Google channels TTL out (~7 days); renewal only proves over elapsed time | One renewal cycle, or accelerate via a short-TTL test channel if supported |
| `syncToken` progression | Must *advance* across sequential pushes, not retry-storm (the B-1 class bug) | Drive ≥3 sequential real pushes, assert `syncToken` advances each time |
| SNS→SQS FIFO delivery under filter policy | **Highest silent-failure risk**: Listener returns 200 even if delivery silently drops | Assert message lands in the correct queue after every publish |
| Bedrock KB sync (if any KB hop in scope) | Sync latency is minutes | Confirm sync job reaches COMPLETE, not just "started" |

---

## Preconditions (verify before running any scenario)

```bash
export AWS_PROFILE=myrecruiter-staging   # requires a live `aws sso login --profile myrecruiter-staging`

# P1 — the 4 redeployed functions are live at the gap-C main (lambda 4589dab).
for fn in Calendar_Watch_Listener Calendar_Watch_Offboarder \
          Stranded_Booking_Remediator Calendar_Event_Consumer; do
  aws lambda get-function-configuration --function-name "$fn" \
    --query '{fn:FunctionName,sha:CodeSha256,modified:LastModified,runtime:Runtime}' --output table
done
# Expected: each CodeSha256 matches the locally-built zip from a clean 4589dab checkout
# (record the 4 SHAs in this doc's appendix after deploy — G8 hazard: a terraform apply on any of
#  these modules re-deploys the placeholder zip over live code; re-verify SHA after ANY infra apply).

# P2 — SNS FIFO topic + the 2 filtered subscriptions exist with raw delivery + body-scoped filter.
TOPIC=$(aws sns list-topics --query "Topics[?contains(TopicArn,'picasso-calendar-watch-events-staging.fifo')].TopicArn" --output text)
echo "topic=$TOPIC"
aws sns list-subscriptions-by-topic --topic-arn "$TOPIC" \
  --query 'Subscriptions[].{ep:Endpoint,arn:SubscriptionArn}' --output table
for sub in $(aws sns list-subscriptions-by-topic --topic-arn "$TOPIC" --query 'Subscriptions[].SubscriptionArn' --output text); do
  echo "--- $sub ---"
  aws sns get-subscription-attributes --subscription-arn "$sub" \
    --query 'Attributes.{raw:RawMessageDelivery,scope:FilterPolicyScope,policy:FilterPolicy}' --output json
done
# Expected per sub: RawMessageDelivery=true, FilterPolicyScope=MessageBody,
#   FilterPolicy routes event_type → event-consumer.fifo (B9/B10 set) vs lifecycle-consumer.fifo (§14.2 set).

# P3 — send_email reachable in staging (item 3). If absent, B9/B11 notices log *_failed (best-effort, non-fatal).
aws lambda get-function-configuration --function-name send_email \
  --query '{fn:FunctionName,sha:CodeSha256}' --output table 2>&1 || echo "send_email NOT in staging — see item 3"

# P4 — Zoom S2S secret present IF exercising the Zoom meeting-link path (staging Zoom = go).
aws secretsmanager describe-secret --secret-id "picasso/scheduling/zoom/MYR384719" \
  --query '{name:Name,changed:LastChangedDate}' 2>&1 || echo "Zoom secret not provisioned — Meet/Null paths still testable"

# P5 — burn-in tenant + tables.
for t in picasso-booking-staging picasso-appointment-type-staging picasso-routing-policy-staging \
         picasso-calendar-watch-channels-staging; do
  aws dynamodb describe-table --table-name "$t" --query 'Table.{t:TableName,status:TableStatus}' --output table
done
```

**Burn-in tenant:** `MYR384719` (per `production_cutover_checklist.md`). All synthetic bookings/events
created under this tenant; never touch client tenants.

---

## Pipeline topology (under test)

```
Google Calendar (test coordinator, tenant MYR384719)
   │  events.watch push  (X-Goog-Channel-* headers; token = SHA-256-verified)
   ▼
Calendar_Watch_Listener  ── delta-discovers via syncToken, derives typed envelopes
   │  SNS Publish (FIFO, MessageGroupId=event_id, dedup=sha256(basis))
   ▼
picasso-calendar-watch-events-staging.fifo   ──►  DLQ: picasso-calendar-watch-events-dlq-staging.fifo
   │  fan-out, FilterPolicyScope=MessageBody on event_type, raw_message_delivery=true
   ├── event_type ∈ {B9/B10 set} ──► picasso-calendar-event-consumer-staging.fifo ──► Calendar_Event_Consumer
   └── event_type ∈ {§14.2 set}  ──► picasso-calendar-lifecycle-consumer-staging.fifo ──► (NO CONSUMER YET)
```

⚠️ **The lifecycle queue has no consumer Lambda deployed** (`lambda-calendar-lifecycle-consumer-staging`
module does not exist yet). Lifecycle events the Listener publishes will accumulate in that queue —
this is **expected backlog**, not an alarm (matches gap-A audit R3). Group 5 below is **blocked** on
that module landing.

---

## Scenarios

Severity legend: **[CORE]** must pass before claiming the pipeline validated · **[EDGE]** failure-path /
robustness · **[TIME]** needs the bounded wall-clock observation above.

### Group 1 — Listener publishes typed events to SNS (gap A) **[CORE]**

For each, mutate the test coordinator's Google Calendar to produce the event, let the watch push fire
(or direct-invoke the Listener with a captured push), then assert the SNS publish.

| # | Trigger on test calendar | Expected `event_type` | Assert |
|---|---|---|---|
| 1.1 | Create a booking-window event | `event_created` | publish to topic; lands in event-consumer.fifo |
| 1.2 | Move an existing event's start | `event_moved` | envelope carries old+new `start_at` |
| 1.3 | Delete an event | `event_deleted` | routes to **lifecycle** queue (Group 5 dep) |
| 1.4 | Mark an event private/confidential | `event_made_private` | envelope includes `channel_id` (gap-A schema add) |
| 1.5 | Set coordinator OOO (outOfOffice) | OOO-typed | `workingLocation` events are **excluded** (gap-A) |
| 1.6 | Cancel (status=cancelled) | `event_canceled` | routes per filter policy |
| 1.7 | Two rapid edits to same event | (dedup) | FIFO dedup by `sha256(basis)`; no double-dispatch |

**Per-publish assertion (the silent-failure guard):** after each trigger, confirm the message actually
arrived in the *correct* queue — do not trust the Listener's 200.

```bash
# Drain-peek the target queue (does not delete; visibility-timeout returns it):
Q=$(aws sqs get-queue-url --queue-name picasso-calendar-event-consumer-staging.fifo --query QueueUrl --output text)
aws sqs receive-message --queue-url "$Q" --max-number-of-messages 10 --visibility-timeout 1 \
  --message-attribute-names All --query 'Messages[].Body' --output text
```

### Group 2 — FIFO fan-out + filter correctness **[CORE][TIME]**

- 2.1 Publish a B9-set event → assert it lands **only** in event-consumer.fifo, **not** lifecycle.
- 2.2 Publish a §14.2-set event → assert it lands **only** in lifecycle.fifo.
- 2.3 Publish 3 sequential events with advancing `syncToken` → assert Listener's `advanceSyncToken`
  (DynamoDB `UpdateItem` on the channel row) advances each time — **the B-1 regression guard**.
  ```bash
  aws dynamodb get-item --table-name picasso-calendar-watch-channels-staging \
    --key '{"channel_id":{"S":"<id>"}}' --query 'Item.sync_token.S'
  ```
- 2.4 Malformed/unfilterable event_type → confirms it does not silently match both subs.

### Group 3 — B9 reoffer: X gate + token + Y dispatch (gap C) **[CORE]**

Driven via the Event_Consumer (SQS → handler). Seed a `picasso-booking-staging` row, then deliver a
reoffer-triggering event.

- 3.1 **Happy path:** booking has `attendee_email` + `appointment_type_id` + `start_at`; routing policy
  resolves ≥1 candidate via `resolveCandidates({tenantId, appointmentTypeId})` → reoffer token signed
  (`sign('reschedule', {tenant_id, booking_id, start_at})`) → `dispatchVolunteerNotice({kind:'reoffer', …})`.
  Assert: candidate resolved, token verifies (iss isolates from chat JWT), reoffer URL well-formed,
  notice dispatched (or `*_failed` logged if send_email absent — P3).
- 3.2 **No candidates (X gate):** routing resolves empty → **no reoffer sent** (no false-hope), conflict
  flag stands. Assert no token minted, no dispatch.
- 3.3 **[EDGE] Old-shape row, no `start_at`:** assert the guard skips before `sign()` (no throw).
- 3.4 **[EDGE] `sign()` throws / secret unreadable:** assert best-effort swallow — primary workflow not
  failed/redriven. (Validates the gap-C **CRITICAL** fix: Event_Consumer role is in the
  `picasso/jwt/signing-key` secret-policy Allow **and** the Deny-StringNotEquals allowlist.)
  ```bash
  # Confirm the role is allow-listed (the jwt-Deny override fix):
  aws secretsmanager get-resource-policy --secret-id picasso/jwt/signing-key \
    --query 'ResourcePolicy' --output text | python3 -m json.tool
  # Expect Calendar_Event_Consumer role ARN in BOTH the Allow principal list and the Deny condition allowlist.
  ```
- 3.5 **[EDGE] Multi-booking reoffer loop:** several stranded bookings → per-booking token/claims,
  one failure does not abort the rest.

### Group 4 — B11 offboarding trigger (gap B) **[CORE]**

- 4.1 **Happy path:** offboard the test coordinator → `Calendar_Watch_Offboarder` async-invokes
  `Stranded_Booking_Remediator` (`InvocationType=Event`, payload `{tenant_id, coordinator_email,
  offboarding_time}`). Assert the remediator runs, loads candidates via the X resolver
  (`resolveCandidates({tenantId, routingPolicyId})`), and remediates the stranded bookings.
  ```bash
  aws logs tail /aws/lambda/Stranded_Booking_Remediator --since 10m --profile myrecruiter-staging
  ```
- 4.2 **[EDGE] Remediator async failure:** force a remediator error → assert `event_invoke_config`
  (`maximum_retry_attempts=1`, `on_failure` → ops-alerts SNS) routes the failure; not silently dropped.
- 4.3 **[EDGE] Offboarder dispatch fails WITH channels present:** assert the offboarder's primary
  teardown still completes (best-effort trigger does not roll back channel teardown).
- 4.4 **Non-coordinator offboard path:** assert the remediator is **not** invoked.

### Group 5 — §14.2 lifecycle notices (gap C, cal-lifecycle) **[BLOCKED]**

🔒 **Blocked until `lambda-calendar-lifecycle-consumer-staging` module is built + deployed.** The Y wire
(`getNoticeContext` → guards → `sign()` → `dispatchVolunteerNotice`) is merged but inert. Once live:

- 5.1 `event_deleted` → `reconcileDeleted` → Y `cancel_notice` with reschedule_url; Booking.status →
  `canceled`. **This is what B11's cancel path depends on** — until then a B11 cancel deletes the
  calendar event but Booking.status stays `booked`.
- 5.2 `event_moved` → `reconcileMoved` → Y `move_optin_sms` (SMS stub, inert today — assert log shape only).
- 5.3 Drain the accumulated lifecycle-queue backlog; assert each historical event reconciles correctly.

---

## Coverage matrix (maps to the prod-cutover bar — informational, NOT a prod gate)

| Capability | This plan's scenarios | Cutover-checklist line it feeds |
|---|---|---|
| Booking created → calendar write + confirmation | (needs C8 booking flow E2E — separate) | "≥50 bookings with status=booked" |
| Cancellation (guest link + in-chat) | Group 5.1 (blocked) | "≥10 cancellations" |
| Reschedule / reoffer | Group 3 | "≥5 reschedules" |
| Offboarding remediation | Group 4 | (operational resilience) |
| Listener delivery integrity | Groups 1–2 | (no checklist line — new with gap A; the silent-failure guard) |

---

## What is explicitly NOT coverable today (honest boundary)

1. **§14.2 lifecycle E2E (Group 5)** — no consumer Lambda yet. Build `lambda-calendar-lifecycle-consumer-staging` to unblock.
2. **B11 cancel → Booking.status=canceled** — depends on (1).
3. **Real volunteer email/SMS delivery** — depends on `send_email` in staging (item 3) + (for SMS) the sub-phase-E SMS path.
4. **Zoom meeting-link generation** — depends on the staging Zoom S2S secret (P4); Meet/Null paths testable now.
5. **Full booking-create flow (C8)** — exercised by its own flow, not this watch-pipeline plan.

---

## Appendix — record after deploy

| Function | CodeSha256 (post-deploy, from clean 4589dab build) | Verified date |
|---|---|---|
| Calendar_Watch_Listener | _TBD_ | |
| Calendar_Watch_Offboarder | _TBD_ | |
| Stranded_Booking_Remediator | _TBD_ | |
| Calendar_Event_Consumer | _TBD_ | |
