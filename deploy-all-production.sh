#!/bin/bash

# Unified Production Deployment Script
# Deploys both Lambda functions and Picasso frontend to production

set -e  # Exit on any error

echo "================================================"
echo "🚀 COMPLETE PRODUCTION DEPLOYMENT"
echo "================================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
AWS_PROFILE="ai-developer"
AWS_REGION="us-east-1"
S3_BUCKET="picassocode"
CLOUDFRONT_DISTRIBUTION_ID="E3G0LSWB1AQ9LP"

# Timestamp
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

print_section() {
    echo ""
    echo "========================================"
    echo "📋 $1"
    echo "========================================"
}

# Confirmation prompt
confirm_deployment() {
    echo -e "${YELLOW}⚠️  WARNING: You are about to deploy to PRODUCTION${NC}"
    echo ""
    echo "This deployment will:"
    echo "  1. Build production frontend assets"
    echo "  2. Deploy frontend to S3/CloudFront"
    echo "  3. Deploy Lambda functions from staging"
    echo "  4. Create new Lambda versions"
    echo "  5. Invalidate CloudFront cache"
    echo ""
    echo "Components to deploy:"
    echo "  • Picasso Widget → S3 bucket: $S3_BUCKET"
    echo "  • Master_Function_Staging → Master_Function"
    echo "  • Bedrock_Streaming_Handler_Staging → Bedrock_Streaming_Handler"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " CONFIRM
    
    if [ "$CONFIRM" != "yes" ]; then
        print_error "Deployment cancelled"
        exit 1
    fi
}

# Step 1: Run pre-deployment validation
run_validation() {
    print_section "Pre-Deployment Validation"
    
    if [ -f "./pre-production-validation.sh" ]; then
        print_info "Running validation suite..."
        ./pre-production-validation.sh
        if [ $? -ne 0 ]; then
            print_error "Validation failed! Fix issues before deploying."
            exit 1
        fi
    else
        print_warning "Validation script not found, skipping..."
    fi
    
    print_success "Validation complete"
}

# Step 2: Build production frontend
build_frontend() {
    print_section "Building Frontend"
    
    print_info "Cleaning previous builds..."
    npm run clean
    
    print_info "Building production assets..."
    npm run build:production
    
    # Check build output
    if [ -d "dist/production" ]; then
        print_success "Production build complete"
        print_info "Build contents:"
        ls -lah dist/production/ | head -10
    else
        print_error "Build failed - dist/production not found"
        exit 1
    fi
}

# Step 3: Deploy Lambda functions
deploy_lambdas() {
    print_section "Deploying Lambda Functions"
    
    if [ -f "./deploy-lambdas-production.sh" ]; then
        print_info "Deploying Lambda functions to production..."
        ./deploy-lambdas-production.sh
        if [ $? -ne 0 ]; then
            print_error "Lambda deployment failed!"
            exit 1
        fi
    else
        print_error "Lambda deployment script not found!"
        exit 1
    fi
    
    print_success "Lambda functions deployed"
}

# Step 4: Deploy frontend to S3
deploy_frontend() {
    print_section "Deploying Frontend to S3"
    
    print_info "Syncing files to S3..."
    aws s3 sync dist/production/ s3://${S3_BUCKET}/ \
        --delete \
        --profile $AWS_PROFILE \
        --cache-control "public, max-age=300" \
        --exclude "*.map" \
        --exclude ".DS_Store"
    
    # Set specific cache headers for critical files
    print_info "Setting cache headers for main files..."
    aws s3 cp dist/production/widget.js s3://${S3_BUCKET}/widget.js \
        --profile $AWS_PROFILE \
        --cache-control "public, max-age=300" \
        --content-type "application/javascript"
    
    aws s3 cp dist/production/widget-frame.html s3://${S3_BUCKET}/widget-frame.html \
        --profile $AWS_PROFILE \
        --cache-control "public, max-age=300" \
        --content-type "text/html"
    
    print_success "Frontend deployed to S3"
}

# Step 5: Invalidate CloudFront cache
invalidate_cloudfront() {
    print_section "Invalidating CloudFront Cache"
    
    print_info "Creating CloudFront invalidation..."
    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id $CLOUDFRONT_DISTRIBUTION_ID \
        --paths "/*" \
        --profile $AWS_PROFILE \
        --query 'Invalidation.Id' \
        --output text)
    
    print_info "Invalidation ID: $INVALIDATION_ID"
    print_info "Waiting for invalidation to complete (this may take 5-10 minutes)..."
    
    aws cloudfront wait invalidation-completed \
        --distribution-id $CLOUDFRONT_DISTRIBUTION_ID \
        --id $INVALIDATION_ID \
        --profile $AWS_PROFILE
    
    print_success "CloudFront cache invalidated"
}

# Step 6: Verify deployment
verify_deployment() {
    print_section "Verifying Deployment"
    
    # Test HTTP endpoint
    print_info "Testing HTTP endpoint..."
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        "https://chat.myrecruiter.ai/Master_Function?action=health_check")
    
    if [ "$HTTP_STATUS" = "200" ]; then
        print_success "HTTP endpoint responding (status: $HTTP_STATUS)"
    else
        print_warning "HTTP endpoint returned status: $HTTP_STATUS"
    fi
    
    # Test Streaming endpoint
    print_info "Testing streaming endpoint..."
    STREAMING_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        "https://xqc4wnxwia2nytjkbw6xasjd6q0jckgb.lambda-url.us-east-1.on.aws/" \
        -X POST \
        -H "Content-Type: application/json" \
        -d '{"test": true}' \
        --max-time 5)
    
    if [ "$STREAMING_STATUS" = "200" ] || [ "$STREAMING_STATUS" = "400" ]; then
        print_success "Streaming endpoint responding (status: $STREAMING_STATUS)"
    else
        print_warning "Streaming endpoint returned status: $STREAMING_STATUS"
    fi
    
    # Test widget loading
    print_info "Testing widget availability..."
    WIDGET_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        "https://chat.myrecruiter.ai/widget.js")
    
    if [ "$WIDGET_STATUS" = "200" ]; then
        print_success "Widget.js accessible (status: $WIDGET_STATUS)"
    else
        print_error "Widget.js not accessible (status: $WIDGET_STATUS)"
    fi
}

# Step 7: Create deployment record
create_deployment_record() {
    print_section "Creating Deployment Record"
    
    RECORD_FILE="deployment-complete-$TIMESTAMP.json"
    
    cat > $RECORD_FILE << EOF
{
  "timestamp": "$TIMESTAMP",
  "deployment_date": "$DEPLOYMENT_DATE",
  "components": {
    "frontend": {
      "s3_bucket": "$S3_BUCKET",
      "cloudfront_distribution": "$CLOUDFRONT_DISTRIBUTION_ID",
      "invalidation_id": "$INVALIDATION_ID"
    },
    "lambda": {
      "http_function": "Master_Function",
      "streaming_function": "Bedrock_Streaming_Handler"
    }
  },
  "endpoints": {
    "widget": "https://chat.myrecruiter.ai/widget.js",
    "http_api": "https://chat.myrecruiter.ai/Master_Function",
    "streaming_api": "https://xqc4wnxwia2nytjkbw6xasjd6q0jckgb.lambda-url.us-east-1.on.aws/"
  },
  "deployed_by": "$(whoami)",
  "git_commit": "$(git rev-parse HEAD)",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD)"
}
EOF
    
    print_success "Deployment record saved: $RECORD_FILE"
}

# Main deployment flow
main() {
    echo "Starting complete production deployment..."
    echo "Timestamp: $TIMESTAMP"
    echo ""
    
    # Get confirmation
    confirm_deployment
    
    # Run deployment steps
    run_validation
    build_frontend
    deploy_lambdas
    deploy_frontend
    invalidate_cloudfront
    verify_deployment
    create_deployment_record
    
    # Final summary
    echo ""
    echo "================================================"
    echo -e "${GREEN}✅ PRODUCTION DEPLOYMENT COMPLETE${NC}"
    echo "================================================"
    echo ""
    echo "Deployed components:"
    echo "  • Frontend: S3 bucket '$S3_BUCKET'"
    echo "  • Lambda: Master_Function & Bedrock_Streaming_Handler"
    echo "  • CloudFront: Invalidation ID $INVALIDATION_ID"
    echo ""
    echo "Endpoints:"
    echo "  • Widget: https://chat.myrecruiter.ai/widget.js"
    echo "  • HTTP API: https://chat.myrecruiter.ai/Master_Function"
    echo "  • Streaming: https://xqc4wnxwia2nytjkbw6xasjd6q0jckgb.lambda-url.us-east-1.on.aws/"
    echo ""
    echo "Next steps:"
    echo "  1. Test the widget on a production page"
    echo "  2. Monitor CloudWatch logs"
    echo "  3. Check performance metrics"
    echo "  4. Update status page"
    echo ""
    echo "Deployment record: $RECORD_FILE"
    echo ""
}

# Run main deployment
main