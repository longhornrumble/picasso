# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 🚨 MANDATORY: Development Process

**All development work MUST follow the Standard Operating Procedure.**

📚 **Required Reading for All Agents:**
- **[SOP: Development Workflow](picasso-config-builder/docs/SOP_DEVELOPMENT_WORKFLOW.md)** - Complete workflow from requirements to production with phase-based agent orchestration
- **[Agent Responsibility Matrix](picasso-config-builder/docs/AGENT_RESPONSIBILITY_MATRIX.md)** - Agent selection guide, capabilities, and collaboration patterns

**For Orchestrator Agents:**
- Follow phase-based workflow (Phase 0-5) defined in SOP
- Use agent invocation templates for consistency
- Track phase gates and validation checkpoints
- Manage handoffs between agents with explicit input/output artifacts
- See "Standard Task Workflow" section in SOP for detailed agent workflows

**For Individual Specialized Agents:**
- Refer to your specific responsibilities in the Agent Responsibility Matrix
- Follow invocation templates when deployed
- Deliver artifacts specified in phase workflows
- Validate deliverables against success criteria

**Quick Command:** Type `/follow-sop` to load SOP context

---

## ⚠️ CRITICAL: Picasso is an EMBEDDED Widget - NEVER Use Full-Page Mode

**Picasso is 99% deployed as an embedded widget on client websites, NOT as a full-page application.**

When testing or creating test pages:
- **ALWAYS** use embedded widget mode (floating button in corner)
- **NEVER** use full-page widget mode unless explicitly requested
- Test pages must simulate a real client website with the widget embedded
- The widget should appear as a floating chat button, not take over the entire page

This is how Picasso is used in production - test accordingly.

---

## Repository Overview

This is a monorepo containing the complete Picasso AI Chat Widget ecosystem:

| Project | Description | Version | Tech Stack |
|---------|-------------|---------|------------|
| **[Picasso/](Picasso/CLAUDE.md)** | React-based chat widget frontend | v2.0.0 | React 18, ESBuild, Jest |
| **[Lambdas/lambda/](Lambdas/lambda/)** | AWS Lambda functions backend | Various | Python 3.13, Node.js 20.x |
| **[picasso-config-builder/](picasso-config-builder/CLAUDE.md)** | Web-based config management tool | v0.1.0 | React 18, TypeScript, Vitest |
| **[picasso-webscraping/](picasso-webscraping/CLAUDE.md)** | Firecrawl SDK for RAG data prep | v1.25.5 | Node.js 22+, TypeScript |
| **Infra/** | Infrastructure as code | - | - |
| **Sandbox/** | Scratch files (ignored by Git) | - | - |
| **docs/** | Legacy documentation (BERS, Lex) | - | Markdown |

### Sub-Project CLAUDE.md Files

Each project has its own detailed CLAUDE.md:
- **[Picasso/CLAUDE.md](Picasso/CLAUDE.md)** - Frontend architecture, chat providers, Lambda functions
- **[picasso-config-builder/CLAUDE.md](picasso-config-builder/CLAUDE.md)** - Config builder tool, validation, deployment
- **[picasso-webscraping/CLAUDE.md](picasso-webscraping/CLAUDE.md)** - Firecrawl SDK usage, API methods
- **[picasso-webscraping/rag-scraper/CLAUDE.md](picasso-webscraping/rag-scraper/CLAUDE.md)** - RAG scraping pipeline, S3 upload

---

## Quick Reference Commands

### Picasso Frontend (`/Picasso`)
```bash
cd Picasso
npm install                    # Install dependencies
npm run dev                    # Development server (localhost:5000)
npm run build:production       # Build for production
npm run build:staging          # Build for staging
npm test                       # Run tests
npm run typecheck              # TypeScript type checking
npm run lint                   # ESLint
```

### Picasso Config Builder (`/picasso-config-builder`)
```bash
cd picasso-config-builder
npm install                    # Install dependencies
npm run dev                    # Frontend (localhost:3000)
npm run server:dev             # S3-backed API server (localhost:3001)
npm run server:dev:mock        # Mock API server (no S3)
npm run build:production       # Build for production
npm test                       # Unit tests (Vitest)
npm run test:e2e               # E2E tests (Playwright)
npm run typecheck              # TypeScript type checking
npm run validate               # Full validation (TypeCheck + Build)
```

### Lambda Functions (`/Lambdas/lambda`)
```bash
# Python Lambda (Master_Function_Staging, Analytics, Aggregator)
cd Lambdas/lambda/[function_name]
zip -r deployment.zip . -x "*.pyc" -x "__pycache__/*" -x "test_*.py"
aws lambda update-function-code --function-name [function_name] --zip-file fileb://deployment.zip

# Node.js Lambda (Bedrock_Streaming_Handler_Staging)
cd Lambdas/lambda/Bedrock_Streaming_Handler_Staging
npm ci --production && npm run package
aws lambda update-function-code --function-name Bedrock_Streaming_Handler_Staging --zip-file fileb://deployment.zip
```

### Picasso Webscraping (`/picasso-webscraping`)
```bash
cd picasso-webscraping
npm install                    # Install dependencies
npm run build                  # Build SDK (ESM + CJS)
NODE_OPTIONS=--experimental-vm-modules npm test  # Run tests

# RAG Scraper (rag-scraper subdirectory)
cd rag-scraper
node extract-cards-from-kb.js kb.md TENANT_ID     # Extract cards from KB
node upload-to-s3-vectors.js ./output TENANT_ID   # Upload to S3 Vector DB
```

---

## Architecture Overview

### System Flow

```
User Browser
    ↓
Picasso Widget (embedded on client website)
    ↓
    ├─→ [Streaming Path - Primary 80%]
    │       ↓
    │   λ Bedrock_Streaming_Handler_Staging (Node.js 20.x)
    │       ├→ Load tenant config from S3 (cached 5 min)
    │       ├→ Invoke Bedrock with knowledge base RAG
    │       ├→ Stream response via SSE
    │       ├→ Enhance with CTAs (response_enhancer.js)
    │       └→ Handle forms (form_handler.js)
    │
    └─→ [HTTP Fallback - Secondary 20%]
            ↓
        API Gateway
            ↓
        λ Master_Function_Staging (Python 3.13)
            ├→ Validate JWT token
            ├→ Load tenant config from S3
            ├→ Route via 3-tier hierarchy
            │  ├→ Tier 1: Action chip routing
            │  ├→ Tier 2: CTA routing
            │  └→ Tier 3: Fallback navigation hub
            ├→ Invoke Bedrock (if needed)
            ├→ Audit log to DynamoDB (PII-free)
            └→ Return formatted response
```

### Lambda Functions

| Function | Runtime | Purpose | Size |
|----------|---------|---------|------|
| **Master_Function_Staging** | Python 3.13 | JWT auth, routing, forms, audit logging | 189 KB |
| **Bedrock_Streaming_Handler_Staging** | Node.js 20.x | SSE streaming, Bedrock RAG, CTA enhancement | 9.7 MB |
| **Picasso_Config_Manager** | Node.js 20.x (ESM) | Tenant config CRUD REST API | 3.4 MB |
| **deploy_tenant_stack** | Python 3.13 | Tenant onboarding, config generation | 156 KB |
| **Analytics_Function** | Python 3.x | CloudWatch log aggregation | - |
| **Aggregator_Function** | Python 3.x | Data aggregation, S3 archival | - |

### AWS Resources

**S3 Buckets:**
| Bucket | Purpose |
|--------|---------|
| `myrecruiter-picasso` | Tenant configs, mappings, embed scripts |
| `picassocode` | Frontend assets (production) |
| `picasso-config-builder-prod` | Config builder frontend |
| `kbragdocs` | RAG knowledge base documents |

**DynamoDB Tables:**
| Table | Purpose |
|-------|---------|
| `staging-recent-messages` | Recent chat messages |
| `staging-conversation-summaries` | Conversation summaries |
| `picasso-audit-staging` | Audit logs (PII-free) |
| `picasso-form-submissions` | Form data storage |
| `picasso-sms-usage` | SMS rate limiting |

**Bedrock:**
- Model: Claude 3.5 Haiku (`us.anthropic.claude-3-5-haiku-20241022-v1:0`)
- Knowledge Bases: Tenant-specific RAG sources
- Temperature: 0 (maximum factual accuracy)
- Max Tokens: 1000

---

## Tenant Configuration

### Schema Version: v1.4.1

Each tenant config (`s3://myrecruiter-picasso/tenants/{tenant_id}/{tenant_id}-config.json`) includes:

| Section | Purpose |
|---------|---------|
| `action_chips` | Quick-action buttons with explicit routing (dictionary format) |
| `conversation_branches` | Priority-based multi-turn conversation paths |
| `cta_definitions` | Call-to-action inventory (dictionary format) |
| `cta_settings` | Fallback routing configuration |
| `conversational_forms` | Data collection workflows |
| `form_settings` | Validation and behavior rules |
| `card_inventory` | Extracted actions, requirements, programs |

### Tenant Onboarding Pipeline

1. **Deploy tenant** via `deploy_tenant_stack` Lambda → Creates base config (v1.4.1 format)
2. **Scrape & refine KB** → Use Firecrawl SDK to generate knowledge base document
3. **Extract cards** → `node extract-cards-from-kb.js kb.md TENANT_ID`
4. **Define forms** → Create explicit form definitions JSON
5. **Merge to config** → Combine cards + forms into tenant config
6. **Upload to S3** → Deploy enhanced config with cards and forms

### Key Tenants

| Tenant | Hash | Type |
|--------|------|------|
| Foster Village Austin | `fo85e6a06dcdf4` | Foster care support |
| Atlanta Angels | `my87674d777bf9` | Foster care advocacy |
| Bakersfield Angels | `BAK996208` | Foster care support |

---

## Development Workflow

### Git Workflow

```bash
# 1. Branch from main
git checkout -b feature/my-feature

# 2. Make changes and test locally
npm run dev
npm test

# 3. Push and create PR
git add .
git commit -m "feat: Description of changes"
git push origin feature/my-feature

# 4. Merge to main after review

# 5. Clean up
git branch -d feature/my-feature
```

**Key Rules:**
- Never commit directly to main
- Use feature branches for all changes
- main branch = production
- Use `Sandbox/` for temporary work (ignored by Git)

### Commit Message Format

```
<type>: <description>

<optional body>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

---

## Environment Configuration

### Environments

| Environment | Detection |
|-------------|-----------|
| `development` | `localhost:*` or `?picasso-env=development` |
| `staging` | `staging.chat.myrecruiter.ai` or `?picasso-env=staging` |
| `production` | `chat.myrecruiter.ai` or explicit flag |

### Environment Variables

**Picasso Frontend:**
```env
NODE_ENV=development|staging|production
PICASSO_ENV=development|staging|production
```

**Lambda Functions:**
```env
S3_CONFIG_BUCKET=myrecruiter-picasso
DYNAMODB_AUDIT_TABLE=picasso-audit-staging
STREAMING_ENDPOINT=https://[lambda-url]/
JWT_SECRET_KEY_NAME=picasso/staging/jwt/signing-key
ENVIRONMENT=staging
BEDROCK_MODEL_ID=us.anthropic.claude-3-5-haiku-20241022-v1:0
```

**Webscraping:**
```env
FIRECRAWL_API_KEY=your-api-key
API_URL=https://api.firecrawl.dev  # or http://localhost:3002 for self-hosted
TEST_API_KEY=your-test-key
```

---

## S3 Deployment

### Protected Assets

The following assets must NEVER be deleted during S3 deployments:
- `s3://picassocode/collateral/MyRecruiterLogo.png` - Shared logo used by all tenants

**Safe S3 Sync Command:**
```bash
cd Picasso
npm run build:production

# SAFE - without --delete
aws s3 sync dist/production/ s3://picassocode/ \
  --profile chris-admin \
  --exclude "*.map" \
  --cache-control "public, max-age=31536000"

# If --delete is needed, exclude collateral
aws s3 sync dist/production/ s3://picassocode/ \
  --profile chris-admin \
  --exclude "*.map" \
  --exclude "collateral/*" \
  --cache-control "public, max-age=31536000" \
  --delete

# Verify logo is still present
aws s3 ls s3://picassocode/collateral/MyRecruiterLogo.png --profile chris-admin
```

---

## Testing

### Frontend Testing

```bash
# Picasso Widget
cd Picasso
npm test                       # Run all tests
npm run test:coverage          # Coverage report

# Config Builder
cd picasso-config-builder
npm test                       # Vitest (watch mode)
npm run test:run               # Run once
npm run test:coverage          # Coverage report
npm run test:e2e               # Playwright E2E
```

### Lambda Testing

```bash
# Master Function (Python)
cd Lambdas/lambda/Master_Function_Staging
python -m pytest
python run_security_tests.py
python run_form_tests.py

# Bedrock Streaming Handler (Node.js)
cd Lambdas/lambda/Bedrock_Streaming_Handler_Staging
npm test
npm run test:coverage
```

### Manual Testing

**CRITICAL: Always test in embedded widget mode (floating button), NOT full-page mode.**

Test pages are located in `/Picasso/`:
- `test-local-dev.html` - Development testing (Foster Village default)
- `test-austin-angels.html` - Austin Angels tenant
- `test-composite-fields.html` - Form field testing

---

## Key Features by Project

### Picasso Chat Widget (v2.0.0)
- ONE-TIME provider selection (ChatProviderOrchestrator)
- SSE streaming (~80% traffic) and HTTP fallback (~20%)
- 3-tier explicit routing (action chips → CTAs → fallback hub)
- Conversational forms with progressive collection
- XSS protection (DOMPurify)
- Multi-tenant configuration
- Responsive button system (v1.5)

### Picasso Config Builder (v0.1.0)
- Forms, CTAs, Branches, Programs editors
- Visual Flow Diagram dashboard
- Real-time validation with dependency tracking
- Pre-deployment validation
- S3 integration with backup/rollback
- Action Chips explicit routing (3-tier hierarchy)
- Content Showcase cards

### Picasso Webscraping (v1.25.5)
- Firecrawl SDK for web scraping
- Single URL scraping and full website crawling
- WebSocket support for real-time updates
- Structured data extraction (Zod schemas)
- RAG content preparation for Bedrock Knowledge Bases
- Card extraction from knowledge base documents
- S3 Vector Database upload with metadata

---

## Documentation

### Root-Level Docs (`/docs/`)
- `BERS_*.md` - Legacy BERS monitoring documentation
- `Conversational_Forms_Implementation_Plan.md` - Forms implementation
- `Lex_Project_Summary.md` - Legacy Lex integration

### Picasso Docs (`/Picasso/docs/`)
- `TENANT_CONFIG_SCHEMA.md` - Configuration specification (v1.5)
- `MIGRATION_GUIDE_V1.3_TO_V1.4.1.md` - Config migration guide
- `COMPLETE_CONVERSATIONAL_FORMS_*.md` - Forms documentation
- `PRD_ACTION_CHIPS_*.md` - Routing PRDs
- `BUBBLE_INTEGRATION_PLAYBOOK.md` - Bubble.io integration

### Config Builder Docs (`/picasso-config-builder/docs/`)
- `SOP_DEVELOPMENT_WORKFLOW.md` - Standard operating procedure
- `AGENT_RESPONSIBILITY_MATRIX.md` - Agent capabilities
- `API_DOCUMENTATION.md` - API endpoints
- `USER_GUIDE.md` - End-user documentation
- `TENANT_CONFIG_SCHEMA.md` - Schema v1.4.1

### Webscraping Docs (`/picasso-webscraping/rag-scraper/`)
- Inline documentation in CLAUDE.md
- Example scripts for various tenants

---

## Troubleshooting

### Common Issues

**Port Already in Use:**
```bash
# Check what's using a port
lsof -i :3000

# Kill the process
kill -9 <PID>
```

**Module Not Found:**
```bash
npm install
# or
rm -rf node_modules && npm install
```

**S3 Access Issues:**
```bash
aws configure
aws s3 ls s3://myrecruiter-picasso/ --profile chris-admin
```

**Lambda Deployment Issues:**
```bash
# Check function exists
aws lambda get-function --function-name [function_name]

# Check CloudWatch logs
aws logs tail /aws/lambda/[function_name] --follow
```

---

## Support & Resources

- **GitHub Repository**: https://github.com/longhornrumble/picasso
- **Lambda Functions Repo**: https://github.com/longhornrumble/lambda
- **Picasso Deployment Fixes**: `/Picasso/DEPLOYMENT_FIXES.md`
- **Claude Code Docs**: https://docs.claude.com/en/docs/claude-code/

For detailed project-specific information, refer to the CLAUDE.md files in each project directory.

---

## Version History

| Date | Change |
|------|--------|
| 2025-12-17 | Updated with comprehensive info from all sub-projects |
| 2025-12-04 | Added SOP and Agent Responsibility Matrix references |
| 2025-10-30 | Added Action Chips Explicit Routing (v1.4.1) |
| 2025-10-26 | Added 3-tier routing hierarchy |
