# Attribution AI Narrator — Implementation Plan (PARKED)

**Status: PARKED — approved in principle 2026-07-18; execution blocked on the operator's attribution-dashboard QA pass reaching a final state.**
**Author: Claude (design session with Chris, 2026-07-18). Adversarial review: tech-lead pass incorporated (see §13).**

---

## 1. Purpose — the ROI bar

Attribution is the ROI story of the MyRecruiter platform (operator, 2026-07-18):

> "Attribution is the ROI of the whole MyRecruiter platform. It's quantifying, for a marketing person, where they're marketing and how effective it is at converting something — donations, sign-ups, volunteers. If we can show that in a very meaningful way… somebody is going to be able to easily see that I'm paying $300 a month for MyRecruiter, but I'm getting 10 times that value. That is the bar: 10x return on whatever you're paying."

The narrator's job is to make that 10x *legible*: a monthly, plain-English, provably-accurate account of what the org's channels produced (leads, sign-ups, donations-intent, volunteers), what changed, and the one thing worth doing next — written so a nonprofit director repeats it to their board.

## 2. Why replace rule pack v1

The current insight system (`Analytics_Dashboard_API/attribution_rules.py`, WS-D "rule pack v1") is four static rules (`worth_a_look`, `double_down`, `mint_prompt`, `too_early`). Assessment (2026-07-18, operator concurring):

- **State-driven → wallpaper.** Monthly aggregates barely move; the same sentence renders for months. Users learn the slot says nothing new and stop reading it.
- **Wrong altitude.** `double_down`/`worth_a_look` are channel-budget-reallocation advice. Small nonprofits don't reallocate channel spend; they fix forms, follow up leads, and print flyers.
- **`mint_prompt` is the keeper** — it detects a gap and names a button. That is the template for all future advice.
- Below the C7 floor the only possible output is "not enough data yet" — forever, for exactly the small-org customer base. See §8.

### 2b. Prior art that MUST be reconciled: Attribution_Recap_Generator (adversarial finding #1)

`Lambdas/lambda/Attribution_Recap_Generator` is a **live** Lambda that already reads the same C5 aggregates, embeds the same C7 constants, runs monthly, and emails tenants a deterministic narrative (variant selection: `first_month`/`small_tenant`/`bad_month`/`good_month`, MVP-channel, superlatives). Two independent narrative surfaces describing the same month can contradict each other — fatal to the "provably accurate ROI story."

**Decision required at Phase 0 (recommendation):** the narrator's validated fact sheet + observations become the **single narrative source for both surfaces** — the dashboard renders it, and the recap email's copy is generated from the same validated object (Recap Generator keeps its sending/formatting role, retires its own variant/superlative selection). Until that migration lands, the eval suite carries a **cross-surface consistency fixture**: recap copy and narrator claims for the same fact sheet must not contradict.

## 3. Architecture — interpretation, not retrieval

This is deliberately NOT the conversation pipeline. Conversations are a retrieval problem (query → Bedrock KB vector search → answer grounded in retrieved text). The narrator is an **interpretation problem**: the entire fact universe is ~1–2 KB of numbers we assemble deterministically. Nothing is searched; the model's job is *salience* — which three of the two hundred true statements matter this month — not recall.

Trust chain: **code picks the facts → model picks what's salient → code re-proves every claim → versioned prompt + eval set pin behavior → deterministic fallback when any link fails.** The model is never the source of a number, only of the choice and phrasing.

Pattern precedent: the V5 single-pass turn (current conversation architecture, `v5-turn.v3`) — one focused call returning structured output inside hard rails. This is "V5 for analytics." (V4 Action Selector is the prior generation of the same idea; cite V5 conventions, not V4.)

### Pipeline (five steps)

1. **Trigger** — background, never at page view. **Own EventBridge rule → own Lambda invocation** (adversarial findings #2/#3): NOT inline in the hourly `Attribution_Aggregator` loop — a slow/throttled Bedrock call must never be able to time out the job that owns the C5 aggregates, and hourly hash-drift would defeat a hash-based weekly throttle. Cadence is enforced by the schedule itself: **weekly refresh of the current month + final generation on day 4+ after month close** (after the aggregator's ~72h prior-month finalization window — finding #4). The fact-sheet hash is a skip-if-unchanged safety, not the cadence mechanism; the narrative write is a **DynamoDB conditional write on the stored fact-sheet hash** so racing invocations can't double-spend Bedrock calls (finding #6).
2. **Fact sheet** — deterministic Python assembles compact JSON (see §4). Every number computed by code before the model exists.
3. **One model call** — current cheapest Haiku tier (same family the V5 turn uses; resolve exact model id at implementation). Prompt `narrator.v1` (versioned like `v5-turn.v3`). Structured output only.
4. **Validate** — pure-function validator recomputes every cited figure from the same fact sheet (§6). Claims that fail are dropped; if the headline fails → one regeneration → deterministic fallback.
5. **Store + serve** — narrative row written next to the C5 aggregates; dashboard renders statically with an "as of" stamp. Zero model calls and zero added latency at read time.

## 4. Fact sheet (input contract)

Assembled from existing readers (no new data plumbing):

| Block | Source (already exists) |
|---|---|
| Current-month summary + per-channel rows (conversations, engaged, applications, leads) | C5 rows via `attribution_api.py` readers |
| Prior-month same blocks (deltas computed by code, included precomputed) | same |
| Form funnel: per form, started vs completed; per-step drop-off counts | **NEW C5-style monthly row written by Attribution_Aggregator** (finding #7: the existing tile reader `fetch_form_bottlenecks_from_dynamo` is a paginated full-range GSI query with client-side filtering — too heavy to re-run per generation; pre-aggregating keeps one-writer-per-surface and makes the fact-sheet read a cheap single-item get) |
| Lead pipeline counts by status | forms-submissions pipeline readers |
| Entry points + reach (scans/clicks) | entry-point rows / registry |
| Tenant vocabulary: program names, form titles | tenant config (names only) |

Hard exclusions: transcripts, names, emails, phones, per-person lead records, free-text answers. **Aggregates and titles only** — this is the PII guardrail by construction (input cannot leak what it never contains). ai-governance-advisor + pii-data-lifecycle-advisor pass at Phase 0 of implementation per CLAUDE.md routing (feature "generates AI summaries" — about aggregates, never a person; the plan makes that structural).

**Tenant vocabulary is untrusted input** (finding #5): program names and form titles are tenant-admin-controlled strings and could carry instruction-injection payloads that steer phrasing while still passing numeric validation. Defenses: vocabulary is embedded in an explicitly delimited data block with a system instruction that its contents are data values, never instructions; length caps + control-character/injection-marker rejection at fact-sheet assembly (mirroring the mint service's input-guard precedent); the eval suite includes a poisoned-vocabulary fixture asserting the output ignores embedded instructions.

## 5. Output contract

```json
{
  "narrator_version": "narrator.v1",
  "generated_at": "<iso>",
  "month": "YYYY-MM",
  "headline": "one sentence",
  "observations": [
    {
      "text": "one sentence",
      "numbers_used": [{"path": "funnel.mentor_application.step_drop.references", "value": 9}]
    }
  ],
  "suggested_action": {"action_id": "review_form_fields", "params": {"form_id": "mentor_application"}, "text": "one sentence"} ,
  "quiet_month": false
}
```

- 1 headline, 2–3 observations, **at most one** suggested action, all ≤ ~25 words each.
- `numbers_used` paths must resolve into the fact sheet — that is what the validator recomputes.
- `quiet_month: true` is a legitimate, honest output ("steady month; nothing needs your attention").
- Delivered via a forced tool-call / JSON schema (same mechanism as the V5 turn's structured output).

## 6. Validator (the non-negotiable layer)

Pure function, no I/O, exhaustively unit-tested. Rejects any claim where:

1. A `numbers_used` path does not resolve in the fact sheet, or the cited value ≠ the fact-sheet value.
2. A derived figure in `text` (percentage, delta, multiple) does not recompute from the cited numbers within rounding tolerance.
3. A **percentage or comparative claim** cites a denominator `n < 50` (C7 as machine-constraint — §8). Counts ("9 of 24") are always allowed.
4. `text` matches causal/predictive patterns (crude but effective deny-list: "because", "caused", "will increase", "should double", etc.). The action menu makes causal claims unnecessary.
5. `suggested_action.action_id` is not in the menu, or params don't validate.

Behavior: drop failing observations; if headline fails or all observations drop → regenerate once with the failures appended to the prompt → else **skip the write entirely** (finding #8: no narrative row means the API returns `narrative: null` and the UI naturally falls back to the legacy `insight` line — one fallback mechanism, not two; the eval suite carries a fixture exercising this path). Log every rejection (CloudWatch metric: `narrator_claims_rejected`) — a rising reject rate is the drift alarm.

## 7. Action menu v1 (closed vocabulary)

| action_id | Renders as | Fires when sensible |
|---|---|---|
| `mint_entry_point` | "Create a short link for X to start measuring reach" | channel/placement with no minted link (port of rule-pack `mint_prompt`) |
| `review_form_fields` | "Review the {step} question on {form} — that's where people stop" | funnel step drop-off |
| `follow_up_new_leads` | "You have N new leads waiting in the workspace" | pipeline `new` count |
| `share_channel_link` | "Your {channel} link converts well — use it in the next newsletter/flyer" | strong converter with reach mechanism |
| `none` | (no action rendered) | quiet months |

Menu extensions are contract changes (PR + eval additions), never prompt-side.

## 8. C7 amendment (FROZEN_CONTRACTS.md)

Current C7 conflates two things. Amended (operator direction, 2026-07-18):

- **Human display: never suppressed.** Channel/entry-point rates render at every n as `rate% · leads of conversations` ("25% · 5 of 20"); below 50, add a small "early" cue (muted style + tooltip: "Based on N conversations — expect this to settle as volume grows"). `rate_held` stays in the API for the cue but stops meaning "hide".
- **Machine claims: floor stays.** The narrator/validator (§6.3) and any future automated comparison must not emit percentage/comparative claims under n=50; counts always allowed.

Separable UI PR (ChannelRow, OutcomesTable, EntryPointTable currently render "—"): ~0.5 session, do alongside Phase 3.

## 9. Storage / API / UI

- **Storage**: sibling row in `picasso-attribution-aggregates` — pk `TENANT#{tenant_id}`, sk `METRIC#narrative#{YYYY-MM}`; body = validated output + fact-sheet hash. Forward-compatible readers (`.get`) per schema discipline.
- **API**: `/attribution/summary` gains `narrative` (validated object or null). Existing `insight` field remains during transition (fallback path).
- **UI**: `AttributionWorkspace` renders `narrative` when present (headline + observations + action button deep-linking per action_id), else falls back to the existing insight line. "As of {date}" stamp always visible.

## 10. Evals + CI

Golden fact sheets (5–8 fixtures: growth month, quiet month, funnel-drop month, sub-floor tenant, brand-new tenant, dead-channel tenant) → assertions:

- every emitted claim passes the validator;
- no %/comparative claim under floor;
- action_id ∈ menu;
- sub-floor fixture yields counts-only prose;
- quiet fixture yields `quiet_month`.

Live-model evals follow the BSH agent-evals pattern (run on demand / nightly, not on every PR); the validator unit tests run on every PR. Prompt changes bump `narrator.vN` and require a green eval run.

## 11. Rollout phases (calibrated estimates)

| Phase | Content | Est. |
|---|---|---|
| 0 | This doc → **Recap Generator reconciliation decision (§2b)** → advisory passes (ai-governance, pii) → contract sign-off | 0.5–1 session |
| 1 | Fact-sheet assembler + fixtures + **funnel monthly pre-aggregation row in Attribution_Aggregator** (finding #7) | 1.5 sessions |
| 2 | Narrator Lambda (own trigger, conditional write) + validator + storage + IAM (staging Terraform: `bedrock:InvokeModel`) + **Living-Inventory classification of the new narrative row** (finding #9) | 1.5–2 sessions |
| 3 | Dashboard render + fallback + retire `double_down`/`worth_a_look` to fallback-only + eval suite incl. poisoned-vocab, skip-write, and recap-consistency fixtures (+ separable §8 UI PR) | 1 (+0.5) session |
| 4 | BrightPath narrative on seeded month, operator taste pass, prompt iteration, staging soak | 0.5 session + calendar |

Total ≈ **5–6 focused sessions** (post-review; was 4–5 — the funnel pre-aggregation, separate narrator Lambda, and recap reconciliation are real added scope). Risk concentration: Phase 0 recap decision; Phase 2 IAM friction; Phase 4 prompt taste (bounded by validator — worst case bland, never wrong). Prod = later gated dispatch per SOP; new env/IAM ⇒ publish Lambda version per standing rule. Recap Generator's own migration to the shared source is follow-on scope, NOT in this total.

## 12. Open questions (resolve at un-park)

1. ~~Where generation runs~~ **RESOLVED by adversarial review (finding #2): separate narrator Lambda with its own EventBridge rule.** Never inline in the hourly aggregator loop — Bedrock latency/throttling must not be able to hurt the aggregation job. (The aggregator DOES gain the funnel pre-aggregation row — that's cheap deterministic counting in its existing loop, no external calls.)
2. Current-month refresh cadence (weekly recommended) vs. closed-month-only.
3. Whether the demo tenant's narrative is frozen with the rest of the seeded data (recommended: yes, generate once and freeze alongside the aggregator freeze).
4. Exact model id at build time (track the V5 turn's tier).
5. **Recap Generator reconciliation (§2b)** — single-source decision is Phase 0's gate.
6. Dashboard QA outcomes — **this plan intentionally waits for the operator's fine-tooth-comb pass on the attribution dashboard; UI decisions here are subordinate to that final state.**

## 13. Adversarial review log

Tech-lead adversarial pass, 2026-07-18 (agent, 9 findings — 2 BLOCKER / 4 MAJOR / 3 MINOR). All incorporated:

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | BLOCKER | `Attribution_Recap_Generator` is undisclosed live prior art producing a competing monthly narrative from the same aggregates | §2b added: single-source reconciliation is Phase 0's gate; cross-surface consistency fixture in evals |
| 2 | BLOCKER | Bedrock call inline in the hourly aggregator risks the core C5 aggregation job (300s timeout, shared loop) | Own Lambda + own EventBridge rule (§3.1, Q1 resolved) |
| 3 | MAJOR | Hourly hash drift defeats hash-as-throttle | Cadence enforced by schedule; hash is skip-safety only (§3.1) |
| 4 | MAJOR | "Final at 48h" races the aggregator's ~72h prior-month finalization | Final generation on day 4+ (§3.1) |
| 5 | MAJOR | Prompt injection via tenant-controlled program/form names | §4: delimited data block, length/charset guards, poisoned-vocab eval fixture |
| 6 | MAJOR | Read-then-write race double-spends Bedrock calls | Conditional write on stored fact-sheet hash (§3.1) |
| 7 | MINOR | Funnel drop-off reader is a heavy live GSI query, not cheap reuse | Pre-aggregate a monthly funnel row in the Aggregator; Phase 1 estimate raised (§4, §11) |
| 8 | MINOR | Fallback shape ambiguous (write rule-pack row vs skip) | Skip-write; UI falls back naturally; fixture added (§6) |
| 9 | MINOR | Living-Inventory PR rule for the new DynamoDB row shape not budgeted | Folded into Phase 2 (§11) |

Verdict (reviewer): core design "sound, appropriately simple… nothing reads as speculative overengineering"; gated on #1/#2, both now resolved in-plan.
