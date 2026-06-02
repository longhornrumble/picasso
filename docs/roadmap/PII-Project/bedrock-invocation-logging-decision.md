# Bedrock Model-Invocation Logging — Account-Level State Decision

**Phase 0.5 deliverable.** Closes [D2 Finding 13](./pii-inventory.md) by recording the account-level state of `aws_bedrock_model_invocation_logging_configuration` — the AWS setting that determines whether Bedrock prompts + responses are persisted in MyRecruiter-owned CloudWatch and/or S3 destinations beyond what's enumerated in D2 §B / §D.

> **Why this matters for DSAR fulfillment:** if logging is enabled with PII destinations, the DSAR Lambda's delete walk MUST include those destinations. If logging is disabled, the response to a DSAR can honestly state "no Bedrock-side prompt persistence" — closing a known-unknown that would otherwise require disclosure.

## Verification commands

Run **both** commands. Bedrock invocation logging is account+region-scoped, so check the inference region (us-east-1) in both accounts.

### Staging (acct 525)

```bash
aws sso login --profile myrecruiter-staging
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
aws bedrock get-model-invocation-logging-configuration --region us-east-1 --profile myrecruiter-staging
```

### Production (acct 614)

```bash
aws sso login --profile myrecruiter-prod
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
aws bedrock get-model-invocation-logging-configuration --region us-east-1 --profile myrecruiter-prod
```

## Result

**Staging (525) — us-east-1:**

```
$ AWS_PROFILE=myrecruiter-staging aws bedrock get-model-invocation-logging-configuration --region us-east-1 --output json
(empty response; exit code 0)
```

Interpretation: **logging is OFF.** No `loggingConfig` returned = no CW log group, no S3 destination, no text/embedding/image/video delivery enabled. Bedrock prompts + responses are not persisted in MyR-owned destinations beyond what's enumerated in D2 §B / §D.

**Production (614) — us-east-1:**

```
$ AWS_PROFILE=myrecruiter-prod aws bedrock get-model-invocation-logging-configuration --region us-east-1 --output json
(empty response; exit code 0)
```

Interpretation: **logging is OFF in prod-614** — matches staging baseline. No `loggingConfig` returned. Bedrock prompts + responses are not persisted in MyR-owned destinations beyond what's enumerated in D2 §B / §D. **D5 row F13+F15 closure conditions met for the prompt-persistence half** (F13-a closed; F13-b/F15 content-quality is separate per master plan §M9.G1).

**Date verified (staging):** 2026-05-23
**Date verified (prod):** 2026-05-23 (user-authorized prod read; M3 done-bar #4 closure)
**Re-verified (both accounts):** 2026-06-02 — still **OFF** in 614 + 525, us-east-1 (`get-model-invocation-logging-configuration` → exit 0, empty response, no `loggingConfig`). Health-check re-confirmation per the Re-verify guidance below; assumption holds for the data-retention-strategy (no Bedrock-side prompt persistence surface).

## Interpretation guide

The command returns one of:

1. **`ValidationException: model invocation logging configuration does not exist`** or empty response → logging is **OFF**. No prompt persistence; DSAR response can state "no Bedrock-side persistence."
2. **JSON with `loggingConfig` populated** → logging is **ON**:
   - `cloudWatchConfig.logGroupName` → CW log group holds the prompts/responses; DSAR Lambda must reach it (delete log streams matching the subject's timeframe).
   - `s3Config.bucketName` + `keyPrefix` → S3 bucket holds the prompts/responses; DSAR Lambda must walk the prefix.
   - `embeddingDataDeliveryEnabled` / `imageDataDeliveryEnabled` / `textDataDeliveryEnabled` / `videoDataDeliveryEnabled` → indicates which data types are persisted. `textDataDeliveryEnabled: true` is the most likely PII-impacting case.

## Decision

**If OFF in both accounts (expected default):**
- D5 row F13+F15 stays as recorded — "Tier 3 if enabled, otherwise not a surface."
- DSAR response templates can state honestly: "no Bedrock-side prompt persistence." 
- No DSAR Lambda walk needed for this surface.
- **Recommendation:** keep it OFF unless a specific operational need justifies enabling. If a need arises (debugging hallucinations, billing audit), enable the LEAST scope (CloudWatch only; short retention; explicit redaction at prompt-injection time) and update this decision doc + D2 §E + D5.

**If ON in either account:**
- **D5 row F13+F15 must be re-evaluated** — moved from "Tier 3 if enabled" to "Tier 3 active."
- DSAR Lambda walk **must** include the logged destination (CW log group prefix scan, OR S3 prefix walk).
- Live audit of historical logs may be needed if any DSAR has been fulfilled prior to this discovery — operator runs a back-fill audit of past DSARs.
- **Action:** open a small focused PR amending D2 §E, D4 §E, D5 row F13+F15, and the DSAR Lambda spec.

## Audit trail

This document, once filled, is the authoritative record of the verification. The git commit SHA of the filled-in version is the citable evidence for the F13 close.

Re-verify: at any change to Bedrock configuration; at Apply-2 design gate; at first DSAR fulfillment (sanity-check the assumption); and at any quarterly health-check the operator establishes.
