# Scheduling — DynamoDB Tables Runbook

Provisioning runbook for shared DynamoDB tables that support the scheduling v1 feature.

These are **shared platform tables** — one stack per environment (staging, prod). Every tenant uses the same tables; rows are scoped by `tenantId`. Tenant onboarding (handled by `Picasso_Config_Manager` POST `/config`) does **not** touch these tables — it only writes data into them later.

> **Provisioning model:** manual `aws dynamodb` CLI commands, executed once per environment. No IaC tool required. If the schema evolves enough to warrant CloudFormation, promote this runbook to a template — for v1 the schemas are stable.

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

## Future tables

When sub-phase A8c lands the `Booking` table (composite GSI on `(tenantId, start_at)`), append a new section here. If the GSI complexity makes a hand-written runbook error-prone, that's the right time to promote this whole document to CloudFormation.

## Change log

| Date | Change | Operator |
|---|---|---|
| 2026-05-02 | Initial — `picasso-token-jti-blacklist-staging` provisioned (sub-phase A6) | Chris |
