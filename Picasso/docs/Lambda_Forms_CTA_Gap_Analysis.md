# Lambda Forms & CTA Gap Analysis
**Master_Function_Staging vs Bedrock_Streaming_Handler_Staging**

**Date**: October 1, 2025
**Analyst**: Claude Code
**Purpose**: Identify feature parity gaps between HTTP fallback (Master) and streaming (Bedrock) handlers

---

## Executive Summary

**Overall Assessment**: Master_Function_Staging is significantly ahead of Bedrock_Streaming_Handler_Staging in form handling capabilities following Phase 1B HTTP Fallback Parity implementation.

### Critical Findings

1. **Session Context Tracking**: Master has comprehensive session context support with `completed_forms`, `suspended_forms`, and `program_interest` tracking. Bedrock only partially implements `completed_forms` filtering.

2. **Form Interruption Handling**: Master has sophisticated form suspension/resume logic with program switching detection. Bedrock has NO interruption handling.

3. **Form Mode Detection**: Master has complete form mode bypass for field validation. Bedrock has commented-out form handler (line 12 in index.js).

4. **CTA Enhancement Parity**: Both implement similar CTA filtering, but Master's implementation is more mature with better context awareness.

5. **AWS SDK Version Gap**: Bedrock uses outdated AWS SDK v2 in form_handler.js, while Master uses boto3 (Python standard).

### Priority Gaps (P0 - Blocking)

| Gap | Impact | Master Status | Bedrock Status |
|-----|--------|---------------|----------------|
| Session Context Tracking | HIGH | ✅ Complete | ⚠️ Partial (completed_forms only) |
| Form Interruption/Resume | HIGH | ✅ Complete | ❌ Missing |
| Suspended Form Detection | MEDIUM | ✅ Complete | ❌ Missing |
| Program Switching Logic | MEDIUM | ✅ Complete | ❌ Missing |
| Form Mode Bypass | MEDIUM | ✅ Complete | ❌ Commented Out |

---

## 1. Feature Parity Matrix

### 1.1 Session Context Tracking

| Feature | Master_Function_Staging | Bedrock_Streaming_Handler_Staging | Gap |
|---------|------------------------|----------------------------------|-----|
| **completed_forms tracking** | ✅ Full implementation (form_cta_enhancer.py:390) | ✅ Basic implementation (response_enhancer.js:288) | MINOR - Both working |
| **suspended_forms tracking** | ✅ Full implementation (form_cta_enhancer.py:391) | ❌ Not implemented | CRITICAL |
| **program_interest tracking** | ✅ Context-aware (form_cta_enhancer.py:438) | ❌ Not implemented | HIGH |
| **Session context persistence** | ✅ Passes to enhance_response_with_form_cta | ⚠️ Passed but not fully utilized | MEDIUM |

**Evidence**:

**Master** (lambda_function.py:786-808):
```python
# Phase 1B: Extract session_context from request body for CTA enhancement
session_context = body.get('session_context', {})
logger.info(f"Session context extracted: completed_forms={session_context.get('completed_forms', [])}")

# Phase 1B: Enhance response with form CTAs (HTTP mode parity with streaming)
try:
    from form_cta_enhancer import enhance_response_with_form_cta

    enhanced_response = enhance_response_with_form_cta(
        response_text=response_body.get('content', ''),
        user_message=body.get('user_input', ''),
        tenant_hash=tenant_hash,
        conversation_history=conversation_history,
        session_context=session_context  # NEW: Pass session context
    )
```

**Bedrock** (index.js:517-526):
```javascript
// Enhance response with CTAs after streaming is complete
try {
    const { enhanceResponse } = require('./response_enhancer');

    const enhancedData = await enhanceResponse(
        responseBuffer,  // The complete Bedrock response
        userInput,       // The user's message
        tenantHash,      // Tenant identifier
        body.session_context || {} // Session context for form tracking
    );
```

### 1.2 Form Interruption & Resume

| Feature | Master_Function_Staging | Bedrock_Streaming_Handler_Staging | Gap |
|---------|------------------------|----------------------------------|-----|
| **Suspended form detection** | ✅ form_cta_enhancer.py:397-477 | ❌ Not implemented | CRITICAL |
| **Program switch detection** | ✅ form_cta_enhancer.py:411-467 | ❌ Not implemented | CRITICAL |
| **Resume prompt generation** | ✅ Dynamic metadata response | ❌ Not implemented | HIGH |
| **Context-aware program naming** | ✅ Maps program_interest to names | ❌ Not implemented | MEDIUM |

**Evidence**:

**Master** (form_cta_enhancer.py:397-467):
```python
# PHASE 1B: If there are suspended forms, check if user is asking about a DIFFERENT program
if suspended_forms:
    logger.info(f"[Phase 1B] 🔄 Suspended form detected: {suspended_forms[0]}")

    # Load config to check if current message would trigger a DIFFERENT form
    config = load_tenant_config(tenant_hash)
    conversational_forms = config.get('conversational_forms', {})

    # Check if user's message would trigger a different form
    triggered_form = should_trigger_form(
        user_message,
        conversational_forms,
        readiness_score=0.8
    )

    if triggered_form:
        new_form_id = triggered_form.get('form_id')
        suspended_form_id = suspended_forms[0]

        # If user is asking about a DIFFERENT program, offer to switch
        if new_form_id != suspended_form_id:
            logger.info(f"[Phase 1B] 🔀 Program switch detected! Suspended: {suspended_form_id}, Interested in: {new_form_id}")

            # Get program names from form titles in config
            new_program_name = triggered_form.get('title', 'this program').replace(' Application', '')

            # ... return program_switch_detected metadata ...
```

**Bedrock**: No equivalent code exists.

### 1.3 Form Mode Handling

| Feature | Master_Function_Staging | Bedrock_Streaming_Handler_Staging | Gap |
|---------|------------------------|----------------------------------|-----|
| **Form mode bypass** | ✅ Integrated via form_handler.py | ⚠️ Commented out (index.js:12, 391-416) | CRITICAL |
| **Field validation** | ✅ FormHandler class with validation | ⚠️ Skeleton implementation (form_handler.js:60-113) | HIGH |
| **Form submission** | ✅ Full DynamoDB + notifications | ⚠️ Basic implementation (form_handler.js:122-155) | HIGH |
| **Multi-channel notifications** | ✅ Email, SMS, Webhooks | ⚠️ Email only, AWS SDK v2 | MEDIUM |

**Evidence**:

**Master** (form_handler.py:33-124):
```python
class FormHandler:
    """Handles conversational form submissions and notifications"""

    def __init__(self, tenant_config: Dict[str, Any]):
        self.tenant_config = tenant_config
        self.tenant_id = tenant_config.get('tenant_id')
        self.tenant_hash = tenant_config.get('tenant_hash')

    def handle_form_submission(self, form_data: Dict[str, Any]) -> Dict[str, Any]:
        # Store submission
        submission_id = self._store_submission(...)

        # Determine priority
        priority = self._determine_priority(...)

        # Send notifications (Email, SMS, Webhook)
        notification_results = self._send_notifications(...)

        # Handle fulfillment
        fulfillment_result = self._process_fulfillment(...)
```

**Bedrock** (index.js:390-416):
```javascript
// Check for form mode - bypass Bedrock for form field collection
if (body.form_mode === true) {
    console.log('📝 Form mode detected - handling locally without Bedrock');
    try {
        const formResponse = await handleFormMode(body, config);  // COMMENTED OUT - line 12

        // Send the form response as a single SSE event
        write(`data: ${JSON.stringify(formResponse)}\n\n`);
        write('data: [DONE]\n\n');
        // ...
    }
}
```

**CRITICAL**: Line 12 in index.js comments out form_handler:
```javascript
// const { handleFormMode } = require('./form_handler'); // Commented out - needs AWS SDK v3 migration
```

### 1.4 CTA Enhancement Logic

| Feature | Master_Function_Staging | Bedrock_Streaming_Handler_Staging | Gap |
|---------|------------------------|----------------------------------|-----|
| **Conversation branch detection** | ✅ detect_conversation_branch (form_cta_enhancer.py:214-368) | ✅ detectConversationBranch (response_enhancer.js:95-236) | NONE - Parity achieved |
| **Form trigger detection** | ✅ should_trigger_form (form_cta_enhancer.py:100-127) | ✅ checkFormTriggers (response_enhancer.js:242-269) | NONE - Parity achieved |
| **Readiness score calculation** | ✅ calculate_readiness_score (form_cta_enhancer.py:129-177) | ⚠️ Not implemented (assumed by checkFormTriggers) | MINOR - Frontend handles scoring |
| **Program-to-formId mapping** | ✅ Comprehensive mapping (form_cta_enhancer.py:496-502) | ✅ Similar mapping (response_enhancer.js:294-298) | NONE - Parity achieved |
| **Completed forms filtering** | ✅ filter_completed_forms (form_cta_enhancer.py:193-212) | ✅ Inline filtering (response_enhancer.js:334-360) | MINOR - Different approaches, same result |

**Evidence**: Both implementations have nearly identical branch detection logic.

**Master** (form_cta_enhancer.py:214-261):
```python
def detect_conversation_branch(
    response_text: str,
    user_message: str,
    config: Dict[str, Any],
    completed_forms: List[str] = None
) -> Optional[Dict[str, Any]]:
    """
    PHASE 3: Detect conversation branch based on response content
    Matches response to conversation_branches configuration
    Ported from response_enhancer.js
    """
    completed_forms = completed_forms or []
    conversation_branches = config.get('conversation_branches', {})
    cta_definitions = config.get('cta_definitions', {})

    # Check if user is engaged/interested
    import re
    engaged_pattern = r'\b(tell me|more|interested|how|what|when|where|apply|volunteer|help|can i|do you|does)\b'
    if not re.search(engaged_pattern, user_message, re.IGNORECASE):
        logger.info('[Phase 3] User not engaged enough for CTAs')
        return None
```

**Bedrock** (response_enhancer.js:95-127):
```javascript
function detectConversationBranch(bedrockResponse, userQuery, config, completedForms = []) {
    const { conversation_branches, cta_definitions } = config;

    // Check if user is engaged/interested
    const userEngaged = /\b(tell me|more|interested|how|what|when|where|apply|volunteer|help|can i|do you|does)\b/i.test(userQuery);
    if (!userEngaged) {
        console.log('User not engaged enough for CTAs');
        return null;
    }

    // Priority order for branch detection (broader topics first)
    const branchPriority = [
        'program_exploration',
        'volunteer_interest',
        'requirements_discussion',
        'lovebox_discussion',
        'daretodream_discussion'
    ];
```

**Assessment**: These are near-identical implementations with Python/JavaScript syntax differences only.

### 1.5 Configuration Loading & Caching

| Feature | Master_Function_Staging | Bedrock_Streaming_Handler_Staging | Gap |
|---------|------------------------|----------------------------------|-----|
| **Tenant config loading** | ✅ load_tenant_config (form_cta_enhancer.py:58-98) | ✅ loadTenantConfig (response_enhancer.js:41-88) | NONE |
| **Hash-to-ID resolution** | ✅ resolve_tenant_hash (form_cta_enhancer.py:21-56) | ✅ resolveTenantHash (response_enhancer.js:20-36) | NONE |
| **Config caching** | ✅ 5-minute TTL (form_cta_enhancer.py:17-18) | ✅ 5-minute TTL (response_enhancer.js:15) | NONE |
| **Conversation branches** | ✅ Loaded from config (form_cta_enhancer.py:86) | ✅ Loaded from config (response_enhancer.js:72) | NONE |
| **CTA definitions** | ✅ Loaded from config (form_cta_enhancer.py:87) | ✅ Loaded from config (response_enhancer.js:73) | NONE |

**Assessment**: Configuration loading has full parity between both implementations.

---

## 2. Master-Only Features

### 2.1 Phase 1B Enhancements (Critical Gap)

**File**: `Master_Function_Staging/form_cta_enhancer.py`

#### Feature: Suspended Form Detection & Program Switching

**Location**: Lines 397-477

**What it does**:
1. Detects when a user has a suspended form (interrupted)
2. Checks if user's new message would trigger a DIFFERENT form
3. If switching programs, offers intelligent switch options
4. Provides metadata for frontend to show switch UI

**Code Example**:
```python
if suspended_forms:
    logger.info(f"[Phase 1B] 🔄 Suspended form detected: {suspended_forms[0]}")

    # Check if user's message would trigger a different form
    triggered_form = should_trigger_form(user_message, conversational_forms, readiness_score=0.8)

    if triggered_form:
        new_form_id = triggered_form.get('form_id')
        suspended_form_id = suspended_forms[0]

        # If user is asking about a DIFFERENT program, offer to switch
        if new_form_id != suspended_form_id:
            logger.info(f"[Phase 1B] 🔀 Program switch detected!")

            return {
                "message": response_text,
                "cards": [],  # No automatic CTAs
                "metadata": {
                    "enhanced": True,
                    "program_switch_detected": True,
                    "suspended_form": { "form_id": suspended_form_id, "program_name": suspended_program_name },
                    "new_form_of_interest": { "form_id": new_form_id, "program_name": new_program_name }
                }
            }
```

**Business Impact**: Critical for user experience. Prevents confusion when users interrupt forms to ask questions, then get interested in a different program.

**Migration Effort**: ~4 hours
- Port suspended form detection logic (1 hour)
- Implement program_interest context tracking (1 hour)
- Add program switching metadata response (1 hour)
- Testing with various interruption scenarios (1 hour)

#### Feature: program_interest Context Tracking

**Location**: Lines 438-447

**What it does**:
1. Tracks which program user selected in volunteer form (lovebox, daretodream, both, unsure)
2. Uses this context when displaying suspended form name
3. Makes resume prompts more personalized

**Code Example**:
```python
# If user selected a program_interest in the volunteer form, use that instead of "Volunteer"
program_interest = session_context.get('program_interest')
if program_interest:
    program_map = {
        'lovebox': 'Love Box',
        'daretodream': 'Dare to Dream',
        'both': 'both programs',
        'unsure': 'Volunteer'
    }
    suspended_program_name = program_map.get(program_interest.lower(), suspended_program_name)
    logger.info(f"[Phase 1B] 📝 User selected program_interest='{program_interest}', showing as '{suspended_program_name}'")
```

**Business Impact**: Medium - Improves personalization but not blocking for basic functionality.

**Migration Effort**: ~2 hours

### 2.2 Form Handler Integration

**File**: `Master_Function_Staging/form_handler.py`

Master has a complete FormHandler class that Bedrock lacks:

| Capability | Master Implementation | Bedrock Status |
|------------|---------------------|----------------|
| Form submission storage | ✅ DynamoDB with full metadata (lines 126-152) | ⚠️ Basic implementation |
| Priority determination | ✅ Config-driven priority rules (lines 154-187) | ❌ Not implemented |
| Multi-channel notifications | ✅ Email, SMS, Webhooks (lines 189-221) | ⚠️ Email only |
| SMS rate limiting | ✅ Monthly usage tracking (lines 395-414) | ❌ Not implemented |
| Fulfillment routing | ✅ Lambda, Email, S3 options (lines 330-393) | ❌ Not implemented |
| Confirmation emails | ✅ Template-based (lines 516-549) | ⚠️ Basic implementation |

**Critical Difference**: Master's FormHandler is production-ready with error handling, rate limiting, and audit logging. Bedrock's form_handler.js is a skeleton implementation with commented-out AWS SDK v2 code.

**Migration Effort**: ~16 hours
- Migrate to AWS SDK v3 (4 hours)
- Implement priority determination logic (2 hours)
- Add SMS rate limiting with DynamoDB (3 hours)
- Implement fulfillment routing options (4 hours)
- Add comprehensive error handling (2 hours)
- Testing (1 hour)

### 2.3 Response Formatter Integration

**File**: `Master_Function_Staging/response_formatter.py`

**Location**: Lines 100-110 (commented out, but explains architectural decision)

```python
# PHASE 1B: CTA enhancement moved to lambda_function.py to support session_context
# This allows filtering based on completed_forms for HTTP/Streaming parity
# The enhancement now happens AFTER extracting session_context from the request body
#
# OLD CODE (removed to prevent duplicate enhancement without session_context):
# if tenant_hash and user_message:
#     try:
#         from form_cta_enhancer import enhance_response_with_form_cta
#         enhanced = enhance_response_with_form_cta(...)
#     except Exception as e:
#         logger.error(f"Failed to enhance response: {e}")
```

**Insight**: Master moved CTA enhancement OUT of the response formatter and into the main handler to ensure session_context is always available. This is a more mature architectural pattern.

**Bedrock Status**: CTA enhancement happens in the streaming handler after response generation (index.js:517-542), which is correct for streaming but doesn't leverage the same architectural insight.

**Migration Recommendation**: No action needed - Bedrock's approach is appropriate for streaming.

---

## 3. Implementation Differences

### 3.1 Language & Runtime

| Aspect | Master_Function_Staging | Bedrock_Streaming_Handler_Staging |
|--------|------------------------|----------------------------------|
| **Language** | Python 3.x | Node.js 20.x |
| **AWS SDK** | boto3 (standard for Python) | @aws-sdk/client-* (v3) for main code, AWS SDK v2 in form_handler |
| **Async Pattern** | Synchronous with exception handling | Async/await with promises |
| **Logging** | Python logging module | console.log |

**Gap**: Bedrock's form_handler.js uses outdated AWS SDK v2, which is a technical debt issue.

**Migration Effort for SDK v3**: ~4 hours
- Replace SES client (1 hour)
- Replace SNS client (1 hour)
- Replace DynamoDB DocumentClient (1 hour)
- Testing (1 hour)

### 3.2 Error Handling Maturity

**Master** has comprehensive error handling:
```python
try:
    from form_cta_enhancer import enhance_response_with_form_cta

    enhanced_response = enhance_response_with_form_cta(...)

    # Merge enhanced response back into response_body
    if enhanced_response:
        response_body['content'] = enhanced_response.get('message', response_body.get('content', ''))
        response_body['ctaButtons'] = enhanced_response.get('cards', [])

except Exception as enhance_error:
    logger.warning(f"CTA enhancement failed, continuing with unenhanced response: {enhance_error}")
```

**Bedrock** has similar error handling:
```javascript
try {
    const enhancedData = await enhanceResponse(...);

    if (enhancedData.ctaButtons && enhancedData.ctaButtons.length > 0) {
        // Send CTAs as a separate SSE event
        const ctaData = JSON.stringify({ type: 'cta_buttons', ctaButtons: enhancedData.ctaButtons });
        write(`data: ${ctaData}\n\n`);
    }
} catch (enhanceError) {
    console.error('❌ CTA enhancement error:', enhanceError);
    // Don't fail the response if CTA enhancement fails
}
```

**Assessment**: Error handling parity is good - both gracefully degrade on enhancement failures.

### 3.3 Testing Infrastructure

**Master**:
- Has `test_phase1b_parity.py` with comprehensive Phase 1B tests
- Tests for completed_forms filtering
- Tests for suspended form detection
- Tests for program switching logic

**Bedrock**:
- Has `test-enhancer.js` but it's minimal
- No tests for session context tracking
- No tests for form interruption scenarios

**Gap**: Testing coverage for Phase 1B features is significantly better in Master.

**Migration Effort**: ~6 hours to add comprehensive tests to Bedrock

---

## 4. Code Examples: Side-by-Side Comparison

### 4.1 CTA Filtering for Completed Forms

#### Master (Python)
```python
# form_cta_enhancer.py:492-523
# Map formId to program for comparison with completed_forms
form_id = triggered_form.get('form_id')
program = form_id  # Default to formId

# Map specific formIds to programs
if form_id == 'lb_apply':
    program = 'lovebox'
elif form_id == 'dd_apply':
    program = 'daretodream'

# Check if this program has already been completed
if program in completed_forms:
    logger.info(f"[Phase 3] 🚫 Program '{program}' already completed (formId: {form_id}), skipping form trigger CTA")
    # Don't show this CTA - continue to branch detection
else:
    logger.info(f"[Phase 3] ✅ Form trigger detected for program '{program}'")
    return {
        "message": response_text,
        "cards": [{
            "type": "form_cta",
            "label": triggered_form.get("cta_text", "Start Application"),
            "action": "start_form",
            "formId": form_id,
            "fields": triggered_form.get("fields", [])
        }],
        "metadata": {
            "enhanced": True,
            "form_triggered": form_id,
            "program": program
        }
    }
```

#### Bedrock (JavaScript)
```javascript
// response_enhancer.js:291-320
const formTrigger = checkFormTriggers(bedrockResponse, userMessage, config);
if (formTrigger) {
    // Map formId to program for comparison with completed_forms
    let program = formTrigger.formId; // Default to formId
    if (formTrigger.formId === 'lb_apply') program = 'lovebox';
    else if (formTrigger.formId === 'dd_apply') program = 'daretodream';

    // Check if this program has already been completed
    if (completedForms.includes(program)) {
        console.log(`🚫 Program "${program}" already completed (formId: ${formTrigger.formId}), skipping CTA`);
        // Don't show this CTA - continue to branch detection
    } else {
        return {
            message: bedrockResponse,
            ctaButtons: [{
                type: 'form_cta',
                label: formTrigger.ctaText || 'Start Application',
                action: 'start_form',
                formId: formTrigger.formId,
                fields: formTrigger.fields
            }],
            metadata: {
                enhanced: true,
                form_triggered: formTrigger.formId,
                program: program
            }
        };
    }
}
```

**Assessment**: Near-perfect parity. Both implement the same logic with language-specific syntax.

### 4.2 Conversation Branch Detection

Both implementations use identical priority order and keyword matching:

#### Master (Python)
```python
# form_cta_enhancer.py:240-261
# Priority order for branch detection (broader topics first)
branch_priority = [
    'program_exploration',
    'volunteer_interest',
    'requirements_discussion',
    'lovebox_discussion',
    'daretodream_discussion'
]

# Check branches in priority order
for branch_name in branch_priority:
    branch = conversation_branches.get(branch_name)
    if not branch or not branch.get('detection_keywords'):
        continue

    detection_keywords = branch.get('detection_keywords', [])
    if not isinstance(detection_keywords, list):
        continue

    # Check if any keywords match the response
    response_lower = response_text.lower()
    matches = any(keyword.lower() in response_lower for keyword in detection_keywords)

    if matches:
        logger.info(f"[Phase 3] Detected branch: {branch_name}")
        # Build CTA array from branch configuration...
```

#### Bedrock (JavaScript)
```javascript
// response_enhancer.js:105-127
// Priority order for branch detection (broader topics first)
const branchPriority = [
    'program_exploration',
    'volunteer_interest',
    'requirements_discussion',
    'lovebox_discussion',
    'daretodream_discussion'
];

// Check branches in priority order
for (const branchName of branchPriority) {
    const branch = conversation_branches?.[branchName];
    if (!branch || !branch.detection_keywords || !Array.isArray(branch.detection_keywords)) {
        continue;
    }

    // Check if any keywords match the response
    const matches = branch.detection_keywords.some(keyword =>
        bedrockResponse.toLowerCase().includes(keyword.toLowerCase())
    );

    if (matches) {
        console.log(`Detected branch: ${branchName}`);
        // Build CTA array from branch configuration...
```

**Assessment**: Identical logic. This was clearly ported from one codebase to the other.

---

## 5. Missing Integrations in Bedrock

### 5.1 Form Handler Not Integrated

**File**: `Bedrock_Streaming_Handler_Staging/index.js`

**Line 12**: Form handler import is commented out
```javascript
// const { handleFormMode } = require('./form_handler'); // Commented out - needs AWS SDK v3 migration
```

**Lines 390-416**: Form mode handling code exists but is unreachable
```javascript
// Check for form mode - bypass Bedrock for form field collection
if (body.form_mode === true) {
    console.log('📝 Form mode detected - handling locally without Bedrock');
    try {
        const formResponse = await handleFormMode(body, config);  // WILL FAIL - not imported

        // Send the form response as a single SSE event
        write(`data: ${JSON.stringify(formResponse)}\n\n`);
        write('data: [DONE]\n\n');
        // ...
    } catch (error) {
        console.error('Form mode error:', error);
        // ...
    }
}
```

**Impact**: Form validation and field collection bypass is non-functional in Bedrock.

**Fix Required**:
1. Migrate form_handler.js to AWS SDK v3
2. Uncomment the import on line 12
3. Test form mode with validation scenarios

**Effort**: 6 hours

### 5.2 Session Context Not Fully Utilized

While Bedrock passes `session_context` to `enhanceResponse`, it doesn't use:
- `suspended_forms` (not tracked)
- `program_interest` (not tracked)

**Impact**: Form interruption/resume features don't work in streaming mode.

**Fix Required**:
1. Add suspended form detection in main handler
2. Track program_interest in session context
3. Implement program switching metadata response

**Effort**: 4 hours

---

## 6. Migration Roadmap

### Phase 1: Critical Gaps (P0) - 14 hours

| Task | Effort | Priority | Dependencies |
|------|--------|----------|--------------|
| 1. Migrate form_handler.js to AWS SDK v3 | 4 hours | P0 | None |
| 2. Uncomment and test form mode bypass | 2 hours | P0 | Task 1 |
| 3. Add suspended_forms tracking | 3 hours | P0 | None |
| 4. Implement program switching logic | 4 hours | P0 | Task 3 |
| 5. Add program switching metadata response | 1 hour | P0 | Task 4 |

**Deliverable**: Form interruption/resume working in streaming mode.

### Phase 2: High Priority Gaps (P1) - 12 hours

| Task | Effort | Priority | Dependencies |
|------|--------|----------|--------------|
| 6. Add program_interest context tracking | 2 hours | P1 | Phase 1 complete |
| 7. Implement priority determination in form_handler | 2 hours | P1 | Phase 1 complete |
| 8. Add SMS rate limiting with DynamoDB | 3 hours | P1 | Phase 1 complete |
| 9. Implement fulfillment routing (Lambda, S3) | 4 hours | P1 | Phase 1 complete |
| 10. Add comprehensive error handling to form_handler | 1 hour | P1 | Phase 1 complete |

**Deliverable**: Form submission parity with Master.

### Phase 3: Testing & Documentation (P2) - 8 hours

| Task | Effort | Priority | Dependencies |
|------|--------|----------|--------------|
| 11. Write Phase 1B tests for Bedrock | 4 hours | P2 | Phase 1 complete |
| 12. Add form interruption scenario tests | 2 hours | P2 | Phase 1 complete |
| 13. Document form mode architecture | 1 hour | P2 | All phases |
| 14. Create migration guide for future features | 1 hour | P2 | All phases |

**Deliverable**: Full test coverage and documentation.

### Phase 4: Code Quality & Performance (P3) - 6 hours

| Task | Effort | Priority | Dependencies |
|------|--------|----------|--------------|
| 15. Refactor duplicated branch detection code | 2 hours | P3 | Phase 2 complete |
| 16. Add performance metrics for form operations | 2 hours | P3 | Phase 2 complete |
| 17. Optimize config caching strategy | 2 hours | P3 | Phase 2 complete |

**Deliverable**: Production-ready code quality.

### Total Effort: 40 hours (5 days for 1 developer)

---

## 7. Risk Assessment

### 7.1 High-Risk Gaps

| Gap | Risk Level | Impact if Not Fixed | Mitigation |
|-----|-----------|---------------------|------------|
| **Form handler not integrated** | HIGH | Users can't submit forms in streaming mode | Priority 1 - Block other work |
| **Suspended forms not tracked** | HIGH | Poor UX when users interrupt forms | Priority 1 - Part of Phase 1B |
| **AWS SDK v2 in form_handler** | MEDIUM | Security vulnerabilities, deprecated API | Migrate to v3 immediately |

### 7.2 Medium-Risk Gaps

| Gap | Risk Level | Impact if Not Fixed | Mitigation |
|-----|-----------|---------------------|------------|
| **No SMS rate limiting** | MEDIUM | Cost overruns from SMS abuse | Implement in Phase 2 |
| **No priority determination** | MEDIUM | All forms treated equally | Implement in Phase 2 |
| **Limited fulfillment options** | LOW | Can't route to Lambda/S3 | Implement in Phase 2 |

### 7.3 Low-Risk Gaps

| Gap | Risk Level | Impact if Not Fixed | Mitigation |
|-----|-----------|---------------------|------------|
| **No program_interest tracking** | LOW | Less personalized messages | Nice-to-have in Phase 2 |
| **Limited testing** | LOW | Bugs may slip through | Add tests in Phase 3 |

---

## 8. Recommendations

### 8.1 Immediate Actions (This Sprint)

1. **Uncomment and fix form_handler integration**
   - Migrate to AWS SDK v3
   - Test form mode bypass
   - Priority: P0

2. **Add suspended_forms tracking**
   - Implement in response_enhancer.js
   - Add program switching detection
   - Priority: P0

3. **Synchronize session_context usage**
   - Ensure both handlers track completed_forms, suspended_forms, program_interest
   - Priority: P0

### 8.2 Next Sprint

4. **Complete form submission parity**
   - SMS rate limiting
   - Priority determination
   - Fulfillment routing options

5. **Add comprehensive tests**
   - Phase 1B scenario tests
   - Form interruption tests

### 8.3 Architectural Recommendations

1. **Consider shared codebase for common logic**
   - Branch detection is identical in both handlers
   - Could be a shared npm package or Python module
   - Reduces maintenance burden

2. **Standardize session_context structure**
   - Document exact fields and types
   - Create TypeScript interfaces / Python TypedDicts
   - Prevents drift between implementations

3. **Implement feature flags**
   - Allow gradual rollout of new features
   - A/B test form interruption handling
   - Safer deployment of breaking changes

---

## 9. Conclusion

**Overall Assessment**: Master_Function_Staging has a ~4 week head start on Bedrock_Streaming_Handler_Staging for forms/CTA features due to Phase 1B implementation.

**Key Wins**:
- Core CTA enhancement logic has parity ✅
- Configuration loading is identical ✅
- Completed forms filtering works in both ✅

**Key Gaps**:
- Form handler not integrated in Bedrock ❌
- Suspended forms tracking missing ❌
- Program switching logic missing ❌
- AWS SDK v2 technical debt ❌

**Path Forward**: With focused effort (~40 hours), Bedrock can achieve full parity with Master. The migration is straightforward because the logic is already proven in Master's implementation.

**Priority**: P0 gaps should be addressed before next production deployment to ensure users have consistent experience regardless of streaming mode.

---

## Appendix A: File Inventory

### Master_Function_Staging Files
- `lambda_function.py` - Main handler with Phase 1B session context extraction
- `form_cta_enhancer.py` - CTA enhancement with suspended form logic (592 lines)
- `form_handler.py` - Complete form submission handler (599 lines)
- `intent_router.py` - Routes intents to bedrock_handler
- `response_formatter.py` - HTTP response formatting
- `test_phase1b_parity.py` - Phase 1B tests

### Bedrock_Streaming_Handler_Staging Files
- `index.js` - Main streaming handler (776 lines)
- `response_enhancer.js` - CTA enhancement (401 lines)
- `form_handler.js` - Skeleton form handler (367 lines, AWS SDK v2)
- `test-enhancer.js` - Minimal tests

### Line Count Comparison
| Component | Master | Bedrock | Gap |
|-----------|--------|---------|-----|
| CTA Enhancement | 592 lines | 401 lines | 191 lines (32% less) |
| Form Handler | 599 lines | 367 lines | 232 lines (39% less) |
| Tests | ~200 lines | ~50 lines | 150 lines (75% less) |

---

## Appendix B: References

### PRDs & Documentation
- `/Picasso/docs/PRD_Phase1B_HTTP_Fallback_Parity.md` - Phase 1B implementation details
- Master_Function_Staging recent commits (463d28c, 68160d5, a40134e)

### CloudWatch Log Examples
Evidence that Master's filtering works:
```
[Phase 1B] Session context extracted: completed_forms=['lovebox']
[Phase 3] 🚫 Program 'lovebox' already completed (formId: lb_apply), skipping form trigger CTA
Response enhanced with 0 CTA buttons
```

### Testing Evidence
Master has passing tests for:
- Completed forms filtering ✅
- Suspended form detection ✅
- Program switching logic ✅

Bedrock needs tests for all the above.

---

**Document Version**: 1.0
**Last Updated**: October 1, 2025
**Next Review**: After Phase 1 migration complete
