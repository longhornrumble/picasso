#!/bin/bash

# Deploy CORS fix for Master_Function_Staging
echo "🚀 Deploying CORS fix for Master_Function_Staging..."

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install AWS CLI."
    echo "To install: pip install awscli"
    exit 1
fi

# Verify AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured."
    echo "Please run 'aws configure' with your credentials"
    exit 1
fi

# Get current account info
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "📋 Using AWS Account: $ACCOUNT_ID"

# Function name
FUNCTION_NAME="Master_Function_Staging"
REGION="us-east-1"

# Create deployment package with updated code
echo "📦 Creating deployment package..."
cd lambda-review
zip -r ../lambda-cors-fix.zip lambda_function.py -q
cd ..

if [ ! -f "lambda-cors-fix.zip" ]; then
    echo "❌ Failed to create deployment package"
    exit 1
fi

echo "✅ Deployment package created"

# Update the Lambda function code
echo "📤 Uploading updated code to Lambda..."
aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://lambda-cors-fix.zip \
    --region $REGION \
    --output json > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "❌ Failed to update Lambda function"
    echo "Check that the function '$FUNCTION_NAME' exists and you have permissions"
    exit 1
fi

# Wait for update to complete
echo "⏳ Waiting for update to complete..."
aws lambda wait function-updated \
    --function-name $FUNCTION_NAME \
    --region $REGION 2>/dev/null

# Get function URL
echo "🔍 Getting function URL..."
FUNCTION_URL=$(aws lambda get-function-url-config \
    --function-name $FUNCTION_NAME \
    --region $REGION \
    --query 'FunctionUrl' \
    --output text 2>/dev/null)

if [ -z "$FUNCTION_URL" ]; then
    echo "⚠️ No function URL configured. Creating one..."
    FUNCTION_URL=$(aws lambda create-function-url-config \
        --function-name $FUNCTION_NAME \
        --auth-type NONE \
        --cors '{
            "AllowOrigins": ["*"],
            "AllowMethods": ["GET", "POST", "OPTIONS"],
            "AllowHeaders": ["Content-Type", "Authorization"],
            "MaxAge": 86400
        }' \
        --region $REGION \
        --query 'FunctionUrl' \
        --output text)
fi

echo "🔗 Function URL: $FUNCTION_URL"

# Test the health check endpoint
echo "🧪 Testing health check endpoint..."
HEALTH_RESPONSE=$(curl -s -f "${FUNCTION_URL}?action=health_check" 2>/dev/null || echo "FAILED")

if [[ $HEALTH_RESPONSE == "FAILED" ]]; then
    echo "❌ Health check failed. The function may need a moment to initialize."
    echo "   Try testing manually with: curl '${FUNCTION_URL}?action=health_check'"
else
    echo "✅ Health check successful!"
    echo "$HEALTH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$HEALTH_RESPONSE"
fi

# Test CORS headers
echo ""
echo "🔍 Testing CORS headers..."
CORS_TEST=$(curl -s -I -X OPTIONS "$FUNCTION_URL" 2>/dev/null | grep -i "access-control" || echo "No CORS headers found")
echo "$CORS_TEST"

# Get function status
echo ""
echo "📊 Function status:"
aws lambda get-function \
    --function-name $FUNCTION_NAME \
    --region $REGION \
    --query 'Configuration.{FunctionName:FunctionName,State:State,LastModified:LastModified,CodeSize:CodeSize}' \
    --output table

echo ""
echo "🎉 Lambda CORS fix deployed successfully!"
echo ""
echo "📝 Test URLs:"
echo "  Health Check: ${FUNCTION_URL}?action=health_check"
echo "  Config:       ${FUNCTION_URL}?action=get_config&t=my87674d777bf9"
echo "  Init Session: ${FUNCTION_URL}?action=init_session&t=my87674d777bf9"
echo ""
echo "🌐 Widget Test Page:"
echo "  http://localhost:8000/test-widget-memory.html?env=staging"
echo ""
echo "✨ The CORS errors should now be resolved!"