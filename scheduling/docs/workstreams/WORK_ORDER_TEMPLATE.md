# WS-<id> — <title> [TEMPLATE]

> Copy this for a new workstream. The integrator authors work-orders; agents treat them as read-only briefs.

**Plan task(s):** `<C#>` — [implementation plan](../scheduling_implementation_plan.md) row.
**Repo / branch / base:** `<lambda|picasso>` · `feature/scheduling-ws-<id>` · base `<main|staging>`.
**Quality gate:** `verify-before-commit` (always) · weave-time audit = `<full|light>` per [§5 risk rule](../PARALLEL_WORKSTREAMS.md#5-risk-calibrated-audit-rule-lever-4).

## Goal / done-bar (verifiable)
- <falsifiable success criteria, lifted from the plan row's verify-check>

## You OWN (create/edit ONLY these — disjoint ownership)
- `<path/to/new-module/**>`
- `<path/to/new-test/**>`

## You CONSUME (frozen — never modify; see [FROZEN_CONTRACTS.md](../FROZEN_CONTRACTS.md))
- <contract refs §A/§B>

## You PRODUCE (the contract others depend on — honor it exactly)
- <the signature from FROZEN_CONTRACTS §B, if any>

## OUT OF SCOPE / do NOT
- Do NOT touch any file outside the OWN list, or any shared doc (plan, `main.tf`, `pii-inventory`, kanban, contracts). Propose doc updates as a PR snippet.
- Do NOT redefine a consumed contract — escalate to the integrator.
- <task-specific exclusions>

## References
- Plan §<n>; canonical `scheduling_design.md` §<n>; `CLAUDE.md` (SOP, drift cap, schema discipline, never-share-IAM, credential-mutation gate).

## Report-back (in your PR)
- PR title `feat(scheduling): <id> ...`, base per above.
- Include a **doc-snippet** block: the plan-row status update + (if you touch a PII surface) the pii-inventory line — for the integrator to apply.
- Tell the integrator: branch, PR #, done-bar status, any contract issue.
