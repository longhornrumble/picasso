#!/bin/bash

# Picasso Production Deployment Script
# With all the lessons learned...

set -e  # Exit on error

echo "🚀 Picasso Production Deployment Script"
echo "======================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Safety check
echo -e "${RED}⚠️  WARNING: This will deploy to PRODUCTION!${NC}"
read -p "Are you sure you want to continue? (type 'yes' to confirm) " -r
echo
if [[ ! $REPLY == "yes" ]]; then
    echo "Deployment cancelled."
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "vite.config.js" ]; then
    echo -e "${RED}❌ Error: Must run from Picasso project root${NC}"
    exit 1
fi

echo -e "${YELLOW}🧪 Step 1: Running tests...${NC}"
npm test -- --run || {
    echo -e "${RED}❌ Tests failed! Fix them before deploying to production.${NC}"
    exit 1
}

echo -e "${YELLOW}📦 Step 2: Building production bundle...${NC}"
npm run build:production

echo -e "${YELLOW}🔧 Step 3: Copying widget.js to dist...${NC}"
cp current-widget.js dist/widget.js

echo -e "${YELLOW}📋 Step 4: Creating deployment manifest...${NC}"
# Create a deployment record
TIMESTAMP=$(date -u +"%Y-%m-%d_%H-%M-%S")
COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "no-git")
cat > dist/deployment-info.json << EOF
{
  "timestamp": "${TIMESTAMP}",
  "commit": "${COMMIT_HASH}",
  "deployer": "${USER}",
  "environment": "production"
}
EOF

echo -e "${YELLOW}☁️  Step 5: Uploading to S3...${NC}"
# Upload to production (root level)
# IMPORTANT: We use two separate sync commands to preserve the collateral folder
# First, sync everything except files we want to preserve
aws s3 sync dist/ s3://picassocode/ \
    --exclude "*.DS_Store" \
    --exclude ".git/*" \
    --exclude "widget-frame-staging.html" \
    --exclude "collateral/*" \
    --exclude "tenants/*" \
    --delete

# Note: The --delete flag only removes files from S3 that don't exist in dist/
# Since dist/ doesn't contain collateral/ or tenants/, they would be deleted
# That's why we exclude them from the sync with --delete

# Verify collateral folder is preserved
echo -e "${GREEN}✅ Verifying collateral folder preserved...${NC}"
aws s3 ls s3://picassocode/collateral/ --recursive | head -5 || echo "No collateral files found"

echo -e "${YELLOW}🔄 Step 6: Invalidating CloudFront cache...${NC}"
# Invalidate everything for production
INVALIDATION_ID=$(aws cloudfront create-invalidation \
    --distribution-id E3G0LSWB1AQ9LP \
    --paths "/*" \
    --query 'Invalidation.Id' \
    --output text)

echo -e "${GREEN}✅ Production deployment complete!${NC}"
echo ""
echo "📋 Deployment Summary:"
echo "   - Environment: PRODUCTION"
echo "   - Timestamp: ${TIMESTAMP}"
echo "   - Commit: ${COMMIT_HASH}"
echo "   - CloudFront Invalidation: ${INVALIDATION_ID}"
echo ""
echo "🌐 Production URLs:"
echo "   - Widget: https://chat.myrecruiter.ai/widget.js"
echo "   - Test: https://chat.myrecruiter.ai/test.html"
echo ""

# Create a backup tag
echo -e "${YELLOW}🏷️  Step 7: Creating git tag...${NC}"
TAG_NAME="deploy-prod-${TIMESTAMP}"
git tag -a "${TAG_NAME}" -m "Production deployment ${TIMESTAMP}" || {
    echo -e "${YELLOW}⚠️  Could not create git tag (maybe not a git repo)${NC}"
}

echo -e "${BLUE}📝 Post-deployment checklist:${NC}"
echo "   [ ] Test Foster Village widget: fo85e6a06dcdf4"
echo "   [ ] Test another tenant widget"
echo "   [ ] Verify mobile responsiveness"
echo "   [ ] Check browser console for errors"
echo "   [ ] Monitor error logs for 5 minutes"
echo ""

echo -e "${GREEN}🎉 Production deployment complete!${NC}"
echo ""
echo "If something goes wrong:"
echo "  1. Run: ./deploy-staging.sh (to test fixes)"
echo "  2. Or rollback: git checkout ${TAG_NAME} && ./deploy-production.sh"