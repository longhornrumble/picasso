# Lex Integration Project Summary

## Overview
This document outlines the strategy for integrating Amazon Lex with the Picasso chat widget system to enable structured data collection alongside conversational AI capabilities.

## Current Architecture

### Picasso System Components
1. **Frontend**: React-based chat widget with TypeScript support
2. **Master_Function_Staging**: Python Lambda for JWT auth, conversation management, and routing
3. **Bedrock_Streaming_Handler_Staging**: Node.js Lambda for SSE streaming responses
4. **Analytics_Function**: Tracks user interactions and conversation metrics

### Legacy Lex Implementation
The `AustinAngels_CoreFunction` demonstrates the original per-client Lambda pattern:
- Direct Lex integration for form collection
- 5 main intents: Contact, Volunteer, Prayer Request, Donation, General
- Email notifications via SES
- Google Sheets integration for data storage
- UTM tracking for campaign attribution

## Hybrid Architecture Strategy

### 80/20 Rule
- **80-90% Bedrock**: Handles conversational queries, Q&A, explanations
- **10-20% Lex**: Handles structured data collection and forms

### Routing Decision Tree
```
User Input → Master Function
    ├─ Conversational? → Bedrock (via Streaming Handler)
    └─ Form/Action? → Lex (for slot collection)
```

## Implementation Approach

### Phase 1: Foundation
1. **Intent Router Enhancement** (`intent_router.py`)
   - Add Lex detection logic
   - Route based on response card type
   - Maintain conversation context

2. **Session State Sharing**
   - Use DynamoDB for cross-Lambda state
   - Preserve conversation history
   - Track form completion status

### Phase 2: Lex Integration
1. **Create Lex Handler Module** (`lex_handler.py`)
   - Process Lex events
   - Map slots to tenant configuration
   - Handle fulfillment logic

2. **Response Card Configuration**
   - "Question" cards → Bedrock
   - "Action" cards → Lex
   - Tenant-specific routing rules

### Phase 3: Multi-Tenant Support
1. **Shared Bot Templates**
   - Create base bot definitions
   - Use aliases for tenant isolation
   - Configure per-tenant slots

2. **Analytics Integration**
   - Track Lex interactions separately
   - Report by tenant_hash
   - Monitor form completion rates

## Technical Considerations

### Multi-Tenant Reporting
- **Challenge**: Multiple tenants share Lex bot templates
- **Solution**:
  - Use session attributes to track tenant_hash
  - CloudWatch metrics with tenant dimension
  - Custom analytics dashboard per tenant

### Data Flow
1. User clicks action card in Picasso
2. Master Function routes to Lex
3. Lex collects slots progressively
4. Fulfillment Lambda processes submission
5. Results stored in DynamoDB/sent via email
6. Confirmation returned to user

### Security
- JWT validation before Lex routing
- Tenant isolation via session attributes
- Audit logging for all Lex interactions
- Encrypted storage of collected data

## Migration Path

### From Legacy to New
1. **Port fulfillment logic** from AustinAngels_CoreFunction
2. **Standardize slot names** across all tenants
3. **Create configuration schema** for tenant-specific routing
4. **Test with subset** of tenants before full rollout

### Configuration Example
```json
{
  "tenant_hash": "abc123",
  "lex_config": {
    "bot_name": "PicassoBot",
    "bot_alias": "Production",
    "enabled_intents": ["Contact", "Volunteer"],
    "fulfillment": {
      "email": "info@example.org",
      "google_sheet_id": "1234567890"
    }
  }
}
```

## Benefits

1. **Unified Experience**: Single widget for both conversation and forms
2. **Better Conversion**: Natural progression from chat to action
3. **Simplified Maintenance**: One system instead of two
4. **Enhanced Analytics**: Complete user journey tracking
5. **Cost Optimization**: Lex only when needed, Bedrock for conversation

## Risks & Mitigation

| Risk | Mitigation |
|------|------------|
| Lex cold starts | Pre-warm with scheduled events |
| Complex routing logic | Comprehensive testing suite |
| Tenant data mixing | Strict session isolation |
| Form abandonment | Progressive slot collection |

## Success Metrics

- **Technical**: <500ms Lex routing latency
- **Business**: >60% form completion rate
- **Operational**: <5% error rate in slot collection
- **User Experience**: Seamless transition from chat to form

## Timeline

- **Week 1**: Intent router enhancement
- **Week 2**: Lex handler implementation
- **Week 3**: Multi-tenant configuration
- **Week 4**: Testing and optimization
- **Week 5**: Gradual rollout

## Conclusion

The hybrid Bedrock-Lex architecture provides the best of both worlds: sophisticated conversational AI for information delivery and structured data collection for actionable outcomes. By routing intelligently between the two services, Picasso can offer a complete user experience within a single, elegant interface.