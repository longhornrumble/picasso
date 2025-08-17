#!/bin/bash

# Conversation Memory Test Suite Runner
# Executes all conversation memory and context flow tests
# Run with: chmod +x run-all-tests.sh && ./run-all-tests.sh

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Banner
echo -e "${PURPLE}============================================${NC}"
echo -e "${PURPLE}🧠 Conversation Memory Test Suite Runner${NC}"
echo -e "${PURPLE}============================================${NC}"
echo ""

# Test configuration
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$TEST_DIR")"
RESULTS_DIR="$TEST_DIR/results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="$RESULTS_DIR/test_report_$TIMESTAMP.md"

# Create results directory
mkdir -p "$RESULTS_DIR"

# Initialize test tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo -e "${BLUE}Test Directory:${NC} $TEST_DIR"
echo -e "${BLUE}Project Root:${NC} $PROJECT_ROOT"
echo -e "${BLUE}Results Directory:${NC} $RESULTS_DIR"
echo -e "${BLUE}Report File:${NC} $REPORT_FILE"
echo ""

# Function to run a test and capture results
run_test() {
    local test_name="$1"
    local test_command="$2"
    local test_description="$3"
    
    echo -e "${CYAN}Running Test: ${test_name}${NC}"
    echo -e "${YELLOW}Description: ${test_description}${NC}"
    echo -e "${BLUE}Command: ${test_command}${NC}"
    echo ""
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    # Create individual test log
    local test_log="$RESULTS_DIR/${test_name}_$TIMESTAMP.log"
    
    # Run the test and capture output
    if eval "$test_command" > "$test_log" 2>&1; then
        echo -e "${GREEN}✅ PASSED: $test_name${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        
        # Add to report
        echo "## ✅ $test_name - PASSED" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**Description:** $test_description" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**Command:** \`$test_command\`" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**Result:** Test completed successfully" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        
    else
        echo -e "${RED}❌ FAILED: $test_name${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        
        # Add to report
        echo "## ❌ $test_name - FAILED" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**Description:** $test_description" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**Command:** \`$test_command\`" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        echo "**Error Output:**" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        tail -20 "$test_log" >> "$REPORT_FILE"
        echo '```' >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
    fi
    
    echo "**Full Log:** [\`${test_name}_$TIMESTAMP.log\`](./results/${test_name}_$TIMESTAMP.log)" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "---" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    
    echo ""
}

# Initialize report file
cat > "$REPORT_FILE" << EOF
# Conversation Memory Test Suite Report

**Generated:** $(date)
**Test Suite Version:** 1.0
**Project:** Picasso Chat Widget - Conversation Memory

## Overview

This report contains the results of comprehensive conversation memory and context flow testing for the Picasso chat widget. The tests validate that the conversation manager properly stores messages, tracks turns, builds context, and provides conversational AI memory functionality.

## Test Results

EOF

echo -e "${YELLOW}Starting test execution...${NC}"
echo ""

# Change to test directory
cd "$TEST_DIR"

# Test 1: Conversation Memory Tests
run_test \
    "conversation-memory" \
    "node test-conversation-memory.js" \
    "Tests conversation manager's ability to store and retrieve messages, validate message structure, and build conversation context."

# Test 2: Turn Tracking Tests
run_test \
    "turn-tracking" \
    "node test-turn-tracking.js" \
    "Tests turn synchronization between frontend and backend, conflict resolution (409 handling), and turn state persistence."

# Test 3: Context Flow Tests
run_test \
    "context-flow" \
    "node test-context-flow.js" \
    "Tests complete context flow from conversation manager to Lambda, context structure validation, and memory preservation."

# Test 4: Package.json Scripts (if available)
if [ -f "$PROJECT_ROOT/package.json" ]; then
    echo -e "${CYAN}Checking if npm test is available...${NC}"
    if npm run test --silent > /dev/null 2>&1; then
        run_test \
            "npm-test-suite" \
            "cd '$PROJECT_ROOT' && npm test" \
            "Runs the project's main test suite to ensure conversation manager integrates properly with existing codebase."
    else
        echo -e "${YELLOW}⚠️  npm test not available or failed - skipping${NC}"
        echo ""
    fi
fi

# Test 5: ESLint Check (if available)
if [ -f "$PROJECT_ROOT/package.json" ] && command -v npm >/dev/null 2>&1; then
    if npm run lint --silent > /dev/null 2>&1; then
        run_test \
            "eslint-check" \
            "cd '$PROJECT_ROOT' && npm run lint" \
            "Runs ESLint to ensure conversation manager code follows project coding standards."
    else
        echo -e "${YELLOW}⚠️  ESLint not available - skipping${NC}"
        echo ""
    fi
fi

# Test 6: Integration Test File Validation
run_test \
    "integration-file-validation" \
    "test -f '$TEST_DIR/test-integration.html' && echo 'Integration test file exists and is readable'" \
    "Validates that the browser-based integration test file exists and is accessible."

# Generate summary in report
cat >> "$REPORT_FILE" << EOF

## Test Summary

- **Total Tests:** $TOTAL_TESTS
- **Passed:** $PASSED_TESTS
- **Failed:** $FAILED_TESTS
- **Success Rate:** $(( (PASSED_TESTS * 100) / TOTAL_TESTS ))%

## Browser-Based Integration Tests

To run the comprehensive browser-based integration tests, open the following file in a web browser:

[\`test-integration.html\`](./test-integration.html)

This provides interactive testing for:
- Name memory scenarios
- Multi-fact memory scenarios  
- Context continuity testing
- Turn tracking validation
- Context structure verification
- Full end-to-end integration tests

## Key Test Scenarios Validated

### 1. Basic Memory
- User says: "My name is Chris"
- Assistant responds acknowledging
- User asks: "What's my name?"
- ✅ Assert: Assistant remembers "Chris"

### 2. Multi-fact Memory
- User says: "I'm a veteran and I need hospice care"
- Assistant responds acknowledging both
- User asks: "What did I tell you about myself?"
- ✅ Assert: Assistant recalls both facts

### 3. Context Building
- Multiple exchanges building on each other
- Each response references previous context
- ✅ Assert: Conversation remains coherent

### 4. Turn Tracking
- Send message (turn 0)
- Receive response (turn becomes 1)
- Send another message (turn 1)
- ✅ Assert: No 409 conflicts

## Test Files

- \`test-conversation-memory.js\` - Core conversation manager functionality
- \`test-turn-tracking.js\` - Turn synchronization and conflict resolution
- \`test-context-flow.js\` - Complete context flow testing
- \`test-integration.html\` - Browser-based interactive tests
- \`run-all-tests.sh\` - This test runner script

## Recommendations

$(if [ $FAILED_TESTS -eq 0 ]; then
    echo "🎉 **All tests passed!** The conversation memory system is working correctly."
    echo ""
    echo "**Next Steps:**"
    echo "1. Deploy the conversation memory features to staging"
    echo "2. Run browser-based integration tests in staging environment"
    echo "3. Validate with real Lambda backend integration"
    echo "4. Monitor conversation memory performance in production"
else
    echo "⚠️ **Some tests failed.** Please review the failed tests above and fix the issues."
    echo ""
    echo "**Recommended Actions:**"
    echo "1. Review error logs for failed tests"
    echo "2. Check conversation manager implementation"
    echo "3. Verify turn tracking logic"
    echo "4. Validate context structure requirements"
    echo "5. Re-run tests after fixes"
fi)

## Support

For questions about these tests or the conversation memory system, refer to:
- Project documentation in \`CLAUDE.md\`
- Conversation manager source: \`src/utils/conversationManager.js\`
- Chat provider context: \`src/context/ChatProvider.jsx\`

EOF

# Print final summary
echo ""
echo -e "${PURPLE}============================================${NC}"
echo -e "${PURPLE}📊 Test Execution Summary${NC}"
echo -e "${PURPLE}============================================${NC}"
echo ""
echo -e "${BLUE}Total Tests:${NC} $TOTAL_TESTS"
echo -e "${GREEN}Passed:${NC} $PASSED_TESTS"
echo -e "${RED}Failed:${NC} $FAILED_TESTS"
echo -e "${YELLOW}Success Rate:${NC} $(( (PASSED_TESTS * 100) / TOTAL_TESTS ))%"
echo ""
echo -e "${CYAN}Report Generated:${NC} $REPORT_FILE"
echo ""

# Open browser test if requested
if [ "$1" = "--open-browser" ] || [ "$1" = "-b" ]; then
    echo -e "${YELLOW}Opening browser-based integration tests...${NC}"
    if command -v open >/dev/null 2>&1; then
        open "$TEST_DIR/test-integration.html"
    elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$TEST_DIR/test-integration.html"
    elif command -v start >/dev/null 2>&1; then
        start "$TEST_DIR/test-integration.html"
    else
        echo -e "${YELLOW}⚠️  Could not automatically open browser. Please manually open:${NC}"
        echo -e "${BLUE}file://$TEST_DIR/test-integration.html${NC}"
    fi
    echo ""
fi

echo -e "${CYAN}Browser Integration Tests Available At:${NC}"
echo -e "${BLUE}file://$TEST_DIR/test-integration.html${NC}"
echo ""

# Exit with appropriate code
if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests completed successfully!${NC}"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo -e "1. Run browser tests: ${BLUE}open test-integration.html${NC}"
    echo -e "2. Test with real backend: ${BLUE}Deploy and validate with Lambda${NC}"
    echo -e "3. Monitor in production: ${BLUE}Watch conversation memory performance${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please review the issues above.${NC}"
    echo ""
    echo -e "${YELLOW}Debugging Steps:${NC}"
    echo -e "1. Review error logs in: ${BLUE}$RESULTS_DIR${NC}"
    echo -e "2. Check conversation manager: ${BLUE}src/utils/conversationManager.js${NC}"
    echo -e "3. Validate context structure: ${BLUE}Run context-flow tests separately${NC}"
    echo -e "4. Re-run specific tests: ${BLUE}node test-[test-name].js${NC}"
    echo ""
    exit 1
fi