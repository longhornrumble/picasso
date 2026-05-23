# DSAR CloudTrail verification

**Purpose:** Document the CloudTrail coverage of the DSAR Lambda + audit table in staging account `525409062831`. The DSAR audit table is the "what happened" record; CloudTrail is the "what AWS calls did the operator/Lambda make" record. Both must capture the relevant signals for an end-to-end auditable DSAR pipeline.

**Authored:** 2026-05-21 (PR1 fix-now-4, C3 + H2 + SR-D).

---

## 1. Trail inventory (verify before merge)

CloudTrail was discovered already-provisioned in acct 525 during pre-flight (see fix-now-4 plan §1 drift adjustments). C3's scope is therefore "verify what exists" — not "provision new."

```bash
AWS_PROFILE=myrecruiter-staging aws cloudtrail describe-trails \
  --query 'trailList[].[Name,HomeRegion,IsMultiRegionTrail,IsOrganizationTrail,S3BucketName,KMSKeyId]' \
  --output table
```

**Expected (as of 2026-05-21):** trail `myrecruiter-montycloud`, multi-region = true, organization trail = true, S3 destination set, KMS-protected.

If any of these flip (e.g., multi-region disabled, S3 bucket deleted, KMS key disabled), DSAR CloudTrail coverage degrades — surface to operator before any further DSAR runs.

---

## 2. H2 — management-event coverage of DSAR Lambda invocations

**Claim:** invocations of `picasso-pii-dsar-staging` appear in CloudTrail as `Invoke` API events under `lambda.amazonaws.com`. Mgmt events are on by default for all trails.

```bash
AWS_PROFILE=myrecruiter-staging aws cloudtrail get-event-selectors \
  --trail-name myrecruiter-montycloud \
  --query 'EventSelectors[?contains(IncludeManagementEvents, `true`)]' \
  --output json
```

**Expected:** at least one EventSelector with `IncludeManagementEvents: true` and `ReadWriteType: All` (or `WriteOnly`).

### 2.1 H2 live-verification

After PR1 ships (Lambda has the new `aws_lambda_permission "operator_only"`), the C1 smoke-test invocation MUST produce a CloudTrail event:

```bash
# Run a smoke invocation (per C1 smoke-test in PR1 acceptance)
SMOKE_INVOCATION_TIME=$(date -u +%FT%TZ)
# ... (operator invokes Lambda via SSO role; see C1 in PR1 acceptance)

# 30 seconds later, find the event in CloudTrail
sleep 30
AWS_PROFILE=myrecruiter-staging aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=Invoke \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=picasso-pii-dsar-staging \
  --start-time "$SMOKE_INVOCATION_TIME" \
  --query 'Events[].[EventTime,Username,EventName,ResourceName]' \
  --output table
```

**Expected:** one event matching the smoke invocation timestamp, with `Username` matching the SSO role assumed-role session.

If no event appears within 30s → CloudTrail mgmt-event coverage is missing for Lambda Invoke — surface to operator. (CloudTrail mgmt events typically deliver to S3 in 5-15 min; the lookup-events API is the immediate index.)

---

## 3. SR-D — data-event coverage of audit-table writes

**Claim:** DDB data events (PutItem, GetItem, Query, DeleteItem) for `picasso-pii-dsar-audit-staging` should be captured by CloudTrail so the operator can independently verify "the audit table received the rows the DSAR Lambda claims to have written."

**Default state:** DDB data events are NOT captured by default — they must be explicitly added to a trail's EventSelectors. (Data events are billable per AWS pricing.)

### 3.1 Verify whether DDB data events are configured today

```bash
AWS_PROFILE=myrecruiter-staging aws cloudtrail get-event-selectors \
  --trail-name myrecruiter-montycloud \
  --query 'AdvancedEventSelectors[?contains(FieldSelectors[?Field==`eventCategory`].Equals[], `Data`)]' \
  --output json
```

Then inspect the result for any `FieldSelector` with `Field: resources.type` and `Equals` containing `AWS::DynamoDB::Table` AND a `Field: resources.ARN` matching the audit table.

### 3.2 If data events are NOT configured for the audit table

Operator decision: either
1. **Add data events to the existing trail** (preferred; centralizes audit). Requires editing the org-managed `myrecruiter-montycloud` trail's selectors — cross-account org-trail change may need org-admin coordination.
2. **Create a tactical trail in acct 525** scoped only to the audit table. Lower coordination cost; adds operational duplication. Tracked as deferred-but-named in D5 if chosen.
3. **Defer to tranche-2** with named-trigger backstop. F-DSAR16 (or a new D5 row added in PR2) carries the deferred-status with rationale.

**MERGE recommendation for PR1:** do NOT block PR1 merge on DDB data events being added (DDB data events are a complement to the audit table's own append-only event log, not a substitute). Track as a follow-up gap in D5 with PR2 ownership; close after operator decides §3.2 path.

### 3.3 Operational note — audit table vs CloudTrail-data-events overlap

The audit table itself is the canonical record of DSAR events. CloudTrail data events are a secondary defense against the case where:
- A principal with `dynamodb:DeleteItem` somehow bypasses the C2 resource-policy Deny (e.g., deny lifted for purge but accidentally not re-applied)
- The DSAR Lambda's own audit-write fails silently (already mitigated by AuditCollision exception)
- An out-of-band principal directly writes to or reads from the audit table

These scenarios all leave a CloudTrail data-event trail even if the audit table itself is mutated unexpectedly. SR-D treats this as defense-in-depth, not primary control.

---

## 4. Trail integrity (operator awareness)

The trail's S3 bucket and KMS key are themselves resources that, if compromised, would let an attacker rewrite history. CloudTrail file-integrity validation (digest files) should be enabled on the trail and periodically verified.

```bash
AWS_PROFILE=myrecruiter-staging aws cloudtrail describe-trails \
  --trail-name-list myrecruiter-montycloud \
  --query 'trailList[].LogFileValidationEnabled' --output text
# Expected: True
```

If False, trail tamper-detection is off — surface to operator. (Outside fix-now-4 scope to fix; this runbook just makes the operator aware.)

---

## 5. Reference

- Plan source: `~/.claude/plans/pii-dsar-fixnow4-implementation-plan.md` §4 PR1 C3 + H2 + SR-D
- D5 risk register: [`privacy-risk-register.md`](privacy-risk-register.md) — F-DSAR16 + audit-coverage related rows
- Audit table source: [`infra/modules/ddb-pii-dsar-audit-staging/main.tf`](../../../infra/modules/ddb-pii-dsar-audit-staging/main.tf)
- Lambda source: [`infra/modules/lambda-pii-dsar-staging/main.tf`](../../../infra/modules/lambda-pii-dsar-staging/main.tf)
