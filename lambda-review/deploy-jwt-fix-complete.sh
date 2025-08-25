#!/bin/bash

# Deploy JWT fix to Master_Function_Staging with all dependencies
# This script creates a complete deployment package

set -e

echo "🔧 Deploying JWT Token Fix to Master_Function_Staging"
echo "======================================================"

# Configuration
FUNCTION_NAME="Master_Function_Staging"
PROFILE="ai-developer"
REGION="us-east-1"
LAMBDA_DIR="/Users/chrismiller/Desktop/build-process/picasso-main/lambda-review/lambda-review"

# Navigate to lambda directory
cd "$LAMBDA_DIR"

echo "📦 Creating complete deployment package..."

# Remove old package if exists
rm -f lambda-jwt-fix-complete.zip

# Create deployment package with ALL files (including dependencies)
# First, add all Python modules
zip -r lambda-jwt-fix-complete.zip . \
    -x "*.pyc" \
    -x "*__pycache__*" \
    -x "test_*.py" \
    -x "create_*.py" \
    -x "run_*.py" \
    -x "*.zip" \
    -x "*.sh" \
    -x "*.md" \
    -x ".git*" \
    -q

# Get file size
FILE_SIZE=$(ls -lh lambda-jwt-fix-complete.zip | awk '{print $5}')
echo "✅ Deployment package created: lambda-jwt-fix-complete.zip ($FILE_SIZE)"

echo ""
echo "🚀 Updating Lambda function..."
aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://lambda-jwt-fix-complete.zip \
    --profile $PROFILE \
    --region $REGION \
    --output json > deployment-result.json

if [ $? -eq 0 ]; then
    echo "✅ Lambda function updated successfully!"
    
    # Extract and display key information
    LAST_MODIFIED=$(cat deployment-result.json | python3 -c "import json,sys;data=json.load(sys.stdin);print(data.get('LastModified','N/A'))")
    CODE_SIZE=$(cat deployment-result.json | python3 -c "import json,sys;data=json.load(sys.stdin);print(data.get('CodeSize',0))")
    STATE=$(cat deployment-result.json | python3 -c "import json,sys;data=json.load(sys.stdin);print(data.get('State','N/A'))")
    
    echo ""
    echo "📊 Deployment Summary:"
    echo "  - Function: $FUNCTION_NAME"
    echo "  - Last Modified: $LAST_MODIFIED"
    echo "  - Code Size: $CODE_SIZE bytes"
    echo "  - State: $STATE"
    echo ""
    echo "🎯 JWT Token Fix Changes:"
    echo "  1. handle_init_session now creates proper JWT tokens"
    echo "  2. Uses camelCase fields: sessionId, tenantId"
    echo "  3. Signs tokens with HS256 algorithm"
    echo "  4. handle_chat can decode both JWT and base64"
    echo ""
    echo "📝 Testing Commands:"
    echo ""
    echo "  # Test init_session:"
    echo "  curl -X POST 'https://chat.myrecruiter.ai/Master_Function?action=init_session&t=YOUR_TENANT_HASH'"
    echo ""
    echo "  # Test conversation get:"
    echo "  curl -H 'Authorization: Bearer YOUR_JWT_TOKEN' \\"
    echo "       'https://chat.myrecruiter.ai/Master_Function?action=get_conversation&t=YOUR_TENANT_HASH'"
    echo ""
    
    # Clean up
    rm -f deployment-result.json
else
    echo "❌ Deployment failed!"
    # Show error details
    if [ -f deployment-result.json ]; then
        cat deployment-result.json
        rm -f deployment-result.json
    fi
    exit 1
fi

echo ""
echo "✨ Deployment complete!"