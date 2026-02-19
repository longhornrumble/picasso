# CTA + Branch + CHIPS Integration Plan

## Context

V3.5 Tag & Map (AI picks action IDs from a vocabulary, code maps them to buttons) and CHIPS (AI-generated follow-up suggestions) are both working. Now we need to integrate CTAs with the `show_info` + conversational branch system so that:

1. **AI offers a CTA** (e.g., "Apply to Love Box") via the vocabulary
2. **Clicking it triggers `show_info`** — injects pre-authored static content locally with branch CTAs
3. **Branch CTAs guide the user** through a scripted decision path (no AI, no CHIPS)
4. **User typing exits back to AI mode** — CHIPS resume naturally

The frontend already handles `show_info` + branch resolution correctly (`MessageBubble.jsx` lines 827-864 and 524-561). **No frontend changes needed.** The work is entirely in the Lambda mapper/vocabulary and test config.

We also remove `query:` from the vocabulary since CHIPS make queries redundant — both just send text as user input.

---

## Files to Modify

| File | Changes |
|------|---------|
| `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/index.js` | `apply:` handler emits `show_info` when config says so; remove `query:` handler + vocabulary; remove query builder |
| `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/test-tenant-config.json` | Populate `available_actions`, `conversation_branches`, `cta_definitions` for testing |

---

## Step 1: Extend `apply:` handler in `mapNextTagsToActions()`

**File:** `index.js` lines 1825-1838

Currently the `apply:` handler always emits `{ action: 'start_form' }`. We need it to check if the form config entry has `show_info: true` — if so, emit a `show_info` action instead, which the existing frontend handler picks up.

**Current:**
```javascript
else if (trimmed.startsWith('apply:')) {
  const formId = trimmed.slice(6);
  const programKey = formId === 'lb_apply' ? 'lovebox' : formId === 'dd_apply' ? 'daretodream' : formId;
  if (!completedForms.includes(programKey)) {
    const formInfo = availableActions.forms?.[formId];
    if (formInfo) {
      actions.push({
        label: formInfo.label || 'Apply',
        action: 'start_form',
        formId: formId
      });
    }
  }
}
```

**New:**
```javascript
else if (trimmed.startsWith('apply:')) {
  const formId = trimmed.slice(6);
  const programKey = formId === 'lb_apply' ? 'lovebox' : formId === 'dd_apply' ? 'daretodream' : formId;
  if (!completedForms.includes(programKey)) {
    const formInfo = availableActions.forms?.[formId];
    if (formInfo) {
      if (formInfo.show_info === true) {
        // Guided path: show_info with optional branch CTAs
        actions.push({
          label: formInfo.label || 'Learn More',
          action: 'show_info',
          prompt: formInfo.prompt || formInfo.description || '',
          target_branch: formInfo.target_branch || null
        });
      } else {
        // Direct form: start conversational form immediately
        actions.push({
          label: formInfo.label || 'Apply',
          action: 'start_form',
          formId: formId
        });
      }
    }
  }
}
```

**How it works:** When the AI tags `<!-- NEXT: apply:lb_apply -->`, the mapper checks the config:
- `show_info: false` (or absent) -> `start_form` (current behavior, preserved)
- `show_info: true` -> `show_info` action with `prompt` text and `target_branch` -> frontend renders static content + branch CTAs

---

## Step 2: Remove `query:` from mapper and vocabulary

**2a. Remove query handler from `mapNextTagsToActions()`** (lines 1839-1848)

Delete the entire `else if (trimmed.startsWith('query:'))` block. If the AI somehow emits a `query:` tag, it falls through to the "Unknown NEXT tag prefix" log.

**2b. Remove query vocabulary builder** (lines 1940-1946, 1975-1980)

- Delete the `queryEntries` array construction (lines 1940-1946)
- Delete the "Ask:" vocabulary rendering block (lines 1975-1980)
- Remove `queryEntries` from the condition on line 1959: change `formEntries.length > 0 || queryEntries.length > 0 || linkEntries.length > 0` to `formEntries.length > 0 || linkEntries.length > 0`

---

## Step 3: Populate test-tenant-config.json

**File:** `test-tenant-config.json`

Replace the empty `available_actions`, `cta_definitions`, and `conversation_branches` with a full test scenario for Atlanta Angels:

```json
"available_actions": {
  "forms": {
    "lb_apply": {
      "label": "Apply to Love Box",
      "description": "Volunteer application for the Love Box program",
      "direct_cta": true,
      "show_info": true,
      "prompt": "Love Box is a monthly care package delivery program for children in foster care. Volunteers commit to preparing and delivering personalized boxes to their assigned child each month. The process starts with a discovery session where we learn about your interests and availability.",
      "target_branch": "lovebox_info"
    },
    "dd_apply": {
      "label": "Apply to Dare to Dream",
      "description": "Mentor application for the Dare to Dream program",
      "direct_cta": true,
      "show_info": true,
      "prompt": "Dare to Dream pairs adult mentors with youth aging out of foster care. Mentors meet with their mentee regularly to provide guidance on life skills, education, and career planning. The commitment is typically one year with weekly or bi-weekly meetings.",
      "target_branch": "daretodream_info"
    }
  },
  "queries": {},
  "links": {
    "donate": {
      "label": "Make a Donation",
      "url": "https://atlantaangels.org/donate"
    }
  }
},
"conversation_branches": {
  "lovebox_info": {
    "available_ctas": {
      "primary": "lb_start_application",
      "secondary": ["lb_schedule_discovery", "dd_learn_more"]
    }
  },
  "daretodream_info": {
    "available_ctas": {
      "primary": "dd_start_application",
      "secondary": ["dd_schedule_discovery", "lb_learn_more"]
    }
  }
},
"cta_definitions": {
  "lb_start_application": {
    "label": "Start Love Box Application",
    "action": "start_form",
    "formId": "lb_apply"
  },
  "lb_schedule_discovery": {
    "label": "Schedule a Discovery Session",
    "action": "external_link",
    "url": "https://atlantaangels.org/discovery"
  },
  "dd_learn_more": {
    "label": "Learn About Dare to Dream",
    "action": "show_info",
    "prompt": "Dare to Dream pairs adult mentors with youth aging out of foster care. Mentors meet with their mentee regularly to provide guidance on life skills, education, and career planning.",
    "target_branch": "daretodream_info"
  },
  "dd_start_application": {
    "label": "Start Dare to Dream Application",
    "action": "start_form",
    "formId": "dd_apply"
  },
  "dd_schedule_discovery": {
    "label": "Schedule a Discovery Session",
    "action": "external_link",
    "url": "https://atlantaangels.org/discovery"
  },
  "lb_learn_more": {
    "label": "Learn About Love Box",
    "action": "show_info",
    "prompt": "Love Box is a monthly care package delivery program for children in foster care. Volunteers commit to preparing and delivering personalized boxes to their assigned child each month.",
    "target_branch": "lovebox_info"
  }
}
```

**Test scenarios supported:**

| Scenario | Flow |
|----------|------|
| AI offers "Apply to Love Box" | AI tags `apply:lb_apply` -> mapper emits `show_info` -> frontend shows prompt + 3 branch CTAs |
| User clicks "Start Love Box Application" | Branch CTA -> `start_form` -> conversational form begins |
| User clicks "Learn About Dare to Dream" | Branch CTA -> `show_info` with `target_branch: daretodream_info` -> switches to D2D branch (stays guided) |
| User clicks "Schedule Discovery" | Branch CTA -> `external_link` -> opens URL in new tab |
| User types instead of clicking | Text goes to Bedrock -> AI + CHIPS resume naturally |

---

## Deployment Order

1. **Lambda** (Steps 1-2): Deploy `index.js` changes. Backward compatible — tenants without `show_info` fields get current `start_form` behavior unchanged.
2. **Config** (Step 3): Upload `test-tenant-config.json` to S3.
3. **No Picasso deploy needed** — frontend already handles `show_info` + branch resolution.

## Verification

1. `cd Lambdas/lambda/Bedrock_Streaming_Handler_Staging && npm run package`
2. Deploy Lambda, publish new version, update staging alias
3. Upload config: `aws s3 cp test-tenant-config.json s3://myrecruiter-picasso/tenants/TESTV3ATL/TESTV3ATL-config.json`
4. Test at widget with `?t=testv3atl001`:
   - **CTA -> show_info:** Chat about Love Box until AI offers "Apply to Love Box" CTA. Click it. Verify static prompt appears with 3 branch CTAs below.
   - **Branch CTA -> form:** Click "Start Love Box Application". Verify form starts.
   - **Branch CTA -> cross-branch:** Click "Learn About Dare to Dream" instead. Verify D2D prompt + CTAs appear (stays guided, no AI call).
   - **User types -> AI resumes:** Type a message instead of clicking a branch CTA. Verify Bedrock responds with CHIPS.
   - **Query removal:** Verify no `query:` entries appear in CloudWatch W5 prompt logs.
   - **Link CTA still works:** Mention donating -> verify donate button appears and opens URL.
