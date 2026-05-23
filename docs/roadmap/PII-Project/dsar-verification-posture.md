# DSAR Verification Posture (interim)

**Status:** **INTERIM.** This document records the verification posture MyRecruiter applies when a privacy request arrives, **pending counsel review of the "reasonable steps" question (Q3 in the counsel input package — gap G-G).** Counsel reviews this standing language when the counsel package is triggered, not on first DSAR receipt.

> This is an operator-facing document. The subject does not see it. The subject sees the verification *request* (per [`templates/dsar-verification-request.md`](./templates/dsar-verification-request.md)).

## Why this exists

CCPA §1798.130 and GDPR Art 12 require "reasonable steps" to verify the requester's identity before fulfilling. The legal standard is not codified — counsel determines it for each platform. Until counsel rules, the operator needs a consistent, documented standard to apply uniformly. Inconsistency across requests is itself a regulatory finding.

## The standing posture (apply uniformly)

### For access / export / correct

**Baseline:** the subject must reply from the email address that appears in `picasso-pii-subject-index-staging` for that submission. If the subject's email-on-file matches the inbound email-of-record, verification = sufficient.

**Mismatch path:** if the email-on-file differs from the inbound, ask the subject for ONE corroborating fact recorded at submission time — form name + approximate submission month. Operator queries the matching submission(s); if any match the corroborating fact + the subject confirms in writing, verification = sufficient.

**Do NOT request:**
- Government ID (disproportionate at Tier 2/3 data classifications).
- Account password (we don't issue passwords to consumer subjects).
- Notarized declarations (process theater at zero volume).

### For delete / anonymize

Same bar as access / export / correct. Deletion is destructive but not high-harm at our data classification per [`data-classification.md`](./data-classification.md) — no SSN, no payment, no health beyond self-disclosed volunteer interest, no minor data without separate carve-out.

### For authorized agent (counsel-for-subject, parent-of-minor, accessibility-assistant)

Higher bar:
- Signed authorization attached to the request.
- Operator verifies the agent exists (state bar lookup for counsel; 60 seconds).
- Operator copies the subject on the response if the subject's email is on file.

### When verification fails

Two consecutive failed verification attempts → respond with `templates/dsar-refusal.md` invoking "unable to verify identity" + record the refusal reason in `dsar-log.md` row.

### When the subject has no record on file

Search by all provided identifiers. If no match anywhere: respond with `templates/dsar-response-no-record.md`. Do **not** require the subject to "prove" they used the platform — absence of record is the answer.

## Jurisdiction handling

The posture above is **not** jurisdiction-specific by design — it applies the strictest reasonable bar to all requests. If counsel determines a less-strict bar is acceptable for a specific jurisdiction, the posture is amended in this file via a tracked PR.

If the subject self-asserts EU residency (GDPR scope) or other regulated regime not currently in MyRecruiter's scope per the D1 charter, **escalate to counsel** before responding. Do not invent a posture for an out-of-scope regime.

## What counsel will be asked to review

When triggered (per the counsel input package PR #153), counsel reviews:
1. Is the "reply-from-on-file + corroborating fact" bar "reasonable steps" under CCPA §1798.130?
2. Is the same bar adequate under GDPR Art 12 if EU subjects are ever in scope?
3. Is the "no government ID" position defensible at our data tier?
4. Should the bar change for delete vs access?
5. Authorized-agent verification — is the state-bar lookup sufficient?

Counsel's response updates this document via a small focused PR. The PR records: what changed, why, counsel-memo date, applicable from-date (forward-only; prior DSARs honored under the prior posture).

## Audit trail

Every DSAR's `dsar-log.md` row notes which posture-version this request was verified under (use the git commit SHA of this file at the time of verification). When this file changes, ongoing DSARs continue under the posture they started with; new DSARs use the new posture.
