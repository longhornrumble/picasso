# 🌊 PICASSO UNIFIED COORDINATION ARCHITECTURE - PROJECT PLAN v2.0

**Version:** 2.0 (Corrected Architecture)  
**Date:** 2025-01-10  
**Status:** Ready for Implementation  
**Duration:** 7 days (corrected timeline)  
**Team:** 8 specialized AI agents  

---

## 🎯 EXECUTIVE SUMMARY

This plan implements unified coordination architecture with **critical corrections** based on tech advisor feedback. Key fixes: Function URL authentication, secure tenant inference, conversation state separation, and healthcare compliance.

**Core Problem**: AWS `awslambda.streamifyResponse()` cannot work through API Gateway HTTP APIs due to response buffering.

**Solution**: Master_Function coordination + direct Function URL streaming with JWT security.

---

## 📋 CRITICAL CORRECTIONS FROM v1.0

### ❌ **Major Issues Fixed:**
1. **Authentication**: `AuthType: AWS_IAM` → `AuthType: NONE` (browsers can't do SigV4)
2. **Security**: Client-controlled tenant → Server-inferred tenant in JWT  
3. **Token Design**: 30min generic JWT → 5-15min purpose-specific tokens
4. **Data Model**: Single table full messages → Two-table summary approach
5. **Compliance**: No purge mechanism → `/state/clear` + audit events

---

## 🏗️ REVISED ARCHITECTURE

```
Client Request
     ↓
API Gateway → Master_Function (Coordinator)
     ↓
┌─────────────────┬─────────────────┐
│   HTTP Mode     │  Streaming Mode │
│   (Direct)      │                 │
│                 │ 1. Infer tenant │
│                 │ 2. Generate JWT │
│                 │ 3. Return URL   │
└─────────────────┴─────────────────┘
                         ↓
               Client → Function URL
               (AuthType: NONE + JWT validation)
                         ↓
              Bedrock_Streaming_Handler
```

---

## 📅 PHASE BREAKDOWN (7 Days)

### **PHASE 1: CORRECTED FOUNDATION (Days 1-2)**
**Goal**: Clean up API Gateway routes and establish corrected Function URL architecture

**Tasks:**
- Remove broken API Gateway streaming routes
- Create Function URLs with `AuthType: NONE`
- Design two-table DynamoDB approach
- Implement corrected JWT structure

### **PHASE 2: SECURITY & COORDINATION (Days 3-4)**  
**Goal**: Implement secure tenant inference and JWT coordination

**Tasks:**
- Add tenant inference to Master_Function
- Implement JWT validation in streaming handler
- Create conversation state separation
- Add `/state/clear` endpoint

### **PHASE 3: CLIENT INTEGRATION (Days 5-6)**
**Goal**: Update client-side code for corrected architecture

**Tasks:**
- Update streaming flow for JWT tokens
- Remove tenant_hash from client streaming calls
- Implement conversation summaries (not full messages)
- Add state clearing UI

### **PHASE 4: TESTING & DEPLOYMENT (Day 7)**
**Goal**: Comprehensive testing including mobile Safari and compliance

**Tasks:**
- Integration tests with corrected auth flow
- Mobile Safari SSE compatibility testing
- Cross-tenant isolation validation
- Load testing and deployment

---

## 🛡️ CORRECTED SECURITY MODEL

### **JWT Token Structure (Fixed)**
```json
{
  "header": { "alg": "HS256", "typ": "JWT" },
  "payload": {
    "sessionId": "sess_abc123",
    "tenantId": "my87674d777bf9", 
    "purpose": "stream",
    "iat": 1708123456,
    "exp": 1708124356,  // 15 minutes max
    "jti": "unique-token-id"
  }
}
```

### **Authentication Flow (Corrected)**
1. Client requests stream from Master_Function
2. Master_Function **infers tenant** from request context
3. Master_Function generates JWT with embedded tenant  
4. Client connects to Function URL with `Authorization: Bearer <jwt>`
5. Streaming handler validates JWT internally (no AWS_IAM)

### **Tenant Inference (Secure)**
Master_Function determines tenant from:
- Host header analysis
- API Gateway route context
- Configuration lookup
- **Never from client input**

---

## 📊 CORRECTED DATA MODEL

### **Two-Table Approach**

**Table 1: `picasso-conversation-summaries`**
```json
{
  "sessionId": "sess_abc123",
  "tenantId": "my87674d777bf9", 
  "summary": "User asking about product features...",
  "facts_ledger": ["user_name: John", "interested_in: pricing"],
  "pending_action": "send_pricing_info",
  "turn_count": 5,
  "created_at": 1708123456,
  "expires_at": 1708727056  // 7 days TTL
}
```

**Table 2: `picasso-recent-messages`**
```json
{
  "sessionId": "sess_abc123",
  "messageId": "msg_001",
  "sender": "user",
  "content": "What are your pricing options?",
  "timestamp": 1708123456,
  "expires_at": 1708209856  // 24 hours TTL
}
```

### **Privacy Benefits**
- ✅ No full conversation persistence  
- ✅ Recent messages auto-expire (24h)
- ✅ Summaries for continuity without PII
- ✅ `/state/clear` purges all data

---

## 🔧 DETAILED IMPLEMENTATION

### **Phase 1: Foundation (Days 1-2)**

#### **Task 1.1: API Gateway Cleanup**
```bash
# Remove broken streaming routes
aws apigateway delete-route \
  --api-id kgvc8xnewf \
  --route-id [streaming-route-id]
```

#### **Task 1.2: Function URL Creation (CORRECTED)**
```yaml
Bedrock_Streaming_Handler:
  FunctionUrl:
    AuthType: NONE  # CRITICAL: Not AWS_IAM
    Cors:
      AllowMethods: ["POST", "OPTIONS"] 
      AllowOrigins: ["https://chat.myrecruiter.ai"]
      AllowHeaders: ["Authorization", "Content-Type"]
```

#### **Task 1.3: DynamoDB Tables**
```bash
# Create conversation summaries table
aws dynamodb create-table \
  --table-name picasso-conversation-summaries \
  --key-schema AttributeName=sessionId,KeyType=HASH \
  --attribute-definitions AttributeName=sessionId,AttributeType=S

# Create recent messages table  
aws dynamodb create-table \
  --table-name picasso-recent-messages \
  --key-schema AttributeName=sessionId,KeyType=HASH \
                AttributeName=messageId,KeyType=RANGE
```

### **Phase 2: Security & Coordination (Days 3-4)**

#### **Task 2.1: Master_Function Tenant Inference**
```python
def infer_tenant_from_request(event):
    """Securely determine tenant from request context"""
    # Check host header
    host = event.get('headers', {}).get('host', '')
    
    # Check API Gateway domain mapping
    domain_name = event.get('requestContext', {}).get('domainName', '')
    
    # Tenant inference logic (never trust client input)
    if 'staging' in host:
        return lookup_staging_tenant(domain_name)
    
    return lookup_production_tenant(domain_name)

def generate_streaming_token(tenant_id, session_id):
    """Generate short-lived JWT for streaming"""
    payload = {
        'sessionId': session_id,
        'tenantId': tenant_id,
        'purpose': 'stream',
        'iat': int(time.time()),
        'exp': int(time.time()) + (15 * 60),  # 15 minutes
        'jti': secrets.token_urlsafe(8)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')
```

#### **Task 2.2: Streaming Handler JWT Validation**
```python
def validate_streaming_jwt(event):
    """Validate JWT token from Authorization header"""
    auth_header = event.get('headers', {}).get('authorization', '')
    
    if not auth_header.startswith('Bearer '):
        return {'valid': False, 'error': 'Missing Bearer token'}
    
    token = auth_header[7:]  # Remove 'Bearer ' prefix
    
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        
        # Verify token purpose
        if payload.get('purpose') != 'stream':
            return {'valid': False, 'error': 'Invalid token purpose'}
            
        return {
            'valid': True,
            'sessionId': payload['sessionId'],
            'tenantId': payload['tenantId']
        }
    except jwt.ExpiredSignatureError:
        return {'valid': False, 'error': 'Token expired'}
    except jwt.InvalidTokenError:
        return {'valid': False, 'error': 'Invalid token'}
```

#### **Task 2.3: State Clearing Endpoint**
```python
def handle_state_clear(event, tenant_id):
    """Clear conversation state for compliance"""
    session_id = event.get('queryStringParameters', {}).get('session_id')
    
    if not session_id:
        return cors_response(400, {'error': 'session_id required'})
    
    # Delete from both tables
    dynamodb.delete_item(
        TableName='picasso-conversation-summaries',
        Key={'sessionId': session_id}
    )
    
    dynamodb.delete_item(
        TableName='picasso-recent-messages', 
        Key={'sessionId': session_id}
    )
    
    # Emit audit event
    emit_audit_event('state_cleared', {
        'sessionId': session_id,
        'tenantId': tenant_id,
        'timestamp': int(time.time())
    })
    
    return cors_response(200, {'status': 'cleared'})
```

### **Phase 3: Client Integration (Days 5-6)**

#### **Task 3.1: Updated Streaming Flow**
```javascript
// CORRECTED: No tenant_hash in streaming URL
const requestStreamingToken = async () => {
  // Request JWT from Master_Function (tenant inferred server-side)
  const response = await fetch(
    `${config.API_BASE_URL}/Master_Function?action=generate_stream_token&session_id=${sessionId}`
  );
  
  const { jwt_token, function_url } = await response.json();
  return { jwt_token, function_url };
};

const startStreaming = async (message) => {
  const { jwt_token, function_url } = await requestStreamingToken();
  
  // Connect directly to Function URL with JWT
  const response = await fetch(function_url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt_token}`,  // JWT auth
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message,
      sessionId  // No tenant_hash - it's in JWT
    })
  });
  
  // Handle streaming response...
};
```

#### **Task 3.2: Conversation Summary Integration** 
```javascript
// Use summaries instead of full message history
const loadConversationContext = async () => {
  const response = await fetch(
    `${config.API_BASE_URL}/Master_Function?action=get_conversation&session_id=${sessionId}`
  );
  
  const { summary, recent_messages, facts_ledger } = await response.json();
  
  // Display recent messages in UI
  setMessages(recent_messages);
  
  // Use summary for context (not shown to user)
  setConversationContext({ summary, facts_ledger });
};
```

### **Phase 4: Testing & Compliance (Day 7)**

#### **Task 4.1: Cross-Tenant Isolation Test**
```javascript
// Verify JWT prevents cross-tenant access
const testTenantIsolation = async () => {
  const tenantA_token = await getStreamingToken('tenantA');
  
  // Attempt to access tenantB data with tenantA token
  const response = await fetch(tenantB_function_url, {
    headers: { 'Authorization': `Bearer ${tenantA_token}` }
  });
  
  // Should return 401 Unauthorized
  assert(response.status === 401);
};
```

#### **Task 4.2: Mobile Safari Testing**
```javascript
// Test SSE compatibility on iOS
const testMobileSafariSSE = () => {
  const eventSource = new EventSource(function_url, {
    headers: { 'Authorization': `Bearer ${jwt_token}` }
  });
  
  eventSource.onmessage = (event) => {
    // Verify proper SSE framing
    assert(event.data.endsWith('\n'));
  };
};
```

#### **Task 4.3: State Clearing Test**
```javascript
// Test compliance purge functionality
const testStateClear = async () => {
  // Create conversation state
  await sendMessage("Test message");
  
  // Clear state
  await fetch(`${config.API_BASE_URL}/Master_Function?action=state_clear&session_id=${sessionId}`, {
    method: 'POST'
  });
  
  // Verify state is purged
  const response = await fetch(`${config.API_BASE_URL}/Master_Function?action=get_conversation&session_id=${sessionId}`);
  assert(response.status === 404);
};
```

---

## 📊 SUCCESS CRITERIA

### **Security Validation**
- [ ] JWT tokens expire in ≤15 minutes
- [ ] Tenant inference never uses client input
- [ ] Cross-tenant access blocked (0% success rate)
- [ ] Mobile Safari SSE compatibility confirmed

### **Performance Targets**
- [ ] JWT generation: <500ms
- [ ] Streaming first token: <1000ms  
- [ ] State clearing: <200ms
- [ ] Summary retrieval: <300ms

### **Compliance Requirements**
- [ ] `/state/clear` endpoint functional
- [ ] Audit events for all operations
- [ ] No full message persistence beyond 24h
- [ ] Conversation summaries ≤7 days TTL

### **Technical Validation**
- [ ] Function URLs with `AuthType: NONE`
- [ ] Internal JWT validation working
- [ ] Two-table data model operational
- [ ] Keep-alive heartbeats implemented

---

## 🚀 DEPLOYMENT CHECKLIST

### **Pre-Deployment**
- [ ] All tests pass on staging
- [ ] Mobile Safari validation complete
- [ ] Cross-tenant isolation verified
- [ ] Performance benchmarks met

### **Deployment Steps**
1. Deploy corrected Lambda functions
2. Create Function URLs with `AuthType: NONE`
3. Update DynamoDB tables with TTL
4. Deploy corrected Picasso client code
5. Test end-to-end flow
6. Monitor JWT validation rates

### **Post-Deployment**
- [ ] Real-time monitoring active
- [ ] State clearing functionality tested
- [ ] Audit events flowing correctly
- [ ] Customer validation successful

---

## 📈 BENEFITS OF v2.0 CORRECTIONS

### **Security Improvements**
- ✅ Secure tenant inference (server-side)
- ✅ Short-lived purpose-specific tokens
- ✅ Browser-compatible authentication
- ✅ Cross-tenant isolation guaranteed

### **Compliance Enhancements**  
- ✅ Healthcare data purge capability
- ✅ Audit trail for all operations
- ✅ Privacy-preserving summaries
- ✅ Automatic data expiration

### **Technical Benefits**
- ✅ Mobile Safari compatibility
- ✅ Proper SSE keep-alive handling
- ✅ Cost-effective data storage
- ✅ Simplified client architecture

---

## ⚠️ CRITICAL RISKS & WATCHPOINTS

### **High-Priority Risk Mitigation**

#### **1. JWT Validation Security**
- **Risk**: Streaming handler accepting tokens issued for other purposes
- **Mitigation**: Strict `purpose:"stream"` validation with rejection logging
- **Monitoring**: Alert on any purpose mismatches
```python
# CRITICAL: Log all validation failures
if payload.get('purpose') != 'stream':
    logger.warning(f"JWT purpose mismatch: {payload.get('purpose')}")
    emit_security_alert('jwt_purpose_mismatch', payload)
    return {'valid': False, 'error': 'Invalid token purpose'}
```

#### **2. Safari SSE Background Behavior** 
- **Risk**: iOS aggressively pauses background tabs, breaking streaming
- **Mitigation**: Implement robust reconnection logic with exponential backoff
- **Testing**: Extensive iOS Safari testing across versions
```javascript
// CRITICAL: Handle Safari background pause/resume
const handleStreamDisconnect = () => {
  if (document.hidden) {
    // Tab backgrounded - implement smart reconnect
    setTimeout(() => attemptReconnect(), 1000);
  }
};
```

#### **3. DynamoDB Load Patterns**
- **Risk**: Two-table approach may create unexpected load patterns under volume
- **Mitigation**: Comprehensive load testing with realistic traffic patterns  
- **Monitoring**: DynamoDB throttling alerts, write capacity monitoring
```bash
# CRITICAL: Load test both tables simultaneously
aws dynamodb put-metric-alarm \
  --alarm-name "DynamoDB-UserThrottles" \
  --metric-name UserErrors
```

#### **4. Facts Ledger Growth**
- **Risk**: `facts_ledger` field could hit DynamoDB 400KB item limit
- **Mitigation**: Automatic pruning logic + size monitoring
- **Implementation**: Max 50 facts, summarize older entries
```python
# CRITICAL: Prevent item size limit violations
def prune_facts_ledger(facts_ledger):
    if len(facts_ledger) > 50:
        # Keep recent facts, summarize older ones
        recent_facts = facts_ledger[-30:]
        older_summary = summarize_facts(facts_ledger[:-30])
        return [older_summary] + recent_facts
    return facts_ledger
```

### **Monitoring & Alerting Requirements**

```yaml
Critical Alerts:
  - JWT purpose validation failures > 1%
  - DynamoDB item size approaching 300KB  
  - Safari SSE reconnection rate > 10%
  - Facts ledger truncation events
  - Cross-tenant access attempts (should be 0%)

Performance Monitoring:
  - JWT validation latency (target: <50ms)
  - DynamoDB write/read latency per table
  - Streaming reconnection success rate
  - Background tab recovery time
```

### **Implementation Safeguards**

#### **Phase-Specific Risk Controls**
- **Phase 1**: JWT purpose validation unit tests before deployment
- **Phase 3**: iOS Safari compatibility testing mandatory  
- **Phase 4**: Load testing with facts ledger growth simulation
- **Phase 7**: Real-world mobile testing with background apps

#### **Rollback Triggers**
- JWT validation failure rate >5%
- DynamoDB throttling on either table
- Safari compatibility issues >20% of iOS users
- Facts ledger size violations

---

## 🎯 CONCLUSION

Plan v2.0 addresses all critical architectural flaws identified in tech advisor feedback while maintaining the core unified coordination approach. The corrected architecture provides:

- **Secure**: Server-controlled tenant inference with proper JWT validation
- **Compliant**: Healthcare data handling with purge capabilities  
- **Compatible**: Browser-friendly authentication with mobile Safari support
- **Scalable**: Cost-effective two-table approach with automatic expiration

**Status**: Ready for implementation with corrected security model, compliance features, and comprehensive risk mitigation.

**Next Steps**: Execute 7-day implementation plan with specialized agent assignments and mandatory risk monitoring for each component.