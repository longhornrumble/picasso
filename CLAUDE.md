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

## Project Structure

This repository follows a multi-project structure:
- **Picasso/** - React-based chat widget frontend (TypeScript/JSX)
- **Lambdas/lambda/** - AWS Lambda functions backend (Python/Node.js)
- **Infra/** - Infrastructure as code
- **Sandbox/** - Scratch files (ignored by Git)
- **picasso-webscraping/** - Firecrawl Node.js SDK for web scraping and RAG data preparation
- **picasso-config-builder/** - Internal operations tool for managing Picasso configurations

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
# Python Lambda deployment (Master_Function_Staging, Analytics_Function, Aggregator_Function)
cd Lambdas/lambda/[function_name]
zip -r deployment.zip . -x "*.pyc" -x "__pycache__/*"
aws lambda update-function-code --function-name [function_name] --zip-file fileb://deployment.zip

# Node.js Lambda deployment (Bedrock_Streaming_Handler_Staging)
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
- **Entry Points**:
  - `src/widget-standalone.js` - Embeddable widget
  - `src/iframe-main.jsx` - React app loaded in iframe
- **Chat Providers**: Multiple implementations for HTTP/SSE streaming
- **Environment Detection**: Hierarchical system (config > env vars > URL params)
- **XSS Protection**: DOMPurify sanitization layer

### Backend (Lambda Functions)
- **Master_Function_Staging** (Python):
  - JWT authentication with blacklist support
  - Multi-tenant configuration from S3
  - DynamoDB session/audit logging
  - CORS headers per environment

- **Bedrock_Streaming_Handler_Staging** (Node.js 20.x):
  - True Lambda response streaming (`awslambda.streamifyResponse`)
  - Bedrock Agent Runtime for knowledge base RAG
  - 5-minute in-memory cache
  - Claude 3.5 Haiku default model

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
- **card_inventory**: Extracted actions, requirements, programs
- **conversational_forms**: Explicit field definitions for data collection
- **form_settings**: Global form behavior and validation

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

## Known Configuration Notes

- Lambda functions repo is nested: `Lambdas/lambda/`
- Streaming requires Lambda runtime configuration
- Cache TTL is 5 minutes for Bedrock handler
- Environment detection supports multiple sources (config, env vars, URL params)
- TypeScript files present but tsconfig.json may need configuration
- Firecrawl SDK requires Node.js 22.0.0+ for ES modules support
- RAG scraper examples in `picasso-webscraping/rag-scraper/` for various use cases