#!/bin/bash

# PICASSO Monitoring and Validation Script
# Comprehensive health checks and performance validation

set -e

echo "📊 PICASSO System Monitoring and Validation"
echo "==========================================="
echo "⏰ Started at: $(date)"

# Configuration
ENVIRONMENT=${1:-production}
REGION="us-east-1"
STACK_NAME="picasso-streaming-${ENVIRONMENT}"

if [[ $ENVIRONMENT != "staging" && $ENVIRONMENT != "production" ]]; then
    echo "❌ Invalid environment. Use 'staging' or 'production'"
    exit 1
fi

echo "🔍 Monitoring $ENVIRONMENT environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Utility functions
success() { echo -e "${GREEN}✅ $1${NC}"; }
warning() { echo -e "${YELLOW}⚠️ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; }

# Validation results tracking
VALIDATION_RESULTS=()
CRITICAL_FAILURES=0
WARNING_COUNT=0

add_result() {
    local status=$1
    local test_name=$2
    local details=$3
    
    if [[ $status == "PASS" ]]; then
        success "$test_name: PASS"
    elif [[ $status == "WARN" ]]; then
        warning "$test_name: WARNING - $details"
        ((WARNING_COUNT++))
    else
        error "$test_name: FAIL - $details"
        ((CRITICAL_FAILURES++))
    fi
    
    VALIDATION_RESULTS+=("$status|$test_name|$details")
}

# Get stack outputs
get_stack_output() {
    local output_key=$1
    aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query "Stacks[0].Outputs[?OutputKey=='$output_key'].OutputValue" \
        --output text 2>/dev/null || echo ""
}

# Test 1: Stack Health
echo ""
echo "1️⃣ Testing CloudFormation Stack Health..."

STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].StackStatus' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [[ $STACK_STATUS == "CREATE_COMPLETE" || $STACK_STATUS == "UPDATE_COMPLETE" ]]; then
    add_result "PASS" "CloudFormation Stack" "Status: $STACK_STATUS"
else
    add_result "FAIL" "CloudFormation Stack" "Status: $STACK_STATUS"
fi

# Test 2: Lambda Functions Health
echo ""
echo "2️⃣ Testing Lambda Functions..."

# Master Function
MASTER_FUNCTION_NAME="Master_Function"
if [[ $ENVIRONMENT != "production" ]]; then
    MASTER_FUNCTION_NAME="${ENVIRONMENT}-Master-Function"
fi

MASTER_STATE=$(aws lambda get-function \
    --function-name $MASTER_FUNCTION_NAME \
    --region $REGION \
    --query 'Configuration.State' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [[ $MASTER_STATE == "Active" ]]; then
    add_result "PASS" "Master Function State" "Active"
else
    add_result "FAIL" "Master Function State" "$MASTER_STATE"
fi

# Bedrock Streaming Handler
STREAMING_FUNCTION_NAME="${ENVIRONMENT}-Bedrock-Streaming-Handler"
STREAMING_STATE=$(aws lambda get-function \
    --function-name $STREAMING_FUNCTION_NAME \
    --region $REGION \
    --query 'Configuration.State' \
    --output text 2>/dev/null || echo "NOT_FOUND")

if [[ $STREAMING_STATE == "Active" ]]; then
    add_result "PASS" "Streaming Function State" "Active"
elif [[ $STREAMING_STATE == "NOT_FOUND" ]]; then
    add_result "WARN" "Streaming Function State" "Function not deployed yet"
else
    add_result "FAIL" "Streaming Function State" "$STREAMING_STATE"
fi

# Test 3: Function URLs
echo ""
echo "3️⃣ Testing Function URLs..."

if [[ $STREAMING_STATE == "Active" ]]; then
    FUNCTION_URL=$(aws lambda get-function-url-config \
        --function-name $STREAMING_FUNCTION_NAME \
        --region $REGION \
        --query 'FunctionUrl' \
        --output text 2>/dev/null || echo "")
    
    if [[ -n $FUNCTION_URL ]]; then
        # Test CORS preflight
        CORS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
            -X OPTIONS \
            -H "Origin: https://chat.myrecruiter.ai" \
            -H "Access-Control-Request-Method: POST" \
            -H "Access-Control-Request-Headers: Content-Type,x-jwt-token" \
            "$FUNCTION_URL" --max-time 5 2>/dev/null || echo "000")
        
        if [[ $CORS_STATUS == "200" ]]; then
            add_result "PASS" "Function URL CORS" "URL: $FUNCTION_URL"
        else
            add_result "FAIL" "Function URL CORS" "HTTP $CORS_STATUS from $FUNCTION_URL"
        fi
    else
        add_result "FAIL" "Function URL Configuration" "No URL configured"
    fi
fi

# Test 4: DynamoDB Tables
echo ""
echo "4️⃣ Testing DynamoDB Tables..."

TABLES=("${ENVIRONMENT}-conversation-summaries" "${ENVIRONMENT}-recent-messages")
for table in "${TABLES[@]}"; do
    TABLE_STATUS=$(aws dynamodb describe-table \
        --table-name $table \
        --region $REGION \
        --query 'Table.TableStatus' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [[ $TABLE_STATUS == "ACTIVE" ]]; then
        # Check TTL configuration
        TTL_STATUS=$(aws dynamodb describe-time-to-live \
            --table-name $table \
            --region $REGION \
            --query 'TimeToLiveDescription.TimeToLiveStatus' \
            --output text 2>/dev/null || echo "DISABLED")
        
        if [[ $TTL_STATUS == "ENABLED" ]]; then
            add_result "PASS" "DynamoDB Table $table" "Active with TTL enabled"
        else
            add_result "WARN" "DynamoDB Table $table" "Active but TTL not enabled"
        fi
    else
        add_result "FAIL" "DynamoDB Table $table" "Status: $TABLE_STATUS"
    fi
done

# Test 5: JWT Secrets
echo ""
echo "5️⃣ Testing JWT Secrets..."

JWT_SECRET_NAME="picasso/${ENVIRONMENT}/jwt/signing-key"
SECRET_EXISTS=$(aws secretsmanager describe-secret \
    --secret-id $JWT_SECRET_NAME \
    --region $REGION \
    --query 'Name' \
    --output text 2>/dev/null || echo "")

if [[ -n $SECRET_EXISTS ]]; then
    # Test secret retrieval
    SECRET_VALUE=$(aws secretsmanager get-secret-value \
        --secret-id $JWT_SECRET_NAME \
        --region $REGION \
        --query 'SecretString' \
        --output text 2>/dev/null || echo "")
    
    if [[ -n $SECRET_VALUE ]]; then
        add_result "PASS" "JWT Secret" "Accessible and contains data"
    else
        add_result "FAIL" "JWT Secret" "Exists but cannot retrieve value"
    fi
else
    add_result "FAIL" "JWT Secret" "Secret not found: $JWT_SECRET_NAME"
fi

# Test 6: Master Function Endpoints
echo ""
echo "6️⃣ Testing Master Function Endpoints..."

# Determine Master Function URL
if [[ $ENVIRONMENT == "production" ]]; then
    MASTER_URL="https://chat.myrecruiter.ai/Master_Function"
else
    MASTER_URL="https://staging-chat.myrecruiter.ai/Master_Function"
fi

# Test health check endpoint
echo "Testing health check: $MASTER_URL?action=health_check"
HEALTH_RESPONSE=$(curl -s "$MASTER_URL?action=health_check" --max-time 10 2>/dev/null || echo "FAILED")
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.status' 2>/dev/null || echo "FAILED")

if [[ $HEALTH_STATUS == "healthy" ]]; then
    add_result "PASS" "Master Function Health" "Healthy response received"
else
    add_result "FAIL" "Master Function Health" "Response: $HEALTH_STATUS"
fi

# Test config endpoint (with invalid hash - should return 404 gracefully)
CONFIG_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "$MASTER_URL?action=get_config&t=test_invalid_hash" --max-time 10 2>/dev/null || echo "000")

if [[ $CONFIG_CODE == "404" ]]; then
    add_result "PASS" "Master Function Config Endpoint" "Correctly handles invalid hash"
elif [[ $CONFIG_CODE == "200" || $CONFIG_CODE == "400" ]]; then
    add_result "PASS" "Master Function Config Endpoint" "Responding appropriately"
else
    add_result "FAIL" "Master Function Config Endpoint" "HTTP $CONFIG_CODE"
fi

# Test 7: Performance Baselines
echo ""
echo "7️⃣ Testing Performance Baselines..."

# Measure JWT generation time (if applicable)
if [[ $HEALTH_STATUS == "healthy" ]]; then
    echo "Testing JWT generation performance..."
    START_TIME=$(date +%s%3N)
    
    # This would test JWT generation if endpoint exists
    JWT_TEST_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        "$MASTER_URL?action=generate_jwt&t=test_hash" --max-time 5 2>/dev/null || echo "404")
    
    END_TIME=$(date +%s%3N)
    JWT_DURATION=$((END_TIME - START_TIME))
    
    if [[ $JWT_TEST_CODE == "200" && $JWT_DURATION -lt 500 ]]; then
        add_result "PASS" "JWT Generation Performance" "${JWT_DURATION}ms (< 500ms target)"
    elif [[ $JWT_TEST_CODE == "404" ]]; then
        add_result "WARN" "JWT Generation Performance" "Endpoint not implemented yet"
    else
        add_result "FAIL" "JWT Generation Performance" "${JWT_DURATION}ms (>= 500ms)"
    fi
fi

# Test 8: CloudWatch Alarms
echo ""
echo "8️⃣ Testing CloudWatch Monitoring..."

EXPECTED_ALARMS=(
    "${ENVIRONMENT}-Master-Function-ErrorRate"
    "${ENVIRONMENT}-Streaming-Function-Latency"
    "${ENVIRONMENT}-CrossTenant-Access-Attempts"
)

ACTIVE_ALARMS=0
for alarm in "${EXPECTED_ALARMS[@]}"; do
    ALARM_STATE=$(aws cloudwatch describe-alarms \
        --alarm-names "$alarm" \
        --region $REGION \
        --query 'MetricAlarms[0].StateValue' \
        --output text 2>/dev/null || echo "NOT_FOUND")
    
    if [[ $ALARM_STATE != "NOT_FOUND" ]]; then
        ((ACTIVE_ALARMS++))
        if [[ $ALARM_STATE == "ALARM" ]]; then
            add_result "FAIL" "CloudWatch Alarm $alarm" "Currently in ALARM state"
        else
            add_result "PASS" "CloudWatch Alarm $alarm" "State: $ALARM_STATE"
        fi
    fi
done

if [[ $ACTIVE_ALARMS -lt 2 ]]; then
    add_result "WARN" "CloudWatch Monitoring" "Only $ACTIVE_ALARMS alarms found (expected 3)"
fi

# Test 9: Security Validation
echo ""
echo "9️⃣ Testing Security Configuration..."

# Test that Function URL rejects unauthenticated requests (if URL exists)
if [[ -n $FUNCTION_URL ]]; then
    UNAUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d '{"message": "test"}' \
        "$FUNCTION_URL" --max-time 5 2>/dev/null || echo "000")
    
    if [[ $UNAUTH_CODE == "401" || $UNAUTH_CODE == "403" ]]; then
        add_result "PASS" "Function URL Security" "Correctly rejects unauthenticated requests"
    else
        add_result "FAIL" "Function URL Security" "HTTP $UNAUTH_CODE (expected 401/403)"
    fi
fi

# Test 10: Cross-Tenant Isolation (Basic Check)
echo ""
echo "🔟 Testing Cross-Tenant Isolation..."

# Test with different tenant hashes - should not cross-contaminate
TENANT_TEST_1=$(curl -s -o /dev/null -w "%{http_code}" \
    "$MASTER_URL?action=get_config&t=tenant_1_hash" --max-time 5 2>/dev/null || echo "000")

TENANT_TEST_2=$(curl -s -o /dev/null -w "%{http_code}" \
    "$MASTER_URL?action=get_config&t=tenant_2_hash" --max-time 5 2>/dev/null || echo "000")

if [[ $TENANT_TEST_1 == "404" && $TENANT_TEST_2 == "404" ]]; then
    add_result "PASS" "Cross-Tenant Isolation" "Invalid hashes correctly rejected"
elif [[ $TENANT_TEST_1 -ge 400 && $TENANT_TEST_2 -ge 400 ]]; then
    add_result "PASS" "Cross-Tenant Isolation" "Appropriate error handling"
else
    add_result "WARN" "Cross-Tenant Isolation" "Unable to test with sample hashes"
fi

# Generate final report
echo ""
echo "📊 VALIDATION REPORT SUMMARY"
echo "============================"
echo "Environment: $ENVIRONMENT"
echo "Timestamp: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "Region: $REGION"
echo ""

TOTAL_TESTS=${#VALIDATION_RESULTS[@]}
PASSED_TESTS=$((TOTAL_TESTS - WARNING_COUNT - CRITICAL_FAILURES))

echo "📈 Test Results:"
echo "✅ Passed: $PASSED_TESTS"
echo "⚠️ Warnings: $WARNING_COUNT"  
echo "❌ Failed: $CRITICAL_FAILURES"
echo "📊 Total: $TOTAL_TESTS"
echo ""

# Overall health assessment
OVERALL_HEALTH="UNKNOWN"
if [[ $CRITICAL_FAILURES == 0 && $WARNING_COUNT == 0 ]]; then
    OVERALL_HEALTH="EXCELLENT"
    echo "🎯 Overall Health: ${GREEN}EXCELLENT${NC} - All systems operational"
elif [[ $CRITICAL_FAILURES == 0 ]]; then
    OVERALL_HEALTH="GOOD"
    echo "🎯 Overall Health: ${YELLOW}GOOD${NC} - Minor warnings detected"
elif [[ $CRITICAL_FAILURES -le 2 ]]; then
    OVERALL_HEALTH="DEGRADED"
    echo "🎯 Overall Health: ${YELLOW}DEGRADED${NC} - Some critical issues detected"
else
    OVERALL_HEALTH="CRITICAL"
    echo "🎯 Overall Health: ${RED}CRITICAL${NC} - Multiple critical failures"
fi

# Detailed results
echo ""
echo "📋 Detailed Results:"
echo "==================="
for result in "${VALIDATION_RESULTS[@]}"; do
    IFS='|' read -r status test_name details <<< "$result"
    if [[ $status == "PASS" ]]; then
        echo -e "${GREEN}✅${NC} $test_name: $details"
    elif [[ $status == "WARN" ]]; then
        echo -e "${YELLOW}⚠️${NC} $test_name: $details" 
    else
        echo -e "${RED}❌${NC} $test_name: $details"
    fi
done

# Recommendations
echo ""
echo "🎯 Recommendations:"
echo "=================="

if [[ $CRITICAL_FAILURES -gt 0 ]]; then
    echo "🚨 IMMEDIATE ACTION REQUIRED:"
    echo "- $CRITICAL_FAILURES critical failures must be resolved before production use"
    echo "- Review failed tests above and address root causes"
    echo "- Consider emergency rollback if system is in production"
fi

if [[ $WARNING_COUNT -gt 0 ]]; then
    echo "⚠️ ATTENTION NEEDED:"
    echo "- $WARNING_COUNT warnings should be addressed in next deployment"
    echo "- Review warning details and plan fixes"
fi

if [[ $OVERALL_HEALTH == "EXCELLENT" ]]; then
    echo "✅ SYSTEM READY:"
    echo "- All tests passed successfully"
    echo "- System is ready for production use"
    echo "- Continue monitoring for ongoing health"
fi

# Monitoring URLs
echo ""
echo "📊 Monitoring Links:"
echo "==================="
echo "CloudWatch Console: https://console.aws.amazon.com/cloudwatch/home?region=$REGION"
echo "Lambda Console: https://console.aws.amazon.com/lambda/home?region=$REGION"
echo "DynamoDB Console: https://console.aws.amazon.com/dynamodb/home?region=$REGION"
if [[ -n $MASTER_URL ]]; then
    echo "Health Check: $MASTER_URL?action=health_check"
fi

# Exit with appropriate code
echo ""
if [[ $CRITICAL_FAILURES == 0 ]]; then
    echo "✅ Monitoring completed successfully"
    exit 0
else
    echo "❌ Monitoring completed with critical failures"
    exit 1
fi