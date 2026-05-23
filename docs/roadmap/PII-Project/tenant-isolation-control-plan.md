# Tenant-isolation control plan (DSAR Lambda + MFS-scoped surfaces)

**Date:** 2026-05-23.
**Owner:** Chris.
**Closes:** [`MASTER_PROJECT_PLAN.md`](./MASTER_PROJECT_PLAN.md) M1 done-bar #7 + M1.G5 (F-DSAR2 residual-risk revisit triggers).
**D5 row:** [`privacy-risk-register.md`](./privacy-risk-register.md) `F-DSAR2` (L/H, accepted residual).
**Strategy guide:** [`README.md`](./README.md) Near-Term target "tenant isolation"; D4 Tier-3 control "tenant-isolated".

## Statement of intent

Picasso enforces tenant isolation on PII surfaces via **code + IAM scope**, not via cryptographic per-tenant key separation. Each tenant is its own GDPR data controller; tenant data lives in `tenant_id`-partitioned DynamoDB tables; the DSAR Lambda's walkers bound every Query to a single tenant partition; the Lambda's execution role permissions are scoped to the PII-table resource set (no cross-tenant resource ARNs).

This control plan documents the controls in force, the residual risk accepted (F-DSAR2), and the explicit triggers that would force re-evaluation.

## Controls in force (current posture)

### Control 1 — Walker `KeyConditionExpression` bounds every read

The DSAR Lambda walker (`Lambdas/lambda/picasso_pii_dsar_staging/lambda_function.py`) issues every Query against PII tables with `KeyConditionExpression = Key("tenant_id").eq(tenant_id)` where `tenant_id` is the operator-supplied parameter at invocation time. DynamoDB's partition-key model guarantees the Query returns only items within that partition.

**Affected operations:** all read paths (`_walk_form_submissions`, `_walk_notification_sends`, `_walk_notification_events`, `_walk_recent_messages`, `_walk_conversation_summaries`, `_walk_audit`).

### Control 2 — Walker `DeleteItem` Key is recovered from bounded Query result

`DeleteItem` is never issued against an item the walker did not first observe via a tenant-bounded Query. The `Key={tenant_id, ...}` passed to `DeleteItem` carries the tenant-bounded `tenant_id` from the Query result, ensuring the delete can only target items the walker reached.

### Control 3 — Dispatcher + walker unit tests assert tenant boundaries

Test suite at `Lambdas/lambda/picasso_pii_dsar_staging/test_dsar.py`:
- **4 dispatcher tests** validate that the operator-supplied `tenant_id` flows correctly to walker invocations and that no walker is invoked without it.
- **7 walker tests** validate that each `_walk_*` function bounds its KeyConditionExpression to a single tenant_id partition and that cross-tenant data is not returned.

Current count: 108+ tests, all green (verified post-PR1 2026-05-22).

### Control 4 — IAM role scoping (Apply-1 + PR1)

The DSAR Lambda's execution role (`picasso-pii-dsar-staging-role`) carries IAM policies that scope `dynamodb:Query` + `dynamodb:DeleteItem` to the named PII table ARN set:
- `picasso-form-submissions-staging`
- `picasso-notification-sends-staging`
- `picasso-notification-events-staging`
- `staging-recent-messages`
- `staging-conversation-summaries`
- `picasso-pii-subject-index-staging`
- `picasso-pii-dsar-audit-staging`

No `Resource: "*"` on DDB actions; no cross-tenant table ARNs.

Additionally, the Apply-1 KMS CMK (`kms-pii-staging`) policy lists the DSAR role in `DataPlaneAllowListedRoles` Allow + `DenyDecryptToAllOtherPrincipals` exception, scoped to the CMK alone (does not grant key access for other tenants' future per-tenant keys).

### Control 5 — Operator-only invocation (PR1 C1)

`aws_lambda_permission "operator_only"` restricts Lambda invocation to a single SSO permission set ARN (`AWSReservedSSO_AdministratorAccess_c46cb409a39e2990`). No public Function URL exposure; no API Gateway. Operator-in-the-loop on every invocation; `dry_run=true` is the default mode.

### Control 6 — Audit row per invocation (PR1 H4)

Every DSAR Lambda invocation writes an audit row to `picasso-pii-dsar-audit-staging` capturing `dsar_id`, `tenant_id`, `operator`, `event_type`, `status`. Cross-tenant invocation pattern is observable in audit-table review.

## Residual risk (F-DSAR2 — accepted L/H)

**Risk:** `DeleteItem` IAM permission is not bounded to operator-requested `tenant_id` via `dynamodb:LeadingKeys` IAM condition. Tenant isolation is enforced in walker code (Controls 1 + 2) and in test assertions (Control 3), but NOT at IAM layer.

A walker bug or compromised request payload could in principle trigger cross-tenant deletion within the surfaces the role can reach.

**Why accepted today:**

Dynamic per-request `tenant_id` is not expressible as a static IAM condition without one of three over-engineered patterns:
1. **Static `dynamodb:LeadingKeys` enumeration of all tenant_ids** — defeats isolation (any tenant becomes a valid leading key for any operator request).
2. **Per-tenant assumed-role pattern** — adds an STS hop + per-tenant role provisioning; over-engineered at < 50 tenants.
3. **Session-policy at invoke-time** — operator constructs a policy per call; operationally fragile, error-prone.

L × I = L/H. Likelihood is low because: walker code is tested (Control 3); operator is in the loop (Control 5); audit-row trail makes cross-tenant pattern observable (Control 6). Impact is High because a successful cross-tenant delete could affect another tenant's consumer-rights subjects without their or their tenant's consent.

## Revisit triggers (F-DSAR2 reopens; F-DSAR2 row re-rated)

If any of the following fires, this control plan is re-evaluated and F-DSAR2 D5 row reopens with severity reflecting the new conditions. On reopening, design the assumed-role pattern + ABAC migration (Control approach #2 above, scoped to the new tenant volume / operator model).

1. **Tenant count crosses 50.** At > 50 tenants, the assumed-role pattern's STS hop overhead becomes negligible relative to the cross-tenant blast radius; static IAM scoping is no longer over-engineered.
2. **Cross-tenant near-miss observed in integration tests** (item 6 in MASTER_PROJECT_PLAN.md M1 done-bar #3). If integration tests reveal any path that returns or deletes cross-tenant data despite Controls 1–6, immediate F-DSAR2 reopening.
3. **Multi-operator deployment.** Today there is a single operator (Chris). If operator role expands to multiple humans (or to automated invocation), the single-operator assumption underpinning Control 5 no longer holds — IAM-level scope becomes necessary.
4. **Post-incident finding implicating cross-tenant blast radius.** Any incident — whether security, operational, or data-integrity — that surfaces cross-tenant exposure as a root cause or contributing factor automatically reopens F-DSAR2.

## Tenant-isolation under DSAR data flows

End-to-end tenant isolation for a DSAR invocation:

1. Operator (Control 5) invokes Lambda with `{subject_identifier, identifier_type, request_type, tenant_id, operator, dsar_id, dry_run}`.
2. Dispatcher (Control 3 dispatcher tests) routes to walkers with the `tenant_id` parameter.
3. Each walker (Control 1) issues `Query(KeyConditionExpression=tenant_id eq <param>)` — DynamoDB returns only that tenant's items.
4. If `dry_run=false`, walker collects items, then issues `DeleteItem(Key={tenant_id, <SK>})` (Control 2) — each delete carries the tenant-bounded `tenant_id`.
5. IAM (Control 4) enforces that the role can only touch the named PII tables — no cross-table escape.
6. Audit row (Control 6) records `tenant_id` for the invocation.

If any walker has a bug that omits `KeyConditionExpression` or uses a wrong `tenant_id`, Controls 1 + 3 fail simultaneously — Control 3 tests would have caught it pre-deploy, and Control 6 audit-row review would detect post-hoc.

## What this plan does NOT do

- Does NOT implement per-tenant CMK separation. Apply-1's `kms-pii-staging` is platform-scoped (single key serves all PII tables); per-tenant keys are out of scope.
- Does NOT implement IAM-level cross-tenant boundary (residual F-DSAR2 above).
- Does NOT address cross-tenant exposure in non-DSAR data planes (e.g., MFS request handlers, analytics writers). Those surfaces have their own tenant-isolation discipline (form_handler `tenant_id` partition keying; analytics writer tenant tagging) — out of scope for this plan, which is DSAR-specific.

## Cross-references

- D5 row: [`privacy-risk-register.md`](./privacy-risk-register.md) F-DSAR2
- Master plan: [`MASTER_PROJECT_PLAN.md`](./MASTER_PROJECT_PLAN.md) M1 done-bar #7 + M1.G5
- Lambda code: `Lambdas/lambda/picasso_pii_dsar_staging/lambda_function.py` (walkers)
- Test code: `Lambdas/lambda/picasso_pii_dsar_staging/test_dsar.py` (108+ tests)
- IaC: `infra/modules/lambda-pii-dsar-staging/main.tf` (role + policy + permission)
- Apply-1 audit (M7 preconditions): `~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_consumer_pii_remediation_path_a_phase2_apply1_audit_2026-05-19.md`
