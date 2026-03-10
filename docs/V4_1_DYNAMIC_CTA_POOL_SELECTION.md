# V4.1: Dynamic CTA Pool Selection

## Context

The V4 pipeline (shipped) replaced V3.5's flawed "AI picks CTA IDs" with a three-layer architecture: conversation (Step 2) → classification (Step 3a) → deterministic routing (Step 3b). This fixed the canonical misfire problem, but Step 3b still routes to **predetermined conversation branches** — fixed CTA groupings that must be hand-mapped by the operator for every topic.

The operator's vision: the CTA inventory should be the source of truth. The code should dynamically surface relevant CTAs based on conversation context — learning CTAs early, action CTAs when the user is engaged — without requiring manual branch definitions for every path. The conversation should feel organic, with the user in the driver's seat and the code assisting the journey.

**What already exists but isn't being used:**
- Every CTA has `selection_metadata.topic_tags`, `depth_level` (info/action/lateral), `role_axis` (give/receive/learn/connect)
- Frontend tracks `turns_since_click`, `accumulated_topics`, `recently_shown_ctas`, `detected_role` in `session_context`
- Lambda receives `session_context` from frontend but only uses `completed_forms`

## Architecture: One Pool, One Algorithm

### Three-Layer Separation (preserved)

| Layer | Job | Knows about |
|---|---|---|
| Step 2 | Talk naturally | Persona, KB, history |
| Step 3a | Classify topic + role | User messages, topic taxonomy |
| Step 3b | Select CTAs from pool | Topic tags, CTA metadata, session depth |

Each layer is still independent. Step 2 doesn't know topics exist. Step 3a doesn't know CTAs exist. Step 3b has no AI.

### What changes

| Current (V4) | New (V4.1) |
|---|---|
| `intent_definitions` with `target_branch` / `cta_id` | `topic_definitions` with `tags` and `role` |
| `routeFromClassification()` → branch lookup | `selectCTAsFromPool()` → dynamic pool filter |
| `conversation_branches` required for CTA grouping | Branches optional (Tier 1-2 only in Phase 1) |
| Fixed CTA sets per branch (operator maps every path) | CTA metadata drives selection (operator maintains inventory) |
| Session context mostly ignored | Session context drives depth decisions |

---

## Step 3a: Topic Classification (modified)

### Config: `topic_definitions`

Replaces `intent_definitions`. Same classification role but without routing instructions.

```json
"topic_definitions": [
  {
    "name": "mentoring_give",
    "description": "Visitor wants to BECOME a mentor — applying, requirements, training. NOT when a youth or family is asking about RECEIVING mentorship.",
    "tags": ["dare_to_dream", "mentor"],
    "role": "give"
  },
  {
    "name": "mentoring_receive",
    "description": "Foster youth (ages 11-22) or guardian wanting to RECEIVE mentorship — getting a mentor, program benefits, how to sign up as a mentee. NOT when someone wants to BECOME a mentor.",
    "tags": ["dare_to_dream", "mentor", "enroll"],
    "role": "receive"
  },
  {
    "name": "lovebox_give",
    "description": "User wants to BECOME a Love Box volunteer or sponsor — how to help, sign up, apply. NOT when someone is asking about receiving services for their own family.",
    "tags": ["love_box", "volunteer"],
    "role": "give"
  },
  {
    "name": "lovebox_receive",
    "description": "Foster family wanting to RECEIVE Love Box services — enrollment, eligibility, what's included. NOT volunteering.",
    "tags": ["love_box", "enroll"],
    "role": "receive"
  },
  {
    "name": "donating",
    "description": "User wants to donate — money, items, gifts, holiday giving, financial contributions.",
    "tags": ["donate", "items", "holiday"],
    "role": "give"
  },
  {
    "name": "general_inquiry",
    "description": "General question about the organization — mission, history, programs overview, what Austin Angels does."
  },
  {
    "name": "contact_human",
    "description": "User wants to speak with a real person — phone, email, or direct human contact.",
    "tags": ["contact"],
    "role": "connect"
  }
]
```

**Fields:**
- `name` (required): Identifier for logging/analytics
- `description` (required): Operator-authored text shown to classifier for disambiguation
- `tags` (optional): Array of topic_tags that map to CTA `selection_metadata.topic_tags`
- `role` (optional): Maps to CTA `selection_metadata.role_axis` — disambiguates give vs receive
- `depth_override` (optional): `"action"` — bypasses depth gate for "I'm ready NOW" intents

**No `target_branch`. No `cta_id`.** All CTA selection is dynamic.

### Classification Prompt

Same structure as current — user messages + taxonomy. No CTA knowledge, no persona, no KB.

```
You are a conversation classifier. Read the customer messages below and identify
which topic best matches, using only the taxonomy provided.

CUSTOMER MESSAGES (most recent last):
- {prior_user_messages}
- {current_message}

TOPIC TAXONOMY:
{topic.name}: {topic.description}
...

Return ONLY the topic name that matches, or null if no topic matches.
Do not explain. Do not select multiple topics. Do not invent new topics.
```

**Function:** `classifyTopic()` — same mechanics as current `classifyIntent()` (non-streaming Bedrock call, temp 0.1, max_tokens 50, parse to known name or null).

### Validation

`validateTopicDefinitions(config)` — same rules as current `validateIntentDefinitions()`:
- Every entry must have non-empty `name` and `description`
- `tags` must be an array of strings if present
- `role` must be a known value if present
- Log warnings for invalid entries, filter them out

---

## Step 3b: Dynamic Pool Selection (new)

### Core Function: `selectCTAsFromPool(topicName, config, sessionContext)`

**This replaces `routeFromClassification()` and all branch/CTA lookup functions.**

```
Input:
  topicName: string | null (from classifier)
  config: full tenant config (has cta_definitions, topic_definitions, cta_settings)
  sessionContext: { accumulated_topics, recently_shown_ctas, turns_since_click,
                    completed_forms, detected_role, ctas_clicked }

Output:
  { ctaButtons: [...], metadata: { routing_tier, classified_topic, depth, ... } }
```

### Algorithm

```
1. RESOLVE TOPIC
   if topicName → look up topic_definitions[topicName] → get tags[], role
   if null → use cta_settings.fallback_tags (e.g. ["programs", "contact"])

2. FILTER POOL
   Start with all CTAs from cta_definitions where ai_available === true
   Filter: CTA.topic_tags must intersect with resolved tags
   Role filter: if topic has role →
     Keep CTA if: CTA.role_axis === topic.role
              OR  CTA.role_axis === "learn"    (learn is universal — always passes)
              OR  CTA has no role_axis
   (This prevents filtering out learning CTAs like "Learn about Dare to Dream"
    when the topic role is "give" or "receive")

3. DETERMINE DEPTH
   Call determineDepthPreference(tags, sessionContext, topicDef):
     - If topicDef.depth_override === "action" → "action"
     - If PRIMARY topic tag overlaps with sessionContext.accumulated_topics → "action"
       (Primary tag = tags[0], the program-level tag like "dare_to_dream" or "love_box".
        Cross-topic utility tags like "volunteer" and "enroll" must NOT drive
        depth escalation alone — only the first/primary tag is checked.)
     - Otherwise → "info" (first encounter with this topic — learn first)
   NOTE: turns_since_click is NOT used as a standalone depth trigger in Phase 1.
   Add after observing real conversation patterns in production logs.

4. APPLY DEPTH GATE
   If depth === "info":
     Keep CTAs where depth_level === "info" OR lateral_eligible === true
   If depth === "action":
     Keep ALL CTAs (info + action + lateral)
     Sort: action-depth first, then info-depth (action CTAs are primary)

5. SORT (within depth tier)
   CTAs at the same depth_level are sorted by:
     a. selection_metadata.priority (optional integer, lower = higher priority, default 50)
     b. If equal priority, prefer CTAs whose topic_tags have MORE overlap with resolved tags
     c. If still tied, insertion order in config (stable sort)
   This is deterministic — same input always produces same ordering.

6. DEDUP & FILTER
   Remove CTAs whose id is in sessionContext.recently_shown_ctas
   Remove form CTAs whose program is in sessionContext.completed_forms

7. ZERO-RESULT HANDLING
   If pool is empty after all filters:
     If a classified topic exists → retry with cta_settings.fallback_tags
     If still empty → return { ctaButtons: [], metadata } (AI response stands alone)
   No error thrown. Empty CTA array is a valid state.

8. SELECT & RETURN
   Take top 3 CTAs
   First CTA gets _position: "primary", rest get "secondary"
   Return { ctaButtons, metadata }
```

### Depth Preference Logic

The depth gate is the heart of the "learn before act" principle:

| Signal | Meaning | Depth |
|---|---|---|
| Primary topic tag NOT in `accumulated_topics` | First time on this topic | info |
| Primary topic tag IN `accumulated_topics` | Been here before | action |
| `depth_override: "action"` on topic def | Operator: this intent is always action-ready | action |

**Phase 1 omits `turns_since_click` as a depth trigger.** No production data exists to validate a threshold. Add in Phase 2 after observing real conversation patterns.

**Primary tag rule:** Only `tags[0]` (the program-level tag) is checked against `accumulated_topics`. This prevents cross-topic tags like "volunteer" or "enroll" from causing premature depth escalation when the user switches topics.

**This is deterministic.** Same inputs → same depth decision. No AI.

### Null Handling

When classifier returns null:
- Use `cta_settings.fallback_tags` (e.g., `["programs", "contact"]`)
- Run same pool selection algorithm
- Returns general learning CTAs
- No error, conversation continues

### Conversation Context Round-Trip

The Lambda must send back `conversation_context` in CTA metadata so the frontend can update its tracking:

```json
{
  "type": "cta_buttons",
  "ctaButtons": [...],
  "metadata": {
    "routing_tier": "v4_pool",
    "classified_topic": "donating",
    "depth": "info",
    "conversation_context": {
      "matched_topics": ["donate", "items", "holiday"],
      "selected_ctas": ["donate_individual", "shopday", "general_giving"]
    }
  }
}
```

Frontend reads `conversation_context` → updates `accumulated_topics`, `recently_shown_ctas`, increments `turns_since_click`. **This loop is already implemented in `StreamingChatProvider.jsx:779-808`** — it just needs the Lambda to send the data.

---

## Example Flows

### Flow 1: Organic Donation Journey

**Turn 1:** User types "I want to donate"
- Step 2: AI responds about donation options from KB
- Step 3a: Classified → `donating` (tags: donate, items, holiday; role: give)
- Step 3b: depth=info (first mention of donate topic)
  - Pool filter: topic_tags ∩ [donate, items, holiday], role_axis=give, depth_level=info
  - **CTAs: "Donate as Individual" (send_query), "Holiday Shop Day" (info link), "Other Ways to Give" (info link)**

**Turn 2:** User types "Tell me more about donating items"
- Step 2: AI responds about item donations from KB
- Step 3a: Classified → `donating` (same tags)
- Step 3b: depth=action (donate topics already in accumulated_topics)
  - Pool filter: same tags, role=give, ALL depths (action first)
  - **CTAs: "Make a Donation" (external link), "Donate as Group" (form), "Donate Items" (form)**

**Turn 3:** User clicks "Donate Items" → enters form

### Flow 2: Mentoring Disambiguation

**Turn 1:** User types "My son needs a mentor"
- Step 3a: Classified → `mentoring_receive` (tags: dare_to_dream, mentor, enroll; role: receive)
- Step 3b: depth=info (first mention)
  - Pool filter: tags match, role_axis=receive, depth_level=info
  - **CTAs: "Learn about Dare to Dream" (send_query), D2D manual downloads**

**Turn 2:** User types "How do we sign up?"
- Step 3a: Classified → `mentoring_receive` (same)
- Step 3b: depth=action (topic already in accumulated)
  - **CTAs: "Request a Youth Mentor" (form)**

### Flow 3: General → Specific

**Turn 1:** User types "What does Austin Angels do?"
- Step 3a: Classified → `general_inquiry` (no tags, no role)
- Step 3b: Use fallback_tags → general learning CTAs
  - **CTAs: "About Austin Angels" (send_query), "Our Programs" (show_info), "Contact Us" (send_query)**

**Turn 2:** User types "Tell me about volunteering"
- Step 3a: Classified → `lovebox_give` (tags: love_box, volunteer; role: give)
- Step 3b: depth=info (first mention of love_box/volunteer)
  - **CTAs: "Learn about Love Box" (send_query), "What's in a Love Box?" (send_query)**

**Turn 3:** User types "I want to sign up"
- Step 3a: Classified → `lovebox_give` (same)
- Step 3b: depth=action (topic already in accumulated)
  - **CTAs: "Apply to be a Love Box Volunteer" (form)**

---

## Phased Implementation

### Phase 1 (this sprint): Dynamic pool for organic conversation

**Scope:** Replace branch routing for Tier 3 (freeform messages). Keep Tier 1-2 (explicit clicks) using existing `enhanceResponse()` path.

**Files modified:**

| File | Changes |
|---|---|
| `prompt_v4.js` | Add: `buildTopicClassificationPrompt()`, `classifyTopic()`, `selectCTAsFromPool()`, `determineDepthPreference()`, `validateTopicDefinitions()`. Keep: `buildV4ConversationPrompt()` (Step 2 unchanged). Remove: `routeFromClassification()`, `resolveFallbackBranch()`, `resolveBranchCTAs()`, `resolveSingleCTA()`. Rename: `classifyIntent()` → `classifyTopic()` (same mechanics, new name). |
| `index.js` | Modify post-stream routing (lines 755-838): Replace `classifyIntent()` + `routeFromClassification()` with `classifyTopic()` + `selectCTAsFromPool()`. Add `conversation_context` to CTA SSE metadata. Import new functions. Same change for buffered path (lines 1104-1150). |
| S3: TESTV4AUS config | Replace `intent_definitions` with `topic_definitions`. Add `cta_settings.fallback_tags`. Keep `conversation_branches` (still needed for Tier 1-2). |

**Not modified:**
- `response_enhancer.js` — still used for Tier 1-2
- Picasso frontend — session context tracking already works, SSE format unchanged
- Step 2 prompt — no changes
- Action chips — still use `target_branch` for Tier 1-2

### Phase 2 (future): Pool selection for all paths

- Migrate Tier 1-2 to pool selector (action chips send `tags` instead of `target_branch`)
- Remove `conversation_branches` from config entirely
- Action chips get `tags` and `role` metadata instead of `target_branch`
- `enhanceResponse()` no longer needed for CTA routing

---

## Config Changes (Phase 1)

### New: `topic_definitions`

Replaces `intent_definitions`. Schema above.

### New: `cta_settings.fallback_tags`

```json
"cta_settings": {
  "fallback_tags": ["programs", "contact"],
  "fallback_branch": "fallback"
}
```

`fallback_tags` used by pool selector when classifier returns null. `fallback_branch` kept for Tier 1-2.

### Unchanged

- `cta_definitions` — no modifications, metadata already sufficient
- `conversation_branches` — kept for Tier 1-2 in Phase 1
- `feature_flags.V4_PIPELINE` — still the gate
- `action_chips` — still use `target_branch`

### Removed

- `intent_definitions` — replaced by `topic_definitions`
- `topic_vocabulary` — tags on topic_definitions replace this
- `topic_clusters` — tags on topic_definitions replace this
- `intent_map` — already deprecated

---

## Verification

### Test the depth gate
1. Send "I want to donate" → expect info-depth CTAs (learning options)
2. Send "Tell me about item donations" → expect action-depth CTAs (forms, links)
3. Send "What is Austin Angels?" → expect fallback learning CTAs

### Test disambiguation
4. Send "My son needs a mentor" → expect receive-role CTAs (Request a Mentor)
5. Send "I want to become a mentor" → expect give-role CTAs (Apply to Mentor)

### Test dedup
6. Send same topic twice → second response should not repeat CTAs from first

### Test null handling
7. Send "What's the weather?" → null classification → fallback CTAs, no error

### Test Tier 1-2 preservation
8. Click action chips → verify they still route through `enhanceResponse()` correctly

### Inspect CloudWatch
9. Verify classification prompt contains only user messages + taxonomy
10. Verify `conversation_context` in CTA metadata includes `matched_topics`, `selected_ctas`

---

## Review Findings (Incorporated)

Tech lead review identified five issues. All are resolved in this plan:

| # | Finding | Resolution |
|---|---|---|
| 1 | Role filter too aggressive — `role_axis: "learn"` CTAs filtered out when topic role is "give" | Role filter now passes `role_axis === "learn"` universally (Step 2 FILTER POOL) |
| 2 | Tag bleed — cross-topic utility tags cause premature depth escalation | Only primary tag (`tags[0]`) checked against `accumulated_topics` (Step 3 DETERMINE DEPTH) |
| 3 | `turns_since_click > 2` threshold unvalidated | Removed from Phase 1. Add after observing production patterns. |
| 4 | Intra-depth CTA sort order unspecified | Explicit sort: `priority` field → tag overlap count → insertion order (Step 5 SORT) |
| 5 | Zero-result pool path unspecified | Retry with `fallback_tags`, then return empty array (Step 7 ZERO-RESULT HANDLING) |

### Additional Notes from Review

- **Atomic deployment required**: `prompt_v4.js` and `index.js` must deploy together — cannot remove old exports before new ones are wired
- **Verify `session_context` round-trip**: Before implementation, trace one live conversation in CloudWatch to confirm `accumulated_topics` and `recently_shown_ctas` actually arrive from the frontend. If they don't come through, the depth gate is moot.
- **New optional CTA field**: `selection_metadata.priority` (integer, lower = higher priority, default 50) — used for deterministic intra-depth sorting. Existing CTAs work without it.
- **Operator authoring**: Phase 2 should include config-builder UX for topic tag and depth assignment on CTAs
