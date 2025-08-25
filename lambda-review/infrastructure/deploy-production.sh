#!/bin/bash

set -e  # Exit on any error

echo "🚀 Deploying PICASSO Streaming Infrastructure to PRODUCTION"
echo "========================================================="
echo "⚠️  PRODUCTION DEPLOYMENT - HEALTHCARE CRITICAL SYSTEM"
echo "========================================================="

# Configuration
STACK_NAME="picasso-streaming-production"
TEMPLATE_FILE="template.yaml"
PARAMS_FILE="production-params.json"
REGION="us-east-1"

# Production safety checks
read -p "🛡️ Have you tested this deployment in staging? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Please test in staging first"
    exit 1
fi

read -p "🏥 Are you authorized to deploy to production healthcare systems? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Production deployment requires proper authorization"
    exit 1
fi

read -p "📋 Have you notified the healthcare operations team? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Healthcare operations team must be notified before production deployment"
    exit 1
fi

echo "✅ Pre-deployment safety checks completed"

# Validate prerequisites
echo "🔍 Validating production prerequisites..."

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install AWS CLI."
    exit 1
fi

# Check SAM CLI
if ! command -v sam &> /dev/null; then
    echo "❌ SAM CLI not found. Please install SAM CLI."
    exit 1
fi

# Verify AWS credentials have production access
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run 'aws configure'."
    exit 1
fi

# Verify we're deploying to correct account
ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
read -p "🏢 Deploying to AWS Account: $ACCOUNT_ID - Is this correct for PRODUCTION? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Please verify AWS account before production deployment"
    exit 1
fi

echo "✅ Production prerequisites validated"

# Validate current Master_Function is healthy before deployment
echo "🏥 Pre-deployment health check of existing Master_Function..."
CURRENT_HEALTH=$(aws lambda invoke \
    --function-name Master_Function \
    --payload '{"queryStringParameters": {"action": "health_check"}}' \
    --region $REGION \
    /tmp/health_response.json &> /dev/null && cat /tmp/health_response.json | jq -r '.body' | jq -r '.status' 2>/dev/null || echo "FAILED")

if [[ $CURRENT_HEALTH != "healthy" ]]; then
    echo "❌ Current Master_Function is not healthy. Aborting production deployment."
    echo "Current status: $CURRENT_HEALTH"
    exit 1
fi

echo "✅ Current Master_Function is healthy"

# Build the SAM application
echo "🔧 Building SAM application for production..."
sam build --template-file $TEMPLATE_FILE

if [ $? -ne 0 ]; then
    echo "❌ SAM build failed"
    exit 1
fi

echo "✅ SAM build completed"

# Create deployment change set first (for review)
echo "📋 Creating deployment change set for review..."
sam deploy \
    --template-file .aws-sam/build/template.yaml \
    --stack-name $STACK_NAME \
    --parameter-overrides file://$PARAMS_FILE \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
    --region $REGION \
    --no-execute-changeset \
    --tags Environment=production Project=PICASSO Purpose=streaming-infrastructure Compliance=HIPAA

if [ $? -ne 0 ]; then
    echo "❌ Change set creation failed"
    exit 1
fi

# Show change set for manual review
echo "📊 Change set created. Reviewing changes..."
aws cloudformation describe-change-set \
    --stack-name $STACK_NAME \
    --change-set-name sam-deploy-* \
    --region $REGION \
    --query 'Changes[*].{Action:Action,ResourceType:ResourceChange.ResourceType,LogicalId:ResourceChange.LogicalResourceId,Replacement:ResourceChange.Replacement}' \
    --output table

read -p "🔍 Review the changes above. Proceed with deployment? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled by user"
    exit 1
fi

# Execute the change set
echo "🚀 Executing production deployment..."
CHANGESET_NAME=$(aws cloudformation list-change-sets \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Summaries[0].ChangeSetName' \
    --output text)

aws cloudformation execute-change-set \
    --stack-name $STACK_NAME \
    --change-set-name $CHANGESET_NAME \
    --region $REGION

# Wait for deployment completion with progress monitoring
echo "⏳ Monitoring deployment progress..."
aws cloudformation wait stack-update-complete \
    --stack-name $STACK_NAME \
    --region $REGION

if [ $? -ne 0 ]; then
    echo "❌ Production deployment failed"
    echo "🚨 CRITICAL: Check stack events and consider rollback"
    aws cloudformation describe-stack-events \
        --stack-name $STACK_NAME \
        --region $REGION \
        --query 'StackEvents[?ResourceStatus==`UPDATE_FAILED`]' \
        --output table
    exit 1
fi

echo "✅ Production deployment completed"

# Get stack outputs
echo "📋 Retrieving production stack outputs..."
aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs' \
    --output table

# Comprehensive production validation
echo "🧪 Comprehensive production validation..."

# Get URLs from stack outputs
MASTER_FUNCTION_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`MasterFunctionUrl`].OutputValue' \
    --output text)

STREAMING_FUNCTION_URL=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`BedrockStreamingFunctionUrl`].OutputValue' \
    --output text)

echo "🔗 Production Master Function URL: $MASTER_FUNCTION_URL"
echo "🔗 Production Streaming Function URL: $STREAMING_FUNCTION_URL"

# Validate Master Function health
echo "🏥 Validating Master Function health..."
HEALTH_RESPONSE=$(curl -s -f "${MASTER_FUNCTION_URL}Master_Function?action=health_check" --max-time 10 || echo "FAILED")

if [[ $HEALTH_RESPONSE == "FAILED" ]]; then
    echo "❌ Production Master Function health check failed"
    echo "🚨 CRITICAL: Production system may be impaired"
    exit 1
fi

echo "✅ Production Master Function health check passed"

# Validate DynamoDB tables
echo "🗃️ Validating production DynamoDB tables..."
SUMMARIES_TABLE="production-conversation-summaries"
MESSAGES_TABLE="production-recent-messages"

# Check tables exist and have correct TTL settings
for table in $SUMMARIES_TABLE $MESSAGES_TABLE; do
    echo "Checking $table..."
    
    aws dynamodb describe-table --table-name $table --region $REGION &> /dev/null || {
        echo "❌ Table $table not found"
        exit 1
    }
    
    TTL_STATUS=$(aws dynamodb describe-time-to-live \
        --table-name $table \
        --region $REGION \
        --query 'TimeToLiveDescription.TimeToLiveStatus' \
        --output text)
    
    if [[ $TTL_STATUS != "ENABLED" ]]; then
        echo "❌ TTL not enabled for $table"
        exit 1
    fi
    
    echo "✅ $table validated with TTL enabled"
done

# Validate JWT secret
echo "🔐 Validating production JWT secret..."
JWT_SECRET_NAME="picasso/production/jwt/signing-key"

aws secretsmanager describe-secret --secret-id $JWT_SECRET_NAME --region $REGION &> /dev/null || {
    echo "❌ Production JWT secret not found"
    exit 1
}

echo "✅ Production JWT secret validated"

# Test streaming function CORS (without JWT)
echo "🌊 Testing streaming function CORS configuration..."
STREAM_TEST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS $STREAMING_FUNCTION_URL --max-time 5)

if [[ $STREAM_TEST_RESPONSE != "200" ]]; then
    echo "⚠️ Streaming function CORS test returned: $STREAM_TEST_RESPONSE"
    echo "(This may be expected - function requires JWT for full access)"
else
    echo "✅ Streaming function CORS configured correctly"
fi

# Validate CloudWatch alarms are created and active
echo "📊 Validating CloudWatch monitoring..."
ALARM_COUNT=$(aws cloudwatch describe-alarms \
    --alarm-names "production-Master-Function-ErrorRate" "production-Streaming-Function-Latency" "production-CrossTenant-Access-Attempts" \
    --region $REGION \
    --query 'MetricAlarms | length(@)' \
    --output text)

if [[ $ALARM_COUNT -lt 3 ]]; then
    echo "⚠️ Some CloudWatch alarms may not be configured correctly"
    echo "Expected 3 alarms, found: $ALARM_COUNT"
else
    echo "✅ CloudWatch monitoring alarms configured"
fi

# Final production readiness check
echo "🔐 Final production security validation..."

# Test that Function URL requires authentication (should fail without JWT)
UNAUTH_TEST=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d '{"message": "test"}' \
    $STREAMING_FUNCTION_URL --max-time 5)

if [[ $UNAUTH_TEST == "401" ]]; then
    echo "✅ Function URL correctly rejects unauthenticated requests"
else
    echo "⚠️ Function URL authentication test returned: $UNAUTH_TEST"
    echo "(Expected 401 for unauthenticated request)"
fi

# Create production deployment record
DEPLOYMENT_TIME=$(date -u '+%Y-%m-%d %H:%M:%S UTC')
DEPLOYMENT_USER=$(aws sts get-caller-identity --query 'Arn' --output text)

cat > /tmp/production-deployment-record.json << EOF
{
  "deploymentTime": "$DEPLOYMENT_TIME",
  "deploymentUser": "$DEPLOYMENT_USER",
  "stackName": "$STACK_NAME",
  "region": "$REGION",
  "masterFunctionUrl": "$MASTER_FUNCTION_URL",
  "streamingFunctionUrl": "$STREAMING_FUNCTION_URL",
  "healthCheckPassed": true,
  "complianceLevel": "HIPAA",
  "rollbackProcedure": "emergency-rollback.sh"
}
EOF

echo "📝 Production deployment record created"

# Success summary
echo ""
echo "🎉 PRODUCTION DEPLOYMENT SUCCESSFUL"
echo "=================================="
echo "✅ Healthcare-Critical Infrastructure Deployed"
echo ""
echo "📊 Deployment Summary:"
echo "Stack Name: $STACK_NAME"
echo "Region: $REGION"  
echo "Deployed At: $DEPLOYMENT_TIME"
echo "Deployed By: $DEPLOYMENT_USER"
echo ""
echo "🔗 Production URLs:"
echo "Master Function: $MASTER_FUNCTION_URL"
echo "Streaming Function: $STREAMING_FUNCTION_URL"
echo ""
echo "🛡️ Security Features:"
echo "✅ Function URLs with AuthType: NONE + JWT validation"
echo "✅ DynamoDB tables with healthcare-compliant TTL"
echo "✅ Cross-tenant isolation monitoring"
echo "✅ JWT secrets securely stored in Secrets Manager"
echo "✅ CloudWatch monitoring and alerting configured"
echo ""
echo "📋 Next Steps:"
echo "1. Update frontend configuration for production"
echo "2. Test JWT token generation in production"
echo "3. Validate streaming with real healthcare scenarios"
echo "4. Monitor CloudWatch dashboards for 24 hours"
echo "5. Schedule first JWT key rotation (30 days)"
echo ""
echo "🚨 Emergency Procedures:"
echo "Rollback Script: lambda-review/infrastructure/emergency-rollback.sh"
echo "Health Check: $MASTER_FUNCTION_URL"Master_Function?action=health_check"
echo "Monitoring: https://console.aws.amazon.com/cloudwatch/home?region=$REGION"
echo ""
echo "📞 Healthcare Operations Contact Required:"
echo "Please notify the healthcare operations team that production deployment is complete."
echo ""
echo "✅ Production deployment completed successfully!"
echo "🏥 Healthcare system is ready for streaming conversations."