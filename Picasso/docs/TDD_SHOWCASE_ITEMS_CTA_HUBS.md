# Technical Design Document: Showcase Items as CTA Hubs

**Version**: 1.0
**Status**: Final
**Date**: 2025-12-03
**Related PRD**: [PRD_SHOWCASE_ITEMS_CTA_HUBS.md](./PRD_SHOWCASE_ITEMS_CTA_HUBS.md)
**Schema Version**: 1.6

---

## 1. Overview

Transform Showcase Items from single-CTA promotional cards into full-featured CTA hubs supporting multiple action paths (primary + secondary CTAs). This enables nonprofits to create "digital flyer" campaigns (holiday drives, fundraising events, program promotions) with multiple engagement options in a single coherent card.

**Core Insight**: A Showcase Item is a specialized conversation branch with visual presentation (image, title, tagline, description) plus routing capability via `available_ctas`.

**Schema Changes**: Add `available_ctas: {primary?: string, secondary?: string[]}` to `content_showcase[]` and `showcase_item_id?: string` to `conversation_branches[]`.

**User Impact**: Users see visually compelling campaign cards with multiple action buttons, allowing them to choose their preferred engagement method (donate, volunteer, RSVP) without losing campaign context.

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATA FLOW ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────────────┘

User Clicks Action Chip ("Holiday Giving")
           ↓
    ┌──────────────────────────────────────────────────────────────┐
    │  Master_Function_Staging (Python) / Bedrock_Streaming_Handler │
    │                                                               │
    │  1. Resolve target_branch from action chip                   │
    │     → "holiday_giving_hub"                                   │
    │                                                               │
    │  2. Load conversation_branches[holiday_giving_hub]           │
    │     → {branch_id, showcase_item_id: "holiday_giving_2024"}  │
    │                                                               │
    │  3. Resolve showcase_item_id from content_showcase[]         │
    │     → Find item where id === "holiday_giving_2024"          │
    │                                                               │
    │  4. Extract available_ctas from showcase item                │
    │     → {primary: "donate_toys", secondary: [...]}            │
    │                                                               │
    │  5. Resolve CTA definitions from cta_definitions{}           │
    │     → Lookup each cta_id and attach full CTA objects        │
    │                                                               │
    │  6. Enhance response with showcase card + CTAs               │
    │     → Response format:                                       │
    │       {                                                       │
    │         content: "Bedrock response text",                    │
    │         showcase: {item: {...}, ctas: [...}},               │
    │         metadata: {...}                                      │
    │       }                                                       │
    └──────────────────────────────────────────────────────────────┘
           ↓
    ┌──────────────────────────────────────────────────────────────┐
    │  Frontend: MessageBubble.jsx                                  │
    │                                                               │
    │  1. Detect showcase metadata in message                      │
    │  2. Render ShowcaseCard component (NEW)                      │
    │     → Image, title, tagline, description, stats, highlights │
    │  3. Render CTAButtonGroup below showcase card                │
    │     → Primary CTA (prominent styling)                        │
    │     → Secondary CTAs (grouped styling)                       │
    │  4. Handle CTA clicks (route to branch or trigger form)      │
    └──────────────────────────────────────────────────────────────┘
           ↓
    User Clicks CTA → Route to target_branch or trigger form_id
```

---

## 3. Component Changes

| Component | File Path | Changes Required |
|-----------|-----------|------------------|
| **ContentShowcaseItem Schema** | `content_showcase[]` in S3 config | Add `available_ctas: {primary?: string, secondary?: string[]}` field |
| **ConversationBranch Schema** | `conversation_branches[]` in S3 config | Add `showcase_item_id?: string` field |
| **Master_Function_Staging** | `Lambdas/lambda/Master_Function_Staging/lambda_function.py` | Add `resolve_showcase_item()` and `extract_ctas_from_showcase()` functions |
| **Bedrock_Streaming_Handler** | `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/response_enhancer.js` | Add `resolveShowcaseItem()` and `extractShowcaseCTAs()` functions |
| **ShowcaseCard (NEW)** | `Picasso/src/components/chat/ShowcaseCard.jsx` | Create new component for rendering showcase cards |
| **MessageBubble** | `Picasso/src/components/chat/MessageBubble.jsx` | Add showcase detection and ShowcaseCard rendering |
| **CTAButton** | `Picasso/src/components/chat/CTAButton.jsx` | Support `_position` metadata for primary/secondary styling |
| **ContentShowcaseEditor** | `picasso-config-builder/src/components/ContentShowcaseEditor.jsx` | Add CTA management UI (primary + secondary selection) |
| **BranchEditor** | `picasso-config-builder/src/components/BranchEditor.jsx` | Add showcase item dropdown (populated from `content_showcase[]`) |
| **Config Validator** | `picasso-config-builder/src/utils/configValidator.js` | Add validation for showcase/CTA references |

---

## 4. API Contract

### Backend Response Format (Enhanced)

**Request**: User clicks action chip with `target_branch → branch_with_showcase_item_id`

**Response** (from Master_Function or Bedrock_Streaming_Handler):
```json
{
  "content": "Bedrock-generated response text (optional)",
  "showcase": {
    "item": {
      "id": "holiday_giving_2024",
      "title": "Holiday Giving Campaign",
      "tagline": "Spread joy to foster families this season",
      "description": "Our annual holiday campaign provides toys...",
      "image_url": "https://chat.myrecruiter.ai/collateral/holiday-campaign-2024.jpg",
      "stats": {"label": "Impact", "value": "500+ families served last year"},
      "highlights": ["Tax-deductible", "Free pickup", "100% goes to families"],
      "testimonial": {"text": "Amazing program!", "attribution": "Foster parent"}
    },
    "ctas": [
      {
        "cta_id": "donate_toys",
        "label": "🎁 Donate Toys",
        "url": "https://austinangels.org/toy-drive",
        "_position": "primary"
      },
      {
        "cta_id": "volunteer_santa_party",
        "label": "🎅 Volunteer at Santa Party",
        "form_id": "volunteer_event_rsvp",
        "_position": "secondary"
      },
      {
        "cta_id": "donate_money_holiday",
        "label": "💵 Make Monetary Donation",
        "url": "https://austinangels.org/donate?campaign=holiday2024",
        "_position": "secondary"
      }
    ]
  },
  "metadata": {
    "branch_id": "holiday_giving_hub",
    "showcase_item_id": "holiday_giving_2024",
    "timestamp": "2025-12-03T12:00:00Z"
  }
}
```

**Fallback Behavior** (missing showcase item):
```json
{
  "content": "Bedrock-generated response text",
  "showcase": null,
  "ctas": [
    // Branch CTAs (fallback to branch.available_ctas if showcase not found)
  ],
  "metadata": {
    "branch_id": "holiday_giving_hub",
    "showcase_item_id": "holiday_giving_2024",
    "showcase_missing": true,
    "warning": "Showcase item 'holiday_giving_2024' not found in content_showcase"
  }
}
```

---

## 5. Schema Changes

### TypeScript Interfaces

```typescript
/**
 * ContentShowcaseItem Schema (v1.6)
 * Represents a promotional card with visual content and multiple CTAs
 */
interface ContentShowcaseItem {
  id: string;                          // Unique identifier (e.g., "holiday_giving_2024")
  title: string;                       // Card title
  tagline?: string;                    // Brief promotional text
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
  stats?: {label: string; value: string};
  highlights?: string[];               // Bullet points
  testimonial?: {text: string; attribution?: string};
  keywords?: string[];                 // Hidden (search/matching only)
}

/**
 * ConversationBranch Schema (v1.6)
 * Conversation branch with optional showcase item reference
 */
interface ConversationBranch {
  branch_id: string;                   // Unique branch identifier
  detection_keywords?: string[];       // Deprecated but kept for compatibility

  // NEW (Phase 1): Link to showcase item
  showcase_item_id?: string;           // References content_showcase[].id

  available_ctas?: {
    primary?: string;
    secondary?: string[];
  };

  // ... existing branch fields
}

/**
 * Backend Response Enhancement
 * Response format with showcase metadata
 */
interface EnhancedResponse {
  content: string;                     // AI-generated response text
  showcase?: {
    item: ContentShowcaseItem;         // Full showcase item object
    ctas: CTADefinition[];             // Resolved CTA objects with _position
  } | null;
  ctas?: CTADefinition[];              // Fallback CTAs if no showcase
  metadata: {
    branch_id: string;
    showcase_item_id?: string;
    showcase_missing?: boolean;
    timestamp: string;
  };
}

/**
 * CTA Definition with Position Metadata
 * CTA object enhanced with position for frontend styling
 */
interface CTADefinition {
  cta_id: string;
  label: string;
  url?: string;
  form_id?: string;
  target_branch?: string;
  _position?: 'primary' | 'secondary'; // Assigned by backend
}
```

---

## 6. ADR: Key Architectural Decisions

### ADR-1: Why `available_ctas` Structure Inside Showcase Items?

**Decision**: Add `available_ctas: {primary?: string, secondary?: string[]}` directly to showcase items instead of only in branches.

**Rationale**:
- **Single Source of Truth**: Showcase item owns its CTAs, ensuring consistency across all branch references
- **Reusability**: Same showcase item can be referenced by multiple branches without CTA duplication
- **Maintainability**: Updating CTAs for a campaign requires editing only one showcase item
- **Backward Compatibility**: Branches can still define their own CTAs if no showcase is linked

**Trade-offs**:
- ✅ Pro: Less configuration duplication
- ✅ Pro: Easier campaign management (edit once, deploy everywhere)
- ⚠️ Con: Branches lose CTA autonomy when showcase is linked (design intent)
- ⚠️ Con: Requires validation logic to ensure CTA references exist

**Alternative Considered**: CTAs only in branches, showcase items purely decorative
- **Rejected**: Forces duplication of CTAs across all branches that use same showcase; breaks "single campaign card" concept

---

### ADR-2: Why CTAs Live Inside Showcase Card (Not Branch Only)?

**Decision**: Response includes `showcase: {item: {...}, ctas: [...]}` instead of separate `showcase` and `ctas` arrays.

**Rationale**:
- **Visual Cohesion**: CTAs are part of the showcase card's visual presentation, not separate UI elements
- **Frontend Simplicity**: Single component (ShowcaseCard + CTAButtonGroup) handles entire promotional unit
- **User Experience**: CTAs appear directly below showcase content, maintaining campaign context
- **Styling Context**: Frontend can apply showcase-specific CTA styling (e.g., match campaign colors)

**Trade-offs**:
- ✅ Pro: Clear UI hierarchy (showcase card owns CTAs)
- ✅ Pro: Easier responsive design (card + CTAs treated as single unit)
- ⚠️ Con: Response payload slightly larger (includes full showcase item)
- ⚠️ Con: Frontend must handle `showcase.ctas` differently from `ctas` array

**Alternative Considered**: Separate `showcase` and `ctas` arrays in response
- **Rejected**: Breaks visual association between campaign card and actions; frontend would need complex logic to pair them

---

### ADR-3: Why Branch References Showcase Instead of Inline Embedding?

**Decision**: Use `showcase_item_id: string` reference instead of inline showcase object in branches.

**Rationale**:
- **DRY Principle**: Multiple branches can reference same showcase without duplication
- **Validation**: Can validate references during config save (broken references caught early)
- **Performance**: Smaller config size (no showcase object duplication)
- **Separation of Concerns**: Content showcase is managed separately from conversation branches

**Trade-offs**:
- ✅ Pro: Config maintainability (edit showcase once)
- ✅ Pro: Validates reference integrity
- ⚠️ Con: Requires resolution logic in backend (O(n) lookup in content_showcase[])
- ⚠️ Con: Broken references possible if showcase deleted

**Alternative Considered**: Inline showcase object directly in branch
- **Rejected**: Massive config duplication; no validation of showcase updates; config bloat

---

## 7. Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Broken CTA References** | Runtime errors, missing buttons, poor UX | **High** (human config error) | Real-time validation in Config Builder; pre-save blocking; graceful degradation in Lambda (log warning, skip broken CTA); validation dashboard |
| **Rendering Performance** | Laggy UX, poor performance scores | **Low** | Lazy load showcase images (`loading="lazy"`); CSS containment for layout performance; benchmark render times (<100ms); monitor real-user metrics |
| **Mobile Responsiveness** | Horizontal scrolling, cut-off content | **Medium** | Thorough mobile testing (<320px breakpoint); CSS Grid with responsive breakpoints; limit highlights to 4 items; mobile preview in Config Builder |

---

## 8. Validation Checklist

### Schema Validation
- [ ] `content_showcase[]` objects support `available_ctas: {primary?: string, secondary?: string[]}` structure
- [ ] `conversation_branches[]` objects support `showcase_item_id?: string` field
- [ ] Validation rejects configs where `available_ctas` references non-existent `cta_id` values
- [ ] Backward compatibility preserved: existing configs with `cta_id` continue working

### Backend Processing
- [ ] Master_Function logs showcase item routing decisions to CloudWatch
- [ ] Bedrock_Streaming_Handler enhances responses with showcase cards when `showcase_item_id` present
- [ ] Lambda functions handle missing showcase items gracefully (warning log, no crash)
- [ ] Response format includes showcase card metadata for frontend rendering

### Frontend Rendering
- [ ] MessageBubble detects showcase card metadata in response
- [ ] ShowcaseCard component renders image, title, tagline, description, stats, highlights, testimonial
- [ ] CTAs render below showcase card using existing CTAButton component with `_position` metadata
- [ ] Mobile (<320px) stacks showcase content and CTAs vertically
- [ ] Desktop (>320px) displays showcase card with CTAs in optimal layout

---

## 9. Implementation Phases

### Phase 1: Schema & Backend (Week 2, Days 1-2)
- Update TENANT_CONFIG_SCHEMA.md with `available_ctas` and `showcase_item_id`
- Add TypeScript types (`src/types/showcase.ts`)
- Implement showcase resolution in Master_Function_Staging (`resolve_showcase_item()`)
- Implement CTA extraction in Bedrock_Streaming_Handler (`extractShowcaseCTAs()`)
- Add CloudWatch logging for showcase routing decisions
- Write unit tests for showcase resolution and CTA extraction

### Phase 2: Frontend (Week 3, Days 3-5)
- Create ShowcaseCard component (`src/components/chat/ShowcaseCard.jsx`)
- Update MessageBubble to detect and render showcase metadata
- Update CTAButton to support `_position` metadata
- Add DOMPurify sanitization for showcase content
- Verify CSS styles (existing `.showcase-card-*` classes in `theme.css` lines 4665-4829)
- Implement lazy loading for images
- Write unit tests (ShowcaseCard, MessageBubble integration)

### Phase 3: Config Builder (Week 2, Days 3-5)
- Update ContentShowcaseEditor with CTA management UI
- Update BranchEditor with showcase item dropdown
- Add real-time validation for showcase/CTA references
- Create ShowcasePreview component for live preview
- Write unit tests for validation logic

### Phase 4: Testing & QA (Week 4, Days 1-3)
- Unit test coverage (target: 90%+ for new code)
- Integration tests (end-to-end showcase routing flow)
- Performance benchmarks (showcase lookup <10ms, render <100ms)
- Accessibility testing (automated + manual WCAG audit)
- Mobile testing (iOS Safari, Android Chrome)

### Phase 5: Documentation & Deployment (Week 4, Days 4-5)
- Update TENANT_CONFIG_SCHEMA.md with showcase CTA hub examples
- Write Config Builder guide (step-by-step showcase setup)
- Update migration guide (v1.5 → v1.6 migration path)
- Deploy to staging → smoke testing → production
- Monitor logs and metrics

---

## 10. Success Criteria

### Functional
- [ ] Showcase items display with image, title, tagline, description, stats, highlights, testimonial
- [ ] Primary CTA renders with prominent styling (`.cta-button-primary`)
- [ ] Secondary CTAs render with grouped styling (`.cta-button-secondary`)
- [ ] CTA clicks route to `target_branch` or trigger `form_id` correctly
- [ ] Missing showcase items fail gracefully (log warning, show branch CTAs)

### Performance
- [ ] Showcase lookup completes in <10ms (in-memory access from cached config)
- [ ] CTA validation during config save completes in <500ms for configs with 50+ showcase items
- [ ] Frontend showcase card render completes in <100ms
- [ ] Lambda response time shows no degradation (p95 <300ms)

### Accessibility
- [ ] Showcase card image includes alt text from `title` field
- [ ] CTA buttons maintain WCAG 2.1 AA contrast ratios (4.5:1 minimum)
- [ ] Keyboard navigation supports tabbing through showcase CTAs
- [ ] Screen readers announce showcase card content before CTAs

---

## 11. Related Documents

- **[PRD_SHOWCASE_ITEMS_CTA_HUBS.md](./PRD_SHOWCASE_ITEMS_CTA_HUBS.md)** - Product requirements
- **[TENANT_CONFIG_SCHEMA.md](./TENANT_CONFIG_SCHEMA.md)** - Full tenant configuration schema (v1.5)
- **[MIGRATION_GUIDE_V1.3_TO_V1.4.1.md](./MIGRATION_GUIDE_V1.3_TO_V1.4.1.md)** - Schema migration guide
- **[WEB_CONFIG_BUILDER_PRD.md](./WEB_CONFIG_BUILDER_PRD.md)** - Config Builder product spec

---

**End of Technical Design Document**

**Document Control**:
- Version: 1.0
- Status: Final
- Next Review: After implementation kickoff
- Approvers: Engineering Lead, Frontend Lead, Backend Lead
- Estimated Implementation: 3 weeks (15 days)
