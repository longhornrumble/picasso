# Session Resume: Context-Based CTA Styling Implementation

## Project Overview

We are implementing **Context-Based CTA Styling** for the Picasso chat widget system. This project removes fixed `style` fields from CTA definitions and replaces them with dynamic `_position` metadata that determines styling based on context (primary vs secondary position in branch arrays).

**Key Documents**:
- PRD: `Picasso/docs/PRD_CONTEXT_BASED_CTA_STYLING.md`
- Project Plan: `Picasso/docs/PROJECT_PLAN_CONTEXT_BASED_CTA_STYLING.md`
- SOP Workflow: `picasso-config-builder/docs/SOP_DEVELOPMENT_WORKFLOW.md`

## What's Been Completed

### ✅ Phase 1: Verification and Planning
- Read and analyzed PRD and project plan documents
- Identified all files requiring modification
- Created comprehensive todo list

### ✅ Task 2.1: Backend - Add _position Metadata
**File Modified**: `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/response_enhancer.js`

Made 4 edits to add position metadata and strip legacy style field:

1. **Primary CTA in buildCtasFromBranch()** (~line 204-213):
   ```javascript
   const { style, ...cleanCta } = primaryCta;
   ctas.push({ ...cleanCta, id: primaryCtaId, _position: 'primary' });
   ```

2. **Secondary CTAs in buildCtasFromBranch()** (~line 253-256):
   ```javascript
   const { style, ...cleanCta } = cta;
   ctas.push({ ...cleanCta, id: ctaId, _position: 'secondary' });
   ```

3. **Primary CTA in detectConversationBranch()** (~line 341-357):
   ```javascript
   const { style, ...cleanCta } = primaryCta;
   ctas.push({ ...cleanCta, id: branch.available_ctas.primary, _position: 'primary' });
   ```

4. **Secondary CTAs in detectConversationBranch()** (~line 393-409):
   ```javascript
   const { style, ...cleanCta } = cta;
   ctas.push({ ...cleanCta, id: ctaId, _position: 'secondary' });
   ```

## Current Status: Task 2.2 IN PROGRESS

**Task 2.2**: Deploy test-engineer agent to create backend unit tests

**Test File to Create**: `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/__tests__/response_enhancer.test.js`

**Test Requirements** (10+ test cases):
- Primary CTAs receive `_position: 'primary'`
- Secondary CTAs receive `_position: 'secondary'`
- Legacy `style` field is stripped from all CTAs
- All other CTA properties are preserved
- Edge cases: empty arrays, no style field, form filtering, duplicates
- Framework: Jest (Node.js)
- Coverage target: >90%

## Complete Todo List

### Phase 2: Backend Implementation (Lambda)
- [x] **Task 2.1**: Add _position metadata in response_enhancer.js
- [ ] **Task 2.2**: Deploy test-engineer for backend unit tests ← **CURRENT**
- [ ] **Task 2.3**: Deploy qa-automation-specialist for backend validation

### Phase 3: Frontend Implementation (Picasso)
- [ ] **Task 3.1**: Update CTAButton.jsx to use _position instead of style
  - File: `Picasso/src/components/chat/CTAButton.jsx`
  - Changes needed:
    - Replace `cta.style` checks with `cta._position` checks
    - Map `_position: 'primary'` → CSS class `cta-primary`
    - Map `_position: 'secondary'` → CSS class `cta-secondary`
    - Remove info style handling (fallback to secondary)
    - Keep existing CSS classes (no CSS changes needed)
- [ ] **Task 3.2**: Deploy test-engineer for component tests
- [ ] **Task 3.3**: Deploy qa-automation-specialist for frontend validation

### Phase 4: Config Builder & Documentation
- [ ] **Task 4.1**: Remove style field from CTA editor
  - Location: `picasso-config-builder/src/` (find CTA editor component)
  - Remove style dropdown/selector from UI
- [ ] **Task 4.2**: Update TENANT_CONFIG_SCHEMA.md
  - Document _position metadata (internal use only)
  - Remove style field from CTA definition schema
  - Add migration notes

### Phase 5: Deployment
- [ ] **Task 5.1**: Deploy to Picasso locally for testing
- [ ] **Task 5.2**: Deploy Lambda to staging
  - Package and deploy Bedrock_Streaming_Handler_Staging
  - Verify SSE streaming still works
- [ ] **Task 5.3**: Deploy config builder to production

### Phase 6: Final Validation
- [ ] Final validation across all environments
- [ ] Git commit with all changes
- [ ] Update project documentation

## Critical User Clarifications

1. **CSS Classes**: Keep existing classes (`cta-primary`, `cta-secondary`). Do NOT use `cta-button--primary` from PRD.

2. **Styles**: Only use primary and secondary. Remove info style completely (fallback to secondary).

3. **Testing**: Follow SOP workflow - use test-engineer and qa-automation-specialist agents for all validation.

4. **Deployment Targets**:
   - Picasso: Deploy locally first
   - Lambda: Deploy to staging
   - Config Builder: Deploy to production

5. **CSS Management**: Handled by `Picasso/src/styles/theme.css` and `Picasso/src/components/chat/useCSSVariables.js` (no changes needed)

## Next Immediate Actions

1. **Resume Task 2.2**: Deploy test-engineer agent with the prompt above to create backend unit tests
2. **After tests pass**: Mark Task 2.2 complete, proceed to Task 2.3 (qa-automation-specialist)
3. **Then**: Move to frontend implementation (Task 3.1)

## Key Technical Details

- **Position Metadata**: `_position: 'primary'` or `_position: 'secondary'`
- **Style Stripping**: `const { style, ...cleanCta } = cta`
- **Functions Modified**: `buildCtasFromBranch()` and `detectConversationBranch()` in response_enhancer.js
- **Testing Framework**: Jest for backend, React Testing Library for frontend
- **SOP Compliance**: All changes must go through test-engineer → qa-automation-specialist validation

## Files to Reference

- Backend: `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/response_enhancer.js`
- Frontend: `Picasso/src/components/chat/CTAButton.jsx`
- CSS: `Picasso/src/styles/theme.css`
- Config Builder: `picasso-config-builder/src/` (locate CTA editor)
- Documentation: `Picasso/docs/TENANT_CONFIG_SCHEMA.md`
- SOP: `picasso-config-builder/docs/SOP_DEVELOPMENT_WORKFLOW.md`
