#!/bin/bash
# Picasso Widget Deployment Script (esbuild version)
# Usage: ./deploy-esbuild.sh [staging|production]
# 
# This script handles the complete deployment process including:
# - Pre-deployment validation
# - Building with esbuild
# - S3 upload with proper cache headers
# - CloudFront invalidation
# - Post-deployment verification
# - Rollback instructions

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
STAGING_BUCKET="picasso-staging"
PRODUCTION_BUCKET="picassocode"
STAGING_CLOUDFRONT_ID="YOUR_STAGING_CF_ID"  # Update this
PRODUCTION_CLOUDFRONT_ID="E3G0LSWB1AQ9LP"   # Production CloudFront ID from deploy-production.sh

# Function to print section headers
print_header() {
    echo ""
    echo "============================================"
    echo "$1"
    echo "============================================"
    echo ""
}

# Check if environment argument is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please specify environment (staging or production)${NC}"
    echo "Usage: ./deploy-esbuild.sh [staging|production]"
    exit 1
fi

ENVIRONMENT=$1
BUCKET=""
CLOUDFRONT_ID=""
BUILD_ENV=""
CLOUDFRONT_DOMAIN=""

# Set configuration based on environment
if [ "$ENVIRONMENT" == "staging" ]; then
    BUCKET=$STAGING_BUCKET
    CLOUDFRONT_ID=$STAGING_CLOUDFRONT_ID
    BUILD_ENV="staging"
    CLOUDFRONT_DOMAIN="picassostaging.s3.amazonaws.com"
    echo -e "${YELLOW}🚀 Preparing STAGING deployment${NC}"
elif [ "$ENVIRONMENT" == "production" ]; then
    BUCKET=$PRODUCTION_BUCKET
    CLOUDFRONT_ID=$PRODUCTION_CLOUDFRONT_ID
    BUILD_ENV="production"
    CLOUDFRONT_DOMAIN="chat.myrecruiter.ai"
    echo -e "${RED}🚀 Preparing PRODUCTION deployment${NC}"
    
    # Extra confirmation for production
    echo -e "${RED}⚠️  WARNING: You are about to deploy to PRODUCTION!${NC}"
    echo -e "${YELLOW}This will affect all live customers.${NC}"
    read -p "Type 'deploy-production' to continue: " -r
    echo
    if [[ ! $REPLY == "deploy-production" ]]; then
        echo -e "${RED}Deployment cancelled${NC}"
        exit 1
    fi
else
    echo -e "${RED}Error: Invalid environment. Use 'staging' or 'production'${NC}"
    exit 1
fi

# Pre-deployment checks
print_header "Pre-Deployment Validation"

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "esbuild.config.mjs" ]; then
    echo -e "${RED}❌ Error: Must run from picasso-main project root${NC}"
    echo "Current directory: $(pwd)"
    exit 1
fi

# Check if AWS CLI is installed and configured
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ Error: AWS CLI is not installed${NC}"
    exit 1
fi

# Test AWS credentials
echo -e "${YELLOW}Verifying AWS credentials...${NC}"
aws sts get-caller-identity > /dev/null || {
    echo -e "${RED}❌ Error: AWS credentials not configured${NC}"
    exit 1
}
echo -e "${GREEN}✅ AWS credentials valid${NC}"

# Check for uncommitted changes
if [[ -n $(git status -s 2>/dev/null) ]]; then
    echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes${NC}"
    git status -s
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Deployment cancelled${NC}"
        exit 1
    fi
fi

# Get current git info for tagging
TIMESTAMP=$(date -u +"%Y-%m-%d_%H-%M-%S")
COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "no-git")
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# Build the project with esbuild
print_header "Building with esbuild"

echo -e "${GREEN}📦 Building for ${BUILD_ENV} environment...${NC}"
BUILD_ENV=$BUILD_ENV npm run build

# Verify build output
if [ ! -d "dist/$BUILD_ENV" ]; then
    echo -e "${RED}❌ Error: Build failed - dist/$BUILD_ENV directory not found${NC}"
    exit 1
fi

# Check build size
TOTAL_SIZE=$(du -sh dist/$BUILD_ENV | cut -f1)
echo -e "${GREEN}✅ Build complete. Total size: ${TOTAL_SIZE}${NC}"

# Check for critical files
CRITICAL_FILES=("widget.js" "iframe.html" "iframe-main.js" "iframe-main.css")
for file in "${CRITICAL_FILES[@]}"; do
    if [ ! -f "dist/$BUILD_ENV/$file" ]; then
        echo -e "${RED}❌ Error: Critical file missing: $file${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✅ All critical files present${NC}"

# Create deployment manifest
print_header "Creating Deployment Manifest"

cat > dist/$BUILD_ENV/deployment-info.json << EOF
{
  "timestamp": "${TIMESTAMP}",
  "commit": "${COMMIT_HASH}",
  "branch": "${BRANCH}",
  "deployer": "${USER}",
  "environment": "${ENVIRONMENT}",
  "build_tool": "esbuild",
  "node_version": "$(node -v)",
  "npm_version": "$(npm -v)"
}
EOF
echo -e "${GREEN}✅ Deployment manifest created${NC}"

# Upload to S3
print_header "Uploading to S3"

echo -e "${YELLOW}📤 Uploading to S3 bucket: $BUCKET${NC}"

# First, backup current production if deploying to production
if [ "$ENVIRONMENT" == "production" ]; then
    BACKUP_PATH="backups/${TIMESTAMP}"
    echo -e "${YELLOW}Creating backup at s3://$BUCKET/$BACKUP_PATH${NC}"
    aws s3 sync s3://$BUCKET/ s3://$BUCKET/$BACKUP_PATH/ \
        --exclude "backups/*" \
        --exclude "tenants/*" \
        --exclude "collateral/*" \
        --quiet
    echo -e "${GREEN}✅ Backup created${NC}"
fi

# Upload widget.js and iframe.html with short cache (5 minutes)
echo "Uploading entry files with 5-minute cache..."
aws s3 cp dist/$BUILD_ENV/widget.js s3://$BUCKET/widget.js \
    --cache-control "public, max-age=300, must-revalidate" \
    --content-type "application/javascript"

aws s3 cp dist/$BUILD_ENV/iframe.html s3://$BUCKET/widget-frame.html \
    --cache-control "public, max-age=300, must-revalidate" \
    --content-type "text/html"

# Also upload as iframe.html for backward compatibility
aws s3 cp dist/$BUILD_ENV/iframe.html s3://$BUCKET/iframe.html \
    --cache-control "public, max-age=300, must-revalidate" \
    --content-type "text/html"

# Upload main application files with medium cache (1 hour)
echo "Uploading application files with 1-hour cache..."
for file in iframe-main.js iframe-main.css widget-standalone.js; do
    if [ -f "dist/$BUILD_ENV/$file" ]; then
        if [[ $file == *.js ]]; then
            CONTENT_TYPE="application/javascript"
        elif [[ $file == *.css ]]; then
            CONTENT_TYPE="text/css"
        else
            CONTENT_TYPE="application/octet-stream"
        fi
        
        aws s3 cp dist/$BUILD_ENV/$file s3://$BUCKET/$file \
            --cache-control "public, max-age=3600" \
            --content-type "$CONTENT_TYPE"
    fi
done

# Upload chunk files with long cache (1 year) since they're hashed
if [ -d "dist/$BUILD_ENV/chunks" ]; then
    echo "Uploading chunk files with 1-year cache..."
    aws s3 sync dist/$BUILD_ENV/chunks/ s3://$BUCKET/chunks/ \
        --cache-control "public, max-age=31536000, immutable" \
        --delete
fi

# Upload assets with long cache (1 year) since they're hashed
if [ -d "dist/$BUILD_ENV/assets" ]; then
    echo "Uploading asset files with 1-year cache..."
    aws s3 sync dist/$BUILD_ENV/assets/ s3://$BUCKET/assets/ \
        --cache-control "public, max-age=31536000, immutable" \
        --delete
fi

# Upload test files if present
if [ -f "dist/$BUILD_ENV/test-staging.html" ]; then
    echo "Uploading test files..."
    aws s3 cp dist/$BUILD_ENV/test-staging.html s3://$BUCKET/test-staging.html \
        --cache-control "public, max-age=300" \
        --content-type "text/html"
fi

# Upload deployment manifest
aws s3 cp dist/$BUILD_ENV/deployment-info.json s3://$BUCKET/deployment-info.json \
    --cache-control "public, max-age=300" \
    --content-type "application/json"

echo -e "${GREEN}✅ S3 upload complete${NC}"

# CloudFront invalidation
print_header "CloudFront Cache Invalidation"

if [ -n "$CLOUDFRONT_ID" ] && [ "$CLOUDFRONT_ID" != "YOUR_STAGING_CF_ID" ]; then
    echo -e "${YELLOW}🔄 Creating CloudFront invalidation...${NC}"
    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id $CLOUDFRONT_ID \
        --paths "/*" \
        --query 'Invalidation.Id' \
        --output text)
    echo -e "${GREEN}✅ CloudFront invalidation created: ${INVALIDATION_ID}${NC}"
else
    echo -e "${YELLOW}⚠️  CloudFront ID not configured, skipping invalidation${NC}"
fi

# Post-deployment verification
print_header "Post-Deployment Verification"

echo -e "${YELLOW}🧪 Running verification tests...${NC}"

# Test widget.js availability
WIDGET_URL="https://$CLOUDFRONT_DOMAIN/widget.js"
echo -n "Testing widget.js... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $WIDGET_URL)
if [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}✅ OK (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}❌ FAILED (HTTP $HTTP_CODE)${NC}"
fi

# Test widget-frame.html availability
FRAME_URL="https://$CLOUDFRONT_DOMAIN/widget-frame.html"
echo -n "Testing widget-frame.html... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $FRAME_URL)
if [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}✅ OK (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}❌ FAILED (HTTP $HTTP_CODE)${NC}"
fi

# Test iframe-main.js availability
MAIN_URL="https://$CLOUDFRONT_DOMAIN/iframe-main.js"
echo -n "Testing iframe-main.js... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $MAIN_URL)
if [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}✅ OK (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}❌ FAILED (HTTP $HTTP_CODE)${NC}"
fi

# Create git tag for this deployment
if [ "$ENVIRONMENT" == "production" ]; then
    TAG_NAME="deploy-prod-${TIMESTAMP}"
    echo -e "${YELLOW}🏷️  Creating git tag: ${TAG_NAME}${NC}"
    git tag -a "${TAG_NAME}" -m "Production deployment ${TIMESTAMP}" 2>/dev/null || {
        echo -e "${YELLOW}⚠️  Could not create git tag${NC}"
    }
fi

# Summary
print_header "Deployment Summary"

echo -e "${GREEN}✅ Deployment to ${ENVIRONMENT} complete!${NC}"
echo ""
echo "📋 Deployment Details:"
echo "   Environment: ${ENVIRONMENT}"
echo "   Timestamp: ${TIMESTAMP}"
echo "   Commit: ${COMMIT_HASH}"
echo "   Branch: ${BRANCH}"
echo "   S3 Bucket: ${BUCKET}"
echo "   CloudFront: ${CLOUDFRONT_DOMAIN}"
if [ -n "$INVALIDATION_ID" ]; then
    echo "   Invalidation: ${INVALIDATION_ID}"
fi
echo ""
echo "🌐 URLs:"
echo "   Widget: https://${CLOUDFRONT_DOMAIN}/widget.js"
echo "   Test Page: https://${CLOUDFRONT_DOMAIN}/test-staging.html"
echo ""

# Post-deployment checklist
echo -e "${BLUE}📝 Post-Deployment Checklist:${NC}"
echo "   [ ] Test widget loads correctly"
echo "   [ ] Test chat opens and closes"
echo "   [ ] Send a test message"
echo "   [ ] Check browser console for errors"
echo "   [ ] Test on mobile device"
echo "   [ ] Monitor Lambda logs for 5 minutes"
if [ "$ENVIRONMENT" == "production" ]; then
    echo "   [ ] Test Foster Village: fo85e6a06dcdf4"
    echo "   [ ] Test another production tenant"
fi
echo ""

# Rollback instructions
echo -e "${YELLOW}🔄 Rollback Instructions (if needed):${NC}"
if [ "$ENVIRONMENT" == "production" ]; then
    echo "   1. Quick rollback to backup:"
    echo "      aws s3 sync s3://$BUCKET/$BACKUP_PATH/ s3://$BUCKET/ --delete"
    echo "   2. Invalidate CloudFront:"
    echo "      aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths '/*'"
    echo "   3. Or checkout previous tag and redeploy:"
    echo "      git checkout ${TAG_NAME} && ./deploy-esbuild.sh production"
else
    echo "   Redeploy from a previous commit:"
    echo "   git checkout <commit-hash> && ./deploy-esbuild.sh staging"
fi
echo ""

echo -e "${GREEN}🎉 Deployment process completed successfully!${NC}"