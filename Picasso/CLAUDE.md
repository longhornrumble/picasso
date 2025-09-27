# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ CRITICAL: Before ANY Deployment Work
**READ `/DEPLOYMENT_FIXES.md` FIRST** - Contains hours of debugging condensed into critical fixes.
If deploying to S3 or fixing widget loading issues, that document has the exact solutions.

## Project Overview

This repository contains the **Picasso Frontend** - a React-based chat widget with TypeScript support.

The Lambda functions supporting this widget are maintained in a separate repository:
- **Lambda Functions Repository**: https://github.com/longhornrumble/lambda

### Related Components
1. **Picasso Frontend** (`/src`) - React-based chat widget (this repository)
2. **Lambda Functions** (separate repo):
   - Master_Function_Staging - Python Lambda for JWT auth, conversation management
   - Bedrock_Streaming_Handler_Staging - Node.js Lambda for SSE streaming
   - Analytics_Function - Usage analytics and metrics
   - Aggregator_Function - Data aggregation

## Commands

### Picasso Frontend
```bash
# The frontend appears to be a Vite/React project but lacks package.json
# Configuration files are in /src/config/
# Build configuration schemas are in /src/config/schemas/
```

## Architecture

### System Flow
1. **Frontend (Picasso)** → Initiates chat sessions with tenant_hash
2. **Master_Function_Staging** → Validates JWT, manages conversations, routes requests
3. **All Interactions** → Bedrock (via Streaming Handler) with KB-driven response cards
4. **Bedrock_Streaming_Handler_Staging** → Handles SSE streaming with card enhancement
5. **Conversational Forms** → Handled entirely within Picasso chat flow

### Key Components

#### Frontend Architecture (`/src`)
- **Context Providers**: Multiple ChatProvider implementations for different streaming modes
  - `ChatProvider.jsx` - Main provider
  - `StreamingChatProvider.jsx` - SSE streaming support
  - `HTTPChatProvider.jsx` - Standard HTTP requests
- **Conversational Forms**: New form system (v4 Implementation)
  - `ConversationalFormProvider.jsx` - Form state management
  - `ResponseCard.jsx` - KB-driven smart cards
  - Progressive disclosure based on readiness scoring
- **Configuration System**: Enterprise-grade environment detection (BERS Phase 1)
  - Auto-detects environment from multiple sources
  - S3-based tenant configuration loading
  - KB-extracted card inventories per tenant
  - Sub-100ms performance target
- **Security**: Multi-layer XSS protection with DOMPurify
- **Monitoring**: Built-in observability with health checks and metrics

#### Master Function Architecture
- **JWT Authentication**: Token validation and blacklisting
- **Tenant Management**: Multi-tenant configuration from S3
- **Conversation State**: DynamoDB-backed session management
- **Bedrock Integration**: Routes all queries to AWS Bedrock for AI responses
- **Form Processing**: Handles conversational form submissions
  - Multi-channel notifications (Email, SMS, Webhooks)
  - Validation and fulfillment routing
  - Integration with existing systems (CRM, Google Sheets, etc.)
- **Audit Logging**: Comprehensive audit trail in DynamoDB
- **CORS Support**: Configurable CORS headers for cross-origin requests

#### Bedrock Streaming Handler Architecture
- **True Lambda Streaming**: Uses `awslambda.streamifyResponse` for SSE
- **Knowledge Base Integration**: Bedrock Agent Runtime for RAG
- **Response Enhancement**: Card selection based on KB inventory
  - `response_enhancer.js` matches context to available cards
  - Readiness scoring determines card timing
  - Tenant-specific card strategies (qualification_first vs exploration_first)
- **Caching Strategy**: In-memory cache with 5-minute TTL
- **Model Configuration**: Claude 3.5 Haiku as default model
- **Error Handling**: Graceful fallback to buffered responses

### Environment Configuration

The system uses hierarchical environment detection:
1. Config files (highest priority)
2. Environment variables (`NODE_ENV`, `PICASSO_ENV`)
3. URL parameters (`?picasso-env=staging`)
4. Hostname patterns
5. Build context
6. Default fallback (production)

### Security Considerations
- JWT tokens required for Master Function
- Tenant hash validation with branded types
- XSS protection in frontend
- CORS headers configured per environment
- Token blacklisting for revocation
- Audit logging for compliance

## Testing

### Frontend Tests
```bash
# Run component tests
npm test -- src/components/chat/__tests__/

# Run provider tests  
npm test -- src/providers/__tests__/

# Run environment resolver tests
npm test -- src/config/__tests__/environment-resolver.test.ts
```

### Lambda Function Tests
```bash
# Master Function security tests
cd lambda-functions/lambda-functions/Master_Function_Staging
python run_security_tests.py

# Test JWT validation
python -c "from lambda_function import validate_token; print(validate_token('test_token'))"
```

## Deployment Considerations

### Lambda Functions
- **Runtime**: Python 3.x for Master Function, Node.js 20.x for Streaming Handler
- **Memory**: Minimum 512MB recommended for both functions
- **Timeout**: 30 seconds for Master Function, 5 minutes for Streaming Handler
- **Environment Variables Required**:
  - `S3_CONFIG_BUCKET`: Tenant configuration bucket
  - `DYNAMODB_AUDIT_TABLE`: Audit log table name
  - `DYNAMODB_BLACKLIST_TABLE`: Token blacklist table name
  - `BEDROCK_MODEL_ID`: Model identifier (defaults to Claude 3.5 Haiku)

### Frontend Deployment
- Build system supports environment-specific configurations
- Assets can be deployed to S3 with CloudFront
- Environment detection works across different deployment targets
- Configuration schemas validate deployment settings

## Monitoring & Observability

The system includes comprehensive monitoring:
- Real-time metrics collection (ChatProvider performance, API latency)
- Health checks for all components
- Alert system with configurable thresholds
- Dashboard interface for operational visibility
- Integration with BERS monitoring framework

## Known Issues & Limitations

1. Frontend lacks `package.json` - dependency management unclear
2. Lambda functions have nested directory structure (`lambda-functions/lambda-functions/`)
3. Multiple ChatProvider implementations may cause confusion
4. Streaming support depends on Lambda runtime configuration
5. Cache invalidation strategy not fully documented

## Development Tips

1. Use environment resolver for consistent environment detection
2. Check streaming availability before attempting SSE responses
3. Validate JWT tokens early in request lifecycle
4. Monitor cache hit rates for performance optimization
5. Use typed configurations to prevent runtime errors
6. Test CORS headers across different origins
7. Implement proper error boundaries in React components

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

### Migration Path for Lex Clients
Existing Lex clients can migrate to Picasso conversational forms:
- **Preserve Fulfillment**: Keep existing Lambda handlers
- **Convert Intents**: Map Lex intents to conversational forms
- **Maintain Integrations**: Email, Google Sheets, CRM connections unchanged
- **Gradual Migration**: Run Lex and Picasso in parallel during transition

### Implementation Status
- **Day 0**: KB analysis and card extraction pipeline
- **Days 1-2**: Smart response cards with readiness scoring
- **Days 3-4**: Conversational form components
- **Day 5**: Multi-channel notifications
- **Day 6**: Bubble admin console
- **Days 7-8**: Testing and deployment

See `/docs/Conversational_Forms_Implementation_Plan_v4.md` for full details