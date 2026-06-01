# WS-IAC — IaC for the booking-event consumers + SNS fan-out (I4)

> Integrator-authored work-order; read-only brief. Dedicated IaC worker (the C8 pattern). Provisions the deployed surface for the merged consumers (lambda#195/#194) + the planned WS-CAL-LIFECYCLE, and the fan-out topology (I2-A).

**Plan task(s):** I4 (integrator glue owed after the B9/B10/B11 merge) + the I2-A topology decision.
**Repo / branch / base:** `picasso` · `feature/scheduling-ws-iac-consumers` · base `staging` (IaC → staging per the SOP; soak before promote).
**Quality gate:** `verify-before-commit` (always; `terraform fmt`+`validate`+IAM-charset grep) · weave audit = **full** (IAM + new external surface). CI posts `terraform plan` against staging.

## Goal / done-bar (verifiable)
Terraform that makes the booking-event consumers deployable + correctly fed. Done when `terraform plan` (staging) shows ONLY the intended adds and `apply` succeeds:

1. **SNS FIFO fan-out topic** `picasso-calendar-watch-events-{env}.fifo` (the topology cutover, I2-A). The `Calendar_Watch_Listener` will publish here instead of the bare SQS queue — **NOTE: the Listener code change (SQSClient→SNSClient publish, MessageGroupId preserved) is an INTEGRATOR-owned coupled change landing in the lambda repo WITH this cutover; this work-order provides the topic + the env var the Listener will read. Coordinate the cutover ordering with the integrator (topic must exist before the Listener flips).**
2. **Two SQS FIFO subscriptions** off the topic, each with an `event_type` **filter policy**:
   - `Calendar_Event_Consumer` queue ← filter `{ event_type: [ooo_overlap_detected, attendee_declined] }`
   - `Calendar_Lifecycle_Consumer` queue ← filter `{ event_type: [calendar_deleted, calendar_moved, calendar_reassigned, event_made_private] }`
   (`attendee_accepted` = no consumer / drop by having no subscription match — document it.)
   Each queue: **content-based dedup off**, FIFO, a redrive policy to a **DLQ** with **`maxReceiveCount` tuned so a permanently-malformed message doesn't stall its FIFO group** (≤ 2–3) + a DLQ alarm to ops-alerts.
3. **Two Lambda modules** (`infra/modules/lambda-calendar-event-consumer-staging/` + `infra/modules/lambda-stranded-booking-remediator-staging/`; add `-calendar-lifecycle-consumer-` when WS-CAL-LIFECYCLE merges) mirroring the C8 module pattern: dedicated least-priv exec role, placeholder zip + `ignore_changes=[filename,source_code_hash]`, log group + KMS, reserved concurrency, **`event_source_mapping` with `function_response_types=["ReportBatchItemFailures"]`** (REQUIRED — the consumers return partial-batch; without it failures don't redrive).
4. **Least-priv IAM** (no wildcards):
   - `Calendar_Event_Consumer`: Booking `UpdateItem` + `sns:Publish` ops-alerts + SQS consume + KMS-for-logs.
   - `Stranded_Booking_Remediator`: Booking GSI `Query` + `GetItem`/`UpdateItem` + AppointmentType/RoutingPolicy `GetItem` + per-tenant OAuth `GetSecretValue` (`picasso/scheduling/oauth/{tenant}/*`, NOT wildcard) + KMS-for-logs.
   - `Calendar_Lifecycle_Consumer` (when it lands): Booking GetItem/UpdateItem + calendar-watch-channels `UpdateItem` + `sns:Publish` + SQS consume.
5. **B11 offboarding trigger** — wire `Stranded_Booking_Remediator` invocation into the offboarding path (the `Calendar_Watch_Offboarder` already runs on coordinator offboarding; invoke the remediator with `{tenant_id, coordinator_email, offboarding_time}` — async invoke OR an explicit step). Confirm the auth principal note (suspended-account OAuth → `failed[]` is expected).

## You OWN (create/edit ONLY these)
- `infra/modules/lambda-calendar-event-consumer-staging/**`, `infra/modules/lambda-stranded-booking-remediator-staging/**`, the SNS-fan-out + subscriptions module/section, and the **wiring block in `infra/main.tf`** for these (the integrator will review the main.tf hunk — it's the one shared file you may append to, scoped to these resources; flag it in the PR).

## You CONSUME (frozen — never modify)
- The existing `picasso-calendar-watch-events-{env}.fifo` queue + listener module (the integrator handles the Listener publish-target flip + retiring/repurposing the bare queue). FROZEN_CONTRACTS §A table ARNs. The C8 module (`infra/modules/lambda-booking-commit-staging/`) as the pattern reference.

## OUT OF SCOPE / do NOT
- Do NOT edit the Lambda CODE (lambda repo) — the Listener SQS→SNS change is integrator-owned; you provide the topic + env wiring only.
- Do NOT `terraform apply` against prod. Do NOT add IAM wildcards. Run the IAM-charset grep (`grep -rnP '[^\x09\x0A\x0D\x20-\x7E\xA1-\xFF]' infra/modules/lambda-*consumer*`) before commit (the em-dash-in-IAM gotcha).
- Do NOT edit shared scheduling docs (kanban/plan/contracts) — propose the doc-snippet.

## References
- `infra/modules/lambda-booking-commit-staging/` (C8 pattern), `listener_dispatch_interface.md` (topology RESOLVED note + envelopes), `CLAUDE.md` (SOP, **never `terraform apply` prod**, never-share-IAM, IAM-charset gotcha, drift cap, `unset AWS_* before terraform`).

## Report-back (in your PR)
- PR title `infra(scheduling): consumer Lambda modules + SNS fan-out (I4)`, base `staging`.
- Doc-snippet: the topology diagram + the env vars the Listener needs (for the integrator's coupled change); pii-inventory IaC lines for the modules. **Do not edit pii-inventory.md yourself.**
- Tell the integrator: branch, PR#, the `terraform plan` summary, the main.tf hunk to review, the Listener-cutover ordering, any contract issue.
