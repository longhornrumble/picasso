# PRD: Sprint 1 — Session Position Tracking

**Document status:** Draft
**Author:** Product
**Date:** 2026-02-26
**Branch:** `feature/v3.5.1-cta-integration`
**Upstream architecture:** `docs/WORKFLOW_ENGINE_ARCHITECTURE.md`

---

## 1. Overview

Sprint 1 adds **session position tracking** to Picasso — recording where a user is in the conversation graph as they move through branches. It makes zero visible changes to the user experience. Every CTA, action chip, and branch transition that happens today will continue to happen exactly as it does today; Sprint 1 only adds the instrumentation layer beneath it.

This tracking is the prerequisite for two concrete improvements:

1. **Context-aware fallback (also shipped in Sprint 1):** When a user types free text mid-branch, the fallback tier returns that branch's CTAs instead of always resetting to the main-menu fallback. One condition change in `response_enhancer.js`; no frontend change.

2. **Intent classification (Sprint 2):** Routing decisions can now condition on `current_node`, enabling "stay in context" vs "route to new branch" logic.

---

## 2. Goals and Non-Goals

### Goals

- Track `current_node` (the branch the user is in right now) in frontend session state and persist it to `sessionStorage`.
- Track `node_history` (last 5 branches visited) as a breadcrumb for analytics and future conditional routing.
- Track `last_transition` (the most recent node change event) for diagnostics.
- Track `ctas_clicked` (CTA IDs clicked this session) for analytics.
- Ship `WORKFLOW_TRACKING` feature flag that gates all new behavior.
- Ship context-aware fallback: Tier 5 uses `current_node` before falling back to `fallback_branch`.
- Return `metadata.branch` from `response_enhancer.js` uniformly on every routing tier so the frontend has a single field to read.

### Non-Goals

Sprint 1 does **not** include:

- Intent classification (Sprint 2).
- Any AI call changes or prompt changes.
- `routing_branches` if/else conditional routing (Sprint 3).
- Server-side session state (DynamoDB) — position is browser-session scoped only.
- Config builder UI changes.
- Any user-visible behavior change other than context-aware fallback.
- Changes to `Master_Function_Staging` (Python Lambda) — this sprint is Bedrock streaming path only.

---

## 3. Background

### Current state (v92 baseline)

The fallback tier in `response_enhancer.js` (`getConversationBranch`, line 153–167) resolves to `cta_settings.fallback_branch` for all free-text messages that don't match Tier 1 (action chip) or Tier 2 (CTA click). The Tier 3 AI branch hint (`<!-- BRANCH: xxx -->`) can route to a specific branch when the AI emits the tag, but for open-ended messages without a hint, every turn resets to the main menu. A user mid-way through the `dare2dream` branch who types "tell me more" gets the same main-menu CTAs as a brand-new user. This is the "blunt fallback" problem.

### The workflow graph (already exists)

The config schema already expresses a complete routing graph:

| Graph concept | Config key |
|---|---|
| Node | `conversation_branches.{name}` |
| Edge (explicit) | CTA with `target_branch` |
| Entry points | `action_chips` with `target_branch` |
| Default node | `cta_settings.fallback_branch` |

What is missing is **session position** — the runtime record of which node the user is in. Sprint 1 adds that record.

### Architecture reference

See `docs/WORKFLOW_ENGINE_ARCHITECTURE.md` (Sprint 1 section, lines 88–138) for the full design. This PRD narrows it to implementable tasks.

---

## 4. User Stories

### System / analytics
- As the system, when a user clicks an action chip that resolves to `dare2dream`, I record `current_node = "dare2dream"` in session state so subsequent free-text messages know the user's position.
- As the system, I accumulate up to 5 historical node names in `node_history` so analytics can reconstruct paths through the graph.

### Developers building Sprint 2
- As a Sprint 2 developer, I need `current_node` available in the request body (`session_context`) sent to the Lambda so the intent classifier can decide whether a new intent should replace the current node or stay in context.
- As a Sprint 2 developer, I need `metadata.branch` on every response (not just Tier 1/2) so the frontend session update code works identically regardless of routing tier.

### End users
- As an end user, I notice nothing different. Sprint 1 produces zero visible change except one UX improvement: if I type free text while inside a branch, I stay in that branch's CTAs instead of being sent to the main menu.

---

## 5. Requirements

### 5.1 Feature flag

**FR-1:** The tenant config's `feature_flags` object MUST support a `WORKFLOW_TRACKING` key (boolean).

```json
"feature_flags": {
  "DYNAMIC_ACTIONS": true,
  "DYNAMIC_CHIPS": true,
  "WORKFLOW_TRACKING": true
}
```

**FR-2:** When `WORKFLOW_TRACKING` is `false` or absent, all Sprint 1 behavior is bypassed:
- Context-aware fallback reverts to always using `fallback_branch` (pre-Sprint 1 behavior).
- Session state fields `current_node`, `node_history`, `last_transition`, `ctas_clicked` are not written.
- `metadata.branch` is still returned (it already is for Tiers 1–3) — this is not gated.

### 5.2 Session state additions (frontend)

**FR-3:** The `sessionContext` state object in `StreamingChatProvider.jsx` MUST be extended with four new fields, added to the initial state at line ~344:

```javascript
{
  // existing fields (unchanged)
  completed_forms: [],
  form_submissions: {},
  // new fields
  current_node: null,       // string | null — branch name user is currently in
  node_history: [],         // string[] — last 5 branches visited, LIFO, capped at 5
  last_transition: null,    // object | null — { from, to, trigger, timestamp }
  ctas_clicked: []          // string[] — CTA IDs clicked this session, append-only
}
```

**FR-4:** These fields MUST be populated from `sessionStorage` at initialization (same pattern as `completed_forms` at lines 331–348). If `picasso_session_context` exists in `sessionStorage` and contains `current_node`, restore it.

**FR-5:** These fields MUST be included in the `session_context` object sent to the Lambda (already included — the full `sessionContext` is sent at line ~608). No additional serialization needed.

### 5.3 Node tracking on response completion (frontend)

**FR-6:** In the `onDone` callback (~line 721), after the existing session context update block (~lines 771–800), add a new block that reads `metadata.branch` from the response and updates node state. This executes only when `WORKFLOW_TRACKING` is enabled in `tenantConfig.feature_flags`.

Logic:

```javascript
// After existing ctaMetadata block (~line 800)
const resolvedBranch = pendingCtasRef.current?.metadata?.branch;
const workflowTrackingEnabled = tenantConfig?.feature_flags?.WORKFLOW_TRACKING;

if (workflowTrackingEnabled && resolvedBranch) {
  setSessionContext(prev => {
    const from = prev.current_node;
    const to = resolvedBranch;

    // Build updated history: prepend new node, cap at 5, deduplicate consecutive
    const updatedHistory = from !== to
      ? [to, ...(prev.node_history || [])].slice(0, 5)
      : prev.node_history || [];

    const updated = {
      ...prev,
      current_node: to,
      node_history: updatedHistory,
      last_transition: {
        from: from,
        to: to,
        trigger: pendingCtasRef.current?.metadata?.routing_method || 'unknown',
        timestamp: new Date().toISOString()
      }
    };
    saveToSession('picasso_session_context', updated);
    console.log('[WorkflowTracking] Node transition:', { from, to, history: updatedHistory });
    return updated;
  });
}
```

**FR-7:** `node_history` MUST be capped at 5 entries (LIFO). Entries beyond 5 are silently dropped.

**FR-8:** Consecutive identical node transitions (user stays in the same branch) MUST NOT produce a duplicate entry in `node_history`. The `current_node` is still updated (no-op in this case) but `node_history` is unchanged.

### 5.4 CTA click tracking (frontend)

**FR-9:** In `sendMessage` (~line 622), in the existing `if (metadata.cta_triggered)` block (line ~622), append `metadata.cta_id` to `ctas_clicked` when `WORKFLOW_TRACKING` is enabled:

```javascript
if (metadata.cta_triggered && workflowTrackingEnabled) {
  setSessionContext(prev => {
    const ctaId = metadata.cta_id;
    if (!ctaId) return prev;
    const updated = {
      ...prev,
      ctas_clicked: [...(prev.ctas_clicked || []), ctaId]
    };
    saveToSession('picasso_session_context', updated);
    return updated;
  });
}
```

This runs in addition to (not instead of) the existing `turns_since_click` reset.

### 5.5 Metadata contract (backend)

**FR-10:** `response_enhancer.js` MUST return `metadata.branch` on every routing tier's response object. Audit all current return paths:

| Return path | Current `metadata.branch`? | Required action |
|---|---|---|
| Tier 1 (action chip), line ~670 | Yes (`branch: explicitBranch`) | None |
| Tier 2 (CTA click), line ~670 | Yes (`branch: explicitBranch`) | None |
| Tier 3 (AI branch hint), line ~743 | Yes (`branch: suggestedBranch`) | None |
| Tier 3 fallback (invalid hint → fallback), line ~793 | Yes (`branch: fallbackBranch`) | None |
| Phase 1B suspended form (no CTAs), line ~870 | No | Add `branch: null` |
| Form trigger, line ~922 | No | Add `branch: null` |
| Deprecated keyword detection, line ~984 | No (`branch_detected` ≠ `branch`) | Add `branch: branchResult.branch` |
| No enhancement, line ~996 | No | Add `branch: null` |
| Error, line ~1005 | No | Add `branch: null` |

The frontend reads `metadata.branch` exclusively. Legacy fields like `branch_detected` are ignored for tracking purposes.

### 5.6 Context-aware fallback (backend)

**FR-11:** In `getConversationBranch()` in `response_enhancer.js` (line ~125), Tier 5 (the final fallback) MUST be modified to check `current_node` before using `fallback_branch`. This requires passing `sessionContext` (or just `sessionContext.current_node`) into `getConversationBranch`.

Current signature: `function getConversationBranch(routingMetadata, config)`
New signature: `function getConversationBranch(routingMetadata, config, sessionContext = {})`

Logic change (~line 153):

```javascript
// TIER 5: Context-aware fallback
const featureFlags = config.feature_flags || {};
const workflowTrackingEnabled = featureFlags.WORKFLOW_TRACKING;

// If workflow tracking is on and user has a current position, stay in that branch
if (workflowTrackingEnabled && sessionContext.current_node) {
  const currentNode = sessionContext.current_node;
  const branches = config.conversation_branches || {};
  if (branches[currentNode]) {
    console.log(`[Tier 5] Staying in current node: ${currentNode}`);
    return currentNode;
  }
  console.log(`[Tier 5] current_node '${currentNode}' not found in branches, falling back to fallback_branch`);
}

// Default: fallback_branch (pre-Sprint 1 behavior)
const fallbackBranch = ctaSettings.fallback_branch;
if (fallbackBranch && branches[fallbackBranch]) {
  console.log(`[Tier 5] Routing to fallback branch: ${fallbackBranch}`);
  return fallbackBranch;
}
```

**FR-12:** The `enhanceResponse()` function MUST pass `sessionContext` through to `getConversationBranch()`. The `sessionContext` parameter is already received by `enhanceResponse` at line ~612 — it just needs to be forwarded.

**FR-13:** Feature flag check lives in `response_enhancer.js`. The Lambda in `index.js` does not need to gate the call to `enhanceResponse` — the guard is internal to the function.

---

## 6. Technical Design

### Files modified

| File | Change type | Approximate lines affected |
|---|---|---|
| `Picasso/src/context/StreamingChatProvider.jsx` | Extend session state init, add `onDone` node update block, add CTA click tracking | ~344–348 (init), ~800–820 (onDone insert), ~622–636 (sendMessage extend) |
| `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/response_enhancer.js` | Modify `getConversationBranch` signature, add context-aware Tier 5, add `branch: null` to untagged return paths | ~125 (signature), ~153–168 (Tier 5), ~870, ~922, ~984, ~996, ~1005 (metadata) |

**No changes to:**
- `index.js` (streaming handler main entry) — `enhanceResponse` call signature is unchanged; `sessionContext` is already passed through
- `Master_Function_Staging` (Python Lambda)
- Any config schemas
- Any tenant configs (the `WORKFLOW_TRACKING` flag is optional; absent = disabled)

### Data flow

```
1. User sends message
   → StreamingChatProvider.sendMessage() (~line 580)
   → If CTA click: append cta_id to ctas_clicked in sessionContext
   → session_context (with current_node, node_history, ctas_clicked) included in request body (~line 608)

2. Lambda receives request
   → index.js calls enhanceResponse(bedrockResponse, userMessage, tenantHash, sessionContext, routingMetadata)
   → response_enhancer.js: getConversationBranch(routingMetadata, config, sessionContext)
   → If WORKFLOW_TRACKING && current_node set → stay in current node (Tier 5 new behavior)
   → Returns metadata.branch = resolved branch name (or null)

3. Frontend receives SSE events
   → onCtaButtons callback stores metadata in pendingCtasRef
   → onDone callback fires (~line 721)
   → Reads pendingCtasRef.current?.metadata?.branch
   → If WORKFLOW_TRACKING && branch present → update current_node, node_history, last_transition
   → saveToSession('picasso_session_context', updated) persists to sessionStorage
```

### sessionStorage key

The existing key `picasso_session_context` is used (no new keys). The four new fields are added to the existing object.

---

## 7. Data Model

### Session state schema

```typescript
interface SessionContext {
  // Existing fields (unchanged)
  completed_forms: string[];          // Form IDs completed this session
  form_submissions: Record<string, any>; // Form submission data

  // New fields (Sprint 1)
  current_node: string | null;        // Branch name user is currently in
                                      // null = no position (new user or reset)
  node_history: string[];             // Last 5 branches visited, LIFO
                                      // [most_recent, ..., oldest]
                                      // Cap: 5 entries, no consecutive duplicates
  last_transition: {
    from: string | null;              // Previous node (null if entering from no position)
    to: string;                       // New node
    trigger: string;                  // routing_method value: 'action_chip' | 'cta' |
                                      // 'model_branch_hint' | 'model_fallback' |
                                      // 'context_aware_fallback' | 'unknown'
    timestamp: string;                // ISO 8601
  } | null;
  ctas_clicked: string[];             // CTA IDs clicked, append-only, no cap
}
```

### Defaults

| Field | Default | Set by |
|---|---|---|
| `current_node` | `null` | Frontend init |
| `node_history` | `[]` | Frontend init |
| `last_transition` | `null` | Frontend init |
| `ctas_clicked` | `[]` | Frontend init |

### Backward compatibility

All new fields default to `null`/`[]`. Any Lambda code that reads `session_context` and does not know about these fields will ignore them safely. Old frontends that don't send these fields will result in `undefined` at the Lambda, which the `sessionContext = {}` default handles.

### sessionStorage constraints

`sessionStorage` limit is typically 5–10 MB per origin. The session context object is small (strings only, capped arrays). Estimated maximum size: under 2 KB per session. No compression needed.

---

## 8. Verification Plan

Each test can be performed against the staging widget after deploying the Lambda and frontend builds.

**Setup:** Enable `WORKFLOW_TRACKING: true` in a test tenant config. Confirm via S3 that the flag is set before testing.

### FR-1, FR-2: Feature flag gate

1. With `WORKFLOW_TRACKING: false` — click an action chip, open browser DevTools → Application → Session Storage → `picasso_session_context`. Confirm `current_node` is absent or null.
2. With `WORKFLOW_TRACKING: true` — repeat. Confirm `current_node` is set to the chip's target branch name.

### FR-3, FR-4: Session context init

3. Open widget fresh (no prior session). Open DevTools. Confirm `picasso_session_context` contains `current_node: null` after first message.
4. Navigate to a branch, close the tab, reopen (same origin). Confirm `current_node` is restored from `sessionStorage`.

### FR-5: Fields sent to Lambda

5. Open DevTools → Network tab. Send a message after establishing a `current_node`. Inspect the POST request body. Confirm `session_context.current_node` contains the expected branch name.

### FR-6, FR-7, FR-8: Node tracking

6. Click action chip → branch A. Send a free-text message → branch A (context-aware). Click CTA → branch B. Inspect `picasso_session_context`. Confirm: `current_node = "branch_B"`, `node_history = ["branch_B", "branch_A"]`.
7. Click action chip → branch A. Click the same action chip again (same branch). Confirm `node_history` does NOT grow (no consecutive duplicate).
8. Visit 6 distinct branches. Confirm `node_history.length === 5` (older entry dropped).

### FR-9: CTA click tracking

9. Click two CTAs (with different IDs). Inspect `picasso_session_context.ctas_clicked`. Confirm both IDs appear in order.

### FR-10: Metadata contract

10. In CloudWatch, filter logs for `Bedrock_Streaming_Handler_Staging`. Send a free-text message (no chip/CTA) with `WORKFLOW_TRACKING: true` and a valid `current_node`. Confirm log shows `[Tier 5] Staying in current node: {name}` and the metadata event contains `"branch": "{name}"`.
11. Send a message where no branch resolves (no `current_node`, no `fallback_branch`). Confirm CloudWatch shows `"branch": null` in metadata (not missing key).

### FR-11, FR-12, FR-13: Context-aware fallback

12. Establish `current_node = "dare2dream"` via action chip. Type "tell me more" (free text, no routing signal). Confirm the CTA buttons shown are `dare2dream`'s CTAs, not the `fallback_branch` CTAs.
13. With `WORKFLOW_TRACKING: false` (same tenant, flag disabled), repeat step 12. Confirm user receives `fallback_branch` CTAs (pre-Sprint 1 behavior).
14. Establish `current_node = "dare2dream"`. Clear the branch from config (rename it). Type "tell me more". Confirm fallback gracefully routes to `fallback_branch` instead of erroring.

### Rollback test

15. With `WORKFLOW_TRACKING: true`, verify context-aware fallback works (step 12). Flip flag to `false`. Force config cache refresh (wait 5 minutes or update Lambda env var to bust cache). Repeat step 12. Confirm behavior reverts to `fallback_branch`.

---

## 9. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `sessionStorage` cleared mid-session (user opens incognito, browser blocks storage) | Low | Low | All new fields have null/empty defaults; system falls back to pre-Sprint 1 behavior silently. |
| Lambda cache (5 min TTL) serves old config without `WORKFLOW_TRACKING` flag after deploy | Medium | Low | Context-aware fallback simply doesn't fire; user gets `fallback_branch` as before. No error. Wait up to 5 min or redeploy to force cache bust. |
| `metadata.branch` missing on one of the untagged return paths (missed in FR-10 audit) | Medium | Low | Frontend node-update block checks `if (resolvedBranch)` before writing. Missing field = no tracking update = graceful no-op. |
| Context-aware fallback traps user in a stale branch (user asked about something new but stays in old branch because `current_node` is set) | Medium | Medium | This is a known tradeoff documented in the architecture doc. Tier 5 fires only when no Tier 1–4 match. Sprint 2 intent classification resolves this by reclassifying on topical shifts. Loop detection (future item) provides the remaining safety net. |
| Race condition: `pendingCtasRef` read in `onDone` before `onCtaButtons` fires | Low | High | Already mitigated by existing code pattern — `pendingCtasRef` is set in `onCtaButtons` (~line 700) which fires before `onDone` in the SSE event sequence. No change needed. |
| `node_history` serialization bloat if CTA labels are accidentally stored instead of IDs | Low | Low | Schema is explicit: `node_history` stores branch names (short strings). CTA IDs go only in `ctas_clicked`. Code review catches this. |

---

## 10. Success Metrics

Sprint 1 is complete when all of the following are true:

1. **Flag gate works.** `WORKFLOW_TRACKING: false` produces zero change in observable behavior compared to v92 baseline. Verified by tests FR-1, FR-2, test step 13.

2. **Node tracking fires.** After clicking an action chip, `picasso_session_context.current_node` in `sessionStorage` equals the chip's `target_branch`. Verified by test step 2.

3. **Position survives refresh.** `current_node` is restored after a same-tab page refresh. Verified by test step 4.

4. **Context-aware fallback works.** A user inside a branch who types free text receives that branch's CTAs. Verified by test step 12.

5. **Rollback is clean.** Disabling `WORKFLOW_TRACKING` restores pre-Sprint 1 behavior with no errors. Verified by test step 15.

6. **No regression.** All existing Tier 1 (action chip), Tier 2 (CTA click), and Tier 3 (AI branch hint) routing continues to work identically. Verified by smoke-testing a complete user flow.

7. **CloudWatch has audit trail.** Lambda logs show `[Tier 5] Staying in current node: {name}` for context-aware fallback responses. Verified by test step 10.

---

## 11. Dependencies

Before Sprint 1 development starts:

| Dependency | Status |
|---|---|
| v92 baseline (fallback branch bridge) deployed to staging | Must be confirmed deployed |
| `WORKFLOW_TRACKING` flag key agreed and documented in tenant config schema | This PRD defines it |
| Test tenant config accessible with ability to toggle `WORKFLOW_TRACKING` on/off | Required for verification plan |
| `metadata.branch` audit of all `enhanceResponse` return paths | Defined in FR-10; engineer must walk through each at implementation time |

Before Sprint 1 is promoted to production:

| Dependency | Status |
|---|---|
| Staging smoke test covering all 15 verification steps | Required |
| Rollback procedure confirmed (flip flag, wait for cache expiry) | Required |

---

## 12. Out of Scope

The following are explicitly deferred. Do not implement them in Sprint 1.

- **Intent classification call (Sprint 2).** No second Bedrock call. No `intent_definitions` config. No `detected_intent` field.
- **`routing_branches` if/else conditions (Sprint 3).** No `routing_branches` config schema. No multi-signal condition evaluator.
- **Tier 3 deprecation.** The `<!-- BRANCH: xxx -->` tag mechanism continues to work as-is.
- **Server-side session state.** `current_node` is `sessionStorage` only. No DynamoDB write.
- **Loop detection.** Repeated Tier 5 responses to the same node are not detected or escalated.
- **Escalation detection.** Not in scope for any sprint in this document.
- **Config builder UI** for `WORKFLOW_TRACKING` flag or `intent_definitions`. No visual tooling.
- **`Master_Function_Staging` (Python Lambda) changes.** The HTTP fallback path (~20% of traffic) does not get session tracking in Sprint 1. The streaming path (Bedrock handler, ~80% of traffic) is the only modified backend.
- **Analytics dashboard.** `node_history` and `ctas_clicked` are written to `sessionStorage` and sent in request metadata; surfacing them in the analytics dashboard is a separate workstream.
- **`node_type` field.** Branch nodes do not get typed (form / handoff / confirmation) in Sprint 1.
