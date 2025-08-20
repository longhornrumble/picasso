# ChatProvider.jsx Protection Map - Streaming Surgery

## Critical Functions to PROTECT (NEVER MODIFY)

### Core Chat Functions (Lines 999-1449)
1. **`addMessage` (999-1449)** - ✅ PROTECTED
   - Handles all message addition logic
   - Session validation and timing
   - Conversation manager integration
   - HTTP API calls (makeHTTPAPICall)
   - Fake streaming UX implementation

2. **`makeAPIRequest` (701-886)** - ✅ PROTECTED
   - Core HTTP request logic with retry
   - Error classification and recovery
   - Network-aware retry mechanism
   - Timeout handling

3. **`retryMessage` (888-997)** - ✅ PROTECTED
   - Manual retry functionality
   - Message state recovery
   - Error handling for retries

4. **`updateMessage` (1451-1457)** - ✅ PROTECTED
   - Message state updates
   - Used for progressive updates

5. **`clearMessages` (1459-1504)** - ✅ PROTECTED
   - Message clearing logic
   - Conversation manager cleanup
   - Session reset functionality

### Conversation Management (Lines 282-556)
1. **`conversationManagerRef` (182)** - ✅ PROTECTED
   - Core conversation state reference
   - Must remain untouched

2. **`validateAndPurgeSession` (185-210)** - ✅ PROTECTED
   - Session validation logic
   - Memory purge triggering
   - Session ID generation

3. **`performMemoryPurge` (213-255)** - ✅ PROTECTED  
   - Memory cleanup for expired sessions
   - Storage cleanup
   - Conversation manager clearing

4. **Conversation Manager Initialization (402-556)** - ✅ PROTECTED
   - Complex initialization logic
   - State token management
   - Mobile compatibility setup

### Session & State Management
1. **`sessionIdRef` (262)** - ✅ PROTECTED
2. **`STORAGE_KEYS` (174-178)** - ✅ PROTECTED
3. **`SESSION_TIMEOUT` (179)** - ✅ PROTECTED
4. **`loadPersistedMessages` (300-320)** - ✅ PROTECTED
5. **`debouncedPersistMessages` (349-364)** - ✅ PROTECTED

### Message Processing & Security
1. **`sanitizeMessage` (98-164)** - ✅ PROTECTED
   - XSS protection
   - Markdown processing
   - Link handling

2. **Marked.js configuration (24-92)** - ✅ PROTECTED
   - Markdown parsing setup
   - Auto-link extension
   - Security settings

### Error Handling & Network
1. **Error handling imports (5-13)** - ✅ PROTECTED
2. **Network monitoring (580-606)** - ✅ PROTECTED
3. **Abort controllers (345-346)** - ✅ PROTECTED

## Streaming-Related Code to REMOVE

### Imports to Remove
- Line 19: Comment says "Streaming removed - using HTTP only" (already removed)

### State Variables to Remove
- None identified (streaming state already removed)

### Functions to Clean
- **`addMessage` (1080-1124)** - Contains fake streaming UX code
  - Keep the function but could simplify the fake streaming part
  - Lines 1082-1124: Fake streaming placeholder logic
  - Lines 1305-1345: simulateStreaming function

### References to Remove
- Line 94-96: Comments about streaming utilities
- Line 343: Comment "HTTP-only chat (streaming removed)"
- Line 344: Comment "EventSource code removed - HTTP only"
- Line 687-689: Comment "Streaming availability check removed"
- Line 690-691: Comment "Streaming initialization removed"
- Line 1442: Comment "HTTP-only chat (streaming removed)"
- Line 1529: `streamingStatus: 'removed'` in debug object

### Context Values to Clean
- Line 1525: `streamingEndpoint: null` in _debug
- Line 1529: `streamingStatus: 'removed'` in _debug

## Files Referencing ChatProvider

### Components that Import ChatProvider
1. `src/iframe-main.jsx` - Entry point
2. Test files in `__tests__` directory
3. Any component using `useContext(ChatContext)`

## Test Coverage Requirements

### After Each Removal Step
```bash
# Core tests that MUST pass
npm test -- ChatProvider
npm test -- message
npm test -- conversation
npm test -- session

# Manual verification
1. Send a message - verify HTTP send
2. Receive response - verify display
3. Check conversation persistence
4. Trigger error - verify retry works
5. Clear messages - verify cleanup
```

## Integration Points Summary

### Clean Integration Points
1. Remove streaming-related comments (cosmetic)
2. Simplify fake streaming logic (optional)
3. Remove debug references to streaming
4. Keep ALL core functionality intact

### Risk Assessment
- **LOW RISK**: Comment removal
- **LOW RISK**: Debug object cleanup
- **MEDIUM RISK**: Fake streaming simplification
- **HIGH RISK**: Any modification to core functions

## Rollback Checkpoints

### After Phase 1 (Analysis)
- No changes yet, just documentation

### After Phase 2 (Safety Setup)
```bash
git tag pre-streaming-surgery
git checkout -b feature/streaming-surgery
```

### After Each File Deletion
```bash
git add -A
git commit -m "Removed [filename] - tests passing"
```

### If Any Core Test Fails
```bash
git reset --hard pre-streaming-surgery
```

## Final Validation Checklist

Before marking surgery complete:
- [ ] All message sending works
- [ ] All message receiving works
- [ ] Conversation persistence works
- [ ] Session management works
- [ ] Error retry works
- [ ] Memory purge works
- [ ] Network monitoring works
- [ ] No console errors
- [ ] Bundle size reduced
- [ ] All tests passing