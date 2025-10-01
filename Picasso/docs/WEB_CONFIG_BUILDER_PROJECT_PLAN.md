# Web Config Builder - Project Plan

**Version**: 1.0
**Date**: 2025-09-30
**Status**: Planning Phase
**Owner**: TBD

---

## Executive Summary

Build a web-based configuration management tool that extends tenant configs deployed from Bubble.io with complex form structures, conversation branches, and CTAs. This hybrid approach separates simple tenant management (Bubble) from complex configuration requiring templates, validation, and visual design (Web Builder).

---

## Problem Statement

### Current Pain Points:

1. **Bubble Limitations for Complex Config**
   - Nested data structures (forms with fields, options, post-submission actions) are clunky in Bubble
   - No validation for field relationships (e.g., CTA must reference valid form_id)
   - No templates - every form built from scratch
   - Hard to visualize final structure
   - No version control or rollback capability

2. **Manual JSON Editing Issues**
   - Error-prone (typos, missing commas, invalid structure)
   - No type checking
   - Time-consuming
   - Not scalable for multiple tenants
   - Hard to maintain consistency

3. **Forms Implementation Gap**
   - Phase 1 forms implementation complete
   - Iteration 2 improvements defined
   - But no way to generate `post_submission` config for tenants
   - Manual config enhancement blocks production deployment

### Business Impact:

- **Delayed tenant onboarding** - Can't deploy forms-enabled tenants at scale
- **Support burden** - Manual config editing requires technical expertise
- **Inconsistency** - Each tenant's forms may have different patterns
- **Error risk** - Invalid configs break widget functionality

---

## Proposed Solution: Hybrid Architecture

### Architecture Overview:

```
┌─────────────────────────────────────────────┐
│ BUBBLE.IO (Existing System)                │
│                                             │
│ - Tenant registration & management         │
│ - Subscription/billing                     │
│ - Base config generation:                  │
│   • Branding (colors, fonts, logos)        │
│   • Features (uploads, streaming, etc.)    │
│   • Quick help prompts                     │
│   • Action chips                           │
│   • AWS config (KB ID, region)             │
│                                             │
│ API: deploy_tenant_stack Lambda            │
│ Output: S3 base config JSON                │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ WEB CONFIG BUILDER (New)                   │
│                                             │
│ Features:                                   │
│ - Load base config from S3                 │
│ - Template-driven form builder             │
│ - Visual field designer (drag-drop)        │
│ - CTA builder with branch visualization    │
│ - Conversation branch designer             │
│ - Real-time validation                     │
│ - Live preview (iframe)                    │
│ - Version control & rollback               │
│ - Export/import JSON                       │
│                                             │
│ Workflow:                                   │
│ 1. Select tenant (from Bubble)             │
│ 2. Load base config from S3                │
│ 3. Add/edit forms using templates          │
│ 4. Design CTAs and branches                │
│ 5. Preview in live widget                  │
│ 6. Deploy merged config to S3              │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ S3: ENHANCED CONFIG                         │
│                                             │
│ {                                           │
│   ...base config from Bubble...            │
│   "conversational_forms": {                │
│     "form_id": {                           │
│       "fields": [...],                     │
│       "post_submission": {...}             │
│     }                                       │
│   },                                        │
│   "cta_definitions": {...},                │
│   "conversation_branches": {...}           │
│ }                                           │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ PICASSO WIDGET                              │
│                                             │
│ Loads enhanced config → Forms work!        │
└─────────────────────────────────────────────┘
```

---

## Goals & Success Metrics

### Primary Goals:

1. **Enable rapid tenant onboarding** - Deploy forms-enabled tenants in <10 minutes
2. **Reduce configuration errors** - Validation prevents invalid configs from being deployed
3. **Improve consistency** - Templates ensure forms follow best practices
4. **Empower non-technical users** - Visual builder requires no JSON knowledge

### Success Metrics:

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to deploy forms-enabled tenant | <10 minutes | From Bubble deploy to forms live |
| Config validation error rate | <1% | Configs rejected by validator |
| Template usage rate | >80% | Forms built from templates vs manual |
| User satisfaction | 4.5/5 | Survey after 2 weeks of use |
| Config-related support tickets | -50% | Compared to manual JSON editing |

---

## Features & Requirements

### Phase 1: MVP (Core Functionality)

**Timeline**: 2 weeks
**Goal**: Replace manual JSON editing with basic web UI

#### Features:

1. **Authentication & Tenant Selection**
   - Integrate with Bubble JWT for authentication
   - Display tenant list (read from Bubble API or S3)
   - Select tenant to configure

2. **Config Loading & Viewing**
   - Load base config from S3 by tenant_hash
   - Display read-only view of base config (from Bubble)
   - Show editable sections (forms, CTAs, branches)

3. **Basic Form Builder**
   - Create new form from scratch
   - Add/edit/delete forms
   - Add fields manually (text input for each field property)
   - Field types: text, email, phone, select, textarea
   - Required field checkbox
   - Validation rules (basic)

4. **Form Field Editor**
   - Field properties:
     - ID, type, label, prompt, hint
     - Required flag
     - Options (for select type)
     - Eligibility gate flag + failure message
   - Reorder fields (up/down buttons)
   - Delete field

5. **Post-Submission Config**
   - Confirmation message with placeholder variables
   - Next steps (array of strings)
   - Action buttons (end_session, continue)
   - Fulfillment settings (email, recipients)

6. **Basic Validation**
   - Required fields present
   - Field IDs unique within form
   - Form IDs unique across forms
   - Select fields have options
   - Email fields have email validation regex

7. **Save & Deploy**
   - Merge base config + forms config
   - Validate merged config
   - Save to S3 (overwrite existing config)
   - Success/error feedback

#### Technical Requirements:

- **Frontend**: React SPA
- **Hosting**: S3 + CloudFront (static hosting)
- **Backend**: AWS Lambda + API Gateway
- **Storage**: S3 (configs), DynamoDB (optional for metadata)
- **Authentication**: Bubble JWT validation in Lambda

#### API Endpoints:

```
GET  /api/tenants                    # List tenants
GET  /api/config/:tenant_hash        # Load config from S3
POST /api/config/:tenant_hash        # Save enhanced config to S3
POST /api/config/:tenant_hash/validate  # Validate config before save
```

---

### Phase 2: Templates & Usability

**Timeline**: 1 week
**Goal**: Speed up form creation with templates

#### Features:

1. **Template Gallery**
   - Pre-built form templates:
     - Volunteer Application (general)
     - Donation Form
     - Contact Form
     - Support Request Form
     - Newsletter Signup
     - Event Registration
   - Template preview
   - Select and customize template

2. **Template Customization**
   - Start from template
   - Add/remove/edit fields
   - Customize messaging
   - Save as custom template (optional)

3. **Field Templates**
   - Common field patterns:
     - Name fields (first + last)
     - Contact info (email + phone)
     - Address fields
     - Age confirmation (eligibility gate)
     - Commitment confirmation (eligibility gate)
   - Drag common patterns into form

4. **Improved UX**
   - Collapsible sections
   - Better form navigation
   - Keyboard shortcuts
   - Undo/redo

---

### Phase 3: Visual Builder & Preview

**Timeline**: 2 weeks
**Goal**: Visual form design and live preview

#### Features:

1. **Drag-and-Drop Form Builder**
   - Visual canvas for form design
   - Drag fields from palette
   - Reorder fields by dragging
   - Visual field configuration (click to edit)

2. **Field Palette**
   - Field type icons (text, email, phone, select, etc.)
   - Drag field onto canvas to add
   - Visual indicators for required/optional

3. **Live Preview**
   - Embedded Picasso widget iframe
   - Real-time preview of form as you build
   - Test form flow in preview
   - See actual styling/layout

4. **CTA Builder**
   - Visual CTA designer
   - CTA list view
   - Link CTAs to forms
   - CTA styling preview

5. **Conversation Branch Designer**
   - Visual flowchart of branches
   - Drag keywords into branches
   - Connect branches to CTAs
   - Validate keyword uniqueness

6. **Validation Dashboard**
   - Real-time validation status
   - Error highlighting in UI
   - Warning/error explanations
   - Fix suggestions

---

### Phase 4: Advanced Features

**Timeline**: 1-2 weeks
**Goal**: Enterprise features for scale

#### Features:

1. **Version Control**
   - Save config versions
   - View version history
   - Compare versions (diff view)
   - Rollback to previous version
   - Version tags/notes

2. **Multi-Tenant Management**
   - Clone config from one tenant to another
   - Bulk operations (deploy to multiple tenants)
   - Tenant groups/categories
   - Search/filter tenants

3. **Export/Import**
   - Export config as JSON
   - Import config from JSON
   - Export individual forms
   - Import forms into other tenants

4. **Collaboration**
   - Multi-user access
   - Role-based permissions (admin, editor, viewer)
   - Activity log (who changed what)
   - Comments on config sections

5. **Testing & QA**
   - Test mode (separate S3 path)
   - A/B testing support (config variants)
   - Staging vs production configs
   - Automated config testing

---

## Technical Architecture

### Frontend Stack:

**Option A: React SPA (Recommended for MVP)**
```
- Framework: React 18
- State Management: Zustand or Context API
- UI Library: shadcn/ui or Chakra UI
- Form Handling: React Hook Form
- Validation: Zod
- HTTP Client: Axios
- Hosting: S3 + CloudFront
```

**Option B: Next.js (For Full Features)**
```
- Framework: Next.js 14 (App Router)
- State Management: Zustand
- UI Library: shadcn/ui
- API Routes: Next.js API routes
- Hosting: Vercel or AWS Amplify
```

### Backend Stack:

```
- Runtime: AWS Lambda (Node.js 20.x)
- API Gateway: HTTP API (v2)
- Storage: S3 (configs)
- Database: DynamoDB (optional, for metadata/versioning)
- Authentication: Custom authorizer (validate Bubble JWT)
```

### API Design:

```javascript
// GET /api/tenants
Response: {
  tenants: [
    { tenant_id, tenant_hash, chat_title, subscription_tier }
  ]
}

// GET /api/config/:tenant_hash
Response: {
  base_config: { /* from Bubble */ },
  enhanced_config: { /* forms, CTAs, branches */ },
  merged_config: { /* final merged config */ },
  metadata: { version, last_updated, updated_by }
}

// POST /api/config/:tenant_hash
Request: {
  conversational_forms: { /* ... */ },
  cta_definitions: { /* ... */ },
  conversation_branches: { /* ... */ }
}
Response: {
  success: true,
  config_url: "https://...",
  version: "1.2.3"
}

// POST /api/config/:tenant_hash/validate
Request: { /* config to validate */ }
Response: {
  valid: true,
  errors: [],
  warnings: []
}
```

### Data Model:

```typescript
// Enhanced Config Structure
interface EnhancedConfig {
  conversational_forms: Record<string, ConversationalForm>;
  cta_definitions: Record<string, CTADefinition>;
  conversation_branches: Record<string, ConversationBranch>;
  card_inventory?: CardInventory;
}

interface ConversationalForm {
  enabled: boolean;
  form_id: string;
  title: string;
  description: string;
  cta_text: string;
  trigger_phrases: string[];
  fields: FormField[];
  post_submission: PostSubmission;
}

interface FormField {
  id: string;
  type: 'text' | 'email' | 'phone' | 'select' | 'textarea' | 'number' | 'date';
  label: string;
  prompt: string;
  hint?: string;
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  eligibility_gate?: boolean;
  failure_message?: string;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
  };
}

interface PostSubmission {
  confirmation_message: string;
  next_steps: string[];
  actions: Array<{
    id: string;
    label: string;
    action: 'end_conversation' | 'continue_conversation';
  }>;
  fulfillment?: {
    method: 'email' | 'webhook' | 'dynamodb' | 'sheets';
    recipients?: string[];
    cc?: string[];
    webhook_url?: string;
    subject_template?: string;
    notification_enabled: boolean;
  };
}

interface CTADefinition {
  text: string;
  label: string;
  action: 'start_form' | 'external_link' | 'show_info';
  formId?: string;
  url?: string;
  type: 'form_trigger' | 'external_link' | 'info_request';
  style: 'primary' | 'secondary' | 'info';
}

interface ConversationBranch {
  detection_keywords: string[];
  available_ctas: {
    primary: string;
    secondary: string[];
  };
}
```

---

## Implementation Plan

### Phase 1: MVP (Weeks 1-2)

#### Week 1: Backend + Auth
- [ ] Set up AWS infrastructure (Lambda, API Gateway, S3 permissions)
- [ ] Implement authentication (Bubble JWT validation)
- [ ] Build API endpoints (GET/POST config, validate)
- [ ] Write S3 read/write logic
- [ ] Create config merge utility
- [ ] Implement validation logic

#### Week 2: Frontend Core
- [ ] Set up React project with TypeScript
- [ ] Implement authentication flow
- [ ] Build tenant selection UI
- [ ] Create config viewer (read-only base config)
- [ ] Build basic form builder UI
- [ ] Implement form field editor
- [ ] Add post-submission config UI
- [ ] Build save/deploy flow

#### Testing:
- [ ] Unit tests for validation logic
- [ ] Integration tests for API endpoints
- [ ] E2E test: Create form → Deploy → Load in widget
- [ ] Security testing (JWT validation, S3 permissions)

---

### Phase 2: Templates (Week 3)

- [ ] Design template data structure
- [ ] Create 5 pre-built form templates
- [ ] Build template gallery UI
- [ ] Implement template selection/customization
- [ ] Add field templates
- [ ] UX improvements (collapsible sections, keyboard shortcuts)

#### Testing:
- [ ] Test all templates deploy correctly
- [ ] Validate template customizations
- [ ] Ensure templates work across tenants

---

### Phase 3: Visual Builder (Weeks 4-5)

#### Week 4: Drag-Drop Builder
- [ ] Implement drag-and-drop library (dnd-kit or react-beautiful-dnd)
- [ ] Build field palette
- [ ] Create visual form canvas
- [ ] Implement field reordering
- [ ] Add visual field configuration

#### Week 5: Preview & CTAs
- [ ] Build live preview iframe
- [ ] Implement CTA builder UI
- [ ] Create conversation branch visualizer
- [ ] Build validation dashboard
- [ ] Polish UI/UX

#### Testing:
- [ ] Test drag-drop across browsers
- [ ] Validate preview accuracy
- [ ] Test CTA/branch linking

---

### Phase 4: Advanced (Weeks 6-7)

- [ ] Implement version control
- [ ] Build multi-tenant management
- [ ] Add export/import functionality
- [ ] Create collaboration features
- [ ] Build testing/QA tools

---

## Security Considerations

### Authentication & Authorization:

1. **Bubble JWT Validation**
   - Lambda authorizer validates JWT from Bubble
   - JWT must contain tenant_id or role
   - Short-lived tokens (1 hour expiry)

2. **Role-Based Access**
   - Admin: Full access to all tenants
   - Editor: Edit assigned tenants only
   - Viewer: Read-only access

3. **Tenant Isolation**
   - Users can only access tenants they're authorized for
   - S3 keys scoped by tenant_hash
   - No cross-tenant data leakage

### Data Security:

1. **S3 Permissions**
   - Lambda execution role has minimal S3 permissions
   - Read/write scoped to specific bucket/prefix
   - No public S3 access

2. **Input Validation**
   - Sanitize all user input
   - Validate config structure before save
   - Prevent path traversal in S3 keys
   - XSS prevention in preview iframe

3. **Audit Logging**
   - Log all config changes to CloudWatch
   - Track who changed what and when
   - Audit trail for compliance

---

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Config corruption** | High | Medium | Version control + validation |
| **S3 permission issues** | High | Low | IAM policy testing + least privilege |
| **Performance (large configs)** | Medium | Medium | Pagination + lazy loading |
| **Browser compatibility** | Medium | Low | Test on major browsers |
| **Bubble JWT changes** | High | Low | Abstract auth layer |
| **User adoption** | High | Medium | Good UX + documentation |

---

## Dependencies & Prerequisites

### External Dependencies:

1. **Bubble.io**
   - JWT authentication endpoint
   - Tenant API (list tenants)
   - User role/permission data

2. **AWS Services**
   - S3 bucket: `myrecruiter-picasso`
   - Lambda execution role with S3 permissions
   - API Gateway setup
   - CloudFront distribution (for frontend hosting)

3. **Existing Systems**
   - `deploy_tenant_stack` Lambda (generates base configs)
   - Picasso widget (consumes enhanced configs)
   - Forms implementation (Iteration 2 from CONVERSATIONAL_FORMS_IMPLEMENTATION_PLAN.md)

### Internal Prerequisites:

1. **Complete forms Iteration 2 implementation** (or deploy in parallel)
2. **Define config schema v1.2** (with post_submission)
3. **Document Bubble JWT format** for validation
4. **Set up development environment** (AWS credentials, S3 access)

---

## Success Criteria

### Definition of Done (Phase 1 MVP):

- [ ] User can authenticate with Bubble credentials
- [ ] User can select tenant from list
- [ ] User can load base config from S3
- [ ] User can create a form with 5+ fields
- [ ] User can configure post-submission settings
- [ ] Config validation catches common errors
- [ ] User can deploy enhanced config to S3
- [ ] Deployed config loads in Picasso widget
- [ ] Forms work end-to-end in widget
- [ ] Zero config-related errors in production

### Launch Criteria:

- [ ] All MVP features complete and tested
- [ ] Documentation written (user guide, API docs)
- [ ] Security audit passed
- [ ] Performance testing passed (load time <2s)
- [ ] 5 tenants successfully onboarded using builder
- [ ] Support team trained on builder

---

## Future Enhancements (Post-Launch)

1. **AI-Powered Form Generation**
   - Analyze KB content and suggest forms
   - Auto-generate form fields from program descriptions
   - Smart field type detection

2. **Analytics Integration**
   - Form completion rates per tenant
   - Field abandonment tracking
   - A/B test results

3. **Advanced Validation**
   - Test form flows in sandbox
   - Automated config testing
   - Regression testing for config changes

4. **Mobile App**
   - Native mobile app for config management
   - Push notifications for form submissions

5. **Integrations**
   - Direct integration with CRMs (Salesforce, HubSpot)
   - Google Sheets auto-sync
   - Zapier/Make.com webhooks

---

## Appendix

### Related Documents:

- `CONVERSATIONAL_FORMS_IMPLEMENTATION_PLAN.md` - Forms implementation (Iteration 1 + 2)
- `TENANT_CONFIG_SCHEMA.md` - Complete config schema documentation
- `Conversational_Forms_Implementation_Plan_v4.md` - Original forms plan with KB integration

### Key Stakeholders:

- **Product**: Define requirements, prioritize features
- **Engineering**: Build and deploy
- **Operations**: Support and maintain
- **Sales**: User feedback, feature requests

### Timeline Summary:

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| MVP | 2 weeks | Working form builder (basic) |
| Templates | 1 week | Template gallery + field templates |
| Visual Builder | 2 weeks | Drag-drop + live preview |
| Advanced | 1-2 weeks | Version control + collaboration |
| **Total** | **6-7 weeks** | **Production-ready builder** |

---

**Document Version**: 1.0
**Last Updated**: 2025-09-30
**Status**: Draft - Pending Product Review