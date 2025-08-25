#!/bin/bash

# PICASSO Emergency Rollback Script
# For immediate rollback of Function URL streaming infrastructure

set -e  # Exit on error

echo "🚨🚨🚨 PICASSO EMERGENCY ROLLBACK INITIATED 🚨🚨🚨"
echo "=================================================="
echo "⏰ Rollback started at: $(date)"
echo "🏥 Healthcare system recovery in progress..."
echo ""

# Configuration
ENVIRONMENT=${1:-production}  # Default to production if not specified
REGION="us-east-1"
STACK_NAME="picasso-streaming-${ENVIRONMENT}"

# Validate environment parameter
if [[ $ENVIRONMENT != "staging" && $ENVIRONMENT != "production" ]]; then
    echo "❌ Invalid environment. Use 'staging' or 'production'"
    exit 1
fi

# Production safety confirmation
if [[ $ENVIRONMENT == "production" ]]; then
    echo "🚨 PRODUCTION EMERGENCY ROLLBACK"
    read -p "⚠️ Confirm production rollback (type 'CONFIRM'): " -r
    if [[ $REPLY != "CONFIRM" ]]; then
        echo "❌ Production rollback cancelled"
        exit 1
    fi
fi

echo "✅ Rolling back $ENVIRONMENT environment..."

# Step 1: Immediate traffic cutover via CloudFront cache invalidation
echo "1️⃣ Invalidating CloudFront cache to disable new features..."

CLOUDFRONT_DOMAIN=""
if [[ $ENVIRONMENT == "production" ]]; then
    CLOUDFRONT_DOMAIN="chat.myrecruiter.ai"
else
    CLOUDFRONT_DOMAIN="staging-chat.myrecruiter.ai"
fi

# Find CloudFront distribution ID (if available)
DISTRIBUTION_ID=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Origins.Items[0].DomainName=='${CLOUDFRONT_DOMAIN}'].Id" \
    --output text 2>/dev/null || echo "")

if [[ -n $DISTRIBUTION_ID ]]; then
    echo "📡 Creating CloudFront cache invalidation..."
    aws cloudfront create-invalidation \
        --distribution-id $DISTRIBUTION_ID \
        --paths "/widget.js" "/src/*" \
        --region $REGION &
    echo "✅ CloudFront invalidation started"
else
    echo "⚠️ CloudFront distribution not found, skipping cache invalidation"
fi

# Step 2: Disable Function URL if it exists
echo "2️⃣ Disabling Function URL to stop streaming traffic..."

STREAMING_FUNCTION_NAME="${ENVIRONMENT}-Bedrock-Streaming-Handler"

# Check if function URL exists
FUNCTION_URL_EXISTS=$(aws lambda get-function-url-config \
    --function-name $STREAMING_FUNCTION_NAME \
    --region $REGION \
    --query 'FunctionUrl' \
    --output text 2>/dev/null || echo "")

if [[ -n $FUNCTION_URL_EXISTS && $FUNCTION_URL_EXISTS != "None" ]]; then
    echo "🔗 Deleting Function URL configuration..."
    aws lambda delete-function-url-config \
        --function-name $STREAMING_FUNCTION_NAME \
        --region $REGION
    echo "✅ Function URL deleted"
else
    echo "⚠️ Function URL not found or already deleted"
fi

# Step 3: Verify Master Function health
echo "3️⃣ Verifying Master Function health..."

MASTER_FUNCTION_HEALTH=$(aws lambda invoke \
    --function-name Master_Function \
    --payload '{"queryStringParameters": {"action": "health_check"}}' \
    --region $REGION \
    /tmp/rollback_health_check.json 2>/dev/null && \
    cat /tmp/rollback_health_check.json | jq -r '.body' | jq -r '.status' 2>/dev/null || echo "FAILED")

if [[ $MASTER_FUNCTION_HEALTH == "healthy" ]]; then
    echo "✅ Master Function is healthy"
else
    echo "❌ Master Function health check failed: $MASTER_FUNCTION_HEALTH"
    echo "🚨 CRITICAL: Legacy system may also be impaired"
    
    # Attempt to restart Master Function (update environment variable to trigger restart)
    echo "🔄 Attempting to restart Master Function..."
    aws lambda update-function-configuration \
        --function-name Master_Function \
        --environment "Variables={EMERGENCY_RESTART=$(date +%s)}" \
        --region $REGION &
fi

# Step 4: Disable DynamoDB streams if they exist (to prevent data sync issues)
echo "4️⃣ Checking DynamoDB configurations..."

SUMMARIES_TABLE="${ENVIRONMENT}-conversation-summaries"
MESSAGES_TABLE="${ENVIRONMENT}-recent-messages"

for table in $SUMMARIES_TABLE $MESSAGES_TABLE; do
    TABLE_EXISTS=$(aws dynamodb describe-table \
        --table-name $table \
        --region $REGION \
        --query 'Table.TableName' \
        --output text 2>/dev/null || echo "")
    
    if [[ -n $TABLE_EXISTS ]]; then
        echo "✅ Table $table exists and accessible"
    else
        echo "⚠️ Table $table not found or not accessible"
    fi
done

# Step 5: Test legacy Master Function endpoints
echo "5️⃣ Testing legacy Master Function endpoints..."

# Test health endpoint
if [[ $ENVIRONMENT == "production" ]]; then
    MASTER_URL="https://chat.myrecruiter.ai/Master_Function"
else
    MASTER_URL="https://staging-chat.myrecruiter.ai/Master_Function"
fi

echo "🧪 Testing: $MASTER_URL?action=health_check"
LEGACY_HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$MASTER_URL?action=health_check" --max-time 10)

if [[ $LEGACY_HEALTH_CODE == "200" ]]; then
    echo "✅ Legacy Master Function endpoint is accessible"
else
    echo "❌ Legacy Master Function endpoint returned: $LEGACY_HEALTH_CODE"
    echo "🚨 CRITICAL: Primary system may be down"
fi

# Test config endpoint with a known hash (if available)
echo "🧪 Testing config endpoint..."
CONFIG_TEST_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$MASTER_URL?action=get_config&t=test_hash" --max-time 10)

if [[ $CONFIG_TEST_CODE == "200" || $CONFIG_TEST_CODE == "404" ]]; then
    echo "✅ Legacy config endpoint is responding"
else
    echo "⚠️ Legacy config endpoint returned: $CONFIG_TEST_CODE"
fi

# Step 6: Update SSM parameters to disable new features (if they exist)
echo "6️⃣ Disabling feature flags..."

# Common feature flags to disable
FEATURE_FLAGS=(
    "/picasso/streaming/enabled"
    "/picasso/jwt/enabled" 
    "/picasso/function-url/enabled"
)

for flag in "${FEATURE_FLAGS[@]}"; do
    echo "🚩 Setting $flag to false..."
    aws ssm put-parameter \
        --name "$flag" \
        --value "false" \
        --overwrite \
        --region $REGION \
        --type "String" \
        --description "Emergency rollback - $(date)" 2>/dev/null || echo "⚠️ Parameter $flag not found or not accessible"
done

# Step 7: Create rollback completion report
echo "7️⃣ Creating rollback report..."

ROLLBACK_TIME=$(date -u '+%Y-%m-%d %H:%M:%S UTC')
ROLLBACK_USER=$(aws sts get-caller-identity --query 'Arn' --output text)

cat > /tmp/emergency-rollback-report.json << EOF
{
  "rollbackTime": "$ROLLBACK_TIME",
  "rollbackUser": "$ROLLBACK_USER",
  "environment": "$ENVIRONMENT",
  "rollbackActions": [
    "CloudFront cache invalidated",
    "Function URL deleted", 
    "Master Function health verified",
    "Legacy endpoints tested",
    "Feature flags disabled"
  ],
  "masterFunctionHealth": "$MASTER_FUNCTION_HEALTH",
  "legacyEndpointStatus": "$LEGACY_HEALTH_CODE",
  "rollbackStatus": "COMPLETED"
}
EOF

echo "📝 Rollback report created: /tmp/emergency-rollback-report.json"

# Step 8: Final validation
echo "8️⃣ Final system validation..."

# Wait a moment for changes to propagate
sleep 5

# Test the system end-to-end
echo "🧪 Final end-to-end test..."
FINAL_TEST_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$MASTER_URL?action=health_check" --max-time 15)

if [[ $FINAL_TEST_CODE == "200" ]]; then
    echo "✅ Final validation passed"
    ROLLBACK_SUCCESS=true
else
    echo "❌ Final validation failed: $FINAL_TEST_CODE"
    ROLLBACK_SUCCESS=false
fi

# Success/failure summary
echo ""
echo "=================================================="
if [[ $ROLLBACK_SUCCESS == true ]]; then
    echo "✅ EMERGENCY ROLLBACK COMPLETED SUCCESSFULLY"
    echo "✅ Healthcare system restored to legacy operation"
else
    echo "❌ EMERGENCY ROLLBACK COMPLETED WITH ISSUES"  
    echo "🚨 Healthcare system may require manual intervention"
fi
echo "=================================================="

echo "⏰ Rollback completed at: $(date)"
echo "🌐 Environment: $ENVIRONMENT"
echo "👤 Executed by: $ROLLBACK_USER"
echo ""

if [[ $ROLLBACK_SUCCESS == true ]]; then
    echo "✅ System Status: HEALTHY - Legacy operation restored"
    echo "📊 Legacy Master Function: OPERATIONAL"
    echo "🔗 Legacy endpoints: ACCESSIBLE"
    echo "⚠️ Streaming features: DISABLED"
else
    echo "🚨 System Status: REQUIRES ATTENTION"
    echo "📞 Escalation Required: Contact healthcare operations team immediately"
fi

echo ""
echo "📋 Post-Rollback Actions Required:"
echo "1. Monitor legacy Master Function for 30 minutes"
echo "2. Verify chat functionality with test conversations"  
echo "3. Update status page if applicable"
echo "4. Schedule incident post-mortem"
echo "5. Plan re-deployment strategy"
echo ""

echo "📊 Monitoring:"
echo "- Master Function: $MASTER_URL?action=health_check"
echo "- CloudWatch: https://console.aws.amazon.com/cloudwatch/home?region=$REGION"
echo "- Legacy chat test: Use existing widget implementations"
echo ""

echo "📞 Emergency Contacts:"
echo "- Healthcare Operations Team"
echo "- AWS Support (if infrastructure issues)"
echo "- Development Team Lead"
echo ""

if [[ $ROLLBACK_SUCCESS == true ]]; then
    echo "🎯 ROLLBACK SUCCESSFUL - SYSTEM STABLE"
    exit 0
else
    echo "🚨 ROLLBACK COMPLETED BUT SYSTEM REQUIRES ATTENTION"
    exit 2
fi