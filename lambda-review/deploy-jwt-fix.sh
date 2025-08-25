#!/bin/bash

# Deploy JWT fix to Master_Function_Staging
# This script updates the lambda_function.py to properly create JWT tokens

set -e

echo "🔧 Deploying JWT Token Fix to Master_Function_Staging"
echo "======================================================"

# Configuration
FUNCTION_NAME="Master_Function_Staging"
PROFILE="ai-developer"
REGION="us-east-1"

# Navigate to lambda-review directory
cd /Users/chrismiller/Desktop/build-process/picasso-main/lambda-review/lambda-review

echo "📦 Creating deployment package..."
# Remove old package if exists
rm -f lambda-jwt-fix.zip

# Create new deployment package with all Python files
zip -q lambda-jwt-fix.zip \
    lambda_function.py \
    conversation_handler.py \
    intent_router.py \
    bedrock_handler.py \
    response_formatter.py \
    session_utils.py \
    tenant_config_loader.py \
    tenant_inference.py \
    audit_logger.py \
    aws_client_manager.py \
    state_clear_handler.py \
    token_blacklist.py \
    six.py

echo "✅ Deployment package created"

echo "🚀 Updating Lambda function..."
aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://lambda-jwt-fix.zip \
    --profile $PROFILE \
    --region $REGION \
    --output json > deployment-result.json

if [ $? -eq 0 ]; then
    echo "✅ Lambda function updated successfully!"
    
    # Extract and display key information
    LAST_MODIFIED=$(cat deployment-result.json | grep -o '"LastModified": "[^"]*' | cut -d'"' -f4)
    CODE_SIZE=$(cat deployment-result.json | grep -o '"CodeSize": [0-9]*' | cut -d' ' -f2)
    
    echo ""
    echo "📊 Deployment Summary:"
    echo "  - Function: $FUNCTION_NAME"
    echo "  - Last Modified: $LAST_MODIFIED"
    echo "  - Code Size: $CODE_SIZE bytes"
    echo ""
    echo "🎯 JWT Token Fix Changes:"
    echo "  1. handle_init_session now creates proper JWT tokens (not base64)"
    echo "  2. Uses camelCase fields: sessionId, tenantId (not snake_case)"
    echo "  3. Signs tokens with HS256 algorithm"
    echo "  4. handle_chat can decode both JWT and base64 for compatibility"
    echo ""
    echo "📝 Next Steps:"
    echo "  1. Test init_session endpoint to verify JWT creation"
    echo "  2. Test conversation endpoints with new tokens"
    echo "  3. Enable CONVERSATION_ENDPOINT_AVAILABLE in frontend"
    
    # Clean up
    rm -f deployment-result.json
else
    echo "❌ Deployment failed!"
    exit 1
fi

echo ""
echo "✨ Deployment complete!"