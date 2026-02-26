# Workflow Engine: Make Picasso Workflow-First

## Context

After shipping v92 (fallback branch bridge), free-text conversations now show main-menu CTAs instead of dead-ending. But the bridge is blunt — every free-text message gets the same fallback CTAs regardless of what the user asked about. "Tell me about Love Box" and "How do I donate?" both show the same main menu.

Intercom/Fin's architecture shows the right model: **workflows are the orchestrator, AI is a tool within them.** Fin labels conversations with attributes (intent, topic), and the workflow's branching conditions react to those labels. There's no separate "AI mode" vs "workflow mode" — everything is workflow.

### How Fin Attributes Actually Work

Fin Attributes are **not free-form AI labeling**. They are constrained classification:

1. **Human defines the taxonomy** — attribute name, possible values, description of each value
2. **AI classifies** into those predefined buckets — picks from a closed list, cannot hallucinate labels
3. **Rules react** to the classification — deterministic workflow branching

Example: "Issue type" has values [Billing, Projects, Account Management]. Each value has a description guiding classification. The AI picks from the list — it doesn't invent categories.

This is the pattern we should follow: **closed-vocabulary classification, not open-ended tagging.**

### Intercom's Three-Layer Model

Intercom separates workflow logic into three distinct layers. This is the mental model we're adopting:

| Layer | What it does | Intercom | Picasso equivalent |
|---|---|---|---|
| **Triggers** | Gets users INTO the workflow | "Customer sends first message", page visit, ticket creation | Action chip click, CTA click, first message |
| **Conditions** | Decides which PATH based on real-time data | Fin Attributes + person/company data + capacity, combined with AND/OR logic | Intent classification + session state (current_node, completed_forms) |
| **Actions** | What HAPPENS at each node | Send message, assign ticket, tag conversation, route to team | Show CTAs, start form, open link, show showcase card |

Key insight: Intercom's conditions are **simpler than expected**. Workflow branches are sequential if/else — each branch checks one condition, first match wins, and an "else" branch catches everything that didn't match. Operators are basic: `IS`, `IS NOT`, `CONTAINS` (case-insensitive). No complex AND/OR nesting. The power comes from the data sources available to conditions (person data, company data, conversation attributes, capacity), not from logic complexity.

For Picasso, the signals available for conditions today are:
- **Intent** (Sprint 2) — what the user is asking about
- **current_node** (Sprint 1) — where the user is in the graph
- **completed_forms** (exists) — what the user has already done
- **turn count** (exists) — how deep into the conversation

Sprint 2 introduces intent as a single condition. Sprint 3 adds if/else branching across multiple signals — same pattern Intercom uses.

### What Exists Today

The existing Picasso system already has most of the graph primitives:
- `conversation_branches` = nodes
- `cta_definitions` with `target_branch` = edges
- `action_chips` = entry points (triggers)
- `cta_settings.fallback_branch` = default node

What's missing: **session position tracking** (where is the user in the graph?), **intent classification** (constrained AI classification into predefined intents), and **condition evaluation** (multi-signal routing decisions).

## Architecture

### The Graph (already exists in config)

No new config schema needed. The workflow graph is implicit:

| Graph concept | Config equivalent |
|---|---|
| Node | `conversation_branches.{name}` |
| Edge (explicit) | CTA with `target_branch` |
| Entry points | `action_chips` with `target_branch` |
| Default node | `cta_settings.fallback_branch` |

**One active branch at a time.** A conversation is in exactly one branch (or no branch). A new routing decision — intent match, CTA click, action chip — replaces the current branch, it doesn't stack. This mirrors Intercom's constraint: "only one customer-facing workflow running at a time per conversation."

Note: this reinterpretation holds at current scale (~10-20 branches). At 50+ branches with conditional edges, a richer schema would be needed.

### Routing Priority (revised)

Current Tier 3 (fallback) fires for ALL free text, blocking anything after it. Intent routing must slot in before fallback, and fallback must be context-aware:

| Priority | Tier | Trigger | Example |
|---|---|---|---|
| 1 | Action chip | `routing_metadata.action_chip_triggered` | Click "Learn about Mentoring" |
| 2 | CTA click | `routing_metadata.cta_triggered` | Click "Apply to Mentor" |
| 3 | AI branch hint | `<!-- BRANCH: dare2dream -->` in response | AI knows exact branch *(transitional — see note)* |
| **4** | **Intent classifier** | **Separate classification call + `routing_branches` or `intent_definitions` (see Tier 4 note below)** | **AI picks from closed list, rules resolve branch** |
| 5 | Context-aware fallback | `current_node` or `cta_settings.fallback_branch` | Stay in current branch, or main menu if no position |

**Tier 3 note (transitional):** Tier 3 uses inline `<!-- BRANCH: -->` tags embedded in the AI response — the same pattern we rejected for intent detection. It exists from V3.5 and works today, but it has the same fragility: the AI must remember to emit the tag, must use exact config branch names, and can hallucinate. Once Sprint 2's intent classifier is proven, Tier 3 becomes redundant — the classifier handles the same routing more reliably. Plan is to deprecate Tier 3 after Sprint 2 validates, leaving Tiers 1-2 (deterministic clicks) and Tier 4 (constrained classification) as the long-term routing model.

**Tier 4:** Intent detection is a **separate constrained classification call**, decoupled from response generation. Follows the Intercom Fin Attributes pattern. When `routing_branches` (Sprint 3) is present, it takes precedence — `intent_definitions` is ignored. This prevents a general intent match from shadowing more-specific routing branch rules. Tenants use one or the other; during migration, convert `intent_definitions` entries to `routing_branches` rules before enabling. When only `intent_definitions` is present (Sprint 2), it is used directly as a flat intent → branch lookup. When neither is configured, Tier 4 is skipped and Tier 5 handles routing.

**Tier 5:** Fallback is **context-aware**. If `current_node` is set (user is inside a branch), show that branch's CTAs again. Only fall back to main menu when `current_node` is null.

**Guard clause:** If both a branch hint (Tier 3) and intent classification (Tier 4) fire on the same response, Tier 3 wins — a specific branch hint is more precise than an intent label. This guard becomes unnecessary once Tier 3 is deprecated.

## Sprint 1: Session Position Tracking

Track where the user IS in the graph. No behavior change — just instrumentation.

### Session State Additions

Frontend already sends `session_context` with every request. Add:

```javascript
{
  // existing fields unchanged...
  current_node: null,        // string: branch name user is currently in
  node_history: [],          // string[]: last 5 branches visited
  last_transition: null      // { from, to, trigger, timestamp }
}
```

**Lifecycle rules:**
- `current_node` persists to `sessionStorage` (survives page refresh within tab, clears on tab close)
- `node_history` caps at 5 entries (LIFO) — serves as breadcrumb for analytics and future conditional transitions
- `last_transition` is overwritten each transition — diagnostic only
- All fields default to null/empty when missing (backward compatible with old frontends)

### Context-Aware Fallback

Ship this with Sprint 1 — it requires only `current_node` and changes one condition in the fallback tier:

```
Before: no routing match → always show fallback_branch CTAs
After:  no routing match → if current_node is set, show current_node's CTAs
                         → if current_node is null, show fallback_branch CTAs
```

This means a user inside the `dare2dream` branch who types "tell me more" stays in `dare2dream` and sees its CTAs again — not the main menu. Main menu only appears when the user has no position in the graph (first message, session reset, or genuinely off-topic).

### Files to Modify

| File | Change |
|---|---|
| `Picasso/src/context/StreamingChatProvider.jsx` | In `onDone` callback (~line 770): extract `metadata.branch`, update `current_node` and `node_history`. Persist to `sessionStorage`. |
| `Lambdas/.../response_enhancer.js` | Include `current_node` in returned metadata for all tiers. Modify fallback tier to check `current_node` before using `fallback_branch`. |

**Metadata contract:** `response_enhancer.js` must return `metadata.branch` (the resolved `target_branch` name) uniformly regardless of which tier resolved it — Tier 1 action chip, Tier 2 CTA click, Tier 3 branch hint, Tier 4 intent classification, or Tier 5 fallback. The frontend reads this single field to update `current_node`. This ensures the `current_node` tracking logic in `StreamingChatProvider.jsx` works identically across all routing paths without tier-specific handling.

### Value

- Users who type free text mid-branch stay in context (not bumped to main menu)
- Analytics see user paths through the graph
- Foundation for Sprint 2 intent routing
- `sessionStorage` persistence means page refresh doesn't lose position

## Sprint 2: Intent Classification

Constrained AI classification into predefined intents → rules map intents to branches → right CTAs appear.

### How It Works (Intercom Pattern)

**The operator defines the taxonomy in tenant config:**

```json
"cta_settings": {
  "fallback_branch": "main_navigation_hub",
  "intent_definitions": {
    "volunteering": {
      "description": "User wants to volunteer, give time, help out, or get involved with programs",
      "target_branch": "volunteer_overview"
    },
    "donating": {
      "description": "User wants to donate money, items, or make a financial contribution",
      "target_branch": "donate_info"
    },
    "mentoring": {
      "description": "User asks about mentoring youth, Dare to Dream program, or becoming a mentor",
      "target_branch": "dare2dream"
    },
    "family_support": {
      "description": "User is a family seeking help, requesting a Love Box, or asking about receiving services",
      "target_branch": "lovebox_recipient"
    }
  }
}
```

Each intent has a **description** that guides classification accuracy — same pattern as Fin Attributes. The AI picks from this closed list. It cannot invent intents.

### Separate Classification Call (not inline tags)

After the streaming response completes, a **second lightweight Bedrock call** classifies the conversation:

```
Given this conversation, classify the user's primary intent.

CONVERSATION:
User: {last user message}
Assistant: {response just generated}

POSSIBLE INTENTS:
- volunteering: User wants to volunteer, give time, help out, or get involved with programs
- donating: User wants to donate money, items, or make a financial contribution
- mentoring: User asks about mentoring youth, Dare to Dream program, or becoming a mentor
- family_support: User is a family seeking help, requesting a Love Box, or asking about receiving services
- none: No clear intent, or user is asking a general question

Respond with ONLY the intent name. If unsure, respond "none".
```

**Why post-response classification (not pre-response):** Intercom's Fin AI Engine refines queries and checks for triggerable automations *before* generating a response (Phase 1). Picasso classifies *after* the response streams. This is a deliberate choice: our streaming architecture sends the first token as fast as possible, and delaying the stream for a classification call would add 200-400ms to time-to-first-token. Post-response classification means the user sees the conversational response immediately; the routing decision (CTAs) arrives a beat later via a separate SSE event. This matches today's CTA timing — CTAs are already sent after the stream completes.

**Why separate call instead of inline tags:**
- Classification and response generation are different tasks with different optimization targets
- Response wants to be conversational. Classification wants to be precise.
- Closed vocabulary — AI picks from a list, cannot hallucinate labels
- Can use low temperature (0.1) for deterministic classification
- ~200-400ms latency, runs after stream completes (same timing as current CTA events)
- ~$0.0004 per classification (small Haiku call, ~300 input tokens, ~5 output tokens)

**Classification is skipped for deterministic flows.** When Tier 1 (action chip) or Tier 2 (CTA click) resolves routing, the classification call is not made. These are explicit user actions with known routing — running a 200-400ms classification call would add latency for no benefit. Classification only runs on free-text messages where no deterministic tier matched. This is a design choice, not just a performance optimization — Intercom's Fin Attributes are similarly only detected after a Fin block runs, not on button-click interactions.

**Normalization:** Before lookup, the extracted intent is lowercased, trimmed, and spaces collapsed to underscores. This eliminates silent failures from "Volunteering" vs "volunteering" or "family support" vs "family_support".

**Unrecognized intents** (AI returns a label not in `intent_definitions`) are logged as warnings in CloudWatch and fall through to Tier 5. This provides an observable signal for tuning descriptions.

**Future optimization — skip classification heuristic:** Intercom's Fin Attributes don't classify every message — they detect at key moments (handoff, resolution, inactivity). Our design classifies on every free-text message, which is correct for Sprint 2 (we need intent to route CTAs). But a future optimization could skip the classification call when the user is clearly continuing in the current branch — e.g., short follow-up messages, no topic-change signal, `current_node` already set. The primary risk of classifying every message is **context disruption**: a user mid-way through the `dare2dream` branch who asks "what time do sessions run?" could get reclassified to a different intent, overwriting their `current_node` and breaking their flow. Sprint 2 mitigates this partially through `"none"` returns (classifier should return `none` for follow-up questions that don't signal a topic change), but a skip heuristic would eliminate the risk entirely.

### Sprint 2 Gate Condition

**Before writing any routing code**, validate the classification prompt against real conversation transcripts:
- Test 20+ real user messages from CloudWatch logs
- Measure classification accuracy (target: >90% correct on clear-intent messages)
- Measure "none" rate on ambiguous messages (should be high — false positives are worse than misses)
- If accuracy is below threshold, tune descriptions before proceeding

### Feature Flag

`WORKFLOW_TRACKING` in tenant `feature_flags` gates all workflow engine behavior. One flag, cumulative scope:

- After Sprint 1 ships: flag controls `current_node` tracking and context-aware fallback. Disabling reverts fallback to always showing `fallback_branch` CTAs (pre-Sprint 1 behavior). Session tracking stops.
- After Sprint 2 ships: flag additionally controls intent classification and Tier 4 routing. Disabling reverts both Sprint 2 (no classification call, no Tier 4) and Sprint 1 (no context-aware fallback, no tracking). Full revert to pre-Sprint behavior.

This is a single kill switch — not granular per-sprint. If intent routing misfires, disabling the flag takes the entire workflow engine offline and reverts to the v92 baseline (Tier 3 fallback for all free text). Granular control (disable classification but keep session tracking) is not supported; if needed, implement as a separate `INTENT_CLASSIFICATION` flag in the future.

### Files to Modify

| File | Change |
|---|---|
| `Lambdas/.../response_enhancer.js` | Add `classifyIntent()` function (~30 lines) — builds classification prompt from `intent_definitions`, makes synchronous Bedrock call, normalizes result, returns intent or null. Add Tier 4 intent routing section (~40 lines) before fallback tier. |
| `Lambdas/.../index.js` | Call `classifyIntent()` after streaming completes, pass result to `enhanceResponse()`. Guard behind `WORKFLOW_TRACKING` flag. |
| `Picasso/src/context/StreamingChatProvider.jsx` | Store `detected_intent` from response metadata in session state. |

### Example Flow

1. User clicks "Learn about Mentoring" → **Tier 1** → `dare2dream` branch CTAs → `current_node: "dare2dream"`
2. User types "tell me more about this" → No intent match → **Tier 5** (context-aware fallback) → stays in `dare2dream`, shows its CTAs again
3. User types "Actually, how do I donate?" → Classification returns `donating` → **Tier 4** → `intent_definitions["donating"].target_branch` → `donate_info` branch CTAs
4. User types "What's your office address?" → Classification returns `none` → **Tier 5** → stays in `donate_info` (current node)

### What Changes for Users

- Free text about a specific topic → CTAs for that topic (not generic main menu)
- Free text with no clear intent while inside a branch → stay in that branch (not bumped to main menu)
- Free text with no clear intent and no current node → fallback main menu (same as today)
- All explicit click flows unchanged

## Sprint 3 (future): If/Else Branching

Sprint 2 maps one intent → one branch. Sprint 3 adds sequential if/else conditions that can check any signal — same pattern Intercom uses for workflow branching.

### How Intercom Does It

Intercom's workflow branches are **sequential if/else**, not a rules engine:
- Each branch checks **one condition** (attribute `IS`, `IS NOT`, or `CONTAINS` a value)
- Conditions evaluate **top-to-bottom in creation order**
- **First match wins** — no other path fires
- An **Else branch** catches everything that didn't match
- Operators are simple: `is` (exact), `is_not` (exact), `contains` (case-insensitive partial match)

No deeply nested boolean trees. No weighted priorities. Intercom does allow multiple AND conditions on a single branch (e.g., "Last seen < 14 days AND browser language is English"), but the structure stays flat — no nested OR-of-ANDs. The power comes from the data available to conditions, not from logic complexity.

### Picasso Equivalent

Replace Sprint 2's flat `intent_definitions` lookup with an ordered if/else chain:

```json
"routing_branches": [
  {
    "name": "Returning volunteer",
    "if": { "signal": "intent", "is": "volunteering" },
    "and": { "signal": "completed_forms", "contains": "volunteer_apply" },
    "then": { "target_branch": "volunteer_returning" }
  },
  {
    "name": "New volunteer",
    "if": { "signal": "intent", "is": "volunteering" },
    "then": { "target_branch": "volunteer_overview" }
  },
  {
    "name": "Donation interest",
    "if": { "signal": "intent", "is": "donating" },
    "then": { "target_branch": "donate_info" }
  },
  {
    "name": "Family seeking help",
    "if": { "signal": "intent", "is": "family_support" },
    "then": { "target_branch": "lovebox_recipient" }
  }
]
```

**Else** is implicit — if no branch matches, Tier 5 (context-aware fallback) handles it. Same as Intercom's else branch catching unmatched conversations.

**Evaluation:** Top-to-bottom, first match wins. "Returning volunteer" is checked before "New volunteer" — order matters and is the operator's responsibility. This is identical to how Intercom workflows evaluate branches.

**Operators:**

| Operator | Behavior | Example |
|---|---|---|
| `is` | Exact match (case-insensitive after normalization) | `intent is "volunteering"` |
| `is_not` | Negation | `current_node is_not "donate_info"` |
| `contains` | For arrays: checks if value is a member of the array. For strings: case-insensitive substring match. | `completed_forms contains "volunteer_apply"` |

**Type coercion:** All signal values are coerced to strings before comparison. Numeric signals like `turn_count` are compared as strings (`"3"`, not `3`). Config values must always be strings.

**Optional `and` clause:** A branch can have **exactly one** additional condition — no more. Config validation must reject branches with multiple `and` clauses. This is a deliberate simplification — Intercom allows multiple ANDs per branch, but we cap at one to keep the config readable and the evaluator trivial. This covers the 90% case (intent + one qualifying check). If a use case genuinely requires 3+ conditions, split it into separate ordered branches — the first-match-wins ordering handles it. The cap can be relaxed later without breaking existing configs.

### Available Signals

| Signal | Source | Example |
|---|---|---|
| `intent` | Sprint 2 classification | `intent is "donating"` |
| `current_node` | Sprint 1 session state | `current_node is "dare2dream"` |
| `completed_forms` | Existing session context | `completed_forms contains "volunteer_apply"` |
| `node_history` | Sprint 1 session state (capped at 5 entries — older branches silently drop off) | `node_history contains "donate_info"` |
| `turn_count` | Existing conversation state (coerced to string for comparison) | `turn_count is_not "1"` |

### Migration from Sprint 2

Sprint 2's `intent_definitions` is a flat intent → branch map. Sprint 3's `routing_branches` is a superset — every `intent_definitions` entry becomes a one-line branch with `if: intent is X, then: target_branch Y`. When `routing_branches` is present, it fully replaces `intent_definitions` for routing (see Tier 4 note). Migration path: convert all `intent_definitions` entries to `routing_branches` rules, then remove `intent_definitions`. Tenants that don't need conditional logic can stay on `intent_definitions` indefinitely — it continues to work as the sole Tier 4 lookup when `routing_branches` is absent.

### What This Enables

The same "returning volunteer" vs "new volunteer" example, but also:
- Skip the donation branch if user already donated: `if: intent is "donating"` + `and: completed_forms contains "donate"` → thank-you branch
- Stay in current context for follow-up questions: handled by Tier 5 (no branch needed)
- Route differently based on conversation depth: `if: turn_count is_not "1"` + deeper engagement path

## Future Considerations (not in scope)

These are natural extensions acknowledged but explicitly deferred:

- **Deprecate Tier 3** — Once Sprint 2's intent classifier is proven, remove inline `<!-- BRANCH: -->` tag routing. The long-term routing model is: deterministic clicks (Tiers 1-2) + constrained classification (Tier 4) + context-aware fallback (Tier 5). Three tiers, not five.
- **Node types** — Adding `node_type` field to branches (form, handoff, confirmation) to support richer node dispatch. Currently all nodes are implicit branch type.
- **Escalation as parallel detection** — Intercom treats escalation as a two-layer system separate from topic classification: Escalation Rules (data-driven: sentiment = negative, VIP customer = true) and Escalation Guidance (natural language: "escalate if user mentions legal action"). Their dedicated model achieves >98% accuracy. Critically, escalation is **not a competing intent value** — a user can simultaneously have a topic intent (volunteering) and an escalation signal (frustration). Encoding escalation as an intent value would force the classifier to choose, losing the topic signal at the moment it's most needed for routing the escalation. For Picasso, the classification call should return two fields: `{intent: "volunteering", escalation: true}`, not `{intent: "escalation"}`. This is a simple prompt change — add "Is the user showing escalation signals (requesting a human, expressing frustration, stuck in a loop)? yes/no" as a second question in the same Bedrock call. The escalation flag then routes to a special action type — today that's a CTA opening an email form or external contact link; eventually it could trigger a live handoff integration. No new infrastructure needed beyond the prompt change and an action handler for the escalation action type.
- **Hierarchical intent classification** — Intercom supports conditional (parent/dependent) attributes: "Delivery Carrier" only appears when "Issue" = "Delivery". At 4-5 intents, a flat list is manageable. At 15-20 intents across a complex tenant, the classification prompt becomes unwieldy and accuracy drops. A future extension: classify broad category first (e.g., "service type"), then sub-classify within it (e.g., "volunteer stage"). This keeps each classification call focused and the prompt small.
- **Server-side session state** — Storing `current_node` in DynamoDB for cross-session memory ("welcome back, you were looking at mentoring"). Currently browser-session scoped only.
- **Audience filtering on triggers** — Intercom filters who enters workflows based on user attributes (person data, company data, page URL). For Picasso, this could mean different welcome flows based on referral source or returning visitor status. Page URL is the most immediately useful signal.
- **Loop detection** — Context-aware fallback (Tier 5) can trap users in a loop: ambiguous messages → stay in current branch → same CTAs → repeat. Intercom handles this with explicit loop detection — after 3 rounds of repeated messages without new information, Fin offers escalation. Picasso should add a similar mechanism: if the user sends N consecutive free-text messages that all resolve to Tier 5 with the same `current_node`, surface an escalation option or reset to main menu. This is structurally related to escalation detection and could use the same parallel-detection mechanism.
- **Testable routing function** — Extract the tier routing into a pure function with unit tests covering all tier combinations and conflicts.
- **AI-driven procedures (Intercom's Procedures model)** — Intercom's Fin 3 introduced Procedures: natural language SOPs with deterministic controls (branching logic, Python code snippets, data connectors, human checkpoints). Unlike rigid workflows with reply buttons, Procedures let the AI reason **non-linearly** across steps — skip irrelevant steps, revisit earlier steps, and switch between sub-procedures when customer intent changes mid-conversation. This non-linear step navigation is the key distinction from sequential forms. Procedures are **intent-triggered only** (no button triggers), meaning they require Sprint 2's intent classification infrastructure as a prerequisite. For Picasso, this maps to an evolution of conversational forms: the AI follows a structured qualification or troubleshooting sequence with deterministic validation at each step, but navigates the sequence adaptively rather than rigidly field-by-field. A user filling out a volunteer application who mentions they've already completed orientation lets the AI skip that step, not present it as the next required field. This is the bridge between our free-form AI responses (Step 2) and our rigid branch paths — and it's the highest-leverage future capability for complex use cases like volunteer qualification or donation processing.
- **Config builder integration** — Sprint 3's `routing_branches` need a visual editor. Intercom's power comes from the workflow builder UI, not the schema. Branch ordering UX is critical — operators need to understand that order matters (first match wins).

## Verification

### Sprint 1
- Deploy Lambda + frontend
- Click action chip → check CloudWatch for `current_node` in metadata
- Type free text while inside a branch → verify CTAs stay in current branch (not main menu)
- Refresh page → verify `current_node` survives (sessionStorage)
- Verify `node_history` accumulates across turns

### Sprint 2
- **Prompt validation first** — test classification prompt against 20+ real transcripts before writing routing code
- Add `intent_definitions` to test tenant config
- Type "Tell me about Love Box" → expect `lovebox_recipient` branch CTAs
- Type "I want to donate" → expect `donate` branch CTAs
- Type "What's the weather?" → expect no intent match, falls to current node or fallback
- Type "Volunteering" (capital V) → verify normalization handles it
- CloudWatch: check for `detected_intent` and unrecognized intent warnings
- **Rollback test**: disable `WORKFLOW_TRACKING` flag → verify system reverts to Tier 5 fallback for all free text

### Sprint 3
- Add `routing_branches` to test tenant config with "Returning volunteer" + "New volunteer" branches
- Complete the volunteer form → type "I want to volunteer again" → expect `volunteer_returning` branch (not `volunteer_overview`)
- Type "I want to volunteer" without prior form completion → expect `volunteer_overview` branch
- Verify branch ordering: swap two branches in config → confirm first-match-wins behavior changes
- Verify `routing_branches` fully replaces `intent_definitions` when present (no shadowing)
- Remove `routing_branches` from config → verify `intent_definitions` handles routing alone as fallback
- **Rollback test**: disable `WORKFLOW_TRACKING` → verify full fallback behavior
