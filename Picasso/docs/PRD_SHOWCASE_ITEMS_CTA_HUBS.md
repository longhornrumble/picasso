# PRD: Showcase Items as CTA Hubs

**Version**: 1.0
**Status**: Draft
**Author**: Product Team
**Date**: 2025-12-03
**Target Release**: Phase 1 - Q1 2025

---

## 1. Executive Summary

### Problem
Nonprofits need to promote time-sensitive campaigns (holiday toy drives, seasonal events, fundraising campaigns) through visually compelling "digital flyers" that present multiple action options in a single, coherent card. Currently, Showcase Items are limited to displaying content with a single CTA link, forcing nonprofits to create multiple separate cards or sacrifice promotional impact.

### Solution
Transform Showcase Items into full-featured CTA hubs by replacing the single `cta_id` field with a structured `available_ctas` object supporting primary and secondary actions. This mirrors the proven conversation branch model, allowing Showcase Items to serve as visual promotional cards with multiple action paths.

### Business Value
- **Campaign Effectiveness**: 40% increase in multi-action engagement for holiday campaigns (estimated)
- **Content Efficiency**: Reduce card sprawl by consolidating related actions into cohesive promotional units
- **User Experience**: Users discover multiple relevant actions without leaving context
- **Operational Speed**: Faster campaign deployment through reusable showcase templates
- **Revenue Impact**: Increased donation conversion through strategic CTA prioritization

**Key Insight**: A Showcase Item is a specialized conversation branch with visual presentation (image, title, tagline, description) plus routing capability via `available_ctas`.

---

## 2. Business Need

### Current Pain Points

**For Nonprofits**:
1. **Limited Promotional Power**: Can only show one action per Showcase Item
2. **Campaign Silos**: Holiday campaigns require multiple separate cards instead of unified promotional units
3. **Missed Opportunities**: Users who click "Holiday Giving" see content but miss volunteering or donation opportunities
4. **Configuration Complexity**: Must create separate branches and cards for each related action

**For End Users**:
1. **Fragmented Discovery**: Must navigate multiple cards to find all holiday-related actions
2. **Lost Context**: Clicking a CTA takes users away from promotional content
3. **Decision Fatigue**: Too many separate cards create choice paralysis

### Target Users

**Primary**: Nonprofit administrators configuring seasonal campaigns
**Secondary**: End users browsing holiday/seasonal giving opportunities

### Jobs-to-be-Done

**When** a nonprofit launches a holiday campaign (toy drive, Santa party, wish list),
**We want** to display a visual promotional card with multiple action options,
**So that** users can choose their preferred engagement method (donate items, volunteer, donate money, RSVP) without losing campaign context.

---

## 3. User Stories

### Story 1: Admin Creates Holiday Campaign Card
**As** a nonprofit administrator,
**Given** I am configuring a "Holiday Giving" showcase item,
**When** I define the card (image, title, tagline, description),
**Then** I can specify multiple CTAs (primary: "Donate Toys", secondary: ["Volunteer at Event", "Make Monetary Donation", "RSVP to Santa Party"]),
**And** the system validates all CTA references exist in `cta_definitions`.

### Story 2: User Clicks Holiday Giving Action Chip
**As** an end user,
**Given** I see action chips on the welcome screen,
**When** I click "Holiday Giving" chip,
**Then** the system routes to the branch with `showcase_item_id: "holiday_giving_2024"`,
**And** displays a showcase card with holiday imagery and multiple action buttons,
**And** buttons render with context-based styling (primary prominent, secondary grouped).

### Story 3: User Takes Action from Showcase Card
**As** an end user,
**Given** I am viewing the Holiday Giving showcase card,
**When** I click the primary CTA "Donate Toys",
**Then** the system routes to the donate_items conversational form,
**And** preserves the campaign context in session state.

### Story 4: Admin Links Action Chip to Showcase Item
**As** a nonprofit administrator,
**Given** I created a showcase item for "Holiday Giving",
**When** I configure the "holiday_giving" action chip,
**Then** I can set `target_branch` to point to a branch with `showcase_item_id: "holiday_giving_2024"`,
**And** the Config Builder validates the reference chain.

### Story 5: Fallback Behavior for Missing References
**As** a system,
**Given** a conversation branch references `showcase_item_id: "winter_campaign"`,
**When** that showcase item does not exist in `content_showcase[]`,
**Then** the system logs a warning to CloudWatch,
**And** falls back to displaying the branch's `available_ctas` without a showcase card,
**And** continues conversation flow gracefully (no user-facing error).

---

## 4. Acceptance Criteria

### Schema & Data Model
1. `content_showcase[]` objects MUST support `available_ctas: {primary?: string, secondary?: string[]}` structure
2. `conversation_branches[]` objects MUST support `showcase_item_id?: string` field
3. Validation MUST reject configs where `available_ctas` references non-existent `cta_id` values
4. Backward compatibility MUST be preserved: existing configs with `cta_id` continue working (deprecated but supported)
5. Showcase item `id` values MUST be unique within `content_showcase[]` array

### Routing & Rendering
6. When routing to branch with `showcase_item_id`, system MUST render showcase card at top of response
7. CTAs from `available_ctas` MUST render below showcase card content
8. Primary CTA MUST render with prominent styling (`.cta-button-primary`)
9. Secondary CTAs MUST render with grouped styling (`.cta-button-secondary`)
10. CTA click MUST trigger routing via `target_branch` or form via `form_id` per CTA definition

### Config Builder UI
11. ContentShowcaseEditor MUST support adding/removing CTAs (primary + up to 5 secondary)
12. BranchEditor MUST support selecting showcase items via dropdown (populated from `content_showcase[]`)
13. Config validation MUST highlight broken CTA references with clear error messages
14. Save operation MUST prevent committing configs with invalid showcase/CTA references

### Backend Processing
15. Master_Function MUST log showcase item routing decisions to CloudWatch
16. Bedrock_Streaming_Handler MUST enhance responses with showcase cards when `showcase_item_id` present
17. Lambda functions MUST handle missing showcase items gracefully (warning log, no crash)
18. Response format MUST include showcase card metadata for frontend rendering

### Frontend Rendering
19. MessageBubble MUST detect showcase card metadata in response
20. ShowcaseCard component (NEW) MUST render image, title, tagline, description, stats, highlights
21. CTAs MUST render below showcase card using existing CTAButton component
22. Mobile (<320px) MUST stack showcase content and CTAs vertically
23. Desktop (>320px) MUST display showcase card with CTAs in optimal layout

### Performance
24. Showcase item lookup MUST complete in <10ms (in-memory access from cached config)
25. CTA validation during config save MUST complete in <500ms for configs with 50+ showcase items
26. Frontend showcase card render MUST complete in <100ms

### Accessibility
27. Showcase card image MUST include alt text from `title` field
28. CTA buttons MUST maintain WCAG 2.1 AA contrast ratios (4.5:1 minimum)
29. Keyboard navigation MUST support tabbing through showcase CTAs
30. Screen readers MUST announce showcase card content before CTAs

---

## 5. Functional Requirements

### FR-1: Schema Extension for Showcase Items
**Description**: Extend `content_showcase` schema to support CTA hub structure
**Priority**: P0 (Blocker)

**Requirements**:
- Add `available_ctas` field (optional object)
- Structure: `{primary?: string, secondary?: string[]}`
- Deprecate `cta_id` field (support for backward compatibility)
- Validate CTA references against `cta_definitions`

### FR-2: Branch-to-Showcase Linking
**Description**: Allow conversation branches to reference showcase items
**Priority**: P0 (Blocker)

**Requirements**:
- Add `showcase_item_id` field to `conversation_branches` schema
- Validate showcase item exists in `content_showcase[]`
- Support routing from action chips → branch with showcase → CTAs

### FR-3: Config Builder UI Enhancements
**Description**: Update Config Builder to support showcase CTA hub management
**Priority**: P0 (Blocker)

**Requirements**:
- **ContentShowcaseEditor**: Add CTA management UI (primary + secondary CTAs)
- **BranchEditor**: Add showcase item dropdown (show ID and title)
- **Validation Panel**: Highlight broken showcase/CTA references
- **Preview Panel**: Show showcase card with CTAs rendered

### FR-4: Backend Routing Logic
**Description**: Implement showcase item resolution and response enhancement
**Priority**: P0 (Blocker)

**Requirements**:
- **Master_Function**: Resolve `showcase_item_id` from branch, attach to response metadata
- **Bedrock_Streaming_Handler**: Enhance response with showcase card data
- **Error Handling**: Graceful fallback if showcase item missing
- **Logging**: CloudWatch logs for all showcase routing decisions

### FR-5: Frontend Showcase Card Component
**Description**: Create reusable ShowcaseCard component for rendering showcase items
**Priority**: P0 (Blocker)

**Requirements**:
- Render image, title, tagline, description, stats, highlights, testimonial
- Support responsive layout (mobile/desktop)
- Apply CSS variables from theme
- Integrate with existing CTAButton component
- Support accessibility attributes (alt text, ARIA labels)

### FR-6: CTA Rendering in Showcase Context
**Description**: Render CTAs below showcase card with context-based styling
**Priority**: P0 (Blocker)

**Requirements**:
- Apply primary styling to `available_ctas.primary`
- Apply secondary styling to `available_ctas.secondary[]`
- Maintain responsive behavior (full-width mobile, fit-content desktop)
- Preserve click handling (route to branch or trigger form)

---

## 6. Non-Functional Requirements

### Performance (NFR-1)
- **Showcase Lookup**: <10ms (in-memory from cached config)
- **Config Validation**: <500ms for configs with 50+ showcase items
- **Frontend Render**: <100ms for showcase card + CTAs
- **Lambda Response Time**: No degradation to existing <300ms p95

### Accessibility (NFR-2)
- **WCAG 2.1 AA Compliance**: All showcase cards and CTAs
- **Keyboard Navigation**: Full support with visible focus indicators
- **Screen Reader Support**: Semantic HTML with proper ARIA labels
- **Color Contrast**: 4.5:1 minimum for all text on showcase cards

### Scalability (NFR-3)
- **Config Size**: Support tenants with 100+ showcase items without performance impact
- **CTA Count**: Support 1 primary + 10 secondary CTAs per showcase item (recommended max: 1+5)
- **Image Loading**: Lazy load showcase images to minimize initial bundle size

### Security (NFR-4)
- **XSS Protection**: DOMPurify sanitization for all showcase text fields
- **Image Sources**: Validate image URLs are HTTPS or S3-hosted
- **CTA Validation**: Server-side validation that all CTA references exist

### Monitoring (NFR-5)
- **CloudWatch Metrics**: Track showcase item resolutions, missing references, render times
- **Error Rates**: Alert if >1% of showcase lookups fail
- **Usage Analytics**: Track which showcase items drive most engagement

### Maintainability (NFR-6)
- **Schema Versioning**: Increment schema to v1.6 with backward compatibility to v1.5
- **Migration Path**: No breaking changes for existing tenants
- **Documentation**: Update TENANT_CONFIG_SCHEMA.md with examples
- **Type Safety**: Add TypeScript types for showcase CTA structure

---

## 7. Schema / Data Model

### Updated ContentShowcaseItem Schema

```typescript
interface ContentShowcaseItem {
  id: string;                          // Unique identifier (e.g., "holiday_giving_2024")
  title: string;                       // Card title (e.g., "Holiday Giving Campaign")
  tagline?: string;                    // Brief promotional text (e.g., "Spread joy this season")
  description: string;                 // Detailed description (markdown supported)
  image_url?: string;                  // Hero image URL (HTTPS or S3)

  // DEPRECATED (Phase 1): Single CTA link - use available_ctas instead
  cta_id?: string;                     // Backward compatibility only

  // NEW (Phase 1): CTA Hub structure
  available_ctas?: {
    primary?: string;                  // Featured CTA (cta_id reference)
    secondary?: string[];              // Additional CTAs (up to 5 recommended)
  };

  // Optional promotional fields
  stats?: {                            // Key metrics (e.g., "500+ toys donated")
    label: string;
    value: string;
  };
  highlights?: string[];               // Bullet points (e.g., ["Free event", "Family-friendly"])
  testimonial?: {                      // Social proof quote
    text: string;
    attribution?: string;
  };
  keywords?: string[];                 // Hidden (search/matching only)
}
```

### Updated ConversationBranch Schema

```typescript
interface ConversationBranch {
  branch_id: string;                   // Unique branch identifier
  detection_keywords?: string[];       // Deprecated (v1.4+) but kept for compatibility

  // NEW (Phase 1): Link to showcase item
  showcase_item_id?: string;           // References content_showcase[].id

  available_ctas?: {
    primary?: string;
    secondary?: string[];
  };

  // ... existing branch fields
}
```

### Complete Example Configuration

```json
{
  "tenant_id": "AUS123957",
  "tenant_hash": "auc5b0ecb0adcb",
  "chat_title": "Austin Angels",
  "version": "1.6",

  "action_chips": {
    "enabled": true,
    "default_chips": {
      "holiday_giving": {
        "label": "🎁 Holiday Giving",
        "value": "Tell me about holiday giving opportunities",
        "target_branch": "holiday_giving_hub"
      },
      "volunteer": {
        "label": "🤝 Volunteer",
        "value": "I want to volunteer",
        "target_branch": "volunteer_interest"
      }
    }
  },

  "content_showcase": [
    {
      "id": "holiday_giving_2024",
      "title": "Holiday Giving Campaign",
      "tagline": "Spread joy to foster families this season",
      "description": "Our annual holiday campaign provides toys, meals, and memories to 500+ children in foster care. Choose how you'd like to help make this season special.",
      "image_url": "https://chat.myrecruiter.ai/collateral/holiday-campaign-2024.jpg",

      "available_ctas": {
        "primary": "donate_toys",
        "secondary": [
          "volunteer_santa_party",
          "donate_money_holiday",
          "sponsor_family"
        ]
      },

      "stats": {
        "label": "Impact",
        "value": "500+ families served last year"
      },
      "highlights": [
        "Tax-deductible donations",
        "Free pickup available",
        "100% goes to families",
        "Event on Dec 15th"
      ],
      "testimonial": {
        "text": "The holiday program brought so much joy to our family. Thank you!",
        "attribution": "Foster parent, Austin"
      },
      "keywords": ["holiday", "christmas", "toys", "giving", "donation", "volunteer"]
    },

    {
      "id": "toy_drive_wish_list",
      "title": "Toy Drive Wish List",
      "tagline": "Help grant a child's holiday wish",
      "description": "Browse our wish list and purchase gifts directly from our Amazon registry. Items ship to us and we distribute to families.",
      "image_url": "https://chat.myrecruiter.ai/collateral/toy-drive-2024.jpg",

      "available_ctas": {
        "primary": "view_wish_list",
        "secondary": ["donate_money_alternative"]
      },

      "stats": {
        "label": "Current Need",
        "value": "250 items remaining"
      },
      "highlights": [
        "Ages 0-18 represented",
        "Ships directly to us",
        "We handle wrapping"
      ]
    }
  ],

  "conversation_branches": {
    "holiday_giving_hub": {
      "branch_id": "holiday_giving_hub",
      "showcase_item_id": "holiday_giving_2024",

      "available_ctas": {
        "primary": "donate_toys",
        "secondary": [
          "volunteer_santa_party",
          "donate_money_holiday",
          "sponsor_family"
        ]
      }
    },

    "volunteer_interest": {
      "branch_id": "volunteer_interest",
      "available_ctas": {
        "primary": "volunteer_apply",
        "secondary": ["learn_more_programs"]
      }
    }
  },

  "cta_definitions": {
    "donate_toys": {
      "cta_id": "donate_toys",
      "label": "🎁 Donate Toys",
      "url": "https://austinangels.org/toy-drive",
      "target_branch": null
    },
    "volunteer_santa_party": {
      "cta_id": "volunteer_santa_party",
      "label": "🎅 Volunteer at Santa Party",
      "form_id": "volunteer_event_rsvp",
      "target_branch": null
    },
    "donate_money_holiday": {
      "cta_id": "donate_money_holiday",
      "label": "💵 Make Monetary Donation",
      "url": "https://austinangels.org/donate?campaign=holiday2024",
      "target_branch": null
    },
    "sponsor_family": {
      "cta_id": "sponsor_family",
      "label": "👨‍👩‍👧 Sponsor a Family",
      "form_id": "family_sponsorship",
      "target_branch": null
    },
    "view_wish_list": {
      "cta_id": "view_wish_list",
      "label": "📋 View Wish List",
      "url": "https://amazon.com/hz/wishlist/ls/AUSTINANGELS2024",
      "target_branch": null
    },
    "donate_money_alternative": {
      "cta_id": "donate_money_alternative",
      "label": "Or Donate Money Instead",
      "url": "https://austinangels.org/donate",
      "target_branch": null
    }
  }
}
```

---

## 8. User Experience Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER JOURNEY DIAGRAM                        │
└─────────────────────────────────────────────────────────────────┘

Step 1: User Opens Chat Widget
┌──────────────────────────────┐
│  Welcome to Austin Angels!   │
│                              │
│  Action Chips:               │
│  [🎁 Holiday Giving]         │◄── User clicks
│  [🤝 Volunteer]              │
│  [❓ Learn More]             │
└──────────────────────────────┘

Step 2: System Routes to Branch with Showcase
┌─────────────────────────────────────────────────────────────┐
│ Routing Logic (Master_Function / Bedrock_Streaming_Handler)│
│                                                             │
│ 1. Action chip "holiday_giving" has target_branch =        │
│    "holiday_giving_hub"                                     │
│                                                             │
│ 2. Branch "holiday_giving_hub" has showcase_item_id =      │
│    "holiday_giving_2024"                                    │
│                                                             │
│ 3. Resolve showcase item from content_showcase[]           │
│                                                             │
│ 4. Extract available_ctas from showcase item:              │
│    Primary: "donate_toys"                                   │
│    Secondary: ["volunteer_santa_party", ...]               │
│                                                             │
│ 5. Enhance response with showcase card metadata + CTAs     │
└─────────────────────────────────────────────────────────────┘

Step 3: Frontend Renders Showcase Card
┌───────────────────────────────────────────────────────────────┐
│ 🖼️  [Holiday Campaign Image]                                  │
│                                                               │
│ Holiday Giving Campaign                                       │
│ Spread joy to foster families this season                    │
│                                                               │
│ Our annual holiday campaign provides toys, meals, and        │
│ memories to 500+ children in foster care. Choose how you'd   │
│ like to help make this season special.                       │
│                                                               │
│ 📊 Impact: 500+ families served last year                    │
│                                                               │
│ ✓ Tax-deductible donations     ✓ 100% goes to families      │
│ ✓ Free pickup available         ✓ Event on Dec 15th         │
│                                                               │
│ 💬 "The holiday program brought so much joy to our family.   │
│     Thank you!" — Foster parent, Austin                      │
│                                                               │
│ ┌─────────────────────────────────────────────────────┐      │
│ │          🎁 Donate Toys (PRIMARY)                   │◄─┐   │
│ └─────────────────────────────────────────────────────┘  │   │
│                                                           │   │
│ ┌──────────────────────┐ ┌──────────────────────┐       │   │
│ │ 🎅 Volunteer at      │ │ 💵 Make Monetary     │◄──────┼───┤
│ │    Santa Party       │ │    Donation          │       │   │
│ │   (SECONDARY)        │ │   (SECONDARY)        │       │   │
│ └──────────────────────┘ └──────────────────────┘       │   │
│                                                           │   │
│ ┌──────────────────────┐                                 │   │
│ │ 👨‍👩‍👧 Sponsor a Family │                                │   │
│ │   (SECONDARY)        │◄────────────────────────────────┘   │
│ └──────────────────────┘                                     │
└───────────────────────────────────────────────────────────────┘

Step 4: User Clicks CTA
┌──────────────────────────────────────┐
│ User clicks "🎁 Donate Toys"         │
│                                      │
│ System looks up CTA definition:      │
│ {                                    │
│   "cta_id": "donate_toys",          │
│   "label": "🎁 Donate Toys",        │
│   "url": "https://..."              │
│ }                                    │
│                                      │
│ Action: Open URL in new tab          │
└──────────────────────────────────────┘

OR

┌──────────────────────────────────────┐
│ User clicks "🎅 Volunteer at Party"  │
│                                      │
│ System looks up CTA definition:      │
│ {                                    │
│   "cta_id": "volunteer_santa_party", │
│   "form_id": "volunteer_event_rsvp" │
│ }                                    │
│                                      │
│ Action: Start conversational form    │
└──────────────────────────────────────┘
```

---

## 9. Technical Requirements

### Component Breakdown by System

#### A. Config Builder (picasso-config-builder/)

**File**: `src/components/ContentShowcaseEditor.jsx` (EXISTING)

**Changes Required**:
1. Add CTA management UI section
2. Primary CTA dropdown (populated from `cta_definitions`)
3. Secondary CTAs multi-select (max 5 recommended)
4. Real-time validation of CTA references
5. Preview panel showing showcase card with CTAs

**New Components**:
- `CTASelector.jsx` - Reusable CTA picker component
- `ShowcasePreview.jsx` - Live preview of showcase card + CTAs

**Validation Logic**:
```javascript
function validateShowcaseItem(showcaseItem, ctaDefinitions) {
  const errors = [];

  if (showcaseItem.available_ctas) {
    const { primary, secondary } = showcaseItem.available_ctas;

    // Validate primary CTA exists
    if (primary && !ctaDefinitions[primary]) {
      errors.push(`Primary CTA "${primary}" does not exist in cta_definitions`);
    }

    // Validate secondary CTAs exist
    if (secondary && Array.isArray(secondary)) {
      secondary.forEach(ctaId => {
        if (!ctaDefinitions[ctaId]) {
          errors.push(`Secondary CTA "${ctaId}" does not exist in cta_definitions`);
        }
      });
    }

    // Warn if too many secondary CTAs
    if (secondary && secondary.length > 5) {
      errors.push(`Warning: ${secondary.length} secondary CTAs may clutter UI (max 5 recommended)`);
    }
  }

  return errors;
}
```

---

**File**: `src/components/BranchEditor.jsx` (EXISTING)

**Changes Required**:
1. Add "Showcase Item" dropdown field
2. Populate from `content_showcase[]` (show `id` and `title`)
3. Show warning if showcase item has no `available_ctas` defined
4. Clear `showcase_item_id` if user selects "None"

**UI Mockup**:
```jsx
<FormSection label="Visual Content">
  <Select
    label="Showcase Item (Optional)"
    value={branch.showcase_item_id || ""}
    onChange={(e) => handleShowcaseSelect(e.target.value)}
    help="Link this branch to a showcase card for visual presentation"
  >
    <option value="">None (standard response)</option>
    {contentShowcase.map(item => (
      <option key={item.id} value={item.id}>
        {item.id} - {item.title}
      </option>
    ))}
  </Select>

  {branch.showcase_item_id && !hasShowcaseItemCTAs(branch.showcase_item_id) && (
    <Alert type="warning">
      This showcase item has no CTAs defined. Users will see content but no action buttons.
    </Alert>
  )}
</FormSection>
```

---

**File**: `src/utils/configValidator.js` (EXISTING)

**Changes Required**:
Add validation rules for showcase item references:

```javascript
function validateBranchShowcaseReferences(config) {
  const errors = [];
  const showcaseIds = config.content_showcase.map(item => item.id);

  Object.values(config.conversation_branches).forEach(branch => {
    if (branch.showcase_item_id) {
      // Check showcase item exists
      if (!showcaseIds.includes(branch.showcase_item_id)) {
        errors.push({
          type: 'broken_reference',
          severity: 'error',
          branch_id: branch.branch_id,
          message: `Branch "${branch.branch_id}" references non-existent showcase item "${branch.showcase_item_id}"`
        });
      }
    }
  });

  return errors;
}
```

---

#### B. Lambda Backend (Lambdas/lambda/)

**File**: `Master_Function_Staging/lambda_function.py` (EXISTING)

**Changes Required**:

```python
def resolve_showcase_item(branch, tenant_config):
    """
    Resolve showcase item from branch configuration.

    Args:
        branch (dict): Conversation branch object
        tenant_config (dict): Full tenant configuration

    Returns:
        dict or None: Showcase item object if found, else None
    """
    showcase_item_id = branch.get('showcase_item_id')

    if not showcase_item_id:
        return None

    # Search content_showcase array
    content_showcase = tenant_config.get('content_showcase', [])
    for item in content_showcase:
        if item.get('id') == showcase_item_id:
            logger.info(f"Resolved showcase item: {showcase_item_id}")
            return item

    # Log warning if not found (graceful degradation)
    logger.warning(f"Showcase item '{showcase_item_id}' not found in content_showcase")
    return None

def extract_ctas_from_showcase(showcase_item, cta_definitions):
    """
    Extract and resolve CTAs from showcase item.

    Args:
        showcase_item (dict): Showcase item with available_ctas
        cta_definitions (dict): Full CTA definitions from config

    Returns:
        dict: {primary: CTA_obj or None, secondary: [CTA_obj, ...]}
    """
    available_ctas = showcase_item.get('available_ctas', {})

    result = {
        'primary': None,
        'secondary': []
    }

    # Resolve primary CTA
    primary_id = available_ctas.get('primary')
    if primary_id and primary_id in cta_definitions:
        result['primary'] = cta_definitions[primary_id]

    # Resolve secondary CTAs
    secondary_ids = available_ctas.get('secondary', [])
    for cta_id in secondary_ids:
        if cta_id in cta_definitions:
            result['secondary'].append(cta_definitions[cta_id])
        else:
            logger.warning(f"Secondary CTA '{cta_id}' not found in cta_definitions")

    return result

# Integration in main handler
def lambda_handler(event, context):
    # ... existing routing logic ...

    # After determining target branch
    target_branch = conversation_branches.get(branch_id)

    # Resolve showcase item if present
    showcase_item = resolve_showcase_item(target_branch, tenant_config)

    if showcase_item:
        # Extract CTAs from showcase
        showcase_ctas = extract_ctas_from_showcase(showcase_item, cta_definitions)

        # Attach to response metadata
        response_metadata['showcase'] = {
            'item': showcase_item,
            'ctas': showcase_ctas
        }

    # ... continue with response generation ...
```

---

**File**: `Bedrock_Streaming_Handler_Staging/index.js` (EXISTING)

**Changes Required**:

```javascript
// In response_enhancer.js module

function resolveShowcaseItem(branch, tenantConfig) {
  const showcaseItemId = branch.showcase_item_id;

  if (!showcaseItemId) {
    return null;
  }

  const contentShowcase = tenantConfig.content_showcase || [];
  const showcaseItem = contentShowcase.find(item => item.id === showcaseItemId);

  if (!showcaseItem) {
    console.warn(`Showcase item '${showcaseItemId}' not found`);
    return null;
  }

  return showcaseItem;
}

function extractShowcaseCTAs(showcaseItem, ctaDefinitions) {
  const availableCTAs = showcaseItem.available_ctas || {};

  const result = {
    primary: null,
    secondary: []
  };

  // Resolve primary
  if (availableCTAs.primary && ctaDefinitions[availableCTAs.primary]) {
    result.primary = {
      ...ctaDefinitions[availableCTAs.primary],
      _position: 'primary' // Metadata for frontend styling
    };
  }

  // Resolve secondary
  if (Array.isArray(availableCTAs.secondary)) {
    result.secondary = availableCTAs.secondary
      .map(ctaId => {
        if (ctaDefinitions[ctaId]) {
          return {
            ...ctaDefinitions[ctaId],
            _position: 'secondary'
          };
        }
        console.warn(`Secondary CTA '${ctaId}' not found`);
        return null;
      })
      .filter(Boolean);
  }

  return result;
}

// Modify enhanceResponse function
function enhanceResponse(bedrockResponse, branch, tenantConfig) {
  let enhanced = {
    content: bedrockResponse,
    showcase: null,
    ctas: []
  };

  // Check for showcase item
  const showcaseItem = resolveShowcaseItem(branch, tenantConfig);

  if (showcaseItem) {
    const showcaseCTAs = extractShowcaseCTAs(showcaseItem, tenantConfig.cta_definitions);

    enhanced.showcase = {
      id: showcaseItem.id,
      title: showcaseItem.title,
      tagline: showcaseItem.tagline,
      description: showcaseItem.description,
      image_url: showcaseItem.image_url,
      stats: showcaseItem.stats,
      highlights: showcaseItem.highlights,
      testimonial: showcaseItem.testimonial
    };

    // Add primary CTA
    if (showcaseCTAs.primary) {
      enhanced.ctas.push(showcaseCTAs.primary);
    }

    // Add secondary CTAs
    enhanced.ctas.push(...showcaseCTAs.secondary);
  } else {
    // Fallback to branch CTAs (existing behavior)
    enhanced.ctas = extractBranchCTAs(branch, tenantConfig.cta_definitions);
  }

  return enhanced;
}
```

---

#### C. Picasso Frontend (Picasso/src/)

**New File**: `src/components/chat/ShowcaseCard.jsx`

```jsx
import React from 'react';
import PropTypes from 'prop-types';
import DOMPurify from 'dompurify';
import './ShowcaseCard.css';

/**
 * ShowcaseCard component renders promotional showcase items with visual content.
 * Used for campaign promotions, event announcements, program highlights, etc.
 *
 * @component
 * @example
 * <ShowcaseCard
 *   id="holiday_giving_2024"
 *   title="Holiday Giving Campaign"
 *   tagline="Spread joy this season"
 *   description="Help us serve 500+ families..."
 *   imageUrl="https://..."
 *   stats={{label: "Impact", value: "500+ families"}}
 *   highlights={["Free pickup", "Tax-deductible"]}
 *   testimonial={{text: "Amazing program!", attribution: "Parent"}}
 * />
 */
const ShowcaseCard = ({
  id,
  title,
  tagline,
  description,
  imageUrl,
  stats,
  highlights,
  testimonial
}) => {
  // Sanitize text content
  const sanitizedDescription = DOMPurify.sanitize(description, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em'],
    ALLOWED_ATTR: []
  });

  return (
    <div className="showcase-card" data-showcase-id={id}>
      {imageUrl && (
        <img
          src={imageUrl}
          alt={title}
          className="showcase-card-image"
          loading="lazy"
        />
      )}

      <div className="showcase-card-content">
        <h3 className="showcase-card-title">{title}</h3>

        {tagline && (
          <p className="showcase-card-tagline">{tagline}</p>
        )}

        <div
          className="showcase-card-description"
          dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
        />

        {stats && (
          <div className="showcase-card-stats">
            <span className="showcase-card-stats-label">{stats.label}:</span>
            <span className="showcase-card-stats-value">{stats.value}</span>
          </div>
        )}

        {highlights && highlights.length > 0 && (
          <ul className="showcase-card-highlights">
            {highlights.map((highlight, index) => (
              <li key={index} className="showcase-card-highlight">
                {highlight}
              </li>
            ))}
          </ul>
        )}

        {testimonial && (
          <blockquote className="showcase-card-testimonial">
            <p>"{testimonial.text}"</p>
            {testimonial.attribution && (
              <cite>— {testimonial.attribution}</cite>
            )}
          </blockquote>
        )}
      </div>
    </div>
  );
};

ShowcaseCard.propTypes = {
  id: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  tagline: PropTypes.string,
  description: PropTypes.string.isRequired,
  imageUrl: PropTypes.string,
  stats: PropTypes.shape({
    label: PropTypes.string.isRequired,
    value: PropTypes.string.isRequired
  }),
  highlights: PropTypes.arrayOf(PropTypes.string),
  testimonial: PropTypes.shape({
    text: PropTypes.string.isRequired,
    attribution: PropTypes.string
  })
};

ShowcaseCard.defaultProps = {
  tagline: null,
  imageUrl: null,
  stats: null,
  highlights: null,
  testimonial: null
};

export default ShowcaseCard;
```

---

**File**: `src/components/chat/MessageBubble.jsx` (EXISTING)

**Changes Required**:

```jsx
import ShowcaseCard from './ShowcaseCard';
import CTAButton from './CTAButton';

const MessageBubble = ({ message, isUser }) => {
  // ... existing code ...

  // Detect showcase metadata in message
  const hasShowcase = message.showcase && message.showcase.item;

  return (
    <div className={`message-bubble ${isUser ? 'user' : 'bot'}`}>
      {/* Render showcase card if present */}
      {hasShowcase && (
        <ShowcaseCard
          id={message.showcase.item.id}
          title={message.showcase.item.title}
          tagline={message.showcase.item.tagline}
          description={message.showcase.item.description}
          imageUrl={message.showcase.item.image_url}
          stats={message.showcase.item.stats}
          highlights={message.showcase.item.highlights}
          testimonial={message.showcase.item.testimonial}
        />
      )}

      {/* Render message content */}
      <div className="message-content">
        {renderMessageContent(message.content)}
      </div>

      {/* Render CTAs below showcase (or standalone if no showcase) */}
      {message.ctas && message.ctas.length > 0 && (
        <div className="message-ctas">
          {message.ctas.map(cta => (
            <CTAButton
              key={cta.cta_id}
              cta={cta}
              position={cta._position} // 'primary' or 'secondary'
              onClick={() => handleCTAClick(cta)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
```

---

**File**: `src/components/chat/CTAButton.jsx` (EXISTING)

**Changes Required**:

```jsx
const CTAButton = ({ cta, position, onClick }) => {
  // Determine styling class based on position metadata
  const positionClass = position === 'primary'
    ? 'cta-button-primary'
    : 'cta-button-secondary';

  return (
    <button
      className={`cta-button ${positionClass}`}
      onClick={() => onClick(cta)}
      aria-label={cta.label}
    >
      {cta.label}
    </button>
  );
};
```

---

**File**: `src/styles/theme.css` (EXISTING)

**Changes Required**: None - CSS already exists (lines 4665-4829)

**Verification**:
- `.showcase-card` - Base card styles ✓
- `.showcase-card-image` - Image container ✓
- `.showcase-card-title` - Title typography ✓
- `.showcase-card-tagline` - Tagline typography ✓
- `.showcase-card-description` - Body text ✓
- `.showcase-card-stats` - Metrics display ✓
- `.showcase-card-highlights` - Bullet points (2-column grid) ✓
- `.showcase-card-testimonial` - Quote styling ✓
- `.showcase-card-action` - Button (uses action-chip styling) ✓
- Responsive breakpoints (@media 480px) ✓

---

#### D. Testing Requirements

**Unit Tests**:

```javascript
// Config Builder: src/utils/__tests__/configValidator.test.js
describe('Showcase Item Validation', () => {
  test('should validate showcase CTA references', () => {
    const config = {
      content_showcase: [
        {
          id: 'test_showcase',
          available_ctas: {
            primary: 'donate',
            secondary: ['volunteer', 'nonexistent_cta']
          }
        }
      ],
      cta_definitions: {
        donate: { cta_id: 'donate', label: 'Donate' },
        volunteer: { cta_id: 'volunteer', label: 'Volunteer' }
      }
    };

    const errors = validateShowcaseItem(config.content_showcase[0], config.cta_definitions);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('nonexistent_cta');
  });

  test('should validate branch showcase references', () => {
    const config = {
      content_showcase: [{ id: 'valid_showcase' }],
      conversation_branches: {
        test_branch: {
          branch_id: 'test_branch',
          showcase_item_id: 'invalid_showcase'
        }
      }
    };

    const errors = validateBranchShowcaseReferences(config);
    expect(errors).toHaveLength(1);
    expect(errors[0].type).toBe('broken_reference');
  });
});
```

```python
# Lambda: Master_Function_Staging/test_showcase_routing.py
import unittest
from lambda_function import resolve_showcase_item, extract_ctas_from_showcase

class TestShowcaseRouting(unittest.TestCase):
    def setUp(self):
        self.tenant_config = {
            'content_showcase': [
                {
                    'id': 'holiday_campaign',
                    'title': 'Holiday Giving',
                    'available_ctas': {
                        'primary': 'donate',
                        'secondary': ['volunteer', 'learn_more']
                    }
                }
            ],
            'cta_definitions': {
                'donate': {'cta_id': 'donate', 'label': 'Donate'},
                'volunteer': {'cta_id': 'volunteer', 'label': 'Volunteer'},
                'learn_more': {'cta_id': 'learn_more', 'label': 'Learn More'}
            }
        }

    def test_resolve_showcase_item_success(self):
        branch = {'showcase_item_id': 'holiday_campaign'}
        result = resolve_showcase_item(branch, self.tenant_config)
        self.assertIsNotNone(result)
        self.assertEqual(result['id'], 'holiday_campaign')

    def test_resolve_showcase_item_not_found(self):
        branch = {'showcase_item_id': 'nonexistent'}
        result = resolve_showcase_item(branch, self.tenant_config)
        self.assertIsNone(result)

    def test_extract_showcase_ctas(self):
        showcase = self.tenant_config['content_showcase'][0]
        result = extract_ctas_from_showcase(showcase, self.tenant_config['cta_definitions'])

        self.assertIsNotNone(result['primary'])
        self.assertEqual(result['primary']['cta_id'], 'donate')
        self.assertEqual(len(result['secondary']), 2)
```

```javascript
// Frontend: src/components/chat/__tests__/ShowcaseCard.test.jsx
import { render, screen } from '@testing-library/react';
import ShowcaseCard from '../ShowcaseCard';

describe('ShowcaseCard', () => {
  const mockShowcase = {
    id: 'test_showcase',
    title: 'Test Campaign',
    tagline: 'Help us help others',
    description: 'This is a test campaign',
    imageUrl: 'https://example.com/image.jpg',
    stats: { label: 'Impact', value: '500+ families' },
    highlights: ['Free event', 'Family-friendly'],
    testimonial: { text: 'Great program!', attribution: 'John Doe' }
  };

  test('renders all showcase content', () => {
    render(<ShowcaseCard {...mockShowcase} />);

    expect(screen.getByText('Test Campaign')).toBeInTheDocument();
    expect(screen.getByText('Help us help others')).toBeInTheDocument();
    expect(screen.getByText('This is a test campaign')).toBeInTheDocument();
    expect(screen.getByAltText('Test Campaign')).toHaveAttribute('src', mockShowcase.imageUrl);
    expect(screen.getByText('500+ families')).toBeInTheDocument();
    expect(screen.getByText('Free event')).toBeInTheDocument();
    expect(screen.getByText('"Great program!"')).toBeInTheDocument();
  });

  test('sanitizes description HTML', () => {
    const maliciousShowcase = {
      ...mockShowcase,
      description: '<script>alert("xss")</script><p>Safe content</p>'
    };

    render(<ShowcaseCard {...maliciousShowcase} />);

    expect(screen.getByText('Safe content')).toBeInTheDocument();
    expect(screen.queryByText('alert("xss")')).not.toBeInTheDocument();
  });
});
```

**Integration Tests**:

```python
# End-to-End: test_showcase_flow_e2e.py
def test_showcase_routing_full_flow(self):
    """Test complete flow: action chip → branch with showcase → CTAs"""

    # Step 1: User clicks action chip
    event = {
        'body': json.dumps({
            'message': 'holiday_giving',  # Action chip value
            'action_chip_id': 'holiday_giving',
            'tenant_hash': 'test123'
        })
    }

    # Step 2: Lambda routes to branch
    response = lambda_handler(event, {})
    body = json.loads(response['body'])

    # Step 3: Verify showcase in response
    self.assertIn('showcase', body)
    self.assertEqual(body['showcase']['item']['id'], 'holiday_giving_2024')

    # Step 4: Verify CTAs extracted
    self.assertIn('ctas', body)
    self.assertEqual(len(body['ctas']), 4)  # 1 primary + 3 secondary
    self.assertEqual(body['ctas'][0]['_position'], 'primary')
```

---

## 10. Out of Scope (Phase 1)

The following features are explicitly OUT OF SCOPE for Phase 1:

1. **Dynamic CTA Ordering**: CTAs always render in config order (primary, then secondary array order)
2. **CTA Analytics**: No tracking of which showcase CTAs are clicked (Phase 2)
3. **A/B Testing**: No variant testing for showcase designs (Phase 2)
4. **Personalization**: No user-specific showcase content (Phase 2)
5. **Conditional Showcase Display**: No rules-based showcase visibility (e.g., "show only on weekends")
6. **Showcase Carousels**: Single showcase per branch (no multi-item carousels)
7. **Video Content**: Only static images supported (no video embeds)
8. **Interactive Elements**: No polls, surveys, or form fields within showcase cards
9. **Real-Time Data**: Stats/highlights are static (no live counters or API-fetched data)
10. **Multi-Language Support**: Showcase content in tenant's primary language only
11. **Showcase Templates**: No pre-built showcase designs in Config Builder (custom only)
12. **Image Editing**: No built-in image cropping/resizing in Config Builder
13. **Scheduled Showcases**: No time-based activation/deactivation (manual enable/disable only)
14. **Showcase Categories**: No tagging or categorization system
15. **Usage Reporting**: No admin dashboard for showcase performance metrics

**Why These Are Deferred**:
- Phase 1 focuses on core infrastructure (schema, routing, rendering)
- Advanced features require analytics foundation (Phase 2)
- Keep initial scope achievable within sprint timeline
- Learn from real-world usage before adding complexity

---

## 11. Risks and Mitigations

### Technical Risks

**Risk 1: Config Bloat**
- **Description**: Large showcase items with high-res images increase config file size
- **Impact**: Slower config loading, increased S3 costs
- **Probability**: Medium
- **Mitigation**:
  - Add validation warning for images >500KB
  - Recommend S3-hosted images instead of base64 embedding
  - Implement lazy loading for showcase images
  - Document image optimization best practices in Config Builder

**Risk 2: Broken CTA References**
- **Description**: Showcase `available_ctas` reference non-existent CTAs after config edits
- **Impact**: Runtime errors, missing buttons, poor UX
- **Probability**: High (human error in manual config)
- **Mitigation**:
  - Real-time validation in Config Builder UI
  - Pre-save validation blocking commits with broken references
  - Graceful degradation in Lambda (log warning, skip broken CTA)
  - Validation dashboard highlighting issues across all tenants

**Risk 3: Rendering Performance**
- **Description**: Complex showcase cards slow down chat message rendering
- **Impact**: Laggy UX, poor performance scores
- **Probability**: Low
- **Mitigation**:
  - Lazy load showcase images with loading="lazy"
  - Use CSS containment for layout performance
  - Benchmark render times in acceptance criteria (<100ms)
  - Monitor real-user metrics with performance tracking

**Risk 4: Mobile Responsiveness**
- **Description**: Showcase cards with many highlights/stats break mobile layout
- **Impact**: Horizontal scrolling, cut-off content, poor mobile UX
- **Probability**: Medium
- **Mitigation**:
  - Thorough mobile testing (<320px breakpoint)
  - CSS Grid with responsive breakpoints
  - Limit highlights to 4 items (2x2 grid)
  - Mobile preview in Config Builder

### UX Risks

**Risk 5: CTA Overload**
- **Description**: Too many secondary CTAs overwhelm users
- **Impact**: Decision paralysis, reduced conversion
- **Probability**: Medium (depends on config discipline)
- **Mitigation**:
  - Recommend max 1 primary + 3 secondary in docs
  - Show warning in Config Builder when >5 secondary CTAs
  - A/B test CTA counts in Phase 2

**Risk 6: Showcase-Branch Mismatch**
- **Description**: Showcase content doesn't match branch conversation context
- **Impact**: Confusing UX, cognitive dissonance
- **Probability**: Medium (human config error)
- **Mitigation**:
  - Clear naming conventions (showcase ID matches branch ID)
  - Preview tool showing branch + showcase together
  - User testing during initial deployments

### Operational Risks

**Risk 7: Migration Complexity**
- **Description**: Existing tenants with `cta_id` field need careful migration
- **Impact**: Breaking changes, downtime, support burden
- **Probability**: Low (backward compatibility maintained)
- **Mitigation**:
  - Support legacy `cta_id` field indefinitely
  - Gradual migration path (no forced updates)
  - Migration guide with examples
  - Automated migration script (optional)

**Risk 8: Support Burden**
- **Description**: New feature increases support tickets for config help
- **Impact**: Increased support costs, slower feature adoption
- **Probability**: Medium
- **Mitigation**:
  - Comprehensive documentation with screenshots
  - Video tutorial for Config Builder showcase setup
  - Template showcase items for common use cases
  - Inline help text and tooltips

---

## 12. Success Metrics

### Engagement Metrics (Phase 1 - First 30 Days)

**Primary Metric**: Showcase CTA Click-Through Rate (CTR)
- **Target**: 25% CTR on showcase CTAs (vs. 15% baseline for standard CTAs)
- **Measurement**: Track showcase CTA clicks / showcase card views
- **Success Criteria**: 10+ percentage point improvement over baseline

**Secondary Metrics**:
1. **Multi-Action Engagement**: 15% of users click 2+ CTAs from same showcase
2. **Showcase Adoption**: 50% of active tenants create at least 1 showcase item
3. **Campaign Conversion**: 5% increase in holiday campaign actions (Q4 2025)

### Operational Metrics

**Configuration Health**:
- **Broken References**: <1% of showcase items have broken CTA references
- **Validation Errors**: <5 validation errors per 100 config saves
- **Avg Setup Time**: <10 minutes to create showcase item with CTAs in Config Builder

**Performance Metrics**:
- **Showcase Lookup Time**: p95 <10ms
- **Frontend Render Time**: p95 <100ms
- **Lambda Response Time**: No degradation vs. baseline (p95 <300ms)

**User Experience Metrics**:
- **Error Rate**: <0.1% of showcase renders result in errors
- **Mobile Responsiveness**: 100% of showcase cards render correctly on <320px screens
- **Accessibility Score**: WCAG 2.1 AA compliance (automated + manual audit)

### Business Impact Metrics (Phase 2 - 90 Days)

**Revenue Impact**:
- **Donation Conversion**: 10% increase in donation CTR for campaigns using showcase items
- **Volunteer Sign-Ups**: 15% increase in volunteer form completions
- **Event RSVPs**: 20% increase in event registration from showcase CTAs

**Content Efficiency**:
- **Card Consolidation**: 30% reduction in total smart response cards (consolidate via showcases)
- **Campaign Time-to-Market**: 50% faster campaign deployment (reusable showcase templates)

### Measurement Approach

**Phase 1 (Instrumentation)**:
1. Add CloudWatch metrics for showcase routing decisions
2. Add frontend event tracking for showcase card views and CTA clicks
3. Log showcase errors and warnings for analysis

**Phase 2 (Analytics Dashboard)**:
1. Build admin dashboard showing showcase performance metrics
2. Implement A/B testing framework for showcase variants
3. Add cohort analysis (showcase users vs. non-showcase users)

**Reporting Cadence**:
- Weekly: Operational metrics (errors, performance)
- Monthly: Engagement metrics (CTR, adoption, conversion)
- Quarterly: Business impact metrics (revenue, efficiency)

---

## 13. Future Considerations (Phase 2+)

### Phase 2: Analytics & Optimization (Q2 2025)

**CTA Performance Tracking**:
- Track click-through rates per CTA within showcases
- Heatmap showing which CTAs get most engagement
- A/B testing framework for CTA ordering and labeling

**Showcase Templates**:
- Pre-built showcase designs for common use cases (campaigns, events, programs)
- One-click duplication and customization
- Template gallery in Config Builder

**Dynamic Content**:
- Real-time stats via API (e.g., "15 people volunteered today!")
- Countdown timers for time-sensitive campaigns
- Conditional content based on user attributes

### Phase 3: Personalization (Q3 2025)

**User-Specific Showcases**:
- Show different showcases based on user history
- Location-based showcase filtering
- Interest-based recommendations

**Smart Showcase Rotation**:
- Automatically rotate showcases based on performance
- Promote high-performing campaigns
- Sunset low-engagement showcases

**Multi-Showcase Carousels**:
- Display 2-3 related showcases in carousel
- Swipeable on mobile
- Auto-advance with pause-on-hover

### Phase 4: Advanced Features (Q4 2025)

**Interactive Showcases**:
- Embed forms directly in showcase cards
- Polls and surveys within showcases
- Progress bars for fundraising campaigns

**Video Content**:
- Embed YouTube/Vimeo videos in showcases
- Auto-play with mute option
- Video thumbnail generation

**Scheduled Showcases**:
- Time-based activation/deactivation
- Recurring schedules (e.g., "show every Monday")
- Holiday campaign automation

**Multi-Language Support**:
- Translate showcase content per user locale
- Language-specific images
- RTL layout support

---

## 14. Implementation Checklist

### Pre-Development (Week 1)

- [ ] **Review PRD with stakeholders** (Product, Engineering, Design)
- [ ] **Finalize acceptance criteria** (sign-off from QA)
- [ ] **Create technical design doc** (Architecture-Specialist agent)
- [ ] **Estimate effort** (Frontend: 3 days, Backend: 2 days, Config Builder: 3 days)
- [ ] **Allocate resources** (1 frontend dev, 1 backend dev, 1 config builder dev)

### Schema & Data Model (Week 2, Days 1-2)

- [ ] **Update TENANT_CONFIG_SCHEMA.md** (document `available_ctas` and `showcase_item_id`)
- [ ] **Add TypeScript types** (`src/types/showcase.ts`)
- [ ] **Create JSON schema validators** (Zod schemas for validation)
- [ ] **Write schema migration script** (convert legacy `cta_id` to `available_ctas`)
- [ ] **Test schema validation** (unit tests for edge cases)

### Config Builder (Week 2, Days 3-5)

- [ ] **Implement CTASelector component** (reusable CTA picker)
- [ ] **Update ContentShowcaseEditor** (add CTA management UI)
- [ ] **Update BranchEditor** (add showcase item dropdown)
- [ ] **Add real-time validation** (highlight broken references)
- [ ] **Create ShowcasePreview component** (live preview of showcase + CTAs)
- [ ] **Update config validator** (validate showcase references)
- [ ] **Write unit tests** (ContentShowcaseEditor, BranchEditor, validation logic)
- [ ] **Manual testing** (create test showcase, link to branch, preview)

### Backend (Week 3, Days 1-2)

- [ ] **Implement showcase resolution** (Master_Function: `resolve_showcase_item()`)
- [ ] **Implement CTA extraction** (Master_Function: `extract_ctas_from_showcase()`)
- [ ] **Update response enhancer** (Bedrock_Streaming_Handler: enhance with showcase)
- [ ] **Add CloudWatch logging** (log showcase routing decisions)
- [ ] **Add error handling** (graceful fallback for missing showcases)
- [ ] **Write unit tests** (test showcase resolution, CTA extraction)
- [ ] **Write integration tests** (end-to-end routing test)
- [ ] **Deploy to staging** (test with real tenant configs)

### Frontend (Week 3, Days 3-5)

- [ ] **Create ShowcaseCard component** (render showcase content)
- [ ] **Update MessageBubble** (detect and render showcase metadata)
- [ ] **Update CTAButton** (support position-based styling)
- [ ] **Add DOMPurify sanitization** (secure showcase content)
- [ ] **Verify CSS styles** (use existing `.showcase-card-*` classes)
- [ ] **Implement lazy loading** (images load on scroll)
- [ ] **Write unit tests** (ShowcaseCard, MessageBubble integration)
- [ ] **Accessibility audit** (WCAG 2.1 AA compliance check)
- [ ] **Cross-browser testing** (Chrome, Firefox, Safari, Edge)
- [ ] **Responsive testing** (mobile <320px, tablet, desktop)

### Testing & QA (Week 4, Days 1-3)

- [ ] **Unit test coverage** (target: 90%+ for new code)
- [ ] **Integration tests** (end-to-end showcase routing flow)
- [ ] **Performance benchmarks** (showcase lookup <10ms, render <100ms)
- [ ] **Load testing** (100 concurrent users with showcase cards)
- [ ] **Accessibility testing** (automated + manual WCAG audit)
- [ ] **Mobile testing** (iOS Safari, Android Chrome)
- [ ] **Error scenario testing** (missing showcase, broken CTAs, invalid refs)
- [ ] **User acceptance testing** (UAT with 2-3 friendly tenants)

### Documentation (Week 4, Days 4-5)

- [ ] **Update TENANT_CONFIG_SCHEMA.md** (add showcase CTA hub examples)
- [ ] **Write Config Builder guide** (step-by-step showcase setup)
- [ ] **Create video tutorial** (5-minute walkthrough)
- [ ] **Update migration guide** (v1.5 → v1.6 migration path)
- [ ] **Write API documentation** (showcase response format)
- [ ] **Update developer README** (new components, testing)

### Deployment (Week 5, Days 1-2)

- [ ] **Deploy Config Builder** (staging → production)
- [ ] **Deploy Lambda functions** (Master_Function, Bedrock_Streaming_Handler)
- [ ] **Deploy frontend** (build production bundle → S3 → CloudFront invalidation)
- [ ] **Smoke testing** (verify no regressions in production)
- [ ] **Monitor logs** (CloudWatch for errors/warnings)
- [ ] **Rollback plan** (revert to previous Lambda versions if needed)

### Post-Launch (Week 5, Days 3-5)

- [ ] **Monitor performance metrics** (showcase lookup times, render times)
- [ ] **Monitor error rates** (CloudWatch alarms for showcase errors)
- [ ] **Collect user feedback** (support tickets, direct feedback)
- [ ] **Create tenant showcase examples** (holiday campaign, fundraiser, event)
- [ ] **Host training session** (for tenant admins on showcase setup)
- [ ] **Plan Phase 2 features** (analytics dashboard, templates, A/B testing)

---

## Appendix A: Glossary

- **Showcase Item**: A visual promotional card with image, title, tagline, description, and optional stats/highlights/testimonials. Serves as a "digital flyer" for campaigns, events, or programs.
- **CTA Hub**: A showcase item with multiple action options (primary + secondary CTAs), allowing users to choose their preferred engagement method.
- **Primary CTA**: The featured call-to-action button displayed prominently on a showcase card (e.g., "Donate Now").
- **Secondary CTA**: Additional action options displayed below the primary CTA, offering alternative engagement paths (e.g., "Volunteer", "Learn More").
- **Conversation Branch**: A node in the conversation graph with associated content and CTAs. Can optionally link to a showcase item for visual presentation.
- **Action Chip**: Quick-action buttons displayed at conversation entry points. Can route to branches with showcase items.
- **Config Builder**: Web-based admin tool for managing tenant configurations (showcase items, branches, CTAs, forms).
- **Fallback Branch**: Default conversation branch when no explicit routing match is found (Tier 3 in routing hierarchy).
- **Target Branch**: The conversation branch a showcase CTA or action chip routes to when clicked.

---

## Appendix B: Related Documents

- **[TENANT_CONFIG_SCHEMA.md](./TENANT_CONFIG_SCHEMA.md)** - Full tenant configuration schema (v1.5)
- **[WEB_CONFIG_BUILDER_PRD.md](./WEB_CONFIG_BUILDER_PRD.md)** - Config Builder product spec
- **[MIGRATION_GUIDE_V1.3_TO_V1.4.1.md](./MIGRATION_GUIDE_V1.3_TO_V1.4.1.md)** - Schema migration guide
- **[PRD_ACTION_CHIPS_EXPLICIT_ROUTING_FALLBACK_HUB.md](./PRD_ACTION_CHIPS_EXPLICIT_ROUTING_FALLBACK_HUB.md)** - Action chip routing spec
- **[COMPLETE_CONVERSATIONAL_FORMS_IMPLEMENTATION_PLAN.md](./COMPLETE_CONVERSATIONAL_FORMS_IMPLEMENTATION_PLAN.md)** - Forms implementation

---

## Appendix C: Example Use Cases

### Use Case 1: Holiday Toy Drive Campaign

**Scenario**: Austin Angels runs annual holiday toy drive with multiple engagement options.

**Configuration**:
```json
{
  "content_showcase": [{
    "id": "holiday_toy_drive_2024",
    "title": "2024 Holiday Toy Drive",
    "tagline": "Help us bring joy to 500+ children this holiday season",
    "description": "Every child deserves a special holiday. Donate new toys, volunteer at our wrapping event, or sponsor a family for the holidays.",
    "image_url": "https://chat.myrecruiter.ai/collateral/aus-holiday-2024.jpg",
    "available_ctas": {
      "primary": "donate_toys",
      "secondary": ["volunteer_wrapping", "sponsor_family", "view_wish_list"]
    },
    "stats": {"label": "Last Year", "value": "500+ families served"},
    "highlights": ["Tax-deductible", "Free pickup", "Wrapping provided", "Dec 15th deadline"]
  }],

  "action_chips": {
    "default_chips": {
      "holiday_giving": {
        "label": "🎁 Holiday Giving",
        "value": "Tell me about holiday opportunities",
        "target_branch": "holiday_campaign_hub"
      }
    }
  },

  "conversation_branches": {
    "holiday_campaign_hub": {
      "branch_id": "holiday_campaign_hub",
      "showcase_item_id": "holiday_toy_drive_2024"
    }
  }
}
```

**User Flow**:
1. User clicks "🎁 Holiday Giving" action chip
2. System routes to `holiday_campaign_hub` branch
3. Resolves showcase item `holiday_toy_drive_2024`
4. Renders showcase card with holiday image and campaign details
5. Displays 4 CTAs (1 primary: "Donate Toys", 3 secondary: "Volunteer", "Sponsor", "View Wish List")
6. User clicks "Donate Toys" → opens external donation page
7. Or clicks "Volunteer" → starts `volunteer_event_rsvp` conversational form

---

### Use Case 2: Fundraising Gala Event

**Scenario**: Nonprofit promotes annual gala with multiple ticket tiers and sponsorship options.

**Configuration**:
```json
{
  "content_showcase": [{
    "id": "spring_gala_2025",
    "title": "Spring Gala 2025",
    "tagline": "An Evening of Hope and Community",
    "description": "Join us May 15th for our signature fundraising event featuring dinner, live auction, and keynote speaker. All proceeds support our youth mentoring programs.",
    "image_url": "https://chat.myrecruiter.ai/collateral/gala-2025.jpg",
    "available_ctas": {
      "primary": "buy_tickets",
      "secondary": ["become_sponsor", "donate_auction_item", "volunteer_event"]
    },
    "stats": {"label": "2024 Impact", "value": "$250K raised"},
    "highlights": ["Black-tie optional", "Live auction", "Silent auction", "Valet parking"]
  }]
}
```

**User Flow**:
1. User types "Tell me about the gala"
2. System routes to fallback branch → `navigation_hub` → detects gala keyword → routes to `gala_event_hub`
3. Renders showcase card with gala imagery
4. User clicks "Buy Tickets" → external Eventbrite page
5. Or clicks "Become Sponsor" → starts `sponsorship_inquiry` form

---

### Use Case 3: Program Showcase with Volunteer Opportunities

**Scenario**: Mentoring program promotes volunteer opportunities with different time commitments.

**Configuration**:
```json
{
  "content_showcase": [{
    "id": "mentoring_program_overview",
    "title": "Dare to Dream Mentoring",
    "tagline": "Change a child's life, one hour at a time",
    "description": "Our mentoring program matches caring adults with youth in foster care for weekly activities, life skills coaching, and lasting friendships.",
    "image_url": "https://chat.myrecruiter.ai/collateral/mentoring.jpg",
    "available_ctas": {
      "primary": "apply_mentor",
      "secondary": ["learn_requirements", "attend_info_session", "read_stories"]
    },
    "stats": {"label": "Active Matches", "value": "150+ mentor pairs"},
    "highlights": ["1 hour/week commitment", "Background check required", "Training provided", "Ages 22+"],
    "testimonial": {
      "text": "Being a mentor has been the most rewarding experience of my life.",
      "attribution": "Sarah T., Mentor since 2020"
    }
  }]
}
```

**User Flow**:
1. User clicks "Learn about Mentoring" action chip
2. Renders showcase card with mentoring program details
3. User sees 4 CTAs: "Apply to Be a Mentor" (primary), "Learn Requirements", "Attend Info Session", "Read Success Stories" (secondary)
4. User clicks "Learn Requirements" → routes to `mentoring_requirements` branch with detailed eligibility info
5. Then clicks "Apply to Be a Mentor" → starts `mentor_application` conversational form

---

**End of Document**

---

**Document Control**:
- **Version**: 1.0
- **Status**: Draft for Review
- **Next Review**: After stakeholder feedback
- **Approvers**: Product Manager, Engineering Lead, Design Lead
- **Related Tickets**: TBD (create after approval)
