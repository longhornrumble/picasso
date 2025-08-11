# PICASSO Conversation Endpoint Implementation Plan

**Version:** 1.0  
**Date:** August 11, 2025  
**Status:** Ready for Implementation  
**Priority:** P0 - Critical Infrastructure  
**Project:** Track A+ Conversational Context - Missing Server Bridge  

---

## 🎯 Executive Summary

**Problem**: The bot has no conversational memory. Each message is processed in isolation, preventing contextual follow-up questions and natural conversation flow.

**Solution**: Implement the missing `action=conversation` endpoint in Master_Function to bridge ConversationManager.js with DynamoDB conversation state storage.

**Impact**: Transforms bot from transactional Q&A to true conversational AI with memory, critical for hospice care context where continuity matters.

---

## 🏗️ Architecture Foundation (System Architect Design)

### Current Excellent Infrastructure
- ✅ **DynamoDB Tables**: `conversation-summaries` (7d TTL), `recent-messages` (24h TTL)
- ✅ **Audit System**: Comprehensive PII-free logging (audit_logger.py - 583 lines)
- ✅ **Client Ready**: ConversationManager.js prepared for server endpoints
- ✅ **Security Patterns**: Tenant-prefixed keys, healthcare TTL compliance

### Critical Missing Piece
- ❌ **Server Bridge**: No `action=conversation` endpoint in Master_Function
- ❌ **State Persistence**: Conversations stored client-side only (sessionStorage)
- ❌ **Context Continuity**: Bot cannot remember previous conversation turns

---

## 🔒 Security Hardeners (Project Owner Enhancements)

### 1. **State Token Security** (CRITICAL)
```python
# Validate HMAC/JWT token on every operation
Required fields: {sessionId, tenantId, turn, iat, exp}
- Validate token before any database operation
- Rotate turn and return fresh token in response
- Reject operations with invalid/expired tokens
```

### 2. **Concurrency Control** (HIGH)
```python
# Compare-and-swap for conversation state
- Include turn/version in save requests  
- Check stored turn matches expected turn
- Return 409 CONFLICT with server's latest token if mismatch
- Prevent race conditions between multiple chat sessions
```

### 3. **Security Limits** (HIGH)
```python
# Enforce payload and rate limits
Payload limits: save.body <= 24KB, lastMessages <= 6
Rate limits: 10 requests / 10 seconds per session
Return typed errors: 413 PAYLOAD_TOO_LARGE, 429 RATE_LIMITED
```

### 4. **Consistent DLP Scrubbing** (CRITICAL)
```python
# Run DLP scrubber on every save operation
- Scrub before persistence to DynamoDB
- Scrub before audit emission  
- Never store unscrubbed text beyond small window
- Use existing audit_logger PII detection patterns
```

### 5. **TTL Field Management** (HIGH)
```python
# Different TTL rules by data type
summary_ttl = 7 days (healthcare compliance)
lastMessages_ttl = 24 hours (temporary data)
# Update both TTLs on each save so idle sessions expire
```

### 6. **Deterministic State Shape** (HIGH)
```python
# Fixed conversation state structure - NO free-form blobs
Store only: {
    summary: str,
    lastMessages: array (≤6, scrubbed), 
    facts_ledger: object (fixed keys),
    pending_action: str|null,
    turn: int,
    updatedAt: timestamp,
    ttl: timestamp
}
```

### 7. **Verified Clear Operation** (HIGH)
```python
# Double-checked delete with verification
1. Delete conversation items from both tables
2. Read-after-write verify deletion succeeded
3. Emit STATE_CLEAR_COMPLETED audit with counts
4. Return verification status to client
```

### 8. **Typed Error Contract** (HIGH)
```python
# Standardized error responses for client branching
Error types: TOKEN_INVALID, TOKEN_EXPIRED, VERSION_CONFLICT,
            RATE_LIMITED, PAYLOAD_TOO_LARGE, TENANT_UNKNOWN
# Client ConversationManager can handle each error type appropriately  
```

---

## 📋 API Specification

### **Endpoint Structure**
```
GET    /Master_Function?action=conversation&operation=get
POST   /Master_Function?action=conversation&operation=save
DELETE /Master_Function?action=conversation&operation=clear
```

### **Authentication**
```
Authorization: Bearer <stateToken>
# Token contains: {sessionId, tenantId, turn, iat, exp}
```

---

## 📡 Request/Response Contracts

### **GET Operation (Retrieve Conversation)**

**Request:**
```
GET /Master_Function?action=conversation&operation=get
Authorization: Bearer <stateToken>
```

**Response (200 OK):**
```json
{
  "sessionId": "sess_123",
  "state": {
    "summary": "User discussed hospice care options for family member",
    "lastMessages": [
      {"role": "user", "text": "What services do you offer?"},
      {"role": "assistant", "text": "We offer hospice care, pain management..."}
    ],
    "facts_ledger": {
      "topic": "intake", 
      "region": "TX",
      "stage": "information_gathering"
    },
    "pending_action": null,
    "turn": 12
  },
  "stateToken": "<new_rotated_token>"
}
```

### **POST Operation (Save Conversation)**

**Request:**
```json
POST /Master_Function?action=conversation&operation=save
Authorization: Bearer <stateToken>
Content-Type: application/json

{
  "sessionId": "sess_123",
  "turn": 12,
  "delta": {
    "appendUser": {"text": "What about pain management?"},
    "appendAssistant": {"text": "We provide 24/7 pain management...", "pending_action": null},
    "facts_update": {"stage": "pain_management_discussion"},
    "summary_update": "User now asking about specific pain management services"
  }
}
```

**Response (200 OK):**
```json
{
  "stateToken": "<rotated_token>",
  "turn": 13
}
```

**Response (409 CONFLICT):**
```json
{
  "error": "VERSION_CONFLICT",
  "stateToken": "<server_token>", 
  "currentTurn": 15,
  "message": "Conversation state changed by another session"
}
```

### **DELETE Operation (Clear Conversation)**

**Request:**
```
DELETE /Master_Function?action=conversation&operation=clear
Authorization: Bearer <stateToken>
```

**Response (200 OK):**
```json
{
  "sessionId": "sess_123",
  "report": {
    "messages_deleted": 6,
    "summaries_deleted": 1,
    "verified": true
  },
  "stateToken": null
}
```

---

## 🗂️ Data Storage Design

### **DynamoDB Tables (Existing)**

**Conversation Summaries Table:**
```yaml
Table: ${ENVIRONMENT}-conversation-summaries
PK: sessionId
GSI: tenantId-index
TTL: expires_at (7 days)
Fields:
  - sessionId: String (PK)
  - tenantId: String (GSI)
  - summary: String (scrubbed)
  - facts_ledger: JSON (structured)
  - pending_action: String|null
  - turn: Number
  - updatedAt: Timestamp
  - expires_at: Number (TTL)
```

**Recent Messages Table:**
```yaml
Table: ${ENVIRONMENT}-recent-messages  
PK: sessionId
SK: timestamp
TTL: expires_at (24 hours)
Fields:
  - sessionId: String (PK)
  - timestamp: Number (SK)
  - messageId: String
  - role: String (user|assistant)
  - content: String (scrubbed)
  - expires_at: Number (TTL)
```

---

## 🔐 Security & Compliance

### **State Token Structure**
```json
{
  "sessionId": "sess_abc123",
  "tenantId": "my87674d777bf9",
  "turn": 12,
  "iat": 1691779200,
  "exp": 1691865600
}
```

### **DLP Scrubbing Pipeline**
1. **Pre-Persist**: Scrub all text before DynamoDB storage
2. **Pre-Audit**: Scrub all content before audit emission
3. **Field-Level**: Apply scrubbing to summary, messages, facts_ledger
4. **Pattern Detection**: Use existing audit_logger PII regex patterns

### **Rate Limiting**
```python
# Per-session limits
- 10 requests per 10 seconds
- Payload size <= 24KB
- Message count <= 6 per save
- Return 429 RATE_LIMITED with retry-after header
```

### **Tenant Isolation**
```python
# All operations validate tenant access
- Token tenantId must match request tenant_hash
- DynamoDB keys prefixed with tenant identifier
- Cross-tenant access blocked at token validation
```

---

## 🏥 Healthcare Compliance

### **Data Retention**
- **Conversation Summaries**: 7-day TTL (hospice care continuity)
- **Recent Messages**: 24-hour TTL (temporary context only)
- **Automatic Expiry**: DynamoDB TTL handles deletion

### **PII Protection**
- **No PHI Storage**: Only scrubbed, general conversation topics
- **Audit Trail**: PII-free logging for all state changes
- **Clear on Demand**: Complete conversation deletion available

### **Compliance Events**
```python
# Audit events (PII-free)
- CONVERSATION_RETRIEVED: session access logging
- CONVERSATION_SAVED: state change logging  
- CONVERSATION_CLEARED: deletion verification
- TOKEN_VALIDATED: authentication events
```

---

## 🛠️ Implementation Tasks

### **Phase 1: Core Endpoint (1 Day)**
1. **Create conversation_handler.py**
   - `handle_conversation_action()` - main router
   - `handle_get_conversations()` - retrieve state
   - `handle_save_conversation()` - store with CAS
   - `handle_clear_conversation()` - verified delete

2. **Update lambda_function.py**
   - Add `action=conversation` routing
   - Import conversation_handler module
   - Integrate with existing error handling

### **Phase 2: Security Hardening (1 Day)**
3. **Token Validation System**
   - HMAC/JWT validation on all operations
   - Token rotation with turn increment
   - Typed error responses

4. **Concurrency Control**
   - Compare-and-swap implementation
   - Version conflict handling
   - Race condition prevention

### **Phase 3: Data Protection (0.5 Day)**
5. **DLP Integration**
   - Pre-persist scrubbing pipeline
   - Pre-audit scrubbing pipeline
   - Existing audit_logger pattern usage

6. **Rate Limiting**
   - Per-session request limiting
   - Payload size validation
   - Message count enforcement

### **Phase 4: Testing & Validation (0.5 Day)**
7. **Integration Testing**
   - All three operations (GET/POST/DELETE)
   - Token validation and rotation
   - Concurrency conflict scenarios
   - Rate limiting enforcement

8. **Client Integration**
   - ConversationManager.js endpoint compatibility
   - Error handling validation
   - State persistence verification

---

## 📊 Success Criteria

### **Functional Requirements**
- ✅ Bot remembers conversation context across messages
- ✅ Contextual follow-up questions work naturally
- ✅ Page refresh preserves conversation state
- ✅ All three operations (GET/POST/DELETE) functional

### **Security Requirements**
- ✅ All operations require valid state tokens
- ✅ Concurrency conflicts handled gracefully
- ✅ Rate limiting prevents abuse
- ✅ DLP scrubbing applied consistently

### **Performance Targets**
- ✅ Conversation retrieval: <200ms
- ✅ Conversation save: <300ms
- ✅ Token validation: <10ms
- ✅ DynamoDB operations: <50ms

### **Healthcare Compliance**
- ✅ 7-day conversation TTL enforced
- ✅ 24-hour message TTL enforced
- ✅ PII-free audit logging
- ✅ Complete conversation deletion available

---

## 🚨 Risk Mitigation

### **Concurrency Risks**
- **Risk**: Race conditions in multi-tab scenarios
- **Mitigation**: Compare-and-swap with turn versioning
- **Fallback**: 409 CONFLICT response with server state

### **Security Risks**
- **Risk**: Token replay attacks
- **Mitigation**: Token rotation on every operation
- **Monitoring**: Audit all token validation failures

### **Performance Risks**
- **Risk**: DynamoDB hot partitions
- **Mitigation**: Tenant-prefixed keys for distribution
- **Monitoring**: CloudWatch DynamoDB metrics

### **Data Risks**
- **Risk**: PII leakage into conversation state
- **Mitigation**: DLP scrubbing before all persistence
- **Verification**: Regular audit log review

---

## 📈 Rollout Strategy

### **Implementation Order**
1. **Core endpoint implementation** (conversation_handler.py)
2. **Master_Function integration** (action routing)
3. **Security hardening** (tokens, CAS, rate limiting)
4. **DLP integration** (scrubbing pipeline)
5. **Client testing** (ConversationManager.js compatibility)
6. **Production deployment** (staging → production)

### **Rollback Plan**
- **Remove action routing**: Comment out conversation action
- **No schema changes**: DynamoDB tables remain unchanged
- **Client fallback**: ConversationManager reverts to localStorage
- **Zero downtime**: Existing functionality unaffected

### **Success Metrics**
- **Day 1**: Core endpoint responding to GET/POST/DELETE
- **Day 2**: Security hardening complete, all tests passing
- **Day 3**: Production deployment with conversation memory working

---

## 🎯 Acceptance Criteria

### **Technical Acceptance**
- [ ] `action=conversation` endpoint implemented in Master_Function
- [ ] All three operations (GET/POST/DELETE) functional
- [ ] State token validation and rotation working
- [ ] Compare-and-swap concurrency control active
- [ ] DLP scrubbing applied to all save operations
- [ ] Rate limiting enforced per specifications

### **Security Acceptance**
- [ ] All operations require valid authentication tokens
- [ ] Cross-tenant access prevention verified
- [ ] PII scrubbing validated in conversation storage
- [ ] Audit events emitted for all state changes
- [ ] Error responses typed and client-actionable

### **User Experience Acceptance**
- [ ] Bot remembers context between messages
- [ ] Contextual follow-up questions work naturally
- [ ] Page refresh preserves conversation state
- [ ] Error conditions handled gracefully in UI
- [ ] Performance targets met (<200ms retrieval)

### **Healthcare Compliance Acceptance**
- [ ] 7-day conversation summary TTL enforced
- [ ] 24-hour recent message TTL enforced
- [ ] Complete conversation deletion functional
- [ ] PII-free audit trail verified
- [ ] No PHI stored in conversation state

---

**Document Status**: Ready for implementation  
**Assigned Team**: Security Specialist (implementation lead)  
**Timeline**: 3 days (2 days implementation, 1 day testing/deployment)  
**Dependencies**: None - builds on existing excellent infrastructure  

This plan transforms the PICASSO chat widget from transactional Q&A to true conversational AI with secure, healthcare-compliant memory - exactly what hospice care conversations require.