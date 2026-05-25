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

## 🧠 Working Principles (always in effect)

These behavioral rules apply to every task in this repo. They counter common LLM coding failure modes — overcomplication, speculative abstraction, scope creep, satisficing.

### 1. Think Before Coding

State assumptions explicitly. If uncertain, ask. If multiple interpretations exist, present them — don't silently pick one. If a simpler approach exists, say so. If something is unclear, stop and name what's confusing rather than inventing an interpretation.

### 2. Simplicity First

Minimum code that solves the problem. No features beyond what was asked. No abstractions for single-use code. No "flexibility" or "configurability" that wasn't requested. No error handling for impossible scenarios. If you write 200 lines and it could be 50, rewrite. Ask yourself: "would a senior engineer say this is overcomplicated?"

### 3. Surgical Changes

Touch only what you must. Don't "improve" adjacent code, comments, or formatting. Don't refactor things that aren't broken. Match existing style, even if you'd do it differently. If you notice unrelated dead code, mention it — don't delete it. Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

Transform tasks into verifiable success criteria before coding. "Add validation" → "write tests for invalid inputs, then make them pass." "Fix the bug" → "write a test that reproduces it, then make it pass." For multi-step tasks, state a brief plan with per-step verify checks. Strong criteria let you loop independently; weak criteria force constant clarification.

**Full reference:** [`~/.claude/plugins/cache/karpathy-skills/andrej-karpathy-skills/1.0.0/skills/karpathy-guidelines/SKILL.md`](~/.claude/plugins/cache/karpathy-skills/andrej-karpathy-skills/1.0.0/skills/karpathy-guidelines/SKILL.md) — invoke via `/karpathy-guidelines` for the full-context version. A per-turn hook re-injects a condensed form of these on every message to counter long-session drift.

---

## 🏗️ Deployment Model & SOP (post-P0, established 2026-05-04)

The platform runs across **3 isolated AWS accounts** under one Organization. Account boundaries enforce isolation — code in dev/staging cannot reach prod resources, period. New work goes into staging first, gets validated, then promotes to prod via a per-resource cutover decision.

### Account topology

Three AWS accounts under one Organization: **prod** (hand-managed legacy; receives new resources only via deliberate Phase 2 promotion), **staging** (where features live for demos + soak; PowerUserAccess, no IAM tampering), and **dev** (engineer + AI agent iteration; destructible; AdministratorAccess).

**Account IDs, SSO profile names, and the SSO portal URL** live in the operator-local memory file `~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/reference_aws_accounts.md` (operator-local, not in this repo). Agents with checkout access typically have access to that memory file; agents without it should ask the operator.

### Deployment SOP

1. **Develop locally or in dev account**. Engineers + AI agents have AdministratorAccess in dev; can do destructive things without risk.
2. **Promote to staging via Terraform**. New resources defined in `infra/` directory. PR → CI runs `terraform plan` against staging and posts comment. Merge to `staging` long-lived branch (when created) → CI runs `apply`.
3. **Soak in staging**. Demos run against `staging.chat.myrecruiter.ai`. Validate end-to-end including dashboards, alarms, etc.
4. **Promote to prod via per-resource cutover**. NOT a `terraform import` of existing prod resources. Instead: deploy new clean-shape resources in prod alongside the existing hand-managed ones, switch traffic (tenant config, DNS, etc.), decommission old.

### Hard rules (do not violate)

- **Never `terraform apply` against the prod account during normal feature work.** Prod is hand-managed today. Phase 2 cutover decisions are explicit, gated, and rare.
- **Never share IAM roles across Lambdas.** Each Lambda gets a dedicated execution role. (lambda#44 was the result of historical sharing — don't recreate that pattern.)
- **Never share resources across environments.** No "single `picasso-X` table used by prod and staging." Use the `{name}-{env}` naming convention.
- **Do not rotate the legacy operator IAM credentials used by legacy CI workflows.** Specific credential name + rotation policy in the operator-local `reference_aws_accounts.md` memory file.
- **Always `unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN` before running terraform.** Stale exported credentials override AWS_PROFILE and trigger SSO 401 errors.

### Local Terraform usage

```bash
aws sso login --profile myrecruiter-dev          # or staging/prod
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
cd infra
AWS_PROFILE=myrecruiter-dev terraform init -reconfigure -backend-config=backend/dev.tfbackend
AWS_PROFILE=myrecruiter-dev terraform plan -var-file=envs/dev.tfvars
AWS_PROFILE=myrecruiter-dev terraform apply -var-file=envs/dev.tfvars
```

CI deploys via OIDC into per-account `GitHubActionsDeployRole`. See `.github/workflows/infra-deploy.yml`.

### Adding a new resource

1. Create or extend module under `infra/modules/<name>/`
2. Reference from `infra/main.tf`
3. Plan + apply in dev account first
4. Plan + apply in staging account
5. (Phase 2 only, with explicit gate) plan + apply in prod account

### Where the legacy commands below fit

The `Commands` section below documents direct AWS CLI deploys to prod-account resources via a legacy operator IAM profile. **Those are legacy operations against the hand-managed prod resources.** They continue to work for backward compatibility but new resources should be Terraform-managed via the SOP above. Existing prod resources stay manually managed until each is intentionally cut over.

---

## 🧬 Schema Discipline (forward-compatible reads)

**Rule:** every reader of a stored record (DynamoDB row, tenant config section, request body, S3 object, etc.) must tolerate missing fields. New fields are additive — old data without them must not crash any reader.

**How to apply:**
- Python: `item.get('field', default)` — never `item['field']` for optional fields.
- Node/TS: `item.field ?? default` or destructuring with defaults — never bracket access without nullish coalescing on optional fields.
- When a PR adds a field to a stored record type, the PR MUST add a contract / fixture test that exercises the reader against an old-shape record (without the new field). If the reader crashes on the old shape, the PR fails CI.

**Why:** dev/staging/prod are isolated by AWS account boundary; only customer data lives in prod. Code promotes forward; data does not. New code deployed to prod will encounter pre-existing prod data that lacks fields added during dev. Forward-compatible reads is the discipline that keeps account isolation safe — without it, a routine deploy can break prod.

**Reference pattern:** Issue #5's `analytics_writer_contract.json` — both Python and Node writers produce identical wire format AND the test fixture covers `attribute_not_exists` initial-state cases. Replicate this pattern whenever a stored record type changes shape.

---

## 🛡️ PII Governance Project

**Goal (verbatim user quote, 2026-05-19):** *"Design MyRecruiter/Picasso so personal information is collected intentionally, stored minimally, protected by default, separated by tenant, retained only as long as needed, and easy to disclose, export, delete, or anonymize later."*

**Operational translation:** manage the data that we control and keep it safe, while adhering to best efforts for legal compliance.

**Source of truth:** [`docs/roadmap/PII-Project/README.md`](docs/roadmap/PII-Project/README.md) (the "MyRecruiter / Picasso PII Governance Strategy and Advisory Agent Guide"). All PII project docs live under [`docs/roadmap/PII-Project/`](docs/roadmap/PII-Project/).

The sections below (Advisory Model, PII Review Triggers, Agent Routing, Employment / Hiring Trigger, Background Check Caution) are verbatim inserts from that strategy doc. The Living-Inventory PR Rule at the bottom is the only added discipline rule (closes gap G-B from the 2026-05-19 plan gaps review).

---

## Compliance and Governance Advisory Model

Compliance-related agents in this project serve an advisory role during planning, architecture, implementation, and code review.

They do not:
- make final legal determinations
- provide legal advice
- block development by default
- replace qualified legal counsel
- determine whether MyRecruiter is legally compliant

They do:
- identify privacy, consent, AI governance, nonprofit, donor, volunteer, communications, and consumer-protection risks
- recommend safer technical, product, UX, and documentation patterns
- suggest data minimization and logging controls
- flag issues that may require attorney review
- help technical agents convert risk findings into implementable work
- produce audit-friendly notes for future review

Compliance advisors should be invoked early in planning, not only after code is written.

---

## PII Review Triggers

Before production, require PII/Data Lifecycle advisory review for any feature that:
- collects name, email, phone, address, IP, session ID, or chat transcript content
- stores or displays form submissions
- sends data to Bubble, n8n, Sheets, CRM, email, SMS, analytics, or another third party
- changes logging behavior
- changes tenant identity, tenant hash, config lookup, or access control
- stores raw transcripts
- generates AI summaries, labels, scores, or classifications about a person
- sends email or SMS follow-up
- introduces user deletion/export/access workflows
- touches minors, foster care, families, health, disability, legal, financial, crisis, or background-check-related information

---

## Agent Routing

PII data flow unclear?
â pii-data-lifecycle-advisor

Privacy notice, California readiness, retention, deletion, or vendor implications?
â privacy-data-governance-advisor

Donation, volunteer, nonprofit program, tax, or supporter-facing claims?
â nonprofit-volunteer-donor-risk-advisor

Email, SMS, newsletter, reminders, donor nurture, volunteer nurture, or follow-up?
â communications-consent-advisor

AI prompt, RAG answer, summarization, classification, routing, scoring, or handoff?
â ai-governance-advisor

Need to convert findings into actual code/tests/schema changes?
â compliance-implementation-advisor

---

## Employment / Hiring Compliance Trigger

MyRecruiter/Picasso does not currently recruit employees. The current compliance scope is nonprofit volunteers, donors, supporters, and website visitors.

If any feature begins to:
- collect employee applicant data,
- screen or rank job candidates,
- recommend hiring decisions,
- process resumes,
- evaluate employment eligibility,
- conduct interview scoring,
- integrate with ATS systems for paid roles,
- or use AI for employment-related decisions,

Claude must stop and recommend creation of a dedicated Employment, FCRA, EEOC, and AI Hiring Compliance Advisor before implementation continues.

---

## Background Check Caution

Picasso should not evaluate background-check results, recommend acceptance/rejection, summarize consumer reports, or make placement recommendations based on background-check data unless qualified counsel has reviewed the workflow.

---

## Living-Inventory PR Rule

Any PR that adds (or modifies the PII shape of) a DynamoDB table, Lambda, S3 prefix, or CloudWatch log group that holds PII MUST update [`docs/roadmap/PII-Project/pii-inventory.md`](docs/roadmap/PII-Project/pii-inventory.md) in the same PR, and classify the new/changed surface against the tiers in [`docs/roadmap/PII-Project/data-classification.md`](docs/roadmap/PII-Project/data-classification.md). This keeps the inventory living (closes G-B from the 2026-05-19 plan gaps review); a snapshot inventory recreates the original failure mode.

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
# Functions: Master_Function_Staging, Aggregator_Function,
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
- **IaC IAM string-charset gotcha:** AWS IAM `aws_iam_role`/`aws_iam_policy`/`aws_iam_role_policy` `description`/`name`/`path` accept ONLY `[\t\n\r\x20-\x7E\xA1-\xFF]` (tab/LF/CR + printable ASCII + Latin-1; `§` U+00A7 OK, but em-dash `—` U+2014 / en-dash / smart-quotes are REJECTED). `terraform validate` AND `terraform plan` PASS — it fails only at the live `apply` (often a partial apply). Before committing/applying any Terraform that adds/edits IAM resources, run `grep -rnP '[^\x09\x0A\x0D\x20-\x7E\xA1-\xFF]' infra/` and fix any hit on an IAM `description`/`name` to ASCII. KMS key descriptions have no such constraint. (Cost a partial Apply-1 failure, 2026-05-19.)
- `.firecrawl/` is a working directory for scraping operations (cached data, not source code)