# Product Requirements Document: Context-Based CTA Styling

**Document Version:** 1.0
**Last Updated:** 2025-10-30
**Status:** Draft
**Estimated Effort:** 4 hours development

---

## Executive Summary

This PRD defines the implementation of context-based CTA (Call-to-Action) styling in the Picasso chat widget system. The current implementation uses fixed styling at the CTA definition level, creating conflicts when the same CTA is reused across different conversation branches in different roles. This change removes fixed styling and makes CTA presentation context-aware based on branch position.

---

## Problem Statement

### Current State

The Picasso chat widget system currently defines CTA styling at the CTA definition level using a fixed `style` field with values: `primary`, `secondary`, or `info`. Each CTA definition includes this immutable style property.

### Pain Points

1. **Style Conflicts**: When a single CTA (e.g., "Learn More") is reused across multiple conversation branches, it always renders with the same fixed style, regardless of its intended role in that specific context.

2. **Design Inconsistency**: A CTA marked as `style: "primary"` in its definition will always render as a solid button, even when added to a branch's secondary CTA array where it should visually appear secondary.

3. **Configuration Overhead**: Content creators must create duplicate CTA definitions with different IDs to achieve different styling for the same logical action across branches.

4. **Maintainability Issues**: Changes to CTA text, URLs, or metadata require updating multiple duplicate definitions instead of a single source.

### Example Scenario

```json
// Current problematic scenario
{
  "cta_id": "learn_more_housing",
  "label": "Learn More",
  "style": "primary",  // Fixed at definition
  "action": { "type": "navigate", "url": "..." }
}

// Branch 1: Uses as primary CTA (correct rendering)
{
  "branch_id": "housing_overview",
  "primary_ctas": ["learn_more_housing"]  // Renders correctly as solid
}

// Branch 2: Uses as secondary CTA (incorrect rendering)
{
  "branch_id": "detailed_program",
  "primary_ctas": ["apply_now"],
  "secondary_ctas": ["learn_more_housing"]  // PROBLEM: Still renders as solid
}
```

---

## Target Users

### Primary Users
- **Content Creators/Administrators**: Staff configuring conversation flows and CTAs through the config builder interface
- **End Users**: Chat widget users who interact with CTAs in conversation branches

### Secondary Users
- **Developers**: Maintaining backend routing logic and frontend rendering
- **QA Testers**: Validating CTA behavior across conversation flows

---

## Jobs to Be Done

### For Content Creators
- **When** configuring conversation branches with CTAs
- **I want to** reuse the same CTA definition in different visual roles (primary/secondary)
- **So that** I can maintain a single source of truth while achieving context-appropriate styling

### For End Users
- **When** viewing CTAs in a conversation branch
- **I want to** see clear visual hierarchy indicating primary vs secondary actions
- **So that** I understand which action is recommended and can make informed decisions

### For Developers
- **When** implementing new features or maintaining the system
- **I want** CTA styling to be determined algorithmically by position
- **So that** logic is centralized and easier to test and maintain

---

## Proposed Solution

### High-Level Approach

Remove the fixed `style` field from CTA definitions entirely and make styling **context-based**. The visual presentation of a CTA is determined by its position in a conversation branch (primary vs secondary array), not by a property in its definition.

### Architecture Changes

1. **Backend (Lambda - response_enhancer.js)**
   - When building CTAs for a branch response, add `_position` metadata to each CTA object
   - `_position: 'primary'` for CTAs in the `primary_ctas` array
   - `_position: 'secondary'` for CTAs in the `secondary_ctas` array

2. **Frontend (Picasso - CTAButton.jsx)**
   - Read `cta._position` instead of `cta.style`
   - Apply CSS classes based on position: `cta-button--primary` or `cta-button--secondary`
   - Remove all references to the deprecated `style` field

3. **Config Builder UI**
   - Remove "Style" dropdown from CTA editor interface
   - Update schema validation to exclude `style` field
   - Update documentation and tooltips

### Key Benefits

1. **Single Source of Truth**: One CTA definition can be reused across all branches
2. **Automatic Context Awareness**: Styling adapts to role in conversation flow
3. **Simplified Configuration**: Fewer fields for content creators to manage
4. **Improved Maintainability**: Changes propagate automatically to all usages
5. **Design Consistency**: Visual hierarchy always matches semantic intent

---

## Functional Requirements

### FR1: Backend Metadata Injection
**Priority:** P0 (Critical)

The `response_enhancer.js` Lambda function must add `_position` metadata to each CTA when building a branch response.

**Acceptance Criteria:**
1. For each CTA in `branch.primary_ctas` array, add `_position: 'primary'` to the CTA object
2. For each CTA in `branch.secondary_ctas` array, add `_position: 'secondary'` to the CTA object
3. The `_position` field is present in the response payload sent to the frontend
4. If a CTA definition includes a legacy `style` field, it is ignored and not passed to frontend
5. The metadata addition preserves all other CTA properties (id, label, action, metadata, etc.)

### FR2: Frontend Position-Based Rendering
**Priority:** P0 (Critical)

The `CTAButton.jsx` component must render styling based on `_position` metadata.

**Acceptance Criteria:**
1. Component reads `cta._position` instead of `cta.style` for styling determination
2. When `_position === 'primary'`, apply CSS class `cta-button--primary` (solid styling)
3. When `_position === 'secondary'`, apply CSS class `cta-button--secondary` (outline styling)
4. If `_position` is missing, default to `secondary` styling (defensive programming)
5. Component removes all references to the deprecated `style` field
6. Existing CSS classes and styling rules remain unchanged

### FR3: Schema Update
**Priority:** P0 (Critical)

The tenant configuration schema must remove the `style` field from CTA definitions.

**Acceptance Criteria:**
1. Remove `style` field from CTA definition schema in `TENANT_CONFIG_SCHEMA.md`
2. Update example configurations to remove `style` field
3. Schema validation rejects CTA definitions containing `style` field (strict mode)
4. Documentation clearly states that styling is context-based, not definition-based

### FR4: Config Builder UI Update
**Priority:** P1 (High)

The config builder UI must remove CTA style selection interface.

**Acceptance Criteria:**
1. Remove "Style" dropdown from CTA editor wireframe
2. Update form validation to not expect `style` field
3. Update tooltips/help text to explain context-based styling
4. Add informational note: "CTA styling is automatically determined by its position in conversation branches (primary or secondary)"
5. Existing CTA definitions automatically work without `style` field

### FR5: CTA Reusability
**Priority:** P0 (Critical)

The same CTA definition must be usable in both primary and secondary positions across branches.

**Acceptance Criteria:**
1. A single CTA ID can appear in both `primary_ctas` and `secondary_ctas` arrays across different branches
2. The CTA renders with appropriate styling in each context
3. Changes to CTA label, URL, or metadata automatically propagate to all usages
4. No duplicate CTA definitions are required for different styling

---

## Non-Functional Requirements

### NFR1: Performance
- Metadata injection must add less than 5ms to branch response processing time
- Frontend rendering performance must remain unchanged
- No additional network requests required

### NFR2: Backward Compatibility
- **Not Required**: This is a new platform with no existing customers
- Clean implementation without legacy support code
- Deprecated `style` field removal is non-breaking (platform not in production use)

### NFR3: Code Quality
- All changes must pass existing test suites
- Code coverage must remain above 80% for modified components
- ESLint and TypeScript checks must pass
- Follow existing code style and patterns

### NFR4: Documentation
- Update inline code comments for modified functions
- Update `TENANT_CONFIG_SCHEMA.md` with schema changes
- Update config builder documentation/help text
- Add migration notes for internal team reference

### NFR5: Testability
- Backend metadata injection must be unit testable
- Frontend rendering must be component testable
- End-to-end tests must validate styling in both contexts
- Test coverage for edge cases (missing position, invalid position)

---

## User Stories

### Story 1: Content Creator - Configure Reusable CTA
```
As a content creator
I want to define a "Learn More" CTA once
So that I can reuse it across multiple branches without creating duplicates

Acceptance:
- I create one CTA definition with id, label, and action
- I add this CTA ID to primary_ctas in Branch A
- I add the same CTA ID to secondary_ctas in Branch B
- The CTA displays as solid (primary) in Branch A
- The CTA displays as outline (secondary) in Branch B
```

### Story 2: Content Creator - Update CTA Label
```
As a content creator
I want to update a CTA label in one place
So that the change applies to all branches using that CTA

Acceptance:
- I change the label of CTA "learn_more_housing" from "Learn More" to "Get Details"
- All branches using this CTA ID automatically show "Get Details"
- I don't need to update multiple duplicate definitions
- Styling remains context-appropriate in each branch
```

### Story 3: End User - Visual Hierarchy
```
As a chat widget user
I want to see clear visual distinction between primary and secondary CTAs
So that I understand which action is recommended

Acceptance:
- Primary CTAs appear as solid colored buttons
- Secondary CTAs appear as outline buttons
- The visual hierarchy is consistent across all conversation branches
- I can easily identify the primary recommended action
```

### Story 4: Developer - Maintain Routing Logic
```
As a developer
I want CTA styling to be determined by a single algorithmic rule
So that I can test and maintain the logic easily

Acceptance:
- Position metadata is added in one centralized location (response_enhancer.js)
- Frontend rendering logic is in one component (CTAButton.jsx)
- Unit tests cover position metadata injection
- Component tests cover position-based rendering
- No scattered style logic across multiple files
```

---

## Out of Scope

The following items are explicitly **not** included in this implementation:

1. **Additional CTA Positions**: Only `primary` and `secondary` positions are supported. No tertiary, quaternary, or custom positions.

2. **Custom Styling Overrides**: No support for branch-level or per-usage styling overrides beyond primary/secondary.

3. **Animated Transitions**: No animated transitions when CTAs change styling based on position.

4. **A/B Testing**: No built-in support for testing different visual presentations.

5. **Legacy Migration Tooling**: No automated scripts to migrate existing configs (platform has no production customers).

6. **Third Style Variants**: The `info` style (if it exists) is not preserved. Only primary/secondary dichotomy is supported.

7. **Position Analytics**: No tracking of which position CTAs are used in most frequently.

8. **Dynamic Position Changes**: No support for changing CTA position at runtime based on user behavior.

---

## Success Metrics

### Development Metrics
- **Implementation Time**: Complete all changes within 4 hours estimated effort
- **Code Coverage**: Maintain or improve test coverage above 80%
- **Zero Regressions**: No existing tests broken by changes

### Functional Metrics
- **CTA Reusability**: 100% of CTAs can be used in both primary and secondary positions
- **Styling Accuracy**: 100% of CTAs render with correct styling for their position
- **Configuration Simplification**: Zero duplicate CTAs needed for styling purposes

### Quality Metrics
- **Bug Rate**: Zero styling-related bugs in first 2 weeks post-deployment
- **Documentation Completeness**: 100% of public-facing docs updated
- **Developer Feedback**: Positive feedback from team on maintainability improvement

---

## Edge Cases and Constraints

### Edge Case 1: Missing Position Metadata
**Scenario:** Frontend receives a CTA without `_position` field
**Handling:** Default to `secondary` styling (defensive programming)
**Rationale:** Secondary styling is less visually prominent and safer fallback

### Edge Case 2: Invalid Position Value
**Scenario:** `_position` contains unexpected value (e.g., `tertiary`, `custom`)
**Handling:** Default to `secondary` styling
**Rationale:** Fail gracefully rather than breaking rendering

### Edge Case 3: Empty CTA Arrays
**Scenario:** Branch has empty `primary_ctas` or `secondary_ctas` arrays
**Handling:** No CTAs rendered, no metadata injection needed
**Rationale:** Standard behavior, no special handling required

### Edge Case 4: CTA in Both Arrays
**Scenario:** Same CTA ID appears in both `primary_ctas` and `secondary_ctas` in same branch
**Handling:** Each instance gets appropriate position metadata, renders independently
**Rationale:** Content creator error but system handles gracefully

### Edge Case 5: Legacy Style Field Present
**Scenario:** CTA definition includes deprecated `style` field
**Handling:** Backend ignores and does not pass to frontend
**Rationale:** Clean migration, no legacy support needed

### Constraint 1: CSS Class Names
**Current:** Existing CSS classes `cta-button--primary` and `cta-button--secondary` must remain unchanged
**Rationale:** Styling consistency and avoiding cascading CSS changes

### Constraint 2: Metadata Naming
**Current:** Use underscore prefix `_position` to indicate metadata vs configuration
**Rationale:** Consistent with existing metadata conventions (e.g., `_timestamp`)

### Constraint 3: No Database Changes
**Current:** No changes to DynamoDB schema or S3 storage format
**Rationale:** Configuration changes only, no infrastructure modifications

---

## Technical Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Tenant Configuration (S3)               │
│  {                                                          │
│    "cta_inventory": [                                       │
│      {                                                      │
│        "cta_id": "learn_more",                             │
│        "label": "Learn More",                              │
│        "action": { "type": "navigate", "url": "..." }     │
│        // NO style field                                   │
│      }                                                      │
│    ],                                                       │
│    "branches": [                                           │
│      {                                                      │
│        "branch_id": "overview",                            │
│        "primary_ctas": ["learn_more"],                     │
│        "secondary_ctas": []                                │
│      }                                                      │
│    ]                                                        │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend: response_enhancer.js (Lambda)         │
│                                                             │
│  function buildBranchResponse(branch, config) {            │
│    const ctas = {                                          │
│      primary: branch.primary_ctas.map(id => ({            │
│        ...config.cta_inventory.find(c => c.cta_id === id),│
│        _position: 'primary'  // ← ADD METADATA            │
│      })),                                                  │
│      secondary: branch.secondary_ctas.map(id => ({        │
│        ...config.cta_inventory.find(c => c.cta_id === id),│
│        _position: 'secondary'  // ← ADD METADATA          │
│      }))                                                   │
│    };                                                       │
│    return { ...branch, ctas };                            │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    SSE Stream to Frontend                   │
│  {                                                          │
│    "branch_id": "overview",                                │
│    "ctas": {                                               │
│      "primary": [                                          │
│        {                                                   │
│          "cta_id": "learn_more",                          │
│          "label": "Learn More",                           │
│          "_position": "primary",  // ← METADATA           │
│          "action": { ... }                                │
│        }                                                   │
│      ],                                                    │
│      "secondary": []                                       │
│    }                                                        │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Frontend: CTAButton.jsx (React)                │
│                                                             │
│  function CTAButton({ cta }) {                             │
│    const position = cta._position || 'secondary';         │
│    const className = `cta-button--${position}`;           │
│                                                             │
│    return (                                                │
│      <button className={className}>                        │
│        {cta.label}                                         │
│      </button>                                             │
│    );                                                       │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        CSS Rendering                        │
│                                                             │
│  .cta-button--primary {                                    │
│    background: var(--cta-primary-bg);                      │
│    color: var(--cta-primary-text);                         │
│    border: none;                                           │
│  }                                                          │
│                                                             │
│  .cta-button--secondary {                                  │
│    background: transparent;                                │
│    color: var(--cta-secondary-text);                       │
│    border: 2px solid var(--cta-secondary-border);          │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Configuration Load**: Lambda loads tenant config from S3 (no `style` field in CTAs)
2. **Request Processing**: User message triggers branch selection logic
3. **Response Building**: `response_enhancer.js` builds branch response with CTAs
4. **Metadata Injection**: For each CTA, add `_position` based on array membership
5. **SSE Streaming**: Response with metadata sent to frontend via Bedrock streaming
6. **Component Rendering**: `CTAButton.jsx` reads `_position` and applies CSS class
7. **Visual Display**: Browser renders button with context-appropriate styling

### File Modifications

| Component | File Path | Modification Type |
|-----------|-----------|------------------|
| Backend | `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/response_enhancer.js` | Logic change |
| Frontend | `Picasso/src/components/chat/CTAButton.jsx` | Logic change |
| Schema | `Picasso/docs/TENANT_CONFIG_SCHEMA.md` | Documentation update |
| Config Builder | `Sandbox/cta-editor-wireframe-v2.html` | UI removal |

---

## Risks and Mitigations

### Risk 1: Frontend Receives Legacy Style Field
**Probability:** Low
**Impact:** Medium
**Mitigation:** Backend explicitly strips `style` field during metadata injection
**Contingency:** Frontend ignores `style` field even if present

### Risk 2: Missing Position Metadata
**Probability:** Low
**Impact:** Low
**Mitigation:** Frontend defaults to `secondary` styling when `_position` is missing
**Contingency:** Monitoring and alerts for missing metadata patterns

### Risk 3: CSS Class Name Conflicts
**Probability:** Very Low
**Impact:** High
**Mitigation:** Use existing CSS class names that are already tested
**Contingency:** Regression testing of visual appearance before deployment

### Risk 4: Incomplete Documentation
**Probability:** Medium
**Impact:** Medium
**Mitigation:** Include documentation updates in acceptance criteria
**Contingency:** Post-deployment documentation review with team

### Risk 5: Configuration Migration Confusion
**Probability:** Low
**Impact:** Low
**Mitigation:** Clear communication that no migration needed (no production customers)
**Contingency:** Example configurations provided for reference

---

## Open Questions

1. **Q:** Should we log a warning when legacy `style` field is encountered?
   **A:** TBD - Discuss with team whether telemetry is useful

2. **Q:** Should config builder validation reject configs with `style` field?
   **A:** TBD - Decide on strict vs permissive validation strategy

3. **Q:** Should we support more than 2 position types in the future?
   **A:** Out of scope for this implementation, but design should not prevent future expansion

---

## Appendix: Example Configurations

### Before (Current System - With Style Field)
```json
{
  "cta_inventory": [
    {
      "cta_id": "learn_more_housing_primary",
      "label": "Learn More",
      "style": "primary",
      "action": { "type": "navigate", "url": "/housing" }
    },
    {
      "cta_id": "learn_more_housing_secondary",
      "label": "Learn More",
      "style": "secondary",
      "action": { "type": "navigate", "url": "/housing" }
    }
  ],
  "branches": [
    {
      "branch_id": "overview",
      "primary_ctas": ["learn_more_housing_primary"]
    },
    {
      "branch_id": "details",
      "primary_ctas": ["apply_now"],
      "secondary_ctas": ["learn_more_housing_secondary"]
    }
  ]
}
```

### After (New System - Position-Based)
```json
{
  "cta_inventory": [
    {
      "cta_id": "learn_more_housing",
      "label": "Learn More",
      "action": { "type": "navigate", "url": "/housing" }
    },
    {
      "cta_id": "apply_now",
      "label": "Apply Now",
      "action": { "type": "form", "form_id": "application" }
    }
  ],
  "branches": [
    {
      "branch_id": "overview",
      "primary_ctas": ["learn_more_housing"]
    },
    {
      "branch_id": "details",
      "primary_ctas": ["apply_now"],
      "secondary_ctas": ["learn_more_housing"]
    }
  ]
}
```

### Response Payload (Backend to Frontend)
```json
{
  "branch_id": "details",
  "message": "Here's detailed information...",
  "ctas": {
    "primary": [
      {
        "cta_id": "apply_now",
        "label": "Apply Now",
        "_position": "primary",
        "action": { "type": "form", "form_id": "application" }
      }
    ],
    "secondary": [
      {
        "cta_id": "learn_more_housing",
        "label": "Learn More",
        "_position": "secondary",
        "action": { "type": "navigate", "url": "/housing" }
      }
    ]
  }
}
```

---

## Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Product Owner | | | |
| Tech Lead | | | |
| Engineering Manager | | | |

---

**Document History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-30 | Claude Code | Initial draft |
