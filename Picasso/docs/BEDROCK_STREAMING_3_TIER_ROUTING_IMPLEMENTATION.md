# Bedrock Streaming Handler: 3-Tier Routing Implementation Plan

**Date**: 2025-10-30
**Status**: In Progress
**PRD Reference**: `PRD_ACTION_CHIPS_EXPLICIT_ROUTING_FALLBACK_HUB.md`

---

## Overview

Port the 3-tier routing logic from Master_Function_Staging (Python) to Bedrock_Streaming_Handler_Staging (JavaScript) to achieve parity between the HTTP fallback path and the primary streaming path.

**Context:**
- Master_Function_Staging: HTTP fallback (20% traffic) - ✅ 3-tier routing implemented
- Bedrock_Streaming_Handler_Staging: Primary streaming path (80% traffic) - ❌ Still uses keyword detection
- **Goal**: Both Lambda functions must have identical routing logic for consistent CTA experience

---

## Implementation Plan

### Phase 1: Add Helper Functions to response_enhancer.js

**Location**: Before `detectConversationBranch()` function (before line 95)

#### Function 1: `getConversationBranch(routingMetadata, config)`

JavaScript port of Python `get_conversation_branch()` from Master_Function_Staging (lines 626-687).

**Purpose**: Implement 3-tier routing hierarchy
- **Tier 1**: Action chip explicit routing via `routingMetadata.action_chip_triggered` + `routingMetadata.target_branch`
- **Tier 2**: CTA explicit routing via `routingMetadata.cta_triggered` + `routingMetadata.target_branch`
- **Tier 3**: Fallback navigation hub via `config.cta_settings.fallback_branch`

**Returns**: Branch name (string) or null

**Key Logic**:
```javascript
function getConversationBranch(routingMetadata, config) {
    const branches = config.conversation_branches || {};
    const ctaSettings = config.cta_settings || {};

    // TIER 1: Explicit action chip routing
    if (routingMetadata.action_chip_triggered) {
        const targetBranch = routingMetadata.target_branch;
        if (targetBranch && branches[targetBranch]) {
            console.log(`[Tier 1] Routing via action chip to branch: ${targetBranch}`);
            return targetBranch;
        }
        if (targetBranch) {
            console.log(`[Tier 1] Invalid target_branch: ${targetBranch}, falling back to next tier`);
        }
    }

    // TIER 2: Explicit CTA routing
    if (routingMetadata.cta_triggered) {
        const targetBranch = routingMetadata.target_branch;
        if (targetBranch && branches[targetBranch]) {
            console.log(`[Tier 2] Routing via CTA to branch: ${targetBranch}`);
            return targetBranch;
        }
        if (targetBranch) {
            console.log(`[Tier 2] Invalid target_branch: ${targetBranch}, falling back to next tier`);
        }
    }

    // TIER 3: Fallback navigation hub
    const fallbackBranch = ctaSettings.fallback_branch;
    if (fallbackBranch && branches[fallbackBranch]) {
        console.log(`[Tier 3] Routing to fallback branch: ${fallbackBranch}`);
        return fallbackBranch;
    }

    // No routing match - graceful degradation
    if (fallbackBranch) {
        console.log(`[Tier 3] Fallback branch '${fallbackBranch}' not found in conversation_branches`);
    } else {
        console.log('[Tier 3] No fallback_branch configured - no CTAs will be shown');
    }

    return null;
}
```

#### Function 2: `buildCtasFromBranch(branchName, config, completedForms)`

JavaScript port of Python `build_ctas_for_branch()` from Master_Function_Staging (lines 689-789).

**Purpose**: Build CTA array from a specific conversation branch
- Filters completed forms
- Returns max 3 CTAs

**Key Logic**:
- Extract primary CTA from `branch.available_ctas.primary`
- Extract secondary CTAs from `branch.available_ctas.secondary`
- Check if CTA is form-related (`action === 'start_form'` or `type === 'form_cta'`)
- Filter form CTAs if program completed
- Map formIds to programs (lb_apply → lovebox, dd_apply → daretodream)
- Return max 3 CTAs

---

### Phase 2: Update enhanceResponse() Function

**Location**: Line 274 in response_enhancer.js

#### Change 1: Update Function Signature
```javascript
// OLD
async function enhanceResponse(bedrockResponse, userMessage, tenantHash, sessionContext = {})

// NEW
async function enhanceResponse(bedrockResponse, userMessage, tenantHash, sessionContext = {}, routingMetadata = {})
```

#### Change 2: Add 3-Tier Routing Logic

Add at the START of the function, AFTER config loading (after line 288) and BEFORE form trigger checks:

```javascript
// TIER 1-3: Explicit routing (PRD Action Chips Explicit Routing)
const explicitBranch = getConversationBranch(routingMetadata, config);
if (explicitBranch) {
    console.log(`[Explicit Routing] Using branch: ${explicitBranch}`);
    const ctas = buildCtasFromBranch(explicitBranch, config, completedForms);

    if (ctas.length > 0) {
        return {
            message: bedrockResponse,
            ctaButtons: ctas,
            metadata: {
                enhanced: true,
                branch: explicitBranch,
                routing_tier: 'explicit',
                routing_method: routingMetadata.action_chip_triggered ? 'action_chip' :
                               routingMetadata.cta_triggered ? 'cta' : 'fallback'
            }
        };
    }
}
```

#### Change 3: Keep Keyword Detection (Deprecated)

Keep existing `detectConversationBranch()` call but add deprecation warning:

```javascript
// DEPRECATED: Keyword detection (backward compatibility)
const detectedBranch = detectConversationBranch(bedrockResponse, userMessage, config, completedForms);
if (detectedBranch) {
    console.log('[DEPRECATED] Using keyword detection - consider configuring explicit routing');
    // existing logic continues...
}
```

---

### Phase 3: Update index.js

**Files**: Both handler functions in index.js

#### Update 1: streamingHandler (around line 516)

Extract and pass `routing_metadata`:

```javascript
// Extract routing metadata from request
const routingMetadata = body.routing_metadata || {};

// Pass to enhanceResponse
const enhancedResponse = await enhanceResponse(
    accumulatedResponse,
    userMessage,
    tenantHash,
    sessionContext,
    routingMetadata  // NEW parameter
);
```

#### Update 2: bufferedHandler (around line 712)

Same change for buffered handler:

```javascript
// Extract routing metadata from request
const routingMetadata = body.routing_metadata || {};

// Pass to enhanceResponse
const enhancedResponse = await enhanceResponse(
    responseText,
    userMessage,
    tenantHash,
    sessionContext,
    routingMetadata  // NEW parameter
);
```

---

### Phase 4: Update loadTenantConfig()

**Location**: Lines 71-75 in response_enhancer.js

Add `cta_settings` to extracted config sections:

```javascript
// OLD
return {
    conversational_forms: config.conversational_forms || {},
    conversation_branches: config.conversation_branches || {},
    cta_definitions: config.cta_definitions || {}
};

// NEW
return {
    conversational_forms: config.conversational_forms || {},
    conversation_branches: config.conversation_branches || {},
    cta_definitions: config.cta_definitions || {},
    cta_settings: config.cta_settings || {}  // NEW: Required for Tier 3 fallback
};
```

---

## Routing Flow Diagram

```
User Interaction
    ↓
Frontend sends request with routing_metadata
    ↓
index.js extracts routing_metadata
    ↓
Pass to enhanceResponse(bedrockResponse, userMessage, tenantHash, sessionContext, routingMetadata)
    ↓
getConversationBranch(routingMetadata, config)
    ↓
┌─────────────────────────────────────────┐
│ TIER 1: Action Chip Routing             │
│ Check: action_chip_triggered + target_branch │
│ ✅ Valid branch → Return branch          │
│ ❌ Invalid → Continue to Tier 2         │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ TIER 2: CTA Routing                     │
│ Check: cta_triggered + target_branch    │
│ ✅ Valid branch → Return branch          │
│ ❌ Invalid → Continue to Tier 3         │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│ TIER 3: Fallback Navigation Hub         │
│ Check: cta_settings.fallback_branch     │
│ ✅ Valid branch → Return branch          │
│ ❌ No fallback → Return null             │
└─────────────────────────────────────────┘
    ↓
If branch returned:
    buildCtasFromBranch(branch, config, completedForms)
    ↓
    Return CTAs (max 3)
Else:
    Fall through to DEPRECATED keyword detection
```

---

## Success Criteria

### Functional Requirements
- ✅ Tier 1: Action chips route to explicit `target_branch`
- ✅ Tier 2: CTAs route to explicit `target_branch`
- ✅ Tier 3: Fallback branch always provides navigation CTAs
- ✅ Keyword detection still works (backward compatibility)
- ✅ Form completion filtering works correctly
- ✅ Invalid branches gracefully fall through to next tier

### Parity Requirements
- ✅ JavaScript logic matches Python logic exactly
- ✅ Same log messages for debugging consistency
- ✅ Same error handling and graceful degradation
- ✅ Same CTA filtering rules (completed forms)
- ✅ Same return structure

### Quality Requirements
- ✅ All changes follow validation SOP
- ✅ Manual testing of all 3 tiers completed
- ✅ Integration testing with Master_Function parity verified
- ✅ Documentation updated
- ✅ Code reviewed for consistency

---

## Testing Plan

### Unit Testing Scenarios

**Test 1: Tier 1 - Action Chip Routing**
```javascript
const routingMetadata = {
    action_chip_triggered: true,
    action_chip_id: 'volunteer',
    target_branch: 'volunteer_interest'
};
// Expected: Routes to 'volunteer_interest' branch
```

**Test 2: Tier 1 - Invalid Branch Fallthrough**
```javascript
const routingMetadata = {
    action_chip_triggered: true,
    target_branch: 'non_existent_branch'
};
// Expected: Falls through to Tier 3 fallback
```

**Test 3: Tier 2 - CTA Routing**
```javascript
const routingMetadata = {
    cta_triggered: true,
    cta_id: 'volunteer_apply',
    target_branch: 'application_flow'
};
// Expected: Routes to 'application_flow' branch
```

**Test 4: Tier 3 - Fallback Navigation**
```javascript
const routingMetadata = {};  // No explicit routing
// Expected: Routes to fallback_branch from cta_settings
```

**Test 5: Backward Compatibility - Keyword Detection**
```javascript
const routingMetadata = {};
const bedrockResponse = "We have volunteer programs...";
// Expected: Falls through to keyword detection (deprecated)
```

**Test 6: Form Completion Filtering**
```javascript
const completedForms = ['lovebox'];
// Expected: lb_apply CTA filtered out, other CTAs shown
```

### Integration Testing

**End-to-End Flow**:
1. Frontend: User clicks action chip "Volunteer"
2. Frontend: Passes metadata `{action_chip_triggered: true, target_branch: 'volunteer_interest'}`
3. index.js: Extracts routing_metadata from request
4. response_enhancer.js: Routes via Tier 1 to 'volunteer_interest'
5. buildCtasFromBranch: Returns CTAs from that branch
6. Response: User sees "Apply Now", "View Programs"

**Parity Testing**:
- Same request to Master_Function (HTTP fallback) and Bedrock_Streaming_Handler (primary path)
- Expected: Identical CTAs returned from both Lambda functions

---

## Rollout Plan

### Phase 1: Local Development ✅
- Implement changes in local Bedrock_Streaming_Handler_Staging
- Manual testing of all 3 tiers
- Verify parity with Master_Function_Staging

### Phase 2: Staging Deployment
1. Deploy Bedrock_Streaming_Handler_Staging to AWS staging
2. Test with pilot tenants (MYR384719)
3. Verify streaming path works correctly
4. Compare with Master_Function HTTP fallback (should be identical)

### Phase 3: Production Deployment
1. Deploy to production Lambda
2. Monitor CloudWatch logs for routing tier usage
3. Track "Tier 1", "Tier 2", "Tier 3" log messages
4. Monitor error rates and CTA display rates

### Phase 4: Monitoring & Validation
- Track routing tier distribution (Tier 1 vs Tier 2 vs Tier 3)
- Monitor keyword detection usage (should decline as tenants migrate)
- Verify "No CTAs shown" incidents drop to <2%

---

## Risk Mitigation

### Risk 1: Breaking Streaming Responses
**Mitigation**:
- Test thoroughly in staging before production
- Deploy during low-traffic window
- Have rollback plan ready (previous Lambda version)

### Risk 2: Parity Issues Between Python and JavaScript
**Mitigation**:
- Line-by-line comparison of logic
- Use same log messages for debugging
- Integration tests verify both return same CTAs

### Risk 3: Performance Degradation
**Mitigation**:
- Explicit routing is faster than keyword detection
- Monitor Lambda execution time metrics
- Set CloudWatch alarms for >200ms execution time

---

## Documentation Updates

### Files to Update After Implementation

1. **`ARCHITECTURE.md`** (Bedrock_Streaming_Handler)
   - Document 3-tier routing architecture
   - Add flow diagram
   - Deprecation notice for keyword detection

2. **`ACTION_CHIPS_EXPLICIT_ROUTING_IMPLEMENTATION_SUMMARY.md`**
   - Add section: "Bedrock Streaming Handler Implementation"
   - Document parity with Master_Function
   - Update deployment status

3. **`response_enhancer.js`** (inline comments)
   - Add JSDoc comments for new functions
   - Explain 3-tier hierarchy
   - Mark keyword detection as DEPRECATED

---

## Validation Checklist (SOP Compliance)

Following `picasso-config-builder/docs/VALIDATION_SOP_SUMMARY.md` process:

### Task-Level Validation
- [ ] All files modified successfully
- [ ] JavaScript syntax valid (no compilation errors)
- [ ] Manual testing of all 3 tiers completed
- [ ] Parity with Master_Function verified
- [ ] Inline documentation added
- [ ] Console.log statements for debugging

### Phase-Level Validation
- [ ] Integration testing complete
- [ ] Backward compatibility verified (keyword detection)
- [ ] Form completion filtering works
- [ ] Performance benchmarks met (<50ms routing decision)

### Pre-Deployment Validation
- [ ] Staging deployment successful
- [ ] Pilot tenant testing complete (MYR384719)
- [ ] CloudWatch logs verify routing tiers working
- [ ] Error rate <0.1%
- [ ] Ready for production deployment

---

## Files Modified

1. `/Users/chrismiller/Desktop/Working_Folder/Lambdas/lambda/Bedrock_Streaming_Handler_Staging/response_enhancer.js`
   - Added `getConversationBranch()` function
   - Added `buildCtasFromBranch()` function
   - Updated `enhanceResponse()` signature and logic
   - Updated `loadTenantConfig()` to include `cta_settings`

2. `/Users/chrismiller/Desktop/Working_Folder/Lambdas/lambda/Bedrock_Streaming_Handler_Staging/index.js`
   - Updated `streamingHandler` to pass routing_metadata
   - Updated `bufferedHandler` to pass routing_metadata

---

## Timeline

- **Task Start**: 2025-10-30
- **Implementation**: 2-3 hours
- **Testing**: 1 hour
- **Staging Deployment**: 1 day
- **Production Deployment**: After successful staging validation

---

## References

- **PRD**: `PRD_ACTION_CHIPS_EXPLICIT_ROUTING_FALLBACK_HUB.md`
- **Python Implementation**: `Lambdas/lambda/Master_Function_Staging/lambda_function.py` (lines 626-789)
- **Frontend Implementation**: `Picasso/src/components/chat/MessageBubble.jsx` (lines 505-533)
- **Migration Guide**: `MIGRATION_GUIDE_V1.3_TO_V1.4.1.md`
- **Schema Documentation**: `TENANT_CONFIG_SCHEMA.md`

---

**Status**: ✅ Plan published, ready for implementation
**Next Step**: Begin implementation following this plan
