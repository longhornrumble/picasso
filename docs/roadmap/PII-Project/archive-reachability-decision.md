# ARCHIVE_BUCKET Reachability Decision

**Phase 0.5 deliverable.** Closes [D3 Finding 14](./data-flow-map.md) by verifying the existence, posture (region / encryption / lifecycle / versioning), and operator-reachability of `ARCHIVE_BUCKET` — the S3 destination that `picasso-session-archiver` writes OLD_IMAGE session-summaries to when a session-summaries row is deleted via TTL.

> **Why this matters for DSAR fulfillment:** if a subject's session-summaries row has aged out via TTL, the *content* persists in the archive bucket. DSAR delete / anonymize requests must include the archive bucket walk, or the response is incomplete. The bucket details (name, region, lifecycle) are not in `infra/modules/` on this branch — the Lambda reads from env var `ARCHIVE_BUCKET`. This document records the live state.

## Verification commands

### Step 1 — Read the `ARCHIVE_BUCKET` env var from the Lambda configuration

```bash
aws sso login --profile myrecruiter-staging
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
aws lambda get-function-configuration \
  --function-name picasso-session-archiver \
  --region us-east-1 \
  --profile myrecruiter-staging \
  --query 'Environment.Variables.ARCHIVE_BUCKET' \
  --output text
```

### Step 2 — Verify reachability + posture of the bucket

```bash
# Replace BUCKET below with the value from Step 1
BUCKET=[TODO: paste from step 1 output]

# Existence + region
aws s3api head-bucket --bucket $BUCKET --profile myrecruiter-staging
aws s3api get-bucket-location --bucket $BUCKET --profile myrecruiter-staging

# Encryption posture
aws s3api get-bucket-encryption --bucket $BUCKET --profile myrecruiter-staging

# Versioning posture
aws s3api get-bucket-versioning --bucket $BUCKET --profile myrecruiter-staging

# Lifecycle rules (deleted-versions retention, expiration)
aws s3api get-bucket-lifecycle-configuration --bucket $BUCKET --profile myrecruiter-staging

# Sample listing (no PII content — just the key prefix shape)
aws s3 ls s3://$BUCKET/ --recursive --profile myrecruiter-staging | head -20

# Public-access block check
aws s3api get-public-access-block --bucket $BUCKET --profile myrecruiter-staging
```

## Result

**Bucket name (from Step 1):** `picasso-archive-staging`

**Region:** `us-east-1` (LocationConstraint=null per AWS convention)

**Encryption:** `AES256` (SSE-S3; BucketKeyEnabled=true; no CMK)

**Versioning:** `Enabled` ⚠️ — **finding** per interpretation §"If versioning is ON"

**Lifecycle:**
```
Rules:
  - ID: DeleteAfterOneYear
    Filter: { Prefix: sessions/ }
    Status: Enabled
    Expiration.Days: 365
    NoncurrentVersionExpiration.NoncurrentDays: 7
```

**Public-access block:** all-four-flags-true (BlockPublicAcls + IgnorePublicAcls + BlockPublicPolicy + RestrictPublicBuckets) ✅

**Sample key shape:**
```
$ AWS_PROFILE=myrecruiter-staging aws s3 ls s3://picasso-archive-staging/ --recursive | head -20
(empty — bucket has no objects at verification time)
```

Bucket is empty as of 2026-05-23 verification. This is consistent with either: (a) `picasso-session-archiver` not yet invoked at scale (staging traffic light); or (b) writes failing silently (D3 F14 follow-up). Either way, an immediate DSAR walk against this surface returns zero rows; the bucket's posture is what matters for forward-looking DSAR fulfillment.

**Date verified:** 2026-05-23 (staging acct 525)

## Decision applied (2026-05-23)

**Posture is mostly within expected baseline** — SSE-S3, lifecycle present, public-access blocked, region matches DDB source. **Single deviation: versioning is ENABLED.** Branch "If versioning is ON" applies:

1. **Compensating control already in place:** lifecycle rule `DeleteAfterOneYear` has `NoncurrentVersionExpiration.NoncurrentDays = 7`, so old versions auto-expire 7 days after a new version is written. The DSAR-impact window is therefore bounded to 7 days post-mutation rather than indefinite.
2. **Bucket is currently empty.** No DSAR-impacting history exists yet — the finding is preventive, not remedial.
3. **DSAR walker (M2 future scope) must enumerate versions when walking the archive.** Until M2 lands the ARCHIVE_BUCKET walker, the operator playbook (M3 done-bar #6) carries the procedure: `aws s3api list-object-versions --bucket picasso-archive-staging --prefix sessions/{sessionId}/` then per-version delete with `--version-id`.
4. **Long-term remediation = turn versioning OFF** (one-shot operational change; no data loss). Tracked as D5 row F-DSAR17 (new, this commit). Routed to M9's TTL hygiene audit milestone — when M9 runs the per-row TTL status confirmation, this archive-bucket versioning posture is one of the rows audited. Until then, the 7-day NoncurrentVersionExpiration + walker enumeration is the standing mitigation.
5. **No additional D5 escalation today** — the SSE-S3 / lifecycle / public-access posture is acceptable; only versioning needed flagging.

## Production-account ARCHIVE_BUCKET (operator-pending)

Staging verification (above) does not cover prod-614. Operator (Chris) must run the equivalent verification against the prod-account session-archiver Lambda when explicit prod authorization is granted. Expected outcome: a prod-account analogue of `picasso-archive-prod` (or named per prod-account convention) with matching posture. Findings update this doc + D5 routing.

## Interpretation guide

The expected posture for a session-summaries archive bucket is:
- **Region:** us-east-1 (same as the source DDB table).
- **Encryption:** SSE-S3 (AES256) at minimum; CMK preferred but not required at Tier 3.
- **Versioning:** Suspended or NotConfigured. If versioning is ON, deleted objects leave a delete-marker but prior versions persist — bypasses delete semantics. **If versioning is ON, this is a finding** — add a row in D5 or escalate.
- **Lifecycle:** rules to expire objects after a defined retention period (e.g., 365 days, 7 years — depends on audit retention policy). If no lifecycle, archive grows unbounded.
- **Public-access block:** all four flags = true. Public-readable archive = critical finding.

## Decision

**If posture matches expected (SSE-S3, versioning off, lifecycle present, public-access-blocked):**
- DSAR Lambda walk includes the archive bucket — pattern: walk by `sessionId` prefix matching the subject's identifiers (email-derived sessions OR PSID-derived sessions).
- For delete: `aws s3 rm s3://$BUCKET/sessions/{sessionId}/*` or equivalent.
- For anonymize: download object → replace identifying fields → re-upload with `[anonymized:YYYY-MM-DD]` placeholder filename.
- Document the exact archive-walk procedure in the DSAR Lambda spec.

**If versioning is ON:**
- D5 carries an additional row: "Archive bucket versioning bypasses delete." 
- DSAR delete must include `--version-id` enumeration + delete of all versions: `aws s3api list-object-versions --bucket $BUCKET --prefix sessions/{sessionId}/` then delete each version.
- Long-term: turn versioning OFF (one-shot operational change; no data loss).

**If lifecycle is absent:**
- D5 carries an additional row: "Archive grows unbounded."
- Short-term: DSAR delete still works (Lambda walks + deletes specific subject's objects).
- Long-term: add lifecycle rule for archive expiration (operational, not DSAR-blocking).

**If public-access-block is missing or partial:**
- This is a **critical finding** — escalate to highest priority. The archive contains PII-adjacent inferred summaries; public-read access = data leak.
- Immediate action: enable public-access-block in all four positions before any DSAR is even considered.

**If the bucket doesn't exist (head-bucket fails):**
- The `picasso-session-archiver` Lambda's `ARCHIVE_BUCKET` env var points at a non-existent bucket → archive writes are failing silently (or the Lambda is erroring on every invocation).
- D3 Finding 7 needs re-investigation — the stream consumer is wired but the destination is broken. Check Lambda error logs.
- Until resolved: DSAR Lambda cannot walk the archive (no archive to walk). Record the finding in D5 as F14-resolved-to-N/A.

## Audit trail

This document, once filled, is the authoritative record of the verification. The git commit SHA of the filled-in version is the citable evidence for the F14 close.

Re-verify: at any change to `picasso-session-archiver` (Lambda or its env vars); at Apply-2 design gate; at first DSAR fulfillment involving an aged-out session.
