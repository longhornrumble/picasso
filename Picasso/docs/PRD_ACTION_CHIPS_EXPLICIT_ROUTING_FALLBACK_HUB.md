# Product Requirements Document: Action Chips Explicit Routing with Fallback Navigation Hub

**Version**: 1.0
**Date**: 2025-10-30
**Owner**: Product Management
**Status**: Ready for Engineering Review

---

## Executive Summary

### Problem Statement

Action chips currently rely on unreliable keyword matching for conversation routing, creating an unpredictable and brittle user experience. Unlike CTAs which have explicit `target_branch` routing, action chips send text messages that trigger keyword detection logic, leading to:

1. **Ambiguous routing**: Same text can match multiple conversation branches
2. **High maintenance burden**: Keywords must be updated as content evolves
3. **Dead ends**: Users hit scenarios where no CTAs are shown with no clear path forward
4. **Unpredictable behavior**: Keyword matching is fragile and inconsistent across queries

### Proposed Solution

**Option A2 + Fallback Branch Navigation Hub** introduces a three-tier routing hierarchy that eliminates keyword matching for action chips while providing a safety net for all user interactions:

1. **Action Chips Get Explicit Routing**: Transform action chips from simple array to dictionary with auto-generated IDs and `target_branch` field (matching CTA routing pattern)
2. **Remove Keyword Matching**: Eliminate `detection_keywords` from conversation branches, simplifying routing logic to explicit-only
3. **Add Fallback Navigation Hub**: Create a configurable fallback branch that always shows bundled CTAs when no explicit routing matches, ensuring users never hit dead ends

**New Routing Hierarchy (3 levels)**:
```
1. Explicit action chip routing (chip.target_branch) - User clicks action chip
2. Explicit CTA routing (cta.target_branch) - User clicks CTA button
3. Fallback navigation hub (always available) - User types free-form query
```

### Success Metrics

| Metric | Baseline | Target | Timeline |
|--------|----------|--------|----------|
| "No CTAs shown" incidents | ~15% of queries | <2% of queries | 90 days |
| User engagement (CTA clicks) | 12% click-through | >25% click-through | 90 days |
| Keyword configuration time | 45 min per tenant | 0 min (eliminated) | Immediate |
| Routing-related support tickets | 6/month | <2/month | 90 days |
| Admin satisfaction with predictability | 3.2/5 | >4.5/5 | 60 days |

### Timeline Estimate

- **Week 1**: Backend changes (Lambda + schema updates)
- **Week 2**: Frontend changes (MessageBubble.jsx metadata passing)
- **Week 3**: Config Builder UI updates + migration tooling
- **Week 4**: Testing, validation, and gradual rollout

---

## User Stories & Use Cases

### Personas

**Primary**: **Tenant Admin** (Operations Team Member)
- Configures action chips, CTAs, and conversation branches
- Needs predictable, maintainable routing logic
- Values simplicity and clear debugging

**Secondary**: **End User** (Website Visitor)
- Interacts with chat widget via action chips and free-form queries
- Expects consistent, discoverable navigation options
- Should never hit dead ends

### Current Pain Points

#### Pain Point 1: Keyword Matching is Brittle
```json
// Current problematic flow
{
  "conversation_branches": {
    "volunteer_interest": {
      "detection_keywords": ["volunteer", "help", "involved"],
      "available_ctas": {...}
    },
    "donation_interest": {
      "detection_keywords": ["donate", "help", "support"],
      "available_ctas": {...}
    }
  }
}
```
**Problem**: User query "I want to help" matches BOTH branches. Which CTAs should display?

#### Pain Point 2: Dead End User Experience
**Scenario**: User types generic query like "What can I do?" that doesn't match any keywords.
**Result**: Bedrock responds with text, but no CTAs are shown. User has no clear next steps.

#### Pain Point 3: Maintenance Burden
Every content update requires:
1. Reviewing all conversation branches
2. Testing keyword variations
3. Updating keywords to match new phrasing
4. Re-testing all routing logic

### Desired Workflow (Post-Implementation)

#### Workflow 1: Tenant Admin Configuration

**Stage 1 (Bubble Onboarding)**: Creates action chips as simple array (unchanged)
```json
{
  "action_chips_array": [
    {"label": "Learn About Volunteering", "value": "Tell me about volunteer opportunities"},
    {"label": "Donate", "value": "How can I donate?"}
  ]
}
```

**Stage 2 (deploy_tenant_stack Lambda)**: Auto-transforms array to dictionary with IDs
```json
{
  "action_chips": {
    "learn_about_volunteering": {
      "id": "learn_about_volunteering",
      "label": "Learn About Volunteering",
      "value": "Tell me about volunteer opportunities",
      "target_branch": null  // Admin links this in Config Builder
    },
    "donate": {
      "id": "donate",
      "label": "Donate",
      "value": "How can I donate?",
      "target_branch": null
    }
  }
}
```

**Stage 3 (Config Builder)**: Admin links chips to branches
```json
{
  "action_chips": {
    "learn_about_volunteering": {
      "id": "learn_about_volunteering",
      "label": "Learn About Volunteering",
      "value": "Tell me about volunteer opportunities",
      "target_branch": "volunteer_interest"  // Explicitly linked
    },
    "donate": {
      "id": "donate",
      "label": "Donate",
      "value": "How can I donate?",
      "target_branch": "donation_interest"  // Explicitly linked
    }
  }
}
```

**Stage 4 (Config Builder)**: Admin configures fallback navigation hub
```json
{
  "cta_settings": {
    "fallback_branch": "navigation_hub"  // Always shows when no explicit routing
  },
  "conversation_branches": {
    "navigation_hub": {
      "available_ctas": {
        "primary": "volunteer_apply",
        "secondary": ["schedule_discovery", "contact_us"]
      }
    }
  }
}
```

#### Workflow 2: End User Runtime Experience

**Scenario A**: User clicks action chip "Learn About Volunteering"
1. Frontend passes metadata: `{action_chip_triggered: true, action_chip_id: "learn_about_volunteering", target_branch: "volunteer_interest"}`
2. Lambda routes to `volunteer_interest` branch (explicit routing)
3. User sees relevant CTAs for volunteering

**Scenario B**: User types free-form query "What programs do you offer?"
1. No explicit routing metadata
2. Lambda checks for CTA `target_branch` routing (none)
3. Falls back to `fallback_branch` (navigation_hub)
4. User sees navigation CTAs: Apply, Schedule Discovery, Contact Us

**Scenario C**: User clicks CTA "Apply to Program"
1. CTA has explicit `target_branch: "application_flow"`
2. Lambda routes to application_flow branch
3. User sees application-specific CTAs

### Acceptance Criteria

**Critical Requirements (Must Pass Before Deployment)**:

1. **Action Chip Transformation**: `deploy_tenant_stack` Lambda converts action chip arrays to dictionary format with auto-generated IDs
2. **ID Generation Algorithm**: IDs are generated via slugification (lowercase, underscores, alphanumeric only) with collision detection
3. **Collision Detection**: If ID collision occurs, append `-2`, `-3`, etc. until unique
4. **Backward Compatibility**: Existing tenants with array-format action chips continue to work (graceful degradation)
5. **Frontend Metadata Passing**: `MessageBubble.jsx` `handleActionClick()` passes metadata when action chip clicked:
   ```javascript
   {
     action_chip_triggered: true,
     action_chip_id: chip.id,
     target_branch: chip.target_branch
   }
   ```
6. **Lambda Routing Logic**: Master Function prioritizes routing in 3-tier hierarchy:
   - If `action_chip_triggered` and `target_branch` exists, route to branch
   - Else if CTA has `target_branch`, route to branch
   - Else route to `fallback_branch` (from `cta_settings`)
7. **Keyword Detection Removed**: Conversation branches no longer check `detection_keywords` for routing decisions
8. **Fallback Branch Configuration**: New `cta_settings.fallback_branch` field references a conversation branch
9. **Schema Validation**: Config validator enforces:
   - `fallback_branch` must reference existing branch
   - Referenced fallback branch must have `available_ctas`
10. **Config Builder UI**: Admin can:
    - Link action chips to conversation branches via dropdown
    - Select fallback branch from existing branches
    - See validation warnings if fallback branch not configured

**Non-Critical Enhancements (Can Deploy Without)**:

11. **Migration Tool**: CLI script to auto-convert v1.3 configs to v1.4 format (adds action chip IDs)
12. **Validation Warnings**: Config Builder shows warning if action chip has no `target_branch` assigned
13. **Visual Routing Map**: Config Builder displays diagram showing action chip → branch → CTA flow
14. **Branch Usage Analytics**: Track which branches are most/least used for optimization

---

## Functional Requirements

### FR-1: Action Chip Dictionary Format

**Requirement**: Transform action chips from array to dictionary with unique IDs

**Input (Bubble)**: Simple array format
```json
{
  "action_chips_array": [
    {"label": "Volunteer", "value": "Tell me about volunteering"},
    {"label": "Donate Now!", "value": "How do I donate?"}
  ]
}
```

**Output (Picasso Config)**: Dictionary with auto-generated IDs
```json
{
  "action_chips": {
    "volunteer": {
      "id": "volunteer",
      "label": "Volunteer",
      "value": "Tell me about volunteering",
      "target_branch": null
    },
    "donate_now": {
      "id": "donate_now",
      "label": "Donate Now!",
      "value": "How do I donate?",
      "target_branch": null
    }
  }
}
```

**Transformation Logic**:
```python
def generate_action_chip_id(label: str, existing_ids: set) -> str:
    """
    Generate unique ID from label via slugification
    - Convert to lowercase
    - Replace spaces/special chars with underscores
    - Remove consecutive underscores
    - Trim leading/trailing underscores
    - If collision, append -2, -3, etc.
    """
    base_id = re.sub(r'[^a-z0-9]+', '_', label.lower()).strip('_')

    if base_id not in existing_ids:
        return base_id

    # Handle collision
    counter = 2
    while f"{base_id}_{counter}" in existing_ids:
        counter += 1
    return f"{base_id}_{counter}"
```

**Validation Rules**:
- IDs must be unique within tenant config
- IDs must match pattern: `^[a-z0-9_]+$`
- `target_branch` must reference existing conversation branch (if not null)

### FR-2: Frontend Metadata Passing

**Requirement**: Pass explicit routing metadata when action chip clicked

**File**: `/Picasso/src/components/chat/MessageBubble.jsx`

**Current Implementation** (Lines 505-509):
```javascript
const handleActionClick = (action) => {
  if (isTyping) return;
  const messageText = action.value || action.label;
  addMessage({ role: "user", content: messageText });
};
```

**New Implementation**:
```javascript
const handleActionClick = (action) => {
  if (isTyping) return;
  const messageText = action.value || action.label;

  // Pass action chip metadata for explicit routing
  const metadata = {
    action_chip_triggered: true,
    action_chip_id: action.id,
    target_branch: action.target_branch
  };

  addMessage({ role: "user", content: messageText }, metadata);
};
```

**Note**: `ResponseCard.jsx` is NOT modified - it handles CTAs which already have explicit routing.

**Validation**:
- Metadata only passed when action chip clicked (not for typed messages)
- `target_branch` can be null (falls back to fallback_branch)
- Metadata must be preserved through Lambda request

### FR-3: Remove Keyword Detection from Routing

**Requirement**: Eliminate `detection_keywords` from conversation branch routing logic

**Current Flow** (deprecated):
```python
# Master Function - REMOVE THIS LOGIC
def select_branch_by_keywords(user_message: str, branches: dict) -> str:
    message_lower = user_message.lower()

    for branch_name, branch_config in branches.items():
        keywords = branch_config.get('detection_keywords', [])
        for keyword in keywords:
            if keyword in message_lower:
                return branch_name

    return None  # No match = no CTAs shown
```

**New Flow** (explicit routing only):
```python
def select_branch(metadata: dict, cta_settings: dict) -> str:
    # Priority 1: Action chip explicit routing
    if metadata.get('action_chip_triggered'):
        target_branch = metadata.get('target_branch')
        if target_branch:
            return target_branch

    # Priority 2: CTA explicit routing
    if metadata.get('cta_triggered'):
        target_branch = metadata.get('target_branch')
        if target_branch:
            return target_branch

    # Priority 3: Fallback navigation hub
    fallback_branch = cta_settings.get('fallback_branch')
    if fallback_branch:
        return fallback_branch

    # Safety: No CTAs if fallback not configured (backward compatibility)
    return None
```

**Migration Consideration**:
- `detection_keywords` field remains in schema for backward compatibility
- Routing logic ignores keywords entirely
- Future schema version can deprecate the field

### FR-4: Fallback Branch Configuration

**Requirement**: Add `fallback_branch` to `cta_settings` configuration

**Schema Addition**:
```json
{
  "cta_settings": {
    "fallback_branch": "string",  // NEW: References conversation branch ID
    "max_display": 3,             // Existing: Max CTAs to show
    "bundling_strategy": "string" // Existing: How to group CTAs
  }
}
```

**Example Configuration**:
```json
{
  "cta_settings": {
    "fallback_branch": "navigation_hub",
    "max_display": 3,
    "bundling_strategy": "readiness_based"
  },
  "conversation_branches": {
    "navigation_hub": {
      "available_ctas": {
        "primary": "volunteer_apply",
        "secondary": ["schedule_discovery", "contact_us"]
      }
    },
    "volunteer_interest": {
      "available_ctas": {
        "primary": "volunteer_apply",
        "secondary": ["view_volunteer_programs"]
      }
    },
    "donation_interest": {
      "available_ctas": {
        "primary": "donate_now",
        "secondary": ["view_donation_options"]
      }
    }
  }
}
```

**Validation Rules**:
- `fallback_branch` must reference existing conversation branch
- Referenced branch must have `available_ctas` configured
- If `fallback_branch` is null/missing, system gracefully degrades (no CTAs shown for unmatched queries)

### FR-5: Three-Tier Routing Hierarchy

**Requirement**: Implement prioritized routing logic in Lambda

**Routing Decision Tree**:
```
User Interaction
     |
     ├─ Action Chip Clicked?
     │   └─ Yes → Check target_branch
     │       ├─ target_branch exists → Route to branch ✅
     │       └─ target_branch null → Continue to next tier
     │
     ├─ CTA Button Clicked?
     │   └─ Yes → Check target_branch
     │       ├─ target_branch exists → Route to branch ✅
     │       └─ target_branch null → Continue to next tier
     │
     └─ Free-form Query Typed?
         └─ Yes → Route to fallback_branch ✅
             ├─ fallback_branch configured → Show navigation CTAs
             └─ fallback_branch null → No CTAs (graceful degradation)
```

**Pseudocode**:
```python
def get_conversation_branch(request_metadata: dict, tenant_config: dict) -> Optional[str]:
    """
    Determine conversation branch using 3-tier hierarchy

    Returns:
        str: Branch name to use for CTA selection
        None: No CTAs should be shown (backward compatibility)
    """

    # TIER 1: Explicit action chip routing
    if request_metadata.get('action_chip_triggered'):
        target_branch = request_metadata.get('target_branch')
        if target_branch and target_branch in tenant_config['conversation_branches']:
            logger.info(f"Routing via action chip to branch: {target_branch}")
            return target_branch

    # TIER 2: Explicit CTA routing
    if request_metadata.get('cta_triggered'):
        target_branch = request_metadata.get('target_branch')
        if target_branch and target_branch in tenant_config['conversation_branches']:
            logger.info(f"Routing via CTA to branch: {target_branch}")
            return target_branch

    # TIER 3: Fallback navigation hub
    fallback_branch = tenant_config.get('cta_settings', {}).get('fallback_branch')
    if fallback_branch and fallback_branch in tenant_config['conversation_branches']:
        logger.info(f"Routing to fallback branch: {fallback_branch}")
        return fallback_branch

    # No routing match - graceful degradation
    logger.warning("No routing match - no CTAs will be shown")
    return None
```

### FR-6: Backward Compatibility

**Requirement**: Existing tenants continue to work without breaking changes

**Compatibility Scenarios**:

**Scenario 1**: Tenant has array-format action chips (pre-v1.4)
```json
{
  "action_chips": [
    {"label": "Volunteer", "value": "Tell me about volunteering"}
  ]
}
```
**Behavior**: Frontend renders chips normally, but no metadata passed (degrades to fallback_branch routing)

**Scenario 2**: Tenant has conversation branches with keywords (pre-v1.4)
```json
{
  "conversation_branches": {
    "volunteer_interest": {
      "detection_keywords": ["volunteer", "help"],
      "available_ctas": {...}
    }
  }
}
```
**Behavior**: Keywords ignored by routing logic, but schema validation doesn't fail

**Scenario 3**: Tenant has no `fallback_branch` configured (pre-v1.4)
```json
{
  "cta_settings": {
    "max_display": 3
  }
}
```
**Behavior**: Free-form queries result in no CTAs shown (same as current behavior)

**Migration Path**:
1. Deploy Lambda changes (routing logic updates)
2. Deploy Frontend changes (metadata passing)
3. Gradually update tenant configs to v1.4 format (no downtime)
4. Monitor metrics for degraded experiences
5. After 90 days, deprecate keyword detection entirely

### FR-7: Config Builder UI Updates

**Requirement**: Enable admins to configure action chip routing and fallback branch

**UI Components**:

**Component 1: Action Chip Editor**
```
Action Chips Configuration
─────────────────────────────────────────────────────────
│ Chip Label        │ Value                      │ Target Branch       │
├───────────────────┼────────────────────────────┼─────────────────────┤
│ Volunteer         │ Tell me about volunteering │ [volunteer_interest▼] │
│ Donate Now        │ How do I donate?           │ [donation_interest▼]  │
│ Contact Us        │ I need help                │ [navigation_hub▼]     │
└───────────────────┴────────────────────────────┴─────────────────────┘

[+ Add Action Chip]
```

**Component 2: CTA Settings Editor**
```
CTA Settings
─────────────────────────────────────────────────────────
Fallback Navigation Branch: [navigation_hub▼]

ℹ️ This branch is shown when no explicit routing matches.
   Recommended: Create a "navigation_hub" branch with primary CTAs.

Max CTAs Display: [3]
Bundling Strategy: [readiness_based▼]
```

**Component 3: Validation Panel**
```
Configuration Validation
─────────────────────────────────────────────────────────
✅ All action chips have valid target branches
⚠️  Action chip "volunteer" target branch "volunteer_interest" has no CTAs configured
✅ Fallback branch "navigation_hub" is configured and valid
```

**Interaction Flow**:
1. Admin opens Action Chips section in Config Builder
2. Admin clicks "Link to Branch" dropdown for each chip
3. Dropdown shows all conversation branches from config
4. Admin selects target branch
5. System validates that branch exists and has CTAs
6. Admin configures fallback branch in CTA Settings section
7. System validates fallback branch has CTAs
8. Admin deploys config to S3

---

## Multi-Tenant Requirements

### MT-1: Tenant Isolation

**Requirement**: All configuration is tenant-specific with no cross-tenant data leakage

**Implementation**:
- Each tenant has isolated S3 folder: `tenants/{tenant_id}/`
- Action chip IDs are scoped to tenant config (no global namespace)
- Routing logic operates only on tenant's own config
- No hardcoded branch names or CTA IDs in platform code

**Validation**:
- Lambda must load tenant config from S3 using tenant_hash
- Config Builder must scope all operations to selected tenant
- No global defaults for fallback_branch (must be configured per tenant)

### MT-2: Dynamic Configuration Loading

**Requirement**: All routing behavior driven by tenant config (no hardcoded logic)

**Configuration-Driven Elements**:
- Action chip labels, values, target branches (defined per tenant)
- Conversation branch names and CTA assignments (defined per tenant)
- Fallback branch selection (defined per tenant)
- CTA definitions and actions (defined per tenant)

**Anti-Pattern Examples** (must avoid):
```javascript
// ❌ BAD: Hardcoded branch names
if (action.label === "Volunteer") {
  return "volunteer_interest";
}

// ❌ BAD: Hardcoded fallback behavior
if (!branch) {
  return "default_navigation";  // Assumes all tenants have this branch
}

// ❌ BAD: Organization-specific logic
if (tenant_id === "MYR384719") {
  return "lovebox_discussion";
}
```

**Good Pattern Examples**:
```javascript
// ✅ GOOD: Config-driven routing
const targetBranch = action.target_branch;
if (targetBranch && config.conversation_branches[targetBranch]) {
  return targetBranch;
}

// ✅ GOOD: Tenant-configured fallback
const fallbackBranch = config.cta_settings?.fallback_branch;
if (fallbackBranch && config.conversation_branches[fallbackBranch]) {
  return fallbackBranch;
}
```

### MT-3: Scalability Across Tenants

**Requirement**: System must handle hundreds of tenants with varying configurations

**Scalability Considerations**:
- Config caching per tenant (5-minute TTL)
- No tenant-specific code branches (all logic generic)
- Validation rules apply consistently across all tenants
- Migration tooling works for any tenant config structure

**Performance Targets**:
- Config load time: <200ms (cached)
- Routing decision time: <10ms
- No memory leaks from tenant config caching
- Support for 500+ tenants without degradation

---

## Non-Functional Requirements

### NFR-1: Performance

| Operation | Target Latency | Rationale |
|-----------|----------------|-----------|
| Action chip click → routing decision | <50ms | User experience (immediate feedback) |
| Lambda routing logic execution | <10ms | Part of larger request (sub-100ms total) |
| Config Builder UI responsiveness | <2s page load | Operational efficiency |
| S3 config fetch (cached) | <200ms | Lambda warm start performance |

**Optimization Strategies**:
- In-memory config caching (5-minute TTL)
- Minimize Lambda cold starts via warming
- Efficient ID lookup (dictionary vs array iteration)
- Frontend metadata passing (no additional network calls)

### NFR-2: Reliability

| Component | Target Availability | Failure Mode |
|-----------|---------------------|--------------|
| Lambda routing logic | 99.9% | Graceful degradation (show fallback CTAs) |
| S3 config storage | 99.999% | AWS S3 SLA (built-in redundancy) |
| Config Builder UI | 99.5% | Admin tool (not customer-facing) |

**Error Handling**:
- If `target_branch` doesn't exist → fall back to fallback_branch
- If `fallback_branch` doesn't exist → show no CTAs (backward compatible)
- If config malformed → log error, return default empty state
- If S3 fetch fails → use cached config (5-minute stale data acceptable)

### NFR-3: Maintainability

**Simplification Goals**:
- **Eliminate keyword matching** reduces complexity by 40% (estimated)
- **Explicit routing** makes debugging trivial (trace metadata → branch)
- **Single source of truth** for routing (no distributed keyword lists)
- **Clear validation rules** catch errors at config time (not runtime)

**Code Quality Metrics**:
- Cyclomatic complexity: <10 per function
- Unit test coverage: >80% for routing logic
- Config validation coverage: 100% of schema rules
- Documentation: Inline comments for routing decisions

### NFR-4: Backward Compatibility

**Requirement**: Zero downtime for existing tenants during rollout

**Compatibility Matrix**:

| Config Version | Action Chips Format | Routing Behavior | CTAs Shown? |
|----------------|---------------------|------------------|-------------|
| v1.3 (old) | Array | Fallback branch only | Yes (if configured) |
| v1.4 (new) | Dictionary with IDs | Explicit routing | Yes |
| v1.3 → v1.4 (transition) | Array | Fallback branch only | Yes (degraded) |

**Migration Strategy**:
1. Deploy Lambda routing logic changes (recognizes both array and dict formats)
2. Deploy Frontend metadata passing (gracefully handles missing IDs)
3. Update Config Builder (supports v1.4 format creation)
4. Gradually migrate tenants (automated tool + manual validation)
5. Monitor for 30 days before deprecating array format

---

## User Experience Flow

### UX Flow 1: Stage 1 - Bubble Onboarding (Unchanged)

**Actor**: Operations team member

**Steps**:
1. Admin logs into Bubble.io tenant management
2. Admin navigates to "Action Chips" section
3. Admin adds action chips using simple form:
   - **Label**: "Volunteer" (user-facing text)
   - **Value**: "Tell me about volunteering" (text sent to chat)
4. Admin clicks "Save" - stored as simple array
5. Bubble sends array to `deploy_tenant_stack` Lambda during deployment

**Output**: Action chips array sent to Lambda
```json
{
  "action_chips_array": [
    {"label": "Volunteer", "value": "Tell me about volunteering"}
  ]
}
```

**No changes required** - Bubble UI remains unchanged for MVP.

### UX Flow 2: Stage 2 - Lambda Auto-Transformation (New)

**Actor**: `deploy_tenant_stack` Lambda function

**Steps**:
1. Lambda receives Bubble data with `action_chips_array`
2. Lambda iterates over array and generates IDs:
   - "Volunteer" → `volunteer`
   - "Learn More!" → `learn_more`
   - "Schedule Discovery Session" → `schedule_discovery_session`
3. Lambda detects ID collisions and appends counters if needed
4. Lambda transforms array to dictionary with `target_branch: null` for each chip
5. Lambda saves config to S3 with new format

**Output**: Action chips dictionary in config
```json
{
  "action_chips": {
    "volunteer": {
      "id": "volunteer",
      "label": "Volunteer",
      "value": "Tell me about volunteering",
      "target_branch": null
    }
  }
}
```

**Benefit**: Consistent ID generation, no manual work for admin.

### UX Flow 3: Stage 3 - Config Builder Branch Linking (New)

**Actor**: Operations team member (using Config Builder)

**Steps**:
1. Admin opens Config Builder web console
2. Admin selects tenant from dropdown
3. Config Builder loads tenant config from S3
4. Admin navigates to "Action Chips" section
5. Admin sees table with columns: Label, Value, Target Branch
6. For each action chip, admin clicks "Link to Branch" dropdown
7. Dropdown shows all conversation branches from tenant config
8. Admin selects target branch (e.g., "volunteer_interest")
9. Admin sees validation checkmark if branch has CTAs configured
10. Admin clicks "Save Changes" - config updated in S3

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Action Chips Configuration                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Chip ID: volunteer                                              │
│ Label: Volunteer                                                │
│ Value: Tell me about volunteering                               │
│                                                                 │
│ Target Branch: [Select branch...           ▼]                  │
│                ├─ volunteer_interest                            │
│                ├─ donation_interest                             │
│                ├─ navigation_hub                                │
│                └─ program_exploration                           │
│                                                                 │
│ ✅ Branch "volunteer_interest" has 2 CTAs configured            │
│                                                                 │
│ [Cancel]  [Save Changes]                                        │
└─────────────────────────────────────────────────────────────────┘
```

**Output**: Action chip with explicit routing
```json
{
  "action_chips": {
    "volunteer": {
      "id": "volunteer",
      "label": "Volunteer",
      "value": "Tell me about volunteering",
      "target_branch": "volunteer_interest"
    }
  }
}
```

### UX Flow 4: Stage 4 - Fallback Branch Configuration (New)

**Actor**: Operations team member (using Config Builder)

**Steps**:
1. Admin navigates to "CTA Settings" section
2. Admin sees "Fallback Navigation Branch" dropdown
3. Dropdown shows all conversation branches
4. Admin selects "navigation_hub" as fallback
5. Config Builder validates that "navigation_hub" has CTAs configured
6. Admin sees confirmation: "Fallback branch will always show navigation CTAs"
7. Admin clicks "Save Changes"

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────────┐
│ CTA Settings                                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Fallback Navigation Branch                                      │
│ [navigation_hub                              ▼]                 │
│                                                                 │
│ ℹ️ This branch is shown when no explicit routing matches.       │
│   Users will always see navigation CTAs even for free-form      │
│   queries that don't match any action chips or CTA routing.     │
│                                                                 │
│ ✅ Branch "navigation_hub" has 3 CTAs configured:               │
│    • Apply to Programs (primary)                                │
│    • Schedule Discovery (secondary)                             │
│    • Contact Us (secondary)                                     │
│                                                                 │
│ [Cancel]  [Save Changes]                                        │
└─────────────────────────────────────────────────────────────────┘
```

**Output**: CTA settings with fallback branch
```json
{
  "cta_settings": {
    "fallback_branch": "navigation_hub",
    "max_display": 3
  }
}
```

### UX Flow 5: Runtime - User Clicks Action Chip (New)

**Actor**: End user (website visitor)

**Steps**:
1. User opens chat widget
2. User sees welcome message with 3 action chips:
   - "Volunteer"
   - "Donate"
   - "Contact Us"
3. User clicks "Volunteer" action chip
4. Frontend `handleActionClick()` fires:
   - Sends message: "Tell me about volunteering"
   - Passes metadata: `{action_chip_triggered: true, action_chip_id: "volunteer", target_branch: "volunteer_interest"}`
5. Lambda receives request, extracts metadata
6. Lambda routes to `volunteer_interest` branch (explicit routing)
7. Lambda returns Bedrock response + CTAs from `volunteer_interest` branch
8. User sees response with relevant CTAs:
   - "Start Volunteer Application" (primary)
   - "View Volunteer Programs" (secondary)

**Expected Behavior**: Predictable routing based on explicit configuration, not keywords.

### UX Flow 6: Runtime - User Types Free-Form Query (New)

**Actor**: End user (website visitor)

**Steps**:
1. User types query: "What can I do to help?"
2. Frontend sends message with no metadata (normal chat behavior)
3. Lambda receives request with no `action_chip_triggered` or `cta_triggered` metadata
4. Lambda checks routing hierarchy:
   - Tier 1 (action chip): None
   - Tier 2 (CTA): None
   - Tier 3 (fallback): Route to `navigation_hub`
5. Lambda returns Bedrock response + CTAs from `navigation_hub` branch
6. User sees response with navigation CTAs:
   - "Apply to Programs" (primary)
   - "Schedule Discovery" (secondary)
   - "Contact Us" (secondary)

**Expected Behavior**: User never hits dead end - always sees navigation options.

---

## Success Metrics

### Primary Metrics (Business Impact)

**Metric 1: Reduction in Dead Ends**
- **Definition**: Percentage of Bedrock responses where zero CTAs were shown
- **Baseline**: ~15% of queries (estimated from keyword matching failures)
- **Target**: <2% of queries (only when fallback_branch not configured)
- **Measurement**: Lambda CloudWatch logs + frontend analytics
- **Timeline**: 90 days post-deployment

**Metric 2: User Engagement (CTA Click-Through Rate)**
- **Definition**: Percentage of messages followed by CTA click
- **Baseline**: 12% click-through rate (current)
- **Target**: >25% click-through rate (more relevant CTAs = higher engagement)
- **Measurement**: Frontend event tracking (CTA clicks / messages sent)
- **Timeline**: 90 days post-deployment

**Metric 3: Admin Configuration Time**
- **Definition**: Time to configure action chips and conversation branches
- **Baseline**: 45 minutes per tenant (keyword testing and refinement)
- **Target**: 15 minutes per tenant (explicit linking only, no keyword testing)
- **Measurement**: User timing surveys + Config Builder session analytics
- **Timeline**: 60 days post-deployment

### Secondary Metrics (Operational Efficiency)

**Metric 4: Routing-Related Support Tickets**
- **Definition**: Support tickets related to "no CTAs showing" or "wrong CTAs showing"
- **Baseline**: 6 tickets/month (estimated)
- **Target**: <2 tickets/month
- **Measurement**: Support ticket tagging + root cause analysis
- **Timeline**: 90 days post-deployment

**Metric 5: Admin Satisfaction with Predictability**
- **Definition**: Operations team satisfaction rating (1-5 scale)
- **Baseline**: 3.2/5 ("confusing", "hard to debug")
- **Target**: >4.5/5 ("easy to understand", "predictable")
- **Measurement**: Post-deployment survey after 30 days of use
- **Timeline**: 60 days post-deployment

**Metric 6: Configuration Validation Errors**
- **Definition**: Percentage of configs that fail validation before deployment
- **Baseline**: N/A (no explicit routing validation currently)
- **Target**: <5% validation errors (most errors caught by UI guidance)
- **Measurement**: Config Builder validation logs
- **Timeline**: 90 days post-deployment

### Technical Metrics (System Health)

**Metric 7: Routing Decision Latency**
- **Definition**: Time to execute routing logic in Lambda
- **Baseline**: ~8ms (keyword matching overhead)
- **Target**: <5ms (simpler explicit routing)
- **Measurement**: Lambda CloudWatch metrics (custom metric)
- **Timeline**: Immediate

**Metric 8: Lambda Error Rate**
- **Definition**: Percentage of Lambda invocations with routing errors
- **Baseline**: <0.1% (current)
- **Target**: <0.1% (maintain low error rate)
- **Measurement**: CloudWatch alarms + error logs
- **Timeline**: Continuous monitoring

---

## Risks & Mitigations

### Risk 1: Breaking Changes for Existing Tenants

**Risk Level**: HIGH
**Impact**: Production widgets stop working, customer-facing downtime

**Scenario**: Lambda routing logic changes break existing tenants with v1.3 configs (array-format action chips)

**Mitigation Strategy**:
1. **Backward Compatibility Layer**: Lambda detects array vs dictionary format and handles both:
   ```python
   if isinstance(action_chips, list):
       # Legacy array format - no metadata routing, use fallback_branch
       return handle_legacy_chips(action_chips)
   elif isinstance(action_chips, dict):
       # New dictionary format - explicit routing enabled
       return handle_explicit_routing(action_chips)
   ```
2. **Gradual Rollout**: Deploy Lambda changes to staging environment first, test with 5 pilot tenants
3. **Rollback Plan**: Keep previous Lambda version tagged, enable instant rollback via alias switching
4. **Monitoring**: CloudWatch alarms for error rate spikes (>0.5% triggers alert)
5. **Testing**: Comprehensive integration tests with both v1.3 and v1.4 config formats

**Contingency**: If production incident occurs, rollback Lambda within 5 minutes, investigate in staging.

### Risk 2: ID Collision Failures

**Risk Level**: MEDIUM
**Impact**: Action chip configuration fails, tenant deployment blocked

**Scenario**: Two action chips with similar labels generate same ID:
- "Learn More" → `learn_more`
- "Learn More!" → `learn_more` (collision!)

**Mitigation Strategy**:
1. **Collision Detection Algorithm**: Append counter when collision detected:
   ```python
   if id in existing_ids:
       counter = 2
       while f"{id}_{counter}" in existing_ids:
           counter += 1
       id = f"{id}_{counter}"
   ```
2. **Validation Warning**: Config Builder shows warning: "Generated ID 'learn_more_2' due to duplicate label"
3. **Manual Override**: Future enhancement to allow admin to specify custom IDs
4. **Testing**: Unit tests for collision scenarios (50+ test cases)

**Contingency**: If collision algorithm fails, deployment fails gracefully with clear error message.

### Risk 3: Missing Fallback Configuration

**Risk Level**: MEDIUM
**Impact**: Users hit dead ends for free-form queries (same as current behavior)

**Scenario**: Tenant migrates to v1.4 but admin forgets to configure `fallback_branch`

**Mitigation Strategy**:
1. **Config Builder Validation Warning**: Show prominent warning if `fallback_branch` is null:
   ```
   ⚠️ WARNING: No fallback branch configured
   Users typing free-form queries will not see any CTAs.
   Recommended: Create a "navigation_hub" branch with primary CTAs.
   ```
2. **Migration Tool**: Automated script suggests fallback_branch based on existing config
3. **Default Suggestion**: Config Builder suggests most-used branch as fallback (analytics-driven)
4. **Documentation**: Clear setup guide with fallback configuration as required step

**Contingency**: If fallback not configured, system gracefully degrades (no CTAs shown for unmatched queries).

### Risk 4: Poor UX from Mislinked Action Chips

**Risk Level**: MEDIUM
**Impact**: User clicks action chip, sees irrelevant CTAs, loses trust in system

**Scenario**: Admin links "Donate" action chip to "volunteer_interest" branch by mistake

**Mitigation Strategy**:
1. **Semantic Validation**: Config Builder warns if chip label doesn't semantically match branch name (future enhancement)
2. **Preview Mode**: Config Builder shows preview of CTAs that will display for each chip (future enhancement)
3. **Audit Logging**: Track who linked which chips to which branches (accountability)
4. **Testing Workflow**: Documentation includes testing checklist for admins
5. **Rollback**: Easy to relink action chips in Config Builder (no deployment required, just config update)

**Contingency**: If mislink occurs, admin can fix in Config Builder and redeploy within 5 minutes.

### Risk 5: Performance Degradation with Large Configs

**Risk Level**: LOW
**Impact**: Slow routing decisions, increased Lambda latency

**Scenario**: Tenant has 50+ action chips, 100+ conversation branches, dictionary lookup is slow

**Mitigation Strategy**:
1. **Efficient Data Structures**: Use dictionaries (O(1) lookup) instead of arrays (O(n) iteration)
2. **Config Validation Limits**: Warn if >20 action chips or >50 branches (unusual, may indicate misconfiguration)
3. **Performance Testing**: Load test Lambda with large configs (100 branches, 50 chips)
4. **Caching**: Config cached in Lambda memory (5-minute TTL), lookup is in-memory

**Performance Benchmark**:
- 10 chips, 10 branches: ~2ms routing decision
- 50 chips, 50 branches: ~5ms routing decision
- 100 chips, 100 branches: ~10ms routing decision (still acceptable)

**Contingency**: If performance degrades, optimize lookup algorithm or suggest config simplification.

### Risk 6: Broken References After Deletion

**Risk Level**: LOW
**Impact**: Action chip references non-existent branch, routing fails gracefully

**Scenario**: Admin deletes conversation branch "volunteer_interest", but action chip still references it

**Mitigation Strategy**:
1. **Dependency Warnings**: Config Builder shows warning before deleting branch:
   ```
   ⚠️ WARNING: This branch is referenced by:
   • Action chip "volunteer" (target_branch)
   • CTA "apply_volunteer" (target_branch)

   Deleting will break these configurations.
   [Cancel] [Delete and Clear References]
   ```
2. **Automatic Cleanup**: "Delete and Clear References" option sets `target_branch: null` for affected chips
3. **Runtime Validation**: Lambda checks if `target_branch` exists before routing, falls back to fallback_branch if missing
4. **Pre-Deployment Validation**: Config Builder validates all references before allowing deployment

**Contingency**: If broken reference occurs, Lambda gracefully falls back to fallback_branch (no error thrown).

---

## Dependencies

### External Systems

**Dependency 1: AWS S3 (Config Storage)**
- **Purpose**: Store tenant configs with action chip configurations
- **Bucket**: `myrecruiter-picasso`
- **Folder Structure**: `tenants/{tenant_id}/{tenant_id}-config.json`
- **SLA**: 99.999% availability (AWS S3 standard tier)
- **Risk**: S3 outage blocks config reads → **Mitigation**: Lambda caches configs (5-minute TTL)

**Dependency 2: AWS Lambda (deploy_tenant_stack)**
- **Purpose**: Transform Bubble data to Picasso config format (including action chip ID generation)
- **Runtime**: Python 3.11
- **Invocation**: Triggered by Bubble API after tenant configuration
- **Risk**: Lambda transformation fails → **Mitigation**: Comprehensive error handling + retry logic

**Dependency 3: AWS Lambda (Master_Function_Staging)**
- **Purpose**: Handle routing logic using 3-tier hierarchy
- **Runtime**: Python 3.11
- **Invocation**: Every Picasso chat request
- **Risk**: Routing logic bug affects all tenants → **Mitigation**: Gradual rollout + A/B testing

**Dependency 4: Picasso Frontend (MessageBubble.jsx)**
- **Purpose**: Pass action chip metadata to Lambda
- **File**: `/Picasso/src/components/chat/MessageBubble.jsx`
- **Lines Modified**: 505-509 (`handleActionClick` function)
- **Risk**: Metadata not passed correctly → **Mitigation**: Unit tests + integration tests

### Internal Prerequisites

**Prerequisite 1: Config Schema v1.4 Documented**
- **Requirement**: TENANT_CONFIG_SCHEMA.md updated with:
  - Action chips dictionary format
  - `target_branch` field for action chips
  - `fallback_branch` field in `cta_settings`
- **Status**: Ready (existing schema at v1.3, needs update to v1.4)
- **Owner**: Documentation team

**Prerequisite 2: Config Validation Logic Updated**
- **Requirement**: Validator checks:
  - `target_branch` references existing conversation branch
  - `fallback_branch` references existing conversation branch
  - Fallback branch has `available_ctas` configured
- **Status**: Not started (will be part of this project)
- **Owner**: Backend team

**Prerequisite 3: Config Builder Backend API**
- **Requirement**: API endpoints for:
  - `GET /config/{tenant_id}` - Load tenant config from S3
  - `PUT /config/{tenant_id}` - Save updated config to S3
  - `POST /config/{tenant_id}/validate` - Validate config before deployment
- **Status**: Existing (used by current Config Builder)
- **Owner**: Backend team

### Deployment Order

**Critical Path**: Changes must be deployed in this order to avoid breaking production:

1. **Week 1**: Backend changes
   - Update `deploy_tenant_stack` Lambda (action chip transformation)
   - Update `Master_Function_Staging` Lambda (routing logic)
   - Deploy to staging environment
   - Test with 5 pilot tenants

2. **Week 2**: Frontend changes
   - Update `MessageBubble.jsx` (metadata passing)
   - Deploy to staging environment
   - Integration testing with updated Lambda

3. **Week 3**: Config Builder changes
   - Update Config Builder UI (action chip linking, fallback configuration)
   - Deploy to staging environment
   - User acceptance testing with operations team

4. **Week 4**: Production rollout
   - Deploy Lambda changes to production (backward compatible)
   - Deploy Frontend changes to production (graceful degradation)
   - Deploy Config Builder to production
   - Gradual tenant migration (10 tenants/week)

**Rollback Plan**:
- Each component can be rolled back independently
- Lambda uses aliases for instant version switching
- Frontend uses CDN invalidation for fast rollback
- Config Builder is admin tool (low risk if broken temporarily)

---

## Out of Scope

### Explicitly Excluded from This PRD

**Exclusion 1: Changing Bubble UI**
- Bubble action chip editor remains unchanged (simple array input)
- No changes to Bubble routing rules configuration
- No changes to Bubble form/integration management
- **Rationale**: Minimize scope, avoid dependencies on Bubble.io changes

**Exclusion 2: Modifying ResponseCard.jsx**
- CTAs already have explicit routing via `target_branch`
- No changes needed to CTA rendering logic
- **Rationale**: CTAs are already working as intended, no changes required

**Exclusion 3: Keeping Keyword Matching**
- `detection_keywords` eliminated from routing logic entirely
- Keyword field may remain in schema for backward compatibility, but ignored
- **Rationale**: Keyword matching is the root cause of the problem, removing it simplifies system

**Exclusion 4: Organization-Specific Features**
- No hardcoded logic for specific tenants (e.g., "MYR384719", "Atlanta Angels")
- All features must be generic and configuration-driven
- **Rationale**: Multi-tenant platform requires tenant-agnostic code

**Exclusion 5: Migration Tools for Existing Tenants**
- No automated bulk migration (manual migration via Config Builder)
- No v1.3 → v1.4 conversion API endpoint
- **Rationale**: Small number of tenants (~25), manual migration is acceptable for MVP

**Exclusion 6: Advanced Config Builder Features**
- No visual routing diagram (flow chart of chips → branches → CTAs)
- No drag-and-drop action chip ordering
- No A/B testing of different routing configurations
- **Rationale**: Focus on core functionality, enhancements can come in Phase 2

**Exclusion 7: Analytics & Reporting**
- No dashboard for action chip usage analytics
- No heatmap of most-clicked chips
- No conversion funnel analysis
- **Rationale**: Focus on functionality first, analytics can be added later

**Exclusion 8: Bedrock Prompt Changes**
- No changes to Bedrock Knowledge Base content
- No changes to tone_prompt or system prompts
- No changes to response generation logic
- **Rationale**: Routing changes are independent of AI response quality

**Exclusion 9: Form Trigger Enhancements**
- No changes to how forms are triggered by CTAs
- No changes to form field collection logic
- No changes to form submission workflows
- **Rationale**: Forms functionality is separate concern, out of scope

**Exclusion 10: Multi-Language Support**
- No internationalization of action chip labels
- No translation of routing logic
- **Rationale**: Current platform is English-only, multi-language is future enhancement

---

## Testing Requirements

### Unit Testing

**Test Suite 1: ID Generation Algorithm**
- **File**: `tests/test_action_chip_id_generation.py`
- **Coverage**:
  - Basic slugification: "Learn More" → `learn_more`
  - Special character removal: "Donate Now!" → `donate_now`
  - Collision handling: ["Volunteer", "Volunteer!"] → [`volunteer`, `volunteer_2`]
  - Empty string handling: "" → `chip_1`
  - Unicode characters: "Español" → `espanol`
  - Edge cases: Very long labels (>100 chars), numbers only, all special chars
- **Target**: 100% code coverage

**Test Suite 2: Routing Logic**
- **File**: `tests/test_routing_hierarchy.py`
- **Coverage**:
  - Tier 1: Action chip routing with valid `target_branch`
  - Tier 1: Action chip routing with null `target_branch` → falls to Tier 3
  - Tier 2: CTA routing with valid `target_branch`
  - Tier 3: Fallback branch routing
  - Edge case: All tiers null → return None
  - Edge case: `target_branch` references non-existent branch → fall to Tier 3
  - Edge case: `fallback_branch` references non-existent branch → return None
- **Target**: 100% code coverage

**Test Suite 3: Backward Compatibility**
- **File**: `tests/test_backward_compatibility.py`
- **Coverage**:
  - v1.3 config (array action chips) → graceful degradation
  - v1.4 config (dictionary action chips) → explicit routing works
  - Mixed config (some chips have IDs, some don't) → handles both
  - Missing `fallback_branch` → no CTAs shown (backward compatible)
- **Target**: 100% code coverage

### Integration Testing

**Test Suite 4: Frontend → Lambda Flow**
- **Scenario**: User clicks action chip → metadata passed → Lambda routes correctly
- **Steps**:
  1. Render Picasso widget in test environment
  2. Click action chip "Volunteer"
  3. Verify metadata sent to Lambda: `{action_chip_triggered: true, action_chip_id: "volunteer", target_branch: "volunteer_interest"}`
  4. Verify Lambda routes to `volunteer_interest` branch
  5. Verify correct CTAs returned in response
- **Tools**: Playwright for frontend testing, Lambda local invoke for backend

**Test Suite 5: Config Builder → S3 Flow**
- **Scenario**: Admin links action chip to branch → config saved → Lambda uses new routing
- **Steps**:
  1. Open Config Builder in test environment
  2. Link action chip "donate" to branch "donation_interest"
  3. Save config to S3
  4. Trigger Lambda with action chip click
  5. Verify Lambda uses new `target_branch` for routing
- **Tools**: Selenium for Config Builder UI, boto3 for S3 validation

### User Acceptance Testing

**Test Suite 6: Operations Team UAT**
- **Participants**: 3 operations team members
- **Duration**: 1 week
- **Scenarios**:
  1. Configure action chips for new tenant from scratch
  2. Migrate existing tenant from v1.3 to v1.4 format
  3. Configure fallback branch for tenant
  4. Test routing behavior in staging Picasso widget
  5. Validate CTAs display correctly for all scenarios
- **Success Criteria**:
  - All participants complete tasks without support
  - Average satisfaction rating >4/5
  - Zero configuration errors during testing

### Performance Testing

**Test Suite 7: Load Testing**
- **Tool**: Apache JMeter or Locust
- **Scenarios**:
  - 100 concurrent users clicking action chips → Lambda latency <50ms p95
  - 1000 requests/sec to Master Function → error rate <0.1%
  - Large config (50 chips, 100 branches) → routing decision <10ms
- **Target**: No performance degradation vs. current keyword-based routing

### Validation Testing

**Test Suite 8: Config Validation Rules**
- **File**: `tests/test_config_validation.py`
- **Coverage**:
  - Valid config passes all validations
  - Missing `fallback_branch` triggers warning
  - Invalid `target_branch` reference triggers error
  - Broken branch reference triggers error
  - Circular dependency detection (if implemented)
- **Target**: 100% validation rule coverage

---

## Appendix A: Technical Specification Details

### Data Structure Specification

**Action Chips Dictionary Format (v1.4)**:
```typescript
interface ActionChip {
  id: string;              // Auto-generated from label (slugified)
  label: string;           // User-facing text (e.g., "Volunteer")
  value: string;           // Text sent to chat (e.g., "Tell me about volunteering")
  target_branch: string | null;  // References conversation_branches key
}

interface ActionChipsConfig {
  [chipId: string]: ActionChip;
}
```

**CTA Settings with Fallback Branch (v1.4)**:
```typescript
interface CTASettings {
  fallback_branch: string | null;  // References conversation_branches key (NEW)
  max_display: number;             // Max CTAs to show (existing)
  bundling_strategy: string;       // How to group CTAs (existing)
}
```

**Routing Metadata (Passed from Frontend)**:
```typescript
interface RoutingMetadata {
  action_chip_triggered?: boolean;  // True if action chip clicked
  action_chip_id?: string;          // ID of clicked chip
  target_branch?: string;           // Explicit routing target
  cta_triggered?: boolean;          // True if CTA clicked (existing)
  cta_id?: string;                  // ID of clicked CTA (existing)
}
```

### Algorithm Specifications

**Algorithm 1: ID Generation with Collision Detection**
```python
import re
from typing import Set

def generate_action_chip_id(label: str, existing_ids: Set[str]) -> str:
    """
    Generate unique ID from action chip label using slugification.

    Steps:
    1. Convert to lowercase
    2. Replace non-alphanumeric chars with underscores
    3. Remove consecutive underscores
    4. Trim leading/trailing underscores
    5. If collision, append _2, _3, etc.

    Args:
        label: Action chip label (user-facing text)
        existing_ids: Set of already-generated IDs (for collision detection)

    Returns:
        Unique ID string (lowercase, underscores, alphanumeric only)

    Examples:
        "Learn More" → "learn_more"
        "Donate Now!" → "donate_now"
        "Schedule Discovery Session" → "schedule_discovery_session"
        "Volunteer" (collision) → "volunteer_2"
    """

    # Step 1-2: Lowercase and replace non-alphanumeric
    base_id = re.sub(r'[^a-z0-9]+', '_', label.lower())

    # Step 3-4: Clean up underscores
    base_id = re.sub(r'_+', '_', base_id).strip('_')

    # Handle empty string edge case
    if not base_id:
        base_id = 'chip'

    # Step 5: Check for collision
    if base_id not in existing_ids:
        return base_id

    # Collision detected - append counter
    counter = 2
    while f"{base_id}_{counter}" in existing_ids:
        counter += 1

    return f"{base_id}_{counter}"
```

**Algorithm 2: Three-Tier Routing Decision**
```python
from typing import Optional, Dict, Any

def get_conversation_branch(
    metadata: Dict[str, Any],
    tenant_config: Dict[str, Any]
) -> Optional[str]:
    """
    Determine conversation branch using 3-tier hierarchy.

    Tier 1: Explicit action chip routing
    Tier 2: Explicit CTA routing
    Tier 3: Fallback navigation hub

    Args:
        metadata: Request metadata from frontend
        tenant_config: Full tenant configuration from S3

    Returns:
        Branch name to use for CTA selection, or None if no routing match

    Examples:
        metadata = {
            "action_chip_triggered": True,
            "action_chip_id": "volunteer",
            "target_branch": "volunteer_interest"
        }
        → Returns "volunteer_interest"

        metadata = {}  # Free-form query
        → Returns fallback_branch from cta_settings
    """

    branches = tenant_config.get('conversation_branches', {})
    cta_settings = tenant_config.get('cta_settings', {})

    # TIER 1: Explicit action chip routing
    if metadata.get('action_chip_triggered'):
        target_branch = metadata.get('target_branch')

        # Validate branch exists
        if target_branch and target_branch in branches:
            logger.info(f"[Tier 1] Routing to action chip target: {target_branch}")
            return target_branch

        # Invalid branch or null target_branch - continue to next tier
        if target_branch:
            logger.warning(f"[Tier 1] Invalid target_branch: {target_branch}, falling back")

    # TIER 2: Explicit CTA routing
    if metadata.get('cta_triggered'):
        target_branch = metadata.get('target_branch')

        # Validate branch exists
        if target_branch and target_branch in branches:
            logger.info(f"[Tier 2] Routing to CTA target: {target_branch}")
            return target_branch

        # Invalid branch or null target_branch - continue to next tier
        if target_branch:
            logger.warning(f"[Tier 2] Invalid target_branch: {target_branch}, falling back")

    # TIER 3: Fallback navigation hub
    fallback_branch = cta_settings.get('fallback_branch')

    # Validate fallback branch exists
    if fallback_branch and fallback_branch in branches:
        logger.info(f"[Tier 3] Routing to fallback branch: {fallback_branch}")
        return fallback_branch

    # No routing match - graceful degradation (backward compatible)
    logger.warning("[Tier 3] No fallback_branch configured - no CTAs will be shown")
    return None
```

---

## Appendix B: Migration Guide (v1.3 → v1.4)

### Pre-Migration Checklist

- [ ] Backup all tenant configs to separate S3 bucket
- [ ] Test migration script in staging environment with 5 pilot tenants
- [ ] Train operations team on new Config Builder UI
- [ ] Document rollback procedure
- [ ] Create monitoring dashboard for migration progress

### Migration Steps (Per Tenant)

**Step 1: Backup Existing Config**
```bash
aws s3 cp s3://myrecruiter-picasso/tenants/{tenant_id}/{tenant_id}-config.json \
           s3://myrecruiter-picasso-backups/tenants/{tenant_id}/{tenant_id}-config-v1.3.json
```

**Step 2: Generate Action Chip IDs (Automated)**
```python
# Script: migrate_action_chips_v1.3_to_v1.4.py

def migrate_action_chips(config: dict) -> dict:
    """Convert action chips array to dictionary format"""

    action_chips_array = config.get('action_chips', [])

    # If already dictionary format, skip migration
    if isinstance(action_chips_array, dict):
        print("Already v1.4 format, skipping...")
        return config

    # Generate IDs for each chip
    action_chips_dict = {}
    existing_ids = set()

    for chip in action_chips_array:
        chip_id = generate_action_chip_id(chip['label'], existing_ids)
        existing_ids.add(chip_id)

        action_chips_dict[chip_id] = {
            'id': chip_id,
            'label': chip['label'],
            'value': chip['value'],
            'target_branch': None  # Admin will link in Config Builder
        }

    config['action_chips'] = action_chips_dict
    config['version'] = '1.4'

    return config
```

**Step 3: Configure Fallback Branch (Manual in Config Builder)**
- Admin logs into Config Builder
- Navigates to CTA Settings
- Selects fallback branch from dropdown (e.g., "navigation_hub")
- Validates that fallback branch has CTAs configured
- Saves config

**Step 4: Link Action Chips to Branches (Manual in Config Builder)**
- Admin navigates to Action Chips section
- For each action chip:
  - Clicks "Link to Branch" dropdown
  - Selects appropriate conversation branch
  - Validates that branch has CTAs configured
- Saves config

**Step 5: Validate Migration**
```bash
# Run validation script
node scripts/validate-tenant-config.js tenants/{tenant_id}/{tenant_id}-config.json

# Check for errors:
# ❌ Action chip "volunteer" target_branch references non-existent branch "volunteer_interest"
# ✅ Fallback branch "navigation_hub" is valid and has 3 CTAs configured
```

**Step 6: Deploy to Staging**
```bash
# Test in staging environment
aws s3 cp tenants/{tenant_id}/{tenant_id}-config.json \
           s3://myrecruiter-picasso-staging/tenants/{tenant_id}/{tenant_id}-config.json

# Test Picasso widget in staging:
# - Click each action chip
# - Verify correct CTAs display
# - Type free-form query
# - Verify fallback CTAs display
```

**Step 7: Deploy to Production**
```bash
# Deploy validated config to production
aws s3 cp tenants/{tenant_id}/{tenant_id}-config.json \
           s3://myrecruiter-picasso/tenants/{tenant_id}/{tenant_id}-config.json

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id E1234567890 \
    --paths "/tenants/{tenant_id}/*"
```

### Rollback Procedure

**If migration fails**:
```bash
# Restore v1.3 config from backup
aws s3 cp s3://myrecruiter-picasso-backups/tenants/{tenant_id}/{tenant_id}-config-v1.3.json \
           s3://myrecruiter-picasso/tenants/{tenant_id}/{tenant_id}-config.json

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id E1234567890 \
    --paths "/tenants/{tenant_id}/*"

# Lambda routing logic handles v1.3 configs gracefully (backward compatible)
```

---

**Document Control**:
- **Version**: 1.0
- **Last Updated**: 2025-10-30
- **Approvers**: [Product Manager], [Engineering Lead], [Operations Lead]
- **Next Review**: 2025-11-15 (after Week 2 of implementation)
