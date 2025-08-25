# Picasso Widget Memory Test - End-to-End Testing Guide

## Overview

This end-to-end test suite validates conversation memory functionality in the Picasso chat widget using the actual esbuild-built widget with real API endpoints.

## Test Architecture

### Components Created

1. **`test-widget-memory.html`** - Main test interface with visual test results
2. **`test-widget-automation.js`** - Automation framework for widget interactions  
3. **`run-widget-test.sh`** - Script to start esbuild dev server and run tests

### Test Environment

- **Widget Source**: `http://localhost:8000/widget.js` (esbuild dev server)
- **Tenant**: `my87674d777bf9` (staging tenant)
- **Environment**: Staging with real API calls
- **Memory System**: JWT-based conversation tracking

## Prerequisites

1. Node.js and npm installed
2. All project dependencies installed (`npm install`)
3. No other processes using port 8000
4. Modern browser with developer tools access

## Running the Tests

### Method 1: Using the Test Runner Script (Recommended)

```bash
# Make script executable (if not already)
chmod +x run-widget-test.sh

# Run the test environment
./run-widget-test.sh
```

The script will:
1. Start esbuild dev server on port 8000
2. Verify widget.js is accessible
3. Optionally serve the test page on port 3000
4. Open the test page in your browser
5. Provide cleanup on exit

### Method 2: Manual Setup

1. **Start esbuild dev server:**
   ```bash
   npm run dev:esbuild
   ```

2. **Open test page:**
   ```bash
   # Option A: Direct file access
   open test-widget-memory.html
   
   # Option B: Serve with HTTP server
   python3 -m http.server 3000
   # Then open http://localhost:3000/test-widget-memory.html
   ```

## Test Scenarios

### Test 1: Name Memory Test
- **Purpose**: Verify AI remembers user's name across messages
- **Steps**:
  1. Send: "Hi, my name is Chris"
  2. Wait for response
  3. Send: "What's my name?"
  4. Verify response contains "Chris"

### Test 2: Context Memory Test  
- **Purpose**: Test complex context retention
- **Steps**:
  1. Send: "I'm a veteran looking for hospice care"
  2. Wait for response
  3. Send: "What did I tell you about myself?"
  4. Verify response mentions both "veteran" and "hospice"

### Test 3: Multi-turn Conversation
- **Purpose**: Test longer conversation context
- **Steps**:
  1. Send: "I'm Sarah and I work in technology"
  2. Send: "I'm also interested in healthcare benefits"
  3. Send: "What do you know about me so far?"
  4. Verify response includes "Sarah", "technology", and "healthcare"

### Error Monitoring
- **Purpose**: Detect conversation memory failures
- **Monitors**:
  - Console errors containing "409", "conversation", "memory"
  - Network 409 Conflict responses
  - JWT or token-related errors

## Test Interface Features

### Manual Controls
- **Open Widget**: Programmatically open the chat widget
- **Close Widget**: Close the chat widget
- **Toggle Widget**: Toggle widget open/closed state
- **Health Check**: Verify widget status and responsiveness

### Automated Tests
- **Individual Tests**: Run each memory test separately
- **Run All Tests**: Execute all tests sequentially
- **Reset Tests**: Clear all test results and logs

### Real-time Monitoring
- **Test Status Indicators**: Visual status (pending/running/success/error)
- **Message History**: Display of sent messages and AI responses
- **Error Log**: Real-time error detection and logging
- **Console Integration**: All test activity logged to browser console

## Understanding Test Results

### Success Criteria
- **Green status indicator**: Test passed
- **Message history shows**: Both user messages and AI responses
- **Context verification**: AI responses contain expected keywords
- **No errors**: Error monitor shows no memory-related issues

### Failure Indicators
- **Red status indicator**: Test failed
- **Missing context**: AI doesn't remember previous information
- **Timeout errors**: No response within 15 seconds
- **409 errors**: Conversation memory conflicts detected

## Troubleshooting

### Widget Fails to Load
```bash
# Check if esbuild server is running
curl http://localhost:8000/widget.js

# If not accessible, restart server
npm run dev:esbuild
```

### Cross-Origin Issues
- Serve test page with HTTP server instead of file:// protocol
- Check browser console for CORS errors

### Memory Test Failures
1. **Check Console**: Look for JWT or conversation errors
2. **Verify API**: Ensure staging endpoints are accessible
3. **Network Tab**: Check for 409 conflicts or failed requests
4. **Widget Health**: Use health check to verify widget status

### Automation Issues
- **Iframe Access**: Tests may fail if iframe content is cross-origin
- **Element Detection**: Check if widget UI structure has changed
- **Timing Issues**: Increase delays if responses are slow

## Technical Details

### Widget Automation Framework

The automation system (`test-widget-automation.js`) provides:

- **Cross-frame Communication**: Handles postMessage between host and iframe
- **Element Detection**: Finds input fields and buttons within widget
- **Text Simulation**: Types messages with realistic timing
- **Response Waiting**: Monitors for AI responses with timeout handling
- **Context Verification**: Checks AI responses for expected keywords

### Memory Verification Logic

Tests use an 80% keyword match threshold:
- If expected keywords = ["Chris", "name"]
- Response must contain at least 2 keywords to pass
- Case-insensitive matching
- Partial word matching supported

### Error Detection System

Monitors multiple error sources:
- **Console Errors**: Intercepts console.error() calls
- **Network Monitoring**: Wraps fetch() to detect HTTP errors
- **Widget Events**: Listens for widget-specific error events
- **JWT Issues**: Specifically watches for token/authentication errors

## Expected Behavior

### Normal Operation
1. Widget loads successfully from localhost:8000
2. Manual controls respond immediately
3. Test messages send within 2-3 seconds
4. AI responses arrive within 15 seconds
5. Context keywords found in responses
6. No error messages in monitoring

### Conversation Memory Working
- AI greets user by name in subsequent messages
- Complex context (veteran + hospice) maintained
- Multi-turn conversation builds on previous context
- No 409 Conflict errors
- Consistent conversation thread maintained

## Test Data and Privacy

- **Test Messages**: Use fictional personas and scenarios
- **Real API**: Tests use actual staging endpoints
- **Data Cleanup**: No mechanism to clear test conversations
- **Privacy**: Avoid real personal information in test messages

## Extending the Tests

### Adding New Test Scenarios

1. **Define test steps** in HTML script section:
   ```javascript
   const newTest = [
       { message: "First message", expectedContext: ["keyword1"] },
       { message: "Second message", expectedContext: ["keyword1", "keyword2"] }
   ];
   ```

2. **Add test button and status indicator** to HTML

3. **Implement test function** following existing pattern

### Customizing Verification Logic

Modify `verifyContext()` function in automation script:
- Adjust keyword matching threshold
- Add regex pattern matching
- Implement semantic similarity checks
- Add custom validation rules

### Enhanced Error Monitoring

Extend error detection in `setupConversationMemoryMonitoring()`:
- Add specific error code monitoring
- Implement performance threshold alerts
- Add custom error classification
- Integrate with external monitoring systems

## Success Metrics

A fully working conversation memory system should achieve:
- **100% test pass rate** across all scenarios
- **Zero 409 errors** during test execution
- **Response times** under 15 seconds
- **Context retention** across multiple turns
- **Consistent behavior** across test runs

## Integration with CI/CD

This test suite can be automated using:
- **Headless browsers** (Puppeteer, Playwright)
- **Test runners** (Jest, Mocha)
- **CI systems** (GitHub Actions, Jenkins)
- **Monitoring** (Custom dashboards, alerting)

Example headless automation:
```javascript
// Future enhancement: Puppeteer integration
const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto('http://localhost:3000/test-widget-memory.html');
await page.click('#run-all-btn');
const results = await page.evaluate(() => testResults);
```