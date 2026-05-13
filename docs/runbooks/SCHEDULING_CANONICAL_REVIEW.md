# Scheduling Canonical Design — Adversarial Review Protocol

**Status:** REVIEW COMPLETE — pending PR #55 promotion to ready  
**Branch:** docs/scheduling-canonical-adversarial-review  
**Target doc:** `scheduling/docs/scheduling_design.md` (1556 lines)  
**Session date:** 2026-05-02 (reviewed 2026-05-13)  
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

### Run 1 — 2026-05-13

**Phase:** Full adversarial pass (Lead Architect). Prior two agent dispatches killed mid-flight; no findings were previously applied. This dispatch picks up from zero findings.

**Docs reviewed:**
- `scheduling/docs/scheduling_design.md` (1556 lines, canonical)
- `scheduling/docs/scheduling_implementation_plan.md`
- `scheduling/docs/scheduling_ui_plan.md`
- `scheduling/docs/scheduling_ci_strategy.md`
- `scheduling/docs/scheduling_config_schema.md`

**Prior-agent kill-message finding (actioned):** "fix E9 in the impl plan which says `event_end + 30min` but should say `event_end + 35min` to match the canonical's 35-minute reconciliation threshold." — Confirmed and recorded as F-M01 below.

---

<!-- FINDINGS START -->

### Finding F-M01
- Tier: 2 Material
- Section: `scheduling_implementation_plan.md` Task E9
- Reviewer: Lead (surfaced by prior killed agent; confirmed in this pass)
- Description: Task E9 reconciliation scan says it "finds bookings whose `event_end + 30min` is past but lack `pending_attendance` transition." The canonical says `event_end + 35min` (30-minute attendance-check grace window plus a 5-minute buffer) in both §9.2 and §5.2 item 5.
- Evidence: Impl plan E9 line: `"finds bookings whose event_end + 30min is past"`. Canonical §9.2: `"event_end + 35min is past (i.e., the 30-minute attendance-check window has elapsed plus a 5-minute buffer)"`. Canonical §5.2 item 5: same `"event_end + 35min"` language.
- Proposed fix: In impl plan E9, change `event_end + 30min` → `event_end + 35min` to match the canonical.
- Status: APPLIED 2026-05-13

### Finding F-M02
- Tier: 2 Material
- Section: `scheduling_design.md` §3, §9.4, §13.6, §16, §18 Q#3 (canonical) vs `scheduling_config_schema.md` §5 (config schema)
- Reviewer: Lead Architect
- Description: The canonical consistently uses `AppointmentType.cancellationWindowHours` (camelCase) as the field name, but the config schema spec uses `cancellation_window_hours` (snake_case). These differ across docs and will create confusion at implementation time. One must be the authoritative name.
- Evidence: Canonical §3: `"AppointmentType.cancellationWindowHours"`. Canonical §9.4: `"Operator-tightenable per AppointmentType.cancellationWindowHours"`. Config schema §5 (`appointmentTypeSchema`): `cancellation_window_hours: z.number()...`. All other schema fields in `appointmentTypeSchema` use snake_case (e.g., `duration_minutes`, `buffer_before_minutes`, `location_mode`, `routing_policy_id`).
- Proposed fix: The config schema's snake_case convention is correct and consistent with all other fields in `appointmentTypeSchema`. Update the canonical's four references from `cancellationWindowHours` to `cancellation_window_hours`. Canonical references to fix: §3, §9.4 (twice), §13.6, §18 Q#3.
- Status: APPLIED 2026-05-13 (5 canonical references updated: §3, §9.4 ×2, §13.6, §18 Q#3; Appendix A lines 1062 and 1326 are historical artifact — intentionally left)

---

**Minor findings (stale cross-references in impl plan — not in canonical):**

### Finding F-m01
- Tier: 3 Minor
- Section: `scheduling_implementation_plan.md` Sub-phase C entry preconditions and C8 scope boundary
- Reviewer: Lead Architect
- Description: Impl plan refers to "canonical §3.1" for Zoom Server-to-Server OAuth. §3 of the canonical is "v1 Scope" and has no subsection 3.1. The correct canonical section for Zoom is §6.2 (Conferencing).
- Evidence: C entry preconditions: `"Zoom Server-to-Server OAuth credentials provisioned per-tenant in Secrets Manager (operational item from canonical §3.1)"`. C scope boundary: `"Zoom/Meet provisioning per §3.1"`. C8: `"Zoom Server-to-Server OAuth for Zoom per §3.1"`.
- Proposed fix: Replace `§3.1` → `§6.2` in the three impl plan locations that reference Zoom via §3.1.
- Status: SURFACED TO ORCHESTRATOR 2026-05-13 (stale cross-reference in impl plan; orchestrator to direct application)

### Finding F-m02
- Tier: 3 Minor
- Section: `scheduling_implementation_plan.md` Sub-phase C scope boundary and anti-drift
- Reviewer: Lead Architect
- Description: Impl plan refers to "canonical §4.3" for the concrete AvailabilitySource decision. §4 of the canonical is "Acceptance Criteria" and has no subsection 4.3. The correct canonical section is §5.3 (Concrete-First AvailabilitySource).
- Evidence: C scope boundary: `"AvailabilitySource interface is concrete-first (canonical §4.3)"`. C anti-drift: `"Building a generic AvailabilitySource interface before v2 has a second consumer is drift (canonical §4.3)"`.
- Proposed fix: Replace `§4.3` → `§5.3` in the two impl plan locations.
- Status: SURFACED TO ORCHESTRATOR 2026-05-13

### Finding F-m03
- Tier: 3 Minor
- Section: `scheduling_implementation_plan.md` Sub-phase C scope boundary
- Reviewer: Lead Architect
- Description: Impl plan refers to "canonical §4.4" for double-booking defense. §4 has no subsection 4.4. Correct reference is §5.4 (Layered Double-Booking Defense).
- Evidence: C scope boundary: `"double-booking defense (§4.4)"`.
- Proposed fix: Replace `§4.4` → `§5.4`.
- Status: SURFACED TO ORCHESTRATOR 2026-05-13

### Finding F-m04
- Tier: 3 Minor
- Section: `scheduling_implementation_plan.md` B6, C8 (twice), F8 anti-shortcut, C testing requirements
- Reviewer: Lead Architect
- Description: Impl plan refers to "canonical §4.5" for failure modes. §4 has no subsection 4.5. Correct reference is §5.5 (Failure Modes and Error-Handling).
- Evidence: B6: `"(§4.5 row 4)"`. C8: `"Compensating transactions per §4.5"`. C testing: `"all §4.5 failure modes"`. F8: `"covers all §4.5 failure modes"`.
- Proposed fix: Replace `§4.5` → `§5.5` in all four locations.
- Status: SURFACED TO ORCHESTRATOR 2026-05-13

### Finding F-m05
- Tier: 3 Minor
- Section: `scheduling_implementation_plan.md` Task E11
- Reviewer: Lead Architect
- Description: E11 says "Microsoft 365 deferred per `scheduling_design.md` §11". §11 of the canonical is "Missed-Event Re-Engagement" — entirely wrong section. Microsoft 365 deferral is stated in §2.2 (Non-Goals) and §6.1 (Calendar integration surface).
- Evidence: E11: `"per-staff OAuth flow for Google Calendar (Microsoft 365 deferred per scheduling_design.md §11)"`.
- Proposed fix: Replace the citation. Either `per §2.2 Non-Goals` or `per §6.1`.
- Status: SURFACED TO ORCHESTRATOR 2026-05-13

### Finding F-m06
- Tier: 3 Minor
- Section: `scheduling_ui_plan.md` Surface 4 implementation notes (line 505)
- Reviewer: Lead Architect
- Description: UI plan body text line 505 says "A8c gains a second GSI requirement: `(tenantId#assigned_staff_id, start_at)`". But the UI plan's own changelog (reconciliation pass row below it) says "A8c second GSI removed." The impl plan A8c correctly omits this GSI. The stale body text creates a contradiction within the UI plan itself.
- Evidence: UI plan line 505: `"A8c — gains a second GSI requirement: (tenantId#assigned_staff_id, start_at)"`. UI plan changelog: `"A8c second GSI removed"`. Impl plan A8c: explicitly notes `"Round-robin requires no GSI ... reconciled away 2026-05-02"`.
- Proposed fix: Remove the line 505 bullet from the UI plan that references the `(tenantId#assigned_staff_id, start_at)` GSI.
- Status: SURFACED TO ORCHESTRATOR 2026-05-13

<!-- FINDINGS END -->

---

## Findings Summary

*(Updated 2026-05-13 — Run 1 complete)*

| Tier | Count | Applied | Waived | Surfaced-to-Orchestrator |
|---|---|---|---|---|
| Critical (1) | 0 | 0 | 0 | 0 |
| Material (2) | 2 | 2 | 0 | 0 |
| Minor (3) | 6 | 0 | 0 | 6 |

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
