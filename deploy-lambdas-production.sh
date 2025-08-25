#!/bin/bash

# Lambda Production Deployment Script
# Deploys staging Lambda functions to production with proper versioning

set -e  # Exit on any error

echo "================================================"
echo "🚀 Lambda Production Deployment"
echo "================================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# AWS Configuration
AWS_PROFILE="ai-developer"
AWS_REGION="us-east-1"

# Function names
HTTP_STAGING="Master_Function_Staging"
HTTP_PRODUCTION="Master_Function"
STREAMING_STAGING="Bedrock_Streaming_Handler_Staging"
STREAMING_PRODUCTION="Bedrock_Streaming_Handler"

# Timestamp for versioning
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DEPLOYMENT_DATE=$(date +"%Y-%m-%d %H:%M:%S")

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to deploy Lambda
deploy_lambda() {
    local SOURCE_FUNCTION=$1
    local TARGET_FUNCTION=$2
    local FUNCTION_TYPE=$3
    
    echo ""
    echo "----------------------------------------"
    echo "📦 Deploying $FUNCTION_TYPE Lambda"
    echo "----------------------------------------"
    print_info "Source: $SOURCE_FUNCTION"
    print_info "Target: $TARGET_FUNCTION"
    
    # Step 1: Download staging function code
    print_info "Downloading staging function code..."
    aws lambda get-function --function-name $SOURCE_FUNCTION \
        --profile $AWS_PROFILE \
        --region $AWS_REGION \
        --query 'Code.Location' \
        --output text > /tmp/lambda_url.txt
    
    DOWNLOAD_URL=$(cat /tmp/lambda_url.txt)
    curl -s -o /tmp/${SOURCE_FUNCTION}.zip "$DOWNLOAD_URL"
    
    if [ -f /tmp/${SOURCE_FUNCTION}.zip ]; then
        print_success "Code downloaded successfully"
    else
        print_error "Failed to download function code"
        return 1
    fi
    
    # Step 2: Update production function code
    print_info "Updating production function code..."
    aws lambda update-function-code \
        --function-name $TARGET_FUNCTION \
        --zip-file fileb:///tmp/${SOURCE_FUNCTION}.zip \
        --profile $AWS_PROFILE \
        --region $AWS_REGION \
        --output json > /tmp/update_result.json
    
    UPDATE_STATUS=$(jq -r '.LastUpdateStatus' /tmp/update_result.json)
    print_info "Update status: $UPDATE_STATUS"
    
    # Step 3: Wait for update to complete
    print_info "Waiting for update to complete..."
    aws lambda wait function-updated \
        --function-name $TARGET_FUNCTION \
        --profile $AWS_PROFILE \
        --region $AWS_REGION
    
    print_success "Function code updated"
    
    # Step 4: Create a new version
    print_info "Creating new version..."
    VERSION_RESULT=$(aws lambda publish-version \
        --function-name $TARGET_FUNCTION \
        --description "Production deployment $TIMESTAMP from $SOURCE_FUNCTION" \
        --profile $AWS_PROFILE \
        --region $AWS_REGION \
        --output json)
    
    VERSION=$(echo $VERSION_RESULT | jq -r '.Version')
    print_success "Created version: $VERSION"
    
    # Step 5: Update production alias (if exists) or create it
    print_info "Updating production alias..."
    aws lambda update-alias \
        --function-name $TARGET_FUNCTION \
        --name production \
        --function-version $VERSION \
        --description "Production deployment $DEPLOYMENT_DATE" \
        --profile $AWS_PROFILE \
        --region $AWS_REGION \
        --output json 2>/dev/null || \
    aws lambda create-alias \
        --function-name $TARGET_FUNCTION \
        --name production \
        --function-version $VERSION \
        --description "Production deployment $DEPLOYMENT_DATE" \
        --profile $AWS_PROFILE \
        --region $AWS_REGION \
        --output json
    
    print_success "$FUNCTION_TYPE Lambda deployed to production (version $VERSION)"
    
    # Clean up
    rm -f /tmp/${SOURCE_FUNCTION}.zip /tmp/lambda_url.txt /tmp/update_result.json
    
    return 0
}

# Function to verify endpoints
verify_endpoints() {
    echo ""
    echo "----------------------------------------"
    echo "🔍 Verifying Production Endpoints"
    echo "----------------------------------------"
    
    # Verify HTTP endpoint via CloudFront
    print_info "Testing HTTP endpoint (CloudFront)..."
    HTTP_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
        "https://chat.myrecruiter.ai/Master_Function?action=health_check" \
        -H "Accept: application/json")
    
    if [ "$HTTP_RESPONSE" = "200" ]; then
        print_success "HTTP endpoint responding (status: $HTTP_RESPONSE)"
    else
        print_warning "HTTP endpoint returned status: $HTTP_RESPONSE"
    fi
    
    # Verify Streaming Function URL
    print_info "Verifying streaming function URL..."
    STREAMING_URL=$(aws lambda get-function-url-config \
        --function-name $STREAMING_PRODUCTION \
        --profile $AWS_PROFILE \
        --region $AWS_REGION \
        --query 'FunctionUrl' \
        --output text 2>/dev/null)
    
    if [ -n "$STREAMING_URL" ]; then
        print_success "Streaming Function URL: $STREAMING_URL"
        
        # Test streaming endpoint
        STREAMING_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
            "$STREAMING_URL" \
            -X POST \
            -H "Content-Type: application/json" \
            -d '{"test": true}' \
            --max-time 5)
        
        if [ "$STREAMING_RESPONSE" = "200" ] || [ "$STREAMING_RESPONSE" = "400" ]; then
            print_success "Streaming endpoint responding (status: $STREAMING_RESPONSE)"
        else
            print_warning "Streaming endpoint returned status: $STREAMING_RESPONSE"
        fi
    else
        print_error "No Function URL configured for streaming"
    fi
}

# Function to create deployment record
create_deployment_record() {
    echo ""
    echo "----------------------------------------"
    echo "📝 Creating Deployment Record"
    echo "----------------------------------------"
    
    cat > "deployment-record-$TIMESTAMP.json" << EOF
{
  "timestamp": "$TIMESTAMP",
  "deployment_date": "$DEPLOYMENT_DATE",
  "functions": {
    "http": {
      "source": "$HTTP_STAGING",
      "target": "$HTTP_PRODUCTION",
      "version": "$HTTP_VERSION",
      "endpoint": "https://chat.myrecruiter.ai/Master_Function"
    },
    "streaming": {
      "source": "$STREAMING_STAGING",
      "target": "$STREAMING_PRODUCTION",
      "version": "$STREAMING_VERSION",
      "endpoint": "$STREAMING_URL"
    }
  },
  "deployed_by": "$(whoami)",
  "aws_profile": "$AWS_PROFILE",
  "aws_region": "$AWS_REGION"
}
EOF
    
    print_success "Deployment record saved: deployment-record-$TIMESTAMP.json"
}

# Main deployment flow
main() {
    echo "Starting production deployment..."
    echo ""
    
    # Confirmation prompt
    echo -e "${YELLOW}⚠️  WARNING: You are about to deploy to PRODUCTION${NC}"
    echo "This will:"
    echo "  1. Copy code from staging functions to production"
    echo "  2. Create new versions of production functions"
    echo "  3. Update production aliases"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " CONFIRM
    
    if [ "$CONFIRM" != "yes" ]; then
        print_error "Deployment cancelled"
        exit 1
    fi
    
    # Deploy HTTP Lambda
    if deploy_lambda "$HTTP_STAGING" "$HTTP_PRODUCTION" "HTTP"; then
        HTTP_VERSION=$VERSION
        print_success "HTTP Lambda deployment complete"
    else
        print_error "HTTP Lambda deployment failed"
        exit 1
    fi
    
    # Deploy Streaming Lambda
    if deploy_lambda "$STREAMING_STAGING" "$STREAMING_PRODUCTION" "Streaming"; then
        STREAMING_VERSION=$VERSION
        print_success "Streaming Lambda deployment complete"
    else
        print_error "Streaming Lambda deployment failed"
        exit 1
    fi
    
    # Verify endpoints
    verify_endpoints
    
    # Create deployment record
    create_deployment_record
    
    echo ""
    echo "================================================"
    echo -e "${GREEN}✅ PRODUCTION DEPLOYMENT COMPLETE${NC}"
    echo "================================================"
    echo ""
    echo "Deployed versions:"
    echo "  • $HTTP_PRODUCTION: v$HTTP_VERSION"
    echo "  • $STREAMING_PRODUCTION: v$STREAMING_VERSION"
    echo ""
    echo "Endpoints:"
    echo "  • HTTP: https://chat.myrecruiter.ai/Master_Function"
    echo "  • Streaming: $STREAMING_URL"
    echo ""
    echo "Next steps:"
    echo "  1. Test the production widget"
    echo "  2. Monitor CloudWatch logs"
    echo "  3. Check CloudWatch metrics"
    echo ""
    echo "To rollback if needed:"
    echo "  aws lambda update-alias --function-name $HTTP_PRODUCTION --name production --function-version \$PREVIOUS_VERSION"
    echo "  aws lambda update-alias --function-name $STREAMING_PRODUCTION --name production --function-version \$PREVIOUS_VERSION"
    echo ""
}

# Run main deployment
main