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

## 🎯 Tenant Config Optimization

After building a tenant config in the Config Builder, invoke the optimization skill to audit and fine-tune:

- **[V4.0 Config Optimization Skill](skills/V4_CONFIG_OPTIMIZATION.skill)** — 6-step playbook for V4.0 Action Selector tenants. Covers CTA audit, tone prompt cleanup, KB optimization, and verification scenarios.

**When to use:** After creating/editing a tenant config in the Config Builder. The skill audits CTA coverage, validates formatting preferences, checks KB chunking strategy, and runs test conversations.

**Reference implementation:** Austin Angels (`AUS123957`)

---

## Project Structure

This repository follows a multi-project structure:

### Core Platform
- **Picasso/** - React-based chat widget frontend (TypeScript/JSX)
- **Lambdas/lambda/** - AWS Lambda functions backend (Python/Node.js)
- **Infra/** - Infrastructure as code

### Operations & Tooling
- **picasso-config-builder/** - Internal operations tool for managing Picasso configurations (React/TypeScript/ESBuild)
- **picasso-analytics-dashboard/** - Standalone analytics dashboard (React/TypeScript/Vite) v1.1.2
- **picasso-webscraping/** - Firecrawl Node.js SDK for web scraping and RAG data preparation
- **picasso-shared-styles/** - Centralized CSS design tokens for all dashboards

### Business Tools
- **Deal_prep_level-2/** - Deal Preparation Brief generator using n8n + Claude AI + AWS (TypeScript/ESM)
- **Website Redesign/** - MyRecruiter marketing homepage (Astro 5 + Tailwind CSS), deployed to `www.myrecruiter.ai`

### Planning & Reference
- **scheduling/** - Appointment scheduling feature plan (documentation only, not yet implemented)
- **marketing_style_guide** - MyRecruiter brand colors, typography, UI component specs (single reference file, not a directory)
- **docs/** - Project documentation (admin prompts, brand skill, conversational forms, roadmap)

### Workspace
- **Sandbox/** - Scratch files (ignored by Git)
- **lambda-repo/** - Standalone clone of Lambda functions (separate git repo)
- **.firecrawl/** - Firecrawl scraping workspace and cached outputs
- **.agents/**, **.codex/**, **.cursor/** - AI tool configurations (not tracked in git)

## Commands

### Picasso Frontend
```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm run build:production

# Build for staging
npm run build:staging

# Bundle analysis
npm run build:analyze

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

### Lambda Functions
```bash
# Python Lambda deployment
# Functions: Master_Function_Staging, Analytics_Function, Aggregator_Function,
#   Analytics_Dashboard_API, Analytics_Event_Processor, Analytics_Aggregator,
#   SSO_Token_Generator, send_email, ses_event_handler, deploy_tenant_stack
cd Lambdas/lambda/[function_name]
zip -r deployment.zip . -x "*.pyc" -x "__pycache__/*"
aws lambda update-function-code --function-name [function_name] --zip-file fileb://deployment.zip

# Node.js Lambda deployment (Bedrock_Streaming_Handler_Staging, Picasso_Config_Manager)
cd Lambdas/lambda/Bedrock_Streaming_Handler_Staging
npm ci --production
npm run package
aws lambda update-function-code --function-name Bedrock_Streaming_Handler_Staging --zip-file fileb://deployment.zip
```

### Picasso Webscraping (Firecrawl SDK)
```bash
# Install dependencies
cd picasso-webscraping
npm install

# Build SDK (outputs ESM and CJS formats)
npm run build

# Run tests (requires TEST_API_KEY env var)
NODE_OPTIONS=--experimental-vm-modules npm test

# Build and publish to npm
npm run build-and-publish
```

### Picasso Analytics Dashboard
```bash
cd picasso-analytics-dashboard
npm install
npm run dev      # Development server at localhost:5173
npm run build    # Production build

# Deploy to production
aws s3 sync dist/ s3://app-myrecruiter-ai/ --delete --profile chris-admin
aws cloudfront create-invalidation --distribution-id EJ0Y6ZUIUBSAT --paths "/*"
```

**Production URL**: https://d3r39xkfb0snuq.cloudfront.net

### Picasso Config Builder
```bash
cd picasso-config-builder
npm install
npm run dev              # Development server
npm run build:production # Production build
npm run server:dev       # Backend dev server
npm run server:dev:mock  # Backend with mock data
npm run validate         # Full validation suite
npm run test:all         # All tests
npm run test:e2e         # Playwright E2E tests
npm run test:e2e:headed  # E2E with browser visible
npm run deploy:production # Deploy to S3

# Documentation automation
npm run docs:update      # Auto-update docs
npm run docs:validate    # Validate docs
```

**Infrastructure:**
- S3: `picasso-config-builder-prod`
- URL: http://picasso-config-builder-prod.s3-website-us-east-1.amazonaws.com
- Lambda API: `picasso-config-api` → https://56mwo4zatkiqzpancrkkzqr43e0nkrui.lambda-url.us-east-1.on.aws

### Deal Prep System
```bash
cd Deal_prep_level-2
npm install
npm run build         # Compile TypeScript to ES modules
npm run build:watch   # Watch mode
npm test              # Run all tests
npm run test:unit     # Unit tests only
npm run test:integration
npm run typecheck     # TypeScript checking
npm run lint          # ESLint
```

**Infrastructure:**
- n8n: `https://integrate.myrecruiter.ai` (EC2 i-04281d9886e3a6c41)
- S3: `deal-prep-artifacts`
- Webhook: `https://integrate.myrecruiter.ai/webhook/deal-prep`

### Website Redesign (Marketing Site)
```bash
cd "Website Redesign"
npm install
npm run dev      # Dev server at localhost:4321
npm run build    # Production build to dist/
npm run preview  # Preview production build
```

**Deployment:** Vercel → `www.myrecruiter.ai`
**GitHub:** https://github.com/longhornrumble/website_redesign

## Architecture Overview

### Request Flow
1. **Picasso Widget** embeds on client websites and initiates chat sessions
2. **Master_Function_Staging** validates JWT, manages state, routes requests
3. **Routing Logic**:
   - Conversational AI → Bedrock via Streaming Handler with Knowledge Base
   - Smart Response Cards → Triggered by conversation context
   - Structured forms → Conversational collection in Picasso (replacing Lex)
4. **Bedrock_Streaming_Handler_Staging** provides SSE streaming for real-time responses

### Frontend (Picasso)
- **Build System**: ESBuild with environment-specific configs
- **Source**: `Picasso/src/` is the single Picasso source directory
- **Entry Points**:
  - `Picasso/src/widget.js` - Embeddable widget
  - `Picasso/src/iframe-main.jsx` - React app loaded in iframe
- **Chat Providers**: Multiple implementations for HTTP/SSE streaming
- **Environment Detection**: Hierarchical system (config > env vars > URL params)
- **XSS Protection**: DOMPurify sanitization layer

### Backend (Lambda Functions)

**Core:**
- **Master_Function_Staging** (Python 3.13):
  - JWT authentication with blacklist support
  - Multi-tenant configuration from S3
  - DynamoDB session/audit logging
  - CORS headers per environment

- **Bedrock_Streaming_Handler_Staging** (Node.js 20.x):
  - True Lambda response streaming (`awslambda.streamifyResponse`)
  - Bedrock Agent Runtime for knowledge base RAG
  - 5-minute in-memory cache
  - Claude 4.5 Haiku default model
  - **V4.0 Action Selector** (preferred): LLM-based CTA selection — focused Haiku call after response streams, picks CTAs from `ai_available` vocabulary. Gated by `feature_flags.V4_ACTION_SELECTOR`.
  - V4.1 Pool Selection (fallback): Topic classification + deterministic CTA pool filtering via `topic_definitions` and `selection_metadata`. Active when tenant has topic_definitions but no V4_ACTION_SELECTOR flag.
  - V3.5 enhanceResponse (legacy): Branch-based routing. Active when tenant has no topic_definitions.
  - Simplified locked prompt rules: SOURCE, CONTEXT, FORMATTING, CLOSING

- **Picasso_Config_Manager** (Node.js 20.x ESM):
  - Backend API for picasso-config-builder
  - S3 tenant config CRUD operations

**Analytics Pipeline:**
- **Analytics_Dashboard_API** (Python) - Backend API for analytics dashboard (DynamoDB + Athena)
- **Analytics_Event_Processor** (Python) - SQS → S3 pipeline for analytics events
- **Analytics_Aggregator** (Python) - Hourly EventBridge-triggered data aggregation
- **Analytics_Function** (Python) - Analytics event ingestion
- **Aggregator_Function** (Python) - Legacy aggregation

**Tenant & Infrastructure:**
- **deploy_tenant_stack** (Python 3.13) - Tenant onboarding automation
- **SSO_Token_Generator** (Python) - SSO tokens for dashboard login
- **send_email** (Python) - Reusable email sending via SES
- **ses_event_handler** (Python) - SES bounce/complaint event handler

### Webscraping (Firecrawl SDK)
- **FirecrawlApp** - Main class for web scraping/crawling operations
- **Features**:
  - Single URL scraping and full website crawling
  - WebSocket support for real-time updates
  - Structured data extraction using Zod schemas
  - Multiple output formats (Markdown, HTML, screenshots)
  - Batch operations for multiple URLs
- **RAG Scraper** (`picasso-webscraping/rag-scraper`):
  - Multi-tenant content preparation for Bedrock Knowledge Bases
  - Link-aware processing for actionable chatbot responses
  - S3 storage optimization
- **Self-Hosted Server** (`picasso-webscraping/firecrawl-server`):
  - Docker Compose deployment for local usage
  - Includes API, worker, Redis, and Playwright services

### Environment Configuration

Environments: `development`, `staging`, `production`

Required environment variables for Lambdas:
- `S3_CONFIG_BUCKET` - Tenant configurations
- `DYNAMODB_AUDIT_TABLE` - Audit logs
- `DYNAMODB_BLACKLIST_TABLE` - Token blacklist
- `BEDROCK_MODEL_ID` - AI model ID

Required environment variables for Webscraping:
- `FIRECRAWL_API_KEY` - API key for Firecrawl service
- `API_URL` - API endpoint (defaults to https://api.firecrawl.dev)
- `TEST_API_KEY` - API key for running tests

## Development Workflow

Per the Developer Playbook:
1. Branch from main: `git checkout -b feature/my-feature`
2. Make changes and test locally
3. Push and create PR: `git push origin feature/my-feature`
4. Merge to main after review
5. Clean up: `git branch -d feature/my-feature`

**Key Rules:**
- Never commit directly to main
- Use feature branches for all changes
- main branch = production
- Use Sandbox/ for temporary work

## Card Extraction & Forms Workflow

### Tenant Onboarding Pipeline
1. **Deploy tenant** via `deploy_tenant_stack` Lambda → Creates base config
2. **Scrape & refine KB** → Generate knowledge base document
3. **Extract cards** → `node extract-cards-from-kb.js kb.md TENANT_ID`
4. **Define forms** → Create explicit form definitions JSON
5. **Merge to config** → Combine cards + forms into tenant config
6. **Upload to S3** → Deploy enhanced config with cards and forms

### Card Extraction Tools (picasso-webscraping/rag-scraper)
- `extract-cards-from-kb.js` - Extract actionable cards from refined KB
- `merge-cards-to-config.js` - Merge cards into tenant config
- `card-extractor.js` - Core extraction logic module

### Configuration Structure
Each tenant config includes:
- **cta_definitions**: Call-to-action buttons with action types (`start_form`, `show_info`, `external_link`, `send_query`). CTAs with `ai_available: true` form the AI's vocabulary for the action selector.
- **conversational_forms**: Explicit field definitions for in-widget data collection
- **feature_flags**: Pipeline behavior toggles. Key flag: `V4_ACTION_SELECTOR` enables LLM-based CTA selection.
- **conversation_branches**: Guided multi-step paths (legacy — used by V3.5 tenants, optional for V4.0)
- **action_chips**: Quick-action buttons with explicit routing (v1.4.1 dictionary format)
- **tone_prompt**: AI persona (who it is, not how it behaves)
- **bedrock_instructions**: Formatting preferences, custom constraints, fallback message

**V4.0 Action Selector (preferred):**
- Single focused Haiku call after response streams — reads conversation + CTA vocabulary, picks 0-4 relevant CTAs
- No topic definitions, no selection_metadata, no taxonomy — the AI makes a judgment call
- Gated by `feature_flags.V4_ACTION_SELECTOR: true`
- Config optimization skill: `docs/V4_CONFIG_OPTIMIZATION.skill`
- Reference implementation: Austin Angels (`AUS123957`)

**V4.1 Pool Selection (fallback for taxonomy tenants):**
- Topic classification → deterministic CTA pool filtering via `topic_definitions` and `selection_metadata`
- Active when tenant has `topic_definitions` but no `V4_ACTION_SELECTOR` flag

**V3.5 Branch Routing (legacy):**
- `available_actions` is **deprecated**
- Active when tenant has no `topic_definitions`

## Testing

### Frontend
```bash
# Component tests
npm test -- src/components/chat/__tests__/

# Provider tests
npm test -- src/providers/__tests__/
```

### Lambda Functions
```bash
# Python Lambda tests
cd Lambdas/lambda/Master_Function_Staging
python run_security_tests.py

# JWT validation test
python -c "from lambda_function import validate_token; print(validate_token('test_token'))"
```

## Design System

### Shared Styles (`picasso-shared-styles/`)
Centralized CSS design tokens used across all Picasso dashboards and applications.

**Key Files:**
- `src/tokens.css` - CSS custom properties (colors, spacing, shadows, typography)
- `src/tailwind-preset.js` - Tailwind CSS preset extending the tokens

**Usage:**
```css
@import '../../picasso-shared-styles/src/tokens.css';
```

### Marketing Style Guide (`marketing_style_guide`)
Brand reference document for visual consistency. All dashboard styling should align with this guide.

**Key Sections:**
- Brand Colors (Emerald palette, neutrals, accents)
- Typography (Plus Jakarta Sans, type scale)
- UI Components (buttons, cards, callouts)
- Voice & Tone guidelines

## Known Configuration Notes

- Lambda functions repo is nested: `Lambdas/lambda/`
- `lambda-repo/` is a separate git clone of the same Lambda functions — prefer `Lambdas/lambda/` for changes
- Streaming requires Lambda runtime configuration
- Cache TTL is 5 minutes for Bedrock handler
- Environment detection supports multiple sources (config, env vars, URL params)
- Firecrawl SDK requires Node.js 22.0.0+ for ES modules support
- RAG scraper examples in `picasso-webscraping/rag-scraper/` for various use cases
- Analytics dashboard deployed to S3 bucket `app-myrecruiter-ai` with CloudFront `EJ0Y6ZUIUBSAT`
- Deal_prep_level-2 and Website Redesign each have their own CLAUDE.md with project-specific guidance
- `scheduling/` contains only a planning doc — no code implemented yet
- `.firecrawl/` is a working directory for scraping operations (cached data, not source code)