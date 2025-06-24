#!/bin/bash
# Picasso Widget Deployment Script
# Usage: ./deploy.sh [staging|production]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
STAGING_BUCKET="picassostaging"
PRODUCTION_BUCKET="picassocode"
CLOUDFRONT_DOMAIN="chat.myrecruiter.ai"

# Check if environment argument is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please specify environment (staging or production)${NC}"
    echo "Usage: ./deploy.sh [staging|production]"
    exit 1
fi

ENVIRONMENT=$1
BUCKET=""

# Set bucket based on environment
if [ "$ENVIRONMENT" == "staging" ]; then
    BUCKET=$STAGING_BUCKET
    echo -e "${YELLOW}🚀 Deploying to STAGING environment${NC}"
elif [ "$ENVIRONMENT" == "production" ]; then
    BUCKET=$PRODUCTION_BUCKET
    echo -e "${RED}🚀 Deploying to PRODUCTION environment${NC}"
    
    # Extra confirmation for production
    echo -e "${YELLOW}⚠️  WARNING: You are about to deploy to PRODUCTION!${NC}"
    read -p "Are you sure? Type 'yes' to continue: " -n 3 -r
    echo
    if [[ ! $REPLY =~ ^yes$ ]]; then
        echo -e "${RED}Deployment cancelled${NC}"
        exit 1
    fi
else
    echo -e "${RED}Error: Invalid environment. Use 'staging' or 'production'${NC}"
    exit 1
fi

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    exit 1
fi

# Build the project
echo -e "${GREEN}📦 Building Picasso widget...${NC}"
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    echo -e "${RED}Error: Build failed - dist directory not found${NC}"
    exit 1
fi

# Upload to S3
echo -e "${GREEN}📤 Uploading to S3 bucket: $BUCKET${NC}"

# Upload HTML files with short cache (5 minutes)
aws s3 sync dist/ s3://$BUCKET/ \
    --exclude "*" \
    --include "*.html" \
    --cache-control "public, max-age=300" \
    --content-type "text/html"

# Upload JS files with short cache (5 minutes) for quick updates
aws s3 sync dist/ s3://$BUCKET/ \
    --exclude "*" \
    --include "*.js" \
    --cache-control "public, max-age=300" \
    --content-type "application/javascript"

# Upload CSS files with medium cache (1 hour)
aws s3 sync dist/ s3://$BUCKET/ \
    --exclude "*" \
    --include "*.css" \
    --cache-control "public, max-age=3600" \
    --content-type "text/css" \
    --metadata-directive REPLACE

# Upload CSS files in assets folder with correct content type
aws s3 sync dist/assets/ s3://$BUCKET/assets/ \
    --exclude "*" \
    --include "*.css" \
    --cache-control "public, max-age=31536000" \
    --content-type "text/css" \
    --metadata-directive REPLACE

# Upload other assets with long cache (1 year)
aws s3 sync dist/ s3://$BUCKET/ \
    --exclude "*.html" \
    --exclude "*.js" \
    --exclude "*.css" \
    --cache-control "public, max-age=31536000"

# Set bucket policy for public read access (if not already set)
echo -e "${GREEN}🔒 Ensuring bucket has public read policy...${NC}"
aws s3api put-bucket-policy --bucket $BUCKET --policy '{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::'$BUCKET'/*"
        }
    ]
}' 2>/dev/null || echo "Bucket policy already exists"

# Get CloudFront distribution ID
echo -e "${GREEN}🔍 Finding CloudFront distribution...${NC}"
DISTRIBUTION_ID=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Aliases.Items[?contains(@, '$CLOUDFRONT_DOMAIN')] | [0]].Id" \
    --output text)

if [ "$DISTRIBUTION_ID" == "None" ] || [ -z "$DISTRIBUTION_ID" ]; then
    echo -e "${YELLOW}⚠️  Warning: Could not find CloudFront distribution for $CLOUDFRONT_DOMAIN${NC}"
    echo "Skipping cache invalidation. You may need to invalidate manually."
else
    # Invalidate CloudFront cache
    echo -e "${GREEN}🔄 Invalidating CloudFront cache...${NC}"
    aws cloudfront create-invalidation \
        --distribution-id $DISTRIBUTION_ID \
        --paths "/*" \
        --query "Invalidation.Id" \
        --output text
fi

# Success message
echo -e "${GREEN}✅ Deployment to $ENVIRONMENT complete!${NC}"
echo -e "${GREEN}🌐 Widget available at: https://$CLOUDFRONT_DOMAIN${NC}"

# Post-deployment tests
echo -e "${YELLOW}🧪 Running post-deployment tests...${NC}"

# Test widget.js availability
WIDGET_URL="https://$CLOUDFRONT_DOMAIN/widget.js"
if curl -s -o /dev/null -w "%{http_code}" $WIDGET_URL | grep -q "200"; then
    echo -e "${GREEN}✅ widget.js is accessible${NC}"
else
    echo -e "${RED}❌ widget.js is NOT accessible${NC}"
fi

# Test widget-frame.html availability
FRAME_URL="https://$CLOUDFRONT_DOMAIN/widget-frame.html"
if curl -s -o /dev/null -w "%{http_code}" $FRAME_URL | grep -q "200"; then
    echo -e "${GREEN}✅ widget-frame.html is accessible${NC}"
else
    echo -e "${RED}❌ widget-frame.html is NOT accessible${NC}"
fi

echo -e "${GREEN}🎉 Deployment process completed!${NC}"