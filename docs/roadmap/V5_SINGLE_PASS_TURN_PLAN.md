# V5 Single-Pass Conversational Turn — Build Plan

**Status:** ✅ PLAN COMPLETE — V5.1–V5.7 executed (lambda#388–#396, 2026-07-05); **soak RETIRED by the operator 2026-07-05** with verdict *"very close, if not on target"*. V5 runs on MYR384719 staging at `v5-turn.v3`. Follow-on work (prod promotion chain, KB content refinement, tail-status alarm) is tracked in §10's closing record — it is post-plan, per §8 non-goals.
**Owner:** Chris Miller
**Repo:** `Lambdas/lambda` (BSH = `Bedrock_Streaming_Handler_Staging/`); this doc lives in the picasso repo
**Supersedes:** the "session-state object + per-turn summarizer" branch of [`CONVERSATION_SESSION_STATE_DESIGN.md`](CONVERSATION_SESSION_STATE_DESIGN.md) §10 steps 2–4 (see §Relationship below)
**Standing directive:** adversarial review of EVERY step before executing it — re-verify this doc's premises against code (file:line cited throughout), try to refute each step's mechanism, prefer live empirical repro over inference. If a premise fails, amend this plan instead of executing it.

---

## 1. The problem, in one paragraph

Picasso decomposes one conversational judgment into separate machines: a response call writes the prose, then a *different* process (V4.1: topic classifier + tag taxonomy; V4.0: a second LLM call) picks CTA buttons, informed by machine tags round-tripped through the client. The words and the actions are decided by processes that cannot coordinate. Observed symptoms (all live-verified 2026-07-04/05): identical CTAs every turn, prose asking a fifth intake question while never proposing the next step, buttons that don't match what the reply just said, cross-program bleed requiring tag surgery. The 2026-07-05 fixes (Step 0 retrieval, 1b session-aligned pooling, 1a SESSION CONTEXT prompt block) fixed real defects and hold — but they are gears teaching a disassembled pipeline to approximate what one model call does natively.

## 2. The architecture

**One streaming call per turn produces the reply AND selects the actions.** The prompt carries: persona, KB grounding (unchanged), full short-session history, the action catalog (existing `cta_definitions`, ids + labels, tool-style), and the merged behavior rules (response rules + the V4.0 selector's restraint/commitment rules, which transfer nearly verbatim). The model streams prose, then emits a **marked action block** at the stream tail. The server strips the block from the visible stream, validates the IDs against config (validation logic already exists in `selectActionsV4`), and emits the **same `cta_buttons` SSE event the client already renders**.

- **Client: zero changes.** It already consumes `cta_buttons` as a separate SSE event (`StreamingChatProvider.jsx:267-271`, handler at `:874-883`).
- **Coherence by construction:** the same judgment writes "want to grab a discovery-session spot?" and attaches that button.
- **Latency:** TTFT unchanged (same streaming call); buttons arrive ~700–900ms *sooner* (no second model call — V4.1 classification measured 654–1965ms live).
- **What retires (for V5 tenants):** classifyTopic + selectCTAsFromPool + tag matching + the client topic round-trip as a *selection* mechanism. What stays everywhere: retrieval + grounding, deterministic ID validation, forms/scheduling flows, analytics, the eval net.

### Proposed tail format (validate in PR2 before committing)

```
...final prose sentence.
<<<ACTIONS ["query_discoverysession","apply_daretodream_volunteer"]>>>
```

Or `<<<ACTIONS []>>>` — the empty case must be common (restraint). Exact sentinel is PR2's decision; requirements: statistically improbable in prose, short, single-line, parseable with a bounded holdback buffer.

## 3. Verified as-is facts (re-verify before trusting; all confirmed live 2026-07-05)

- **Two near-identical handler blocks** in `index.js` — streaming (~360–1050) and buffered (~1140–1490). Every change lands in BOTH. (This bit us twice already.)
- The CTA path selection is an ordered if/else chain in both blocks (`index.js:952-1042` and `:1412-1484`): scheduling-handled → click-routing (`enhanceResponse`) → **V4.0 flag** → V4.1 topic_definitions → enhanceResponse fallback. The V5 branch gates ABOVE V4.0 in this chain *for the post-stream section*, but V5's real change is upstream: the response-call prompt construction + stream handling.
- The response stream is already fully buffered server-side as it streams (`responseBuffer`), and CTA events are written before `data: [DONE]` (`index.js:1030-1038`).
- `selectActionsV4` (`prompt_v4.js:978+`) builds the vocabulary as `id — label [INTENT]` lines from `ai_available` CTAs, `intentLabel()` maps action→LEARN/APPLY/VISIT/INFO/SCHEDULE, output validated against config ids, capped 4. The RULES text (restraint-first, commitment gate) is the transferable asset.
- `buildV4ConversationPrompt(userInput, kbContext, tonePrompt, conversationHistory, config, sessionContext)` (`prompt_v4.js:64+`): client-trimmed history (last 20 user + last 2 assistant turns), SESSION CONTEXT block when `accumulated_topics` present (1a, shipped), version constant `V4_CONVERSATION_PROMPT_VERSION = 'v4-conv.v2'`.
- **Eval gate discipline:** prompt-text change ⇒ bump the matching version constant ⇒ baselines go `stale_baseline` ⇒ PR re-captures via `node evals/run.js --update-baseline` (19-scenario baseline as of lambda#387). Harness: `evals/run.js` with injectable seams; scenario flags `run_action_selector` / `run_pool_selection`; per-scenario retry (`--retries`, default 2). CI job `chat-eval-net` in `pr-checks.yml` is path-gated (prompt_v4.js, scheduling/agentTurn.js, evals/**) and **must keep `environment: staging`** (repo-level AWS role is prod-614 without bedrock).
- Form mode (`handleFormMode`) and scheduling (`agentTurn`, click router) branches run BEFORE the normal chat path and are untouched by V5.
- **Staging widget config location:** `s3://myrecruiter-picasso-staging/tenants/MYR384719/MYR384719-config.json` (staging 525; BSH `S3_CONFIG_BUCKET` env — verified). NOT the bare `myrecruiter-picasso` replica. 5-minute in-memory config cache. Test tenant hash `my87674d777bf9`; currently has `V4_ACTION_SELECTOR: true` and both apply CTAs `ai_available: true` (Chris, 2026-07-05).
- Repo model: branch → PR to `main` → CI green (incl. live eval net) → merge (self-merge authorized when all green) → `deploy-staging.yml` auto-deploys touched Lambdas to staging 525. Prod promote is a separate gated dispatch — NOT part of this plan.

## 4. Design decisions (made; re-litigate only with evidence)

1. **Sentinel-tail structured output** over Bedrock tool-use blocks: keeps the plain-text streaming path and the byte-level chunk handling BSH already has. (If PR2's A/B shows the model can't hold the format ≥98%, revisit tool-use before building elaborate repair.)
2. **Holdback parsing:** never forward the last N bytes (N = max sentinel prefix length, ~12–20 chars) until they're provably not a sentinel prefix; on stream end, parse the tail, strip it, emit buttons. Pure function, unit-tested against chunk-boundary splits including sentinel split across 3 chunks, sentinel-like prose, empty actions, malformed JSON.
3. **Fail-soft ladder:** tail missing/unparseable → fall back to a `selectActionsV4` call (today's behavior, costs one extra call only on failure); validation drops unknown ids silently; never an error to the user; log a structured counter for the failure rate.
4. **Flag: `feature_flags.V5_SINGLE_PASS`** per tenant. Off ⇒ byte-identical current behavior (assert in tests). MyRecruiter test tenant first. V4.0/V4.1 paths remain for all other tenants — no migration pressure.
5. **New version constant** (e.g. `V5_TURN_PROMPT_VERSION`) added to `CURRENT_PROMPT_VERSIONS` in the eval runner so the stale-baseline gate covers the new prompt.
6. **The DDB session store + per-turn summarizer stay unbuilt.** Long-tail memory (20+ turn sessions) is the only thing V5 doesn't cover; revisit only with production evidence of long sessions suffering.

## 5. Phasing — focused sub-phases, one PR each, adversarial pass before each

House pattern (chat-opt 1.1–1.6): each sub-phase is a single-session-sized unit with explicit DONE criteria; do NOT start the next until the current one's DONE line is met. Run `/verify-before-commit` before every commit; merge own PRs when all checks green; every merge to main auto-deploys BSH to staging.

**V5.1 — Tail parser (pure module, unwired).**
Scope: new `streamTail.js` (or similar) with a chunk-feed API: feed(chunk) → text safe to forward now; end() → {remainingText, actionIds|null}. Sentinel spec decided here (documented constant). Holdback = max sentinel-prefix length, proven by construction.
Deliverables: module + exhaustive jest (sentinel split across 2 and 3 chunks; sentinel-like prose that never completes; empty `[]`; malformed JSON; no sentinel at all; sentinel then trailing garbage; unicode/emoji chunks).
DONE: suite green; nothing on the request path imports it; full BSH jest untouched-green.
*Adversarial focus: chunk-boundary math; prove the holdback can never leak sentinel text to the user nor swallow legitimate prose.*

**V5.2 — Merged prompt draft + format-discipline evidence (no wiring).**
Scope: draft the single-pass prompt (response rules + V4.0 selector rules transferred + catalog `id — label [INTENT]` + tail instruction). Scratchpad live script (1a A/B pattern, dev SSO), ≥20 samples across 3–4 conversation shapes.
DONE: sentinel present + valid JSON ≥98% of samples, else STOP and write up the tool-use alternative before proceeding. Numbers recorded in the PR/plan.
*Adversarial focus: try to make the model break format — long answers, emoji-heavy tenants, links in KB, the incident conversation.*

**V5.3 — Behavior evidence: restraint parity + commitment gate + funnel advance (no wiring).**
Scope: same script harness, behavior counts: (a) conversational/thank-you turns → `[]` (cta_04 parity); (b) first-interest turns → no APPLY/VISIT (cta_01 parity); (c) **Chris's real 4-turn "becoming a mentor" transcript → discovery/apply action + matching prose proposal by turn 3–4** (write the sustained-interest rule so (b) still holds).
DONE: all three measured and acceptable (≥ the V4.0 baselines for a/b; ≥80% for c), numbers recorded. This is the plan's GO/NO-GO gate.
*Adversarial focus: the tension between (b) and (c) — prove the rule wording separates "first interest" from "sustained interest" empirically, not by intuition.*

**V5.4 — Eval-harness support (dev/CI-only).**
Scope: `run_single_pass` scenario flag in `evals/run.js` — invoke the merged prompt via the live seam, run the V5.1 parser on the full response, ctas normalize to id strings (existing `ctas_*` assertions work); mutual-exclusion guard with the other two flags; new version constant added to `CURRENT_PROMPT_VERSIONS` staleness map.
Deliverables: runner change + jest (happy, malformed-tail→fallback semantics, dual-flag error).
DONE: runner suite green; no bundle impact (evals unreachable from index.js).
*Adversarial focus: the staleness gate actually fires for the new constant (demonstrate stale_baseline locally).*
*Amendments (tech-lead adversarial review 2026-07-05 — verified against code):*
- *The staleness change is **comparator logic, not a map edit**: `compareToBaseline` (`evals/run.js:285-308`) hardcodes three name-gated checks; adding a key to `CURRENT_PROMPT_VERSIONS` alone is a no-op. V5.4 must add `ranSinglePass` to `runScenario`'s result and a fourth branch `r.ranSinglePass && bv.single_pass !== currentVersions.single_pass` in the stale condition. (Good news, verified: name-gating means existing baselines do NOT go stale from the new key — no forced full re-capture in V5.4.)*
- ***No fallback rescue inside the harness:** `run_single_pass` scenarios score strictly on the parser's own output (`ctas = actionIds ?? []`). Routing malformed tails through a `selectActionsV4` fallback in the harness would mask exactly the format regressions V5.6's scenarios exist to catch; the fail-soft ladder is production-only.*
- ***CI:** add `Bedrock_Streaming_Handler_Staging/prompt_v5.js` to the `eval_gate` paths filter in `pr-checks.yml` (it's absent — V5.7's "tuning rides the eval gate" is not mechanically true until this lands). Note V5.4's `evals/**` change itself triggers live `chat-eval-net` (keeps `environment: staging`).*

**V5.5 — Wire it, flag-gated, BOTH handler blocks.**
Scope: when `feature_flags.V5_SINGLE_PASS`: build merged prompt, route the stream through the parser (holdback), emit validated `cta_buttons` (reuse selectActionsV4's id-validation), skip the post-stream selector section; fail-soft ladder (no/bad tail → one `selectActionsV4` call → else no buttons; structured log counter for tail-failure rate). Version constant bumped/introduced.
Deliverables: index.js changes in BOTH blocks + contract test pinning both call sites (the 1a source-pin pattern); flag-off byte-identity test (prompt and behavior identical to pre-V5 when flag absent); full jest.
DONE: full BSH suite green; flag-off identity asserted; form-mode + scheduling bypasses demonstrably untouched (existing tests still green).
*Adversarial focus: the two-blocks trap; SSE ordering (cta_buttons still before [DONE]); no sentinel text ever reaches the client (integration-style test through the mock stream).*
*Amendments (tech-lead adversarial review 2026-07-05 — verified against code; all are same-PR checklist items, not new phases):*
- ***The flag gates the prompt-swap AND the stream-loop parser unconditionally of which downstream branch owns CTAs.** The Bedrock call + text-forwarding loop (`index.js:814-848`, `:1295-1316`) run before the post-stream CTA chain; a scheduling-handled or click-routed turn on a V5 tenant would otherwise stream the literal sentinel to the widget. Test: V5 flag on + `action_chip_triggered`/scheduling-handled → SSE text contains no `<<<ACTIONS`.*
- ***`responseBuffer` must hold parser-forwarded (stripped) text, not raw deltas.** Five downstream consumers read it — `QA_COMPLETE` logging (`:862`), `runSchedulingTurn` (`:935`) and `runNewBookingEntry` (`:946`) which splice it into OTHER Bedrock prompts, `enhanceResponse` (`:960`), and the fail-soft `selectActionsV4` call itself. Test: none of the five ever sees the sentinel substring when V5 is on.*
- ***Insert the V5 branch BEFORE `V4_ACTION_SELECTOR`** (`:981`/`:1425`) in both chains — MYR384719 carries `V4_ACTION_SELECTOR: true`, so an appended-after branch makes the V5.7 flip a no-op. Regression test: config with BOTH flags true → V5 path wins.*
- ***The buffered handler has ~zero CTA-chain test coverage today** — `index.test.js` sets `global.awslambda` at module scope so every test drives only the streaming handler. V5.5 adds a `describe` block using the `cf_origin_wiring.test.js` pattern (unset `global.awslambda` + `jest.resetModules()`) driving `bufferedHandler` through V5 flag-on/flag-off. Without it "both call sites pinned" is aspirational.*
- ***`firstTokenTime` fires on first non-empty parser-forwarded text**, not raw delta arrival (holdback can make the first feed return `''`; the value feeds `response_time_ms` in session summaries `:914`).*
- ***Tail-failure counter schema defined here:** structured JSON log, e.g. `{type:'V5_TAIL_STATUS', status:'actions'|'no_sentinel'|'malformed', trailing_after_close, tenant_hash, session_id}` — V5.7's "counter ~0" DONE line is uncheckable without a greppable shape.*
- ***(retrospective review major #8) Empty catalog skips the ladder:** when `buildActionCatalogBlock(config)` is `''` (no ai_available CTAs), the V5 prompt is V4-identical and carries no tail instruction — `no_sentinel` is then the CORRECT outcome, not a failure. Skip the fail-soft `selectActionsV4` call entirely (it has no empty-vocabulary early-return, `prompt_v4.js:979-1033` — the ladder would burn a guaranteed-empty live model call every turn for such a tenant) and don't count it in the failure counter.*
- ***(retrospective review major #9) Version-stamp the production log:** `QA_COMPLETE` currently records only `{conversation, action_selector}` versions — V5 turns must also stamp `V5_TURN_PROMPT_VERSION`, else a `prompt_v4.js` text change reaching live V5 traffic through the splice-reuse is invisible in CloudWatch (CI's staleness gate covers it pre-merge; production observability needs the stamp).*

**V5.6 — Scenarios + baseline.**
Scope: new eval scenarios — 4-turn funnel-advance lock (from Chris's transcript), restraint lock (conversational turn → `[]`), commitment lock (first interest → no APPLY/VISIT), incident cross-program locks re-expressed for V5; re-capture baseline under the new version constant.
DONE: new scenarios ≥3× stable live at `--retries 0`; full net green with re-captured baseline; CI `chat-eval-net` green on the PR.
*Adversarial focus: fixture design such that assertions hold under classification/stochastic variance (the context_02 discipline).*

**V5.7 — Enable on the test tenant + soak + tune.**
Scope: flip `V5_SINGLE_PASS` on MYR384719 in `s3://myrecruiter-picasso-staging/...` (Config Builder staging flow; operator-visible). Chris eyeballs the two canonical transcripts (two-message incident; 4-turn funnel). Prompt tuning iterations ride the eval gate (bump → re-capture) — never tune without a scenario locking the improvement.
DONE: Chris's verdict on both transcripts; tail-failure counter ~0 in staging logs; latency spot-check (buttons ≤ V4.0).
*Prod promote is a separate, gated decision — explicitly NOT part of this plan.*
*Amendments (tech-lead adversarial review 2026-07-05):*
- *BSH's 5-minute in-memory config cache means a transcript test within 5 min of the S3 flag flip can show stale pre-V5 behavior — wait out the TTL (or use the nocache path) before judging the flip "not working".*
- *Latency spot-check measures time-to-`cta_buttons`-event minus time-to-last-text-event (that's where the ~700–900ms win lives). TTFT is unaffected; the holdback delays the final ≤9 chars of prose by milliseconds only.*

**V5.0b (optional, parallel, only if a demo needs it before V5.5) — V4.0 funnel-advance tune:** CLOSING rule + selector sustained-interest guidance; the text transfers into the V5.2 prompt. Skip if V5 is landing fast enough.

## 6. Success criteria (verifiable)

- Chris's 4-turn transcript: by turn 3–4 the reply *proposes* the concrete next step in prose AND attaches the matching button (discovery/apply), coherently.
- The two-message incident transcript: stays fixed (mentoring-anchored answer + closing question; no cross-program buttons).
- Conversational/thank-you turns: zero buttons (restraint parity, cta_04 lock).
- First-interest turns: no APPLY/VISIT (cta_01 lock).
- Format discipline ≥98% live; fail-soft covers the remainder invisibly.
- TTFT unchanged; buttons latency ≤ V4.0 (should improve ~700ms+).
- Flag off ⇒ byte-identical behavior (test-asserted). Full jest green; 19+ scenario eval baseline green in CI.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Model format discipline < 98% at temp 0.35 | PR2 evidence gate BEFORE wiring; fallback ladder; revisit tool-use if it fails |
| Sentinel split across chunks / sentinel-like prose | PR1 pure parser + exhaustive boundary tests; distinctive sentinel |
| One prompt doing two jobs degrades response quality | Eval net (grounding/safety scenarios all re-run under the new version constant); A/B samples read by a human |
| Two-handler-blocks divergence | Contract tests (the 1a source-pin pattern); checklist item in every PR |
| Scope creep toward "general agent" | Non-goals below; this is two calls → one call, nothing else |

## 8. Non-goals

No agent loop, no multi-step tool execution, no DDB session store, no cross-session memory, no client changes, no V4.x removal (other tenants keep running them), no prod deploy in this plan.

## 9. Relationship to existing docs

- [`CONVERSATION_SESSION_STATE_DESIGN.md`](CONVERSATION_SESSION_STATE_DESIGN.md): steps 0/1a/1b shipped and stand (they fix V4.1 tenants and taught the mechanics); the gated steps 2–4 (store + summarizer + stage machine) are **superseded by this plan** — V5 makes the model's own read of the full conversation the session state. The store remains a future option only for long-tail memory with production evidence.
- [`CHAT_EXPERIENCE_OPTIMIZATION.md`](CHAT_EXPERIENCE_OPTIMIZATION.md): Phase-2 naturalness lanes fold into the V5 prompt work; Phase-5 "general agent" remains deferred and is NOT this.
- Known open follow-ups that V5 dissolves for V5 tenants: ambiguous-topic tag poisoning, shown-CTA dedup (1c — feed shown CTAs into the turn context instead), tag reachability lint (still worth doing for V4.1 tenants if any remain long-term). Groundedness-judge conversation-context extension is still wanted (eval infra, path-independent).

## 10. Execution evidence log (2026-07-05)

### V5.1 — DONE (lambda#388, merged `32cb210`)

`streamTail.js` chunk-feed state machine + 41-test suite (100/100/100/100 coverage, ratcheted); unwired (contract test pins `index.js` not importing it). Amendments vs the sketch, both additive:
- `end()` returns a third field `status` (`actions` / `no_sentinel` / `malformed`) so the V5.5 fail-soft ladder can count failure modes separately.
- An early draft's block-size cap was **removed**: it made the parser's output chunking-dependent, and newline-divergence + end-of-stream already bound every real swallow case. The parser is chunking-invariant by construction (test sweeps every chunk size 1..n per corpus, incl. surrogate-pair splits).
- Sentinel spec (single source of truth in the module): `<<<ACTIONS ["id",...]>>>`, single line; `[]` = deliberate restraint. Holdback bound: 9 chars.

### V5.2 — DONE, HARD GATE PASSED (lambda#389, merged `ae37cec`)

`prompt_v5.js`: `buildV5TurnPrompt` **reuses** `buildV4ConversationPrompt` (contract-tested splice on the `━━━ USER MESSAGE ━━━` marker) + action catalog (`id — label [INTENT]`, ai_available) + transferred V4.0 selector rules + a new COHERENCE rule + machine-read ACTION TAIL instruction (placed last, recency bias). `V5_TURN_PROMPT_VERSION = 'v5-turn.v1'`.

**Format gate (≥98%): 30/30 = 100%** — live Haiku 4.5, temp 0.35, real staging MYR384719 catalog (14 ai_available CTAs), 5 shapes × 6 (cold start / 2-msg incident / 4-turn funnel / thank-you-no-KB / comprehensive+generous-emoji+links adversarial). Zero sentinel leaks, zero max_tokens truncations, zero unknown ids, zero trailing-prose-after-tail.

Empirical corrections found en route:
- Haiku 4.5 **rejects `temperature`+`top_p` together** (live ValidationException). Production only ever sends `temperature`+`max_tokens`; `V4_STEP2_INFERENCE_PARAMS`' top_p/top_k are documentation-only. `V5_TURN_INFERENCE_PARAMS = {temperature: 0.35, max_tokens: 700}` — +100 headroom so a cap-stop can't truncate the sentinel (§7 risk, now mitigated + measured 0/30).

### V5.3 — MEASURED, ALL BARS MET — awaiting operator GO/NO-GO

Same live harness; V4.0 baselines measured on the SAME fixtures (V4 arm = real `buildV4ConversationPrompt` response + real `selectActionsV4`, as production runs them).

| Gate | Fixture | V5 | V4.0 baseline | Bar | Verdict |
|---|---|---|---|---|---|
| (a) restraint | cta_04's exact eval fixture (thank-you) | **10/10 `[]`** | 6/6 | ≥ V4.0 | ✅ parity |
| (b) commitment | cta_01's exact eval fixture (first interest) | **10/10 no-APPLY** | 6/6 | ≥ V4.0 | ✅ parity |
| (c) funnel-advance | 4-turn reconstruction, turn 4 ("I just want to get started") | **10/10** proposal+button | 6/6 | ≥80% | ✅ |
| (c-soft) funnel-advance | softer turn 4 ("I think I'd really be good at this") | **10/10** | 5/6 | (addendum) | ✅ |

Notes for the GO/NO-GO reviewer:
- **The 4-turn transcript is a reconstruction** — the verbatim original was not preserved in docs/memory; shapes rebuilt from its documented characterization (retiree, "life's wisdom to share", bot asked a 5th intake question). Confirm or supply the real transcript; the harness re-runs in minutes.
- **Turn 3 does not advance** (0/10 both arms): at turn 3 the user is sharing motivation, not asking to proceed; V5's turn-3 prose stays warm + on-program and keeps exploring. Advance lands at turn 4 in 20/20 V5 runs (hard + soft). Reading of "by turn 3–4": met.
- **Deliberate nuance:** on soft sustained interest, 3/10 V5 runs offered the APPLY link *alongside* discovery — with prose explicitly proposing both ("attend a session first, or jump straight into the application?"). This deviates from V4.0's strict commitment gate exactly when the model's own prose proposes the step — i.e. the coherence-by-construction behavior working. Flagging rather than suppressing; if unwanted, one rule line reverts it.
- The focused KB fixture ("first step is attending a discovery session") helps both arms; the real-retrieval discrimination happens at V5.7 soak on staging.

**Stop point:** V5.4+ does not start until the operator's GO/NO-GO on this table.

### V5.4 — DONE (lambda#392, merged `8c59336`)

`run_single_pass` scenario support in the eval harness, per the amendments:
- Staleness gate implemented as **comparator logic**: `ranSinglePass` on the run result + a fourth name-gated branch in `compareToBaseline` (`bv.single_pass !== currentVersions.single_pass`); `CURRENT_PROMPT_VERSIONS` gains `single_pass: V5_TURN_PROMPT_VERSION`. Test-pinned: pre-V5.4 baselines (no `single_pass` key) do NOT stale for classic scenarios — and the PR's own live `chat-eval-net` run confirmed the 19-scenario baseline stayed green with no re-capture.
- **Strict scoring, no fallback rescue in the harness**: `ctas = tail.actionIds ?? []`; a malformed tail is a VISIBLE failure (test-pinned: zero selector calls on the malformed path). Scored `responseText` is the stripped prose.
- `eval_gate` CI filter gains `prompt_v5.js` **and** `streamTail.js` (the amendment named prompt_v5.js; streamTail.js added under the filter's stated purpose — a parser-semantics change like lambda#390 changes single-pass eval outcomes). `chat-eval-net` keeps `environment: staging`.
- `stale_baseline` demonstrated **end-to-end through the real CLI** (live Bedrock): one-scenario `--update-baseline` capture stamped `v5-turn.v1` (exit 0) → baseline stamp rewound to `v5-turn.v0` → rerun reported `stale_baseline`, exit 1.

### V5.5 — DONE (lambda#393, merged `7632cf2`)

`V5_SINGLE_PASS` wired into BOTH `index.js` handler blocks; flag off ⇒ byte-identical (test-asserted: sentinel-shaped prose passes through unstripped, V4 prompt + params, no V5 logs, no `single_pass` QA stamp). All four review blockers + majors landed as test-pinned behavior (`__tests__/v5_wiring.test.js`, 15 handler-level tests through scripted Bedrock streams):
- Flag-only gating of prompt-swap + stream-loop parser — scheduling-handled and click-routed turns on a V5 tenant leak no sentinel (asserted).
- `responseBuffer` = parser-forwarded text — QA_COMPLETE, `runSchedulingTurn`, `enhanceResponse`, and the fail-soft `selectActionsV4` prompt each asserted sentinel-free.
- V5 branch BEFORE `V4_ACTION_SELECTOR` in both chains; both-flags-true tests prove V5 wins (zero second-model-calls). Source pins: `buildV5TurnPrompt` call sites ×2, `createTailParser()` ×2, ordering ×2 (the V5.1/V5.2 unwired-contract tests flipped to wired pins).
- Buffered handler gained real CTA-chain coverage (cf_origin_wiring pattern: unset `global.awslambda` + `jest.resetModules()` + fresh SDK mock).
- `firstTokenTime` on first NON-EMPTY forward; no empty text frames; end-flush NO-SWALLOW (a stream ending in a live sentinel prefix forwards the held prose — both blocks).
- Empty catalog skips the ladder AND the counter (major #8); `QA_COMPLETE` stamps `single_pass` on V5 turns (major #9); `V5_TAIL_STATUS` log shape `{status, trailing_after_close, tenant_hash, session_id}`.
- Fail-soft ladder: valid tail → shared `validateActionIds` (selectActionsV4's known-ids + cap-4, one implementation exported from prompt_v5.js); `[]` = restraint, no fallback; no/bad tail → ONE `selectActionsV4` call. `cta_buttons` before `[DONE]` in both blocks.
- No prompt-text change ⇒ `V5_TURN_PROMPT_VERSION` stays `v5-turn.v1`. Full BSH suite 38/38 suites, 1237/0. (One `chat-eval-net` flake on the PR: `context_01` judge UNGROUNDED ×3 on the pure-V4 path — versions identical to baseline, evals unreachable from index.js, same net green an hour earlier; rerun green.)

### V5.6 — DONE (lambda#394)

Four `run_single_pass` lock scenarios at the real 14-CTA catalog scale with the hard-KB fixture (configs embed `evals/evidence/v5/myr_catalog_fixture.json`; KB/history lifted verbatim from `run_evidence.js`): restraint (thank-you → valid empty tail), commitment (first interest → none of the 9 APPLY/VISIT-class ids), funnel-advance (explicit get-started turn 4 → discovery OR application via new `ctas_include_any`), incident cross-program (mentoring-anchored, no Love Box buttons). Two runner assertion types added: `ctas_include_any` (OR-inclusion) and `tail_status` (the format lock — `ctas_empty` alone cannot distinguish `<<<ACTIONS []>>>` restraint from a malformed tail; fails loudly outside `run_single_pass`). Stability: **all four scenarios 3/3 consecutive live runs at `--retries 0`** before baselining. Baseline re-captured deliberately: 23/23 pass, all entries stamped with the four version constants; post-capture comparison all-`ok`; CI `chat-eval-net` green on the PR. Full suite 38/38, 1240/0. The ~12% soft-turn intake-loop residual remains the V5.7 tuning target (the funnel lock pins the explicit-commit case; tuning for the soft case must add its own scenario before bumping the version).

### V5.7 — EXECUTED (2026-07-05): flip + four soak rounds + two operator-directed tunes

**Flip:** Chris enabled `V5_SINGLE_PASS` on MYR384719 via the staging Config Builder (the flag was exposed in the builder same-day, config-builder#76; staging↔prod config isolation was verified and hardened first — staging builder writes the staging bucket, prod→staging tenant replication severed, picasso#707 + prod-side rule removal).

**Soak round 1 (v5-turn.v1):** 7-turn funnel — 7/7 valid tails, 0 malformed/trailing/fail-soft, `single_pass` stamped, buttons with stream end (no second call). Restraint held; APPLY only at explicit "Yes". Verdict: *"overall I really like this process"* — but **APPLY should come 1–2 turns earlier** → **tune v2 (lambda#395)**: `SUSTAINED INTEREST → ADVANCE` rule + coherence strengthened ("ready to proceed?" prose attaches the step action, not a learn chip). Live A/B 120 samples: soft sustained-interest 9/15→15/15, the live-soak turn 4/15→15/15, guards 30/30, format 0/120.

**Soak round 2 (v2) — REGRESSION FOUND:** the bot *manufactured* an intake loop (taxonomy question every turn; terse user answers "Life skills"/"Understanding money"); v2 discounted answers-to-its-own-questions — 5 turns, no advance, last 2 turns zero actions (log-verified on v2). **Fixture lesson recorded: A/B shapes must include bot-driven menu-loops with terse answers, not just user-volunteered statements.** → **tune v3 (lambda#396)**, iterated live on the exact transcript: rules-only turn budget REFUTED (0–1/15 — the model cannot count its own questions); model-counted check partial (buttons 12–15/15, prose 2–6/15); **server-counted, engagement-conditioned TURN CHECK** (`countAssistantQuestions` ≥ 2 → high-recency block naming the count; reply must END inviting the concrete step) → **15/15 + 15/15**, and the new-mechanism guard caught + fixed a goodbye-overshoot (APPLY pushed 10/10 on a sign-off → 0/10 after conditioning). Baseline 25/25 @v3; six `v5_*` scenarios ×3 stable at retries 0. Design ruling (Chris challenged "intent or turn count?"): the counter measures the BOT's behavior (question etiquette), never the user's intent; it exists because the judgment-only version measurably failed; discipline recorded — deterministic mechanisms must be bot-facts, empirically forced, and deletable.

**Soak rounds 3–4 (v3) — VERDICT: *"just about perfect… very close, if not on target."*** Rich-statement run: advance arrived turn 5 via the backstop; turn-3 "I had one, and I'd like to be one" was an intent miss (open nitpick below). Explicit runs: "How do I apply?" → immediate process answer + discovery CTA (restraint on the preference turn); "i'm ready" → proposal + discovery CTA, full coherence. Tail health across all soak windows: 100% valid, 0 malformed, 0 fail-soft.

**Open items out of the soak (identified, deliberately NOT executed):**
- *v4 lever (Chris: "might be a nitpick"):* broaden explicit-commitment recognition to first-person volunteering phrasing ("I'd like to be one") so intent advances at the moment it's voiced, not via the backstop. Scenario-first loop ready.
- *Dual-attach question:* on an explicit "how do I apply", consider locking discovery + application both attached (the V5.3 dual-action coherence nuance).
- *KB hygiene:* internal curriculum jargon ("Milestone 9") leaked into user prose — KB refinement item, not V5.
- Two-message incident transcript never explicitly re-run live under V5 (eval lock `v5_incident_01` covers it; no bleed observed in any soak run).

**SOAK RETIRED (operator, 2026-07-05) — plan closed.** Post-soak addendum: a v4 role-declaration tune was attempted on the turn-3 nitpick and deliberately NOT shipped — a 200-sample A/B showed v3 already passes the shape 15/15 on fixture KB and 14/15 against the ACTUAL retrieved chunks (pulled live), i.e. the live miss was a ~1-in-15 stochastic tail that the question-budget backstop caught by design. Root cause of the tail: intent-flavored queries retrieve philosophy chunks with no next-step content → reclassified to **KB content refinement** (add/strengthen process chunks; also scrub "Milestone 9"-style internal jargon). The incident-shape transcript closes as covered by the `v5_incident_01` eval lock (green 3×; no cross-program bleed in any soak round) per the operator's soak-retirement call.

**Follow-on (post-plan, all gated unless noted):** BSH prod dispatch (carries V5 + tunes + the staging-only stack since last promote; V5 arrives dormant — no prod config carries the flag); a designed tenant-config promotion mechanism (staging→prod — the born-in-staging model has no tooling yet); config-builder prod promote (if-match/etag CORS prereq); per-tenant rollout; KB content refinement (not gated — content pipeline); `V5_TAIL_STATUS.malformed` metric-filter + alarm before prod traffic (staging side not gated); groundedness-judge conversation-context extension (eval infra). Parked by operator: dual-attach on explicit apply-asks; dynamic chips (shrink-the-catalog hybrid agreed as direction).

### Tech-lead adversarial review of V5.4–V5.7 (2026-07-05, Chris-requested)

Verdict: **direction sound, not executable as written** — 4 blockers, 4 majors, 3 minors, all same-PR amendments (no redesign, no new phases). All amendments are folded into the V5.4/V5.5/V5.7 bullets above (§5). Blockers, one line each:
1. The sentinel-strip/prompt-swap gate must be flag-only at the stream loop, not "in the CTA chain" — else scheduling/click-routed turns on a V5 tenant leak the sentinel to the widget.
2. `responseBuffer` must hold stripped text — five consumers (QA logging, two scheduling Bedrock prompts, enhanceResponse, the fallback selector) would otherwise ingest raw sentinel.
3. V5 branch inserts BEFORE `V4_ACTION_SELECTOR` — MYR has that flag true; appended-after = the V5.7 flip does nothing.
4. The eval staleness gate is comparator logic (`ranSinglePass` + fourth branch in `compareToBaseline`), not a map edit — and (verified) existing baselines do NOT go stale from the new key.

Majors: eval_gate CI filter lacks prompt_v5.js; buffered handler has ~zero CTA-chain coverage (module-scope `global.awslambda` pins every index.test to the streaming handler); harness must not use the production fallback ladder; `firstTokenTime` stamps pre-parser. Key claims spot-verified against `evals/run.js:285-308` and `pr-checks.yml:104-107` before folding in.

### Retrospective adversarial review of V5.1–V5.3 (2026-07-05, Chris-requested) — and the corrections it forced

Verdict on the executed work: **one shipped-code defect, and the recorded evidence was weaker than its framing.** Both corrected same-day:

**Code fix (lambda#390, merged):** the V5.1 parser's last-VALID-wins semantics meant a valid sentinel followed by a malformed second attempt served the stale first capture while reporting `status:'actions'` — a failure class structurally invisible to the exact fail-soft counter V5.5/V5.7 depend on. **New semantics: the LAST marker attempt decides** (valid→malformed = `malformed`, fallback fires; malformed→valid = the correction is served). Also added `trailingAfterClose` to `end()` so out-of-spec prose after a valid close (deliberately forwarded, previously invisible to `status`) is separately countable.

**Evidence re-run (lambda#391, committed to `evals/evidence/v5/` — reproducible from the repo):** hard KB fixture (discovery session NOT framed as "the first step"), strict sentence-level proposal judge, real 14-CTA catalog scale, n=150 format samples, word-count tracking, exact Clopper-Pearson bounds. **The table below SUPERSEDES the V5.3 table above** (whose fixtures were too easy to discriminate and whose n couldn't certify its bars):

| Gate | V5 | 95% CP lower | V4.0 | Verdict |
|---|---|---|---|---|
| Format (bar ≥98%) | **150/150** | **98.0%** | n/a | ✅ bar *certified*, not just consistent-with |
| Restraint, thank-you, **14-CTA scale** | **25/25** | 89% | **7/10** | ✅ V5 discriminates — V4.0 pads buttons at catalog scale |
| First-interest no-APPLY/VISIT, 14-CTA scale | **25/25** | 89% | 10/10 | ✅ parity |
| Funnel-advance, **hard KB**, strict judge | **20/25 (80%)** | 62% | **9/15 (60%)** | ⚠️ bar met at point estimate only; V5 +20pts over V4.0 |

Funnel hand-review (all 25 transcripts, recorded in the pack's README): 2 of 5 strict-judge failures are judge false-negatives (coherent `query_process` advance with matching prose → 22/25 = 88% hand-count); 3 of 25 (~12%) are true intake-loop non-advances — the exact defect class V5.7 prompt tuning targets, now with a committed fixture to tune against. Word-limit compliance unaffected by the tail instruction (medians within 1 word of V4.0 on every shape — closes major #6 of the forward review). The earlier V5.3 notes stand: the 4-turn conversation is still a reconstruction (operator confirm/replace at GO/NO-GO), and the soft-commitment dual-action nuance remains a deliberate judgment call.
