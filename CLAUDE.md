# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This workspace contains the Picasso chat widget system and its supporting Lambda functions:

1. **Picasso Frontend** (`/src`) - React-based chat widget with TypeScript support
2. **Master_Function_Staging** (`/lambda-functions/lambda-functions/Master_Function_Staging`) - Python Lambda for JWT auth, conversation management, and Bedrock orchestration
3. **Bedrock_Streaming_Handler_Staging** (`/lambda-functions/lambda-functions/lambda-functions/Bedrock_Streaming_Handler_Staging`) - Node.js Lambda for SSE streaming responses
4. **Lex Integration** (Planned) - Amazon Lex for structured data collection within Picasso UX
5. **Legacy Lex Architecture** (`/lambda-functions/AustinAngels_CoreFunction`) - Original per-client Lambda pattern for Lex fulfillment

## Commands

### Bedrock Streaming Handler (Node.js Lambda)
```bash
# Navigate to the Lambda directory
cd lambda-functions/lambda-functions/lambda-functions/Bedrock_Streaming_Handler_Staging

# Install dependencies
npm ci --production

# Package for deployment
npm run package  # Creates deployment.zip

# Run locally (requires AWS credentials)
node index.js
```

### Master Function (Python Lambda)
```bash
# Navigate to the Lambda directory  
cd lambda-functions/lambda-functions/Master_Function_Staging

# Package for deployment
zip -r deployment.zip . -x "*.pyc" -x "__pycache__/*"

# Run security tests
python run_security_tests.py

# Create DynamoDB tables (if needed)
python create_audit_table.py
python create_blacklist_table.py
```

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
3. **Routing Decision**:
   - **Conversational queries** → Bedrock (via Streaming Handler)
   - **Structured data collection** → Lex (for forms/slots)
4. **Bedrock_Streaming_Handler_Staging** → Handles SSE streaming for real-time responses

### Key Components

#### Frontend Architecture (`/src`)
- **Context Providers**: Multiple ChatProvider implementations for different streaming modes
  - `ChatProvider.jsx` - Main provider
  - `StreamingChatProvider.jsx` - SSE streaming support  
  - `HTTPChatProvider.jsx` - Standard HTTP requests
- **Configuration System**: Enterprise-grade environment detection (BERS Phase 1)
  - Auto-detects environment from multiple sources
  - S3-based tenant configuration loading
  - Sub-100ms performance target
- **Security**: Multi-layer XSS protection with DOMPurify
- **Monitoring**: Built-in observability with health checks and metrics

#### Master Function Architecture
- **JWT Authentication**: Token validation and blacklisting
- **Tenant Management**: Multi-tenant configuration from S3
- **Conversation State**: DynamoDB-backed session management
- **Bedrock Integration**: Routes to AWS Bedrock for AI responses
- **Lex Integration** (Planned): Routes structured data collection to Lex
- **Intent Router**: Determines whether to use Bedrock or Lex based on context
- **Audit Logging**: Comprehensive audit trail in DynamoDB
- **CORS Support**: Configurable CORS headers for cross-origin requests

#### Bedrock Streaming Handler Architecture  
- **True Lambda Streaming**: Uses `awslambda.streamifyResponse` for SSE
- **Knowledge Base Integration**: Bedrock Agent Runtime for RAG
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

## Lex Integration Strategy

### Hybrid Approach
- **Bedrock** handles 80-90% of interactions (conversations, Q&A, explanations)
- **Lex** handles 10-20% of interactions (structured data collection, forms)
- Picasso provides unified UX regardless of backend engine

### Response Card Routing
- Cards configured as "questions" route to Bedrock
- Cards configured as "actions" route to Lex for slot collection
- Configuration-driven through tenant settings, not hard-coded

### Legacy Architecture (Pre-Picasso)
The original Lex-only architecture (`AustinAngels_CoreFunction`) shows the pattern we're migrating from:
- **One Lambda per client**: Each Lex bot had its own dedicated fulfillment Lambda
- **Direct Lex integration**: Lambda processed Lex events directly without routing layers
- **Simple data flow**: Lex → Lambda → Email/Google Sheets
- **Slot collection focus**: 5 main intents for structured data (donations, applications)
- **UTM tracking**: Campaign attribution via session attributes
- **No conversational AI**: Pure form collection and fulfillment

### Migration Strategy
The new architecture consolidates fulfillment logic into Master Function:
- **From**: Multiple client-specific Lambdas → **To**: Single multi-tenant Master Function
- **From**: Hard-coded slot mappings → **To**: Configuration-driven slot handling
- **From**: Direct SES/Sheets integration → **To**: Modular fulfillment handlers
- **From**: Lex session attributes → **To**: DynamoDB session state
- **Preserve**: Email routing, Google Sheets integration, UTM tracking

### Implementation Notes
- Master Function contains Lex routing placeholder in `intent_router.py`
- Session state shared between Lambda functions via DynamoDB
- Austin Angels bot (ID: OUAGEMKBLO) serves as proof of concept
- Legacy fulfillment logic will be ported to `lex_handler.py` module
- See `/docs/Lex_Project_Summary.md` for detailed integration plan