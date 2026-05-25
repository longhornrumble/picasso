# Prod CloudTrail → CW Logs Export Investigation (M9.G5 Step 1.5 — F-DSAR21 sub-step)

**Date**: 2026-05-25
**Scope**: confirm/clarify the M9.G7-routed concern that prod-614 CloudTrail has no CloudWatch Logs export, so `dynamodb.UpdateTimeToLive` events cannot be alarmed.
**Method**: read-only `aws cloudtrail describe-trails` + `aws cloudtrail get-event-selectors` against prod-614 (account 614056832592, profile `myrecruiter-prod`).
**Result**: M9.G7's routing premise was INCOMPLETE — there are TWO trails in prod-614, not one.

## Findings

Two active CloudTrail trails exist in prod-614:

| Trail | Multi-region | OrgTrail | Selectors | S3 bucket | CW Logs export |
|---|---|---|---|---|---|
| `myrecruiter-management-events` | ✅ | ❌ | Management events + S3 data events on `myrecruiter-picasso/` bucket only | `aws-cloudtrail-logs-614056832592-197425f1` | ❌ **None** |
| `myrecruiter-montycloud` | ✅ | ✅ (Organization Trail) | Management events ONLY | `aws-cloudtrail-logs-614056832592-c2f5658a` | ✅ `arn:aws:logs:us-east-1:614056832592:log-group:aws-cloudtrail-montycloud-logs-614056832592-b85a3495:*` |

**Both trails capture Management events** (which includes `dynamodb.UpdateTimeToLive`). Since `myrecruiter-montycloud` IS exporting Management events to a CW Logs log group, **`UpdateTimeToLive` events on prod-614 DDB tables are already flowing to CloudWatch Logs today** — via the MontyCloud OrgTrail.

**M9.G7 closure narrative was incomplete on this point.** The narrative said:

> "investigation found prod-614 CloudTrail (`myrecruiter-management-events`) has `CloudWatchLogsLogGroupArn=null`; enabling CW Logs export is a prod config change that belongs under F-DSAR21/M9.G5"

That premise enumerated only ONE of the two trails. With the OrgTrail in the picture, a CW Logs metric filter + alarm on `dynamodb.UpdateTimeToLive` is **technically possible TODAY** without any prod config change.

## Disposition

**Classification: defer-with-named-trigger** for the alarm build decision. Rationale:

1. **No active need for the alarm today.** The M9.G7 narrative framed the alarm as a "secondary control" for prod-614 PII table TTL hygiene. The primary control (M4.G2 backfill execution log + post-condition scan returning Count=0) is intact; the secondary control would catch a future operator-induced `UpdateTimeToLive` (e.g., someone disabling TTL on `picasso_form_submissions`). Useful but not blocking.

2. **Two competing implementation paths** exist, neither obviously right without active need:
   - **(A) Build metric filter + alarm against the existing MontyCloud OrgTrail log group** (`aws-cloudtrail-montycloud-logs-614056832592-b85a3495`) — fast and free. Risk: vendor-owned log group; any MontyCloud retention/deletion/permission change could silently break the alarm.
   - **(B) Enable CW Logs export on `myrecruiter-management-events` ourselves + build alarm there** — clean separation; we own the log group + retention + permissions. Cost: CW Logs ingestion + retention (~$0.50/GB ingested + storage tier; management events on a small account are tens-of-MB/day → likely under $1/mo for management events only, more if data events get enabled later).
   - **(C) Hybrid** — build alarm against MontyCloud's log group NOW for the immediate alarm need, plan to migrate to our own log group at the prod-Terraform-cutover boundary.

3. **The choice between (A), (B), (C) depends on whether MontyCloud is a long-term vendor or transient.** That's an information question outside this audit's read-only scope.

## Named triggers (any one → build the alarm)

- First operator-induced `UpdateTimeToLive` event on any of the 5 prod PII surfaces (caught by retrospective scan of the existing MontyCloud log group OR by the user noticing TTL state change during quarterly drift audit).
- Atlanta tenant LOI received (Atlanta gate per master plan §M6 requires the alarm pre-cutover).
- Calendar backstop **2026-08-22 D2/D3/D4 currency review** — aligned with M9.G5 Step 1 + the broader F-DSAR21 family.
- MontyCloud vendor status change (terminated / migrated away) — at that point the OrgTrail goes away and option (B) or (C) becomes mandatory.

## What this closes

- **M9.G5 Step 1.5 sub-item (prod CT→CW Logs export)**: ✅ closed via this document.
- **F-DSAR21 scope-expansion item (b) M9.G7 prod-CT-UpdateTimeToLive sub-item**: ✅ closed — original routing premise was incomplete; corrected here with empirical evidence that the alarm is achievable today against existing infrastructure if/when triggered.

## What this does NOT close (still M9.G5 Step 1.5 targets)

- Sprint B placeholder-body anomaly investigation (deployed-code SHA vs source SHA per BSH Lambda)
- Audit-table CloudTrail data-events config (staging-525 audit table)

These remain deferred-with-trigger under M9.G5.

## Methodology note

The M9.G7 closure routed this item to M9.G5 based on enumerating only `myrecruiter-management-events`. Future closure-routing should enumerate ALL trails in the target account before declaring "no CW Logs export possible." A one-line `aws cloudtrail describe-trails | grep -i log-group` would have caught the OrgTrail. Adding to lessons: **enumerate the full account's resources of the class before routing a "missing" finding** — particularly for AWS resource classes where multiple instances are common (CloudTrail, S3 buckets, KMS keys).
