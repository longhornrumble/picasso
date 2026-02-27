# PRD Amendment: V4 Pipeline — Classification Layer Redesign

**Amendment to:** PRD: Picasso V4 Modular Conversational Pipeline (`docs/V4_PIPELINE_PRD.md` v1.0)
**Amendment version:** 1.0
**Date:** 2026-02-26
**Status:** Draft — Pending Engineering Review
**Author:** Product

---

## Purpose of This Amendment

This document amends a specific design flaw in the V4 Pipeline PRD. It replaces Step 3 ("Action Selection") with a two-operation architecture: a classification call (Step 3a) followed by deterministic routing code (Step 3b). All other sections of the original PRD — Problem, Target Users, Jobs to Be Done, Non-Functionals, Out of Scope, Migration Phases, and Acceptance Criteria 1–2 and 4–10 — remain unchanged unless explicitly superseded below.

**Sections superseded by this amendment:**
- AC3 (Step 3 focused call) — replaced by AC3a and AC3b below
- V4_ARCHITECTURE.md Step 3 design — the architecture doc's Step 3 prompt template is superseded
- PM Review Notes "Competitive Context" paragraph — corrected below

**Sections not affected:**
- Problem, Target Users, JTBD (unchanged)
- Non-Functionals (unchanged)
- Out of Scope (unchanged)
- AC1, AC2, AC4–AC10 (unchanged)
- Risks and Mitigations table (amended with new rows below)
- Success Metrics (unchanged)
- Migration Phase plan (unchanged; phase gates in PM Review Notes also unchanged)

---

## The Design Flaw This Fixes

The original Step 3 makes a single Haiku call that receives the AI's own generated response alongside the CTA vocabulary (bare ID strings, no descriptions), and asks the model to pick actions. This design has three compounding problems:

**Problem 1 — Classification evaluates the AI's output, not the user's intent.** The Step 3 prompt in the architecture doc uses `Assistant: {the response that was just generated}` as a primary input. When the response is long or meandering, the classifier anchors on what the AI wrote rather than what the user asked. The user's actual message — the only authoritative signal of intent — is diluted.

**Problem 2 — Bare labels produce ambiguous classification.** The architecture doc's vocabulary block contains entries like `apply_dare2dream — Apply to Mentor` and `request_dare2dream — Request a Youth Mentor`. These labels are correct for human readers in a UI context but insufficient for a language model classifier that must distinguish applicant intent from recipient intent. "I want to help a kid" and "my son needs a mentor" use completely different vocabularies yet need to resolve to different CTAs. A label alone cannot carry that boundary.

**Canonical misfire (Austin Angels):** A visitor messages "my son needs a mentor." The single-call Step 3 selects `apply_dare2dream` (Apply to Mentor — the applicant path) instead of `request_dare2dream` (Request a Youth Mentor — the recipient path), because both label strings contain "mentor" with no description to separate them. The wrong form is offered. This is not an edge case — it is the most important routing decision for this tenant.

**Problem 3 — Classification and action selection are collapsed.** Because the same call returns CTA IDs directly, there is no independent layer to inspect, validate, or tune. Operators cannot refine boundaries without editing prompt engineering code. Logs show "which IDs were returned" but not "which intent was matched and why."

---

## The Three-Layer Architecture

This amendment adopts the same three-layer separation used by Intercom Fin in its production pipeline. Fin separates response generation, classification, and routing as independent layers — each with one job, each unaware of the others' internals. The V4 Pipeline inherits this contract:

| Layer | Owner | Input | Output |
|---|---|---|---|
| Step 2: Response generation | LLM (streaming) | User message + KB + persona + history | Natural language answer, streamed |
| Step 3a: Classification | LLM (non-streaming) | User message + conversation context + described taxonomy | Intent label from closed list, or null |
| Step 3b: Routing | Deterministic code | Classified label + config rules | Branch activation + CTA set |

The response generator does not know the intent taxonomy exists. The classifier does not know which CTAs exist. The routing code has no AI — it evaluates rules only.

---

## Step 3a: Classification (Replaces Original Step 3)

### What It Does

A separate, non-streaming Haiku call that evaluates the user's message against a described taxonomy of intents. It returns a single label from the closed list, or null if no intent matches.

### What the Classification Call Receives

**Included:**
- The user's current message (verbatim)
- Recent conversation context: the last 2 complete user-turn messages (not assistant turns; not KB passages)
- The full described taxonomy: each intent's `name` and `description` as defined in config

**Excluded — the classifier must not receive:**
- The AI's generated response from Step 2
- CTA definitions, action menus, button configurations, or `cta_definitions` records
- The system prompt, persona block, or `tone_prompt`
- KB retrieval passages
- Branch structure or `conversation_branches` config

The exclusions are not optional. Passing the Step 2 response contaminates the classification signal with the AI's own framing. Passing CTA definitions couples the classifier to action selection, recreating the original flaw.

### Prompt Structure

```
You are a conversation classifier. Read the customer messages below and identify
which intent best matches, using only the taxonomy provided.

CUSTOMER MESSAGES (most recent last):
{last_2_user_messages}

INTENT TAXONOMY:
{intent_definitions_block}

Return ONLY the intent name that matches, or null if no intent matches.
Do not explain. Do not select multiple intents. Do not invent new intents.

Examples of valid output:
null
"mentoring_recipient"
"volunteer_lovebox"
```

The `intent_definitions_block` renders each entry as:

```
{intent_name}: {description}
```

Temperature: 0.1. The call is deterministic by design — this is classification, not generation.

### What the Taxonomy Entry Must Contain

Each intent definition must have:
- `name` — A string identifier matching the `target_branch` or fallback routing target
- `description` — Operator-authored natural language specifying when this intent applies

Descriptions that include negative cases ("NOT when the user is asking about X") are the primary mechanism for fixing misfires. The quality of classification is directly proportional to the quality of these descriptions. Config validation must reject a taxonomy entry with a missing or empty description.

### Austin Angels Example (Corrected)

The intent taxonomy for Austin Angels' Dare to Dream program would be:

```json
{
  "intent_definitions": [
    {
      "name": "mentoring_applicant",
      "description": "The visitor wants to become a mentor or volunteer in the mentoring program. They are an adult asking how to give their time, apply, or get involved as a helper. NOT when the visitor is asking on behalf of a child who needs a mentor.",
      "target_branch": "volunteer_dare_to_dream"
    },
    {
      "name": "mentoring_recipient",
      "description": "The visitor is a parent, guardian, or caregiver asking about enrolling a child in the mentoring program. They want to request a mentor for a young person. NOT when the visitor is asking how to become a mentor themselves.",
      "target_branch": "recipient_dare_to_dream"
    }
  ]
}
```

With this taxonomy, "my son needs a mentor" matches `mentoring_recipient` and routes to the correct branch. "I want to apply to mentor" matches `mentoring_applicant`. The descriptions carry the boundary that bare labels cannot.

### Null Handling

If the classifier returns null, or returns a value not present in the taxonomy, Step 3b falls through to the fallback branch. No error is thrown. No CTA is forced. The session continues with either the configured fallback branch CTAs or no CTAs (empty SSE event). This is the correct behavior — null means "intent not yet clear," which should not surface an action button.

---

## Step 3b: Routing (New — Replaces Branch Override Logic in Step 4)

### What It Does

Deterministic code that consumes the classified label from Step 3a and maps it to a branch and CTA set. No AI.

### Rules

```javascript
function routeFromClassification(label, config) {
  if (!label) {
    return resolveFallbackBranch(config);
  }

  const intent = config.intent_definitions?.find(d => d.name === label);
  if (!intent) {
    return resolveFallbackBranch(config);
  }

  if (intent.target_branch && config.conversation_branches?.[intent.target_branch]) {
    return resolveBranchCTAs(intent.target_branch, config);
  }

  // Intent matched but no branch configured — return the single CTA if specified
  if (intent.cta_id) {
    return resolveSingleCTA(intent.cta_id, config);
  }

  return resolveFallbackBranch(config);
}
```

The existing `assembleActions()` branch override logic in Step 4 is preserved for tenants that do not use `intent_definitions` — operators who authored `conversation_branches` with entry CTAs still get branch overrides via Step 4. Step 3b routing applies only when `intent_definitions` is present in the config.

### Config: The `intent_definitions` Structure

`intent_definitions` is a new optional top-level config key. It does not replace `conversation_branches` — it provides the classification layer that activates branches.

```json
{
  "intent_definitions": [
    {
      "name": "string — identifier, matches target_branch value",
      "description": "string — operator-authored, required, non-empty",
      "target_branch": "string — optional, references conversation_branches key",
      "cta_id": "string — optional, references cta_definitions id (if no branch)"
    }
  ]
}
```

**Relationship to existing config:**
- `conversation_branches` entries already have `description` fields. These descriptions were authored to guide V3.5's routing prompt. They are the correct source for `intent_definitions[].description` — operators do not need to rewrite them. The migration script can populate `intent_definitions` from existing branch descriptions.
- `cta_definitions` records already have `ai_hint` fields (established in the V3.5 Quality PRD). `intent_definitions` descriptions serve the same purpose — operator-authored natural language for the AI — but at the routing level rather than the action level.
- The `available_actions` field remains deprecated. `intent_definitions` does not revive it.

**Config validation rules (new):**
1. If `intent_definitions` is present, every entry must have a non-empty `description`. Entries without descriptions are rejected at load time with a log warning.
2. If `intent_definitions` is present and `feature_flags.V4_PIPELINE` is false, `intent_definitions` is ignored. No error.
3. If a `target_branch` in `intent_definitions` references a branch not present in `conversation_branches`, log a warning at load time. Do not error — fall through to fallback on match.

---

## Updated Acceptance Criteria

The following replace AC3 in the original PRD. All other acceptance criteria are unchanged.

**AC3a — Classification call receives only user message and taxonomy.** `classifyIntent()` makes a separate, non-streaming Bedrock call. Its input prompt contains only: the last 2 user-turn messages and the `intent_definitions` block (names + descriptions). It does not contain the Step 2 response, CTA definitions, the system prompt, or KB passages. Verified by unit test on `buildClassificationPrompt()` output: assert that the prompt string contains no substring from `tone_prompt`, `cta_definitions`, or KB passages; assert it contains the `intent_definitions` description strings.

**AC3b — Classification returns a label or null.** `classifyIntent()` output is either a string matching an `intent_definitions[].name` value, or null. Any output that is not a recognized intent name is treated as null. Malformed output (non-string, object, explanation prose) is caught, logged, and returned as null. Verified by unit test covering: valid label match, null return, unknown-label return (treated as null), and exception path (returns null, does not throw).

**AC3c — Routing is deterministic.** `routeFromClassification()` contains no LLM calls. Given the same label and config, it returns the same CTA set on every invocation. Verified by unit test: run 100 times with identical inputs, assert identical outputs.

**AC3d — Null classification falls through to fallback, not error.** When `classifyIntent()` returns null, the pipeline completes without error and either surfaces the fallback branch CTAs or sends an empty CTA SSE event. No CTA is forced. Verified by unit test on the null path of `routeFromClassification()` and by integration test confirming the frontend receives a valid (possibly empty) SSE event.

**AC3e — Described taxonomy is required.** A config with `intent_definitions` entries that have empty or missing `description` fields is rejected with a validation error at handler load time. A valid entry requires non-empty `name` and non-empty `description`. Verified by unit test on `validateIntentDefinitions()` with: valid config (passes), entry with empty description (fails with logged error), entry with missing description key (fails).

**AC3f — Austin Angels mentoring misfire is resolved.** With `intent_definitions` for Austin Angels populated with `mentoring_applicant` and `mentoring_recipient` descriptions as specified in this amendment, the following messages classify correctly: "my son needs a mentor" → `mentoring_recipient`; "I want to apply to be a mentor" → `mentoring_applicant`; "tell me about the program" → null. Verified by running the test tenant TESTV3ATL (or AUS123957 staging) with these two intent definitions enabled and confirming classification output in Step 3a logs.

---

## Corrected Competitive Context

The original PRD states: "Intercom Fin, Ada, and Drift all separate 'answer generation' from 'action recommendation' in their LLM pipelines."

This understates Fin's architecture. Fin separates three concerns, not two:

1. **Response generation** — The RAG pipeline answers the customer's question. The response generator does not know the intent taxonomy exists.
2. **Classification** — A separate AI evaluation reads the customer's message against described attribute definitions and returns a label from a closed list. The classifier does not generate a response and does not see the response that was generated.
3. **Routing** — Deterministic workflow rules map the classified label to a branch path or action. No AI. The routing engine has no knowledge of how the label was assigned.

These are genuinely independent layers. Fin can run classification without generating a response (silent classification). It can generate a response without running classification. The original PRD's framing — "answer generation" vs. "action recommendation" — describes a two-layer system. The V4 Pipeline, as amended, implements the correct three-layer model.

---

## Additional Risks (Amending the Risks Table)

The following rows are added to the Risks and Mitigations table in the original PRD. Existing rows remain unchanged.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Operators author vague `intent_definitions` descriptions, producing low classification accuracy | Medium | High | Config builder exposes descriptions with character guidance (80–200 chars), negative-case helper text ("Also describe when this intent does NOT apply"), and a preview tool that tests classification against sample messages before save. |
| Classification call adds latency beyond the 400ms Step 3 budget | Low | Medium | Step 3a is a small call: ~300 input tokens (2 user messages + taxonomy), ~5 output tokens. Expected p50: 150–200ms. If p95 exceeds 350ms in Phase 2 testing, evaluate running Step 3a in parallel with the final stream chunks rather than strictly after stream end. |
| Existing `conversation_branches` have `description` fields that are too implementation-specific to reuse as intent descriptions | Medium | Low | Branch descriptions were written to guide V3.5's routing prompt (e.g., "When the user has expressed interest in volunteering for Love Box"). These are semantically appropriate for classification. Migration script populates `intent_definitions` from branch descriptions; validate with Austin Angels staff before Phase 4 deploy. |
| A session produces repeated null classifications across multiple turns — user intent never resolves | Medium | Medium | After 3 consecutive null-classification turns, surface the configured fallback branch CTAs proactively. This is the same session-level rule noted in the original PRD's PM Review Notes (Item 3) — this amendment provides the hook for implementing it in `routeFromClassification()`. |
| Tenants without `intent_definitions` see no change in behavior, but miss the routing accuracy improvement | Low | Low | `intent_definitions` is optional and additive. Existing tenants continue on the original Step 3 (or V3.5) path. Config builder surfaces `intent_definitions` as an optional "Advanced Intent Routing" section during Phase 3 new tenant onboarding. |

---

## Affected Files

| File | Status |
|---|---|
| `docs/V4_PIPELINE_PRD.md` | Amended by this document (AC3 superseded; competitive context corrected; two risk rows added) |
| `docs/V4_ARCHITECTURE.md` | Step 3 prompt template superseded. All other sections remain as reference. |
| `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/index.js` | New functions: `buildClassificationPrompt()`, `classifyIntent()`, `routeFromClassification()`, `validateIntentDefinitions()`. Modified: main handler V4 branch. |
| `picasso-config-builder/` | New field group: `intent_definitions` editor with description textarea, negative-case hint, and preview tool. Coordinate with Config Builder work stream. |

---

## What This Amendment Does Not Change

- Step 1 (KB retrieval) — unchanged
- Step 2 (conversational response, streaming) — unchanged
- Step 4 (assembly, branch overrides for tenants without `intent_definitions`) — unchanged
- Feature flag gate (AC1) — unchanged
- CTA SSE event format — unchanged
- Form handling and `start_form` CTAs — unchanged
- V3.5 code path for tenants without `V4_PIPELINE: true` — unchanged
- Migration phase plan and phase gate criteria — unchanged
- Success metrics — unchanged
