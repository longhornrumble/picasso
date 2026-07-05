# V5 Single-Pass Conversational Turn — Build Plan

**Status:** Approved direction, not yet started (Chris go-ahead 2026-07-05)
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

**V5.5 — Wire it, flag-gated, BOTH handler blocks.**
Scope: when `feature_flags.V5_SINGLE_PASS`: build merged prompt, route the stream through the parser (holdback), emit validated `cta_buttons` (reuse selectActionsV4's id-validation), skip the post-stream selector section; fail-soft ladder (no/bad tail → one `selectActionsV4` call → else no buttons; structured log counter for tail-failure rate). Version constant bumped/introduced.
Deliverables: index.js changes in BOTH blocks + contract test pinning both call sites (the 1a source-pin pattern); flag-off byte-identity test (prompt and behavior identical to pre-V5 when flag absent); full jest.
DONE: full BSH suite green; flag-off identity asserted; form-mode + scheduling bypasses demonstrably untouched (existing tests still green).
*Adversarial focus: the two-blocks trap; SSE ordering (cta_buttons still before [DONE]); no sentinel text ever reaches the client (integration-style test through the mock stream).*

**V5.6 — Scenarios + baseline.**
Scope: new eval scenarios — 4-turn funnel-advance lock (from Chris's transcript), restraint lock (conversational turn → `[]`), commitment lock (first interest → no APPLY/VISIT), incident cross-program locks re-expressed for V5; re-capture baseline under the new version constant.
DONE: new scenarios ≥3× stable live at `--retries 0`; full net green with re-captured baseline; CI `chat-eval-net` green on the PR.
*Adversarial focus: fixture design such that assertions hold under classification/stochastic variance (the context_02 discipline).*

**V5.7 — Enable on the test tenant + soak + tune.**
Scope: flip `V5_SINGLE_PASS` on MYR384719 in `s3://myrecruiter-picasso-staging/...` (Config Builder staging flow; operator-visible). Chris eyeballs the two canonical transcripts (two-message incident; 4-turn funnel). Prompt tuning iterations ride the eval gate (bump → re-capture) — never tune without a scenario locking the improvement.
DONE: Chris's verdict on both transcripts; tail-failure counter ~0 in staging logs; latency spot-check (buttons ≤ V4.0).
*Prod promote is a separate, gated decision — explicitly NOT part of this plan.*

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
