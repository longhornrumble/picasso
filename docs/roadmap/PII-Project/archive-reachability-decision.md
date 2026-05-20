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

**Bucket name (from Step 1):** `[TODO: paste from step 1]`

**Region:** `[TODO: paste from get-bucket-location]`

**Encryption:** `[TODO: paste sse_algorithm and KMS key if applicable]`

**Versioning:** `[TODO: Enabled / Suspended / NotConfigured]`

**Lifecycle:** `[TODO: paste rules or "none"]`

**Public-access block:** `[TODO: all-four-flags-true / partial / missing]`

**Sample key shape:** `[TODO: paste the head-20 output — anonymize if any keys contain identifiers]`

**Date verified:** `[TODO: YYYY-MM-DD]`

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
