#!/bin/bash

# Pre-Production Validation Script
# Comprehensive testing, security, and quality checks before production deployment

set -e  # Exit on any error

echo "================================================"
echo "🚀 Pre-Production Validation Suite"
echo "================================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall status
VALIDATION_PASSED=true

# Function to print status
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        VALIDATION_PASSED=false
    fi
}

# Function to print section header
print_section() {
    echo ""
    echo "----------------------------------------"
    echo "📋 $1"
    echo "----------------------------------------"
}

# 1. DEPENDENCY AUDIT
print_section "Security Audit"
echo "Checking for known vulnerabilities..."
npm audit --audit-level=moderate
print_status $? "Security audit"

# Check for critical vulnerabilities specifically
npm audit --audit-level=critical
CRITICAL_VULNS=$?
if [ $CRITICAL_VULNS -ne 0 ]; then
    echo -e "${RED}⚠️  CRITICAL VULNERABILITIES FOUND - Must fix before production${NC}"
    VALIDATION_PASSED=false
fi

# 2. CODE QUALITY
print_section "Code Quality Checks"

# Linting
echo "Running ESLint..."
npm run lint
print_status $? "ESLint validation"

# 3. TESTS
print_section "Test Suite"

# Run all tests
echo "Running test suite..."
npm test -- --silent
print_status $? "Unit tests"

# Run test coverage
echo "Checking test coverage..."
npm run test:coverage -- --silent
print_status $? "Test coverage"

# 4. BUILD VALIDATION
print_section "Build Validation"

# Clean and build production
echo "Building production bundle..."
npm run clean
npm run build:production
print_status $? "Production build"

# Check bundle size
echo "Checking bundle sizes..."
WIDGET_SIZE=$(du -k dist/production/widget.js 2>/dev/null | cut -f1)
IFRAME_SIZE=$(du -k dist/production/iframe-main.js 2>/dev/null | cut -f1)

if [ -n "$WIDGET_SIZE" ] && [ "$WIDGET_SIZE" -lt 150 ]; then
    echo -e "${GREEN}✅ widget.js: ${WIDGET_SIZE}KB (< 150KB limit)${NC}"
else
    echo -e "${YELLOW}⚠️  widget.js: ${WIDGET_SIZE}KB (target < 150KB)${NC}"
fi

if [ -n "$IFRAME_SIZE" ] && [ "$IFRAME_SIZE" -lt 500 ]; then
    echo -e "${GREEN}✅ iframe-main.js: ${IFRAME_SIZE}KB (< 500KB limit)${NC}"
else
    echo -e "${YELLOW}⚠️  iframe-main.js: ${IFRAME_SIZE}KB (target < 500KB)${NC}"
fi

# 5. CONFIGURATION VALIDATION
print_section "Configuration Check"

# Check for production config
echo "Validating production configuration..."
if grep -q "STREAMING_ENABLED = true" src/config/streaming-config.js; then
    echo -e "${GREEN}✅ Streaming is enabled${NC}"
else
    echo -e "${YELLOW}⚠️  Streaming is disabled${NC}"
fi

# Check environment config
if [ -f "src/config/environment.js" ]; then
    echo -e "${GREEN}✅ Environment configuration exists${NC}"
else
    echo -e "${RED}❌ Environment configuration missing${NC}"
    VALIDATION_PASSED=false
fi

# 6. DUAL-PATH ARCHITECTURE VALIDATION
print_section "Dual-Path Architecture"

# Check if orchestrator is active
if grep -q "ChatProviderOrchestrator as ChatProvider" src/App.jsx; then
    echo -e "${GREEN}✅ Dual-path orchestrator is active${NC}"
else
    echo -e "${RED}❌ Dual-path orchestrator not configured${NC}"
    VALIDATION_PASSED=false
fi

# Check both providers exist
if [ -f "src/context/HTTPChatProvider.jsx" ] && [ -f "src/context/StreamingChatProvider.jsx" ]; then
    echo -e "${GREEN}✅ Both HTTP and Streaming providers present${NC}"
else
    echo -e "${RED}❌ Missing provider files${NC}"
    VALIDATION_PASSED=false
fi

# 7. LAMBDA VALIDATION
print_section "Lambda Configuration"

# Check for Lambda files
if [ -f "lambda-review/streaming/index.js" ]; then
    echo -e "${GREEN}✅ Streaming Lambda handler present${NC}"
else
    echo -e "${YELLOW}⚠️  Streaming Lambda handler missing${NC}"
fi

if [ -f "lambda-review/lambda-review/lambda_function.py" ]; then
    echo -e "${GREEN}✅ HTTP Lambda handler present${NC}"
else
    echo -e "${YELLOW}⚠️  HTTP Lambda handler missing${NC}"
fi

# 8. SECURITY CHECKS
print_section "Security Validation"

# Check for exposed secrets
echo "Scanning for exposed secrets..."
SECRETS_FOUND=false

# Check for API keys
if grep -r "api[_-]?key.*=.*['\"].*[A-Za-z0-9]" src/ --include="*.js" --include="*.jsx" 2>/dev/null | grep -v "// " | grep -v "config\." | head -1; then
    echo -e "${RED}❌ Potential API keys found in source${NC}"
    SECRETS_FOUND=true
    VALIDATION_PASSED=false
fi

# Check for AWS credentials
if grep -r "aws_access_key\|aws_secret" src/ --include="*.js" --include="*.jsx" 2>/dev/null | head -1; then
    echo -e "${RED}❌ Potential AWS credentials found${NC}"
    SECRETS_FOUND=true
    VALIDATION_PASSED=false
fi

if [ "$SECRETS_FOUND" = false ]; then
    echo -e "${GREEN}✅ No exposed secrets detected${NC}"
fi

# Check DOMPurify is imported where needed
if grep -q "import DOMPurify" src/components/chat/MessageBubble.jsx; then
    echo -e "${GREEN}✅ DOMPurify configured for XSS protection${NC}"
else
    echo -e "${YELLOW}⚠️  DOMPurify may not be configured${NC}"
fi

# 9. PERFORMANCE CHECKS
print_section "Performance Validation"

# Check for console.logs in production code
echo "Checking for console statements..."
CONSOLE_COUNT=$(grep -r "console\." src/ --include="*.jsx" --include="*.js" | grep -v "logger" | grep -v "//" | wc -l)
if [ $CONSOLE_COUNT -gt 10 ]; then
    echo -e "${YELLOW}⚠️  Found $CONSOLE_COUNT console statements (consider removing)${NC}"
else
    echo -e "${GREEN}✅ Minimal console statements ($CONSOLE_COUNT)${NC}"
fi

# 10. DOCUMENTATION CHECK
print_section "Documentation"

if [ -f "README.md" ]; then
    echo -e "${GREEN}✅ README.md present${NC}"
else
    echo -e "${YELLOW}⚠️  README.md missing${NC}"
fi

if [ -f "CLAUDE.md" ]; then
    echo -e "${GREEN}✅ CLAUDE.md present${NC}"
else
    echo -e "${YELLOW}⚠️  CLAUDE.md missing${NC}"
fi

# FINAL SUMMARY
echo ""
echo "================================================"
if [ "$VALIDATION_PASSED" = true ]; then
    echo -e "${GREEN}✅ PRE-PRODUCTION VALIDATION PASSED${NC}"
    echo "Ready for production deployment!"
    exit 0
else
    echo -e "${RED}❌ PRE-PRODUCTION VALIDATION FAILED${NC}"
    echo "Please fix the issues above before deploying to production."
    exit 1
fi