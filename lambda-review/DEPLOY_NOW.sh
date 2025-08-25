#!/bin/bash

# CORS Fix Deployment Script for Master_Function_Staging
# Run this script to deploy the CORS fix

echo "🚀 Deploying CORS fix to Master_Function_Staging..."
echo "================================================"

FUNCTION_NAME="Master_Function_Staging"
REGION="us-east-1"

# Check if we're in the right directory
if [ ! -f "lambda-deployment.zip" ]; then
    echo "❌ lambda-deployment.zip not found in current directory"
    echo "Please run this script from: /Users/chrismiller/Desktop/build-process/picasso-main/lambda-review"
    exit 1
fi

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install it first:"
    echo "   brew install awscli  (on Mac)"
    echo "   OR"
    echo "   pip install awscli"
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured."
    echo ""
    echo "Please configure AWS credentials by running:"
    echo "   aws configure"
    echo ""
    echo "You'll need:"
    echo "  - AWS Access Key ID"
    echo "  - AWS Secret Access Key"
    echo "  - Default region: us-east-1"
    echo "  - Default output format: json"
    exit 1
fi

echo "✅ Prerequisites checked"
echo ""

# Deploy the Lambda function
echo "📦 Uploading deployment package (61MB with all dependencies)..."
aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://lambda-deployment.zip \
    --region $REGION

if [ $? -ne 0 ]; then
    echo "❌ Deployment failed"
    exit 1
fi

# Wait for update
echo "⏳ Waiting for function to update..."
aws lambda wait function-updated \
    --function-name $FUNCTION_NAME \
    --region $REGION

# Get function URL
echo "🔍 Getting function URL..."
FUNCTION_URL=$(aws lambda get-function-url-config \
    --function-name $FUNCTION_NAME \
    --region $REGION \
    --query 'FunctionUrl' \
    --output text 2>/dev/null)

if [ -z "$FUNCTION_URL" ]; then
    echo "📝 No function URL found. The function may use API Gateway instead."
    FUNCTION_URL="https://xkjbyi3ushhuiytcfbuk5uaqom0ivhfk.lambda-url.us-east-1.on.aws/"
    echo "   Expected URL: $FUNCTION_URL"
fi

echo ""
echo "✅ Deployment successful!"
echo ""
echo "🧪 Test the CORS fix with these commands:"
echo ""
echo "# Test health check:"
echo "curl '${FUNCTION_URL}?action=health_check'"
echo ""
echo "# Test config endpoint:"
echo "curl '${FUNCTION_URL}?action=get_config&t=my87674d777bf9'"
echo ""
echo "# Test OPTIONS (CORS preflight):"
echo "curl -X OPTIONS '${FUNCTION_URL}' -I"
echo ""
echo "🌐 Or test in browser at:"
echo "http://localhost:8000/test-widget-memory.html?env=staging"
echo ""
echo "✨ CORS errors should now be resolved!"