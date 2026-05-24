# M4.G2 — Historical Prod `picasso_form_submissions` TTL Backfill

**Status:** Sprint 2 of 4 — decision doc + dry-run output for user-approval gate.
**Date:** 2026-05-24.
**Owner:** Chris Miller.
**Scope:** One-shot backfill of `ttl` attribute on historical prod rows in
`picasso_form_submissions` (acct 614, hand-managed).
**Closes:** D5 row **F-DSAR19**.

## §1 — Why

Prod table `picasso_form_submissions` had TTL config **DISABLED** until
2026-05-23T18:01Z (the M4 prod-promotion session enabled it). TTL enable is
**forward-only** — historical rows written before that moment have no `ttl`
attribute, so they persist indefinitely even with the table-level TTL now on.

D5 row F-DSAR19 captures the resulting consumer-rights gap: the corrected
widget claim now live ("personal information you submit is deleted after [N]
days") contradicts the actual retention behavior for pre-2026-05-23 rows.

Backstop: **2026-06-22** (per phase-completion-audit 2026-05-23 tech-lead 🔴).

## §2 — Audit (Sprint 1, 2026-05-24T04:35Z — read-only)

```bash
AWS_PROFILE=myrecruiter-prod aws dynamodb scan \
  --table-name picasso_form_submissions \
  --projection-expression "submission_id, submitted_at, #t, #s, #ttl" \
  --expression-attribute-names '{"#t":"timestamp","#s":"status","#ttl":"ttl"}' \
  --output json
```

Results:

| Metric | Value |
|---|---|
| Total rows | **47** |
| Rows with `ttl` attribute | **1** (today's BSH-written row post-2026-05-23T18:01Z) |
| Rows missing `ttl` (backfill candidates) | **46** |
| Oldest row | `2026-01-03T17:50:01.733Z` (~5 months) |
| Newest row | `2026-05-05T21:07:42.870Z` (~2.5 weeks) |
| Rows in `>365d` bucket | **0** |
| Rows in `180-365d` bucket | **0** |
| Rows in `<180d` bucket | **47** |

## §3 — Spec collapse (simplified from master plan default)

Master plan M4.G2 anticipated three age-tiered backfill rules:

> `>365d → now+30d eviction; 180-365d → now+90d; <180d → now+(365-age)d`

**For this dataset, every backfill candidate is `<180d` old**, so the tiered
rule collapses to a single formula:

> `ttl = epoch_seconds(submitted_at + 365 days)`

This is **identical** to what the active BSH writer (lambda PR #145) does for
every new row. The backfill therefore brings historical rows into the same
365-day retention envelope as new rows — no asymmetry, no early-eviction
class to explain to users.

Rationale for the 365-day reference (per `Bedrock_Streaming_Handler_Staging/form_handler.js:574-575`):

> *"365 days matches Python writer + archive-bucket lifecycle + CCPA §1798.105 12-month common reference; counsel-pending refinement may shorten/extend post-M8 Q1 response."*

## §4 — Idempotency mechanism

Every UpdateItem uses:

```
ConditionExpression: attribute_not_exists(#ttl)
ExpressionAttributeNames: {"#ttl": "ttl"}
```

So if the script is re-run, rows that already have `ttl` (from today's BSH
write, or from a previous backfill pass) are NOT mutated. A `ConditionalCheckFailedException`
on any row is treated as **success** (already done), not an error.

## §5 — Dry-run output (Sprint 2 — Python computation, no AWS writes)

Per-row computation of the proposed `ttl` value, sorted oldest → newest. **All 47
rows shown** (46 backfill candidates + 1 SKIP).

```
submission_id                                            submitted_at                  has_ttl    new_ttl_epoch    evicts_at
-----------------------------------------------------------------------------------------------------------------------------
volunteer_dare2dream_1767462601731                       2026-01-03T17:50:01.733Z      no         1798998601       2027-01-03T17:50:01Z
volunteer_dare2dream_1767768787397                       2026-01-07T06:53:07.400Z      no         1799304787       2027-01-07T06:53:07Z
volunteer_dare2dream_1768199410755                       2026-01-12T06:30:10.757Z      no         1799735410       2027-01-12T06:30:10Z
volunteer_dare2dream_1768796820091                       2026-01-19T04:27:00.092Z      no         1800332820       2027-01-19T04:27:00Z
volunteer_dare2dream_1768863552312                       2026-01-19T22:59:12.314Z      no         1800399552       2027-01-19T22:59:12Z
volunteer_dare2dream_1769039358701                       2026-01-21T23:49:18.703Z      no         1800575358       2027-01-21T23:49:18Z
donate_items_1769203473438                               2026-01-23T21:24:33.439Z      no         1800739473       2027-01-23T21:24:33Z
donate_items_1769212987954                               2026-01-24T00:03:07.955Z      no         1800748987       2027-01-24T00:03:07Z
love_box_referral_1769793722165                          2026-01-30T17:22:02.167Z      no         1801329722       2027-01-30T17:22:02Z
volunteer_dare2dream_1770159165564                       2026-02-03T22:52:45.565Z      no         1801695165       2027-02-03T22:52:45Z
love_box_referral_1770666370816                          2026-02-09T19:46:10.818Z      no         1802202370       2027-02-09T19:46:10Z
love_box_referral_1770747854274                          2026-02-10T18:24:14.275Z      no         1802283854       2027-02-10T18:24:14Z
volunteer_dare2dream_1770793694379                       2026-02-11T07:08:14.380Z      no         1802329694       2027-02-11T07:08:14Z
volunteer_dare2dream_1770934660797                       2026-02-12T22:17:40.798Z      no         1802470660       2027-02-12T22:17:40Z
volunteer_dare2dream_1771260354831                       2026-02-16T16:45:54.833Z      no         1802796354       2027-02-16T16:45:54Z
love_box_referral_1771264683986                          2026-02-16T17:58:03.987Z      no         1802800683       2027-02-16T17:58:03Z
volunteer_dare2dream_1771474175286                       2026-02-19T04:09:35.288Z      no         1803010175       2027-02-19T04:09:35Z
apply_mentor_form_1774283242108                          2026-03-23T16:27:22.109Z      no         1805819242       2027-03-23T16:27:22Z
apply_mentor_form_1774283579079                          2026-03-23T16:32:59.080Z      no         1805819579       2027-03-23T16:32:59Z
apply_mentor_form_1774283918142                          2026-03-23T16:38:38.143Z      no         1805819918       2027-03-23T16:38:38Z
apply_mentor_form_1774284164305                          2026-03-23T16:42:44.305Z      no         1805820164       2027-03-23T16:42:44Z
apply_mentor_form_1774284367527                          2026-03-23T16:46:07.528Z      no         1805820367       2027-03-23T16:46:07Z
applications_lovebox_1775835387050                       2026-04-10T15:36:27.052Z      no         1807371387       2027-04-10T15:36:27Z
applications_lovebox_1775835487511                       2026-04-10T15:38:07.511Z      no         1807371487       2027-04-10T15:38:07Z
applications_lovebox_1775836276793                       2026-04-10T15:51:16.794Z      no         1807372276       2027-04-10T15:51:16Z
applications_lovebox_1775836461360                       2026-04-10T15:54:21.361Z      no         1807372461       2027-04-10T15:54:21Z
applications_lovebox_1775836549256                       2026-04-10T15:55:49.256Z      no         1807372549       2027-04-10T15:55:49Z
applications_lovebox_1775840029731                       2026-04-10T16:53:49.733Z      no         1807376029       2027-04-10T16:53:49Z
applications_lovebox_1775842508885                       2026-04-10T17:35:08.886Z      no         1807378508       2027-04-10T17:35:08Z
applications_lovebox_1775842906480                       2026-04-10T17:41:46.482Z      no         1807378906       2027-04-10T17:41:46Z
applications_lovebox_1775843317577                       2026-04-10T17:48:37.578Z      no         1807379317       2027-04-10T17:48:37Z
applications_lovebox_1775844816999                       2026-04-10T18:13:37.001Z      no         1807380817       2027-04-10T18:13:37Z
applications_lovebox_1775848809629                       2026-04-10T19:20:09.631Z      no         1807384809       2027-04-10T19:20:09Z
applications_lovebox_1775849359994                       2026-04-10T19:29:19.995Z      no         1807385359       2027-04-10T19:29:19Z
applications_lovebox_1776022324137                       2026-04-12T19:32:04.139Z      no         1807558324       2027-04-12T19:32:04Z
volunteer_dare2dream_1776085160756                       2026-04-13T12:59:20.758Z      no         1807621160       2027-04-13T12:59:20Z
volunteer_dare2dream_1776194362503                       2026-04-14T19:19:22.505Z      YES        —                — (SKIP)
applications_lovebox_1776195768689                       2026-04-14T19:42:48.691Z      no         1807731768       2027-04-14T19:42:48Z
applications_lovebox_1776195892260                       2026-04-14T19:44:52.261Z      no         1807731892       2027-04-14T19:44:52Z
applications_lovebox_1776196354768                       2026-04-14T19:52:34.770Z      no         1807732354       2027-04-14T19:52:34Z
volunteer_dare2dream_1776229040896                       2026-04-15T04:57:20.898Z      no         1807765040       2027-04-15T04:57:20Z
applications_lovebox_1776275615954                       2026-04-15T17:53:35.956Z      no         1807811615       2027-04-15T17:53:35Z
volunteer_lovebox_1776279935375                          2026-04-15T19:05:35.377Z      no         1807815935       2027-04-15T19:05:35Z
love_box_referral_1776379224277                          2026-04-16T22:40:24.279Z      no         1807915224       2027-04-16T22:40:24Z
volunteer_dare2dream_1777254581166                       2026-04-27T01:49:41.168Z      no         1808790581       2027-04-27T01:49:41Z
form_contact_1777663449291                               2026-05-01T19:24:09.292Z      no         1809199449       2027-05-01T19:24:09Z
love_box_referral_1778015262868                          2026-05-05T21:07:42.870Z      no         1809551262       2027-05-05T21:07:42Z
```

**Summary:** 46 rows would be updated; 1 row skipped (already has `ttl`).

### §5.1 — The skipped row anomaly

`volunteer_dare2dream_1776194362503` (`submitted_at: 2026-04-14T19:19:22Z`) already
has a `ttl` attribute set, on a table whose TTL config was DISABLED until 2026-05-23T18:01Z.
This is a factual anomaly on a hand-managed prod table.

**Pre-execution gate:** before Sprint 3 execution, run `GetItem` on this single row
to read its actual `ttl` value:

```bash
AWS_PROFILE=myrecruiter-prod aws dynamodb get-item \
  --table-name picasso_form_submissions \
  --key '{"submission_id":{"S":"volunteer_dare2dream_1776194362503"}}' \
  --projection-expression "submission_id, submitted_at, #s, #ttl" \
  --expression-attribute-names '{"#s":"status","#ttl":"ttl"}'
```

Interpret the `ttl` value:
- **Future epoch** (e.g., > now): someone set a valid eviction timestamp out-of-band; the source should be named (Console history? manual UpdateItem? what flow?). Idempotency safely skips this row; the mystery is informational.
- **Past epoch** (e.g., < now): DynamoDB TTL has already evicted this row (or will, on next sweep). If the GetItem returns "no item," the row already evicted — drop it from the candidate list mentally. Either way the §6 script handles it correctly.
- **NULL / wrong type**: investigate before Sprint 3 — indicates a corrupted row from a buggy write that we'd want to understand before mutating 46 sibling rows.

Result of this GetItem MUST be recorded in the execution log (§6.7) before Sprint 3 runs, even if "as expected." The 30-second cost of explicit investigation is preferable to leaving a hand-managed-table anomaly unexplained.

Idempotency still protects the row's outcome regardless of the GetItem result — `ConditionExpression: attribute_not_exists(ttl)` skips it correctly. The pre-execution gate is for human understanding, not script safety.

### §5.2 — Eviction range

Eviction range across the 46 backfill candidates:
- **First eviction**: 2027-01-03T17:50:01Z (oldest row + 365d)
- **Last eviction**: 2027-05-05T21:07:42Z (newest pre-backfill row + 365d)

All evictions fall in 2027, none earlier — no surprise early-eviction class.

The collapsed formula (`submitted_at + 365d`) is strictly **more conservative** than the
original 3-tier formula for every row in this dataset — every row is `<180d`, so the
original `<180d → now+(365-age)d` rule would have produced TTLs **earlier in 2027** than
`submitted_at + 365d` does (because `now > submitted_at`). Choosing `submitted_at + 365d`
gives consumers more retention runway, not less, and matches the active BSH writer formula
exactly for operational symmetry.

## §6 — Execution plan (Sprint 3, post user approval)

**Single-operator execution only.** Concurrent runs are safe (idempotency guarantees correctness) but unnecessary — see §6.5.

For each of the 46 rows where `attribute_not_exists(ttl)`:

```bash
AWS_PROFILE=myrecruiter-prod aws dynamodb update-item \
  --table-name picasso_form_submissions \
  --key '{"submission_id":{"S":"<sid>"}}' \
  --update-expression "SET #ttl = :ttl" \
  --condition-expression "attribute_not_exists(#ttl)" \
  --expression-attribute-names '{"#ttl":"ttl"}' \
  --expression-attribute-values '{":ttl":{"N":"<epoch_seconds>"}}'
```

Driven by a small Python wrapper that:

1. **Re-scan prod** for the current set of rows missing `ttl`.
   - **Drift handling (decision rule):** if the re-scan count differs from the §2 baseline (46), **proceed against the live re-scan set**, NOT the §2 list. This is the right behavior because (a) new rows landing between Sprint 1 audit and Sprint 3 execution should also be backfilled if they lack `ttl`, and (b) rows that gained `ttl` out-of-band (like the §5 SKIP row) should be excluded. Log the drift delta + the new candidate count for the operator record. Do NOT halt on drift.
2. For each, computes `ttl = int((datetime.fromisoformat(submitted_at) + 365d).timestamp())`.
   - **Defensive parsing:** wrap `datetime.fromisoformat()` in `try/except`. If `submitted_at` is missing or malformed on any row, log the `submission_id` + skip that row (do NOT crash the batch). The dry-run shows all 46 candidates have clean `submitted_at`, but the script handles future-shape drift safely.
3. Runs UpdateItem with the ConditionExpression above.
4. Counts successes vs `ConditionalCheckFailedException` (treated as success — the row already has `ttl`, somehow).
5. Verifies post-condition per §7.

### §6.5 — Idempotency + concurrency semantics

`ConditionExpression: attribute_not_exists(ttl)` makes each individual write idempotent. The full script is **idempotent under sequential re-run** (re-scan filters to remaining candidates; CCFs treated as success). The script is **safe under concurrent run** in the sense of "no row ends up with a wrong `ttl`" — but two terminals racing produces double the CloudTrail noise + double the cost for zero benefit. Run from one terminal at a time.

### §6.6 — Throughput

`picasso_form_submissions` runs on on-demand throughput (verified via `describe-table` 2026-05-24: `BillingMode: PAY_PER_REQUEST`, `WriteCapacityUnits: 0`). 46 sequential UpdateItems complete in ~10 seconds with no throttling risk. If the table is ever converted to provisioned throughput, this section should be revisited.

### §6.7 — Audit trail (explicit; CloudTrail does NOT cover this)

**Important:** prod-614 CloudTrail (`myrecruiter-management-events` trail) is configured with **management-events-only** event selectors — NO data events on DynamoDB. Verified 2026-05-24 via `aws cloudtrail get-event-selectors`. As a result, the 46 `UpdateItem` calls **will NOT appear in CloudTrail logs**.

(This same observability gap is the broader concern captured by D5 row **F-DSAR21** / master plan **M9.G5** prod IaC drift audit — out of scope for this PR but reinforces why the script-local audit trail below is the primary artifact.)

The Python wrapper script MUST therefore emit a structured execution log to stdout, redirected to a file. The log contains:
- Start timestamp + end timestamp (ISO 8601 UTC)
- Re-scan candidate count + drift delta vs §2 baseline (46)
- Per-row outcome: `submission_id`, `new_ttl_epoch`, `evicts_at`, outcome (`updated` | `already_had_ttl` | `parse_error_skipped`)
- Final tallies: `updated_count`, `already_had_ttl_count`, `parse_error_count`, `total_processed`
- Post-condition verification result (§7 scan output)

The log file is committed to the repo as the Sprint 4 artifact: `docs/roadmap/PII-Project/m4g2-prod-ttl-backfill-execution-log-<YYYY-MM-DD>.md`. This file IS the operator-attested audit artifact for regulator defensibility — it is the only durable record that these 46 writes occurred and what they wrote.

## §7 — Post-execution verification

```bash
AWS_PROFILE=myrecruiter-prod aws dynamodb scan \
  --table-name picasso_form_submissions \
  --filter-expression "attribute_not_exists(#ttl)" \
  --expression-attribute-names '{"#ttl":"ttl"}' \
  --select COUNT
```

**Pass condition:** `Count: 0`.

**Failure procedure (Count > 0):**
1. Re-list the residual `submission_id` values:
   ```bash
   AWS_PROFILE=myrecruiter-prod aws dynamodb scan \
     --table-name picasso_form_submissions \
     --filter-expression "attribute_not_exists(#ttl)" \
     --expression-attribute-names '{"#ttl":"ttl"}' \
     --projection-expression "submission_id, submitted_at"
   ```
2. **Re-run the script once.** Idempotency means rows already updated are safe; the second pass should pick up rows that landed between the first scan and the first update batch.
3. If post-condition still returns `Count > 0` after the second run, **HALT — do not declare M4.G2 closed.** Record the residual `submission_id` values in `dsar-log.md` (or the execution log per §6.7) and surface to the operator for manual triage. Possible causes: schema drift (new write path emits a row without `submitted_at` so the script skipped it per §6 step 2), DynamoDB inconsistency window, or a permission issue mid-batch.

## §8 — Risk + rollback

**Risk classification:** L/L.
- Scope: 46 specific rows, identified by submission_id at execution time
- Operation: SET a single attribute (`ttl`) — does not touch any other field
- Idempotent: re-runs are no-ops
- No PII exposure (the operation reads `submitted_at` to compute, writes only `ttl`)

**Rollback:** If the backfill needs to be undone (e.g., counsel determination
shortens the retention reference from 365d), removing `ttl` is a 1-line
UpdateExpression: `REMOVE #ttl`. The backfill is therefore reversible without
data loss. *(The forward-only TTL enable on the table itself is a separate
configuration knob and is not part of this backfill.)*

## §9 — Approval gate + closure framing

This document is the artifact for the Sprint 2 → Sprint 3 transition. User reviews
+ approves the dry-run before Sprint 3 execution. After Sprint 3:

- Master plan v0.15 records closure with execution timestamps + success count
- D5 F-DSAR19 marked CLOSED with post-condition verification artifact
- Sprint 4 closure doc explicitly records: **"spec collapse from 3 tiers to 1 was justified for the 2026-05-24 backfill because all candidates were `<180d` old; if any future backfill scenario produces rows `>180d` old, the original tiered formula in master plan §M4.G2 applies."** This makes the closure doc self-contained for future readers without requiring a trace back through D5.

**Counsel-pending caveat:** The 365-day retention reference is the BSH/Python writer
default + CCPA §1798.105 12-month common reference. If counsel-Q1 (G-I) returns with
a different determination, the closure is **not** automatically invalidated — but the
retention reference should be re-rated then, which would trigger an M4.G2 follow-up
(adjust both the BSH writer formula AND a re-backfill with the new value). M8 work
will surface this if it happens.

## §10 — Lessons in scope

This M4.G2 closure also exercises the **M9.G4 prod-CLI playbook variant** gap
(F-DSAR20) — operator runs prod CLI without a dedicated playbook variant.
Mitigation for this single operation: every `aws ... --table-name
picasso_form_submissions` command in this doc names the prod profile explicitly
(`AWS_PROFILE=myrecruiter-prod`) and the prod-shaped table name (underscores,
no `-staging` suffix). M9.G4 work will generalize this discipline.

## §11 — Adversarial review record (tech-lead-reviewer, 2026-05-24)

Tech-lead-reviewer ran an adversarial review of v1 of this doc (commit `5de62bc`).
Verdict: **conditional approve — 0 hard blockers, 4 strong recommendations + 2 nice-to-haves + 1 anomaly worth pre-execution investigation.**

| # | Finding | Disposition in this doc |
|---|---|---|
| 1 | §6 step 1 lacks decision rule for re-scan-count drift | ADDRESSED — §6 step 1 now explicitly states "proceed against live re-scan set, log drift delta, do not halt" |
| 2 | Idempotency story doesn't explicitly forbid concurrent runs | ADDRESSED — §6 opening states "single-operator execution only" + §6.5 explains concurrency semantics |
| 3 | §7 lacks failure procedure if Count > 0 | ADDRESSED — §7 now has explicit failure procedure (re-run once → if persists, HALT + manual triage) |
| 4 | Defensive parsing for missing `submitted_at` not explicit | ADDRESSED — §6 step 2 adds `try/except` posture |
| 6 | CloudTrail data-event coverage was an implicit assumption | ADDRESSED — **prod CloudTrail does NOT capture DDB data events** (verified via `get-event-selectors`); §6.7 makes the script-local execution log the explicit primary audit artifact, committed to repo as Sprint 4 deliverable |
| 8 | Mystery row anomaly was hand-waved | ADDRESSED — §5.1 adds an explicit pre-execution GetItem gate + interpretation rules + log requirement |
| 9 | Sprint 4 closure claim might be borderline | ADDRESSED — §9 closure framing now records the spec-collapse rationale + counsel-pending caveat |
| 10 | Throughput mode not stated | ADDRESSED — §6.6 records verified `BillingMode: PAY_PER_REQUEST` |

What tech-lead called solid (preserved unchanged):
- Spec collapse justification — math is correct + the collapsed formula is strictly more conservative
- Idempotency mechanism (`attribute_not_exists(ttl)` + CCF-as-success) — correct DDB semantics
- Scope discipline — one attribute, one table, one account, fixed candidate set, no accidental blanking

Reviewer session: `ab9a155b40f157ef1`. Full output preserved in the PR conversation.
