# Scheduling Config Schema — Adversarial Review

**Status:** DRAFT — placeholder for a future scheduling-project session, ideally before sub-phase B starts.

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

- [ ] All §10 invariants traceable to specific Zod superRefine rules in the merged code
- [ ] No fields in the schema spec that the implementation plan never instructs anyone to use
- [ ] No fields in the merged Zod schemas that the schema spec doesn't document
- [ ] Defaults documented + rationale captured
- [ ] Any deferred-to-v2 fields (§11) explicitly mark how they extend v1 (no breaking changes)

## Smaller scope than the canonical review (item 7)

This is a single-reviewer + ≤1-hour edit pass. The schema spec is much shorter than the canonical and is essentially a contract — easier to verify mechanically.

## Links

- Schema spec: `scheduling/docs/scheduling_config_schema.md` (local-only, untracked per scheduling-docs convention)
- Merged Zod code (A3, A4, A5):
  - `picasso-config-builder/src/lib/schemas/scheduling.schema.ts` (A3, PR #19)
  - `picasso-config-builder/src/lib/schemas/cta.schema.ts` (A4, PR #22)
  - `picasso-config-builder/src/lib/schemas/tenant.schema.ts` (A5, PR #43)
- Canonical: `scheduling/docs/scheduling_design.md` (companion review tracked in [PR #55])
