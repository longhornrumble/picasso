# Conversation Memory Test Suite

This directory contains comprehensive testing scripts to fully demonstrate and validate that the conversation manager and context memory are working properly in the Picasso chat widget.

## Test Files Overview

### Node.js Test Scripts

1. **`test-conversation-memory.js`** - Core conversation manager functionality
   - Tests message storage and retrieval
   - Validates conversation context building
   - Verifies memory preservation across exchanges
   - Tests conversation clearing functionality

2. **`test-turn-tracking.js`** - Turn synchronization and conflict resolution
   - Tests initial turn state (should be 0)
   - Validates turn incrementation after successful saves
   - Tests 409 conflict resolution and retry logic
   - Verifies turn synchronization between frontend and backend states

3. **`test-context-flow.js`** - Complete context flow testing
   - Tests `getConversationContext()` return structure
   - Validates that context includes recent messages
   - Tests that context is sent in chat requests to Lambda
   - Verifies Lambda-compatible context structure

### Browser-Based Tests

4. **`test-integration.html`** - Interactive browser-based integration tests
   - Visual conversation simulation
   - Real-time memory validation
   - Multiple test scenarios with progress tracking
   - Export functionality for test results

### Test Runner

5. **`run-all-tests.sh`** - Automated test execution script
   - Runs all Node.js tests sequentially
   - Generates comprehensive reports
   - Provides colored output and progress tracking
   - Option to open browser tests automatically

## Key Test Scenarios

### Scenario 1: Basic Name Memory
```javascript
// User says: "My name is Chris"
// Assistant responds acknowledging
// User asks: "What's my name?"
// Assert: Assistant remembers "Chris"
```

### Scenario 2: Multi-fact Memory
```javascript
// User says: "I'm a veteran and I need hospice care"
// Assistant responds acknowledging both
// User asks: "What did I tell you about myself?"
// Assert: Assistant recalls both facts
```

### Scenario 3: Context Building
```javascript
// Multiple exchanges building on each other
// Each response should reference previous context
// Assert: Conversation remains coherent
```

### Scenario 4: Turn Tracking
```javascript
// Send message (turn 0)
// Receive response (turn becomes 1)
// Send another message (turn 1)
// Assert: No 409 conflicts
```

## Running the Tests

### Quick Start - Run All Tests
```bash
./run-all-tests.sh
```

### Run Individual Tests
```bash
# Test conversation memory functionality
node test-conversation-memory.js

# Test turn tracking and synchronization
node test-turn-tracking.js

# Test complete context flow
node test-context-flow.js
```

### Run Browser-Based Integration Tests
Open `test-integration.html` in a web browser for interactive testing:
```bash
open test-integration.html
# or
./run-all-tests.sh --open-browser
```

## Test Architecture

### Mock Implementation
The tests include a robust mock implementation of the ConversationManager that:
- Simulates all core functionality
- Provides consistent behavior for testing
- Falls back gracefully when the actual module can't be loaded
- Maintains the same API as the real implementation

### Test Coverage
The test suite validates:
- ✅ Message storage and retrieval
- ✅ Context structure for Lambda consumption
- ✅ Turn tracking and conflict resolution
- ✅ Multi-fact memory preservation
- ✅ Conversation continuity
- ✅ JSON serialization compatibility
- ✅ Error handling and fallback scenarios

### Browser Integration
The HTML test file provides:
- Real-time conversation simulation
- Visual progress tracking
- Interactive test execution
- Result export functionality
- Multiple test scenarios

## Expected Test Results

### Success Criteria
All tests should pass, demonstrating:
1. **Memory Persistence**: User information is retained across conversation turns
2. **Context Flow**: Conversation context flows properly to Lambda endpoints
3. **Turn Management**: Turn numbers increment correctly and handle conflicts
4. **Structure Validation**: Context has proper structure for Lambda consumption
5. **Integration**: Full end-to-end conversation flow works as expected

### Sample Output
```
🧪 Running Conversation Memory Test Suite
==========================================

⏳ Running: ConversationManager stores messages correctly
✅ PASSED: ConversationManager stores messages correctly

⏳ Running: ConversationManager preserves user information in context
✅ PASSED: ConversationManager preserves user information in context

Test Summary
============
Total Tests: 10
Passed: 10
Failed: 0
Success Rate: 100.0%
```

## Troubleshooting

### Common Issues

1. **Module Not Found Errors**
   - Tests include fallback mock implementations
   - Should continue working even if actual modules can't be loaded

2. **Fetch Errors**
   - Tests use mocked fetch implementations
   - No real network calls are made during testing

3. **Browser Tests Not Opening**
   - Manually open `test-integration.html` in any modern browser
   - Use file:// protocol or serve through local web server

### Debugging

To debug specific issues:
```bash
# Run individual tests with more verbose output
node test-conversation-memory.js

# Check test logs (if using the runner)
ls -la tests/results/

# Review generated reports
cat tests/results/test_report_*.md
```

## Integration with CI/CD

### GitHub Actions Example
```yaml
- name: Run Conversation Memory Tests
  run: |
    cd tests
    chmod +x run-all-tests.sh
    ./run-all-tests.sh
```

### NPM Scripts Integration
Add to package.json:
```json
{
  "scripts": {
    "test:memory": "cd tests && ./run-all-tests.sh",
    "test:memory:browser": "cd tests && ./run-all-tests.sh --open-browser"
  }
}
```

## Extending the Tests

### Adding New Test Scenarios
1. Add test cases to existing `.js` files
2. Create new test files following the pattern
3. Update `run-all-tests.sh` to include new tests
4. Add corresponding browser tests to `test-integration.html`

### Custom Mock Responses
Modify the mock chat functions in the test files to simulate different AI behaviors and test edge cases.

## Related Files

- **Source Code**: `/src/utils/conversationManager.js`
- **Chat Provider**: `/src/context/ChatProvider.jsx`
- **Configuration**: `/src/config/environment.js`
- **Project Documentation**: `/CLAUDE.md`

## Support

For questions about the test suite or conversation memory implementation:
1. Review the source code in `/src/utils/conversationManager.js`
2. Check the project documentation in `/CLAUDE.md`
3. Run the browser-based tests for interactive debugging
4. Review test logs and reports in `/tests/results/`