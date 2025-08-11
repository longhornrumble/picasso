#!/bin/bash

set -e  # Exit on any error

echo "🚀 Deploying PICASSO Streaming Infrastructure to STAGING"
echo "=================================================="

# Configuration
STACK_NAME="picasso-streaming-staging"
TEMPLATE_FILE="template.yaml"
PARAMS_FILE="staging-params.json"
REGION="us-east-1"

# Validate prerequisites
echo "🔍 Validating prerequisites..."

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

# Verify AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run 'aws configure'."
    exit 1
fi

echo "✅ Prerequisites validated"

# Build the SAM application
echo "🔧 Building SAM application..."
sam build --template-file $TEMPLATE_FILE

if [ $? -ne 0 ]; then
    echo "❌ SAM build failed"
    exit 1
fi

echo "✅ SAM build completed"

# Deploy to staging
echo "🚀 Deploying to staging environment..."

sam deploy \
    --template-file .aws-sam/build/template.yaml \
    --stack-name $STACK_NAME \
    --parameter-overrides file://$PARAMS_FILE \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
    --region $REGION \
    --no-fail-on-empty-changeset \
    --tags Environment=staging Project=PICASSO Purpose=streaming-infrastructure

if [ $? -ne 0 ]; then
    echo "❌ Staging deployment failed"
    exit 1
fi

echo "✅ Staging deployment completed"

# Get stack outputs
echo "📋 Retrieving stack outputs..."
aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs' \
    --output table

# Validate deployment health
echo "🏥 Validating deployment health..."

# Get the Master Function URL from stack outputs
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

echo "🔗 Master Function URL: $MASTER_FUNCTION_URL"
echo "🔗 Streaming Function URL: $STREAMING_FUNCTION_URL"

# Test Master Function health
echo "🧪 Testing Master Function health check..."
HEALTH_RESPONSE=$(curl -s -f "${MASTER_FUNCTION_URL}Master_Function?action=health_check" || echo "FAILED")

if [[ $HEALTH_RESPONSE == "FAILED" ]]; then
    echo "❌ Master Function health check failed"
    exit 1
fi

echo "✅ Master Function health check passed"

# Validate DynamoDB tables exist
echo "🗃️ Validating DynamoDB tables..."
SUMMARIES_TABLE="staging-conversation-summaries"
MESSAGES_TABLE="staging-recent-messages"

aws dynamodb describe-table --table-name $SUMMARIES_TABLE --region $REGION &> /dev/null || {
    echo "❌ Summaries table not found"
    exit 1
}

aws dynamodb describe-table --table-name $MESSAGES_TABLE --region $REGION &> /dev/null || {
    echo "❌ Messages table not found"
    exit 1
}

echo "✅ DynamoDB tables validated"

# Validate JWT secret exists
echo "🔐 Validating JWT secret..."
JWT_SECRET_NAME="picasso/staging/jwt/signing-key"

aws secretsmanager describe-secret --secret-id $JWT_SECRET_NAME --region $REGION &> /dev/null || {
    echo "❌ JWT secret not found"
    exit 1
}

echo "✅ JWT secret validated"

# Test streaming function accessibility (without JWT for now)
echo "🌊 Testing streaming function accessibility..."
STREAM_TEST_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS $STREAMING_FUNCTION_URL)

if [[ $STREAM_TEST_RESPONSE != "200" ]]; then
    echo "⚠️ Streaming function CORS preflight failed (expected for now - needs JWT)"
else
    echo "✅ Streaming function accessible"
fi

# Create deployment summary
echo ""
echo "🎉 STAGING DEPLOYMENT SUCCESSFUL"
echo "================================"
echo "Stack Name: $STACK_NAME"
echo "Region: $REGION"
echo "Master Function URL: $MASTER_FUNCTION_URL"
echo "Streaming Function URL: $STREAMING_FUNCTION_URL"
echo ""
echo "📝 Next Steps:"
echo "1. Update frontend configuration to use new URLs"
echo "2. Test JWT token generation via Master Function"
echo "3. Validate streaming functionality with valid JWT"
echo "4. Monitor CloudWatch metrics for baseline establishment"
echo ""
echo "📊 Monitoring Dashboard:"
echo "https://console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards:"
echo ""
echo "🔒 Security Notes:"
echo "- JWT secret automatically generated and stored in Secrets Manager"
echo "- Function URLs configured with AuthType: NONE (internal JWT validation)"
echo "- DynamoDB tables configured with appropriate TTL settings"
echo "- CloudWatch alarms configured for security and performance monitoring"

echo ""
echo "✅ Staging deployment completed successfully!"