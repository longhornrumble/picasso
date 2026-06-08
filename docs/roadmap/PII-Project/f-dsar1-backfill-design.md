# F-DSAR1 — Pre-Phase-1 form-submission backfill (design-only closure)

**Status:** Design-only decision doc closing **M9 done-bar #2**. Authored 2026-06-07.
**D5 row:** F-DSAR1 (OPEN M/M today; H/H by impact). **Owner:** Chris Miller.
**Closes:** M9 done-bar #2 ("F-DSAR1 backfill design-only closure = decision doc naming Apply-2 backfill spec + promotion-to-build triggers").

> **Advisory, not legal advice.** Records the design + disposition for an Art-17-erasure-reachability gap. Not counsel.

## §1 — The gap
Form-submission rows written **before** the `pii_subject_id` writer landed (lambda #130, merged 2026-05-18) carry no
`pii_subject_id`. The DSAR walker `_walk_form_submissions` matches on `pii_subject_id`, so a subject's *pre-Phase-1*
rows are not reached by the automatic walk — a deletion can appear successful while a pre-Phase-1 row class survives,
in tension with Art-17 erasure. **Scope: form-submissions ONLY.** notification-sends/-events match on
`recipient == normalized_email` (not `pii_subject_id`) → unaffected (their writer-normalization analogue is F-DSAR3).

## §2 — The durable design (backfill spec)
One-shot, operator-run, account-guarded, dry-run-by-default backfill that stamps `pii_subject_id` onto every
historical row, mirroring the live writer's get-or-create logic so the index and rows stay consistent:
- **Email source per row** (writer-universal): BSH rows carry `contact.email`; both writers store `form_data` →
  `extract_email` fallback (pre-F-DSAR18 MFS rows have no `contact` map → `extract_email` is the *primary* path).
- **get-or-create + UNINDEXED rules** = verbatim port of the deployed writer (`pii_subject.py` / `pii_subject.js`);
  `normalize_email`/`extract_email` copied verbatim + parity-tested against the writer's vectors.
- **Stamp key**: prod `picasso_form_submissions` is single-key (`submission_id`); staging is composite.
- **No PII in logs**: only `submission_id`s, counts, and a salted-free `sha256(tenant_id|normalized_email)` prefix —
  never a raw email. Capture stdout to a committed execution log (prod CloudTrail does not record DDB data events).

## §3 — Disposition: **DESIGN DOCUMENTED + EFFECTIVELY EXECUTED** (not a standing deferral)
Unlike F-DSAR3/F-DSAR4 (still deferred), F-DSAR1's durable fix **has been built and run**:
- **Tool shipped**: `tools/ga3_subject_index_backfill.py` (parity-tested port of the writers).
- **Executed in prod (§P5.2, 2026-06-05)**: 47 rows stamped / 22 subjects indexed / post-condition scan pass / 0
  unresolved (record: picasso#413; [[project_pii_prod_cutover_executed_2026-06-05]]).
- **Forward-coverage now live (§P5.1, 2026-06-07)**: the `pii_subject_id` writer is deployed + live-proven on **both**
  prod chat handlers (MFS + BSH) — new form submissions auto-index, so the pre-Phase-1 *class* no longer grows
  ([[project_pii_p51_prod_deploy_complete_2026-06-07]]).

→ F-DSAR1 is **substantively closed**: historical rows backfilled, new rows auto-indexed. What remains is a thin
residual + a re-run trigger, below.

## §4 — Residual + named re-run triggers (F-DSAR2 revisit-trigger style)
- **Residual**: any historical row the §P5.2 backfill could not resolve to an email (no `contact`, no extractable
  `form_data` email) stays UNINDEXED. The DSAR Lambda's standing `manual_followup` (copy-pasteable `scan` snippet on
  every invocation + on subject-not-found) is the operator fallback for these.
- **Re-run the backfill when**: (a) a DSAR for a subject whose rows predate the §P5.2 run returns empty by index;
  (b) any out-of-band bulk import writes historical-shape rows without `pii_subject_id`; (c) a new prod account/table
  is cut over (re-run as part of that cutover, as §P5.2 was).
- **Severity**: M/M at current DSAR frequency; **H/H by impact** if a pre-backfill subject DSAR arrives and the
  manual fallback is skipped.

## §5 — References
D5 row F-DSAR1 · M1.G4 (backfill trigger) · `tools/ga3_subject_index_backfill.py` ·
[[project_pii_prod_cutover_executed_2026-06-05]] (§P5.2 execution) ·
[[project_pii_p51_prod_deploy_complete_2026-06-07]] (§P5.1 forward coverage) · DSAR Operator Playbook (manual fallback).
