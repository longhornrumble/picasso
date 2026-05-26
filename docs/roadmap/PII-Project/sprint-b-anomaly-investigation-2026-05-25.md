# Sprint B Placeholder-Body Anomaly Investigation (M9.G5 Step 1.5 — F-DSAR21 sub-step)

**Date**: 2026-05-25
**Scope**: investigate the M9.G4 Sprint B smoke-test anomaly where the staging DSAR Lambda returned a placeholder-shaped response body despite a CodeSha256 matching expectations.
**Method**: invoke deployed Lambda with synthetic dry-run payload + download deployed zip + compare to source.
**Result**: deployed Lambda is **definitively a 7-line placeholder stub**. Real Lambda source has 1600+ lines. Every prior closure narrative that referenced "Lambda CodeSha256 X" tracked the placeholder, NOT the real code. The staging DSAR Lambda has **never been deployed** with the actual DSAR walker logic.

## Empirical evidence

### Step 1 — Lambda configuration
```
aws lambda get-function-configuration --function-name picasso-pii-dsar-staging --profile myrecruiter-staging
```
- `CodeSha256`: `2tQsnrZ9vA0V7DJQH+1RBPgAF0XDbKY/d31OXChgvtg=` (matches the value cited in M1.G6 / Sprint E1 / Sprint F1 / M9.G4 closure narratives)
- `Handler`: `lambda_function.lambda_handler`
- `Runtime`: `python3.11`
- `Environment.Variables`: **`null`** — no env vars set (none required by the placeholder; would be required by the real code)
- `LastModified`: `2026-05-24T18:02:30Z`

### Step 2 — Invocation reproduces the anomaly
```bash
aws lambda invoke --function-name picasso-pii-dsar-staging --profile myrecruiter-staging \
  --payload fileb:///tmp/dsar-anomaly-payload.json --cli-binary-format raw-in-base64-out \
  /tmp/dsar-anomaly-response.json
```
Response body (verbatim):
```json
{"statusCode": 200, "headers": {"Content-Type": "text/plain"}, "body": "placeholder — real code deploys via `aws lambda update-function-code` from Lambdas/lambda/picasso_pii_dsar_staging/ (CLAUDE.md SOP)"}
```

### Step 3 — Deployed zip download confirms 7-line stub
```bash
aws lambda get-function --function-name picasso-pii-dsar-staging --profile myrecruiter-staging --query 'Code.Location' --output text | xargs curl -s -o /tmp/dsar-deployed.zip
unzip -l /tmp/dsar-deployed.zip
```
- Zip size: **373 bytes**
- Single file: `lambda_function.py` (305 bytes, **7 lines**)
- Content: returns the placeholder body shown in Step 2; no DSAR logic; no imports beyond Python stdlib; no env-var reads.

### Step 4 — Source has 1600+ lines (not deployed)
`/Users/chrismiller/Desktop/lambda-sprint-f1/picasso_pii_dsar_staging/lambda_function.py` (Sprint F1 HEAD): **1600+ lines** with full DSAR walker logic (form_submissions, notification-sends, notification-events, recent-messages, session-summaries walkers; audit-row writing; dry-run / commit modes; subject resolution; tenant-bound filtering; etc.).

Source has been advanced across **12 commits** touching `picasso_pii_dsar_staging/lambda_function.py` between PR#132 (initial scaffold) and PR#153 (Sprint F1). **None of those commits' code is in the deployed Lambda artifact.**

## Implication

This is structurally larger than the audit-of-audit row 11 description ("staging variant of F-DSAR21 prod-IaC-drift gap"). It is **not a drift between two deployed artifacts** — it is a **source-vs-deploy disconnect across an entire Lambda's lifetime**.

Affected closure narratives (those that referenced "Lambda deployed" or "Lambda CodeSha256 X" for the DSAR Lambda):

| Closure | Narrative claim | Empirical reality |
|---|---|---|
| **M1.G6 / lambda#141** ("M1 phase-completion-audit fixes — 16 rows closed; Lambda redeployed CodeSha256 `HNo+XSi67mi9wYmRoDzRojXrx9GNUCtBbHFl3PRYJrg=`") | Code change shipped + deployed | Code merged to lambda repo main. Deployed artifact = placeholder; CodeSha256 cited may have been from earlier placeholder version (CodeSha256 has changed at least twice in the history per LastModified jitter). |
| **Sprint E1 / lambda#150** ("close audit blockers B1 + B2") | Same | Source merged; never deployed. |
| **Sprint E2 / lambda#152** ("test hygiene + EMF metric") | Same | Source merged; never deployed. |
| **Sprint F1 / lambda#153** ("audit-of-audit lambda security") | Same | Source merged; never deployed. |
| **Sprint F2 / lambda#154** ("Sprint F2 lambda tests") | Same | Source merged; never deployed. |
| **M9.G4 Sprint B (`tools/dsar-invoke.sh` smoke test)** | "Live smoke-tested against staging Lambda — all 3 safeties verified end-to-end" | TRUE for the wrapper's own safeties (account guard / dry-run default / prod confirm). The Lambda invocation itself returned the placeholder body — the wrapper's contract held; the Lambda's contract did not. |
| **M9.G4 Sprint G4 (operator-attested rehearsal 2026-05-25T00:33:01Z)** | "all 4 prod surfaces Count=0" | TRUE — the rehearsal used direct `aws dynamodb scan` against prod, NOT Lambda invocation. So the rehearsal evidence is intact for prod operator IAM verification but does NOT prove the Lambda works. |

What the source-level work DID accomplish (genuinely):
- Source code is ready-to-deploy.
- Unit tests pass against source (108+/108+ per various closure narratives).
- Integration tests with real DDB pass for source code paths invoked directly (`pytest` against `lambda_function.py` imports, not via Lambda invoke).
- The wrapper `tools/dsar-invoke.sh` is wire-tested for its own safety contract (account guard, TTY guard, allowlist, etc.) against the placeholder response. Its safeties are independent of Lambda body shape.

What was NOT proven (despite implicit claims):
- The deployed Lambda artifact runs the source code.
- An end-to-end DSAR via Lambda invocation works against staging DDB.
- The IAM scope assumed by the source (`dynamodb:Scan` / `Query` / `DeleteItem` / `PutItem` on 5 tables) is what the Lambda's execution role actually has at runtime.

## Why this is not a compliance ship-stopper today

1. **Today's DSAR fulfillment is operator-manual.** The playbook §3.1 directs operators to run `aws dynamodb scan` directly via their SSO credentials. The Lambda is **not load-bearing for any current DSAR**.
2. **The Lambda is "staging-only" per master plan v0.3 deferred surfaces.** It was scaffolded as forward-looking infrastructure for the day a prod-twin DSAR Lambda ships (gated on M2 / M6 / Atlanta LOI). No live consumer DSAR has ever flowed through it.
3. **The wrapper `tools/dsar-invoke.sh` is independently useful.** Its safeties (account guard, dry-run default, TTY guard, allowlist, audit log) are not gated on Lambda content. The wrapper would correctly enforce all safeties against any Lambda body shape.
4. **The prod operator IAM rehearsal (M9.G4 Sprint G4) is intact.** Direct `aws dynamodb scan` works for all 5 prod surfaces — that's the real consumer-facing capability today.

## Why this MATTERS

- **Audit truthfulness debt.** Multiple closure narratives across M1.G6 / Sprint E1 / Sprint E2 / Sprint F1 / Sprint F2 implicitly claim "Lambda deployed" when the artifact in AWS is a stub. A reader of the master plan would reasonably conclude the Lambda is running their fixes. Reconciliation needed.
- **First-prod-DSAR-ever trigger fires false confidence.** When the first real DSAR arrives, the playbook directs operator-manual. If a future operator (under SLA pressure) reaches for the wrapper expecting Lambda-mediated execution, they will get the placeholder response. The wrapper does NOT need to be re-wrapped — but the playbook should explicitly note "Lambda is not deployed; do not rely on Lambda invocation for any DSAR fulfillment; always use direct `aws dynamodb` CLI per §3-§6."
- **Sprint G3 audit-of-audit row 22 (Python+Node writer-pair) was based on the assumption that the Lambda is deployed.** The writer-pair enumeration in `writer-pair-enumeration-2026-05-25.md` is still valid — it audited which Lambdas write to which PII tables across deployed Lambdas. The DSAR Lambda is a *reader*, not a writer for the 5 PII surfaces (it deletes/exports; doesn't write new rows). So the writer-pair enumeration's conclusions are unaffected.

## Disposition (recommended; this sub-item's decision)

**Closing this sub-item with three artifacts**:
1. **This decision doc** (empirical evidence on file).
2. **New D5 row F-DSAR29** (added in same PR) — "DSAR Lambda artifact-vs-source disconnect" with OPEN status, options enumerated below, owner = Chris, calendar backstop 2026-08-22.
3. **Master plan v0.26 row** (added in same PR) — closes Sprint B anomaly sub-item with empirical evidence; raises F-DSAR29 as the follow-up.

**F-DSAR29 options** (user disposition required; sub-item itself doesn't make this call):

- **(A) Deploy the real Lambda source now** — zip up `Lambdas/lambda/picasso_pii_dsar_staging/` and `aws lambda update-function-code`. Requires Environment.Variables to be populated (AUDIT_TABLE, FORM_SUBMISSIONS_TABLE, NOTIFICATION_SENDS_TABLE, etc.) — verify staging IAM scope first. Most truthful path; closes the audit truthfulness debt. Effort: ~1-2h (set env vars + deploy + smoke test via wrapper).
- **(B) Document placeholder as intentional pending prod-twin gate** — re-frame the closure narratives at M1/F1/G3 to say "source code shipped + tested via direct module import; deployed Lambda is placeholder by design pending M2 prod-twin gate." Most honest path; least operational change. Effort: ~30min (master plan revision-history clarification entries on each affected closure).
- **(C) Both (A) deploy + (B) re-frame** — close the truthfulness debt AND deploy.
- **(D) Defer-with-trigger** — leave the placeholder in place; add a playbook note that the Lambda is not deployed and the wrapper returns placeholder responses; defer (A) until first-prod-DSAR-ever trigger or Atlanta LOI. Aligns with the "wrapper is forward-looking; Lambda is forward-looking" framing already in the M9.G4 narrative.

## Methodology lesson (recorded)

Verifying "CodeSha256 X" against expected SHA does NOT prove the deployed code runs. It only proves the artifact's hash matches a hash that was recorded somewhere. Future closure narratives that cite Lambda deploys MUST include either:
- An empirical invocation result with the expected response shape (not just `StatusCode: 200`), OR
- Download of the deployed zip + diff against expected source, OR
- An explicit note like "source-only ship; deployed artifact unchanged from previous (placeholder/etc.)".

This is structurally similar to the v0.24 / `prod-ct-cw-logs-export-2026-05-25.md` lesson about "enumerate ALL resources of the class before declaring missing" — both are forms of premature claims based on partial evidence.

## What this closes

- **M9.G5 Step 1.5 sub-item (Sprint B placeholder-body anomaly investigation)**: ✅ closed via this document.
- **F-DSAR21 scope-expansion item (a) Sprint B placeholder-body anomaly**: ✅ closed (investigation complete; cause definitively established; remediation routed to new F-DSAR29 for user disposition).
- **M9.G5 Step 1.5 sweep complete**: all 4 of 4 sub-items now closed (Step 1 drift audit + writer-pair + prod-CT + audit-table-CT + Sprint B anomaly).

## What this opens

- **New F-DSAR29** — DSAR Lambda artifact-vs-source disconnect; user disposition required for option (A) / (B) / (C) / (D).

## Cross-references

- M9.G4 Sprint B smoke-test (master plan v0.20) — where the anomaly was first flagged
- M9.G4 audit-of-audit row 11 (master plan v0.21) — where the routing to F-DSAR21 was retroactively ratified
- `tools/dsar-invoke.sh` — wrapper's safeties are intact regardless of Lambda body
- `writer-pair-enumeration-2026-05-25.md` — unaffected (DSAR Lambda is reader, not writer for the 5 PII surfaces)
- `prod-iac-drift-audit-2026-05-25.md` — same methodology family (verify-don't-assume)
