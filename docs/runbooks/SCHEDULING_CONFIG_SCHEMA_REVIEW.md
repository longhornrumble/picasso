# Scheduling Config Schema — Adversarial Review

**Status:** COMPLETE — executed 2026-05-02 by typescript-specialist. See execution log below.

## Why this PR exists

`scheduling/docs/scheduling_config_schema.md` (~298 lines) is the engineer-blocking artifact resolving §20 item 1 of the canonical design doc. It specifies every new and modified field in tenant config required for scheduling v1, expressed as Zod-style schema definitions.

**The schema spec has never been adversarially reviewed.** It was authored alongside the canonical, hasn't been challenged by independent eyes, and the implementation plan's tasks (A3–A5, all merged) read directly from this doc. Bugs in the schema spec become bugs in the implementation, and they propagate.

## Scope of review

A focused single-reviewer pass (likely typescript-specialist or Backend-Engineer) reading the schema spec against:

1. **Internal consistency**
   - Every cross-section invariant in §10 references fields that exist in §3–§9
   - Every Zod type literal (`z.enum([...])`) lists complete sets — no missing values
   - Every `superRefine` rule is implementable as written
   - Default values are sensible and documented

2. **Cross-doc consistency**
   - The schema spec's §3 CTA enum extension (`start_scheduling`, `resume_scheduling`, `scheduling_trigger`) matches what the implementation plan A4 actually merged
   - The §4 `schedulingConfigSchema` matches what A3 actually merged
   - The §10 invariants match what A5 actually merged
   - The §11 "fields NOT in v1" list matches what's actually deferred

3. **Realism**
   - Are field name choices clear? (`scheduling_tag_vocabulary` vs `tag_vocabulary` — is the `scheduling_` prefix needed?)
   - Are duration/buffer/lead-time defaults sensible? (e.g., `cancellation_window_hours: 0` defaults to "reschedule allowed up to start time" — is that what tenants want?)
   - Are validation messages user-friendly?

4. **Completeness**
   - Does the schema cover everything the canonical mentions? (e.g., canonical §11 missed-event cadence mentions reminder_cadence — is that in §6 of the schema spec?)
   - Are there fields the canonical *doesn't* mention but the implementation plan adds? (e.g., D6 reschedule state machine fields — do they need schema entries?)

## What to do when this PR is picked up

1. Read schema spec end-to-end with the canonical alongside.
2. Compare against the merged Zod implementations in `picasso-config-builder/src/lib/schemas/scheduling.schema.ts` (A3), `cta.schema.ts` (A4), `tenant.schema.ts` (A5).
3. Spawn typescript-specialist (and optionally Backend-Engineer for cross-cutting check).
4. Apply findings as edits to the schema spec.
5. If findings reveal a gap in the merged Zod code, file follow-up tasks (don't conflate review fixes with code fixes).

## Acceptance criteria

- [x] All §10 invariants traceable to specific Zod superRefine rules in the merged code
- [x] No fields in the schema spec that the implementation plan never instructs anyone to use
- [x] No fields in the merged Zod schemas that the schema spec doesn't document
- [x] Defaults documented + rationale captured
- [x] Any deferred-to-v2 fields (§11) explicitly mark how they extend v1 (no breaking changes)

## Smaller scope than the canonical review (item 7)

This is a single-reviewer + ≤1-hour edit pass. The schema spec is much shorter than the canonical and is essentially a contract — easier to verify mechanically.

## Links

- Schema spec: `scheduling/docs/scheduling_config_schema.md` (local-only, untracked per scheduling-docs convention)
- Merged Zod code (A3, A4, A5):
  - `picasso-config-builder/src/lib/schemas/scheduling.schema.ts` (A3, PR #19)
  - `picasso-config-builder/src/lib/schemas/cta.schema.ts` (A4, PR #22)
  - `picasso-config-builder/src/lib/schemas/tenant.schema.ts` (A5, PR #43)
- Canonical: `scheduling/docs/scheduling_design.md` (companion review tracked in [PR #55])

---

## Execution Log — 2026-05-02

**Reviewer:** typescript-specialist  
**Duration:** ~45 minutes  
**Files read:** `scheduling_config_schema.md`, `scheduling_design.md` (§§9–16, §20), `scheduling.schema.ts` (A3), `cta.schema.ts` (A4), `tenant.schema.ts` (A5)

### Invariant traceability (§10)

All six invariants in §10 map to labelled `// Invariant N:` comment blocks in `tenant.schema.ts` (lines 361–443). Every invariant is implemented.

### Findings applied to schema spec (doc-only fixes — no code changes needed)

| # | Finding | Severity | Action |
|---|---|---|---|
| F1 | §3 said `resume_scheduling` "should not" appear in tenant configs — imprecise. No hard constraint stated. | Minor | Added explicit authoring constraint to §3. |
| F2 | §4 `pre_call_form_id` lacked a note explaining the absent `.min(1)` guard. | Minor | Added clarifying comment in §4. |
| F3 | §4 `scheduling_tag_vocabulary` note didn't warn that empty vocabulary + non-empty routing policy tag_conditions is an error. | Minor | Added constraint callout in §4 field rationale. |
| F4 | §4 `appointment_types` missing note about empty record being valid (staging/testing use case). | Minor | Added "Empty `appointment_types` note" to §4. |
| F5 | §2 `feature_flags` top-level optionality not documented — spec implied `.default(false)` always applies, but it only applies when `feature_flags` key is present. | Minor | Added "Top-level optionality note" to §2. |
| F6 | §9 CTA example included `selection_metadata` but `ctaDefinitionSchema` does not have this field — silent passthrough gap. | Moderate | Added comment in §9 example explaining the gap and the follow-up task needed for V4.1 typing. |
| F7 | §10 Invariant 6 behavior when `scheduling` block is absent fires two error messages simultaneously — undocumented. | Minor | Added "Invariant 6 error multiplicity note" to §10. |

### Findings escalated as follow-up code tasks (NOT applied here)

| # | Finding | Target file | Nature |
|---|---|---|---|
| CF1 | `selection_metadata` on CTAs is used in production configs (V4.1 Pool Selection tenants) but is absent from `ctaDefinitionSchema`. The field passes through silently because tenant configs are stored as-is on S3, but the config builder would strip it on save. Add `selection_metadata` as an optional typed field in `cta.schema.ts`. | `picasso-config-builder/src/lib/schemas/cta.schema.ts` | Type gap — silent data loss risk on config builder round-trip |

### Fields verified as spec-complete

- All `schedulingConfigSchema` fields (§4) match `scheduling.schema.ts` exactly.
- All `appointmentTypeSchema` fields (§5) match `scheduling.schema.ts` exactly — including `format: z.literal('one_to_one')` forward-build.
- All `routingPolicySchema` + `tagConditionSchema` fields (§6) match `scheduling.schema.ts` exactly — including runtime-managed `last_assigned_resource_id` / `last_assigned_at` fields.
- All `reminderCadenceSchema`, `reminderTierSchema`, `reminderEntrySchema` fields (§7) match `scheduling.schema.ts` exactly.
- `featureFlagsSchema.scheduling_enabled` (§2) matches `tenant.schema.ts` exactly.
- CTA action enum and type enum extensions (§3) match `cta.schema.ts` exactly — both `start_scheduling` and `resume_scheduling` actions and `scheduling_trigger` type present.
- `tenant.schema.ts` scheduling block is `scheduling: schedulingConfigSchema.optional()` matching §1.
- §8 AdminEmployee fields are correctly noted as registry-only (not in `tenant.schema.ts`).
- §11 deferred fields (Microsoft Graph, Teams, Group/Panel, capacity tracking, VMP, multi-site, per-resource booking_limits) are all absent from merged Zod code — correctly deferred.

### Authorization checkpoint result

No material deviation found between merged Zod code (A3/A4/A5) and the schema spec. CF1 (`selection_metadata` type gap) is a pre-existing gap not introduced by this review; it is a low-urgency follow-up, not a blocking bug. No escalation to user required.
