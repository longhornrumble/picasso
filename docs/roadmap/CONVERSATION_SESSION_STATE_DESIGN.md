# Conversation Session-State — Design Doc (DRAFT)

**Status:** Draft v2 for review — architecture only, no code yet
**Date:** 2026-07-04
**Owner:** Chris Miller
**Origin:** Came out of a live staging debugging session (Atlanta Angels replica, MYR384719) that surfaced topic drift, CTA program-bleed, and weak session memory. This doc reframes the "Chat Experience Optimization" program ([`CHAT_EXPERIENCE_OPTIMIZATION.md`](CHAT_EXPERIENCE_OPTIMIZATION.md)) around the real lever.

**v2 changelog (tech-lead review incorporated, 2026-07-04).** Two v1 claims were wrong and are corrected here: (a) the `conversation-summaries` table's summary field is **dead code** — nothing writes real content on *either* path (`conversationManager.js:1138` calls `saveConversationDelta` with only 2 args), so the running-summary writer is a **from-scratch build**, not "wire up what Python does"; (b) retrieval passes **no metadata filter** today (`shared/bedrock-core.js:295`) and the main recruitment KB is **one all-programs document** (no per-chunk `program` tag), so program-scoped retrieval needs **KB re-segmentation + re-ingestion**, not a freebie. Also hardened per review: program-scoping is a **soft boost + zero-result-retry-unfiltered**, not a hard filter (§5); a **go/no-go gate** sits before the session-state build (§10); the model-written summary routes through **PII advisory** before implementation (§8); store-unavailable **failure contract** added (§8); step-5 dual-path unification **cut** from the committed plan (§10).

---

## 1. The goal (in Chris's words)

1. **Remember what the user is talking about *this session*.**
2. **Respond in kind** — answer *in context* and propose next steps that are also *in context* — conversation-first, with menus/CTAs when they genuinely help.

Both reduce to one thing: a **single running "understanding of the session"** that every part of the bot reads from. Today that understanding is fragmented across three consumers that don't share a source of truth, and nothing keeps them coherent. That fragmentation *is* the bug behind everything we saw.

---

## 2. What we actually observed (2026-07-04, staging, Atlanta Angels replica)

| Symptom | What happened |
|---|---|
| **Topic drift / "hallucination"** | User clicked "Learn about the volunteer process" after a mentoring turn. The reply drifted to "volunteering is part of our mentorship program… community service together… what causes matter (animals, environment, seniors)." |
| **CTA program-bleed** | In a Dare-to-Dream (mentoring) thread, the bot surfaced **Love Box** CTAs ("Learn about Love Box", "What's in a Love Box?") — a different program (family sponsorship). |
| **Memory worry** | Does the bot still know at turn 15 what the user said at turn 2? |

**Root causes found (none are prompt "naturalness"):**
- **Retrieval got a polluted query.** `index.js:755–773` rewrites the KB query on follow-ups to `"<input> — details beyond: <the previous answer, HTML and all>"`. "Learn about…" matched the trigger, so "volunteer process" was retrieved as *"volunteer process + the prior mentoring answer"* → mentoring-flavored passages → drift. (Proof: same prompt + the *clean* query grounds correctly; the enriched query is the only difference.)
- **CTA tags don't discern programs.** `query_process` ("Learn about the volunteer process") is tagged `topic_tags: ["dare_to_dream","love_box","volunteer"]` — it spans both programs, so the pool bleeds Love Box CTAs into a mentoring thread.
- **Memory is a thin sliding window** (see §3), with no shared "what this conversation is about."

**Not the cause:** the Step-2 response prompt, the KB content, or the 2.5 CTA-restraint change (that tenant doesn't even run the V4.0 selector; the polluting doc has been in the KB since April).

---

## 3. Current architecture (as-is) — who reads/writes what

Three consumers each form their *own* view of the conversation, from *different* inputs. Nothing reconciles them.

### 3a. Retrieval (which KB passages)
- **Streaming path (BSH, ~80% of traffic):** `retrieveKB(kbQuery, config)` — a **single query string**, no conversation history. The only "context" is the `index.js:755` enrichment hack (append prior answer). No program/topic filter.
- Result: retrieval can wander across programs and topics.

### 3b. Response generation (the answer)
- `buildV4ConversationPrompt(userInput, kbContext, tonePrompt, conversationHistory, config)` — **no `session_context`**. Its only memory is the transcript:
  - Client trims to **last 20 user turns + last 2 assistant turns** (`trimHistoryForSend`, `messageHelpers.js:292`), bounded by an **8 KB WAF body limit**.
  - The prompt keeps all sent user turns but **only the last 2 assistant** responses (`prompt_v4.js:89–115`).
- Result: it remembers what the *user* said (≤20 turns) but forgets its *own* earlier answers; no running summary; past ~20 user turns the earliest context silently rolls off.

### 3c. Next steps (CTAs / menus)
- **V4.0 Action Selector** (`selectActionsV4`) — a post-response Haiku call over the `ai_available` vocabulary (this is what 2.5 tuned). Reads response + history; **no program scoping**.
- **V4.1 Pool Selection** (`selectCTAsFromPool` + `topic_definitions`) — the path Atlanta Angels actually uses. Classifies a topic, filters CTAs by `selection_metadata.topic_tags`, dedups against `session_context.recently_shown_ctas`. **Tags are loose** → program bleed.

### 3d. The one piece of shared state that exists (and is underused)
`session_context` (client-held, `StreamingChatProvider.jsx:1060–1082`): `accumulated_topics` (≤15), `detected_role` (sticky), `last_classified_topic`, `recently_shown_ctas` (≤8), `turns_since_click`, `completed_forms`.
- It's used for **CTA routing + retrieval-continuation detection** — but **never injected into the response prompt**, and it's coarse (a topic list + a role), not a real understanding.

### 3e. The other path has *more* memory (inconsistently)
The **HTTP fallback (Master_Function, ~20%)** reads a **conversation summary + recent messages** from DynamoDB (`conversation-summaries`, `recent-messages` tables; `conversation_handler.py:619–830`). So the two paths have **different memory models** — the primary path is the weaker one.

**Summary of the problem:** response reads a trimmed transcript; retrieval reads a hacked keyword query; CTAs read loose tags. Three views, no shared truth, nothing keeping them coherent.

---

## 4. The core idea — one shared Session State

Maintain a small, **structured session state** on the server, updated once per turn, and make it the **single source of truth** that retrieval, response, and next-step selection all read.

```jsonc
// picasso-conversation-state (proposed), keyed by (tenant_id, session_id)
{
  "active_program": "dare_to_dream",     // from topic_definitions; null until known
  "user_role": "prospective_mentor",     // evolves detected_role
  "stage": "exploring",                  // exploring | interested | ready_to_act | in_form
  "running_summary": "Foster parent of 2 exploring Dare to Dream mentoring; meets the 20-yr age requirement; interested in sports/animals activities.",
  "known_facts": { "age_ok": true, "interests": ["sports","animals"] },  // optional, small
  "recent_turns": [ /* last ~3 verbatim exchanges */ ],
  "recently_shown_ctas": ["query_process"],   // carried from today's session_context
  "updated_at": "…", "turn": 7
}
```

Design rules (simplicity guardrails):
- **Small and bounded.** A paragraph summary + a handful of fields + a short recent window. Not a transcript store, not a vector memory, not cross-session.
- **Server-authoritative.** Lives in DynamoDB, not the client — so it's not hostage to the 8 KB body limit and is identical on both paths.
- **Additive/forward-compatible reads** (per the repo's schema-discipline rule): every consumer tolerates a missing/empty state (falls back to today's behavior).

---

## 5. How each consumer uses it

| Consumer | Today | With session state |
|---|---|---|
| **Retrieval** | single query string; enrichment hack; no scoping | Query the **clean current input**; drop the `index.js:755` enrichment. **Soft-boost/rerank toward `active_program`** (NOT a hard filter — see §5a) with a **zero-result retry unfiltered**. For true ellipsis ("tell me more") do a clean **query-rewrite** using the summary, not raw-answer concatenation. → *less drift, less cross-program pull, without silently excluding the right passage.* |
| **Response** | trimmed transcript only | Inject **`running_summary` + `active_program` + `user_role`** into the prompt, alongside a short recent window. → *answers in context, recalls the session, stays on program.* |
| **Next steps (CTA/menu)** | loose tags (bleed) or unscoped selector | Select **scoped to `active_program`** and **gated by `stage`** (restraint while exploring — the 2.5 behavior — surface APPLY when `ready_to_act`). → *in-context next steps; no Love Box in a mentoring thread; conversation-first, menus when they help.* |

This is the whole thing: **one running understanding, three coherent consumers.**

### 5a. Why program-scoping is a *soft boost*, not a hard filter

`active_program` comes from a fallible topic classifier. Under this design its output now steers retrieval **and** response framing **and** CTAs at once — so one wrong classification has a *larger* blast radius than today (where a bad topic only picks a wrong button). A **hard** retrieval filter turns a misclassification into "the correct KB passage is silently excluded" → honest-fallback at best, fabrication pressure at worst. For an anti-hallucination-for-nonprofits system that is the wrong failure mode.

So v1 scopes retrieval as a **soft boost / rerank** (prefer on-program chunks, don't exclude off-program ones) **plus a zero-result-unfiltered retry**. Worst case of a misclassification degrades to "slightly worse ranking," never "missing fact." Stickiness (don't flip `active_program` on a low-confidence turn) prevents flapping, but note it is **double-edged** — it also risks locking onto a wrong program for a few turns after a legitimate pivot, which reads to the user exactly like the drift we're trying to kill. An explicit user pivot must be able to override stickiness immediately.

---

## 6. What already exists to build on (and what does NOT)

**Reusable today:**
- `topic_definitions` — 13 clean, program-scoped topics → the vocabulary for `active_program`.
- `detected_role` (sticky) → seeds `user_role`.
- `session_context` (accumulated_topics, recently_shown_ctas, turns_since_click) → the proto-state to promote/formalize.
- KB doc **`document_type`** metadata (`knowledge_base` vs `program_manual`) → already present → lets us at least keep mentor-curriculum docs out of recruitment retrieval.
- **2.5 CTA restraint** (already shipped) → becomes the `stage=exploring` behavior, now *scoped* rather than standalone.

**Must be built (NOT free, contrary to v1):**
- **The running-summary writer is dead code.** The `conversation-summaries`/`recent-messages` tables exist and are read-safe, but the summary field is never populated (`saveConversationDelta` is only ever called with 2 args, `conversationManager.js:1138`; `factsUpdate`/`summaryUpdate` are always null). So the summarizer is a from-scratch build on **both** paths — not a wiring task.
- **Per-program KB tagging + a retrieval filter do not exist.** `retrieveKB` passes no `filter` (`shared/bedrock-core.js:295`), and the main recruitment KB is a single all-programs document whose metadata lists every program in one `topics` string — there is no per-chunk `program` attribute to scope on. Program-scoped retrieval therefore requires **KB re-segmentation + metadata regeneration + re-ingestion** plus filter plumbing. Verify the exact gap against a live multi-program tenant's ingested metadata before scoping Step 1.

So the build is **wiring + one new per-turn summarizer + a KB re-ingestion pass**, not pure wiring.

---

## 7. The per-turn "update state" step

Each turn, after (or alongside) topic classification, update the state:
- **`active_program`**: from topic classification (with a confidence gate + stickiness — don't flip programs on a low-confidence turn).
- **`stage`**: rules on intent signals (explicit commitment → `ready_to_act`; entering a form → `in_form`).
- **`running_summary`**: a cheap Haiku call — "update this summary with the new turn, ≤80 words, facts only." Or fold into an existing call to avoid a new hop.
- Persist to DynamoDB (24 h TTL, like the scheduling/form session stores).

Cost/latency: **decide up front whether this is a new hop or folded into the existing `classifyTopic()` call** — that choice determines whether the design adds a second per-turn LLM round-trip. It must not sit in front of streaming (TTFT target <700ms, per `CHAT_EXPERIENCE_OPTIMIZATION.md` §6): run the update **after/parallel to** the streamed response, accepting that the summary is one turn stale. Corollary worth stating honestly: with "typical conversations are 2–3 turns" (same roadmap §1), the running-summary mostly helps the **tail** of longer conversations — size the win against that population, don't sell it as universal.

---

## 8. Constraints to honor

- **8 KB WAF body limit** — state is server-side, so the client sends *less*, not more.
- **Latency** — see §7: the summary update runs after/parallel to streaming, never in front of TTFT.
- **PII governance (blocking prerequisite, not a footnote).** A model-written free-text `running_summary`/`known_facts` about people in a foster-care/mentoring context is squarely inside CLAUDE.md's PII Review Triggers ("generates AI summaries… about a person"). **Route the summary design through `pii-data-lifecycle-advisor` before the update-step is implemented.** Protection must be a **deterministic control**, not a prompt instruction — mirror the sibling Phase-4 pattern (`CHAT_EXPERIENCE_OPTIMIZATION.md` 4.4: consent/sensitive fields `structured_only`, model values rejected). Plus: new `pii-inventory.md` row, tenant-scoped key, TTL, redaction discipline.
- **State-store failure/backpressure contract.** Since retrieval + response + CTA would all now depend on a state read, an unavailable/slow store must not degrade every turn: **bounded read timeout → fail-open to today's stateless behavior**; **writes are best-effort / non-blocking** (a failed write carries forward slightly-stale state, never blocks the response).
- **Grounding is not overridden** — the summary informs *framing/recall*; the KB (grounding rules) still governs *facts*. The summary must never become a source the model treats as ground truth.
- **Forward-compatible reads** — empty/missing state ⇒ today's behavior. Flag-gated rollout, MyRecruiter test tenant first.

---

## 9. Eval implications (today's net can't see any of this)

The Phase-1 eval net scores the **prompt given a KB** — it never exercises retrieval, CTA pool selection, or multi-turn state. This work needs a **new eval dimension**:
- **Multi-turn coherence:** across a scripted conversation, assert (a) it stays on the active program, (b) it recalls an early fact late, (c) CTAs are on-program and stage-appropriate, (d) retrieval pulls program-scoped passages.
- This means extending the harness to drive the *real* `index.js` retrieval/query-construction + CTA path, not just `buildV4ConversationPrompt` with a handed-in KB.

---

## 10. Rough phasing (sketch, not a commitment)

Ordered by *impact per unit risk*, each independently shippable and eval-gated.

**Cheap wins (approve now):**

0. **Kill the retrieval drift.** Narrow/remove the `index.js:755` enrichment; retrieve on the clean query. Add a multi-turn retrieval eval. *(18 isolated lines; can only make the query cleaner; likely fixes the "volunteer process" drift by itself. Ship as its own PR.)*
1. **Program-scoping (soft) + CTA de-bleed.** Tighten CTA `topic_tags` so program-specific CTAs don't cross programs *(fixes the Love Box bleed — config work)*, and add a **soft on-program boost + zero-result-unfiltered retry** to retrieval (§5a). **Prerequisite:** confirm/repair per-program KB metadata (see §6 "must be built") — this likely needs a re-ingestion pass and is the real cost of Step 1.

**↓↓↓ GO/NO-GO GATE ↓↓↓** — ship + soak 0–1, re-run the volunteer-process / Love-Box repro and the new multi-turn eval. **Only fund the session-state object below if drift / bleed / memory complaints persist.** (Same discipline the sibling roadmap applies to Phase-4 agentic forms: measure before the expensive bet.)

**The session-state build (gated):**

2. **Session-state object + per-turn summarizer** (server-side store, running summary — built from scratch, §6). *PII-advisor sign-off is a prerequisite (§8).*
3. **Wire response generation to read the summary + program + role.** *(The memory win.)*
4. **Stage-gate CTAs** (fold 2.5 restraint in as `stage=exploring`).

**Deferred (own mini-design, NOT in this committed plan):** unifying the Node (streaming) and Python (HTTP) paths onto one shared state store. The doc's §11 lists this as an open architectural question ("where does the shared logic live?"); with the summarizer non-existent on both paths today, this is a separate decision to make only after 2–4 are validated in prod.

---

## 11. Open questions / risks (poke holes here)

- **⭐ Biggest risk — `active_program` misclassification blast radius.** One classifier output now steers retrieval + response + CTAs at once (vs. one wrong button today). Primary mitigation: **soft-boost not hard-filter + zero-result retry** (§5a). Residual: stickiness is double-edged (prevents flapping, but can lock onto a wrong program after a legit pivot) → an explicit pivot must override immediately. Still needs a concrete confidence threshold + low-confidence-turn behavior (unresolved).
- **KB re-ingestion prerequisite** (new in v2) — per-program retrieval scoping isn't possible until the recruitment KB is re-segmented/re-tagged with a `program` attribute (§6). This is a real, unbudgeted dependency for Step 1; verify against a live multi-program tenant first.
- **Summary drift** — a model-written running summary can hallucinate/compound. Mitigations: facts-only, bounded length, periodic regenerate-from-window, never treated as KB, **deterministic PII guard** (§8), PII-advisor sign-off.
- **Deciding `active_program`** — reuse the existing `classifyTopic()` call or a new one? (Determines the per-turn latency cost, §7.) Plus the "unspecified/general" topic-12 case must bypass scoping.
- **Measurement beyond evals** — steps 2–5 are the expensive part; they need a concrete production metric (e.g., CTA-tag precision by program, retrieval program-match rate, unprompted-topic-switch counter), not just the demo-verdict vibe check.
- **Deferred: HTTP vs streaming unification** — real Python/Node duplication; own mini-design later (moved out of §10).
- **Rollout** — flag-gated, MyRecruiter test tenant first.
- **Scope creep** — resist turning this into a general agent/memory platform. Keep it: small state, three consumers, one update step.

---

## 12. Non-goals (explicit, to stay honest to "simplicity first")

- **No cross-session / long-term user memory.** Session-scoped only, TTL'd.
- **No vector/embedding memory store.** A paragraph summary + a few fields is enough.
- **No rearchitecture into a general agent loop.** That's the deferred Phase-5 idea in the roadmap; this is narrower and shippable.
- **Not a prompt-naturalness project.** Tone (Phase 2) rides *on top of* this and is secondary.

---

## 13. Relationship to the existing program

This **reprioritizes** [`CHAT_EXPERIENCE_OPTIMIZATION.md`](CHAT_EXPERIENCE_OPTIMIZATION.md): the Phase-1 eval net stands (and needs the multi-turn extension in §9); the Phase-2 naturalness sub-phases (closings, tone, 2.5) are **secondary polish** and should wait behind §10 steps 0–4. The session-state layer is the actual lever for both of Chris's goals.
