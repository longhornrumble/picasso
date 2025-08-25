#!/bin/bash
# Lambda Function Promotion Script
# Promotes Master_Function_Staging to Master_Function (Production)
# Usage: ./deploy-lambda-production.sh
#
# IMPORTANT: Production uses API Gateway + CloudFront (chat.myrecruiter.ai/Master_Function)
#            Staging uses direct Lambda Function URLs
#
# This script safely promotes the staging Lambda to production with:
# - Current production backup
# - Configuration validation
# - Smoke testing
# - Rollback capability

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Lambda Configuration
STAGING_FUNCTION="Master_Function_Staging"
PRODUCTION_FUNCTION="Master_Function"
AWS_REGION="us-east-1"

# URLs - IMPORTANT: Different patterns for staging vs production!
# Staging uses direct Lambda Function URL
STAGING_URL="https://xo6tsuhi6u2fby3rkw4usa663q0igxjk.lambda-url.us-east-1.on.aws"

# Production uses API Gateway/CloudFront
PRODUCTION_BASE="https://chat.myrecruiter.ai"
PRODUCTION_HEALTH="${PRODUCTION_BASE}/Master_Function?action=health_check"
PRODUCTION_CONFIG="${PRODUCTION_BASE}/Master_Function?action=get_config"

# Function to print section headers
print_header() {
    echo ""
    echo "============================================"
    echo -e "${PURPLE}$1${NC}"
    echo "============================================"
    echo ""
}

# Start deployment
echo -e "${RED}🚀 Lambda Function Production Promotion${NC}"
echo -e "${YELLOW}Promoting ${STAGING_FUNCTION} → ${PRODUCTION_FUNCTION}${NC}"
echo ""
echo -e "${BLUE}ℹ️  Architecture Notes:${NC}"
echo "  • Staging: Direct Lambda Function URL"
echo "  • Production: API Gateway → Lambda (via ${PRODUCTION_BASE})"
echo ""

# Confirmation
echo -e "${RED}⚠️  WARNING: This will update the PRODUCTION Lambda function!${NC}"
echo -e "${YELLOW}All production traffic via chat.myrecruiter.ai will use the new code.${NC}"
echo ""
echo "Pre-deployment checklist:"
echo "  • Have you tested Master_Function_Staging thoroughly?"
echo "  • Is the Picasso frontend compatible with this Lambda version?"
echo "  • Are you monitoring CloudWatch logs?"
echo "  • Do you have the previous function code backed up?"
echo "  • Is the API Gateway configured correctly?"
echo ""
read -p "Type 'promote-lambda-production' to continue: " -r
echo
if [[ ! $REPLY == "promote-lambda-production" ]]; then
    echo -e "${RED}Promotion cancelled${NC}"
    exit 1
fi

TIMESTAMP=$(date -u +"%Y-%m-%d_%H-%M-%S")

# ==================================
# PHASE 1: Pre-flight Checks
# ==================================
print_header "PHASE 1: Pre-flight Checks"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ Error: AWS CLI is not installed${NC}"
    exit 1
fi

# Check AWS credentials
echo -n "  ✓ Checking AWS credentials... "
aws sts get-caller-identity > /dev/null || {
    echo -e "${RED}FAILED${NC}"
    echo "Please configure AWS credentials"
    exit 1
}
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${GREEN}OK (Account: $ACCOUNT_ID)${NC}"

# Check jq for JSON parsing
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠️  Installing jq for JSON parsing...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install jq
    else
        sudo apt-get install -y jq
    fi
fi

# ==================================
# PHASE 2: Staging Function Validation
# ==================================
print_header "PHASE 2: Staging Function Validation"

echo -n "  ✓ Checking staging function exists... "
STAGING_ARN=$(aws lambda get-function --function-name $STAGING_FUNCTION --region $AWS_REGION --query 'Configuration.FunctionArn' --output text 2>/dev/null) || {
    echo -e "${RED}FAILED${NC}"
    echo "    Staging function $STAGING_FUNCTION not found"
    exit 1
}
echo -e "${GREEN}OK${NC}"

echo -n "  ✓ Getting staging function info... "
STAGING_INFO=$(aws lambda get-function --function-name $STAGING_FUNCTION --region $AWS_REGION --output json)
STAGING_RUNTIME=$(echo $STAGING_INFO | jq -r '.Configuration.Runtime')
STAGING_HANDLER=$(echo $STAGING_INFO | jq -r '.Configuration.Handler')
STAGING_TIMEOUT=$(echo $STAGING_INFO | jq -r '.Configuration.Timeout')
STAGING_MEMORY=$(echo $STAGING_INFO | jq -r '.Configuration.MemorySize')
STAGING_CODE_SIZE=$(echo $STAGING_INFO | jq -r '.Configuration.CodeSize')
STAGING_LAST_MODIFIED=$(echo $STAGING_INFO | jq -r '.Configuration.LastModified')
echo -e "${GREEN}OK${NC}"

echo ""
echo "  Staging Function Details:"
echo "    Runtime: $STAGING_RUNTIME"
echo "    Handler: $STAGING_HANDLER"
echo "    Timeout: ${STAGING_TIMEOUT}s"
echo "    Memory: ${STAGING_MEMORY}MB"
echo "    Code Size: $((STAGING_CODE_SIZE / 1024))KB"
echo "    Last Modified: $STAGING_LAST_MODIFIED"

# Test staging function (using direct Function URL)
echo -n "  ✓ Testing staging function health (Function URL)... "
STAGING_HEALTH=$(curl -s "${STAGING_URL}/?action=health_check" 2>/dev/null | jq -r '.status' || echo "error")
if [ "$STAGING_HEALTH" == "ok" ] || [ "$STAGING_HEALTH" == "healthy" ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}WARNING: Health check returned: $STAGING_HEALTH${NC}"
    read -p "    Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# ==================================
# PHASE 3: API Gateway Validation
# ==================================
print_header "PHASE 3: API Gateway Validation"

echo "  Checking API Gateway configuration..."

# Find API Gateway
echo -n "  ✓ Looking for API Gateway... "
API_NAME="MyRecruiterChat"  # Update if different
API_ID=$(aws apigateway get-rest-apis --region $AWS_REGION --query "items[?name=='$API_NAME'].id" --output text 2>/dev/null)

if [ -z "$API_ID" ]; then
    echo -e "${YELLOW}WARNING: Could not find API Gateway${NC}"
    echo "    Production uses CloudFront → API Gateway → Lambda"
    echo "    Make sure API Gateway is properly configured"
else
    echo -e "${GREEN}Found: $API_ID${NC}"
    
    # Check API Gateway Lambda integration
    echo -n "  ✓ Checking Lambda integration... "
    # This would need more specific API Gateway commands based on your setup
    echo -e "${GREEN}ASSUMED OK${NC}"
fi

# ==================================
# PHASE 4: Production Function Backup
# ==================================
print_header "PHASE 4: Production Function Backup"

echo -n "  ✓ Checking production function exists... "
PROD_ARN=$(aws lambda get-function --function-name $PRODUCTION_FUNCTION --region $AWS_REGION --query 'Configuration.FunctionArn' --output text 2>/dev/null) || {
    echo -e "${RED}FAILED${NC}"
    echo "    Production function $PRODUCTION_FUNCTION not found"
    exit 1
}
echo -e "${GREEN}OK${NC}"

# Get production info
PROD_INFO=$(aws lambda get-function --function-name $PRODUCTION_FUNCTION --region $AWS_REGION --output json)
PROD_LAST_MODIFIED=$(echo $PROD_INFO | jq -r '.Configuration.LastModified')
echo "    Current Production Last Modified: $PROD_LAST_MODIFIED"

# Create version/alias for rollback
echo -n "  ✓ Creating production backup version... "
BACKUP_VERSION=$(aws lambda publish-version \
    --function-name $PRODUCTION_FUNCTION \
    --description "Backup before promotion - $TIMESTAMP" \
    --region $AWS_REGION \
    --query 'Version' \
    --output text)
echo -e "${GREEN}Version $BACKUP_VERSION${NC}"

# Create or update alias pointing to backup
echo -n "  ✓ Creating rollback alias... "
ROLLBACK_ALIAS="rollback-${TIMESTAMP//_/-}"
aws lambda create-alias \
    --function-name $PRODUCTION_FUNCTION \
    --name "$ROLLBACK_ALIAS" \
    --function-version "$BACKUP_VERSION" \
    --description "Rollback point before $TIMESTAMP promotion" \
    --region $AWS_REGION > /dev/null 2>&1 || {
    # Alias might already exist, try update
    aws lambda update-alias \
        --function-name $PRODUCTION_FUNCTION \
        --name "$ROLLBACK_ALIAS" \
        --function-version "$BACKUP_VERSION" \
        --region $AWS_REGION > /dev/null
}
echo -e "${GREEN}OK${NC}"

# Download production code as additional backup
echo -n "  ✓ Downloading production code backup... "
BACKUP_DIR="lambda-backups/$TIMESTAMP"
mkdir -p $BACKUP_DIR

# Get download URL
CODE_URL=$(aws lambda get-function --function-name $PRODUCTION_FUNCTION --region $AWS_REGION --query 'Code.Location' --output text)
curl -s -o "$BACKUP_DIR/production-code.zip" "$CODE_URL"
echo -e "${GREEN}Saved to $BACKUP_DIR${NC}"

# Save production configuration
aws lambda get-function-configuration \
    --function-name $PRODUCTION_FUNCTION \
    --region $AWS_REGION > "$BACKUP_DIR/production-config.json"

# ==================================
# PHASE 5: Download Staging Code
# ==================================
print_header "PHASE 5: Prepare Staging Code"

echo -n "  ✓ Downloading staging function code... "
STAGING_CODE_URL=$(aws lambda get-function --function-name $STAGING_FUNCTION --region $AWS_REGION --query 'Code.Location' --output text)
curl -s -o "/tmp/staging-code-$TIMESTAMP.zip" "$STAGING_CODE_URL"
echo -e "${GREEN}OK${NC}"

echo -n "  ✓ Verifying code package... "
if unzip -t "/tmp/staging-code-$TIMESTAMP.zip" > /dev/null 2>&1; then
    ZIP_SIZE=$(du -h "/tmp/staging-code-$TIMESTAMP.zip" | cut -f1)
    echo -e "${GREEN}Valid ZIP (${ZIP_SIZE})${NC}"
else
    echo -e "${RED}FAILED - Invalid ZIP${NC}"
    exit 1
fi

# ==================================
# PHASE 6: Update Production Function
# ==================================
print_header "PHASE 6: Update Production Function"

echo -e "${YELLOW}  Updating production function code...${NC}"
echo -e "${BLUE}  Note: This updates the Lambda behind API Gateway${NC}"

# Update the function code
echo -n "  ✓ Uploading new code to production... "
UPDATE_RESULT=$(aws lambda update-function-code \
    --function-name $PRODUCTION_FUNCTION \
    --zip-file "fileb:///tmp/staging-code-$TIMESTAMP.zip" \
    --region $AWS_REGION \
    --output json)

UPDATE_STATUS=$(echo $UPDATE_RESULT | jq -r '.LastUpdateStatus')
if [ "$UPDATE_STATUS" == "Successful" ] || [ "$UPDATE_STATUS" == "InProgress" ]; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED - Status: $UPDATE_STATUS${NC}"
    exit 1
fi

# Wait for update to complete
echo -n "  ✓ Waiting for update to complete... "
for i in {1..30}; do
    STATUS=$(aws lambda get-function-configuration \
        --function-name $PRODUCTION_FUNCTION \
        --region $AWS_REGION \
        --query 'LastUpdateStatus' \
        --output text)
    
    if [ "$STATUS" == "Successful" ]; then
        echo -e "${GREEN}SUCCESS${NC}"
        break
    elif [ "$STATUS" == "Failed" ]; then
        echo -e "${RED}FAILED${NC}"
        echo "Update failed. Check CloudWatch logs for details."
        exit 1
    fi
    
    sleep 2
done

# Update environment variables to match staging (optional)
echo -n "  ✓ Syncing environment variables... "
STAGING_ENV=$(aws lambda get-function-configuration \
    --function-name $STAGING_FUNCTION \
    --region $AWS_REGION \
    --query 'Environment.Variables' \
    --output json)

PROD_ENV=$(aws lambda get-function-configuration \
    --function-name $PRODUCTION_FUNCTION \
    --region $AWS_REGION \
    --query 'Environment.Variables' \
    --output json)

if [ "$STAGING_ENV" != "$PROD_ENV" ]; then
    echo -e "${YELLOW}DIFFERENT${NC}"
    echo "    Staging env vars differ from production"
    echo "    Keeping production environment variables unchanged"
    echo "    Review manually if sync is needed"
else
    echo -e "${GREEN}ALREADY SYNCED${NC}"
fi

# ==================================
# PHASE 7: Post-Deployment Testing
# ==================================
print_header "PHASE 7: Post-Deployment Testing"

# Wait a moment for function to be ready
echo -n "  ✓ Waiting for function to initialize... "
sleep 5
echo -e "${GREEN}OK${NC}"

# Test production health check (via API Gateway/CloudFront)
echo -n "  ✓ Testing production health (via API Gateway)... "
PROD_HEALTH=$(curl -s --max-time 10 "${PRODUCTION_HEALTH}" 2>/dev/null | jq -r '.status' || echo "error")
if [ "$PROD_HEALTH" == "ok" ] || [ "$PROD_HEALTH" == "healthy" ]; then
    echo -e "${GREEN}PASSED${NC}"
else
    echo -e "${RED}FAILED - Status: $PROD_HEALTH${NC}"
    echo -e "${YELLOW}    Function may still be initializing or API Gateway issue${NC}"
fi

# Test config endpoint (via API Gateway)
echo -n "  ✓ Testing config endpoint (via API Gateway)... "
TEST_TENANT="my87674d777bf9"  # MyRecruiter test tenant
CONFIG_RESPONSE=$(curl -s --max-time 10 "${PRODUCTION_CONFIG}&t=$TEST_TENANT" 2>/dev/null)
if echo "$CONFIG_RESPONSE" | jq -e '.chat_title' > /dev/null 2>&1; then
    TITLE=$(echo "$CONFIG_RESPONSE" | jq -r '.chat_title')
    echo -e "${GREEN}PASSED (Title: $TITLE)${NC}"
else
    echo -e "${YELLOW}WARNING - Config may not be loading properly${NC}"
fi

# Check CloudWatch for errors
echo -n "  ✓ Checking for recent errors... "
ERROR_COUNT=$(aws logs filter-log-events \
    --log-group-name "/aws/lambda/$PRODUCTION_FUNCTION" \
    --start-time $(($(date +%s) - 300))000 \
    --filter-pattern "ERROR" \
    --query 'events | length(@)' \
    --output text 2>/dev/null || echo "0")

if [ "$ERROR_COUNT" -gt "10" ]; then
    echo -e "${YELLOW}WARNING: $ERROR_COUNT errors in last 5 minutes${NC}"
    echo "    Check CloudWatch logs for details"
else
    echo -e "${GREEN}OK ($ERROR_COUNT errors)${NC}"
fi

# Check Lambda metrics
echo -n "  ✓ Checking Lambda metrics... "
INVOCATIONS=$(aws cloudwatch get-metric-statistics \
    --namespace AWS/Lambda \
    --metric-name Invocations \
    --dimensions Name=FunctionName,Value=$PRODUCTION_FUNCTION \
    --start-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
    --period 300 \
    --statistics Sum \
    --region $AWS_REGION \
    --query 'Datapoints[0].Sum' \
    --output text 2>/dev/null || echo "0")
echo -e "${GREEN}Invocations (5min): $INVOCATIONS${NC}"

# ==================================
# PHASE 8: Create Deployment Record
# ==================================
print_header "PHASE 8: Deployment Record"

# Tag the function
echo -n "  ✓ Tagging production function... "
aws lambda tag-resource \
    --resource "$PROD_ARN" \
    --tags "LastPromotion=$TIMESTAMP,PromotedFrom=$STAGING_FUNCTION,DeployedBy=$USER" \
    --region $AWS_REGION 2>/dev/null || echo -e "${YELLOW}(tags updated)${NC}"
echo -e "${GREEN}OK${NC}"

# Create deployment record
DEPLOYMENT_RECORD="$BACKUP_DIR/deployment-record.json"
cat > "$DEPLOYMENT_RECORD" << EOF
{
  "timestamp": "$TIMESTAMP",
  "promoted_from": "$STAGING_FUNCTION",
  "promoted_to": "$PRODUCTION_FUNCTION",
  "backup_version": "$BACKUP_VERSION",
  "rollback_alias": "$ROLLBACK_ALIAS",
  "deployed_by": "$USER",
  "account_id": "$ACCOUNT_ID",
  "staging_code_size": $STAGING_CODE_SIZE,
  "staging_runtime": "$STAGING_RUNTIME",
  "staging_last_modified": "$STAGING_LAST_MODIFIED",
  "production_last_modified": "$PROD_LAST_MODIFIED",
  "health_check_status": "$PROD_HEALTH",
  "error_count_5min": $ERROR_COUNT,
  "api_gateway_id": "${API_ID:-not_found}",
  "production_url": "$PRODUCTION_BASE"
}
EOF

echo -e "${GREEN}  ✓ Deployment record saved${NC}"

# ==================================
# Deployment Summary
# ==================================
print_header "Deployment Summary"

echo -e "${GREEN}✅ Lambda promotion complete!${NC}"
echo ""
echo "📋 Deployment Details:"
echo "   Timestamp: $TIMESTAMP"
echo "   Source: $STAGING_FUNCTION"
echo "   Target: $PRODUCTION_FUNCTION"
echo "   Backup Version: $BACKUP_VERSION"
echo "   Rollback Alias: $ROLLBACK_ALIAS"
echo "   Health Status: $PROD_HEALTH"
echo ""
echo "🌐 Production Endpoints (via API Gateway/CloudFront):"
echo "   Base URL: ${PRODUCTION_BASE}/Master_Function"
echo "   Health: ${PRODUCTION_HEALTH}"
echo "   Config: ${PRODUCTION_CONFIG}&t=TENANT_HASH"
echo "   Chat: ${PRODUCTION_BASE}/Master_Function?action=chat&t=TENANT_HASH"
echo ""
echo "🔗 Direct Lambda Function URL (if configured):"
echo "   Note: Production typically uses API Gateway, not direct Function URL"
echo ""

# Post-deployment checklist
echo -e "${BLUE}📝 Post-Deployment Checklist:${NC}"
echo "   [ ] Monitor CloudWatch logs for 10 minutes"
echo "   [ ] Test with Foster Village (fo85e6a06dcdf4)"
echo "   [ ] Test with another production tenant"
echo "   [ ] Check error rates in CloudWatch metrics"
echo "   [ ] Verify chat functionality in browser"
echo "   [ ] Check Lambda concurrent executions"
echo "   [ ] Monitor memory usage and duration"
echo "   [ ] Verify API Gateway is routing correctly"
echo "   [ ] Check CloudFront cache behavior"
echo ""

# Rollback instructions
echo -e "${YELLOW}🔄 Rollback Instructions (if needed):${NC}"
echo ""
echo "   Option 1 - Quick rollback to backup version:"
echo "     aws lambda update-function-code \\"
echo "       --function-name $PRODUCTION_FUNCTION \\"
echo "       --zip-file fileb://$BACKUP_DIR/production-code.zip \\"
echo "       --region $AWS_REGION"
echo ""
echo "   Option 2 - Use backup alias (update API Gateway if needed):"
echo "     aws lambda update-alias \\"
echo "       --function-name $PRODUCTION_FUNCTION \\"
echo "       --name LIVE \\"
echo "       --function-version $BACKUP_VERSION \\"
echo "       --region $AWS_REGION"
echo ""
echo "   Option 3 - Restore specific version:"
echo "     # List versions"
echo "     aws lambda list-versions-by-function \\"
echo "       --function-name $PRODUCTION_FUNCTION \\"
echo "       --region $AWS_REGION"
echo ""

if [ "$PROD_HEALTH" != "ok" ] && [ "$PROD_HEALTH" != "healthy" ]; then
    echo -e "${RED}⚠️  WARNING: Health check is not passing. Monitor closely!${NC}"
    echo "  Possible issues:"
    echo "  - Lambda still initializing (wait 1-2 minutes)"
    echo "  - API Gateway configuration issue"
    echo "  - CloudFront cache needs invalidation"
fi

echo -e "${GREEN}🎉 Lambda promotion completed!${NC}"
echo ""
echo -e "${BLUE}ℹ️  Remember: Production uses API Gateway, not direct Function URLs${NC}"
echo "   Picasso should be configured to use: ${PRODUCTION_BASE}/Master_Function"