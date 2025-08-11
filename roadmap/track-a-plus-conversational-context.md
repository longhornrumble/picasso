# Track A+ Hybrid Conversational Context Implementation Plan

## Summary
Transform Picasso from transactional Q&A to conversational AI with server-side state management, healthcare compliance, and minimal client-side changes. Implementation timeline: **4-5 days**.

## Phase 1: Infrastructure Setup (Day 1)
### DynamoDB Conversation State
- Create `picasso_conversations` table with TTL (7-day expiry)
- Schema: `conversation_id` (PK), `tenant_hash`, `messages[]`, `metadata`, `expires_at`
- Basic encryption at rest, tenant isolation via hash prefix
- **Target**: DynamoDB read/write latency ≤ 10 ms

### HMAC State Token System
- Server-side token generation with tenant inference
- Token contains: `conversation_id`, `tenant_hash`, `expires_at`, signature
- 24-hour token rotation, tamper-proof validation
- **Target**: Avg token validation time ≤ 5 ms (Lambda side)

## Phase 2: Lambda Enhancement (Day 2)
### Master_Function Updates
- Add `action=conversation` endpoint for state management
- Integrate DynamoDB conversation retrieval/storage
- Implement lightweight audit logging: `{timestamp, sessionId, action, tenantId}`
- Add basic PII scrubbing for healthcare compliance
- **Target**: Error rate for token validation < 0.5% of requests

### Session State Management
- Replace client-side sessionStorage persistence (ChatProvider.jsx:207-232)
- Server manages conversation continuity via HMAC tokens
- Client sends token with each request, receives updated token
- **Target**: Conversation restore success rate ≥ 99%

## Phase 3: Frontend Conversion (Day 3)
### ChatProvider.jsx Modifications
- Remove `loadPersistedMessages()` and sessionStorage persistence
- Add token-based conversation restoration
- Implement server-state synchronization on widget init
- Maintain backward compatibility for existing message handling
- **Target**: Page refresh recovery time ≤ 1 s

### API Integration
- Enhance chat endpoint to include conversation context
- Send/receive HMAC tokens in API headers
- Handle conversation restoration from server state

## Phase 4: Security & Compliance (Day 4)
### Healthcare Safeguards
- Cross-tenant isolation tests (automated)
- **Target**: Cross-tenant access test failures = 0 per deploy
- PII detection and scrubbing in message content
- **Target**: PII scrub detection accuracy ≥ 95% (regex false-positive rate < 5%)
- Audit trail for all conversation state changes
- **Target**: Audit log completeness = 100% of state changes
- Zero client-side PHI storage validation
- **Target**: No PII/PHI detected in outbound client payloads (0 incidents)

### Monitoring & Observability
- CloudWatch dashboard: token validation rates, DynamoDB latency
- Error alerting for cross-tenant access attempts
- Conversation state metrics and health checks
- Real-time KPI monitoring with alerts

## Phase 5: Testing & Validation (Day 5)
### Integration Testing
- End-to-end conversation flow across page refreshes
- Multi-session conversation continuity
- Healthcare compliance validation
- Cross-tenant isolation verification
- **All KPI targets must be met before production deployment**

### Production Readiness
- Performance testing under load
- Rollback procedures documented
- Monitoring dashboard operational
- Security audit trail functional

## Baseline KPIs

### Operational KPIs
- ✅ Avg token validation time ≤ 5 ms (Lambda side)
- ✅ DynamoDB read/write latency ≤ 10 ms
- ✅ Error rate for token validation < 0.5% of requests
- ✅ Cross-tenant access test failures = 0 per deploy

### User Experience KPIs
- ✅ Conversation restore success rate ≥ 99%
- ✅ Page refresh recovery time ≤ 1 s
- ✅ No PII/PHI detected in outbound client payloads (0 incidents)

### Compliance KPIs
- ✅ Audit log completeness = 100% of state changes
- ✅ PII scrub detection accuracy ≥ 95% (regex false-positive rate < 5%)

## User Adjustments Incorporated
1. **Lightweight Audit Logging**: Structured schema (timestamp, sessionId, action, tenantId) implemented from day one with 100% completeness target
2. **Automated Cross-Tenant Safeguards**: Test suite runs with every deploy to verify tenant isolation (0 failures target)
3. **Minimal CloudWatch Monitoring**: Basic dashboard with all operational KPIs tracked in real-time

## Healthcare Compliance Features
- Server-side conversation state (no client PHI storage)
- HMAC-signed tokens prevent tampering
- Cross-tenant isolation with automated testing (0 failures)
- PII scrubbing with ≥95% accuracy
- Full audit trail for compliance reporting (100% completeness)

## Success Criteria
All baseline KPIs must be achieved during Phase 5 testing before production deployment. Real-time monitoring ensures continued compliance post-launch.

This plan delivers immediate conversational memory while establishing healthcare-grade compliance metrics from day one.

---

**Status**: Plan approved and published  
**Next Step**: Begin Phase 1 implementation when ready  
**Timeline**: 4-5 days total implementation  
**Priority**: High - Healthcare client onboarding dependent on conversational context