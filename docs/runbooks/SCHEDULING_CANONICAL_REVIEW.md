# Scheduling Canonical Design — Adversarial Review Protocol

**Status:** IN PROGRESS  
**Branch:** docs/scheduling-canonical-adversarial-review  
**Target doc:** `scheduling/docs/scheduling_design.md` (1556 lines)  
**Session date:** 2026-05-02  
**Lead reviewer:** Architect agent

---

## Purpose

`scheduling/docs/scheduling_design.md` is the source of truth for the scheduling v1 feature. All sibling planning docs (implementation plan, UI plan, CI strategy, schema spec) received 2-3 adversarial reviewer passes during the 2026-05-02 session with ~50 applied findings. The canonical was lightly amended in that session (§11 missed-event cadence, §2.3+§17 V4→V5 reframing, §8 permissions reference) but never independently adversarially reviewed. This runbook governs the independent review.

Sub-phase B implementers (Calendar_Watch_Listener, Calendar_Watch_Renewer) work directly from the canonical. Unresolved internal contradictions hit them at implementation time, when fixes are expensive. This review surfaces them now.

---

## Three-Reviewer Protocol

| Reviewer | Focus angle | Key sections |
|---|---|---|
| Lead Architect (this agent) | Internal consistency, cross-doc coherence | All sections, cross-reference with sibling docs |
| Tech Lead | Scope/feasibility/coherence, implementation plan alignment | §2, §9, §10, §11, §16, impl plan |
| Security Reviewer | Auth token design, PII boundaries, push notification security | §5.7, §13, §14 |

Each reviewer works independently, then findings are consolidated. Contradictions between reviewer conclusions are resolved by the lead (this agent) with rationale noted.

---

## Finding Tier Definitions

**Critical (Tier 1)** — A contradiction, omission, or ambiguity that will cause implementation to go wrong or break a security/compliance requirement. Must be resolved before sub-phase B starts. Authorization checkpoint: STOP and surface to orchestrator before applying any Critical finding that would materially change v1 scope or contradict an already-merged sibling doc.

**Material (Tier 2)** — An inconsistency between sections, a term used inconsistently, a schema field referenced that doesn't match the schema spec, or a requirement that is underspecified in a way that will force re-work. Should be applied before this PR merges.

**Minor (Tier 3)** — Wording ambiguity, style inconsistency, missing forward-reference, or editorial improvement. Surface to orchestrator; apply only with explicit direction.

---

## Execution Log Template

```
### Finding F-NNN
- Tier: [1 Critical / 2 Material / 3 Minor]
- Section: §X.Y
- Reviewer: [Lead / Tech Lead / Security]
- Description: <what is wrong>
- Evidence: <quote or line reference>
- Proposed fix: <edit to apply>
- Status: [OPEN / APPLIED / WAIVED]
- Waiver rationale (if waived): <text>
```

---

## Exit Criteria

Before this PR is promoted from draft to ready-for-merge, ALL of the following must be true:

- [ ] All Tier 1 (Critical) findings resolved (applied or waived with orchestrator sign-off)
- [ ] All Tier 2 (Material) findings resolved (applied or waived with rationale)
- [ ] Tier 3 (Minor) findings surfaced to orchestrator; disposition documented
- [ ] No internal inconsistencies: every state name, term, schema field used in the canonical is consistent across sections
- [ ] No contradictions vs `scheduling_implementation_plan.md`, `scheduling_ui_plan.md`, `scheduling_ci_strategy.md`, `scheduling_config_schema.md`
- [ ] Change log entry added to canonical (`scheduling_design.md`)
- [ ] `verify-before-commit` invoked before final commit batch
- [ ] Memory entry written: `project_scheduling_canonical_review_complete_2026-05-02.md`

---

## Execution Log

### Run 1 — 2026-05-02

**Phase:** Full adversarial pass (Lead + Tech Lead + Security)

*(Findings recorded below as they are identified)*

---

<!-- FINDINGS START -->

<!-- FINDINGS END -->

---

## Findings Summary

*(Populated at end of review pass)*

| Tier | Count | Applied | Waived | Open |
|---|---|---|---|---|
| Critical (1) | — | — | — | — |
| Material (2) | — | — | — | — |
| Minor (3) | — | — | — | — |

---

## Why This Review Exists

This PR's branch becomes the "canonical is reviewed" green-light milestone for sub-phase B. The tasks Calendar_Watch_Listener and Calendar_Watch_Renewer implement behaviors specified in the canonical. If the canonical has internal contradictions — e.g., reminder cadence in §12 disagrees with state machine in §9.2 — the engineer hits ambiguity at implementation time. A pre-sub-phase-B review surfaces these while it is cheap to fix.

## Links

- Canonical: `/Users/chrismiller/Desktop/Working_Folder/scheduling/docs/scheduling_design.md`
- Implementation plan: `/Users/chrismiller/Desktop/Working_Folder/scheduling/docs/scheduling_implementation_plan.md`
- UI plan: `/Users/chrismiller/Desktop/Working_Folder/scheduling/docs/scheduling_ui_plan.md`
- CI strategy: `/Users/chrismiller/Desktop/Working_Folder/scheduling/docs/scheduling_ci_strategy.md`
- Config schema: `/Users/chrismiller/Desktop/Working_Folder/scheduling/docs/scheduling_config_schema.md`
- PR: https://github.com/longhornrumble/picasso/pull/55
