# Scheduling Tenant Config Schema (v1)

**Status.** Engineer-blocking artifact resolving §20 item 1 of [`scheduling_design.md`](scheduling_design.md). Specifies every new and modified field in tenant config required for scheduling v1.

**Convention.** Mirrors the existing Zod TS schemas in [`picasso-config-builder/src/lib/schemas/`](../../picasso-config-builder/src/lib/schemas/). Notation is Zod-style for fidelity with the implementing repo; this is a spec, not source — engineers translate at implementation time, adding the Zod files alongside the existing `tenant.schema.ts` / `cta.schema.ts` / `form.schema.ts` set.

**Scope.** All v1 scheduling config fields. v2 fields (Microsoft Graph, Teams, Group capacity, panel) are out of scope and explicitly noted where present-day v1 fields will extend.

**Schema version impact.** Adding scheduling to an existing tenant bumps the config version to **v1.5** (current production: v1.4.1 per [`picasso-config-builder/CLAUDE.md`](../../picasso-config-builder/CLAUDE.md)). Existing v1.4.1 configs without scheduling remain valid; the `scheduling` block and `feature_flags.scheduling_enabled` are both optional at the top level.

---

## 1. Top-level additions to `tenantConfigSchema`

```ts
export const tenantConfigSchema = z.object({
  // ... existing fields unchanged ...

  // NEW: optional scheduling configuration block
  scheduling: schedulingConfigSchema.optional(),

  // EXTENDED: feature_flags gains scheduling_enabled
  feature_flags: featureFlagsSchema, // see §2 below
});
```

**Activation rule.** Scheduling is active for a tenant iff:
1. `feature_flags.scheduling_enabled === true`, AND
2. `scheduling` block is present and validates.

If `feature_flags.scheduling_enabled` is true but `scheduling` is missing, the config fails validation with: `"scheduling_enabled requires a scheduling configuration block"`.

---

## 2. `feature_flags` extension

```ts
export const featureFlagsSchema = z.object({
  // ... existing flags unchanged (V4_PIPELINE, V4_ACTION_SELECTOR, etc.) ...

  // NEW
  scheduling_enabled: z.boolean().optional().default(false),
}).passthrough(); // existing convention: feature_flags is open-ended
```

**Top-level optionality note.** In `tenantConfigSchema`, `feature_flags` is itself `optional()`. When `feature_flags` is absent entirely (legacy configs), the `superRefine` check `data.feature_flags?.scheduling_enabled === true` evaluates to `false` — scheduling is not activated. The `.default(false)` on `scheduling_enabled` only applies when `feature_flags` IS present but `scheduling_enabled` is omitted from it. Configs without a `feature_flags` block at all are treated identically to configs with `feature_flags.scheduling_enabled: false`.

---

## 3. `cta_definitions` action enum extension

The existing CTA action enum in [`cta.schema.ts:14`](../../picasso-config-builder/src/lib/schemas/cta.schema.ts#L14) is:

```ts
action: z.enum(['start_form', 'external_link', 'send_query', 'show_info'])
```

Two new values added:

```ts
action: z.enum([
  'start_form',
  'external_link',
  'send_query',
  'show_info',
  'start_scheduling',     // NEW: enters scheduling sub-flow
  'resume_scheduling',    // NEW: resumes a suspended scheduling sub-flow
])
```

**`type` enum extension** (paired with `action`):

```ts
type: z.enum([
  'form_trigger',
  'external_link',
  'bedrock_query',
  'info_request',
  'scheduling_trigger',   // NEW: pairs with start_scheduling / resume_scheduling
])
```

**superRefine validation** (added to existing block in `cta.schema.ts`):

```ts
// start_scheduling and resume_scheduling require:
// - tenant.scheduling_enabled === true
// - tenant.scheduling.appointment_types is non-empty
// (Cross-config validation; enforced in tenant.schema.ts superRefine, not cta.schema.ts.)
```

These CTAs do not require `formId`, `url`, or `query`. They reference scheduling indirectly via the active scheduling config; no per-CTA appointment-type binding (the scheduling sub-flow's own qualifier resolves which `AppointmentType` to use based on routing context).

**`resume_scheduling` authoring constraint.** `resume_scheduling` CTAs MUST NOT appear in operator-authored tenant config files. The `resume_scheduling` action is reserved for the widget's internal dispatch chain — the widget renders the resume affordance from `suspended_scheduling_detected` metadata, not from a config-defined CTA. The enum value exists in the schema to allow action-dispatch validation; its presence in `cta_definitions` will trigger Invariant 6's scheduling-enabled check and is therefore caught at deploy time even without a dedicated guard.

---

## 4. `schedulingConfigSchema` (new top-level block)

```ts
export const schedulingConfigSchema = z.object({
  // Workspace identity
  workspace_domains: z.array(z.string().min(1)).min(1, 'At least one workspace domain required'),

  // Localization
  default_locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Must be BCP-47 language tag (e.g., "en", "en-US", "es")').default('en'),
  available_locales: z.array(z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/)).min(1).default(['en']),

  // Tag vocabulary (drives routing eligibility)
  scheduling_tag_vocabulary: z.array(z.string().min(1).max(50)).default([]),

  // Domain entities (records keyed by id)
  appointment_types: z.record(z.string(), appointmentTypeSchema),
  routing_policies: z.record(z.string(), routingPolicySchema),

  // Optional pre-call form (referenced by start_scheduling CTAs in walk-up case)
  // Note: no .min(1) here — an empty string would pass Zod's .string() but is caught
  // by the FK superRefine in tenant.schema.ts (Invariant 4) as a missing form reference.
  pre_call_form_id: z.string().optional(),

  // Operator-facing fallback
  fallback_scheduler_url: z.string().url().optional(),
});
```

**Field rationale:**
- `workspace_domains`: §16 of canonical — single tenant config field, suffix-checked against AdminEmployee email at "Bookable" toggle time.
- `available_locales`: §15.1 — widget exposes language picker only when `available_locales.length > 1`.
- `scheduling_tag_vocabulary`: the closed set of valid tag values admins can assign to AdminEmployee `scheduling_tags`. Empty default is acceptable for tenants who haven't onboarded scheduling yet but enable the feature flag for testing. **Constraint:** if `scheduling_tag_vocabulary` is `[]` (empty) but any `routing_policy` has a non-empty `tag_conditions` array, Invariant 3 will fire errors for every tag condition referencing a non-existent vocabulary entry. A tenant with routing policies that use tag conditions MUST populate this vocabulary.
- `pre_call_form_id`: §9.1 — references a key in `conversational_forms`. Used for anonymous walk-up entry path. Must validate as an existing form id at config-load time.
- `fallback_scheduler_url`: §9.3 (no-slots-fit fallback tier 2) and original Appendix A §17 — operator-managed external scheduler. Optional; chat-only tenants leave this unset and use the async escape path instead.

**Empty `appointment_types` note.** `appointment_types` is a `z.record(...)` with no `.min(1)` requirement. An empty object `{}` is valid at the schema level — this allows a tenant to enable `scheduling_enabled: true` and establish the scheduling block for testing or staging configuration before populating appointment types. Invariant 6 prevents scheduling CTAs from being used when `appointment_types` is empty, but the scheduling block itself remains valid. This is intentional.

---

## 5. `appointmentTypeSchema`

```ts
export const appointmentTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),                      // e.g., "Volunteer intake call"
  description: z.string().max(500).optional(),           // optional "what to expect" copy
  duration_minutes: z.number().int().positive().max(480),
  buffer_before_minutes: z.number().int().nonnegative().default(0),
  buffer_after_minutes: z.number().int().nonnegative().default(0),
  lead_time_minutes: z.number().int().nonnegative().default(0),     // minimum notice
  max_advance_days: z.number().int().positive().max(365).default(30),
  slot_granularity_minutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).default(30),
  location_mode: z.enum(['virtual_meet', 'virtual_zoom', 'phone', 'in_person']),
  required_fields: z.array(z.enum(['name', 'email', 'phone'])).default(['name', 'email']),
  routing_policy_id: z.string().min(1),                  // FK → routing_policies
  cancellation_window_hours: z.number().int().nonnegative().default(0),

  // Reminder cadence override (optional; falls back to platform defaults from §12.1)
  reminder_cadence_override: reminderCadenceSchema.optional(),

  // v1 single-format only; format scoped for v2 Group preparation per §4.2 #2
  format: z.literal('one_to_one').default('one_to_one'),
});
```

**Notes:**
- `format` is a literal `'one_to_one'` in v1; v2 will widen to `z.enum(['one_to_one', 'group', 'panel'])`. The field is present in v1 to lock in DB uniqueness scoping per §5.2 item 2.
- `location_mode` distinguishes `virtual_meet` vs. `virtual_zoom` so the conferencing provider selection is config-driven (matches §6.2 of canonical).
- `cancellation_window_hours` default of 0 = "reschedule allowed up to start time" (canonical §3 v1 scope).

---

## 6. `routingPolicySchema`

```ts
export const routingPolicySchema = z.object({
  id: z.string().min(1),
  tag_conditions: z.array(tagConditionSchema).default([]),
  tie_breaker: z.enum(['round_robin', 'first_available']).default('round_robin'),

  // Round-robin state (managed by runtime, not by config builder UI)
  // Listed for schema completeness; absent in operator-authored config files.
  last_assigned_resource_id: z.string().optional(),
  last_assigned_at: z.number().int().optional(),  // unix ms
});

export const tagConditionSchema = z.object({
  tag: z.string().min(1),                   // must exist in scheduling_tag_vocabulary
  operator: z.enum(['equals', 'in_any']).default('equals'),
  values: z.array(z.string().min(1)).min(1),
});
```

**superRefine** (in `tenant.schema.ts`):

```ts
// Every appointment_type.routing_policy_id must reference an existing routing_policy
// Every tag_condition.tag must reference scheduling_tag_vocabulary
// (Same dependency-tracking pattern as existing form/CTA/branch validation in tenant.schema.ts:289–335)
```

**v2 deferrals (per canonical §10.5).** `defaultResourcePool`, `fallbackRule`, additional tie-breakers (`load_balance`, `explicit_choice`), cross-policy fairness, multi-site routing — none included in v1 schema.

---

## 7. `reminderCadenceSchema`

```ts
export const reminderCadenceSchema = z.object({
  // When unset, platform defaults from §12.1 apply (lead-time-tiered cadence).
  tiers: z.array(reminderTierSchema).optional(),

  // Per-channel SMS opt-in copy (TCPA-compliant default supplied by platform if unset)
  sms_opt_in_prompt: z.string().max(300).optional(),
});

export const reminderTierSchema = z.object({
  lead_time_min_hours: z.number().nonnegative(),
  lead_time_max_hours: z.number().positive().nullable(),  // null = no upper bound
  reminders: z.array(reminderEntrySchema),
});

export const reminderEntrySchema = z.object({
  offset_minutes_before: z.number().int().positive(),     // e.g., 1440 = 24h
  channel: z.enum(['email', 'sms', 'both']),
  template_id: z.string().min(1).optional(),              // tenant-custom template; default = platform template
});
```

**Default cadence (canonical §12.1, used when `tiers` is unset):**

| Tier | Reminders |
|---|---|
| lead ≥ 24h | confirm now (email + .ics) + 24h email + 1h SMS |
| 4h ≤ lead < 24h | confirm now + 1h SMS |
| 1h ≤ lead < 4h | confirm now + 30min SMS |
| lead < 1h | confirm only |

Quiet-hours interaction (§12.2) applies regardless of overrides.

---

## 8. AdminEmployee record extensions (separate registry, NOT in tenant config)

These fields live on the `AdminEmployee` registry record (already used for notification routing in [`picasso-analytics-dashboard`](../../picasso-analytics-dashboard/)), not in the tenant config JSON. Schema noted here for completeness — the registry is a separate DynamoDB table (`picasso-employee-registry-v2-{env}`).

```ts
// AdminEmployee registry schema additions (NOT in tenant.schema.ts):
{
  scheduling_tags: z.array(z.string()).default([]),         // canonical §7.2
  calendar_email_override: z.string().email().optional(),   // canonical §7.2
}
```

Validation: every value in `scheduling_tags` must exist in the tenant's `scheduling.scheduling_tag_vocabulary`.

---

## 9. CTA examples (start_scheduling + resume_scheduling)

```jsonc
// Walk-up entry — surfaced by V4 Action Selector
"book_volunteer_intake": {
  "label": "Book a quick call",
  "action": "start_scheduling",
  "type": "scheduling_trigger",
  "ai_available": true,
  // NOTE: selection_metadata is a V4.1 Pool Selection field — it is NOT in
  // ctaDefinitionSchema. The schema uses .passthrough() at the tenant level via
  // featureFlagsSchema but ctaDefinitionSchema is a strict z.object(). The
  // selection_metadata field in the raw JSON config is stored and passed through
  // at the config layer but is not validated or typed by ctaDefinitionSchema.
  // If V4.1 selection_metadata typing is needed in a future pass, a
  // selectionMetadataSchema should be added as an optional field in cta.schema.ts.
  "selection_metadata": {
    "topic_tags": ["scheduling", "intake"],
    "depth_level": "action",
    "role_axis": "act"
  }
}

// Resume affordance — emitted by metadata-driven mechanism in §9.5, not by config
// (no resume_scheduling CTA is operator-authored; widget renders from
// suspended_scheduling_detected metadata)
```

Per canonical §9.5, `resume_scheduling` is metadata-driven — the widget renders the resume affordance from `suspended_scheduling_detected` payload, not from an operator-defined CTA. The enum value is reserved in the schema for parity with the action-dispatch chain in [`MessageBubble.jsx`](../../Picasso/src/components/chat/MessageBubble.jsx) but should not appear in production tenant configs.

---

## 10. Validation summary (cross-section invariants)

Implemented as `superRefine` blocks in `tenant.schema.ts`:

1. `feature_flags.scheduling_enabled === true` ⟹ `scheduling` block present.
2. Every `appointment_types[*].routing_policy_id` ∈ `routing_policies`.
3. Every `routing_policies[*].tag_conditions[*].tag` ∈ `scheduling_tag_vocabulary`.
4. `scheduling.pre_call_form_id`, when set, ∈ `conversational_forms`.
5. `scheduling.default_locale` ∈ `scheduling.available_locales`.
6. Every CTA with `action ∈ {'start_scheduling', 'resume_scheduling'}` requires `feature_flags.scheduling_enabled === true` and non-empty `scheduling.appointment_types`.

**Invariant 6 error multiplicity note.** When a CTA has a scheduling action but the `scheduling` block is absent entirely, both the "scheduling_enabled" and the "non-empty appointment_types" sub-conditions of Invariant 6 fire simultaneously — two error messages are added for that CTA. This is acceptable behavior (both conditions are independently violated) and is consistent with how Zod superRefine accumulates issues. No code fix needed; documented for implementor awareness.

---

## 11. Fields NOT included in v1

For traceability — these are deferred per the canonical's v2 scope:

- Microsoft Graph fields (no `calendar_provider` selection in `appointment_types`; v1 is Google-only).
- Teams conferencing (`location_mode` doesn't include a Teams option yet).
- Group/Panel formats (`format` is literal `'one_to_one'`).
- Capacity tracking (`max_capacity`, `remaining_capacity` fields not present on slot/appointment).
- VMP integration fields.
- Multi-site `site_id` routing dimension.
- Per-resource `booking_limits` (calendar working hours handle limits per §7.2).

When v2 lands, this schema extends additively; v1 configs remain valid.
