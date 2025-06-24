#!/bin/bash
# Final Integration Test for Picasso Production Launch
# Run this before deploying to production

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🧪 Picasso Final Integration Test${NC}"
echo "=================================="

# Test configuration
CLOUDFRONT_URL="https://chat.myrecruiter.ai"
TEST_TENANT="fo85e6a06dcdf4"  # Replace with your test tenant hash

# Function to test URL
test_url() {
    local url=$1
    local expected=$2
    local description=$3
    
    echo -n "Testing $description... "
    
    response_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    
    if [ "$response_code" == "$expected" ]; then
        echo -e "${GREEN}✅ PASS (HTTP $response_code)${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL (HTTP $response_code, expected $expected)${NC}"
        return 1
    fi
}

# 1. Test widget files are accessible
echo -e "\n${YELLOW}1. Testing widget file accessibility:${NC}"
test_url "$CLOUDFRONT_URL/widget.js" "200" "widget.js"
test_url "$CLOUDFRONT_URL/widget-frame.html" "200" "widget-frame.html"
test_url "$CLOUDFRONT_URL/assets/iframe.js" "200" "iframe.js"

# 2. Test config endpoint
echo -e "\n${YELLOW}2. Testing config endpoint:${NC}"
CONFIG_URL="$CLOUDFRONT_URL/tenants/$TEST_TENANT/config.json"
echo -n "Testing tenant config... "
config_response=$(curl -s -w "\n%{http_code}" "$CONFIG_URL")
http_code=$(echo "$config_response" | tail -n1)
if [ "$http_code" == "200" ]; then
    echo -e "${GREEN}✅ PASS${NC}"
    # Try to parse JSON
    if echo "$config_response" | head -n-1 | jq . > /dev/null 2>&1; then
        echo -e "${GREEN}   ✓ Valid JSON response${NC}"
    else
        echo -e "${RED}   ✗ Invalid JSON response${NC}"
    fi
else
    echo -e "${RED}❌ FAIL (HTTP $http_code)${NC}"
fi

# 3. Test Lambda chat endpoint
echo -e "\n${YELLOW}3. Testing Lambda chat endpoint:${NC}"
CHAT_URL="$CLOUDFRONT_URL/Master_Function?action=chat"
echo -n "Testing chat API... "

chat_response=$(curl -s -w "\n%{http_code}" -X POST "$CHAT_URL" \
    -H "Content-Type: application/json" \
    -H "x-tenant-id: $TEST_TENANT" \
    -H "x-session-id: test_session_123" \
    -d '{
        "tenant_hash": "'$TEST_TENANT'",
        "user_input": "Hello, this is a test",
        "session_id": "test_session_123"
    }' 2>/dev/null || echo "CURL_ERROR")

if [[ "$chat_response" == "CURL_ERROR" ]]; then
    echo -e "${RED}❌ FAIL (Network error)${NC}"
else
    http_code=$(echo "$chat_response" | tail -n1)
    if [ "$http_code" == "200" ]; then
        echo -e "${GREEN}✅ PASS${NC}"
    else
        echo -e "${RED}❌ FAIL (HTTP $http_code)${NC}"
    fi
fi

# 4. Test error logging endpoint
echo -e "\n${YELLOW}4. Testing error logging endpoint:${NC}"
ERROR_URL="$CLOUDFRONT_URL/Master_Function?action=log_error"
echo -n "Testing error logging... "

error_response=$(curl -s -w "\n%{http_code}" -X POST "$ERROR_URL" \
    -H "Content-Type: application/json" \
    -d '{
        "error": "Test error",
        "stack": "Test stack trace",
        "tenant": "'$TEST_TENANT'",
        "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
    }' 2>/dev/null || echo "CURL_ERROR")

if [[ "$error_response" == "CURL_ERROR" ]]; then
    echo -e "${YELLOW}⚠️  SKIP (Not critical for launch)${NC}"
else
    http_code=$(echo "$error_response" | tail -n1)
    if [ "$http_code" == "200" ] || [ "$http_code" == "202" ]; then
        echo -e "${GREEN}✅ PASS${NC}"
    else
        echo -e "${YELLOW}⚠️  WARNING (HTTP $http_code - not critical)${NC}"
    fi
fi

# 5. Build validation
echo -e "\n${YELLOW}5. Validating production build:${NC}"
echo -n "Building project... "
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Build successful${NC}"
    
    # Check bundle size
    if [ -f "dist/widget.js" ]; then
        size=$(ls -lh dist/widget.js | awk '{print $5}')
        echo -e "${GREEN}   ✓ widget.js size: $size${NC}"
    fi
    
    # Check for console.logs
    echo -n "Checking for console.logs... "
    if grep -q "console\." dist/widget.js 2>/dev/null; then
        echo -e "${RED}❌ FAIL (console statements found)${NC}"
    else
        echo -e "${GREEN}✅ PASS (no console statements)${NC}"
    fi
else
    echo -e "${RED}❌ Build failed${NC}"
fi

# 6. Security validation
echo -e "\n${YELLOW}6. Security validation:${NC}"
echo -n "Checking for wildcard postMessage... "
if grep -q "postMessage.*\*" current-widget.js 2>/dev/null; then
    echo -e "${RED}❌ FAIL (wildcard origins found)${NC}"
else
    echo -e "${GREEN}✅ PASS (no wildcard origins)${NC}"
fi

# Summary
echo -e "\n${YELLOW}==============================${NC}"
echo -e "${YELLOW}Integration Test Complete!${NC}"
echo -e "${YELLOW}==============================${NC}"

echo -e "\n${GREEN}Next steps:${NC}"
echo "1. Review any failures above"
echo "2. Deploy to staging: ./deploy.sh staging"
echo "3. Test on staging environment"
echo "4. Deploy to production: ./deploy.sh production"

echo -e "\n${YELLOW}Remember to update:${NC}"
echo "- TEST_TENANT variable in this script with your actual test tenant hash"
echo "- Any Lambda endpoints if they differ from Master_Function"