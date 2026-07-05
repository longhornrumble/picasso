# Conversation Session-State — Design Doc (DRAFT)

**Status:** Draft v3 — architecture only; Step 0 shipped (lambda#385) and validated live
**Date:** 2026-07-04
**Owner:** Chris Miller
**Origin:** Came out of a live staging debugging session (Atlanta Angels replica, MYR384719) that surfaced topic drift, CTA program-bleed, and weak session memory. This doc reframes the "Chat Experience Optimization" program ([`CHAT_EXPERIENCE_OPTIMIZATION.md`](CHAT_EXPERIENCE_OPTIMIZATION.md)) around the real lever.

**v3 changelog (independent foundation audit, 2026-07-05 — three code investigations + a live pipeline repro of the incident).** Three v2 claims corrected: (a) **the CTA-bleed root cause was mis-attributed** — the bleed CTAs are *tightly* tagged; the real mechanism is the classified **topic** (`volunteer_general`) carrying tags that span both programs, plus no session-level program preference in pool selection (empirical: real `classifyTopic` + `selectCTAsFromPool` on the exact incident conversation reproduced the production CTAs verbatim, and the core-learning redundancy filter *removed* the one Dare-to-Dream CTA, worsening the tilt). "Tighten CTA tags" would NOT have fixed the incident — §2, §10 Step 1 rescoped. (b) **the `recently_shown_ctas` dedup does not exist** — it lives only in JSDoc comments (`prompt_v4.js:17,630`), never read in code (§3c). (c) **the HTTP path's "richer memory" is illusory** — the summary read always returns empty (no writer; usually no row) AND its consumer discards the result via an `Item`-key shape mismatch (`lambda_function.py:1330`); both paths run on body-carried history only, dissolving the §11 "unify the paths" question (§3e). New finding: **`session_context` is already sent on every streaming request** (`StreamingChatProvider.jsx:772`) and the body is in scope at the prompt call — enabling a server-only "session-state lite" (§10 Step 1, rescoped) with the go/no-go gate moved after it.

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
- **CTA selection has no session program preference** *(v3 correction — empirically reproduced)*. A program-unspecified turn ("Tell me about the volunteer process") classifies as `volunteer_general`, whose **topic tags span both programs** (`[dare_to_dream, love_box, volunteer]`). Pool eligibility is any-single-tag overlap (`prompt_v4.js:675-680`), so both programs' CTAs enter the pool; the core-learning redundancy filter then *removed* the one Dare-to-Dream CTA ("AI just answered dare_to_dream", `prompt_v4.js:713-720`), and the final selection was exactly the production bleed: `[query_discoverysession, query_process, love_box_learn, lovebox_contents]`. The bleed CTAs themselves are tightly tagged (`[love_box]`) — tightening CTA tags would not fix this, and tightening `volunteer_general`'s tags would break the legitimate cold-start case (a user with no program context *should* see both). The turn's classification is arguably correct in isolation; what's missing is the **session's** program context biasing the choice.
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
- **V4.1 Pool Selection** (`selectCTAsFromPool` + `topic_definitions`) — the path Atlanta Angels actually uses. Classifies a topic (Haiku call seeing the current message + last 2 *user* messages, `prompt_v4.js:433-471`), then pools CTAs by **any-single-tag overlap** between the topic's `tags` and each CTA's `selection_metadata.topic_tags` (`prompt_v4.js:675-680`). *(v3 correction)*: the documented `recently_shown_ctas` dedup **does not exist** — it appears only in JSDoc (`prompt_v4.js:17,630`), never in code; the only real dedup is `completed_forms`. Program bleed comes from program-spanning **topic** tags (§2), not loose CTA tags.

### 3d. The one piece of shared state that exists (and is underused)
`session_context` (client-held, `StreamingChatProvider.jsx:1060–1082`): `accumulated_topics` (≤15), `detected_role` (sticky), `last_classified_topic`, `recently_shown_ctas` (≤8), `turns_since_click`, `completed_forms`.
- *(v3, verified)* It is **already sent on every streaming request** (`StreamingChatProvider.jsx:772`) and the parsed body is in scope at the prompt-build call (`index.js:770/1262`) — but the server only parses it *after* the response has streamed (`index.js:921/1384`), for the post-stream CTA path: `last_classified_topic` feeds topic-classification continuation, and `completed_forms`/`suspended_forms`/`program_interest` feed CTA/enhancement logic. It is **never injected into the response prompt**, and it's coarse (a topic list + a role), not a real understanding.

### 3e. The other path's "extra" memory is illusory *(v3 correction)*
The **HTTP fallback (Master_Function, ~20%)** has read/write scaffolding for a conversation summary + recent messages (`conversation_handler.py:610–790`), but it is dead end-to-end: the summary is never written (the delta keys that would carry it are never sent — the sole client call site `conversationManager.js:1138` passes 2 args, so usually **no summaries row is written at all**), and even the empty read is discarded by its consumer (`lambda_function.py:1330` checks `result.get('Item')` on a flat dict → always `None`). **Both paths run on body-carried history only.** There are no "two memory models" to unify — which removes that open question from §11.

**Summary of the problem:** response reads a trimmed transcript; retrieval reads a hacked keyword query (fixed in Step 0); CTAs read program-spanning topic tags with no session preference. Three views, no shared truth, nothing keeping them coherent.

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
| **Retrieval** | clean current query (enrichment removed in Step 0 ✅); no scoping | **Soft-boost/rerank toward `active_program`** (NOT a hard filter — see §5a) with a **zero-result retry unfiltered** — gated, needs KB re-segmentation (§6). For true ellipsis ("tell me more") a clean **query-rewrite** using the summary, not raw-answer concatenation. → *less cross-program pull, without silently excluding the right passage.* |
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

**Must be built (NOT free; all items below re-verified 2026-07-05):**
- **The running-summary writer is dead code** — stronger than v2 stated: `saveConversationDelta` is a client-side POST builder whose sole call site passes 2 args (`conversationManager.js:1138`), so the server's summaries-table `PutItem` block (gated on `summary_update`/`facts_update`/`pending_action`, `conversation_handler.py:711`) is never entered — usually **no summaries row exists at all**. A summarizer is a from-scratch build on **both** paths.
- **The `recently_shown_ctas` dedup is dead code** *(v3, new)* — documented in `prompt_v4.js` JSDoc, never read. Real across-turn CTA suppression must be built (this is also the sibling roadmap's 2.5b).
- **Per-program KB scoping does not exist — verified live.** `retrieveKB` passes no `filter` and discards chunk metadata (`shared/bedrock-core.js:291-307`; note it also caches by `(query, kb)` only — a scoping dimension would need a cache-key change). The MYR384719/Atlanta KB has exactly 2 docs: the main recruitment doc is **one 63KB all-programs file** whose metadata carries a single `topics` string (no program attribute); the Dare to Dream Jr manual **does** carry `program` + `document_type: program_manual`. So: a `document_type` filter (keep curriculum manuals out of recruitment retrieval) is available **today**; per-program scoping of the main content requires **re-segmentation + metadata regeneration + re-ingestion**.

So the full build is **wiring + one new per-turn summarizer + a KB re-ingestion pass** — but see §10: a "session-state lite" using the already-on-the-wire `session_context` defers most of it.

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

Ordered by *impact per unit risk*, each independently shippable and eval-gated. *(v3: Step 1 rescoped — the v2 "tighten CTA tags" fix is refuted by the empirical repro in §2; the gate moved after the lite build.)*

0. ✅ **Kill the retrieval drift** — SHIPPED (lambda#385, 2026-07-05) and validated by operator repro on staging: the mentoring → "volunteer process" turn now answers from the correct KB passage. Multi-turn eval scenario `context_01` locks it.

1. **Session-state lite** (server-only BSH change; no new store, no summarizer). `session_context` is already in every streaming request body and in scope at the prompt call (§3d), so:
   - **1a. Inject session context into the response prompt** — a short block (active topics, detected role) in `buildV4ConversationPrompt`. Kills the context-blind clarifying question ("Love Box or mentoring?" asked right after a mentoring exchange). No client change, no WAF impact, trust model unchanged (the prompt already trusts client-carried history).
   - **1b. Program-aware CTA ordering** — when the classified topic is program-ambiguous (e.g. `volunteer_general`), use the session's program signal (accumulated topics / last classified topic) to *prefer* on-program CTAs in pool ordering — soft bias, never exclusion (§5a logic applied to CTAs). Kills the Love Box bleed without breaking the cold-start case.
   - **1c. Implement the shown-CTA dedup** (`recently_shown_ctas` — currently dead, §6; = sibling roadmap 2.5b).
   - Eval-gated (extend the harness to drive `classifyTopic`/`selectCTAsFromPool` with `session_context` — §9), flag-gated, MyRecruiter tenant first. ⚠️ `index.js` has **two near-identical handler blocks** (streaming ~360–1050, buffered ~1140–1490) — every change lands in both.

1½. *(optional, cheap)* **`document_type` retrieval filter** — exclude `program_manual` docs from recruitment retrieval using metadata that already exists (§6). No re-ingestion needed.

**↓↓↓ GO/NO-GO GATE ↓↓↓** — ship + soak 0–1, re-run the volunteer-process / Love-Box repro and the multi-turn evals. **Only fund the full session-state build below if drift / bleed / context complaints persist.** What the expensive build adds over lite: own-answer recall beyond 2 turns, memory past the 20-user-turn window, server-authoritative state — tail value when typical conversations are 2–3 turns (§7).

**The full session-state build (gated):**

2. **Session-state object + per-turn summarizer** (server-side store, running summary — built from scratch, §6). *PII-advisor sign-off is a prerequisite (§8).*
3. **Wire response generation to read the summary + program + role.** *(The long-conversation memory win.)*
4. **Stage-gate CTAs** (fold 2.5 restraint in as `stage=exploring`).
5. **KB re-segmentation + program-boosted retrieval** (§5a, §6) — only if the gate shows retrieval still pulls cross-program after 0–1.

**Deferred:** unifying the Node (streaming) and Python (HTTP) paths. *(v3: mostly dissolved — §3e shows both paths already run on body-carried history only, so there are no divergent memory models to reconcile. If the gated store ships (steps 2–4), giving the HTTP path the same state read is a small follow-up, not a mini-design.)*

---

## 11. Open questions / risks (poke holes here)

- **⭐ Biggest risk — program-signal misclassification blast radius.** One inferred program signal steers response framing + CTAs (and, post-gate, retrieval) at once. This applies to **session-state lite too** (§10 Step 1): the mitigation everywhere is **soft bias, never exclusion** — a wrong program signal degrades ranking/framing, never hides a fact or a CTA the user asked for. Stickiness is double-edged (prevents flapping, can lock a wrong program past a legit pivot) → an explicit user pivot must override immediately. Concrete confidence threshold + low-confidence behavior still unresolved.
- **Client-held state is client-controlled** *(v3, new)* — lite reads `session_context` from the request body, which a hostile client can forge. Same trust class as `conversation_history`, which the prompt already consumes; forging it only degrades that client's own session. Acceptable for lite; the gated server-side store removes even that.
- **KB re-ingestion prerequisite — verified live 2026-07-05** (§6): per-program scoping of the main recruitment doc requires re-segmentation; only the `document_type` filter is free today. Deferred behind the gate (§10 step 5).
- **Summary drift** — a model-written running summary can hallucinate/compound. Mitigations: facts-only, bounded length, periodic regenerate-from-window, never treated as KB, **deterministic PII guard** (§8), PII-advisor sign-off.
- **Deciding `active_program`** — for lite, derive it deterministically from `topic_definitions` tags (topics → program) with `general_inquiry`/`volunteer_general` treated as no-signal; for the gated build, decide whether `classifyTopic()` is reused or extended (per-turn latency, §7).
- **Measurement beyond evals** — steps 2–5 are the expensive part; they need a concrete production metric (e.g., CTA program-match rate, unprompted-topic-switch counter), not just the demo-verdict vibe check.
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

This **reprioritizes** [`CHAT_EXPERIENCE_OPTIMIZATION.md`](CHAT_EXPERIENCE_OPTIMIZATION.md): the Phase-1 eval net stands (and needs the multi-turn extension in §9); the Phase-2 naturalness sub-phases (closings, tone) are **secondary polish** and should wait behind §10 steps 0–1 + the gate. Sub-phase 2.5b (shown-CTA memory) is absorbed into §10 step 1c. The session context/state layer is the actual lever for both of Chris's goals.
