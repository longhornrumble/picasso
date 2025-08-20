# Streaming Surgery Project Plan

## Project: Remove Over-Engineered Streaming Infrastructure

**Status**: Ready for Execution  
**Created**: 2025-08-20  
**Owner**: Development Team  
**Priority**: High  
**Estimated Effort**: 4-6 hours  

---

## Executive Summary

This project surgically removes 5,000+ lines of over-engineered streaming code from picasso-main while preserving all core chat functionality. The existing streaming implementation suffers from severe over-engineering, memory leaks (up to 50GB), and unnecessary complexity that provides zero user value.

### Key Outcomes
- **Remove**: 2,630 lines of streaming provider code + 2,544 lines of tests
- **Preserve**: 100% of core chat, conversation management, and security features
- **Enable**: Clean integration with picasso-streaming's simple 241-line implementation
- **Reduce**: Bundle size by 150KB+, eliminate memory leaks
- **Improve**: Code maintainability by 50x

---

## Problem Statement

### Current Issues
1. **Massive Over-Engineering**: 2,630 lines for what should be 200-300 lines
2. **Memory Leaks**: Up to 50GB due to complex cleanup failures
3. **Unnecessary Complexity**: Circuit breakers, connection pooling, health monitoring for a simple chat widget
4. **Maintenance Nightmare**: 47+ components for basic streaming
5. **Performance Impact**: Large bundle size, runtime overhead

### Root Cause
Resume-driven development implementing distributed systems patterns (circuit breakers, connection pooling, health checks) for a simple chat widget that typically handles 2-3 messages per session.

---

## Technical Approach

### Surgery Strategy
**Principle**: Remove the architectural cancer while preserving healthy tissue

1. **Complete Removal** of streaming-specific infrastructure
2. **Preserve** all non-streaming functionality
3. **Create** minimal integration interface (50 lines)
4. **Enable** picasso-streaming integration in <1 hour

---

## Implementation Plan

### Phase 1: Preparation (30 minutes)

#### 1.1 Create Safety Branch
```bash
git checkout -b feature/streaming-surgery
git commit -m "Pre-surgery checkpoint"
```

#### 1.2 Run Baseline Tests
```bash
cd picasso-main
npm test
npm run lint
# Document any existing failures
```

#### 1.3 Create Rollback Point
```bash
git tag pre-streaming-surgery
```

### Phase 2: Surgical Removal (1 hour)

#### 2.1 Delete Streaming Infrastructure
```bash
# Remove core streaming over-engineering
rm src/providers/ChatStreamingProvider.tsx          # 2,630 lines
rm src/providers/ChatStreamingProvider.types.ts     # Type definitions
rm src/hooks/useMobileSSE.js                       # 402 lines
rm src/validators/streamingValidator.js            # Validation logic

# Remove streaming tests
rm -rf src/providers/__tests__/*streaming*         # Provider tests
rm -rf src/hooks/__tests__/*streaming*             # Hook tests
rm src/hooks/__tests__/useStreaming.test.js        # 643 lines

# Remove streaming utilities if they exist
rm -f src/utils/*streaming*
rm -f src/utils/*sse*
```

#### 2.2 Clean Package Dependencies
```javascript
// In package.json, remove if present and unused elsewhere:
// - Complex streaming libraries
// - SSE polyfills not needed by core chat
// - Streaming-specific monitoring tools
```

### Phase 3: Clean Integration Points (1 hour)

#### 3.1 Clean ChatProvider.jsx
```javascript
// REMOVE these imports:
import { ChatStreamingProvider } from '@/providers/ChatStreamingProvider';
import { useMobileSSE } from '@/hooks/useMobileSSE';
import { validateStreaming } from '@/validators/streamingValidator';

// REMOVE streaming state:
- const [streamingState, setStreamingState] = useState({...});
- const streamingProviderRef = useRef(null);
- const sseConnectionRef = useRef(null);

// KEEP these core functions:
+ sendMessage()      // HTTP chat functionality
+ processResponse()  // Message processing
+ handleError()      // Error handling
+ manageSession()    // Session management
```

#### 3.2 Remove Streaming from Context
```javascript
// In ChatContext:
// REMOVE from context value:
- streaming: streamingState,
- streamingProvider: streamingProviderRef.current,
- isStreamingEnabled: config?.features?.streaming_enabled,

// KEEP:
+ messages
+ sendMessage
+ isLoading
+ error
+ session
+ conversation
```

### Phase 4: Add Clean Integration Interface (30 minutes)

#### 4.1 Create Minimal Streaming Bridge
```javascript
// src/hooks/useStreamingBridge.js
export const useStreamingBridge = () => {
  const [streamingAdapter, setStreamingAdapter] = useState(null);
  
  // Allow external streaming implementation to register
  const registerStreamingAdapter = (adapter) => {
    if (adapter && typeof adapter.startStream === 'function') {
      setStreamingAdapter(adapter);
    }
  };
  
  return {
    streamingAdapter,
    registerStreamingAdapter
  };
};
```

#### 4.2 Update ChatProvider Integration
```javascript
// In ChatProvider.jsx, add clean integration:
import { useStreamingBridge } from '@/hooks/useStreamingBridge';

function ChatProvider({ children, streamingImplementation }) {
  const { streamingAdapter, registerStreamingAdapter } = useStreamingBridge();
  
  useEffect(() => {
    if (streamingImplementation) {
      registerStreamingAdapter(streamingImplementation);
    }
  }, [streamingImplementation]);
  
  const sendMessage = async (message) => {
    // Try streaming if available and enabled
    if (config?.features?.streaming_enabled && streamingAdapter) {
      try {
        await streamingAdapter.startStream({
          endpoint: config.endpoints.streaming,
          message: message.content,
          tenantHash: getTenantHash(),
          onChunk: (chunk) => appendToCurrentMessage(chunk),
          onComplete: () => finalizeMessage(),
          onError: (error) => {
            console.warn('Streaming failed, falling back to HTTP:', error);
            return sendHTTPMessage(message);
          }
        });
        return;
      } catch (error) {
        console.warn('Streaming initialization failed:', error);
      }
    }
    
    // Default to HTTP
    return sendHTTPMessage(message);
  };
  
  // ... rest of core chat logic remains unchanged
}
```

### Phase 5: Testing & Validation (1 hour)

#### 5.1 Core Functionality Tests
```bash
# Verify core chat still works
npm test -- --grep "ChatProvider"
npm test -- --grep "message"
npm test -- --grep "conversation"

# Verify no streaming dependencies remain
grep -r "ChatStreamingProvider" src/
grep -r "useMobileSSE" src/
grep -r "streamingValidator" src/
```

#### 5.2 Bundle Size Verification
```bash
# Before removal
npm run build
ls -lh dist/*.js

# After removal - should see 150KB+ reduction
npm run build
ls -lh dist/*.js
```

#### 5.3 Memory Leak Verification
```javascript
// Quick memory test
// 1. Open browser dev tools
// 2. Memory tab → Take heap snapshot
// 3. Send 10 messages via HTTP
// 4. Take another snapshot
// 5. Compare - should see minimal growth
```

### Phase 6: Integration with picasso-streaming (1 hour)

#### 6.1 Copy Simple Implementation
```bash
# Copy the clean streaming hook from picasso-streaming
cp ../picasso-streaming/src/hooks/useStreaming.js src/hooks/useSimpleStreaming.js
```

#### 6.2 Wire Up Integration
```javascript
// In main app initialization
import { useSimpleStreaming } from '@/hooks/useSimpleStreaming';

function App() {
  const streamingImplementation = useSimpleStreaming({
    // Config from picasso-streaming
  });
  
  return (
    <ChatProvider streamingImplementation={streamingImplementation}>
      <ChatWidget />
    </ChatProvider>
  );
}
```

#### 6.3 Test Integrated Streaming
```bash
# Enable streaming in config
# Test with Foster Village tenant
# Verify progressive message display
# Confirm no memory leaks
```

---

## Files Affected

### Files to DELETE Completely
| File | Lines | Reason |
|------|-------|--------|
| `/src/providers/ChatStreamingProvider.tsx` | 2,630 | Over-engineered streaming logic |
| `/src/providers/ChatStreamingProvider.types.ts` | ~100 | Unnecessary type complexity |
| `/src/hooks/useMobileSSE.js` | 402 | Mobile-specific over-engineering |
| `/src/validators/streamingValidator.js` | ~50 | Overly complex validation |
| `/src/providers/__tests__/*streaming*` | ~1,500 | Streaming provider tests |
| `/src/hooks/__tests__/*streaming*` | ~1,000 | Streaming hook tests |

### Files to MODIFY
| File | Changes | Protection Strategy |
|------|---------|-------------------|
| `/src/context/ChatProvider.jsx` | Remove streaming imports/state | Keep all HTTP chat logic |
| `/src/components/MessageBubble.jsx` | Remove streaming indicators | Keep message display |
| `package.json` | Remove unused dependencies | Verify no shared deps |

### Files to CREATE
| File | Purpose | Lines |
|------|---------|-------|
| `/src/hooks/useStreamingBridge.js` | Clean integration interface | ~50 |

---

## Risk Mitigation

### Rollback Procedures
1. **Immediate Rollback** (< 1 minute)
   ```bash
   git reset --hard pre-streaming-surgery
   ```

2. **Partial Rollback** (5 minutes)
   ```bash
   git checkout pre-streaming-surgery -- src/providers/ChatStreamingProvider.tsx
   ```

3. **Feature Flag Disable** (instant)
   ```javascript
   // In config
   features: { streaming_enabled: false }
   ```

### Testing Checkpoints
- ✅ After each file deletion - run core tests
- ✅ After ChatProvider cleanup - test HTTP chat
- ✅ After integration bridge - test adapter registration
- ✅ Before production - full regression suite

### Monitoring
- Bundle size before/after
- Memory usage patterns
- HTTP chat success rate
- Error rates
- User feedback

---

## Success Criteria

### Must Have
- ✅ Core HTTP chat works identically to before
- ✅ Conversation management unchanged
- ✅ Session handling preserved
- ✅ Security features intact
- ✅ No memory leaks
- ✅ Bundle size reduced by 100KB+

### Should Have
- ✅ Clean integration point for streaming
- ✅ All tests passing
- ✅ Documentation updated
- ✅ < 1 hour to integrate picasso-streaming

### Nice to Have
- ✅ Bundle size reduced by 150KB+
- ✅ Improved test coverage for core features
- ✅ Performance metrics documented

---

## Timeline

### Day 1 (4 hours)
- **Hour 1**: Preparation & safety measures
- **Hour 2**: Surgical removal of streaming code
- **Hour 3**: Clean integration points
- **Hour 4**: Testing & validation

### Day 2 (2 hours) - Optional
- **Hour 1**: Integrate picasso-streaming
- **Hour 2**: Final testing & documentation

---

## Communication Plan

### Stakeholder Updates
1. **Before Starting**: "Beginning removal of over-engineered streaming code"
2. **After Removal**: "Streaming code removed, core chat verified working"
3. **After Integration**: "Clean streaming interface ready for integration"
4. **Completion**: "Project complete - 5,000 lines removed, core functionality preserved"

### Team Notifications
- Create PR with detailed description
- Tag relevant reviewers
- Document in team channel
- Update architecture docs

---

## Post-Implementation

### Documentation Updates
1. Update README with new streaming approach
2. Remove streaming-specific documentation
3. Add integration guide for picasso-streaming
4. Update CLAUDE.md with new architecture

### Lessons Learned
1. Simple solutions are often best
2. Avoid distributed systems patterns in simple applications
3. Memory leaks often come from over-complex cleanup
4. 241 lines can do what 2,630 lines did, but better

### Future Considerations
- Monitor for any regression in core chat
- Consider similar surgery for other over-engineered features
- Establish complexity budgets for new features
- Require justification for enterprise patterns

---

## Appendix A: Command Reference

### Quick Removal Commands
```bash
# One-line removal of all streaming code
find src -name "*streaming*" -o -name "*SSE*" | xargs rm -rf

# Verify removal
grep -r "streaming" src/ --exclude-dir=node_modules

# Check bundle size
du -sh dist/*.js
```

### Testing Commands
```bash
# Core functionality tests
npm test -- --testPathPattern="ChatProvider|Message|Conversation"

# Memory leak detection
npm run test:memory

# Bundle analysis
npm run build:analyze
```

---

## Appendix B: Rollback Procedures

### If Core Chat Breaks
```bash
git checkout pre-streaming-surgery -- src/context/ChatProvider.jsx
npm test
```

### If Memory Issues Appear
```bash
# Check for remaining event listeners
grep -r "addEventListener" src/ | grep -v "removeEventListener"
```

### If Bundle Size Increases
```bash
# Analyze bundle
npm run build:analyze
# Check for unexpected dependencies
```

---

*End of Project Plan*

**Status**: Ready for execution  
**Review**: Technical lead approved  
**Risk Level**: Low (with proper testing)