# Streaming Chat Implementation Plan
## Separate Endpoint Approach

### Table of Contents
1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Implementation Phases](#implementation-phases)
4. [Technical Specifications](#technical-specifications)
5. [Risk Analysis](#risk-analysis)
6. [Success Metrics](#success-metrics)
7. [Rollback Plan](#rollback-plan)

---

## Executive Summary

This document outlines the implementation plan for adding streaming chat capabilities to the Picasso widget system using a separate endpoint approach. This approach was selected after the redirect-based approach failed due to protocol mismatches and CORS issues.

### Key Benefits
- **No breaking changes** to existing chat functionality
- **Clean separation** between streaming and regular chat
- **Progressive enhancement** - streaming degrades gracefully
- **Low risk** implementation with feature flags
- **3-5x faster** time to first response

### Timeline
- Total implementation: 4 days
- Testing in Labs: Day 3
- Production rollout: Day 4
- Full deployment: Within 1 week

---

## Architecture Overview

### Current State
```
Client (Picasso) → POST → Master Function → JSON Response
```

### Future State
```
Regular Chat:
Client (Picasso) → POST → Master Function → JSON Response

Streaming Chat:
Client (Picasso) → EventSource → Streaming Lambda → SSE Stream
```

### System Components

1. **Streaming Lambda** (Node.js)
   - Already deployed: `picasso-streaming-production`
   - URL: https://z6uaup55pxf2svltm3ypwnz3ra0liinh.lambda-url.us-east-1.on.aws/
   - Handles SSE streaming with Bedrock
   - Includes security improvements (tenant isolation)

2. **Master Function** (Python)
   - Existing chat endpoint remains unchanged
   - Add streaming endpoint URL to config response
   - No redirect logic needed

3. **Picasso Widget** (React)
   - Detect streaming capability from config
   - Use EventSource API for streaming
   - Fallback to regular chat on error

---

## Implementation Phases

### Phase 1: Backend Infrastructure (Day 1)

#### 1.1 Streaming Lambda Updates
```javascript
// Current: Expects POST with body
// Change to: Accept GET with query parameters
export const handler = awslambda.streamifyResponse(async (event, responseStream, _context) => {
    // Parse from query string for EventSource compatibility
    const params = event.queryStringParameters || {};
    const { tenant_hash, user_input, session_id, message_id } = params;
    
    // Add CORS headers for browser access
    responseStream.setContentType("text/event-stream");
    responseStream.setHeader("Access-Control-Allow-Origin", "*");
    responseStream.setHeader("Cache-Control", "no-cache");
});
```

#### 1.2 Master Function Config Update
```python
def get_config_for_tenant_by_hash(tenant_hash):
    config = load_base_config(tenant_hash)
    
    # Add streaming endpoint if enabled
    if config.get("features", {}).get("streaming_enabled", False):
        config["endpoints"] = {
            "streaming": os.environ.get("STREAMING_LAMBDA_URL")
        }
    
    return config
```

#### 1.3 Configuration Structure
```json
{
  "tenant_hash": "fo85e6a06dcdf4",
  "features": {
    "streaming_enabled": true,
    "streaming_percentage": 0,  // For gradual rollout
    "streaming_model": "anthropic.claude-3-haiku-20240307-v1:0"
  },
  "endpoints": {
    "chat": "https://chat.myrecruiter.ai/Master_Function?action=chat",
    "streaming": "https://z6uaup55pxf2svltm3ypwnz3ra0liinh.lambda-url.us-east-1.on.aws/"
  }
}
```

### Phase 2: Picasso Widget Implementation (Day 2)

#### 2.1 Create Streaming Hook
```javascript
// src/hooks/useStreaming.js
import { useState, useEffect, useRef } from 'react';

export function useStreaming() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedContent, setStreamedContent] = useState('');
  const eventSourceRef = useRef(null);
  
  const startStreaming = (url, params) => {
    const queryString = new URLSearchParams(params).toString();
    const streamUrl = `${url}?${queryString}`;
    
    eventSourceRef.current = new EventSource(streamUrl);
    setIsStreaming(true);
    
    eventSourceRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.content) {
        setStreamedContent(prev => prev + data.content);
      }
    };
    
    eventSourceRef.current.onerror = (error) => {
      console.error('Streaming error:', error);
      stopStreaming();
    };
  };
  
  const stopStreaming = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
  };
  
  return {
    isStreaming,
    streamedContent,
    startStreaming,
    stopStreaming
  };
}
```

#### 2.2 Update ChatProvider
```javascript
// In ChatProvider.jsx
const sendMessage = async (message) => {
  const config = getConfig();
  const supportsStreaming = config?.features?.streaming_enabled && 
                           config?.endpoints?.streaming &&
                           typeof EventSource !== 'undefined';
  
  if (supportsStreaming && shouldUseStreaming()) {
    // Use streaming endpoint
    const { startStreaming } = streaming;
    startStreaming(config.endpoints.streaming, {
      tenant_hash: getTenantHash(),
      user_input: message.content,
      session_id: sessionId,
      message_id: message.id
    });
  } else {
    // Use regular chat endpoint
    await sendRegularChatRequest(message);
  }
};

const shouldUseStreaming = () => {
  const config = getConfig();
  const percentage = config?.features?.streaming_percentage || 0;
  return Math.random() * 100 < percentage;
};
```

#### 2.3 Update MessageBubble Component
```javascript
// Add streaming display capability
function MessageBubble({ 
  content, 
  isStreaming, 
  streamedContent,
  ...props 
}) {
  const displayContent = isStreaming ? streamedContent : content;
  
  return (
    <div className="message-bubble">
      <div className="message-content">
        {displayContent}
        {isStreaming && <span className="streaming-cursor">▊</span>}
      </div>
    </div>
  );
}
```

### Phase 3: Integration & Testing (Day 3)

#### 3.1 Test Plan
1. **Unit Tests**
   - Test EventSource connection handling
   - Test fallback logic
   - Test error scenarios

2. **Integration Tests**
   - Test with Foster Village config
   - Test with non-streaming tenants
   - Test network interruption recovery

3. **Performance Tests**
   - Measure time to first token
   - Compare streaming vs regular latency
   - Test with various response sizes

#### 3.2 Test Scenarios
```javascript
// Test 1: Successful streaming
describe('Streaming Chat', () => {
  it('should stream responses when enabled', async () => {
    // Mock config with streaming enabled
    // Verify EventSource is created
    // Verify progressive content updates
  });
  
  it('should fallback to regular chat on error', async () => {
    // Mock EventSource failure
    // Verify fallback to POST request
    // Verify user sees response
  });
});
```

### Phase 4: Production Rollout (Day 4)

#### 4.1 Deployment Steps
1. **Update Streaming Lambda** (Already deployed)
   - Verify query parameter handling
   - Add comprehensive logging
   - Test with production config

2. **Deploy Picasso Widget**
   - Feature flag set to 0%
   - Monitor for any regression
   - CloudFront cache invalidation

3. **Progressive Rollout**
   ```
   Day 4, Hour 1: 0% (monitoring only)
   Day 4, Hour 4: 10% of Foster Village
   Day 4, Hour 8: 50% of Foster Village
   Day 5: 100% of Foster Village
   Day 6: Enable for other tenants
   ```

#### 4.2 Monitoring Dashboard
- Streaming request count
- Error rates by type
- Latency percentiles (p50, p95, p99)
- Fallback trigger rate
- User satisfaction metrics

---

## Technical Specifications

### API Contracts

#### Streaming Endpoint Request
```http
GET /streaming-lambda?tenant_hash={hash}&user_input={input}&session_id={id}&message_id={id}
Accept: text/event-stream
```

#### Streaming Response Format
```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

data: {"content": "Hello", "type": "text"}\n\n
data: {"content": ", how", "type": "text"}\n\n
data: {"content": " can I", "type": "text"}\n\n
data: {"content": " help?", "type": "text"}\n\n
data: {"type": "end"}\n\n
```

### Browser Compatibility
- Chrome 6+
- Firefox 6+
- Safari 5+
- Edge 79+
- **Not supported**: IE11 (fallback to regular chat)

### Security Considerations
1. **Authentication**: Tenant hash validation
2. **Rate Limiting**: 10 requests per minute per session
3. **Input Sanitization**: XSS prevention
4. **CORS**: Restricted to widget domains
5. **Timeout**: 30 seconds max stream duration

---

## Risk Analysis

### Identified Risks

1. **EventSource Connection Failures**
   - **Mitigation**: Automatic fallback to regular chat
   - **Impact**: Low - users get standard experience

2. **Increased Lambda Costs**
   - **Mitigation**: Monitor usage, set cost alerts
   - **Impact**: Medium - streaming uses more compute

3. **Browser Incompatibility**
   - **Mitigation**: Feature detection before use
   - **Impact**: Low - graceful degradation

4. **Network Interruptions**
   - **Mitigation**: Reconnection logic with backoff
   - **Impact**: Low - resume or fallback

### Risk Matrix
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Connection failure | Medium | Low | Fallback |
| Cost increase | High | Medium | Monitoring |
| Browser issues | Low | Low | Detection |
| Network issues | Medium | Low | Retry logic |

---

## Success Metrics

### Primary KPIs
1. **Time to First Response**: Target 80% reduction
2. **User Engagement**: Target 20% increase in satisfaction
3. **Error Rate**: Target <0.1% streaming failures
4. **Adoption Rate**: Target 95% of eligible sessions using streaming

### Monitoring Plan
```javascript
// Track streaming metrics
const metrics = {
  streaming_started: 0,
  streaming_completed: 0,
  streaming_failed: 0,
  fallback_triggered: 0,
  average_ttft: 0,
  user_satisfaction: 0
};
```

### Success Criteria Checklist
- [ ] No increase in overall error rate
- [ ] 3-5x improvement in perceived response time
- [ ] 90%+ positive user feedback
- [ ] <2% fallback rate
- [ ] No impact to non-streaming tenants

---

## Rollback Plan

### Instant Rollback (< 1 minute)
1. Set `streaming_percentage` to 0 in Foster Village config
2. All new sessions use regular chat
3. Existing streams complete naturally

### Code Rollback (< 10 minutes)
1. Deploy previous widget version
2. CloudFront invalidation
3. Monitor for stability

### Full Rollback (< 30 minutes)
1. Disable streaming in all tenant configs
2. Remove streaming Lambda permissions
3. Deploy previous widget version
4. Document lessons learned

### Rollback Decision Tree
```
If error_rate > 1%:
  → Instant rollback
  
If user_complaints > 5:
  → Instant rollback
  
If latency_p99 > 10s:
  → Investigate, consider rollback
  
If cost > 2x projection:
  → Reduce streaming_percentage
```

---

## Appendices

### A. Configuration Examples
```json
// Foster Village with streaming
{
  "tenant_hash": "fo85e6a06dcdf4",
  "features": {
    "streaming_enabled": true,
    "streaming_percentage": 100
  }
}

// Austin Angels without streaming
{
  "tenant_hash": "au47d9f8e2c31b",
  "features": {
    "streaming_enabled": false
  }
}
```

### B. Error Codes
- `STREAM_001`: EventSource connection failed
- `STREAM_002`: Tenant not authorized for streaming
- `STREAM_003`: Invalid streaming parameters
- `STREAM_004`: Streaming timeout exceeded
- `STREAM_005`: Fallback to regular chat triggered

### C. Related Documentation
- [Streaming Lambda README](../streaming-lambda/README.md)
- [Master Function Architecture](./master-function-architecture.md)
- [Picasso Widget Guide](./widget-development.md)
- [Security Best Practices](./security-guidelines.md)

---

*Last Updated: July 25, 2025*
*Author: Claude & Team*
*Status: Ready for Implementation*