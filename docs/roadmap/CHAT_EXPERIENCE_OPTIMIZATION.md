# Chat Experience Optimization Roadmap

**Status:** Approved direction — Phase 1 ready to start
**Date:** 2026-07-04
**Owner:** Chris Miller
**Origin:** Rescoped from the "fully agentic platform" exploration (2026-07-04). Full exploration covered the widget (`Picasso/src/`), both chat Lambdas, the config builder, [`AGENTIC_FOUNDATIONS_PHASE_0.md`](AGENTIC_FOUNDATIONS_PHASE_0.md), and [`docs/V4_ARCHITECTURE_REVIEW.md`](../V4_ARCHITECTURE_REVIEW.md).

---

## 0. Executive summary

The question asked was "should the chat widget become fully agentic?" The exploration answered: **the robotic feel lives in the prompt layer, not the architecture.** A general agent loop running today's prompts would sound exactly as mechanical. The program is therefore:

1. **Commit now (Phases 1–3):** a thin eval net, then a prompt-layer naturalness pass, then measurement. ~80% of the felt improvement at ~10% of the effort of a rearchitecture.
2. **Data-gated (Phase 4):** agentic form collection — the one place where architecture (not prompts) blocks the experience. Green-lit only by form-funnel data collected in Phase 3.
3. **Deferred (Phase 5, appendix):** the general agent loop / Architecture-A rollout. Evaluated in full, recorded here, not scheduled.

**How to read this doc:** every sub-phase is sized as **one PR / one focused agent session** with its own scope, dependencies, and verification. Sub-phases in different **lanes** are file-disjoint and safe to run as parallel workstreams; sub-phases within a lane are sequential.

---

## 1. Key findings (condensed, code-verified)

**The mechanical feel has named causes, all in the prompt layer** (`Lambdas/lambda/Bedrock_Streaming_Handler_Staging/prompt_v4.js`):

| Cause | Where | Effect |
|---|---|---|
| Mandatory follow-up question every turn | CLOSING rule (`prompt_v4.js:175`) + final instruction | Interrogation cadence — the #1 "talking to a widget" cue |
| Hard word caps, stated twice | `:234` (60 words "non-negotiable"), `:240` (200), `:246` (120), REMINDER at `:286-290` | Uniform clipped answers regardless of question |
| Low temperature + tight output cap | temp 0.35 (`:845`), max_tokens 600 (`:848`) | Same-shaped responses |
| Stock openers *licensed* by the prompt | `:227` — literally suggests "Great question!" | Teaches the classic chatbot tic |
| CTA menu forced under every response | selector may return empty only on first message (`:935`); "LEARNING FIRST … Always include LEARN actions" (`:932`) | Menu-card-after-every-bubble feel |
| No memory of shown CTAs | selector prompt carries no already-shown record (gap documented in `V4_ARCHITECTURE_REVIEW.md`) — yet the client already tracks `recently_shown_ctas` (`StreamingChatProvider.jsx:1069-1082`) | Repeat-CTA nagging |
| Verbatim scripted lines in the scheduling agent | `AGENT_NARRATION_RULES` rules 1 & 15 (`scheduling/agentTurn.js:125-174`) embed quoted copy the model parrots | Scripted-sounding scheduling turns |
| Canned client-injected bubbles | "Would you like to resume…? We were collecting Phone." (`StreamingChatProvider.jsx:1336`), hardcoded `dd_apply`/`lb_apply` program map (`:1280-1281`), generic `DEFAULT_PROMPTS` (`QuestionsOverlay.jsx:43`) | System messages that ignore conversation context |

**Forms are the one architecture blocker.** Collection is a 100% client-side, one-field-at-a-time state machine (`Picasso/src/context/FormModeContext.jsx`) the server cannot start or drive; no LLM anywhere in it. No prompt tuning reaches this. Forms are also the conversion event (applications), so this is the single agentic bet worth making — on evidence.

**What already works, don't disturb:** the scheduling agent v1 (`scheduling/agentTurn.js`) is a genuine bounded tool-use loop on Haiku (`MAX_TOOL_ITERATIONS = 3` at `:93`, "agent proposes, human commits" — booking commit is unreachable by the model) and performs well. The V4 Action Selector handles CTA judgment for Q&A traffic. Typical conversations are 2–3 turns; only forms/scheduling run ~20.

**Load-bearing constraints that must survive every phase:** KB-grounding rules (anti-hallucination — nonprofits), injection stripping (`stripRoleBoundarySequences`), the URL/link contract, fixed crisis-suppression copy, fixed eligibility failure messages (compliance copy).

---

## 2. Program conventions

- **Sub-phase = one PR = one agent session.** Small enough that quality doesn't degrade from context exhaustion.
- **Lanes are parallel-safe:** different lanes touch disjoint files (or disjoint repos). Within a lane, run sub-phases in order.
- **Every prompt-behavior change is eval-gated:** no sub-phase in Phase 2 merges before Phase 1 baselines exist for the behavior it changes.
- **Repos:** "lambda" = the nested repo at `Lambdas/lambda/` (BSH lives in `Bedrock_Streaming_Handler_Staging/`); "picasso" = this repo (widget `Picasso/src/`, config builder). Code PRs target `staging` per CLAUDE.md branch routing; staging soak, then promote.
- **Rollout order for behavior changes:** MyRecruiter test tenant (`my87674d777bf9`) → per-tenant.

---

## Phase 1 — Eval net (gates all prompt changes)

Goal: a regression net proving prompt changes don't break grounding, safety, or CTA quality. A slice of the old Phase-0 "F2/F5" foundations — only what Phase 2 needs. Everything in the lambda repo.

| # | Sub-phase | Scope (files) | Depends | Size |
|---|---|---|---|---|
| 1.1 | **Prompt version constants.** Add `V4_CONVERSATION_PROMPT_VERSION` + `ACTION_SELECTOR_PROMPT_VERSION` to `prompt_v4.js` (follow the `PROMPT_VERSION = 'b17e.v6'` changelog-comment convention, `agentTurn.js:105`); carry both in the `QA_COMPLETE` structured log (`index.js`). | `prompt_v4.js`, `index.js` | — | S |
| 1.2 | **Scripted-Bedrock helper extraction.** Extract the scripted-stream builder from `__tests__/agentEvals.test.js` into `evals/scriptedBedrock.js`; agentEvals suite stays green unmodified in behavior. | `__tests__/agentEvals.test.js`, `evals/` | — (∥ 1.1) | S |
| 1.3 | **Tier-2 runner skeleton.** `evals/run.js` — plain Node process (no jest), runs scenario JSONs in-process against real modules with live Bedrock (fixture tenant config + recorded tool seams); `evals/report.js` markdown report; baseline file keyed by scenario id + prompt versions from 1.1. | `evals/run.js`, `evals/report.js`, `evals/baselines/` | 1.1 | M |
| 1.4 | **Scenario pack A — grounding + anti-fabrication (~6).** KB-hit stays inside KB facts; KB-miss uses tenant fallback and invents nothing; no URL not present in KB; "so I'm booked?" never asserts a booking; `no_availability` → honest copy. Scoring: deterministic assertions first; Haiku judge (temp 0) only for groundedness, `unsure` → human review. | `evals/scenarios/` | 1.3 (∥ 1.5) | S |
| 1.5 | **Scenario pack B — CTA quality + safety (~6).** Interest ≠ commitment (no premature APPLY); explicit commitment → APPLY included; invalid CTA IDs never returned; prompt injection ×2 (incl. canary planted in `tone_prompt` fixture never leaking); sensitive-context suppression; PII discipline ('@'-free logs). | `evals/scenarios/` | 1.3 (∥ 1.4) | S |
| 1.6 | **CI wiring + committed baselines.** New job in lambda `.github/workflows/pr-checks.yml`, path-gated on `prompt_v4.js`, `scheduling/agentTurn.js`, `evals/**` + `workflow_dispatch`; staging OIDC creds (existing pattern); regression fails the job; only override = PR-reviewed baseline update. Demonstrate failure by deliberately breaking a rule. | `pr-checks.yml`, `evals/baselines/` | 1.4 + 1.5 | S |

**Phase gate:** 1.6 green in CI with baselines for today's prompts committed. Cost note: ~12 scenarios × ≤5 Haiku calls ≪ $1/run; path-gating keeps unrelated PRs deterministic.

---

## Phase 2 — Naturalness pass (eval-gated, one PR per sub-phase)

Goal: kill the mechanical feel. Three parallel lanes.

**Lane N1 — conversation prompt (`prompt_v4.js`; sequential — same code region):**

| # | Sub-phase | Change | Size |
|---|---|---|---|
| 2.1 | **Closing rule.** Replace the mandatory follow-up-question CLOSING rule (`:175`) + final-instruction line with conditional, varied closings (question only when it genuinely helps; offer/observation/plain stop otherwise). Bump version; eval-gate vs pack A. | S |
| 2.2 | **Length + inference params.** Word caps (`:234/:240/:246` + REMINDERs `:286-290`) → calibrated guidance ("match length to the question; usually 2–4 short paragraphs; soft ceiling"). temp 0.35 → ~0.65 (`:845`); max_tokens 600 → 1000 (`:848`). Grounding regression (pack A) is the explicit gate — temperature is the one real hallucination risk. | S |
| 2.3 | **Openers + style examples.** Remove the "Great question!" license (`:227`); prohibit stock openers; rewrite style-block examples so they can't be parroted as templates. | S |
| 2.4 | **Sanitizer + history.** Narrow `sanitizeTonePromptV4` phrase patterns (stops silently mangling legitimate persona sentences); history compression keeps 1-line summaries of dropped assistant turns (reduces cross-turn self-repetition). | S |

**Lane N2 — action selector (`prompt_v4.js` `selectActionsV4`; run after N1 lands or coordinate rebases — same file, different function):**

| # | Sub-phase | Change | Size |
|---|---|---|---|
| 2.5 | **CTA restraint + memory.** Allow empty selections on any turn (relax `:935`); soften LEARNING-FIRST (`:932`) while keeping the commitment gate; add an ACTIONS-ALREADY-SHOWN block fed from `session_context.recently_shown_ctas` (client already sends it). Eval-gate vs pack B; watch CTA click-through in analytics after rollout. | S |

**Lane N3 — scheduling agent (`scheduling/agentTurn.js`; ∥ with N1/N2):**

| # | Sub-phase | Change | Size |
|---|---|---|---|
| 2.6 | **De-scripting.** Rules 1 & 15 of `AGENT_NARRATION_RULES` (`:125-174`): express the redirect/no-enumeration constraints as intent, not verbatim quoted copy. Behavioral rules 2, 3, 6, 7, 10, 12–14, 16, 17 untouched. Bump `PROMPT_VERSION`, rerun `agentEvals.test.js`. | S |

**Lane N4 — widget (picasso repo; ∥ anytime):**

| # | Sub-phase | Change | Size |
|---|---|---|---|
| 2.7 | **Quick-help defaults.** `QuestionsOverlay.jsx:43` — stop showing generic donation `DEFAULT_PROMPTS` to tenants without `quick_help.prompts`; empty config hides the row. Wrong-org questions are worse than robotic ones. | S |

**Phase gate:** all merged sub-phases soaked on the test tenant; Chris's demo verdict ("does it still sound like a widget?") recorded before per-tenant rollout.

---

## Phase 3 — Measurement (the gate for Phase 4)

| # | Sub-phase | Scope | Depends | Size |
|---|---|---|---|---|
| 3.1 | **Form-funnel pull.** Per tenant/form: `FORM_VIEWED` → `FORM_STARTED` → `FORM_FIELD_SUBMITTED` → `FORM_COMPLETED` / `FORM_ABANDONED` rates from the analytics pipeline (events already emitted by `FormModeContext.jsx`). Where in the field sequence do people bail? | analytics query/report | — (can run ∥ Phase 1–2) | S |
| 3.2 | **Go/no-go memo.** Combine 3.1 data + post-Phase-2 demo verdict. **Decision rule: material mid-collection abandonment ⇒ green-light Phase 4; healthy completion ⇒ Phase 4 stays parked and the program ends here.** | short memo in this doc's PR trail | 3.1 + Phase 2 soak | S |

---

## Phase 4 — DATA-GATED: Agentic form collection

**Not scheduled. Executable design, recorded so it needs no re-analysis when green-lit.** The agent elicits fields naturally (multiple per turn, any order, side questions answered in-flow); validation, eligibility, consent, and submission stay deterministic. "Agent proposes, human commits."

**4.0 — Contract freeze (enables all lanes below to run in parallel):** one doc PR locking (a) the five SSE directives — `form_session`, `form_field_request`, `form_progress`, `form_review`, `form_submitted` — mirroring the `scheduling_*` precedent in `StreamingChatProvider.jsx` `emitLines` (`:229`); (b) `routing_metadata.form_action: start_form | field_answer | confirm_submission | cancel_form` (+ `form_id`, `field_id`, `value`, `review_token`); (c) the FSM states. Size S.

**Lane F-server (lambda repo, sequential):**

| # | Sub-phase | Scope | Size |
|---|---|---|---|
| 4.1 | Form-session table + store: bare-named DynamoDB `picasso-conversation-form-session` (naming-parity rule), store module cloned from `scheduling/schedulingStateStore.js`; validated `field_values` only, consent never model-written, `review_token`, 24h TTL. IaC in `infra/` (staging first). | new `forms/formSession.js`, `infra/` | M |
| 4.2 | FSM module: `collecting → reviewing → submitted`; `collecting → ineligible` (terminal); `reviewing → collecting` (edits); implicit suspend/resume; mirrors `shared/scheduling/stateMachine.js` (illegal transitions throw). | new `forms/formStateMachine.js` + tests | S |
| 4.3 | Single validator: config-driven `forms/fieldValidation.js` replacing the hardcoded field-id switch in `form_handler.js:163-228` (`age_confirm`/`commitment_confirm` tenant hardcodes die) and, at cutover, the client copies (`FormModeContext.jsx` ~170–320). Eligibility gates (`minimum_age`, disqualifying selects) move in verbatim. Contract tests run against real tenant configs. | new `forms/fieldValidation.js` | M |
| 4.4 | Form tools: `record_field_values` (batch, per-field `{accepted, rejected:{code,hint}}` results), `request_form_submission` (→ review state only). TCPA consent fields `structured_only` — model values rejected, widget renders deterministic consent UI. Jest statically asserts the tools module holds **no reference to `submitForm`** (mirrors the `invokeBookingCommit` assertion). | new `forms/formTools.js`, `forms/FORM_TOOL_CATALOG.md` | M |
| 4.5 | Loop host: minimal generalization of `agentTurn.js` for the FORMS profile (state line via the `buildStateLine` pattern, FORMS narration-rules module with its own `PROMPT_VERSION`, iteration cap 3, history cap ~20). Scheduling code untouched. | new `forms/formAgentTurn.js` | M |
| 4.6 | Deterministic click lane in `index.js` (new pre-empt rung, mirroring the scheduling click rung): handles all `form_action` values with zero model calls; **`confirm_submission` is the ONLY path to `submitForm()`** (`form_handler.js:239` — already Node/BSH on the streaming path; MFS `form_handler.py` is HTTP-fallback only). `review_token` binds the click to the reviewed snapshot. | `index.js` | M |
| 4.7 | SSE emission wiring + flag gate: emit the five directives from tool executors/FSM transitions; 3-layer fail-closed guard (env `AGENTIC_FORMS_DISABLED` → tenant `agentic_mode_enabled` → `feature_flags.AGENTIC_FORMS`), per the `isAgentTurnEnabled` pattern (`agentTurn.js:186`). Flag off ⇒ byte-identical legacy. | `index.js`, `forms/` | S |

**Lane F-widget (picasso repo, ∥ after 4.0):**

| # | Sub-phase | Scope | Size |
|---|---|---|---|
| 4.8 | `emitLines` dispatch for the five directives + slim `AgenticFormRenderer` (renders directives, echoes structured answers via `form_action` metadata). When tenant flag on: `start_form` CTA click round-trips to server instead of mounting `FormModeContext`. Never dual-active per tenant. | `StreamingChatProvider.jsx`, new renderer component | M |
| 4.9 | Structured field affordances: reuse `FormFieldPrompt.jsx` / `CompositeFieldGroup.jsx` as server-driven inputs for select/date/composite/consent (free-text fields need no UI). Review card + Confirm/Edit; completion reuses `FormCompletionCard.jsx`. | forms components | M |

**Lane F-config (∥ after 4.0):**

| # | Sub-phase | Scope | Size |
|---|---|---|---|
| 4.10 | Flags in config-builder: `agentic_mode_enabled` + `AGENTIC_FORMS` in `FeatureFlagsSettings.tsx`; zod invariant in `tenant.schema.ts` (`AGENTIC_FORMS ⟹ agentic_mode_enabled`; schema is already `.passthrough()` at `:239`). | config-builder | S |

**Gate slices (before any real tenant):**

| # | Sub-phase | Scope | Size |
|---|---|---|---|
| 4.11 | Form-elicitation eval scenarios (multi-field extraction accuracy, correction handling, digression recovery, gate/consent adversarials, injection) + `AGENT_TRACE_V1` reasoning-trace line as **redacted CloudWatch structured logs** (NOT a new DynamoDB store — consistent with the PII retention strategy; CloudWatch 7-day + redacted Glacier export is the already-dispositioned pattern; one `pii-inventory.md` row required). | `evals/scenarios/`, `shared/agent/trace.js` | M |
| 4.12 | Per-tenant cutover + retirement: flip tenants one at a time; retire client resume-prompt injection (`StreamingChatProvider.jsx:1216-1377`), `response_enhancer.js` suspended-form machinery, `dd_apply`/`lb_apply` hardcodes; delete the client machine when the last tenant flips. | widget + lambda | M |

**Model policy:** start Haiku 4.5; per-tenant Sonnet 4.6 trial flag on the form agent only; decided by the 4.11 evals (slot accuracy, correction handling, turns-to-completion), not vibes.

---

## Phase 5 — Evaluated and DEFERRED: general agent architecture (appendix)

Recorded so the analysis isn't lost; **not scheduled.**

**The design (if ever needed):** one general tool-use loop (`agent/agentCore.js` generalized from `agentTurn.js`) entered through a **deterministic zero-LLM router** (`resolveTurnContext()` reads flags + scheduling/form session rows + `routing_metadata` → tool profile). Tool profiles with least privilege: BASE (`search_knowledge_base`, `show_showcase`, `start_form`, `begin_scheduling`), FORMS, SCHEDULING — scheduling as a *profile* of the one loop, never a nested agent. Transactional profiles mutually exclusive per turn. V4 Action Selector eventually absorbable as a `present_cta_buttons` tool validated against the `ai_available` vocabulary; `show_info`/`show_showcase` turns (today resolved client-side, invisible to the server) round-trip so the agent's context has no holes. With `tool_choice: auto`, a plain Q&A turn is one streamed call — structurally today's latency.

**Why deferred:** (a) 2–3-turn Q&A traffic gains little from a loop; (b) naturalness comes from Phase 2; (c) agentic forms (Phase 4) doesn't require it — a FORMS-profile loop host is enough; (d) the trigger to revisit is a *second* long-flow agentic surface, or post-Phase-4 pressure to unify the scheduling and forms loop hosts.

**Amendments to [`AGENTIC_FOUNDATIONS_PHASE_0.md`](AGENTIC_FOUNDATIONS_PHASE_0.md)** (dated 2026-07-04): this roadmap answers its open questions (tool-catalog format = JSON-Schema-in-frozen-JS registry when needed; eval scoring = deterministic-first + Haiku judge with `unsure`→human; trace retention = redacted CloudWatch 7-day, no new durable store; flag granularity = master + per-surface). The following Phase-0 items are deferred as over-engineered for current scale: trace-replay dashboard; indexed trace store; frontend kill-switch gating (a no-op under Architecture A); onboarding the Action Selector "as a tool" (category error — it's a prompt); CI enforcement of per-tenant `model_id` changes (runbook line instead). The five foundations are pulled in **just-in-time by Phase 4 slices** (evals → 1.3–1.6 now; versioning → 1.1 now; traces + catalog + kill-switch UI → 4.10–4.11 when green-lit).

---

## 6. Cost & model summary

- **Phase 2 is ~free:** prompt work on Haiku 4.5; longer answers add roughly +$2 per 1,000 conversations.
- **Phase 4 is the only genuinely new cost:** forms convert from a $0 client-side flow to ~$0.105 per 20-turn conversation on Haiku (~$0.28 on Sonnet 4.6) — bounded by construction (iteration cap 3, history cap, honest-copy overflow), not by hope.
- **Blended (90% Q&A / 7% forms / 3% scheduling): ~$15 → ~$26 per 1,000 conversations.** Input tokens dominate (~2,300-token KB context re-sent per turn + client-passed history); output length is nearly irrelevant.
- **Later optimization:** Bedrock prompt caching for long flows requires restructuring prompts to system+messages format with `cache_control` breakpoints (mind Haiku's 4,096-token minimum cacheable prefix; keep per-turn state lines out of the cached prefix); expected 50–70% input-cost cut on 20-turn conversations. Verify `cache_control` support on the legacy `InvokeModelWithResponseStream` body shape with a live test before relying on it.
- **Latency:** Haiku stays on every user-facing streaming path (TTFT target <700ms); the action selector keeps its post-stream position with a ~500ms timeout + empty-array fallback; any Sonnet trial belongs on mid-flow form turns, not first-response Q&A.

---

## 7. Cross-references

- [`AGENTIC_FOUNDATIONS_PHASE_0.md`](AGENTIC_FOUNDATIONS_PHASE_0.md) — direction doc; amended by Phase 5 above.
- [`docs/V4_ARCHITECTURE_REVIEW.md`](../V4_ARCHITECTURE_REVIEW.md) — recommendations adopted here: shown-CTA memory (2.5), Step-3 timeout retention (§6), typed step contracts (4.0).
- `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/scheduling/TOOL_CATALOG.md` — the tool-governance format Phase 4 generalizes.
- `docs/roadmap/PII-Project/` — trace storage decision (4.11) conforms to the retention strategy; `pii-inventory.md` row lands with the 4.11 implementation PR, not this doc.
