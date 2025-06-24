#!/bin/bash

# Picasso Staging Deployment Script
# Because we learned the hard way...

set -e  # Exit on error

echo "🚀 Picasso Staging Deployment Script"
echo "===================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "vite.config.js" ]; then
    echo -e "${RED}❌ Error: Must run from Picasso project root${NC}"
    exit 1
fi

echo -e "${YELLOW}📦 Step 1: Building production bundle...${NC}"
npm run build:production

echo -e "${YELLOW}📝 Step 2: Fixing asset paths for staging...${NC}"
# Create the staging HTML with correct paths
node fix-staging-paths.js

echo -e "${YELLOW}🔧 Step 3: Copying widget.js to dist...${NC}"
cp current-widget.js dist/widget.js

echo -e "${YELLOW}☁️  Step 4: Uploading to S3...${NC}"
# Upload everything to staging
aws s3 sync dist/ s3://picassostaging/staging/ \
    --exclude "*.DS_Store" \
    --exclude ".git/*" \
    --delete

echo -e "${YELLOW}🔄 Step 5: Invalidating CloudFront cache...${NC}"
# Invalidate the most important files
INVALIDATION_ID=$(aws cloudfront create-invalidation \
    --distribution-id E3G0LSWB1AQ9LP \
    --paths "/staging/widget.js" "/staging/widget-frame.html" "/staging/widget-frame-staging.html" "/staging/assets/*" \
    --query 'Invalidation.Id' \
    --output text)

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "📋 Deployment Summary:"
echo "   - Build: Production mode"
echo "   - Target: s3://picassostaging/staging/"
echo "   - CloudFront Invalidation: ${INVALIDATION_ID}"
echo ""
echo "🧪 Test URLs:"
echo "   - Widget: https://chat.myrecruiter.ai/staging/widget.js"
echo "   - Test Page: https://chat.myrecruiter.ai/staging/test.html"
echo ""
echo "💡 Tips:"
echo "   - Staging detection is automatic when loaded from /staging/"
echo "   - Foster Village test: data-tenant='fo85e6a06dcdf4'"
echo "   - Cache invalidation takes ~60 seconds"
echo ""

# Wait for invalidation to complete (optional)
read -p "Wait for CloudFront invalidation to complete? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⏳ Waiting for invalidation...${NC}"
    
    # Poll invalidation status
    while true; do
        STATUS=$(aws cloudfront get-invalidation \
            --distribution-id E3G0LSWB1AQ9LP \
            --id ${INVALIDATION_ID} \
            --query 'Invalidation.Status' \
            --output text)
        
        if [ "$STATUS" = "Completed" ]; then
            echo -e "${GREEN}✅ CloudFront invalidation completed!${NC}"
            break
        else
            echo -n "."
            sleep 5
        fi
    done
fi

echo ""
echo -e "${GREEN}🎉 All done! The widget should now work properly in staging.${NC}"
echo ""
echo "Remember: The widget will automatically:"
echo "  1. Detect it's in staging mode"
echo "  2. Load widget-frame-staging.html"
echo "  3. Use /staging/assets/ paths"
echo "  4. Load tenant config from URL params"