# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ CRITICAL: Before ANY Deployment Work
**READ `/DEPLOYMENT_FIXES.md` FIRST** - Contains hours of debugging condensed into critical fixes.
If deploying to S3 or fixing widget loading issues, that document has the exact solutions.

## Project Overview

This is a monorepo containing:
1. **Picasso Frontend** (`/Picasso`) - React-based chat widget (v2.0.0)
2. **Lambda Functions** (`/Lambdas/lambda`) - AWS Lambda backend functions
3. **Infrastructure** (`/Infra`) - Infrastructure as code
4. **Webscraping Tools** (`/picasso-webscraping`) - Firecrawl SDK for RAG data preparation
5. **Sandbox** (`/Sandbox`) - Scratch files (ignored by Git)

### Key Technologies
- **Frontend**: React 18, ESBuild, Jest, TypeScript/JSX
- **Backend**: AWS Lambda (Python 3.13, Node.js 20.x)
- **AI/ML**: AWS Bedrock (Claude 3.5 Haiku), Knowledge Bases
- **Infrastructure**: S3, DynamoDB, CloudFront, API Gateway
- **Build System**: ESBuild with environment-specific configs

## Project Structure

### Picasso Frontend (`/Picasso`)

```
Picasso/
├── src/                          # Source code (70+ files)
│   ├── widget.js                 # Embeddable widget entry point
│   ├── widget-host.js            # Widget host/iframe creation
│   ├── iframe-main.jsx           # React app entry point
│   ├── components/               # React components (15+ files)
│   │   ├── chat/                 # Chat UI components
│   │   │   ├── ChatWidget.jsx
│   │   │   ├── MessageBubble.jsx
│   │   │   ├── CTAButton.jsx
│   │   │   └── ResponseCard.jsx
│   │   └── forms/                # Form components
│   │       ├── FormFieldPrompt.jsx
│   │       └── FormCompletionCard.jsx
│   ├── context/                  # React Context providers (6 files)
│   │   ├── ChatProvider.jsx
│   │   ├── StreamingChatProvider.jsx
│   │   ├── HTTPChatProvider.jsx
│   │   └── FormModeContext.jsx
│   ├── hooks/                    # Custom hooks (5 files)
│   │   ├── useChatHistory.js
│   │   └── useFormValidation.js
│   ├── config/                   # Configuration system (17 files)
│   │   ├── environment.js        # Environment detection
│   │   ├── streaming-config.js   # Streaming configuration
│   │   └── schemas/              # Zod validation schemas
│   ├── utils/                    # Utilities (13 files)
│   │   ├── errorHandler.js
│   │   ├── security.js
│   │   ├── performance.js
│   │   └── logger.js
│   └── styles/
│       └── theme.css             # Global theme (117 KB, CSS variables)
├── dist/                         # Build outputs
│   ├── development/              # Dev build (4.5 MB, unminified)
│   ├── staging/                  # Staging build (468 KB)
│   └── production/               # Production build (484 KB)
├── docs/                         # Documentation (25+ markdown files)
│   ├── TENANT_CONFIG_SCHEMA.md
│   ├── WEB_CONFIG_BUILDER_PRD.md
│   └── MIGRATION_GUIDE_V1.3_TO_V1.4.1.md
├── dev.config.json               # Development tenant configuration (local only)
├── esbuild.config.mjs            # ESBuild configuration (reads dev.config.json)
├── jest.config.js                # Jest testing configuration
├── babel.config.js               # Babel configuration
└── package.json                  # Dependencies and scripts
```

**Key Directories Explained**:
- **`src/components`**: Reusable React components for chat UI and forms
- **`src/context`**: React Context providers for state management (no Redux)
- **`src/config`**: Multi-source environment detection and configuration
- **`src/utils`**: Error handling, security (DOMPurify), performance monitoring
- **`dist/`**: Three environment-specific builds (dev/staging/production)
- **`docs/`**: Comprehensive documentation including PRDs, schemas, and guides

### Lambda Functions (`/Lambdas/lambda`)

```
Lambdas/lambda/
├── Master_Function_Staging/           # Main orchestrator (Python 3.13)
│   ├── lambda_function.py             # Main handler (1,914 lines)
│   ├── audit_logger.py                # PII-free audit logging
│   ├── conversation_handler.py        # Conversation state management
│   ├── form_handler.py                # Form validation/submission
│   ├── intent_router.py               # 3-tier explicit routing
│   ├── tenant_config_loader.py        # S3 config loading
│   ├── test_*.py                      # Comprehensive test suite
│   └── deployment.zip                 # Latest deployment (189 KB)
├── Bedrock_Streaming_Handler_Staging/ # SSE streaming (Node.js 20.x)
│   ├── index.js                       # Main handler (778 lines)
│   ├── response_enhancer.js           # CTA injection logic
│   ├── form_handler.js                # Form mode handling
│   ├── package.json                   # AWS SDK v3 dependencies
│   ├── __tests__/                     # Jest test suite
│   └── deployment.zip                 # Latest deployment (9.7 MB)
├── Picasso_Config_Manager/            # Config CRUD (Node.js 20.x ESM)
│   ├── index.mjs                      # Main handler
│   ├── s3Operations.mjs               # S3 CRUD operations
│   ├── mergeStrategy.mjs              # Config merging
│   └── deployment.zip                 # Latest deployment (3.4 MB)
├── deploy_tenant_stack/               # Tenant onboarding (Python 3.13)
│   ├── lambda_function.py             # Config generation (700 lines)
│   ├── test_id_generation.py          # Transformation tests
│   └── templates/                     # Jinja2 embed templates
├── Analytics_Function/                # CloudWatch analytics (Python 3.x)
│   ├── lambda_function.py
│   └── cloudwatch_reader.py
└── Aggregator_Function/               # Data aggregation (Python 3.x)
    ├── lambda_function.py
    └── lifecycle_policy.json
```

**Function Responsibilities**:
- **Master_Function_Staging**: JWT auth, conversation routing, form processing, audit logging
- **Bedrock_Streaming_Handler_Staging**: SSE streaming, Bedrock integration, CTA enhancement
- **Picasso_Config_Manager**: Tenant config CRUD operations via REST API
- **deploy_tenant_stack**: Automated tenant onboarding and config generation
- **Analytics_Function**: CloudWatch log aggregation and metrics
- **Aggregator_Function**: Data aggregation and S3 archival

### Webscraping Tools (`/picasso-webscraping`)

```
picasso-webscraping/
├── src/                          # Firecrawl SDK source
├── rag-scraper/                  # RAG data preparation tools
│   ├── extract-cards-from-kb.js  # Card extraction from KB
│   ├── merge-cards-to-config.js  # Merge cards to tenant config
│   └── card-extractor.js         # Core extraction logic
├── firecrawl-server/             # Self-hosted Docker deployment
└── package.json                  # Node.js 22.0.0+ required
```

## Commands

### Picasso Frontend
```bash
# Install dependencies
cd Picasso
npm install

# Development server (localhost:5000)
npm run dev

# Build for production
npm run build:production

# Build for staging
npm run build:staging

# Bundle analysis
npm run build:analyze

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type checking
npm run typecheck

# Linting
npm run lint
```

**⚠️ CRITICAL: Protected Assets**

The following assets must NEVER be deleted during S3 deployments:
- `MyRecruiterLogo.png` - Shared logo asset hosted on S3, used by all tenants
- URL: `https://chat.myrecruiter.ai/collateral/MyRecruiterLogo.png`

This file is referenced in tenant configurations and must persist in S3 across all deployments. When using `aws s3 sync` with `--delete` flag, this file MUST be explicitly excluded.

### Lambda Functions

#### Python Lambda Deployment (Master_Function_Staging, Analytics_Function, etc.)
```bash
cd Lambdas/lambda/[function_name]

# Create deployment package
zip -r deployment.zip . -x "*.pyc" -x "__pycache__/*" -x "test_*.py" -x "*.md"

# Deploy to Lambda
aws lambda update-function-code \
  --function-name [function_name] \
  --zip-file fileb://deployment.zip \
  --profile ai-developer

# Publish version
aws lambda publish-version \
  --function-name [function_name] \
  --description "Version notes" \
  --profile ai-developer
```

#### Node.js Lambda Deployment (Bedrock_Streaming_Handler_Staging)
```bash
cd Lambdas/lambda/Bedrock_Streaming_Handler_Staging

# Install production dependencies
npm ci --production

# Create deployment package
npm run package
# Equivalent to: zip -r deployment.zip index.js response_enhancer.js form_handler.js node_modules package.json

# Deploy to Lambda
aws lambda update-function-code \
  --function-name Bedrock_Streaming_Handler_Staging \
  --zip-file fileb://deployment.zip \
  --profile ai-developer
```

#### Picasso Config Manager (ESM - Node.js 20.x)
```bash
cd Lambdas/lambda/Picasso_Config_Manager

# Install dependencies
npm ci --omit=dev

# Create deployment package
npm run package

# Deploy to Lambda
aws lambda update-function-code \
  --function-name Picasso_Config_Manager \
  --zip-file fileb://deployment.zip \
  --profile ai-developer
```

### Picasso Webscraping (Firecrawl SDK)
```bash
cd picasso-webscraping

# Install dependencies
npm install

# Build SDK (outputs ESM and CJS formats)
npm run build

# Run tests (requires TEST_API_KEY env var)
NODE_OPTIONS=--experimental-vm-modules npm test

# Build and publish to npm
npm run build-and-publish
```

### S3 Deployment (Production)

**⚠️ CRITICAL WARNING: Before deploying to S3**

DO NOT use the `--delete` flag without first ensuring protected files are excluded. The `MyRecruiterLogo.png` file (located in `collateral/` directory on S3) MUST be preserved across all deployments.

**Recommended S3 Sync Command** (with protected files):
```bash
cd Picasso

# Build production bundle
npm run build:production

# Deploy widget code to S3 (SAFE - without --delete)
aws s3 sync dist/production/ s3://picassocode/ \
  --profile chris-admin \
  --exclude "*.map" \
  --cache-control "public, max-age=31536000"

# ALTERNATIVE: If --delete is needed, explicitly exclude collateral directory
aws s3 sync dist/production/ s3://picassocode/ \
  --profile chris-admin \
  --exclude "*.map" \
  --exclude "collateral/*" \
  --cache-control "public, max-age=31536000" \
  --delete

# Verify logo is still present in S3
aws s3 ls s3://picassocode/collateral/MyRecruiterLogo.png --profile chris-admin
```

**Protected Assets in S3:**
- `s3://picassocode/collateral/MyRecruiterLogo.png` - Shared logo used by all tenants
- URL: `https://chat.myrecruiter.ai/collateral/MyRecruiterLogo.png`
- Referenced in tenant configs, must never be deleted

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

### Frontend Architecture

**Build System**: ESBuild with environment-specific configs
- **Entry Points**:
  - `src/widget.js` - Embeddable widget script (14.7 KB production)
  - `src/widget-host.js` - Iframe creation and postMessage bridge
  - `src/iframe-main.jsx` - React app loaded in iframe (375.9 KB production)

**Chat Providers**: Multiple implementations for HTTP/SSE streaming
- `ChatProvider.jsx` - Main provider with auto-orchestration
- `StreamingChatProvider.jsx` - SSE streaming support
- `HTTPChatProvider.jsx` - Standard HTTP requests
- Auto-switches based on availability

**Environment Detection**: Hierarchical system (config > env vars > URL params)
- Priority order:
  1. Config files
  2. Environment variables (`NODE_ENV`, `PICASSO_ENV`)
  3. URL parameters (`?picasso-env=staging`)
  4. Hostname patterns
  5. Build context
  6. Default fallback (production)

**XSS Protection**: DOMPurify sanitization layer
- All user-generated content sanitized
- HTML, Markdown, and link protection
- Custom allowlist for safe tags

**Conversational Forms**: All-Picasso approach (v4 - No Lex)
- Progressive field collection
- Conversational prompts
- Local validation
- Multi-channel notifications (email, SMS, webhooks)

**Responsive Button System**: Context-based CTA styling (v1.5)
- Full-width on mobile (<320px)
- Multi-column fit-content on desktop (>320px)
- Tenant-driven styling with CSS variables
- Dynamic iframe sizing with postMessage

### Backend Architecture

#### Master_Function_Staging (Python 3.13)
- **Size**: 189 KB deployment package
- **Timeout**: 300 seconds
- **Memory**: 512 MB

**Key Responsibilities**:
- JWT authentication with blacklist support
- Multi-tenant configuration from S3
- DynamoDB session/audit logging
- CORS headers per environment
- 3-tier explicit routing (action chips → CTAs → fallback hub)
- Form handling and submission processing
- Bedrock AI integration (fallback)

**Core Modules**:
| Module | Lines | Purpose |
|--------|-------|---------|
| lambda_function.py | 1,914 | Main handler |
| conversation_handler.py | 1,000+ | State management |
| audit_logger.py | 500 | PII-free logging |
| form_handler.py | 700 | Form validation |
| intent_router.py | 300 | Routing logic |
| aws_client_manager.py | 700 | AWS SDK pooling |

**Environment Variables**:
```env
S3_BUCKET=myrecruiter-picasso
CONFIG_BUCKET=myrecruiter-picasso
MESSAGES_TABLE_NAME=staging-recent-messages
SUMMARIES_TABLE_NAME=staging-conversation-summaries
AUDIT_TABLE_NAME=picasso-audit-staging
JWT_SECRET_KEY_NAME=picasso/staging/jwt/signing-key
STREAMING_ENDPOINT=https://[lambda-url]/
ENVIRONMENT=staging
JWT_EXPIRY_MINUTES=30
VERSION=1.1.2
```

**Testing**:
- Unit tests: `test_routing_hierarchy.py` (9/9 passing)
- Integration tests: `test_integration_e2e.py` (11/11 passing)
- Security tests: `run_security_tests.py`
- Form tests: `run_form_tests.py`
- Coverage: ~85-90%

#### Bedrock_Streaming_Handler_Staging (Node.js 20.x)
- **Size**: 9.7 MB deployment package (includes node_modules)
- **Timeout**: 300 seconds (5 minutes)
- **Memory**: 2048 MB

**Key Responsibilities**:
- True Lambda response streaming (`awslambda.streamifyResponse`)
- Bedrock Agent Runtime for knowledge base RAG
- SSE (Server-Sent Events) streaming to frontend
- 5-minute in-memory cache for KB and config
- Response enhancement with CTA injection (response_enhancer.js)
- Form mode handling (local validation, no Bedrock)
- Tenant config loading and caching
- Primary path (~80% of traffic)

**Configuration**:
- **Model**: Claude 3.5 Haiku (us.anthropic.claude-3-5-haiku-20241022-v1:0)
- **Temperature**: 0 (maximum factual accuracy)
- **Max Tokens**: 1000
- **Cache TTL**: 5 minutes

**Dependencies**:
- `@aws-sdk/client-bedrock-agent-runtime`: ^3.600.0
- `@aws-sdk/client-bedrock-runtime`: ^3.600.0
- `@aws-sdk/client-dynamodb`: ^3.600.0
- `@aws-sdk/client-s3`: ^3.600.0
- Jest 30.2.0 (testing)

**Testing**:
- Jest test framework
- Tests: `__tests__/test_routing_parity.js`, `test-enhancer.js`
- Coverage: 84%+ of critical paths
- Commands: `npm test`, `npm run test:coverage`

#### Picasso_Config_Manager (Node.js 20.x ESM)
- **Size**: 3.4 MB deployment package
- **Timeout**: 60 seconds
- **Memory**: 256 MB

**Endpoints**:
- `GET /config/tenants` - List all tenant configs
- `GET /config/{tenant_id}` - Load specific config
- `GET /config/{tenant_id}/metadata` - Tenant metadata
- `POST /config/{tenant_id}` - Save config
- `DELETE /config/{tenant_id}` - Delete config
- `GET /config/{tenant_id}/backups` - List backups
- `GET /health` - Health check

**Modules**:
- `index.mjs` - Main handler, routing, CORS
- `s3Operations.mjs` - S3 CRUD operations
- `mergeStrategy.mjs` - Config merging and validation

#### deploy_tenant_stack (Python 3.13)
- **Size**: 156 KB deployment package
- **Timeout**: 120 seconds
- **Memory**: 128 MB

**Key Responsibilities**:
- New tenant provisioning (S3, DynamoDB, CloudFront)
- Tenant configuration generation
- Action chip transformation (v1.3 → v1.4.1 format)
- Embed script generation (Jinja2 templates)
- Mapping generation (tenant_hash → tenant_id)

**Transformation**:
```python
# v1.3 (Bubble format - array)
{
  "enabled": true,
  "default_chips": [
    {"label": "Learn about Mentoring", "value": "Tell me about..."}
  ]
}

# v1.4.1 (Enhanced format - dictionary)
{
  "enabled": true,
  "default_chips": {
    "learn_about_mentoring": {
      "label": "Learn about Mentoring",
      "value": "Tell me about...",
      "target_branch": null  # Set via Web Config Builder
    }
  },
  "cta_settings": {
    "fallback_branch": null
  }
}
```

### Webscraping Architecture

**FirecrawlApp** - Main class for web scraping/crawling
- Single URL scraping and full website crawling
- WebSocket support for real-time updates
- Structured data extraction using Zod schemas
- Multiple output formats (Markdown, HTML, screenshots)
- Batch operations for multiple URLs

**RAG Scraper** (`picasso-webscraping/rag-scraper`):
- Multi-tenant content preparation for Bedrock Knowledge Bases
- Link-aware processing for actionable chatbot responses
- S3 storage optimization
- Card extraction from knowledge base documents

**Self-Hosted Server** (`picasso-webscraping/firecrawl-server`):
- Docker Compose deployment for local usage
- Includes API, worker, Redis, and Playwright services

**Environment Variables**:
```env
FIRECRAWL_API_KEY=your-api-key
API_URL=https://api.firecrawl.dev
TEST_API_KEY=your-test-key
```

### Environment Configuration

**Three Environments**: `development`, `staging`, `production`

**Frontend Environment Variables**:
```env
NODE_ENV=development|staging|production
PICASSO_ENV=development|staging|production
```

**Lambda Environment Variables**:
```env
# Master Function
S3_CONFIG_BUCKET=myrecruiter-picasso
DYNAMODB_AUDIT_TABLE=picasso-audit-staging
DYNAMODB_BLACKLIST_TABLE=picasso-token-blacklist
STREAMING_ENDPOINT=https://[lambda-url]/
JWT_SECRET_KEY_NAME=picasso/staging/jwt/signing-key
ENVIRONMENT=staging

# Bedrock Streaming Handler
CONFIG_BUCKET=myrecruiter-picasso
AWS_REGION=us-east-1
FORM_SUBMISSIONS_TABLE=picasso-form-submissions
SMS_USAGE_TABLE=picasso-sms-usage
SMS_MONTHLY_LIMIT=100

# Webscraping
FIRECRAWL_API_KEY=your-api-key
API_URL=https://api.firecrawl.dev
TEST_API_KEY=your-test-key
```

## Development Workflow

Per the Developer Playbook:

1. **Branch from main**:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes and test locally**:
   ```bash
   npm run dev  # Frontend
   npm test     # Run tests
   ```

3. **Push and create PR**:
   ```bash
   git add .
   git commit -m "feat: Description of changes"
   git push origin feature/my-feature
   ```

4. **Merge to main after review**

5. **Clean up**:
   ```bash
   git branch -d feature/my-feature
   ```

**Key Rules**:
- Never commit directly to main
- Use feature branches for all changes
- main branch = production
- Use `Sandbox/` for temporary work (ignored by Git)

## Dynamic Tenant Configuration (Development)

### Overview

The Picasso frontend includes a dynamic tenant configuration system that allows developers to easily switch between different tenant configurations during development without editing multiple files or dealing with hardcoded values.

### Configuration Files

**`dev.config.json`** - Central configuration point for development tenant selection
```json
{
  "DEFAULT_TENANT_HASH": "fo85e6a06dcdf4",
  "TENANT_NAME": "Foster Village",
  "DESCRIPTION": "Development tenant configuration - change DEFAULT_TENANT_HASH to test different tenants"
}
```

This file is read by `esbuild.config.mjs` on server startup and injects the tenant hash as a build-time variable.

### How It Works

The system uses a three-tier configuration hierarchy:

1. **Build-time default** (from `dev.config.json`) → Used in development mode only
2. **Runtime override** (from `data-tenant` attribute) → For testing specific tenants
3. **URL parameter** (`?tenant=HASH`) → For quick testing
4. **Fallback** (`my87674d777bf9` - Atlanta Angels) → If nothing else is specified

The tenant hash flows through the system:
```
dev.config.json
  ↓ (read by esbuild.config.mjs)
__DEFAULT_TENANT_HASH__
  ↓ (injected at build time)
src/config/environment.js
  ↓ (consumed by application)
Application uses tenant hash
```

### How to Switch Tenants

To switch between different tenants during development:

```bash
# 1. Edit dev.config.json
# Change "DEFAULT_TENANT_HASH" to desired tenant hash
# Example tenant hashes:
#   - fo85e6a06dcdf4 (Foster Village)
#   - my87674d777bf9 (Atlanta Angels)

# 2. Restart the dev server (required for build-time injection)
npm run dev

# 3. Server logs will confirm which tenant is loaded:
# ✅ Loaded dev config: Foster Village (fo85e6a06dcdf4)

# 4. Open browser and test
# Visit http://localhost:8000/test-local-dev.html
```

### Build-Time Injection

The `esbuild.config.mjs` configuration:

1. Reads `dev.config.json` on startup
2. Logs which tenant is being loaded for developer visibility
3. Injects `__DEFAULT_TENANT_HASH__` as a build-time variable
4. Makes the hash available to `src/config/environment.js`

This approach ensures:
- ✅ Single file to edit (`dev.config.json`)
- ✅ No hardcoded tenant hashes in source code
- ✅ Easy switching between tenants
- ✅ Clear visibility of which tenant is loaded
- ✅ Works in development mode only (production/staging use their own defaults)

### Testing Different Tenants

```bash
# Method 1: Change default tenant (requires restart)
# Edit dev.config.json, change DEFAULT_TENANT_HASH, restart server

# Method 2: Runtime override (no restart needed)
# Add data-tenant attribute to script tag in HTML
<script src="http://localhost:8000/widget.js" data-tenant="fo85e6a06dcdf4"></script>

# Method 3: URL parameter (temporary testing)
# Add ?tenant=HASH to URL
http://localhost:8000/test-local-dev.html?tenant=fo85e6a06dcdf4
```

### Verification

After restarting the dev server, verify the tenant is loaded correctly:

1. **Server logs**: Look for `✅ Loaded dev config: {TENANT_NAME} ({HASH})`
2. **Browser console**: Check for tenant hash in initialization logs
3. **Visual inspection**: Verify branding colors, logo, and welcome message
4. **Network tab**: Confirm API calls include correct `t=HASH` parameter

### Important Notes

- The `dev.config.json` file only affects **development** builds
- Staging and production use environment-specific defaults
- The dev server must be restarted after editing `dev.config.json`
- Runtime overrides (data-tenant, URL params) work without restart
- This system replaced hardcoded tenant hashes that previously existed in:
  - `src/config/environment.js`
  - `src/context/shared/messageHelpers.js`
  - Various test files

## Card Extraction & Forms Workflow

### Tenant Onboarding Pipeline

1. **Deploy tenant** via `deploy_tenant_stack` Lambda
   - Creates base config with v1.4.1 format
   - Generates embed script
   - Creates S3 bucket structure

2. **Scrape & refine KB**
   - Use Firecrawl SDK to scrape tenant website
   - Generate knowledge base document
   - Upload to S3 for Bedrock Knowledge Base

3. **Extract cards**
   ```bash
   cd picasso-webscraping/rag-scraper
   node extract-cards-from-kb.js kb.md TENANT_ID
   ```

4. **Define forms**
   - Create explicit form definitions JSON
   - Define fields, validation rules, notifications

5. **Merge to config**
   ```bash
   node merge-cards-to-config.js
   ```
   - Combine cards + forms into tenant config

6. **Upload to S3**
   ```bash
   aws s3 cp enhanced-config.json s3://myrecruiter-picasso/tenants/{tenant_id}/
   ```
   - Deploy enhanced config with cards and forms

### Card Extraction Tools

Located in `picasso-webscraping/rag-scraper`:
- `extract-cards-from-kb.js` - Extract actionable cards from refined KB
- `merge-cards-to-config.js` - Merge cards into tenant config
- `card-extractor.js` - Core extraction logic module

### Configuration Structure

Each tenant config (`s3://myrecruiter-picasso/tenants/{tenant_id}/{tenant_id}-config.json`) includes:

**Key Sections**:
- `action_chips` - Quick-action buttons with explicit routing (v1.4.1 dictionary format)
- `conversation_branches` - Multi-turn conversation paths
- `cta_definitions` - Call-to-action inventory (dictionary format)
- `cta_settings` - Fallback routing configuration
- `conversational_forms` - Data collection workflows
- `form_settings` - Validation and behavior rules
- `card_inventory` - Extracted actions, requirements, programs

**Example Action Chips (v1.4.1)**:
```json
{
  "action_chips": {
    "enabled": true,
    "default_chips": {
      "learn_about_mentoring": {
        "label": "Learn about Mentoring",
        "value": "Tell me about the mentoring program",
        "target_branch": "mentoring_program"
      },
      "volunteer": {
        "label": "🤝 Volunteer",
        "value": "I want to volunteer",
        "target_branch": "volunteer_form"
      }
    },
    "cta_settings": {
      "fallback_branch": "main_navigation_hub"
    }
  }
}
```

## Testing

### Manual Testing & Test Pages

**CRITICAL: Picasso is 99% an embedded widget, NOT a full-page application.**

When creating test pages or conducting manual testing, always test in **embedded widget mode** to reflect real-world usage. Full-page widget tests do not accurately represent how Picasso is deployed on client websites.

#### Embedded Widget Test Page Structure

Test pages should include:
1. **Host page content** - Simulates the client's website
2. **Widget script tag** - Loads Picasso as embedded widget
3. **Widget appears in corner** - Bottom-right floating button (default)
4. **No full-page takeover** - Widget should be non-intrusive

**Example: Proper Embedded Widget Test Page**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Embedded Widget Test - [TENANT_NAME]</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            padding: 40px;
            background: #f5f5f5;
        }
        h1 { color: #333; }
        .content {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 8px;
        }
    </style>
</head>
<body>
    <div class="content">
        <h1>Test Page for [TENANT_NAME]</h1>
        <p>This simulates a client website with the Picasso widget embedded.</p>
        <p>The widget should appear as a floating button in the bottom-right corner.</p>

        <!-- Instructions for testing -->
        <h2>Testing Instructions</h2>
        <ol>
            <li>Check that widget appears as floating button (not full-page)</li>
            <li>Click widget to open chat interface</li>
            <li>Verify tenant branding (colors, logo, welcome message)</li>
            <li>Test action chips and CTAs</li>
            <li>Verify responsive behavior on mobile and desktop</li>
        </ol>
    </div>

    <!-- Picasso Widget - Embedded Mode -->
    <script
        type="module"
        src="http://localhost:8000/widget.js"
        data-tenant="[TENANT_HASH]"
        data-dev="true"
    ></script>
</body>
</html>
```

#### Key Differences: Embedded vs Full-Page

| Aspect | Embedded Widget (Correct) | Full-Page (Incorrect) |
|--------|---------------------------|----------------------|
| **Visibility** | Floating button in corner | Takes over entire page |
| **User Experience** | Non-intrusive, on-demand | Always visible, blocking |
| **Real-world usage** | Matches production | Does not match production |
| **Testing value** | High - reflects actual deployment | Low - unrealistic scenario |
| **Responsive behavior** | Widget resizes independently | Page-level responsiveness |
| **Z-index testing** | Tests stacking context properly | Not applicable |

#### Existing Test Pages

Current test pages in the repository:
- `test-local-dev.html` - ✅ Embedded widget test (Foster Village default)
- `test-austin-angels.html` - Should be embedded mode
- `test-aus123957.html` - Should be embedded mode
- `test-composite-fields.html` - Should be embedded mode

**All test pages should follow the embedded widget pattern shown above.**

#### Testing Checklist for Embedded Widgets

When testing any tenant configuration:
- [ ] Widget loads as floating button (bottom-right by default)
- [ ] Widget does not interfere with host page content
- [ ] Clicking widget opens chat interface in contained iframe
- [ ] Widget can be minimized/closed without page reload
- [ ] Tenant branding applied correctly (colors, logo, fonts)
- [ ] CTAs and action chips render properly within widget
- [ ] Responsive behavior works on mobile (<768px) and desktop
- [ ] Widget remains functional when scrolling host page
- [ ] Multiple instances on same page work independently (if applicable)

#### Creating New Test Pages

When creating a new test page:
```bash
# 1. Copy the embedded widget template
cp test-local-dev.html test-[tenant-name].html

# 2. Update tenant hash and name in the HTML
# 3. Update meta description and page title
# 4. Test in browser at http://localhost:8000/test-[tenant-name].html
```

### Frontend Tests (Jest + React Testing Library)

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suites
npm test -- src/components/chat/__tests__/
npm test -- src/context/__tests__/
npm test -- src/config/__tests__/

# Watch mode
npm test -- --watch

# Verbose output
npm test -- --verbose
```

**Test Coverage Requirements**:
- Components: 80%+
- Context providers: 90%+
- Utils: 95%+
- Config: 85%+

### Lambda Function Tests

#### Master Function (Python)
```bash
cd Lambdas/lambda/Master_Function_Staging

# Run all tests
python -m pytest

# Security tests
python run_security_tests.py

# Form tests
python run_form_tests.py

# Specific test files
python -m pytest test_routing_hierarchy.py
python -m pytest test_integration_e2e.py

# JWT validation test
python -c "from lambda_function import validate_token; print(validate_token('test_token'))"
```

#### Bedrock Streaming Handler (Node.js)
```bash
cd Lambdas/lambda/Bedrock_Streaming_Handler_Staging

# Run all tests
npm test

# Coverage report
npm run test:coverage

# Watch mode
npm run test:watch

# Verbose output
npm run test:verbose
```

#### deploy_tenant_stack (Python)
```bash
cd Lambdas/lambda/deploy_tenant_stack

# Run transformation tests
python -m pytest test_id_generation.py
```

### Integration Testing

**End-to-End Flow**:
1. JWT generation and validation
2. Tenant config loading
3. Conversation routing (3-tier hierarchy)
4. Bedrock streaming response
5. CTA enhancement
6. Form submission and notification

**Test Files**:
- `Lambdas/lambda/Master_Function_Staging/test_integration_e2e.py`
- `Lambdas/lambda/Bedrock_Streaming_Handler_Staging/__tests__/test_routing_parity.js`

## Deployment Considerations

### Lambda Functions

**Master_Function_Staging**:
- Runtime: Python 3.13
- Timeout: 300 seconds (5 minutes)
- Memory: 512 MB
- Architecture: x86_64
- Handler: `lambda_function.lambda_handler`
- Versioning: Enabled (current: v10)

**Bedrock_Streaming_Handler_Staging**:
- Runtime: Node.js 20.x
- Timeout: 300 seconds (5 minutes)
- Memory: 2048 MB
- Architecture: x86_64
- Handler: `index.handler`
- Response Streaming: Enabled
- Versioning: Enabled (current: v12)

**Picasso_Config_Manager**:
- Runtime: Node.js 20.x (ESM)
- Timeout: 60 seconds
- Memory: 256 MB
- Handler: `index.handler`

**deploy_tenant_stack**:
- Runtime: Python 3.13
- Timeout: 120 seconds
- Memory: 128 MB
- Handler: `lambda_function.lambda_handler`
- Versioning: Enabled (current: v3)

### Frontend Deployment

**Build Outputs**:
- `dist/development/` - Unminified, source maps (4.5 MB)
- `dist/staging/` - Optimized (468 KB)
- `dist/production/` - Heavily optimized (484 KB)

**S3 Deployment**:
```bash
# Production bucket: picassocode
aws s3 sync dist/production/ s3://picassocode/ \
  --profile chris-admin \
  --exclude "*.map" \
  --cache-control "public, max-age=31536000" \
  --delete
```

**CloudFront Distribution**:
- Domain: `chat.myrecruiter.ai`
- Origin: S3 bucket `picassocode`
- Cache behavior: 1 year max-age
- Compression: Enabled

**Environment Detection**:
- Production: `chat.myrecruiter.ai` or explicit `?picasso-env=production`
- Staging: `staging.chat.myrecruiter.ai` or `?picasso-env=staging`
- Development: `localhost:5000` or `?picasso-env=development`

### AWS Resources

**DynamoDB Tables**:
| Table | Purpose | Function |
|-------|---------|----------|
| staging-recent-messages | Recent chat messages | Master_Function_Staging |
| staging-conversation-summaries | Conversation summaries | Master_Function_Staging |
| picasso-audit-staging | Audit logs (PII-free) | Master_Function_Staging |
| picasso-form-submissions | Form data storage | Bedrock_Streaming_Handler |
| picasso-sms-usage | SMS rate limiting | Bedrock_Streaming_Handler |
| production-picasso-analytics-daily | Daily metrics | Analytics_Function |

**S3 Buckets**:
| Bucket | Purpose |
|--------|---------|
| myrecruiter-picasso | Tenant configs, mappings, embed scripts |
| picassocode | Frontend assets (production) |
| picasso-analytics-archive | Analytics data archival |

**Secrets Manager**:
| Secret | Purpose |
|--------|---------|
| picasso/staging/jwt/signing-key | JWT token signing/verification |

**Bedrock Resources**:
- Knowledge Bases: Tenant-specific RAG sources
- Agent Runtime: Document retrieval
- Model: Claude 3.5 Haiku (us.anthropic.claude-3-5-haiku-20241022-v1:0)

**SNS/SES Integration**:
- SNS Topics: Notifications (SMS, events)
- SES: Email notifications

## Monitoring & Observability

### Frontend Monitoring
- Real-time metrics collection (ChatProvider performance, API latency)
- Health checks for all components
- Alert system with configurable thresholds
- Dashboard interface for operational visibility
- Integration with BERS monitoring framework

### Lambda Monitoring
- CloudWatch Logs for all functions
- CloudWatch Metrics (invocations, errors, duration)
- X-Ray tracing (enabled for critical paths)
- Custom metrics (form submissions, routing decisions, cache hits)

### Alerts
- Lambda error rate > 5%
- Lambda duration > 200 seconds
- JWT validation failures
- S3 config load failures
- Bedrock API errors

## Security Considerations

### Authentication & Authorization
- JWT tokens required for Master Function
- Token expiry: 30 minutes (configurable)
- Token blacklisting for revocation
- Tenant hash validation with branded types
- Secrets stored in AWS Secrets Manager

### Data Protection
- XSS protection in frontend (DOMPurify)
- CORS headers configured per environment
- PII-free audit logging
- Data encryption at rest (S3, DynamoDB)
- Data encryption in transit (TLS 1.2+)

### Compliance
- Audit trail for all interactions
- PII redaction in logs
- Data retention policies
- GDPR compliance (right to deletion)

## Known Issues & Limitations

1. ~~Frontend lacks `package.json`~~ ✅ Fixed - package.json present with all dependencies
2. Lambda functions have nested directory structure (`Lambdas/lambda/`)
3. Multiple ChatProvider implementations may cause confusion (mitigated by auto-orchestration)
4. Streaming support depends on Lambda runtime configuration
5. Cache invalidation strategy documented but manual intervention sometimes needed
6. ~~TypeScript files present but tsconfig.json needs configuration~~ ✅ Fixed - tsconfig.json configured

## Known Configuration Notes

- Lambda functions repo is nested: `Lambdas/lambda/`
- Streaming requires Lambda runtime configuration (response streaming enabled)
- Cache TTL is 5 minutes for Bedrock handler
- Environment detection supports multiple sources (config, env vars, URL params, hostname)
- TypeScript files present and tsconfig.json configured
- Firecrawl SDK requires Node.js 22.0.0+ for ES modules support
- RAG scraper examples in `picasso-webscraping/rag-scraper/` for various use cases

## Development Tips

1. **Embedded Widget Testing**: ALWAYS test in embedded widget mode (floating button), NOT full-page mode - Picasso is 99% deployed as an embedded widget
2. **Protected Files**: NEVER delete `MyRecruiterLogo.png` during builds or deployments - it's used by all tenants
3. **Tenant Configuration**: Use `dev.config.json` to switch between tenants in development (see "Dynamic Tenant Configuration" section)
4. **Environment Resolution**: Use environment resolver for consistent detection
5. **Streaming**: Check streaming availability before attempting SSE responses
6. **JWT**: Validate tokens early in request lifecycle
7. **Caching**: Monitor cache hit rates for performance optimization
8. **Type Safety**: Use typed configurations to prevent runtime errors
9. **CORS**: Test headers across different origins
10. **Error Boundaries**: Implement proper boundaries in React components
11. **Responsive Design**: Test on mobile (<320px) and desktop (>768px)
12. **Button Styling**: Use CSS variables for tenant-driven customization
13. **Form Validation**: Validate locally first, then server-side

## Conversational Forms Strategy (v4 - No Lex Integration)

### All-Picasso Approach
- **100% Conversational**: All interactions handled through natural conversation
- **KB-Driven Cards**: Smart response cards extracted from tenant's scraped content
- **Progressive Forms**: Multi-step forms with conversational prompts
- **Unified Experience**: No context switching between chat and forms

### KB-Driven Card System
Cards are automatically extracted during tenant onboarding:
- **Primary Actions**: Volunteer, donate, request support, etc.
- **Info Cards**: Contact info, locations, requirements
- **Program Cards**: Services and offerings
- **Form Triggers**: Actions that start conversational forms

### Card Strategies by Organization Type

**Qualification-First** (e.g., Atlanta Angels):
- Show requirements upfront (age 22+, 1-year commitment)
- Filter unqualified users early
- Then present program options

**Exploration-First** (e.g., Foster Village):
- Show multiple program options
- Match user interests
- Progressive disclosure of actions

### Conversational Form Architecture
Forms are handled entirely within the chat conversation:
- **Field Discovery**: Extract form fields from scraped websites
- **Conversational Prompts**: Natural language questions for each field
- **Progressive Collection**: One field at a time with validation
- **Smart Routing**: Submit to Master_Function for fulfillment
- **Multi-Channel Notifications**: Email, SMS, webhooks, Google Sheets, CRM

### Migration Path for Lex Clients
Existing Lex clients can migrate to Picasso conversational forms:
- **Preserve Fulfillment**: Keep existing Lambda handlers
- **Convert Intents**: Map Lex intents to conversational forms
- **Maintain Integrations**: Email, Google Sheets, CRM connections unchanged
- **Gradual Migration**: Run Lex and Picasso in parallel during transition

### Implementation Status
- ✅ **Day 0**: KB analysis and card extraction pipeline
- ✅ **Days 1-2**: Smart response cards with readiness scoring
- ✅ **Days 3-4**: Conversational form components
- ✅ **Day 5**: Multi-channel notifications
- ✅ **Day 6**: Bubble admin console
- ✅ **Days 7-8**: Testing and deployment
- ✅ **v1.5**: Context-based CTA styling with responsive design

See `/Picasso/docs/COMPLETE_CONVERSATIONAL_FORMS_IMPLEMENTATION_PLAN.md` for full details.

## Recent Updates

### v1.5 - Context-Based CTA Styling (2025-10-30)
- Implemented responsive button system with context-based styling
- Fixed button padding inconsistency for long text labels
- Changed flex behavior from `0 1 auto` to `0 0 auto` (no shrinking)
- Set `max-width: none` for natural button sizing
- Adjusted mobile breakpoint from 480px to 320px
- Enhanced `white-space: nowrap` with `!important` flag
- Dynamic iframe sizing with postMessage coordination

### v1.4.1 - Explicit Routing & Config Transformation (2025-10-26)
- 3-tier explicit routing hierarchy (action chips → CTAs → fallback hub)
- Action chip dictionary format with `target_branch` metadata
- CTA explicit routing via metadata
- Fallback navigation hub support
- Deprecated keyword-based detection (backward compatible)
- `deploy_tenant_stack` generates v1.4.1 configs automatically

### v2.1.0 - Bedrock Clean Separation (2025-10-26)
- Removed inline CTA language from Bedrock prompt
- Clean separation: Bedrock generates content, response_enhancer injects CTAs
- Explicit "NO CALLS-TO-ACTION" rule in Bedrock prompt
- Context-aware button injection
- Fully backward compatible

## Documentation References

### Picasso Frontend Docs (`/Picasso/docs/`)
- `TENANT_CONFIG_SCHEMA.md` - Tenant configuration specification (v1.5)
- `WEB_CONFIG_BUILDER_PRD.md` - Web-based config builder PRD
- `WEB_CONFIG_BUILDER_PROJECT_PLAN.md` - Implementation project plan
- `MIGRATION_GUIDE_V1.3_TO_V1.4.1.md` - Config migration guide
- `COMPLETE_CONVERSATIONAL_FORMS_IMPLEMENTATION_PLAN.md` - Forms implementation
- `COMPLETE_CONVERSATIONAL_FORMS_TEST_PLAN.md` - Forms testing strategy
- `COMPLETE_BUBBLE_FORM_REPORTING_INTEGRATION.md` - Bubble integration
- `BUBBLE_INTEGRATION_PLAYBOOK.md` - Bubble setup guide
- `PRD_ACTION_CHIPS_EXPLICIT_ROUTING_FALLBACK_HUB.md` - Routing PRD
- `ACTION_CHIPS_EXPLICIT_ROUTING_IMPLEMENTATION_SUMMARY.md` - Routing summary
- `FRONTEND_ACTION_CHIP_ROUTING_IMPLEMENTATION.md` - Frontend routing
- `BEDROCK_STREAMING_3_TIER_ROUTING_IMPLEMENTATION.md` - Streaming routing
- `FORMS_CONFIG_ADMIN_IMPLEMENTATION_GUIDE.md` - Admin forms guide
- `COMPLETE_PRD_Phase1B_HTTP_Fallback_Parity.md` - HTTP fallback PRD
- `COMPLETE_Lambda_Forms_CTA_Gap_Analysis.md` - Forms gap analysis

### Lambda Function Docs (`/Lambdas/lambda/`)
- `Master_Function_Staging/DEPLOYMENT_v1.4.1.md` - Master function deployment
- `Master_Function_Staging/ROUTING_IMPLEMENTATION.md` - Routing logic
- `Bedrock_Streaming_Handler_Staging/DEPLOYMENT_v2.1.0.md` - Streaming deployment
- `Bedrock_Streaming_Handler_Staging/ARCHITECTURE.md` - Streaming architecture
- `Bedrock_Streaming_Handler_Staging/API.md` - API documentation
- `deploy_tenant_stack/DEPLOYMENT_v1.4.1.md` - Tenant onboarding

## File Paths Summary

### Key Frontend Files (Absolute Paths)
| File | Path |
|------|------|
| Dev Tenant Config | `/Users/chrismiller/Desktop/Working_Folder/Picasso/dev.config.json` |
| Build Config | `/Users/chrismiller/Desktop/Working_Folder/Picasso/esbuild.config.mjs` |
| Widget Entry | `/Users/chrismiller/Desktop/Working_Folder/Picasso/src/widget.js` |
| Widget Host | `/Users/chrismiller/Desktop/Working_Folder/Picasso/src/widget-host.js` |
| React Entry | `/Users/chrismiller/Desktop/Working_Folder/Picasso/src/iframe-main.jsx` |
| Chat Provider | `/Users/chrismiller/Desktop/Working_Folder/Picasso/src/context/ChatProvider.jsx` |
| Streaming Provider | `/Users/chrismiller/Desktop/Working_Folder/Picasso/src/context/StreamingChatProvider.jsx` |
| Environment Config | `/Users/chrismiller/Desktop/Working_Folder/Picasso/src/config/environment.js` |
| Theme CSS | `/Users/chrismiller/Desktop/Working_Folder/Picasso/src/styles/theme.css` |
| Config Schema | `/Users/chrismiller/Desktop/Working_Folder/Picasso/docs/TENANT_CONFIG_SCHEMA.md` |

### Key Lambda Files (Absolute Paths)
| Function | Path |
|----------|------|
| Master Function | `/Users/chrismiller/Desktop/Working_Folder/Picasso/Lambdas/lambda/Master_Function_Staging` |
| Bedrock Streaming | `/Users/chrismiller/Desktop/Working_Folder/Picasso/Lambdas/lambda/Bedrock_Streaming_Handler_Staging` |
| Config Manager | `/Users/chrismiller/Desktop/Working_Folder/Picasso/Lambdas/lambda/Picasso_Config_Manager` |
| Tenant Deploy | `/Users/chrismiller/Desktop/Working_Folder/Picasso/Lambdas/lambda/deploy_tenant_stack` |
| Analytics | `/Users/chrismiller/Desktop/Working_Folder/Picasso/Lambdas/lambda/Analytics_Function` |
| Aggregator | `/Users/chrismiller/Desktop/Working_Folder/Picasso/Lambdas/lambda/Aggregator_Function` |

## Git Workflow

### Branch Strategy
- `main` - Production branch (protected)
- `Forms` - Current feature branch (v1.5 work)
- Feature branches: `feature/feature-name`
- Hotfix branches: `hotfix/fix-name`

### Commit Message Format
```
<type>: <description>

<optional body>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

### Current Branch Status
```
Branch: Forms (ahead of main)
Status: Active development (v1.5 features)
Recent commits:
- feat: Context-Based CTA Styling (v1.5)
- feat: Add CTA metadata passing
- feat: Date/number field types
- feat: Unified button system
- feat: Phase 1B HTTP Fallback Parity
```

## Support & Resources

- **GitHub Repository**: https://github.com/longhornrumble/picasso
- **Lambda Functions Repo**: https://github.com/longhornrumble/lambda
- **Claude Code Docs**: https://docs.claude.com/en/docs/claude-code/
- **Deployment Fixes**: `/DEPLOYMENT_FIXES.md`

For issues or questions, consult the documentation in `/Picasso/docs/` or reach out to the development team.
