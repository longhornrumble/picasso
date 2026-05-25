# Sub-phase B1 — `picasso-calendar-watch-channels` table runbook

**Purpose.** Provision the DynamoDB table that backs `Calendar_Watch_Listener` (B2) and `Calendar_Watch_Renewer` (B3) per canonical [§14.1](scheduling_design.md#L744). One row per active Google Calendar push-notification watch channel.

**Pattern.** Mirrors A6 (operator-execute AWS CLI; no IaC for v1 per re-audit). Per [`subphase_a_operator_runbook_2026-05-24.md`](subphase_a_operator_runbook_2026-05-24.md).

**Closure status.** Staging table `picasso-calendar-watch-channels-staging` PROVISIONED + verified 2026-05-25 (this runbook). Dev + prod deferred until B2/B3 Lambdas are ready to write/read.

---

## Schema (canonical §14.1)

| Attribute | Type | Role | Source |
|---|---|---|---|
| `channel_id` | S | PK | Google watch channel UUID (caller-supplied per stable-channel-ID-per-calendar-purpose rule) |
| `tenant_id` | S | required (GSI hash) | Tenant scoping; required so the listener can scope booking queries and ops can query "all unwatched channels for tenant X" without a full-table scan |
| `calendar_id` | S | attribute | Coordinator calendar ID (typically `coordinator@workspace.com`) |
| `calendar_provider` | S | attribute | `google` (v1) / `microsoft` reserved for v2 |
| `expiration` | N | attribute | Epoch millis (Google `expiration` field) |
| `callback_url` | S | attribute | Listener Lambda HTTPS endpoint registered with Google |
| `last_renewed_at` | S | attribute | ISO-8601; updated by Renewer |
| `status` | S | attribute (GSI range) | `active` \| `unwatched_renewal_failed` \| `event_body_private` (per §14.2) |
| `channel_token` | S | attribute | `secrets.token_hex(32)` per channel; validated via `hmac.compare_digest` |

**GSI:** `tenant-status-index` — HASH `tenant_id` + RANGE `status`. Used by Renewer to query renewable channels per tenant, and by ops to enumerate degraded channels per tenant.

**Billing mode:** `PAY_PER_REQUEST` (low write volume scales with coordinator count; pilot-scale <100).

**Encryption:** SSE-DDB default (AWS-owned key). No CMK in v1 — table contains tenant-operator identifiers (coordinator emails), not consumer PII. PII inventory tier: **NOT-CONSUMER**.

---

## Pre-image (verify table absent before apply)

```bash
aws dynamodb describe-table \
  --table-name picasso-calendar-watch-channels-staging \
  --profile myrecruiter-staging --region us-east-1 \
  --query 'Table.TableStatus' 2>&1 | head -3
# Expected: ResourceNotFoundException
```

---

## Apply (staging-525)

```bash
aws dynamodb create-table \
  --table-name picasso-calendar-watch-channels-staging \
  --attribute-definitions \
    AttributeName=channel_id,AttributeType=S \
    AttributeName=tenant_id,AttributeType=S \
    AttributeName=status,AttributeType=S \
  --key-schema AttributeName=channel_id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --global-secondary-indexes '[{
    "IndexName": "tenant-status-index",
    "KeySchema": [
      {"AttributeName": "tenant_id", "KeyType": "HASH"},
      {"AttributeName": "status", "KeyType": "RANGE"}
    ],
    "Projection": {"ProjectionType": "ALL"}
  }]' \
  --tags \
    Key=env,Value=staging \
    Key=project,Value=picasso \
    Key=subphase,Value=B1 \
    Key=managed-by,Value=runbook \
    Key=canonical-source,Value=scheduling-design-14.1 \
  --profile myrecruiter-staging --region us-east-1
```

Wait for `TableStatus=ACTIVE` and GSI `IndexStatus=ACTIVE` before proceeding.

---

## Verify

```bash
# (a) Table + GSI ACTIVE
aws dynamodb describe-table \
  --table-name picasso-calendar-watch-channels-staging \
  --profile myrecruiter-staging --region us-east-1 \
  --query 'Table.{Status:TableStatus,Keys:KeySchema,GSIs:GlobalSecondaryIndexes[].{Name:IndexName,Status:IndexStatus,Keys:KeySchema},Billing:BillingModeSummary.BillingMode}'

# (b) Sample write + GetItem + GSI query + cleanup
SAMPLE_CHANNEL_ID="b1-smoke-test-$(date +%s)"
aws dynamodb put-item \
  --table-name picasso-calendar-watch-channels-staging \
  --item "{
    \"channel_id\": {\"S\": \"$SAMPLE_CHANNEL_ID\"},
    \"tenant_id\": {\"S\": \"MYR384719\"},
    \"calendar_id\": {\"S\": \"test-coordinator@example.com\"},
    \"calendar_provider\": {\"S\": \"google\"},
    \"expiration\": {\"N\": \"1735689600000\"},
    \"callback_url\": {\"S\": \"https://example.invalid/listener\"},
    \"last_renewed_at\": {\"S\": \"2026-05-25T19:30:00Z\"},
    \"status\": {\"S\": \"active\"},
    \"channel_token\": {\"S\": \"smoke-test-token-not-real\"}
  }" \
  --profile myrecruiter-staging --region us-east-1

aws dynamodb get-item \
  --table-name picasso-calendar-watch-channels-staging \
  --key "{\"channel_id\": {\"S\": \"$SAMPLE_CHANNEL_ID\"}}" \
  --profile myrecruiter-staging --region us-east-1 \
  --query 'Item.{channel_id:channel_id.S,tenant_id:tenant_id.S,status:status.S}'

aws dynamodb query \
  --table-name picasso-calendar-watch-channels-staging \
  --index-name tenant-status-index \
  --key-condition-expression "tenant_id = :t AND #s = :st" \
  --expression-attribute-names '{"#s": "status"}' \
  --expression-attribute-values '{":t": {"S": "MYR384719"}, ":st": {"S": "active"}}' \
  --profile myrecruiter-staging --region us-east-1 \
  --query 'Items[].{channel_id:channel_id.S,status:status.S}'

aws dynamodb delete-item \
  --table-name picasso-calendar-watch-channels-staging \
  --key "{\"channel_id\": {\"S\": \"$SAMPLE_CHANNEL_ID\"}}" \
  --profile myrecruiter-staging --region us-east-1
```

**Expected:** (a) returns ACTIVE table + ACTIVE GSI; (b) GetItem returns the sample row; GSI query returns 1 item; delete succeeds.

---

## What this runbook closes

Plan §4 Task B1 verify check: *"Runbook commands succeed; sample row writes/reads correctly; runbook updated with the new table."* All three sub-criteria met against staging-525 on 2026-05-25 (this session).

**Plan amendment:** Task B1 row in [`scheduling_implementation_plan.md`](scheduling_implementation_plan.md) line ~154 amended to record completion.

**PII inventory:** new row added to [`docs/roadmap/PII-Project/pii-inventory.md`](../../docs/roadmap/PII-Project/pii-inventory.md) §B per the Living-Inventory PR Rule.

---

## Rollback (if needed)

```bash
aws dynamodb delete-table \
  --table-name picasso-calendar-watch-channels-staging \
  --profile myrecruiter-staging --region us-east-1
```

Safe rollback: B2/B3 Lambdas not yet writing — no data loss. Once B5 onboarding hooks land, rollback requires draining active watch channels (`events.stop` calls per row) before delete.

---

## Cross-env deployment

- **Dev (372666940362):** defer until B2 unit tests need a real DDB target. Apply same commands with `--profile myrecruiter-dev` and `-dev` suffix on table name.
- **Prod (614056832592):** Phase-2 promotion gated by full sub-phase B exit. Apply same commands with `--profile myrecruiter-prod` and `-prod` suffix. Per the SOP: prod promotion is explicit + gated + rare; not part of normal B-phase work.

Per CLAUDE.md "Never share resources across environments": no single table serves multiple envs; the `{name}-{env}` naming convention is enforced.
