# Scheduling — DynamoDB Tables Runbook

Provisioning runbook for shared DynamoDB tables that support the scheduling v1 feature.

These are **shared platform tables** — one stack per environment (staging, prod). Every tenant uses the same tables; rows are scoped by `tenantId`. Tenant onboarding (handled by `Picasso_Config_Manager` POST `/config`) does **not** touch these tables — it only writes data into them later.

> **Provisioning model (superseded 2026-05-18 → R1):** these tables are now **Terraform-managed** under `infra/modules/ddb-*` (sub-phase A8c), created greenfield in the staging account (525). Note: the `picasso-token-jti-blacklist-staging` table this runbook originally created (PR #52, 2026-05-02) was provisioned in the **old prod-614 account** under a staging name, pre-P0-account-split. That prod-614 table is a **Q3-parked legacy artifact** — left untouched (account isolation + the "never touch prod in feature work" hard rule); it is **not** imported. This runbook is retained as an **emergency-recovery reference only** — do not hand-provision these tables in an environment Terraform manages. The CLI commands below document the intended shape; Terraform is the source of truth.

---

## Table 1 — `picasso-token-jti-blacklist-{env}`

**Purpose.** Holds revoked JWT IDs (the `jti` claim of a token) so auth middleware can reject them before they expire naturally. Required for scheduling because booking-link tokens (Reschedule / Cancel emails) live for weeks; cancellation, fraud, or admin off-boarding requires immediate revocation without rotating the signing key.

**Access pattern.** `IsTokenRevoked(tenantId, jti) → bool` — point lookup on `(tenantId, jti)`. Auth middleware checks every request bearing a scheduling JWT.

**Tenant isolation.** Every row is keyed by `tenantId`; tenants cannot see each other's revoked tokens.

### Schema

| Attribute | Type | Role |
|---|---|---|
| `tenantId` | String | Partition key (HASH) |
| `jti` | String | Sort key (RANGE) |
| `expires_at` | Number (epoch seconds) | TTL — DynamoDB auto-deletes the row when the underlying token would expire |
| `revoked_at` | Number (epoch seconds) | Audit metadata (when revocation happened) |
| `revoked_by` | String | Audit metadata (user ID or system actor) |
| `reason` | String | Optional free-text reason (`"cancelled_booking"`, `"admin_revoke"`, etc.) |

Only `tenantId`, `jti`, and `expires_at` are part of the table definition; the audit attributes are written at insert time and don't need declaration.

**Billing mode.** `PAY_PER_REQUEST`. Revocations are infrequent and bursty; no need to forecast capacity.

### Provisioning commands

Run **once per environment.** Both staging and prod use the same schema; only the table name changes.

#### Staging

```bash
aws dynamodb create-table \
  --table-name picasso-token-jti-blacklist-staging \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
      AttributeName=tenantId,AttributeType=S \
      AttributeName=jti,AttributeType=S \
  --key-schema \
      AttributeName=tenantId,KeyType=HASH \
      AttributeName=jti,KeyType=RANGE \
  --tags Key=project,Value=picasso Key=feature,Value=scheduling Key=env,Value=staging \
  --profile chris-admin \
  --region us-east-1

# Wait for table to be ACTIVE before enabling TTL
aws dynamodb wait table-exists \
  --table-name picasso-token-jti-blacklist-staging \
  --profile chris-admin \
  --region us-east-1

aws dynamodb update-time-to-live \
  --table-name picasso-token-jti-blacklist-staging \
  --time-to-live-specification "Enabled=true, AttributeName=expires_at" \
  --profile chris-admin \
  --region us-east-1
```

#### Production

Same commands as staging, with `staging` replaced by `prod` in `--table-name` and `--tags`. **Run only after staging is verified and the calling Lambda code has been merged to main.**

### Verification

After creation, confirm the table is healthy:

```bash
aws dynamodb describe-table \
  --table-name picasso-token-jti-blacklist-staging \
  --profile chris-admin \
  --region us-east-1 \
  --query 'Table.{Name:TableName,Status:TableStatus,Keys:KeySchema,Billing:BillingModeSummary.BillingMode}'

aws dynamodb describe-time-to-live \
  --table-name picasso-token-jti-blacklist-staging \
  --profile chris-admin \
  --region us-east-1
```

Expected: `Status: ACTIVE`, `Billing: PAY_PER_REQUEST`, TTL enabled on `expires_at`.

### Smoke test

Insert a synthetic revocation, read it back, and verify TTL behavior is configured correctly:

```bash
aws dynamodb put-item \
  --table-name picasso-token-jti-blacklist-staging \
  --item '{
    "tenantId": {"S": "MYR384719"},
    "jti": {"S": "smoke-test-jti-001"},
    "expires_at": {"N": "1735689600"},
    "revoked_at": {"N": "1714521600"},
    "revoked_by": {"S": "runbook-smoke-test"},
    "reason": {"S": "smoke_test"}
  }' \
  --profile chris-admin \
  --region us-east-1

aws dynamodb get-item \
  --table-name picasso-token-jti-blacklist-staging \
  --key '{"tenantId":{"S":"MYR384719"},"jti":{"S":"smoke-test-jti-001"}}' \
  --profile chris-admin \
  --region us-east-1

aws dynamodb delete-item \
  --table-name picasso-token-jti-blacklist-staging \
  --key '{"tenantId":{"S":"MYR384719"},"jti":{"S":"smoke-test-jti-001"}}' \
  --profile chris-admin \
  --region us-east-1
```

---

## Table 2 — `picasso-booking-{env}`

**Purpose.** The scheduling Booking record. Greenfield in A8c (no pre-existing table — created by Terraform, not imported).

**Access pattern.** Identity lookup on `(tenantId, booking_id)`. Tenant-scoped time-range and coordinator queries via two GSIs (both created at table-creation time — DynamoDB cannot add a GSI without a table rebuild).

**Tenant isolation.** Every row keyed by `tenantId`; both GSIs are `tenantId`-hashed, so no cross-tenant query is structurally possible.

| Attribute | Type | Role |
|---|---|---|
| `tenantId` | String | Partition key (HASH) |
| `booking_id` | String | Sort key (RANGE) |
| `start_at` | String (ISO-8601) | GSI `tenantId-start_at-index` range key |
| `coordinator_email` | String | GSI `tenantId-coordinator_email-index` range key |

- **GSI `tenantId-start_at-index`** — `(tenantId, start_at)`, projection ALL. B5 onboarding hook, B11 stranded-booking detection, E9 nightly reconciliation, OOO-overlap detection (canonical §5.2 item 5 / §14.2).
- **GSI `tenantId-coordinator_email-index`** — `(tenantId, coordinator_email)`, projection ALL. B11 stranded-booking queries for a departed coordinator without a full-table scan (canonical §16).
- Billing `PAY_PER_REQUEST`; PITR enabled (operational PII; retention/PII deletion is sub-phase F, not a TTL). Round-robin needs no GSI (state on `RoutingPolicy`, canonical §10.1/§10.2). The `(resource_id, start_at, end_at)` uniqueness rule (§5.2) is enforced at write in C6 — it is not the table key.

Terraform: `infra/modules/ddb-booking/`. Emergency-recovery `create-table` equivalent:

```bash
aws dynamodb create-table \
  --table-name picasso-booking-staging \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions \
      AttributeName=tenantId,AttributeType=S \
      AttributeName=booking_id,AttributeType=S \
      AttributeName=start_at,AttributeType=S \
      AttributeName=coordinator_email,AttributeType=S \
  --key-schema \
      AttributeName=tenantId,KeyType=HASH \
      AttributeName=booking_id,KeyType=RANGE \
  --global-secondary-indexes \
      '[{"IndexName":"tenantId-start_at-index","KeySchema":[{"AttributeName":"tenantId","KeyType":"HASH"},{"AttributeName":"start_at","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}},
        {"IndexName":"tenantId-coordinator_email-index","KeySchema":[{"AttributeName":"tenantId","KeyType":"HASH"},{"AttributeName":"coordinator_email","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]'
```

### v2 hot-partition mitigation path (not v1)

v1 uses `tenantId` as the partition key on every scheduling table — correct at single-tenant pilot scale. When a high-volume tenant lands, a single `tenantId` partition can hot-spot. **v2 mitigation:** composite PK `tenantId#shardN` where `shardN` is a small deterministic suffix (e.g., `hash(booking_id) % 16`); GSIs follow the same sharding. This is a table rebuild + backfill — schedule it as dedicated v2 work, not a v1 task. Do not pre-shard in v1 (adds query fan-out for no pilot-scale benefit).

## Future tables

Subsequent scheduling tables are added as Terraform modules under `infra/modules/ddb-*` and wired in `infra/main.tf`. This runbook documents their intended shape for emergency recovery; it is not the provisioning mechanism.

## Change log

| Date | Change | Operator |
|---|---|---|
| 2026-05-02 | Initial — `picasso-token-jti-blacklist-staging` provisioned (sub-phase A6) | Chris |
| 2026-05-18 | A8c — tables Terraform-managed (R1), greenfield in staging-525: `picasso-token-jti-blacklist-staging` (the PR#52 table was prod-614 legacy, Q3-parked, not imported) + `picasso-booking-staging` (2 GSIs). Runbook now emergency-recovery reference only. | Chris + Claude |
