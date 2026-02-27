# PRD: Picasso V4 Modular Conversational Pipeline

**Version:** 1.0
**Date:** 2026-02-24
**Status:** Draft — Pending Engineering Review
**Stakeholders:** Product, Engineering, Operations

---

## Problem

V3.5 asks one Haiku call to simultaneously write a response, pick CTA IDs from a vocabulary, and generate CHIPS suggestions. The conversation quality is acceptable, but structured metadata is unreliable: CTAs fire prematurely, CHIPS suggestions are circular or unbalanced, and prompt patching (v71–v76) causes regressions. Operators compensate by hand-authoring rigid `conversation_branches` phone trees. Austin Angels — a 2-program tenant — has a 49KB config with 22 CTAs, 7 branches, and hundreds of lines of routing description. This does not scale to 10 or 50 tenants.

---

## Target Users

| User | Need |
|---|---|
| Nonprofit end-user (visitor) | Warm, natural conversation that surfaces the right action button at the right moment |
| Nonprofit operator (program staff) | A working chatbot with minimal setup; no need to author routing trees |
| MyRecruiter engineer | A pipeline that is debuggable, testable, and extendable toward agentic microservices |
| MyRecruiter ops/CS | Configs that can be created and tuned without deep prompt engineering knowledge |

---

## Jobs to Be Done

1. A foster parent visiting austinangels.com wants to understand how Love Box works and apply — without the bot pushing a form button before she has enough information.
2. A potential volunteer asks an open-ended question and receives a focused answer plus exactly the one or two action buttons that match their intent.
3. An operator onboards a new tenant by defining CTAs and uploading KB content — no branch routing logic required.
4. An engineer enables V4 for one tenant via a feature flag and validates behavior before rolling out broadly.
5. An ops team member troubleshoots a missed CTA selection by reading a Step 3 log entry, not reverse-engineering a mega-prompt.

---

## Non-Functionals

| Attribute | Requirement |
|---|---|
| Latency — time to first token | Equal to or better than V3.5 (~700ms target; prompt shrinks from ~1,200 to ~800 tokens) |
| Latency — CTA appearance | Step 3 completes within 400ms of stream end; total CTA latency unchanged from user perspective |
| Cost | Step 3 adds ~$0.0005/message (Haiku pricing); acceptable. Total per-message cost stays under $0.003. |
| Reliability — CTA accuracy | Step 3 must select the correct CTA(s) in ≥90% of tested conversation scenarios (vs. ~70% estimated for V3.5 mega-prompt) |
| Backward compatibility | V3.5 continues operating unmodified for all tenants without `V4_PIPELINE: true` |
| Observability | Step 2 response, Step 3 input, Step 3 output, and selected CTA IDs are all logged to existing analytics pipeline per message |
| Config size | New tenants should not need `conversation_branches` to have a working chatbot |

---

## Out of Scope

- Changes to the Picasso frontend (CTA SSE event format is unchanged; CHIPS absence is already handled gracefully)
- Form handler changes (`start_form` CTAs and conversational forms are unchanged)
- Analytics dashboard changes (same logging format)
- Re-architecting KB retrieval (Step 1 is unchanged)
- Language detection or multi-language support (separate initiative)
- Appointment scheduling (separate planning doc; not yet implemented)
- Removal of `conversation_branches` support (branches become optional, not eliminated; operators who authored them keep them)

---

## Acceptance Criteria

1. **Feature flag gate.** When `feature_flags.V4_PIPELINE` is absent or `false`, the handler executes the V3.5 code path without modification. When set to `true`, the handler executes the V4 pipeline. No tenant behavior changes without explicit flag opt-in.

2. **Step 2 prompt isolation.** The Step 2 prompt contains no CTA vocabulary, no CHIPS instruction, no `<!-- NEXT: -->` tag format, and no W5 framework block. Verified by unit test on `buildV4ConversationPrompt()` output.

3. **Step 3 focused call.** `selectActions()` makes a separate, non-streaming Bedrock call. Its input prompt contains only: the last 2–3 conversation turns, the Step 2 response, and the CTA vocabulary. Its output is a valid JSON array of CTA ID strings or an empty array. Verified by unit test covering empty-array, single-ID, and multi-ID cases, plus a malformed-JSON fallback (returns empty array, does not throw).

4. **Branch override still applies.** When a Step 3–selected CTA has a `target_branch` and that branch defines `available_ctas`, the branch CTAs are used instead of the AI selection. Verified by unit test on `assembleActions()`.

5. **CTA SSE event format unchanged.** The SSE event payload received by the Picasso frontend is structurally identical between V3.5 and V4. Verified by integration test comparing event shapes.

6. **CHIPS absence is graceful.** When V4 is active, no CHIPS SSE event is sent. The frontend renders correctly without it. Verified by manual QA session on Austin Angels test tenant with `V4_PIPELINE: true`.

7. **Latency regression test.** Median time-to-first-token in V4 is equal to or lower than V3.5 baseline measured on TESTV3ATL over 50 test messages. Step 3 completes within 400ms of stream end on median.

8. **Step 3 logging.** Each message processed by V4 produces a log entry containing: Step 3 prompt token count, Step 3 output (raw), parsed CTA IDs, and whether a branch override was applied. This log is queryable in the existing analytics pipeline.

9. **V4 does not break existing tenants.** All tenants without `V4_PIPELINE: true` produce responses structurally identical to pre-deployment V3.5 output. Verified by regression test suite run against TESTV3ATL and AUS123957 with flag off.

10. **New tenant config requires no branches.** A valid tenant config consisting only of `cta_definitions`, `tone_prompt`, `branding`, and a KB produces correct CTA selection in V4. Verified by creating a minimal test config and running 20 representative conversation scenarios with ≥85% correct CTA selection rate.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Step 3 selects wrong CTAs for ambiguous intent (e.g., "I want to help" — volunteer or donate?) | Medium | Medium | Add a `rules` block to the Step 3 prompt with intent disambiguation examples. Log all Step 3 selections; review weekly in Phase 2. |
| Step 3 returns malformed JSON when Haiku generates explanation text instead of raw array | Low-Medium | Medium | Parse defensively: strip non-JSON prefix/suffix, catch parse errors, return empty array on failure. Never crash the handler. |
| 400ms Step 3 latency is perceptible — users notice button delay | Low | Low | CTAs already arrive as a separate SSE event after stream in V3.5. The UX pattern is unchanged. If needed, Step 3 can run in parallel with final stream chunks. |
| Austin Angels config migration (Phase 4) removes branches that operators deliberately authored | Low | Medium | Preserve all existing branches in config during migration. Mark branches as optional override layer, not removal. Only strip cross-explore CTAs that the AI now handles. Validate with Austin Angels staff before deploy. |
| Step 2 model produces weaker follow-up questions without CHIPS scaffolding | Medium | Low | The V4 Step 2 prompt instructs the model to end with a natural follow-up question. Test for follow-up quality in Phase 2 evaluation. If degraded, add one follow-up-question example to the prompt. |
| Dual Bedrock call per message doubles Lambda concurrency and increases cold-start surface | Low | Low | Step 3 is a small, fast call (~200-400ms). Monitor Lambda concurrency in CloudWatch during Phase 2. |
| Config simplification claim (49KB to ~15KB) is overstated | Medium | Low | The 15KB estimate is directional, not a hard target. Measure actual config size after Phase 4 migration. The value is operator authoring effort reduction, not byte count. |
| Haiku 4.5 behavior drifts between model versions, breaking Step 3 JSON output format | Low | Medium | Pin model ID (`us.anthropic.claude-haiku-4-5-20251001-v1:0`). Add Step 3 output format validation to CI regression suite before any model upgrade. |

---

## Success Metrics

| Metric | Baseline (V3.5) | Target (V4, 90 days post-GA) | How Measured |
|---|---|---|---|
| CTA selection accuracy (correct CTA shown) | ~70% (estimated from QA observations) | ≥90% | Manual QA eval: 50 scripted conversation scenarios across 3 tenants |
| Median time-to-first-token | ~800ms | ≤700ms | CloudWatch Lambda duration, p50 |
| CTA button appearance latency (post-stream) | Baseline established in Phase 2 | ≤+400ms vs V3.5 | Lambda log timestamp delta |
| Prompt token count (Step 2) | ~1,200 tokens avg | ≤900 tokens avg | Step 2 input token count logged per message |
| Operator config authoring time (new tenant) | ~4–6 hours (with branches) | ≤2 hours (branches optional) | Time-to-first-working-chatbot for next 3 onboarded tenants |
| Zero production incidents from V4 pipeline in Phase 3–4 | — | Zero P1 incidents | PagerDuty / CloudWatch alarms |
| Step 3 empty-array rate (no CTA selected) | Unknown | <20% of messages (intentional; should not fire on every turn) | Analytics query on Step 3 log |

---

## PM Review Notes

### What the Architecture Doc Gets Right

The core bet — split one overloaded prompt into two focused calls — is correct. The V3.5 prompt is genuinely asking the model to do cognitively competing tasks simultaneously. The tag-parsing evidence (`<!-- NEXT: -->`, `<!-- CHIPS: -->`) is a reliable signal that structured output quality is suffering. Separating conversation from action selection is the right call and is well-precedented in agent system design.

The feature flag gate (`V4_PIPELINE: true`) is the correct migration strategy. It keeps V3.5 intact, gives a clean rollback path, and lets Phase 2 produce real comparative data before any tenant is exposed.

### What the Architecture Doc Underspecifies

**1. Step 3 failure modes are not defined.** The doc says Step 3 returns a JSON array or empty array. It does not specify behavior when Haiku returns explanation prose instead of raw JSON (this happens). The implementation must include: strip leading/trailing non-JSON text, attempt JSON.parse, catch parse errors, log the raw output, return empty array. This is not optional.

**2. The CHIPS removal needs a UX decision, not just a backend decision.** CHIPS served as visual navigation scaffolding — clickable suggestions that kept users moving without requiring them to type. The V4 doc says "the model's natural follow-up question IS the navigation." That is true for text-comfortable users. For users who are hesitant to type (common in a nonprofit visitor demographic), losing clickable CHIPS creates a dead-end feel. Recommended: use the Step 3 output to generate 1–2 `send_query` chips derived from the selected CTAs' query fields as a direct replacement. This closes the UX gap without the V3.5 reliability problem.

**3. No fallback strategy when Step 3 produces zero CTAs repeatedly.** If a session has 4 turns with no CTA selected, the user may be lost. Define a session-level rule: after N consecutive empty Step 3 responses, surface the fallback branch CTAs.

**4. The config simplification claim is not fully worked through.** Looking at the Austin Angels config, the elements that can be removed under V4 are: branch `description` fields (used only to guide V3.5's routing decision, now handled by Step 3), cross-explore CTAs in branches (e.g., `learn_dare_to_dream` appearing inside `volunteer_lovebox`), and the `guidance_modules` prompt blocks. The forms, CTA definitions, action chips, and programs sections are unchanged. A realistic reduction is 49KB to 28–32KB, not 15KB. The 15KB figure likely assumes operators would also simplify their CTA vocabulary, which is a separate conversation.

**5. No definition of what "conversation summary" means in Step 3 input.** The doc says Step 3 input is "the last 2–3 exchanges." Specify this precisely: the last 2 complete user+assistant turn pairs, plus the Step 2 response just generated. Do not include KB retrieval results (adds tokens with no benefit to action selection). Do not include system prompt or persona block.

**6. Operator experience in the Config Builder is unaddressed.** If branches become optional, the Config Builder UI should reflect this: branches move from a required setup step to an "Advanced Overrides" section. The CTA definition editor should make `ai_available` default to `true`. These are small changes but need to be coordinated with the Config Builder work.

### Competitive Context

Intercom Fin, Ada, and Drift all separate "answer generation" from "action recommendation" in their LLM pipelines. This is industry-standard architecture for production chatbots. V4 aligns Picasso with that pattern. The differentiation for Picasso/MyRecruiter remains: conversational form collection baked into the chat (competitors redirect to external forms), nonprofit-specific KB and persona tuning, and multi-tenant config management for organizations that cannot maintain a dedicated chatbot team. V4 strengthens the reliability foundation without changing the differentiated surface.

### Migration Phase Gate Recommendations

The 5-phase plan is sound but needs explicit exit criteria per phase:

- **Phase 1 exit:** `buildV4ConversationPrompt()` and `selectActions()` pass unit tests; no V3.5 regression on TESTV3ATL.
- **Phase 2 exit:** 50-conversation eval shows ≥85% Step 3 accuracy; Step 3 latency p95 under 600ms; no empty-array rate above 25%.
- **Phase 3 exit:** Three new tenants onboarded with V4-default configs; zero production incidents over 2 weeks.
- **Phase 4 exit:** Austin Angels staff confirms equal or better experience; config size reduced; no form submission regression.
- **Phase 5 exit:** All tenants on V4 for 30 days; V3.5 code removed from index.js; CHIPS SSE parser removed.

Do not proceed from Phase 3 to Phase 4 without explicit sign-off from Austin Angels program staff. They are the only production tenant at risk.
