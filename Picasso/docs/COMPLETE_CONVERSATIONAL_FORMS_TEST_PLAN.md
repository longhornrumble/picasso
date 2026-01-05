# Conversational Forms Test Plan

## Executive Summary

### Purpose
This test plan validates the conversational forms implementation in the Picasso chat widget, including recent fixes for CTA button management, session context tracking, and backend response enhancement.

### Scope
- Frontend form UI and interactions
- Session context persistence and program tracking
- Backend CTA filtering and response enhancement
- End-to-end form workflows
- Edge cases and error handling

### System Under Test
- **Frontend**: Picasso React widget (`/src`)
- **Backend**: Bedrock_Streaming_Handler_Staging Lambda function
- **Test Environment**: Staging with Atlanta Angels tenant configuration
- **Test Pages**: test-forms.html, test-cta-forms.html

### Key Features Tested
1. **Conversational form collection** - Multi-step forms through natural chat
2. **CTA button management** - Disable specific buttons by ID when clicked
3. **Session context tracking** - Track completed PROGRAMS (lovebox, daretodream), not form IDs
4. **Backend CTA filtering** - Filter out CTAs for programs user has already applied to
5. **Session persistence** - SessionStorage survives page reloads and widget close/reopen
6. **Form interruption handling** - Pause/resume forms when user asks questions
7. **Validation and eligibility gates** - Real-time validation and graceful exits

## Test Environment Setup

### Prerequisites

**AWS Configuration:**
```bash
# AWS CLI profile
export AWS_PROFILE=chris-admin

# Lambda function names
STREAMING_HANDLER=Bedrock_Streaming_Handler_Staging
MASTER_FUNCTION=Master_Function_Staging
```

**Frontend Setup:**
```bash
cd /Users/chrismiller/Desktop/Working_Folder/Picasso
npm run dev
```

**Test Pages:**
- `/Users/chrismiller/Desktop/Working_Folder/Picasso/test-forms.html`
- `/Users/chrismiller/Desktop/Working_Folder/Picasso/test-cta-forms.html`

**Tenant Configuration:**
- Tenant Hash: `my8...` (Atlanta Angels)
- Programs: lovebox, daretodream
- Forms: volunteer_apply, lb_apply, dd_apply

### Test Data

**Valid User Data:**
```json
{
  "first_name": "Chris",
  "last_name": "Miller",
  "email": "chris@example.com",
  "phone": "+15551234567",
  "program_interest": "lovebox",
  "age_confirm": "yes",
  "commitment_confirm": "yes"
}
```

**Invalid Data (for validation tests):**
- Email: "notanemail", "test@", "@example.com"
- Phone: "123", "abc-defg", "55512345"

### Browser Console Setup

**Enable verbose logging:**
```javascript
// Open browser console (F12)
localStorage.setItem('picasso_debug', 'true');
```

**Key log patterns to watch:**
- `🔍 enhanceResponse called with:` - Backend enhancement
- `📋 Extracted program from form data:` - Program extraction
- `🚨 SESSION CONTEXT SAVED TO STORAGE` - Session persistence
- `✅ Adding primary CTA` - CTA inclusion
- `🚫 Filtering primary CTA for completed program` - CTA filtering

### Lambda Log Access

**Tail streaming handler logs:**
```bash
aws logs tail /aws/lambda/Bedrock_Streaming_Handler_Staging \
  --since 10m \
  --follow \
  --profile chris-admin
```

**Search for specific patterns:**
```bash
aws logs tail /aws/lambda/Bedrock_Streaming_Handler_Staging \
  --since 30m \
  --filter-pattern "enhanceResponse" \
  --profile chris-admin
```

## Base Test Scenarios (from Implementation Plan)

### TC-001: Happy Path - Complete Form Without Interruption

**Priority:** P0 (Critical)

**Objective:** Verify user can complete a form from start to finish without any interruptions.

**Preconditions:**
- User has NOT previously applied to any program
- Session storage is clear: `sessionStorage.clear()`
- Test page loaded: test-forms.html

**Test Steps:**
1. Load the test page and open chat widget
2. Type: "I want to volunteer for Love Box"
3. Wait for bot response with "Apply to Love Box" CTA button
4. Click the "Apply to Love Box" CTA button
5. Verify form mode starts with first field prompt
6. Enter first name: "Chris"
7. Press Enter
8. Enter last name: "Miller"
9. Press Enter
10. Enter email: "chris@example.com"
11. Press Enter
12. Enter phone: "+15551234567"
13. Press Enter
14. Select program interest: "lovebox" (if dropdown shown)
15. Press Enter
16. Confirm age 22+: "yes"
17. Press Enter
18. Confirm 1-year commitment: "yes"
19. Press Enter
20. Verify form completion confirmation appears

**Expected Results:**
- ✅ CTA button appears after bot response
- ✅ Clicking CTA immediately disables that specific button
- ✅ Form mode starts with progress indicator
- ✅ Each field accepts valid input
- ✅ Progress advances through all fields
- ✅ Confirmation message shows collected data (NOT raw JSON)
- ✅ NO Bedrock response appears after form submission
- ✅ Session context updated: `completed_forms: ["lovebox"]`

**Browser Console Checks:**
```javascript
// After form submission
sessionStorage.getItem('picasso_session_context')
// Should show: {"completed_forms":["lovebox"],"form_submissions":{...}}

// Check for these logs:
// "📋 Extracted program from form data: lovebox"
// "🚨 SESSION CONTEXT SAVED TO STORAGE"
```

**Lambda Log Checks:**
```
# Look for these patterns:
"enhanceResponse called with:"
"completedForms: []"  # Initially empty

# After form submission and next query:
"completedForms: ['lovebox']"
"🚫 Filtering primary CTA for completed program: lovebox"
```

**Pass Criteria:**
- All steps complete without errors
- Form submission succeeds
- Session context correctly tracks "lovebox" program
- No duplicate CTAs appear for lovebox in subsequent responses

---

### TC-002: Single Interruption - Ask Question, Then Resume

**Priority:** P1 (High)

**Objective:** Verify user can interrupt form to ask a question and then resume.

**Preconditions:**
- Session storage is clear
- Test page loaded

**Test Steps:**
1. Start Love Box application form (follow TC-001 steps 1-5)
2. Enter first name: "Chris"
3. When prompted for last name, type: "What is Love Box?"
4. Wait for bot response explaining Love Box program
5. Type: "Continue"
6. Verify form resumes at last name field
7. Complete remaining fields
8. Verify form submits successfully

**Expected Results:**
- ✅ Question triggers interruption detection
- ✅ Form state suspended in sessionStorage
- ✅ Bot answers question normally
- ✅ Resume prompt appears after answer
- ✅ Form resumes at correct field (last name)
- ✅ Previously entered data preserved (first name = "Chris")
- ✅ Form completes successfully

**Browser Console Checks:**
```javascript
// After interruption
sessionStorage.getItem('picasso_suspended_form')
// Should show suspended form state

// After resume
// Check for: "Resuming form from field index: 1"
```

**Lambda Log Checks:**
```
# During interruption:
"form_mode: false"
"had_interrupted_form: true"

# During resume:
"Resuming form: lb_apply"
```

**Pass Criteria:**
- Interruption detected and handled gracefully
- Form state preserved during interruption
- Resume functionality works correctly
- No data loss

---

### TC-003: Multiple Interruptions - Several Questions During Form

**Priority:** P1 (High)

**Objective:** Verify user can interrupt form multiple times and resume each time.

**Preconditions:**
- Session storage is clear
- Test page loaded

**Test Steps:**
1. Start Love Box application form
2. Enter first name: "Chris"
3. When prompted for last name, ask: "What is Love Box?"
4. After bot response, type: "Continue"
5. Enter last name: "Miller"
6. When prompted for email, ask: "What are the requirements?"
7. After bot response, type: "Resume my application"
8. Enter email: "chris@example.com"
9. Complete remaining fields
10. Verify form submits successfully

**Expected Results:**
- ✅ Both interruptions handled correctly
- ✅ Form resumes at correct field each time
- ✅ All previously entered data preserved
- ✅ Form completes successfully

**Browser Console Checks:**
```javascript
// Check suspended form is cleared after resume
sessionStorage.getItem('picasso_suspended_form')
// Should be null when form is active
```

**Pass Criteria:**
- Multiple interruptions handled without confusion
- State management works correctly across interruptions
- Form completion succeeds

---

### TC-004: Cancel and Restart - Cancel Form, Trigger Again

**Priority:** P2 (Medium)

**Objective:** Verify user can cancel a form mid-way and start over.

**Preconditions:**
- Session storage is clear
- Test page loaded

**Test Steps:**
1. Start Love Box application form
2. Enter first name: "Chris"
3. Type: "cancel" or click Cancel button (if present)
4. Verify form mode exits
5. Type: "I want to apply to Love Box"
6. Click the "Apply to Love Box" CTA button again
7. Verify form starts fresh from beginning
8. Enter first name: "John"
9. Complete remaining fields with different data
10. Verify form submits successfully with new data

**Expected Results:**
- ✅ Cancel command exits form mode
- ✅ Previous form data cleared
- ✅ CTA button available again after cancel
- ✅ New form starts from beginning
- ✅ New data collected correctly
- ✅ No mixing of old and new data

**Browser Console Checks:**
```javascript
// After cancel
sessionStorage.getItem('picasso_session_context')
// Should NOT show lovebox in completed_forms

// After second submission
// Should show lovebox with new data
```

**Pass Criteria:**
- Cancel functionality works correctly
- Form restarts cleanly
- No data contamination

---

### TC-005: Timeout Resume - Close Chat, Return, Resume

**Priority:** P1 (High)

**Objective:** Verify user can close chat mid-form and resume when returning.

**Preconditions:**
- Session storage is clear
- Test page loaded

**Test Steps:**
1. Start Love Box application form
2. Enter first name: "Chris"
3. Enter last name: "Miller"
4. Enter email: "chris@example.com"
5. Close the chat widget (click X button)
6. Wait 10 seconds
7. Reopen the chat widget
8. Verify resume prompt appears
9. Type: "Continue" or click Continue button
10. Verify form resumes at phone field
11. Complete remaining fields
12. Verify form submits successfully

**Expected Results:**
- ✅ Session persists in sessionStorage after close
- ✅ Resume prompt appears on reopen
- ✅ Form resumes at correct field (phone)
- ✅ Previously entered data preserved
- ✅ Form completes successfully

**Browser Console Checks:**
```javascript
// Before close
sessionStorage.getItem('picasso_session_context')
// Should show partial form data

// After reopen
// Same data should still be present
```

**Pass Criteria:**
- Session persistence works across widget close/reopen
- Resume functionality works after timeout
- No data loss

---

### TC-006: Validation Failures - Test Email, Phone Formats

**Priority:** P1 (High)

**Objective:** Verify validation catches invalid email and phone formats.

**Preconditions:**
- Session storage is clear
- Test page loaded

**Test Steps:**

**Email Validation:**
1. Start Love Box application form
2. Complete name fields
3. At email prompt, enter: "notanemail"
4. Press Enter
5. Verify validation error appears
6. Enter: "test@"
7. Press Enter
8. Verify validation error appears
9. Enter: "@example.com"
10. Press Enter
11. Verify validation error appears
12. Enter: "chris@example.com"
13. Press Enter
14. Verify validation passes

**Phone Validation:**
15. At phone prompt, enter: "123"
16. Press Enter
17. Verify validation error appears
18. Enter: "abc-defg"
19. Press Enter
20. Verify validation error appears
21. Enter: "+15551234567"
22. Press Enter
23. Verify validation passes
24. Complete form

**Expected Results:**
- ✅ Invalid email formats rejected with clear error messages
- ✅ Invalid phone formats rejected with clear error messages
- ✅ Valid formats accepted
- ✅ User not forced to proceed with invalid data
- ✅ Error messages are helpful and specific
- ✅ Form does NOT advance until valid data provided

**Browser Console Checks:**
```javascript
// Look for validation error logs:
// "Validation failed for field: email"
// "Validation failed for field: phone"
```

**Pass Criteria:**
- All invalid formats rejected
- Clear error messages shown
- Valid formats accepted
- Form completes successfully after corrections

---

### TC-007: Eligibility Gate - Age/Commitment = "no"

**Priority:** P0 (Critical)

**Objective:** Verify eligibility gates exit form gracefully when user doesn't qualify.

**Preconditions:**
- Session storage is clear
- Test page loaded

**Test Steps:**

**Age Gate Test:**
1. Start Love Box application form
2. Complete name, email, phone fields
3. Select program interest: "lovebox"
4. At "Are you 22 or older?" prompt, select: "no"
5. Verify form exits gracefully
6. Verify explanation message appears
7. Verify lovebox NOT added to completed_forms

**Commitment Gate Test:**
8. Start Love Box application again
9. Complete all fields up to commitment question
10. At "Can you commit for 1 year?" prompt, select: "no"
11. Verify form exits gracefully
12. Verify explanation message appears
13. Verify lovebox NOT added to completed_forms

**Expected Results:**
- ✅ Selecting "no" on age gate exits form immediately
- ✅ Clear explanation why user doesn't qualify
- ✅ No harsh rejection message
- ✅ Suggestion for alternatives (if configured)
- ✅ Form NOT marked as completed
- ✅ CTA still available (user could try again)
- ✅ Same behavior for commitment gate

**Browser Console Checks:**
```javascript
// After eligibility failure
sessionStorage.getItem('picasso_session_context')
// Should NOT show lovebox in completed_forms
```

**Lambda Log Checks:**
```
# Look for:
"Eligibility gate failed: age_confirm"
"Form exit: user_ineligible"
```

**Pass Criteria:**
- Eligibility gates function correctly
- Graceful exit with explanation
- Form not marked complete
- User can retry if they change their answer

---

### TC-008: Multiple Forms - Start One Form, Switch to Another

**Priority:** P2 (Medium)

**Objective:** Verify user can switch between different program forms.

**Preconditions:**
- Session storage is clear
- Test page loaded

**Test Steps:**
1. Start Love Box application form
2. Enter first name: "Chris"
3. Type: "Actually, I want to apply to Dare to Dream instead"
4. Verify system detects form switch intent
5. Confirm switch to Dare to Dream form
6. Verify new form starts from beginning
7. Complete Dare to Dream form
8. Verify daretodream added to completed_forms
9. Type: "Tell me about Love Box"
10. Verify Love Box CTA still appears (lovebox not completed)
11. Verify Dare to Dream CTA does NOT appear (daretodream completed)

**Expected Results:**
- ✅ System detects intent to switch forms
- ✅ Confirmation prompt appears
- ✅ New form starts fresh
- ✅ Old form data cleared
- ✅ Only completed form (daretodream) filtered from CTAs
- ✅ Incomplete form (lovebox) CTA still available

**Browser Console Checks:**
```javascript
// After Dare to Dream completion
sessionStorage.getItem('picasso_session_context')
// Should show: {"completed_forms":["daretodream"],...}
```

**Lambda Log Checks:**
```
# After query about Love Box:
"completedForms: ['daretodream']"
"✅ Adding primary CTA - program: lovebox"
"🚫 Filtering primary CTA for completed program: daretodream"
```

**Pass Criteria:**
- Form switching works correctly
- Session context tracks correct completed programs
- CTA filtering works for completed but not incomplete programs

---

## Additional Test Scenarios (Recent Fixes)

### TC-101: CTA Button Disabling by Specific ID

**Priority:** P0 (Critical)

**Objective:** Verify CTA button disables immediately when clicked, using specific button ID.

**Preconditions:**
- Session storage is clear
- Test page loaded

**Test Steps:**
1. Load test page and open chat
2. Type: "Tell me about your volunteer programs"
3. Wait for bot response with multiple CTA buttons (Love Box, Dare to Dream, General)
4. Note the button IDs in DOM inspector
5. Click "Apply to Love Box" CTA button
6. **Immediately** check button state (before form appears)
7. Verify ONLY the clicked button is disabled
8. Verify OTHER buttons remain enabled
9. Try clicking the same button again
10. Verify no duplicate forms appear

**Expected Results:**
- ✅ Clicked button disables within 100ms of click
- ✅ Button uses specific ID (cta.id || cta.formId || cta.label)
- ✅ `clickedButtonIds` Set contains button ID
- ✅ Other CTA buttons remain enabled
- ✅ Second click on same button does nothing
- ✅ No duplicate forms spawn

**Browser Console Checks:**
```javascript
// Check MessageBubble state
// Look for log: "[MessageBubble] CTA clicked - full data:"
// Verify button ID extracted correctly

// Check CTAButtonGroup rendering
// Look for: "Button ID: <id>, isClicked: true"
```

**Code Reference:**
- `MessageBubble.jsx:77` - `clickedButtonIds` state
- `MessageBubble.jsx:90` - Button ID extraction
- `CTAButton.jsx:165` - `isClicked` check

**Pass Criteria:**
- Button disables immediately by specific ID
- Other buttons unaffected
- No duplicate forms possible

---

### TC-102: Session Context Persistence with Program Tracking

**Priority:** P0 (Critical)

**Objective:** Verify session context tracks PROGRAMS (lovebox, daretodream), not form IDs.

**Preconditions:**
- Session storage is clear
- Test page loaded

**Test Steps:**
1. Open browser console
2. Load test page and open chat
3. Complete Love Box application form
4. In console, check session context:
   ```javascript
   JSON.parse(sessionStorage.getItem('picasso_session_context'))
   ```
5. Verify `completed_forms` contains "lovebox" (NOT "volunteer_apply" or "lb_apply")
6. Verify `form_submissions.lb_apply.program` = "lovebox"
7. Close and reopen widget
8. Verify session context persists
9. Complete Dare to Dream application
10. Verify `completed_forms` now contains ["lovebox", "daretodream"]

**Expected Results:**
- ✅ `completed_forms` array contains program names: "lovebox", "daretodream"
- ✅ NOT form IDs: "volunteer_apply", "lb_apply", "dd_apply"
- ✅ Program extracted from `formData.program_interest` field
- ✅ Fallback mapping: lb_apply → lovebox, dd_apply → daretodream
- ✅ Session persists across widget close/reopen
- ✅ Session persists across page reload

**Browser Console Checks:**
```javascript
// After form completion, verify structure:
const context = JSON.parse(sessionStorage.getItem('picasso_session_context'));
console.log(context.completed_forms);
// Expected: ["lovebox"]  NOT ["volunteer_apply"]

console.log(context.form_submissions.lb_apply.program);
// Expected: "lovebox"

// Look for log:
// "📋 Extracted program from form data: lovebox"
```

**Code Reference:**
- `StreamingChatProvider.jsx:233` - `recordFormCompletion` function
- `StreamingChatProvider.jsx:242` - Program extraction logic

**Pass Criteria:**
- Programs tracked, not form IDs
- Session persists correctly
- Program extraction works for all mapping scenarios

---

### TC-103: Backend CTA Filtering for Completed Programs

**Priority:** P0 (Critical)

**Objective:** Verify backend response enhancer filters CTAs for completed programs.

**Preconditions:**
- Session storage is clear
- Test page loaded
- Access to Lambda logs

**Test Steps:**
1. Open browser console and Lambda logs in parallel
2. Complete Love Box application form
3. Wait for completion confirmation
4. Type: "Tell me about Love Box"
5. Wait for bot response
6. Verify NO "Apply to Love Box" CTA button appears
7. Check Lambda logs for filtering evidence
8. Type: "Tell me about Dare to Dream"
9. Wait for bot response
10. Verify "Apply to Dare to Dream" CTA DOES appear
11. Check Lambda logs for inclusion evidence

**Expected Results:**
- ✅ Request includes session_context with completed_forms: ["lovebox"]
- ✅ Backend receives and logs session context
- ✅ Response enhancer checks program match
- ✅ CTAs for lovebox filtered out
- ✅ CTAs for daretodream (not completed) still included
- ✅ Frontend receives response without lovebox CTAs

**Browser Console Checks:**
```javascript
// Check outgoing request payload
// Look for log: "Sending message with session context:"
// Verify session_context.completed_forms = ["lovebox"]
```

**Lambda Log Checks:**
```bash
# Tail logs and look for:
aws logs tail /aws/lambda/Bedrock_Streaming_Handler_Staging --since 5m --follow

# Expected patterns:
"🔍 enhanceResponse called with:"
"completedForms: ['lovebox']"
"Detected branch: lovebox_discussion"
"🚫 Filtering primary CTA for completed program: lovebox"

# For Dare to Dream query:
"Detected branch: daretodream_discussion"
"✅ Adding primary CTA - program: daretodream, completed: [lovebox]"
```

**Code Reference:**
- `response_enhancer.js:95` - `detectConversationBranch` function
- `response_enhancer.js:142` - Program extraction from CTA
- `response_enhancer.js:158` - Filtering logic

**Pass Criteria:**
- Backend receives session context
- Filtering logic executes correctly
- Completed program CTAs removed
- Incomplete program CTAs preserved

---

### TC-104: SessionStorage Timing Fix - Direct Read vs React State

**Priority:** P0 (Critical)

**Objective:** Verify sendMessage reads from sessionStorage directly, not stale React state.

**Preconditions:**
- Session storage is clear
- Test page loaded
- Enable verbose console logging

**Test Steps:**
1. Open browser console
2. Complete Love Box application form
3. Watch for this log: "🚨🚨🚨 SESSION CONTEXT SAVED TO STORAGE 🚨🚨🚨"
4. **Immediately** (within 1 second) type: "Tell me about Love Box"
5. Press Enter
6. Watch console logs for request payload
7. Verify session_context in request includes lovebox
8. Check Lambda logs for received context

**Expected Results:**
- ✅ `recordFormCompletion` saves to sessionStorage immediately
- ✅ `sendMessage` reads from sessionStorage (NOT React state)
- ✅ Request payload includes latest session_context
- ✅ No race condition between state update and message send
- ✅ Backend receives correct completed_forms array

**Browser Console Checks:**
```javascript
// Look for these logs in sequence:
// 1. "Recording form completion"
// 2. "📋 Extracted program from form data: lovebox"
// 3. "🚨🚨🚨 SESSION CONTEXT SAVED TO STORAGE 🚨🚨🚨"
// 4. "Sending message with session context: {completed_forms: ['lovebox']}"

// Verify NOT using stale state:
// Should NOT see: "session_context: {completed_forms: []}"
```

**Code Reference:**
- `StreamingChatProvider.jsx:246` - Save to sessionStorage in recordFormCompletion
- `StreamingChatProvider.jsx:167` - Read from sessionStorage in sendMessage:
  ```javascript
  session_context: getFromSession('picasso_session_context') || sessionContext
  ```

**Pass Criteria:**
- sessionStorage updated immediately after form completion
- sendMessage reads latest sessionStorage value
- No timing issues or race conditions
- Backend receives correct context

---

### TC-105: Duplicate Form Prevention

**Priority:** P0 (Critical)

**Objective:** Verify users cannot spawn duplicate forms by clicking CTA multiple times.

**Preconditions:**
- Session storage is clear
- Test page loaded

**Test Steps:**
1. Load test page and open chat
2. Type: "I want to volunteer"
3. Wait for "Apply" CTA button to appear
4. Rapidly click the "Apply" button 5 times in quick succession
5. Verify ONLY one form appears
6. Complete the form
7. Type: "Tell me about Love Box"
8. Verify "Apply to Love Box" CTA does NOT appear
9. Check console for form completion tracking

**Expected Results:**
- ✅ First click disables button immediately
- ✅ Subsequent clicks ignored (button disabled)
- ✅ Only ONE form instance appears
- ✅ No duplicate forms between messages
- ✅ After completion, CTA filtered out
- ✅ No way to create duplicate submissions

**Browser Console Checks:**
```javascript
// After rapid clicking:
// Count FormFieldPrompt components in DOM
document.querySelectorAll('.form-field-prompt').length
// Should be 1, not 5

// After completion:
JSON.parse(sessionStorage.getItem('picasso_session_context')).completed_forms
// Should contain program only once
```

**Code Reference:**
- `MessageBubble.jsx:88` - Immediate button disable
- `CTAButton.jsx:165` - isClicked check
- `StreamingChatProvider.jsx:233` - Prevent duplicate completion tracking

**Pass Criteria:**
- Button disabling prevents duplicate clicks
- Form mode state prevents duplicate forms
- Session context prevents duplicate completions

---

### TC-106: Form Completion Without Bedrock Call

**Priority:** P1 (High)

**Objective:** Verify form submission does NOT trigger unnecessary Bedrock response.

**Preconditions:**
- Session storage is clear
- Test page loaded
- Access to Lambda logs

**Test Steps:**
1. Start Lambda log monitoring:
   ```bash
   aws logs tail /aws/lambda/Bedrock_Streaming_Handler_Staging --since 5m --follow
   ```
2. Complete Love Box application form
3. After final field submission, watch logs carefully
4. Verify NO new "invokeModel" call to Bedrock
5. Verify form completion handled locally
6. Verify confirmation message appears
7. Type a new message: "What else can you tell me?"
8. Verify THIS message triggers Bedrock call

**Expected Results:**
- ✅ Form submission creates confirmation message locally
- ✅ NO Bedrock API call during form completion
- ✅ Confirmation shows collected data, not JSON
- ✅ Next user message correctly triggers Bedrock
- ✅ Better performance (no unnecessary API call)
- ✅ More predictable confirmation message

**Browser Console Checks:**
```javascript
// After form completion:
// Should NOT see: "Streaming response chunk received"
// SHOULD see: "Form complete - showing completion card"
```

**Lambda Log Checks:**
```bash
# After form submission:
# Should NOT see:
"invokeModel called"
"Streaming response from Bedrock"

# After next user message:
# SHOULD see these (for regular query):
"invokeModel called"
```

**Code Reference:**
- `InputBar.jsx:85` - Form completion handling
- `FormModeContext.jsx:180` - Return formComplete flag
- Form completion bypasses sendMessage

**Pass Criteria:**
- Form completion handled entirely client-side
- No Bedrock call during submission
- Subsequent messages work normally

---

## Test Categories

### Category A: Frontend UI Tests

**Tests in this category:**
- TC-001 (Happy Path)
- TC-004 (Cancel/Restart)
- TC-006 (Validation)
- TC-007 (Eligibility Gates)
- TC-101 (Button Disabling)

**Focus Areas:**
- Button states and interactions
- Form field rendering
- Input validation and error messages
- Progress indicators
- Confirmation displays

**Tools:**
- Browser DevTools
- DOM inspection
- Event listener monitoring
- React DevTools (if available)

---

### Category B: Session Context Tests

**Tests in this category:**
- TC-102 (Program Tracking)
- TC-104 (SessionStorage Timing)
- TC-105 (Duplicate Prevention)

**Focus Areas:**
- sessionStorage read/write operations
- Program extraction from form data
- State synchronization
- Persistence across widget lifecycle

**Tools:**
- Browser console
- sessionStorage inspector
- Network tab (verify payloads)

---

### Category C: Backend Integration Tests

**Tests in this category:**
- TC-103 (CTA Filtering)
- TC-106 (No Bedrock Call)

**Focus Areas:**
- Request payload structure
- Lambda function processing
- Response enhancement logic
- CTA filtering algorithms

**Tools:**
- CloudWatch Logs
- Lambda console
- API Gateway logs (if applicable)

---

### Category D: End-to-End Workflow Tests

**Tests in this category:**
- TC-001 (Happy Path)
- TC-002 (Single Interruption)
- TC-003 (Multiple Interruptions)
- TC-005 (Timeout Resume)
- TC-008 (Multiple Forms)

**Focus Areas:**
- Complete user journeys
- State transitions
- Error recovery
- Multi-step interactions

**Tools:**
- Full stack monitoring
- Session recording
- User flow validation

---

### Category E: Edge Case Tests

**Tests in this category:**
- TC-004 (Cancel scenarios)
- TC-006 (Invalid data)
- TC-007 (Eligibility failures)

**Focus Areas:**
- Error handling
- Boundary conditions
- Graceful degradation
- User guidance

**Tools:**
- Negative testing frameworks
- Error log aggregation

---

## Test Execution Guide

### Manual Testing Procedures

**Pre-test Checklist:**
1. ☐ Clear browser cache
2. ☐ Clear sessionStorage: `sessionStorage.clear()`
3. ☐ Open browser console (F12)
4. ☐ Start Lambda log tailing (if testing backend)
5. ☐ Load appropriate test page
6. ☐ Verify widget loads correctly
7. ☐ Enable verbose logging if needed

**During Testing:**
1. Follow test steps exactly as written
2. Record actual results at each step
3. Capture screenshots of failures
4. Copy relevant console logs
5. Copy relevant Lambda logs
6. Note timestamps for correlation

**Post-test Actions:**
1. Document pass/fail status
2. File bugs for failures with evidence
3. Clear session for next test
4. Update test results matrix

### Automated Test Recommendations

**Unit Tests (Recommended):**

```javascript
// StreamingChatProvider.test.jsx
describe('recordFormCompletion', () => {
  it('should extract program from formData.program_interest', () => {
    const formData = { program_interest: 'lovebox', first_name: 'Chris' };
    recordFormCompletion('volunteer_apply', formData);

    const context = JSON.parse(sessionStorage.getItem('picasso_session_context'));
    expect(context.completed_forms).toContain('lovebox');
    expect(context.completed_forms).not.toContain('volunteer_apply');
  });

  it('should map lb_apply to lovebox program', () => {
    const formData = { first_name: 'Chris' };
    recordFormCompletion('lb_apply', formData);

    const context = JSON.parse(sessionStorage.getItem('picasso_session_context'));
    expect(context.completed_forms).toContain('lovebox');
  });
});

// CTAButton.test.jsx
describe('CTAButtonGroup', () => {
  it('should disable clicked button by ID', () => {
    const clickedIds = new Set(['btn-1']);
    const { getByText } = render(
      <CTAButtonGroup
        ctas={[{ id: 'btn-1', label: 'Apply' }]}
        clickedButtonIds={clickedIds}
      />
    );

    expect(getByText('Apply')).toBeDisabled();
  });
});
```

**Integration Tests (Recommended):**

```javascript
// form-workflow.integration.test.js
describe('Form Workflow Integration', () => {
  it('should complete form and filter subsequent CTAs', async () => {
    // 1. Start form
    await userEvent.click(screen.getByText('Apply to Love Box'));

    // 2. Complete all fields
    await fillFormFields({
      first_name: 'Chris',
      last_name: 'Miller',
      email: 'chris@example.com',
      // ... rest of fields
    });

    // 3. Verify session context
    const context = JSON.parse(sessionStorage.getItem('picasso_session_context'));
    expect(context.completed_forms).toContain('lovebox');

    // 4. Send new message
    await userEvent.type(screen.getByRole('textbox'), 'Tell me about Love Box{enter}');

    // 5. Verify CTA filtered
    await waitFor(() => {
      expect(screen.queryByText('Apply to Love Box')).not.toBeInTheDocument();
    });
  });
});
```

**End-to-End Tests (Recommended with Playwright):**

```javascript
// e2e/conversational-forms.spec.js
test('should complete Love Box application', async ({ page }) => {
  await page.goto('http://localhost:3000/test-forms.html');

  // Start conversation
  await page.fill('[data-testid="chat-input"]', 'I want to volunteer for Love Box');
  await page.press('[data-testid="chat-input"]', 'Enter');

  // Click CTA
  await page.click('button:has-text("Apply to Love Box")');

  // Fill form fields
  await page.fill('[data-testid="form-input"]', 'Chris');
  await page.press('[data-testid="form-input"]', 'Enter');
  // ... repeat for all fields

  // Verify completion
  await expect(page.locator('.form-completion-card')).toBeVisible();

  // Verify session context
  const context = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('picasso_session_context'))
  );
  expect(context.completed_forms).toContain('lovebox');
});
```

### Browser Console Validation Points

**Key Log Patterns:**

```javascript
// 1. Session Context Management
"🚨🚨🚨 SESSION CONTEXT SAVED TO STORAGE 🚨🚨🚨"
"Recording form completion"
"📋 Extracted program from form data: <program>"

// 2. CTA Button Management
"[MessageBubble] CTA clicked - full data:"
"Button ID: <id>, isClicked: true"

// 3. Form Mode
"[InputBar] Form mode active"
"Form complete - showing completion card"
"Field validation failed:"

// 4. Backend Communication
"Sending message with session context:"
"Response metadata:"
"enhanceResponse called"
```

**Console Commands:**

```javascript
// Check session context
JSON.parse(sessionStorage.getItem('picasso_session_context'))

// Check suspended forms
sessionStorage.getItem('picasso_suspended_form')

// Clear session
sessionStorage.clear()

// Enable debug mode
localStorage.setItem('picasso_debug', 'true')

// Count form instances
document.querySelectorAll('.form-field-prompt').length
```

### Lambda Log Validation Points

**CloudWatch Log Queries:**

```bash
# Check session context received
aws logs filter-log-events \
  --log-group-name /aws/lambda/Bedrock_Streaming_Handler_Staging \
  --start-time $(date -u -d '5 minutes ago' +%s)000 \
  --filter-pattern "completedForms" \
  --profile chris-admin

# Check CTA filtering
aws logs filter-log-events \
  --log-group-name /aws/lambda/Bedrock_Streaming_Handler_Staging \
  --start-time $(date -u -d '5 minutes ago' +%s)000 \
  --filter-pattern "Filtering primary CTA" \
  --profile chris-admin

# Check Bedrock invocations
aws logs filter-log-events \
  --log-group-name /aws/lambda/Bedrock_Streaming_Handler_Staging \
  --start-time $(date -u -d '5 minutes ago' +%s)000 \
  --filter-pattern "invokeModel" \
  --profile chris-admin
```

**Key Log Patterns:**

```
# Session Context
"🔍 enhanceResponse called with:"
"completedForms: ['lovebox']"
"session_context: {completed_forms: [...]}"

# CTA Filtering
"Detected branch: lovebox_discussion"
"🚫 Filtering primary CTA for completed program: lovebox"
"✅ Adding primary CTA - program: daretodream, completed: [lovebox]"

# Response Enhancement
"Primary CTA detected:"
"Program extracted: lovebox"
"CTA filtering enabled"
```

---

## Traceability Matrix

| Test ID | Requirement | Component | Priority | Status |
|---------|-------------|-----------|----------|--------|
| TC-001 | Complete form flow | Frontend + Backend | P0 | ☐ |
| TC-002 | Handle interruptions | Frontend | P1 | ☐ |
| TC-003 | Multiple interruptions | Frontend | P1 | ☐ |
| TC-004 | Cancel/restart | Frontend | P2 | ☐ |
| TC-005 | Session persistence | Frontend | P1 | ☐ |
| TC-006 | Field validation | Frontend | P1 | ☐ |
| TC-007 | Eligibility gates | Frontend + Backend | P0 | ☐ |
| TC-008 | Multiple forms | Frontend + Backend | P2 | ☐ |
| TC-101 | Button disabling by ID | Frontend | P0 | ☐ |
| TC-102 | Program tracking | Frontend + Backend | P0 | ☐ |
| TC-103 | Backend CTA filtering | Backend | P0 | ☐ |
| TC-104 | SessionStorage timing | Frontend | P0 | ☐ |
| TC-105 | Duplicate prevention | Frontend | P0 | ☐ |
| TC-106 | No unnecessary Bedrock calls | Frontend + Backend | P1 | ☐ |

**Status Legend:**
- ☐ Not Started
- 🔄 In Progress
- ✅ Passed
- ❌ Failed
- ⚠️ Blocked

---

## Test Reporting Template

### Bug Report Format

```markdown
**Bug ID:** BUG-XXX
**Test Case:** TC-XXX
**Priority:** P0/P1/P2/P3
**Environment:** Staging / Production
**Tenant:** Atlanta Angels (my8...)

**Summary:**
[One-line description of the issue]

**Steps to Reproduce:**
1. [Detailed steps]
2. [...]

**Expected Result:**
[What should happen]

**Actual Result:**
[What actually happened]

**Screenshots:**
[Attach screenshots]

**Browser Console Logs:**
```
[Paste relevant console logs]
```

**Lambda Logs:**
```
[Paste relevant Lambda logs]
```

**Session Context State:**
```json
[Paste sessionStorage contents]
```

**Impact:**
[User impact and severity]

**Workaround:**
[Temporary workaround if available]
```

### Test Execution Report

```markdown
**Test Execution Report**
**Date:** YYYY-MM-DD
**Tester:** [Name]
**Environment:** Staging
**Build/Commit:** [Git hash]

**Summary:**
- Total Tests: 14
- Passed: X
- Failed: Y
- Blocked: Z
- Pass Rate: XX%

**P0 Critical Tests:**
- TC-001: ✅ Passed
- TC-007: ✅ Passed
- TC-101: ❌ Failed (BUG-123)
- TC-102: ✅ Passed
- TC-103: ✅ Passed
- TC-104: ⚠️ Blocked (awaiting deployment)
- TC-105: ✅ Passed

**Issues Found:**
1. BUG-123: CTA button not disabling immediately (TC-101)
2. BUG-124: Session context timing issue (TC-104)

**Blockers:**
1. Lambda deployment pending for TC-104

**Next Steps:**
1. Fix BUG-123 and retest TC-101
2. Deploy Lambda update for TC-104
3. Complete remaining P1/P2 tests

**Notes:**
[Additional observations or concerns]
```

---

## Appendix A: Key Files Reference

### Frontend Files

**Context Providers:**
- `StreamingChatProvider.jsx:233` - recordFormCompletion (program extraction)
- `StreamingChatProvider.jsx:167` - sendMessage (sessionStorage read)
- `FormModeContext.jsx` - Form state management

**Components:**
- `MessageBubble.jsx:77` - clickedButtonIds state
- `MessageBubble.jsx:88` - handleCtaClick (button disabling)
- `CTAButton.jsx:165` - CTAButtonGroup (isClicked check)
- `InputBar.jsx:85` - Form submission handling

**Utilities:**
- Session storage helpers
- Validation functions
- Program mapping logic

### Backend Files

**Lambda Functions:**
- `response_enhancer.js:95` - detectConversationBranch
- `response_enhancer.js:142` - Program extraction from CTA
- `response_enhancer.js:158` - CTA filtering logic
- `response_enhancer.js:274` - enhanceResponse main function
- `index.js` - Lambda handler

**Configuration:**
- Tenant configs in S3
- Form definitions
- CTA definitions

---

## Appendix B: Test Data Sets

### Valid Test Users

```json
{
  "user1": {
    "first_name": "Chris",
    "last_name": "Miller",
    "email": "chris@example.com",
    "phone": "+15551234567",
    "program_interest": "lovebox",
    "age_confirm": "yes",
    "commitment_confirm": "yes"
  },
  "user2": {
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane.doe@example.com",
    "phone": "+15559876543",
    "program_interest": "daretodream",
    "age_confirm": "yes",
    "commitment_confirm": "yes"
  }
}
```

### Invalid Test Data

```json
{
  "invalid_emails": [
    "notanemail",
    "test@",
    "@example.com",
    "test@.com",
    "test..@example.com"
  ],
  "invalid_phones": [
    "123",
    "abc-defg",
    "55512345",
    "1234567890123456",
    "+1abc"
  ]
}
```

### Eligibility Test Cases

```json
{
  "ineligible_age": {
    "age_confirm": "no",
    "expected_exit": true
  },
  "ineligible_commitment": {
    "age_confirm": "yes",
    "commitment_confirm": "no",
    "expected_exit": true
  },
  "eligible": {
    "age_confirm": "yes",
    "commitment_confirm": "yes",
    "expected_exit": false
  }
}
```

---

## Appendix C: Troubleshooting Guide

### Common Issues

**Issue:** Session context shows empty completed_forms after submission
- **Check:** Console log "🚨 SESSION CONTEXT SAVED TO STORAGE"
- **Check:** sendMessage reads from sessionStorage not state
- **Fix:** Verify getFromSession() is used in sendMessage

**Issue:** CTA buttons not disabling when clicked
- **Check:** clickedButtonIds state in MessageBubble
- **Check:** Button ID extraction logic
- **Fix:** Verify button has valid ID (cta.id || cta.formId || cta.label)

**Issue:** Backend still sends filtered CTAs
- **Check:** Request payload includes session_context
- **Check:** Lambda logs show completedForms array
- **Fix:** Verify enhanceResponse receives sessionContext parameter

**Issue:** Duplicate forms appearing
- **Check:** Button disabled state
- **Check:** Form mode state transitions
- **Fix:** Ensure immediate button disable on click

**Issue:** Programs tracked as form IDs instead
- **Check:** recordFormCompletion program extraction logic
- **Check:** formData.program_interest field
- **Fix:** Verify program_interest field in form config

---

## Sign-off

**Test Plan Approval:**

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Test Lead | | | |
| Dev Lead | | | |
| Product Owner | | | |

**Test Execution Approval:**

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA Engineer | | | |
| Release Manager | | | |
