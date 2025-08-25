# True Dual-Path Architecture Plan for Picasso

**Author**: System Architect  
**Date**: August 24, 2025  
**Status**: Approved for Implementation  
**Impact**: High - Core Architecture Change  

## Executive Summary

Transform Picasso from a "streaming-first with HTTP retrofitted" system into a true dual-path architecture where HTTP and Streaming are completely independent, autonomous paths that never interfere with each other.

**Key Outcome**: Reduce HTTP response time from 45+ seconds to <2 seconds while maintaining streaming capabilities.

## Problem Statement

### Current Performance Issues
- **45-second delays** on HTTP responses due to timeout/retry cycles
- **100+ runtime checks** per message render cycle for streaming status
- **3x retry attempts** with 30-second timeouts = up to 90 seconds of waiting
- **Constant re-renders** checking if streaming is enabled

### Root Cause Analysis

The system lost its original dual-path design. Instead of having two autonomous paths, it currently has:
- One path (streaming) that's constantly being disabled at runtime
- Hundreds of runtime checks asking "am I streaming?" 
- HTTP path that's just "streaming with streaming turned off"
- Components that check streaming status on every render

#### Current Flawed Architecture
```
┌─────────────┐
│   Request   │
└──────┬──────┘
       ↓
┌──────────────────────┐
│ Check if streaming?  │ ← Happens 100+ times per message
└──────┬───────────────┘
       ↓
┌──────────────────────┐
│ Streaming disabled?  │ ← Every component checks
└──────┬───────────────┘
       ↓
┌──────────────────────┐
│ Use HTTP but with    │
│ streaming baggage    │ ← Timeouts, retries, placeholders
└──────────────────────┘
```

### Evidence from Logs
```
🚨 FORCE OVERRIDE ACTIVE: Streaming DISABLED (ignoring tenant config)
[MessageBubble] Streaming globally disabled - forcing streamingFlag to false
```
This message appears **100+ times** in a single chat session, indicating constant runtime checking.

## Proposed Solution

### True Dual-Path Architecture
```
┌─────────────┐
│   App Init  │
└──────┬──────┘
       ↓
┌──────────────────────┐
│ Read config ONCE     │
└──────┬───────────────┘
       ↓
    ┌──────┴──────┐
    ↓             ↓
┌────────┐   ┌────────┐
│  HTTP  │   │STREAM  │
│Provider│   │Provider│
└────────┘   └────────┘
    ↓             ↓
[Completely   [Completely
 Independent]  Independent]
```

### Core Principle
**Make the streaming vs HTTP decision ONCE at initialization, then never check again.**

## Implementation Plan

### Phase 1: File Structure (2 hours)

Create new file structure with clear separation:

```
src/
├── context/
│   ├── ChatProvider.jsx                 # Router only (50 lines)
│   ├── HTTPChatProvider.jsx            # Pure HTTP implementation (500 lines)
│   ├── StreamingChatProvider.jsx       # Pure streaming implementation (800 lines)
│   └── shared/
│       ├── ChatContext.js              # Shared context definition
│       ├── conversationManager.js      # Shared conversation logic
│       └── messageHelpers.js           # Shared utilities
│
├── components/chat/
│   ├── MessageBubble.jsx               # Simplified, no streaming logic (150 lines)
│   ├── MessageBubbleHTTP.jsx          # HTTP-specific rendering (optional)
│   └── MessageBubbleStreaming.jsx     # Streaming-specific rendering (optional)
```

### Phase 2: Component Implementation

#### ChatProvider.jsx (Router Only)
```javascript
// ChatProvider.jsx - 50 lines total
import { useEffect, useState } from 'react';
import { isStreamingEnabled } from '../config/streaming-config';
import HTTPChatProvider from './HTTPChatProvider';
import StreamingChatProvider from './StreamingChatProvider';

export default function ChatProvider({ children, config }) {
  const [Provider, setProvider] = useState(null);
  
  useEffect(() => {
    // ONE-TIME DECISION
    const useStreaming = isStreamingEnabled(config);
    console.log(`🚀 CHAT PROVIDER INITIALIZED: ${useStreaming ? 'STREAMING' : 'HTTP'} MODE`);
    
    setProvider(() => useStreaming ? StreamingChatProvider : HTTPChatProvider);
  }, []); // Empty deps = runs ONCE
  
  if (!Provider) return null;
  
  return <Provider config={config}>{children}</Provider>;
}
```

#### HTTPChatProvider.jsx (Pure HTTP)
Key characteristics:
- NO StreamingRegistry imports
- NO placeholders
- NO partial updates  
- Direct fetch() with 15-second timeout
- Single retry on network failure only
- Wraps responses in `.streaming-formatted` div for CSS consistency

```javascript
const HTTPChatProvider = ({ children, config }) => {
  const sendMessage = async (userInput) => {
    // Add user message immediately
    const userMessage = {
      id: generateId(),
      role: 'user',
      content: sanitizeMessage(userInput),
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);
    
    try {
      // Simple fetch with reasonable timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(chatEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_input: userInput,
          tenant_hash: tenantHash,
          conversation_context: getContext()
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      const data = await response.json();
      
      // Add complete bot message with proper formatting wrapper
      const botMessage = {
        id: generateId(),
        role: 'assistant',
        content: `<div class="streaming-formatted">${data.content}</div>`,
        timestamp: Date.now()
      };
      
      setMessages(prev => [...prev, botMessage]);
      
    } catch (error) {
      // Simple error handling - no complex retry logic
      const errorMessage = {
        id: generateId(),
        role: 'error',
        content: 'Unable to send message. Please try again.',
        canRetry: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };
  
  return (
    <ChatContext.Provider value={{
      messages,
      sendMessage,
      isTyping,
      clearMessages,
      retryMessage: sendMessage // Simple retry = resend
    }}>
      {children}
    </ChatContext.Provider>
  );
};
```

#### StreamingChatProvider.jsx (Pure Streaming)
Key characteristics:
- USES StreamingRegistry
- USES placeholders
- USES partial updates
- EventSource for SSE
- Progressive rendering
- No HTTP fallback logic

This is essentially the current ChatProvider with all HTTP fallback code removed.

#### MessageBubble.jsx (Simplified)
Remove 300+ lines of streaming logic:
- No streamingFlag calculation
- No StreamingRegistry subscription  
- No useLayoutEffect for text nodes
- No mutation observers
- Just renders content directly

```javascript
export default function MessageBubble({ 
  role, 
  content, 
  metadata,
  onRetry 
}) {
  // NO streaming logic whatsoever
  // Just renders what it's given
  
  return (
    <div className={`message ${role}`}>
      <div className="message-content">
        {!isUser && <MessageHeader />}
        
        {/* Just render the content directly */}
        <div 
          className="message-text"
          dangerouslySetInnerHTML={{ __html: content }}
        />
        
        {metadata?.canRetry && (
          <button onClick={onRetry}>Try again</button>
        )}
      </div>
    </div>
  );
}
```

### Phase 3: Configuration Updates (30 minutes)

Update streaming-config.js to make decision once:
```javascript
// Read ONCE at app initialization
const STREAMING_MODE = (() => {
  const config = localStorage.getItem('PICASSO_STREAMING_MODE');
  if (config) return config === 'true';
  
  // Default based on environment
  return process.env.REACT_APP_STREAMING_ENABLED === 'true';
})();

export const isStreamingEnabled = () => STREAMING_MODE;
```

### Phase 4: Testing & Validation (1 hour)

## Performance Improvements

### Before (Current System):
- **Response time**: 45+ seconds (timeout/retry cycles)
- **Render cycles**: 100+ checks per message
- **Memory**: Constant StreamingRegistry allocations even when not streaming
- **CPU**: Continuous streaming checks during render
- **Console spam**: 100+ "FORCE OVERRIDE ACTIVE" logs

### After (Dual-Path):
- **Response time**: <2 seconds for HTTP, instant for streaming
- **Render cycles**: 0 streaming checks (decision made once)
- **Memory**: Only allocate what's needed for chosen path
- **CPU**: No wasted cycles on path checking
- **Console**: Clean, minimal logging

## Migration Strategy

### Step 1: Parallel Development
Build new providers alongside existing code with feature flag:
```javascript
const USE_NEW_ARCHITECTURE = localStorage.getItem('USE_NEW_DUAL_PATH') === 'true';

const ChatProvider = USE_NEW_ARCHITECTURE 
  ? NewChatProvider 
  : LegacyChatProvider;
```

### Step 2: Testing Phases
1. **Local Development** (Day 1)
   - Developer testing with feature flag
   - Performance benchmarks
   
2. **Staging Deployment** (Days 2-3)
   - Full staging validation
   - A/B testing both paths
   
3. **Production Rollout** (Week 2)
   - 10% rollout with monitoring
   - 50% rollout after 24 hours stable
   - 100% rollout after 48 hours stable

### Step 3: Cleanup (Week 3)
- Remove legacy ChatProvider
- Remove feature flags
- Archive old streaming checks

## Testing Strategy

### Unit Tests

**HTTPChatProvider Tests**:
```javascript
describe('HTTPChatProvider', () => {
  it('should complete request in <2 seconds', async () => {
    const start = Date.now();
    await provider.sendMessage('test');
    expect(Date.now() - start).toBeLessThan(2000);
  });
  
  it('should NOT use StreamingRegistry', () => {
    expect(streamingRegistry.subscribe).not.toHaveBeenCalled();
  });
  
  it('should wrap content in .streaming-formatted div', () => {
    const message = await provider.sendMessage('test');
    expect(message.content).toContain('class="streaming-formatted"');
  });
});
```

**Provider Selection Tests**:
```javascript
it('should select provider only on initialization', () => {
  const spy = jest.spyOn(console, 'log');
  render(<ChatProvider />);
  
  // Should log ONCE
  expect(spy).toHaveBeenCalledWith(
    expect.stringContaining('CHAT PROVIDER INITIALIZED')
  );
  expect(spy).toHaveBeenCalledTimes(1);
  
  // Re-render multiple times
  rerender(<ChatProvider />);
  rerender(<ChatProvider />);
  
  // Still only called once
  expect(spy).toHaveBeenCalledTimes(1);
});
```

### Integration Tests
- HTTP path completes in <2 seconds
- Streaming path uses EventSource
- No cross-contamination between paths
- CSS styling consistent between paths

### Performance Benchmarks
- Message render time <10ms (down from 100ms+)
- Zero streaming checks during HTTP mode
- Memory usage reduced by 50%

## Success Metrics

### Immediate (Day 1):
- ✅ HTTP responses in <2 seconds
- ✅ Zero "FORCE OVERRIDE ACTIVE" logs
- ✅ No timeout errors for HTTP requests
- ✅ Clean separation of providers

### Week 1:
- ✅ 90% reduction in render cycles
- ✅ 50% reduction in memory usage
- ✅ Clean separation verified by 0 cross-dependencies
- ✅ Both paths stable in staging

### Month 1:
- ✅ Both paths stable in production
- ✅ Easy to switch between modes
- ✅ Developer happiness: "It just works"
- ✅ Support tickets related to timeouts: 0

## Risk Mitigation

### Risk 1: Breaking existing functionality
**Mitigation**: Feature flag allows instant rollback to legacy system

### Risk 2: CSS styling differences between paths
**Mitigation**: Both paths wrap content in `.streaming-formatted` div for consistency

### Risk 3: Message ID compatibility
**Mitigation**: Use same ID generation logic for both paths

### Risk 4: Conversation context compatibility
**Mitigation**: Share conversation manager between both providers

## Development Checklist

### Pre-Development:
- [ ] Backup current ChatProvider.jsx
- [ ] Create feature flag mechanism  
- [ ] Set up parallel testing environment
- [ ] Document current message flow

### Development Tasks:
- [ ] Create `/context/shared/` directory
- [ ] Extract shared utilities to `messageHelpers.js`
- [ ] Create `HTTPChatProvider.jsx` (no streaming code)
- [ ] Create `StreamingChatProvider.jsx` (no HTTP fallback)
- [ ] Simplify `ChatProvider.jsx` to router only
- [ ] Strip streaming logic from `MessageBubble.jsx`
- [ ] Remove all runtime streaming checks
- [ ] Update imports throughout codebase
- [ ] Add feature flag toggle

### Testing Tasks:
- [ ] Unit tests for HTTPChatProvider
- [ ] Unit tests for StreamingChatProvider
- [ ] Integration tests for provider selection
- [ ] Performance benchmarks
- [ ] A/B test both paths in staging
- [ ] Load testing for both paths
- [ ] Memory leak testing

### Documentation:
- [ ] Update architecture diagrams
- [ ] Document provider selection logic
- [ ] Create troubleshooting guide
- [ ] Update developer onboarding

### Deployment:
- [ ] Deploy with feature flag OFF
- [ ] Enable for internal team (10%)
- [ ] Monitor performance metrics
- [ ] Enable for staging (100%)
- [ ] Monitor for 24 hours
- [ ] Gradual production rollout (10% → 50% → 100%)
- [ ] Remove feature flag after stable

## Technical Details

### Why This Works

The current system fails because it tries to be both HTTP and Streaming simultaneously:
- Every component asks "am I streaming?" on every render
- HTTP path carries streaming baggage (placeholders, registries, timeouts)
- Streaming path has HTTP fallbacks that interfere

The new system succeeds because:
- **Decision made once**: At initialization, never again
- **Clean separation**: Each path is pure and optimized
- **No interference**: Paths never check for each other
- **Appropriate timeouts**: HTTP uses 15s, Streaming uses appropriate SSE timeouts

### Lambda Compatibility

The Lambda Master Function already supports both paths properly:
- `action=chat` → HTTP response (immediate)
- `action=chat&streaming=true` → SSE streaming response

No Lambda changes required.

## Conclusion

This architecture solves the core problem: **The system tries to be both HTTP and Streaming at the same time instead of being one OR the other.**

By implementing true dual-path architecture:
- **HTTP Mode**: Fast, simple, no streaming baggage
- **Streaming Mode**: Real-time, progressive, no HTTP limitations  
- **Never Both**: Decision made once at startup

**Expected Result**: 45 seconds → <2 seconds for HTTP responses, with cleaner code, better maintainability, and happier users.

The key insight: **Don't disable streaming 100 times per render. Choose your path once and commit to it.**

---

**Next Steps**: 
1. Review and approve this plan
2. Create feature branch `feature/dual-path-architecture`
3. Begin Phase 1 implementation
4. Report progress daily

**Questions/Concerns**: Please raise in the project channel or comment on this document.