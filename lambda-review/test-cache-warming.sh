#!/bin/bash

# Test script for cache warming functionality

TENANT_HASH="my87674d777bf9"  # Replace with your tenant hash
# Using staging Lambda Function URL directly
LAMBDA_URL="https://xo6tsuhi6u2fby3rkw4usa663q0igxjk.lambda-url.us-east-1.on.aws"

echo "🔥 Testing Cache Warming for Tenant: ${TENANT_HASH:0:8}..."
echo ""

# 1. Check initial cache status
echo "📊 Checking initial cache status..."
curl -s "${LAMBDA_URL}?action=cache_status" | jq '.'
echo ""

# 2. Warm the cache for the tenant
echo "🔥 Warming cache for tenant ${TENANT_HASH:0:8}..."
curl -s "${LAMBDA_URL}?action=warm_cache&t=${TENANT_HASH}" | jq '.'
echo ""

# 3. Check cache status after warming
echo "📊 Checking cache status after warming..."
curl -s "${LAMBDA_URL}?action=cache_status" | jq '.'
echo ""

# 4. Test a cached question (should be instant)
echo "💬 Testing a cached question response..."
time curl -s -X POST "${LAMBDA_URL}?action=chat&t=${TENANT_HASH}" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_hash": "'${TENANT_HASH}'",
    "user_input": "How do I apply?",
    "session_id": "test_session_123"
  }' | jq '.body | fromjson | .body | fromjson | .content' -r | head -c 100
echo "..."
echo ""

echo "✅ Cache warming test complete!"
echo ""
echo "Expected results:"
echo "  - Cache warming should cache 3-8 questions (depending on tenant config)"
echo "  - Cached responses should return in <1 second"
echo "  - First response after warming should be significantly faster"