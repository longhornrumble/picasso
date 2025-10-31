# Project Plan: Context-Based CTA Styling Implementation

**Project Name:** Context-Based CTA Styling
**Project Owner:** TBD
**Start Date:** TBD
**Target Completion:** 4 hours development effort
**Last Updated:** 2025-10-30

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Milestones and Phases](#milestones-and-phases)
3. [Detailed Task Breakdown](#detailed-task-breakdown)
4. [Timeline and Dependencies](#timeline-and-dependencies)
5. [Testing Strategy](#testing-strategy)
6. [Deployment Approach](#deployment-approach)
7. [Risk Assessment](#risk-assessment)
8. [Success Criteria](#success-criteria)

---

## Project Overview

### Objectives
- Remove fixed `style` field from CTA definitions
- Implement context-based styling using position metadata
- Enable CTA reusability across branches without duplication
- Simplify configuration interface and schema

### Scope
- Backend: Lambda response enhancer modifications
- Frontend: React component rendering logic updates
- Schema: Documentation and validation updates
- Config Builder: UI simplification

### Out of Scope
- Legacy migration tooling (no production customers)
- Additional position types beyond primary/secondary
- A/B testing or analytics features

### Key Deliverables
1. Updated `response_enhancer.js` with position metadata injection
2. Updated `CTAButton.jsx` with position-based rendering
3. Updated tenant configuration schema documentation
4. Updated config builder UI (wireframes)
5. Test suite covering all changes
6. Deployment documentation

---

## Milestones and Phases

### Phase 1: Planning and Design (30 minutes)
**Deliverables:**
- PRD approval
- Technical design review
- Test plan definition

**Exit Criteria:**
- All stakeholders approve PRD
- Technical approach validated
- Acceptance criteria defined

---

### Phase 2: Backend Implementation (1.5 hours)
**Deliverables:**
- Modified `response_enhancer.js` with metadata injection
- Unit tests for metadata logic
- Backend integration tests

**Exit Criteria:**
- All backend tests pass
- Position metadata correctly added to CTAs
- Legacy `style` field stripped if present
- Code review completed

---

### Phase 3: Frontend Implementation (1.5 hours)
**Deliverables:**
- Modified `CTAButton.jsx` with position-based rendering
- Component unit tests
- Visual regression tests

**Exit Criteria:**
- All frontend tests pass
- CTAs render correctly for both positions
- No visual regressions
- Code review completed

---

### Phase 4: Schema and Documentation (30 minutes)
**Deliverables:**
- Updated `TENANT_CONFIG_SCHEMA.md`
- Updated config builder wireframes
- Example configurations
- Migration notes

**Exit Criteria:**
- Documentation accurately reflects changes
- Examples validated against schema
- Config builder UI updated

---

### Phase 5: Testing and QA (1 hour)
**Deliverables:**
- End-to-end test execution
- Manual QA validation
- Bug fixes (if any)

**Exit Criteria:**
- All E2E tests pass
- Manual testing confirms expected behavior
- No critical or high-priority bugs
- Performance benchmarks met

---

### Phase 6: Deployment (30 minutes)
**Deliverables:**
- Staging deployment
- Production deployment
- Deployment verification

**Exit Criteria:**
- Successful staging deployment
- Successful production deployment
- Post-deployment smoke tests pass

---

## Detailed Task Breakdown

### 2.1 Backend: Response Enhancer Modification

#### Task 2.1.1: Implement Position Metadata Injection
**Assignee:** Backend Engineer
**Estimated Time:** 45 minutes
**Dependencies:** None

**Description:**
Modify `response_enhancer.js` to add `_position` metadata when building CTA arrays for branch responses.

**Implementation Steps:**
1. Locate the function that builds CTA arrays from branch configuration
2. Add metadata injection logic:
   ```javascript
   const buildPrimaryCTAs = (branch, config) => {
     return branch.primary_ctas.map(ctaId => {
       const cta = config.cta_inventory.find(c => c.cta_id === ctaId);
       const { style, ...cleanCta } = cta; // Strip legacy style field
       return {
         ...cleanCta,
         _position: 'primary'
       };
     });
   };

   const buildSecondaryCTAs = (branch, config) => {
     return branch.secondary_ctas.map(ctaId => {
       const cta = config.cta_inventory.find(c => c.cta_id === ctaId);
       const { style, ...cleanCta } = cta; // Strip legacy style field
       return {
         ...cleanCta,
         _position: 'secondary'
       };
     });
   };
   ```
3. Integrate into existing response builder
4. Add inline documentation

**Acceptance Criteria:**
- Primary CTAs have `_position: 'primary'`
- Secondary CTAs have `_position: 'secondary'`
- Legacy `style` field is not included in output
- All other CTA properties preserved
- Code follows existing patterns and style

**Files Modified:**
- `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/response_enhancer.js`

---

#### Task 2.1.2: Add Backend Unit Tests
**Assignee:** Backend Engineer
**Estimated Time:** 30 minutes
**Dependencies:** Task 2.1.1

**Description:**
Create comprehensive unit tests for position metadata injection logic.

**Test Cases:**
1. **Test: Primary CTA receives primary position**
   ```javascript
   test('adds primary position to primary CTAs', () => {
     const branch = { primary_ctas: ['cta1'] };
     const config = { cta_inventory: [{ cta_id: 'cta1', label: 'Test' }] };
     const result = buildPrimaryCTAs(branch, config);
     expect(result[0]._position).toBe('primary');
   });
   ```

2. **Test: Secondary CTA receives secondary position**
   ```javascript
   test('adds secondary position to secondary CTAs', () => {
     const branch = { secondary_ctas: ['cta1'] };
     const config = { cta_inventory: [{ cta_id: 'cta1', label: 'Test' }] };
     const result = buildSecondaryCTAs(branch, config);
     expect(result[0]._position).toBe('secondary');
   });
   ```

3. **Test: Legacy style field is stripped**
   ```javascript
   test('removes legacy style field from CTA', () => {
     const branch = { primary_ctas: ['cta1'] };
     const config = {
       cta_inventory: [{ cta_id: 'cta1', label: 'Test', style: 'primary' }]
     };
     const result = buildPrimaryCTAs(branch, config);
     expect(result[0].style).toBeUndefined();
     expect(result[0]._position).toBe('primary');
   });
   ```

4. **Test: All other properties preserved**
   ```javascript
   test('preserves all CTA properties except style', () => {
     const branch = { primary_ctas: ['cta1'] };
     const config = {
       cta_inventory: [{
         cta_id: 'cta1',
         label: 'Test',
         action: { type: 'navigate', url: '/test' },
         metadata: { analytics_id: 'test123' }
       }]
     };
     const result = buildPrimaryCTAs(branch, config);
     expect(result[0].cta_id).toBe('cta1');
     expect(result[0].label).toBe('Test');
     expect(result[0].action).toEqual({ type: 'navigate', url: '/test' });
     expect(result[0].metadata).toEqual({ analytics_id: 'test123' });
   });
   ```

5. **Test: Multiple CTAs processed correctly**
   ```javascript
   test('processes multiple CTAs with correct positions', () => {
     const branch = { primary_ctas: ['cta1', 'cta2'] };
     const config = {
       cta_inventory: [
         { cta_id: 'cta1', label: 'First' },
         { cta_id: 'cta2', label: 'Second' }
       ]
     };
     const result = buildPrimaryCTAs(branch, config);
     expect(result).toHaveLength(2);
     expect(result[0]._position).toBe('primary');
     expect(result[1]._position).toBe('primary');
   });
   ```

6. **Test: Empty CTA array handled**
   ```javascript
   test('handles empty CTA arrays', () => {
     const branch = { primary_ctas: [] };
     const config = { cta_inventory: [] };
     const result = buildPrimaryCTAs(branch, config);
     expect(result).toEqual([]);
   });
   ```

**Acceptance Criteria:**
- All test cases pass
- Code coverage for modified functions above 90%
- Tests run in CI/CD pipeline
- Edge cases covered

**Files Created:**
- `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/__tests__/response_enhancer.test.js` (or update existing)

---

#### Task 2.1.3: Backend Integration Testing
**Assignee:** Backend Engineer
**Estimated Time:** 15 minutes
**Dependencies:** Task 2.1.1, Task 2.1.2

**Description:**
Create integration tests that validate the full request-response flow with position metadata.

**Test Cases:**
1. **Full branch response includes position metadata**
2. **Multiple branches with different CTA configurations**
3. **Same CTA ID in different positions across branches**

**Acceptance Criteria:**
- Integration tests pass
- Response payload structure validated
- Position metadata present in SSE stream

---

### 3.1 Frontend: Component Modification

#### Task 3.1.1: Update CTAButton Component
**Assignee:** Frontend Engineer
**Estimated Time:** 30 minutes
**Dependencies:** None (can develop in parallel with backend)

**Description:**
Modify `CTAButton.jsx` to use position-based styling instead of style field.

**Implementation Steps:**
1. Locate style determination logic in `CTAButton.jsx`
2. Replace `cta.style` with `cta._position`
3. Add defensive fallback for missing position
4. Update prop types/TypeScript types
5. Add inline documentation

**Current Code (Example):**
```javascript
function CTAButton({ cta }) {
  const styleClass = `cta-button--${cta.style || 'secondary'}`;

  return (
    <button className={styleClass} onClick={() => handleAction(cta.action)}>
      {cta.label}
    </button>
  );
}
```

**New Code:**
```javascript
function CTAButton({ cta }) {
  // Determine styling based on position metadata
  // Defaults to secondary if position is missing (defensive programming)
  const position = cta._position || 'secondary';
  const styleClass = `cta-button--${position}`;

  return (
    <button className={styleClass} onClick={() => handleAction(cta.action)}>
      {cta.label}
    </button>
  );
}
```

**Acceptance Criteria:**
- Component uses `_position` for styling
- Defaults to `secondary` if `_position` missing
- No references to `style` field remain
- CSS class names unchanged (`cta-button--primary`, `cta-button--secondary`)
- Component renders without errors
- Prop types updated

**Files Modified:**
- `Picasso/src/components/chat/CTAButton.jsx`

---

#### Task 3.1.2: Add Frontend Component Tests
**Assignee:** Frontend Engineer
**Estimated Time:** 45 minutes
**Dependencies:** Task 3.1.1

**Description:**
Create comprehensive component tests for position-based rendering.

**Test Cases:**
1. **Test: Primary position renders primary styling**
   ```javascript
   test('renders primary CTA with primary styling', () => {
     const cta = {
       cta_id: 'test',
       label: 'Test CTA',
       _position: 'primary'
     };
     const { container } = render(<CTAButton cta={cta} />);
     expect(container.querySelector('.cta-button--primary')).toBeInTheDocument();
   });
   ```

2. **Test: Secondary position renders secondary styling**
   ```javascript
   test('renders secondary CTA with secondary styling', () => {
     const cta = {
       cta_id: 'test',
       label: 'Test CTA',
       _position: 'secondary'
     };
     const { container } = render(<CTAButton cta={cta} />);
     expect(container.querySelector('.cta-button--secondary')).toBeInTheDocument();
   });
   ```

3. **Test: Missing position defaults to secondary**
   ```javascript
   test('defaults to secondary styling when position missing', () => {
     const cta = {
       cta_id: 'test',
       label: 'Test CTA'
       // No _position field
     };
     const { container } = render(<CTAButton cta={cta} />);
     expect(container.querySelector('.cta-button--secondary')).toBeInTheDocument();
   });
   ```

4. **Test: Invalid position defaults to secondary**
   ```javascript
   test('defaults to secondary styling for invalid position', () => {
     const cta = {
       cta_id: 'test',
       label: 'Test CTA',
       _position: 'invalid'
     };
     const { container } = render(<CTAButton cta={cta} />);
     expect(container.querySelector('.cta-button--secondary')).toBeInTheDocument();
   });
   ```

5. **Test: Legacy style field ignored**
   ```javascript
   test('ignores legacy style field if present', () => {
     const cta = {
       cta_id: 'test',
       label: 'Test CTA',
       style: 'primary', // Legacy field
       _position: 'secondary' // Should use this
     };
     const { container } = render(<CTAButton cta={cta} />);
     expect(container.querySelector('.cta-button--secondary')).toBeInTheDocument();
   });
   ```

6. **Test: Label renders correctly**
   ```javascript
   test('renders CTA label correctly', () => {
     const cta = {
       cta_id: 'test',
       label: 'Click Me',
       _position: 'primary'
     };
     const { getByText } = render(<CTAButton cta={cta} />);
     expect(getByText('Click Me')).toBeInTheDocument();
   });
   ```

**Acceptance Criteria:**
- All test cases pass
- Component test coverage above 90%
- Tests run in CI/CD pipeline
- Snapshot tests updated (if applicable)

**Files Modified/Created:**
- `Picasso/src/components/chat/__tests__/CTAButton.test.jsx` (or update existing)

---

#### Task 3.1.3: Visual Regression Testing
**Assignee:** QA Engineer / Frontend Engineer
**Estimated Time:** 15 minutes
**Dependencies:** Task 3.1.1

**Description:**
Validate visual appearance of CTAs in both positions.

**Test Cases:**
1. Screenshot primary CTA rendering
2. Screenshot secondary CTA rendering
3. Compare against baseline screenshots
4. Validate CSS classes applied correctly
5. Validate hover states
6. Validate focus states (accessibility)

**Tools:**
- Manual browser testing
- Storybook (if available)
- Percy or similar visual regression tool (if available)

**Acceptance Criteria:**
- No visual regressions from current styling
- Primary CTAs appear as solid buttons
- Secondary CTAs appear as outline buttons
- Hover/focus states working correctly

---

### 4.1 Schema and Documentation Updates

#### Task 4.1.1: Update Tenant Configuration Schema
**Assignee:** Tech Lead / Documentation Engineer
**Estimated Time:** 20 minutes
**Dependencies:** None

**Description:**
Update `TENANT_CONFIG_SCHEMA.md` to remove `style` field and document position-based approach.

**Changes Required:**
1. Remove `style` field from CTA definition schema
2. Add note explaining context-based styling
3. Update example configurations
4. Add `_position` to runtime metadata documentation

**Before:**
```markdown
### CTA Definition Schema
- `cta_id` (string, required): Unique identifier
- `label` (string, required): Button text
- `style` (enum, required): Visual style - "primary", "secondary", "info"
- `action` (object, required): Action configuration
```

**After:**
```markdown
### CTA Definition Schema
- `cta_id` (string, required): Unique identifier
- `label` (string, required): Button text
- `action` (object, required): Action configuration

**Note:** CTA styling is determined by position in conversation branches, not by a fixed style field. The same CTA can appear as primary (solid) or secondary (outline) depending on whether it's in the `primary_ctas` or `secondary_ctas` array of a branch.

### Runtime Metadata (Added by Backend)
- `_position` (enum): "primary" or "secondary" - Added automatically based on CTA array position
```

**Acceptance Criteria:**
- Schema documentation accurate
- Examples valid
- Migration notes included
- Position-based approach clearly explained

**Files Modified:**
- `Picasso/docs/TENANT_CONFIG_SCHEMA.md`

---

#### Task 4.1.2: Update Config Builder UI
**Assignee:** Frontend Engineer / UX Designer
**Estimated Time:** 10 minutes
**Dependencies:** None

**Description:**
Remove style selection from CTA editor wireframe and add explanatory text.

**Changes Required:**
1. Remove "Style" dropdown from `cta-editor-wireframe-v2.html`
2. Add informational note below label field
3. Update form validation logic (if implemented)

**New UI Element:**
```html
<div class="form-group">
  <label for="cta-label">Label *</label>
  <input type="text" id="cta-label" required>

  <p class="help-text">
    <i class="icon-info"></i>
    CTA styling is automatically determined by its position in conversation branches
    (primary or secondary). The same CTA can be reused with different styling.
  </p>
</div>

<!-- REMOVED:
<div class="form-group">
  <label for="cta-style">Style *</label>
  <select id="cta-style">
    <option value="primary">Primary (Solid)</option>
    <option value="secondary">Secondary (Outline)</option>
  </select>
</div>
-->
```

**Acceptance Criteria:**
- Style dropdown removed
- Help text added
- Wireframe visually updated
- No broken form functionality

**Files Modified:**
- `Sandbox/cta-editor-wireframe-v2.html`

---

### 5.1 End-to-End Testing

#### Task 5.1.1: Create E2E Test Scenarios
**Assignee:** QA Engineer
**Estimated Time:** 30 minutes
**Dependencies:** All implementation tasks

**Description:**
Create and execute comprehensive end-to-end test scenarios.

**Test Scenarios:**

**Scenario 1: Single Branch with Primary CTA**
```
Given: Branch "welcome" with primary_ctas: ["learn_more"]
When: User navigates to "welcome" branch
Then:
  - CTA "Learn More" renders
  - CTA has solid styling (primary)
  - CTA is clickable
```

**Scenario 2: Single Branch with Secondary CTA**
```
Given: Branch "details" with secondary_ctas: ["go_back"]
When: User navigates to "details" branch
Then:
  - CTA "Go Back" renders
  - CTA has outline styling (secondary)
  - CTA is clickable
```

**Scenario 3: Branch with Both Primary and Secondary CTAs**
```
Given: Branch "overview" with:
  - primary_ctas: ["apply_now"]
  - secondary_ctas: ["learn_more"]
When: User navigates to "overview" branch
Then:
  - Both CTAs render
  - "Apply Now" has solid styling (primary)
  - "Learn More" has outline styling (secondary)
  - Visual hierarchy is clear
```

**Scenario 4: Same CTA in Different Positions**
```
Given:
  - Branch A with primary_ctas: ["learn_more"]
  - Branch B with secondary_ctas: ["learn_more"]
When: User navigates through Branch A then Branch B
Then:
  - "Learn More" in Branch A has solid styling
  - "Learn More" in Branch B has outline styling
  - Same label and action in both branches
```

**Scenario 5: Multiple Primary CTAs**
```
Given: Branch with primary_ctas: ["option_a", "option_b"]
When: User navigates to branch
Then:
  - Both CTAs render with solid styling
  - Visual weight is equal
```

**Scenario 6: Empty CTA Arrays**
```
Given: Branch with empty primary_ctas and secondary_ctas
When: User navigates to branch
Then:
  - No CTAs render
  - No errors in console
  - Branch message displays correctly
```

**Acceptance Criteria:**
- All scenarios pass
- No console errors
- Performance metrics within acceptable range
- Accessibility checks pass (keyboard navigation, screen readers)

---

#### Task 5.1.2: Manual QA Validation
**Assignee:** QA Engineer
**Estimated Time:** 20 minutes
**Dependencies:** Task 5.1.1

**Description:**
Manual testing checklist for visual and functional validation.

**Checklist:**
- [ ] Primary CTAs display with solid background
- [ ] Secondary CTAs display with outline/border
- [ ] Color contrast meets WCAG AA standards
- [ ] Hover states work correctly
- [ ] Focus states visible (keyboard navigation)
- [ ] Click events trigger correct actions
- [ ] Responsive design works on mobile
- [ ] Works across browsers (Chrome, Firefox, Safari)
- [ ] No visual regressions from previous styling
- [ ] CTA labels display correctly (no truncation)
- [ ] Multiple CTAs align properly
- [ ] RTL languages supported (if applicable)

**Acceptance Criteria:**
- All checklist items pass
- No critical or high-priority bugs found
- Screenshots documented for reference

---

#### Task 5.1.3: Performance Validation
**Assignee:** Backend Engineer / QA Engineer
**Estimated Time:** 10 minutes
**Dependencies:** Task 5.1.1

**Description:**
Validate that metadata injection does not impact performance.

**Metrics to Measure:**
1. **Backend Processing Time**
   - Measure response building time before changes
   - Measure response building time after changes
   - Ensure delta is less than 5ms

2. **Frontend Rendering Time**
   - Measure time to first CTA render
   - Measure time to interactive
   - Compare against baseline

3. **Payload Size**
   - Measure response payload size
   - Ensure no significant increase (metadata is small)

**Tools:**
- Lambda CloudWatch metrics
- Browser DevTools Performance tab
- Lighthouse (if applicable)

**Acceptance Criteria:**
- No performance regression
- Metadata injection adds less than 5ms
- Frontend rendering time unchanged
- Payload size increase negligible (< 1%)

---

### 6.1 Deployment

#### Task 6.1.1: Staging Deployment
**Assignee:** DevOps Engineer / Backend Engineer
**Estimated Time:** 15 minutes
**Dependencies:** All testing tasks

**Description:**
Deploy changes to staging environment for final validation.

**Deployment Steps:**
1. **Backend Deployment**
   ```bash
   cd Lambdas/lambda/Bedrock_Streaming_Handler_Staging
   npm ci --production
   npm run package
   aws lambda update-function-code \
     --function-name Bedrock_Streaming_Handler_Staging \
     --zip-file fileb://deployment.zip
   ```

2. **Frontend Deployment**
   ```bash
   cd Picasso
   npm run build:staging
   # Upload to S3 or CDN as per deployment process
   ```

3. **Smoke Testing**
   - Load staging chat widget
   - Navigate through test branches
   - Verify CTA styling
   - Check browser console for errors

**Acceptance Criteria:**
- Staging deployment successful
- Smoke tests pass
- No errors in CloudWatch logs
- No errors in browser console

---

#### Task 6.1.2: Production Deployment
**Assignee:** DevOps Engineer / Backend Engineer
**Estimated Time:** 15 minutes
**Dependencies:** Task 6.1.1

**Description:**
Deploy changes to production environment.

**Deployment Steps:**
1. **Backend Deployment**
   ```bash
   cd Lambdas/lambda/Bedrock_Streaming_Handler_Production
   npm ci --production
   npm run package
   aws lambda update-function-code \
     --function-name Bedrock_Streaming_Handler_Production \
     --zip-file fileb://deployment.zip
   ```

2. **Frontend Deployment**
   ```bash
   cd Picasso
   npm run build:production
   # Upload to production S3/CDN
   ```

3. **Post-Deployment Validation**
   - Load production chat widget
   - Navigate through test branches
   - Verify CTA styling
   - Monitor CloudWatch metrics

**Rollback Plan:**
If critical issues are detected:
1. Redeploy previous Lambda function version
2. Rollback frontend to previous build
3. Notify stakeholders
4. Investigate and fix issues
5. Re-test in staging before re-deploying

**Acceptance Criteria:**
- Production deployment successful
- Post-deployment tests pass
- No increase in error rates
- No performance degradation

---

## Timeline and Dependencies

### Gantt Chart (Text Representation)

```
Phase 1: Planning (0.5h)
├─ [====] PRD Approval (0.5h)

Phase 2: Backend (1.5h)
├─ [========] Task 2.1.1: Metadata Injection (0.75h)
├─ [======] Task 2.1.2: Unit Tests (0.5h) [depends on 2.1.1]
└─ [===] Task 2.1.3: Integration Tests (0.25h) [depends on 2.1.2]

Phase 3: Frontend (1.5h) [parallel with Phase 2]
├─ [======] Task 3.1.1: Component Update (0.5h)
├─ [========] Task 3.1.2: Component Tests (0.75h) [depends on 3.1.1]
└─ [===] Task 3.1.3: Visual Regression (0.25h) [depends on 3.1.1]

Phase 4: Documentation (0.5h) [parallel with Phases 2-3]
├─ [====] Task 4.1.1: Schema Update (0.33h)
└─ [==] Task 4.1.2: Config Builder UI (0.17h)

Phase 5: Testing (1h) [depends on Phases 2, 3]
├─ [======] Task 5.1.1: E2E Scenarios (0.5h)
├─ [====] Task 5.1.2: Manual QA (0.33h) [depends on 5.1.1]
└─ [==] Task 5.1.3: Performance (0.17h) [depends on 5.1.1]

Phase 6: Deployment (0.5h) [depends on Phase 5]
├─ [===] Task 6.1.1: Staging Deploy (0.25h)
└─ [===] Task 6.1.2: Production Deploy (0.25h) [depends on 6.1.1]

Total: ~4.0 hours (with parallel execution)
Sequential: ~5.5 hours
```

### Critical Path
1. Task 2.1.1 (Backend metadata injection) → 2.1.2 → 2.1.3
2. Task 3.1.1 (Frontend component update) → 3.1.2 → 3.1.3
3. Task 5.1.1 (E2E tests) → 5.1.2 → 5.1.3
4. Task 6.1.1 (Staging) → 6.1.2 (Production)

### Parallelization Opportunities
- Phase 2 (Backend) and Phase 3 (Frontend) can run in parallel
- Phase 4 (Documentation) can run in parallel with Phases 2-3
- Task 3.1.2 and 3.1.3 can partially overlap
- Task 5.1.2 and 5.1.3 can partially overlap

---

## Testing Strategy

### Unit Testing
**Objective:** Validate individual functions and components in isolation

**Backend Unit Tests:**
- Metadata injection logic
- Position assignment for primary CTAs
- Position assignment for secondary CTAs
- Legacy style field stripping
- Property preservation
- Edge cases (empty arrays, missing CTAs)

**Frontend Unit Tests:**
- Position-based rendering
- Default fallback behavior
- CSS class application
- Prop validation
- Legacy field handling

**Coverage Target:** 90% for modified files

---

### Integration Testing
**Objective:** Validate interaction between backend and frontend

**Test Cases:**
- Full request-response flow with position metadata
- Multiple branches with different CTA configurations
- Same CTA ID in different positions
- SSE streaming with metadata payload

**Tools:**
- Supertest (backend integration)
- React Testing Library (frontend integration)

---

### End-to-End Testing
**Objective:** Validate complete user workflows

**Test Cases:**
- Branch navigation with CTAs
- CTA click actions
- Visual hierarchy validation
- Cross-browser compatibility
- Responsive design
- Accessibility compliance

**Tools:**
- Playwright or Cypress (if available)
- Manual testing checklist

---

### Performance Testing
**Objective:** Ensure no performance degradation

**Metrics:**
- Backend processing time
- Frontend rendering time
- Payload size
- Memory usage

**Thresholds:**
- Backend processing delta < 5ms
- Frontend rendering delta < 10ms
- Payload size increase < 1%

---

### Regression Testing
**Objective:** Ensure existing functionality unchanged

**Test Cases:**
- All existing CTA functionality
- Visual appearance of other components
- Branch routing logic
- Analytics tracking

**Tools:**
- Existing test suite
- Visual regression testing (Percy/similar)

---

## Deployment Approach

### Environment Strategy
1. **Development:** Local testing with mock data
2. **Staging:** Full environment testing with real configurations
3. **Production:** Phased rollout with monitoring

### Deployment Sequence
```
┌─────────────┐
│ Development │
│   Testing   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Staging   │
│ Deployment  │
└──────┬──────┘
       │
       ├─ Smoke Tests
       ├─ Integration Tests
       └─ Manual QA
       │
       ▼
┌─────────────┐
│ Production  │
│ Deployment  │
└──────┬──────┘
       │
       ├─ Post-Deploy Tests
       ├─ Monitoring (24h)
       └─ Validation
```

### Feature Flags
**Not Required:** Changes are backward-compatible with no legacy support needed

### Rollback Strategy
1. **Automated Rollback Triggers:**
   - Error rate increase > 5%
   - Response time increase > 20%
   - 5xx errors in production

2. **Manual Rollback Process:**
   - Redeploy previous Lambda version
   - Rollback frontend build
   - Notify team via Slack/email
   - Create incident report

3. **Rollback Testing:**
   - Verify rollback in staging first
   - Document rollback steps
   - Practice rollback procedure

### Monitoring Plan
**CloudWatch Metrics:**
- Lambda invocation count
- Lambda duration
- Lambda errors
- API Gateway 4xx/5xx rates

**Frontend Monitoring:**
- JavaScript error tracking (Sentry/similar)
- Performance metrics (Web Vitals)
- User session recordings (if available)

**Alerting:**
- Error rate > 1%: Warning alert
- Error rate > 5%: Critical alert
- Response time > 3s: Warning alert

---

## Risk Assessment

### Technical Risks

#### Risk 1: Metadata Not Received by Frontend
**Probability:** Low
**Impact:** High
**Mitigation:**
- Defensive programming with fallback to secondary
- Integration tests covering payload structure
- Staging validation before production

**Contingency:**
- Frontend defaults to secondary styling
- No visual breakage occurs
- Investigate and fix in next release

---

#### Risk 2: CSS Class Conflicts
**Probability:** Very Low
**Impact:** Medium
**Mitigation:**
- Use existing CSS class names
- Visual regression testing
- Manual QA validation

**Contingency:**
- Quick CSS hotfix if needed
- Rollback to previous build

---

#### Risk 3: Performance Degradation
**Probability:** Very Low
**Impact:** Medium
**Mitigation:**
- Performance testing before deployment
- Metadata is minimal (single string field)
- CloudWatch monitoring

**Contingency:**
- Optimize metadata injection logic
- Cache CTA definitions if needed

---

### Process Risks

#### Risk 4: Incomplete Testing
**Probability:** Medium
**Impact:** High
**Mitigation:**
- Comprehensive test plan defined upfront
- Dedicated QA time allocated
- Test checklist review before deployment

**Contingency:**
- Additional QA cycle if issues found
- Delay production deployment

---

#### Risk 5: Documentation Gaps
**Probability:** Medium
**Impact:** Low
**Mitigation:**
- Documentation tasks in project plan
- Peer review of documentation
- Example configurations provided

**Contingency:**
- Post-deployment documentation updates
- FAQ based on team questions

---

### External Risks

#### Risk 6: Dependency Updates
**Probability:** Low
**Impact:** Low
**Mitigation:**
- Lock dependency versions
- Test with current dependencies only

**Contingency:**
- Pin to known working versions
- Update dependencies separately

---

## Success Criteria

### Development Success
- [ ] All code changes implemented
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Code coverage > 90% for modified files
- [ ] Code review completed and approved
- [ ] No linting errors
- [ ] TypeScript checks pass (if applicable)

### Testing Success
- [ ] All E2E tests pass
- [ ] Manual QA checklist completed
- [ ] No critical or high-priority bugs
- [ ] Performance metrics within thresholds
- [ ] Visual regression tests pass
- [ ] Accessibility checks pass

### Deployment Success
- [ ] Staging deployment successful
- [ ] Production deployment successful
- [ ] Post-deployment tests pass
- [ ] No error rate increase
- [ ] No performance degradation
- [ ] Monitoring dashboards showing healthy metrics

### Functional Success
- [ ] CTAs render with correct styling based on position
- [ ] Same CTA can be reused in different positions
- [ ] No duplicate CTAs needed for styling
- [ ] Config builder UI simplified
- [ ] Schema documentation updated
- [ ] Example configurations validated

### Business Success
- [ ] 4-hour development effort target met
- [ ] Zero production incidents
- [ ] Positive developer feedback
- [ ] Simplified configuration workflow
- [ ] Improved system maintainability

---

## Communication Plan

### Stakeholder Updates
- **Daily Standup:** Progress updates during development
- **Completion Email:** Summary sent to team after deployment
- **Documentation Share:** Schema updates shared with content team

### Status Reporting
- **Green:** On track, no issues
- **Yellow:** Minor delays or issues, mitigation in progress
- **Red:** Blocked or critical issues, escalation needed

### Escalation Path
1. **Developer Issues:** → Tech Lead
2. **Testing Issues:** → QA Lead
3. **Deployment Issues:** → DevOps Lead
4. **Critical Production Issues:** → Engineering Manager

---

## Post-Deployment Activities

### Week 1: Monitoring
- Monitor CloudWatch metrics daily
- Review error logs
- Collect user feedback
- Track performance metrics

### Week 2: Retrospective
- Team retrospective meeting
- Discuss what went well
- Identify improvements for next project
- Update project templates

### Documentation Updates
- Update internal wiki with learnings
- Create troubleshooting guide
- Document common issues and solutions

### Knowledge Transfer
- Share implementation details with team
- Conduct brown bag session if beneficial
- Update onboarding materials

---

## Appendix A: Task Assignment Matrix

| Phase | Task | Assignee Role | Est. Time |
|-------|------|--------------|-----------|
| 1 | PRD Approval | Product Owner | 0.5h |
| 2.1.1 | Backend Metadata Injection | Backend Engineer | 0.75h |
| 2.1.2 | Backend Unit Tests | Backend Engineer | 0.5h |
| 2.1.3 | Backend Integration Tests | Backend Engineer | 0.25h |
| 3.1.1 | Frontend Component Update | Frontend Engineer | 0.5h |
| 3.1.2 | Frontend Component Tests | Frontend Engineer | 0.75h |
| 3.1.3 | Visual Regression Testing | Frontend Engineer / QA | 0.25h |
| 4.1.1 | Schema Documentation | Tech Lead | 0.33h |
| 4.1.2 | Config Builder UI Update | Frontend Engineer | 0.17h |
| 5.1.1 | E2E Test Scenarios | QA Engineer | 0.5h |
| 5.1.2 | Manual QA Validation | QA Engineer | 0.33h |
| 5.1.3 | Performance Validation | Backend Engineer / QA | 0.17h |
| 6.1.1 | Staging Deployment | DevOps Engineer | 0.25h |
| 6.1.2 | Production Deployment | DevOps Engineer | 0.25h |

**Total Estimated Effort:** 4.75 hours
**With Parallelization:** ~4 hours

---

## Appendix B: Code Review Checklist

### Backend Code Review
- [ ] Metadata injection logic is correct
- [ ] Legacy style field is stripped
- [ ] All CTA properties preserved
- [ ] Error handling implemented
- [ ] Code follows existing patterns
- [ ] Performance considerations addressed
- [ ] Unit tests comprehensive
- [ ] Integration tests pass
- [ ] Code documented with comments
- [ ] No hardcoded values

### Frontend Code Review
- [ ] Position-based rendering correct
- [ ] Fallback behavior implemented
- [ ] No references to style field
- [ ] CSS classes applied correctly
- [ ] Component tests comprehensive
- [ ] Accessibility considerations
- [ ] TypeScript types updated (if applicable)
- [ ] Prop validation correct
- [ ] Code follows React best practices
- [ ] No console warnings

### Documentation Review
- [ ] Schema accurately reflects changes
- [ ] Examples are valid
- [ ] Migration notes clear
- [ ] Help text understandable
- [ ] No broken links
- [ ] Formatting consistent

---

## Appendix C: Testing Checklist

### Pre-Deployment Testing
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Manual QA checklist completed
- [ ] Performance benchmarks met
- [ ] Visual regression tests pass
- [ ] Accessibility audit pass
- [ ] Cross-browser testing complete
- [ ] Mobile responsiveness validated
- [ ] Error scenarios tested

### Post-Deployment Testing
- [ ] Smoke tests in staging
- [ ] Full regression in staging
- [ ] Smoke tests in production
- [ ] Monitoring dashboards reviewed
- [ ] Error logs checked
- [ ] Performance metrics validated

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-30 | Claude Code | Initial project plan |

---

**Sign-off:**

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Project Owner | | | |
| Tech Lead | | | |
| Backend Engineer | | | |
| Frontend Engineer | | | |
| QA Engineer | | | |
| DevOps Engineer | | | |
