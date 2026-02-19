# V3.5.1: CTA Vocabulary Accuracy Implementation Plan

## Context

V3.5 Tag & Map is implemented and tested on staging. The AI picks action IDs from a predefined vocabulary, code maps them to CTA buttons. This plan improves selection accuracy with two levers plus a link handling change:

1. **Lever 1 (High priority):** Annotate the vocabulary with click history so the AI knows what the user already engaged with — W5 reasoning handles the rest
2. **Lever 2 (Medium priority):** Intent-aware descriptions (`vocab_hint`) — tell the AI *when* to offer each button, not just *what* it is
3. **Link handling:** Soften prompt rule so KB referral URLs can appear inline in responses

The CTA vocabulary remains fully tenant-configurable. Each tenant's config defines whatever `forms`, `queries`, and `links` entries make sense for their use case.

### Backward Compatibility

The v3.5 vocabulary system and the existing branch/routing CTA system (Tiers 1-3) coexist cleanly:

| System | Tenants | How CTAs are generated | Impact |
|--------|---------|----------------------|--------|
| **Branch CTAs** (Tiers 1-3) | Existing tenants with `conversation_branches` + `cta_definitions` | Config-driven explicit routing | **Unaffected** — priority waterfall checks branches first |
| **v3.5 Tag & Map** | New/migrated tenants with `available_actions` + `DYNAMIC_ACTIONS: true` | AI picks from vocabulary via `<!-- NEXT: ... -->` tags | **Improved** by this plan |

The priority waterfall in `enhanceResponse()` ensures no conflicts: explicit routing (branches) always wins over AI-generated actions. These changes only touch the v3.5 AI path.

Source doc: `docs/CTA_VOCABULARY_ACCURACY_ROADMAP.md`

---

## Files to Modify

| File | Changes |
|------|---------|
| `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/index.js` | vocab_hint in builder, vocab_id in mapper, click annotation, link prompt softening |
| `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/test-tenant-config.json` | Add vocab_hint fields, adjust link entries for test tenant |
| `Picasso/src/context/StreamingChatProvider.jsx` | recordCtaClick callback, ctas_clicked in session context |
| `Picasso/src/components/chat/MessageBubble.jsx` | Call recordCtaClick on CTA click |
| `Picasso/src/context/HTTPChatProvider.jsx` | Mirror recordCtaClick for HTTP fallback path |

---

## Implementation Steps

### Step 1: Add `vocab_hint` to tenant config

**File:** `test-tenant-config.json`

Add intent-aware `vocab_hint` fields to all entries. Each tenant's config is independently authored — no system-level rules about which entries belong.

```json
"available_actions": {
  "forms": {
    "lb_apply": {
      "label": "Apply to Love Box",
      "description": "Volunteer application for the Love Box program",
      "vocab_hint": "They're curious about Love Box but haven't heard details yet",
      "direct_cta": false
    },
    "dd_apply": {
      "label": "Apply to Dare to Dream",
      "description": "Mentor application for the Dare to Dream program",
      "vocab_hint": "They're curious about Dare to Dream but haven't heard details yet",
      "direct_cta": false
    }
  },
  "queries": {
    "get_involved": {
      "label": "How to Get Involved",
      "query": "What does the volunteer process look like? How do I get started?",
      "vocab_hint": "They want to understand the volunteer process or how to get started"
    },
    "discovery": {
      "label": "Schedule Discovery Session",
      "query": "How do I schedule a discovery session?",
      "vocab_hint": "They're ready to take a next step and want a personal conversation"
    }
  },
  "links": {
    "donate": {
      "label": "Make a Donation",
      "url": "https://atlantaangels.org/donate",
      "vocab_hint": "They've expressed interest in donating or financial support"
    }
  }
}
```

### Step 2: Vocabulary builder uses `vocab_hint`

**File:** `index.js` — `buildV3Prompt()` (lines 1935-2013)

**2a.** Extend entry objects to carry `vocabHint`:
- `formEntries.push(...)` (line 1944): add `vocabHint: info.vocab_hint || null`
- `queryEntries.push(...)` (line 1962): add `vocabHint: info.vocab_hint || null`
- `linkEntries.push(...)` (line 1970): add `vocabHint: info.vocab_hint || null`

**2b.** Update vocabulary block rendering to prefer `vocabHint`:
- Explore: `learn:${f.formId} — ${f.vocabHint || 'Tell them more about ' + name}`
- Ask: `query:${q.queryId} — ${q.vocabHint || q.label}`
- Links: `link:${l.linkId} — ${l.vocabHint || l.label}`

Backward compatible — falls back to current auto-generated text if `vocab_hint` absent.

### Step 3: Add `vocab_id` to action objects

**File:** `index.js` — `mapNextTagsToActions()` (lines 1823-1886)

Add `vocab_id: trimmed` to every `actions.push({...})` call (4 places: learn, apply, query, link). This passes the full prefixed ID (e.g., `learn:lb_apply`) through SSE to the frontend so it can track which vocabulary items were clicked.

### Step 4: Track `ctas_clicked` in frontend

**4a. StreamingChatProvider.jsx** — Add `recordCtaClick` callback (after `recordFormCompletion`, ~line 1363):

```javascript
const recordCtaClick = useCallback((vocabId) => {
  if (!vocabId) return;
  const turn = messages.filter(m => m.role === 'user').length;
  setSessionContext(prev => {
    const ctasClicked = prev.ctas_clicked || [];
    if (ctasClicked.some(entry => entry.id === vocabId)) return prev; // dedup
    const updated = {
      ...prev,
      ctas_clicked: [...ctasClicked, { id: vocabId, turn }]
    };
    saveToSession('picasso_session_context', updated);
    return updated;
  });
}, [messages]);
```

- Add `ctas_clicked: []` to session context default (line 344)
- Expose `recordCtaClick` in context value (line ~1431)

**4b. MessageBubble.jsx** — Call `recordCtaClick` in `handleCtaClick` (line ~689, before action branching):

```javascript
const { ..., recordCtaClick } = useChat();
// Inside handleCtaClick, early:
if (cta.vocab_id && recordCtaClick) {
  recordCtaClick(cta.vocab_id);
}
```

**4c. HTTPChatProvider.jsx** — Mirror same changes (recordCtaClick callback, ctas_clicked init, context export).

### Step 5: Annotate vocabulary with click history

**File:** `index.js` — `buildV3Prompt()` (after vocabulary block, before RESPOND section)

Instead of removing clicked items from the vocabulary, keep the full menu and add context so W5 reasoning can handle it intelligently:

```javascript
const ctasClicked = sessionContext?.ctas_clicked || [];
if (ctasClicked.length > 0) {
  vocabBlock += '\nUser has already engaged:\n';
  ctasClicked.forEach(entry => {
    vocabBlock += `  ${entry.id} (turn ${entry.turn})\n`;
  });
}
```

This produces:
```
User has already engaged:
  learn:lb_apply (turn 2)
  query:get_involved (turn 4)
```

**Why annotate instead of filter:**
- W5 WHEN ("What have I already told them?") uses this context naturally
- AI retains the ability to re-offer a CTA if the user's intent genuinely calls for it
- Adds information (safe), not constraints (latency risk per v71-v76 lesson)
- If annotation proves insufficient, the infrastructure (vocab_id + ctas_clicked) supports upgrading to hard pre-filtering later

### Step 6: Soften link prompt rule

**File:** `index.js` — `buildV3Prompt()`

**Line 1899 (persona suffix):**
```
Buttons appear below your message for actions. Include referral URLs from the knowledge base when relevant, but never create action buttons or CTAs in your text.
```

**Line 2070 (WRITE section):**
```
- Include relevant URLs from the knowledge base naturally (e.g., "Learn more at example.org/page")
- Never create action buttons or fake CTAs in your text — real buttons appear below automatically
```

---

## Deployment Order

1. **Lambda deploy** (Steps 1-3, 5-6): All `index.js` + config changes. Safe before frontend deploys — `ctas_clicked` defaults to `[]`.
2. **Picasso frontend deploy** (Step 4): Enables CTA click tracking. Annotation becomes live.
3. **Upload tenant config to S3** (Step 1): `vocab_hint` fields.

## Verification

1. Build Lambda: `cd Lambdas/lambda/Bedrock_Streaming_Handler_Staging && npm run package`
2. Deploy + publish new version, update staging alias
3. Upload config to S3: `s3://myrecruiter-picasso/tenants/TESTV3ATL/TESTV3ATL-config.json`
4. Test at widget with `?t=testv3atl001`:
   - **Vocab hints:** Check CloudWatch logs for W5 prompt — verify intent-aware descriptions appear
   - **vocab_id passthrough:** Click a CTA, check browser console for `recordCtaClick` log with full ID
   - **Annotation:** Click "Learn About Love Box", send another message, verify CloudWatch shows `User has already engaged: learn:lb_apply (turn N)` in the prompt — and AI avoids re-offering that same CTA
   - **Link softening:** Ask "How do I contact Atlanta Angels?" — verify contact URL appears inline in response text
   - **Donate button:** Mention donating — verify donate CTA still appears as button
5. Build Picasso: `npm run build:staging` → deploy to test environment

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Annotate vs pre-filter | **Annotate** | W5 reasoning handles click context naturally. Pre-filtering removes AI's ability to re-offer when contextually appropriate. Annotation adds information (safe), not constraints (latency risk). Infrastructure supports upgrading to filtering later. |
| vocab_hint field | **New field, not replacing description** | `description` serves admin UI/tooltips. `vocab_hint` is LLM-facing intent context. Different audiences, different content. |
| Link handling | **Soften prompt rule** | Let KB referral URLs surface inline. CTA buttons remain for conversion actions. Tenant configs define which links are CTA-worthy. |
| Backward compat | **Clean separation** | v3.5 changes only touch AI-generated actions path. Branch/routing CTAs (Tiers 1-3) untouched. Existing tenants unaffected. |

---

*Created: 2026-02-18 | Context: Picasso v3.5.1 CTA Vocabulary Accuracy*
*Related: [CTA_VOCABULARY_ACCURACY_ROADMAP.md](CTA_VOCABULARY_ACCURACY_ROADMAP.md)*
