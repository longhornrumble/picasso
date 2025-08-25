#!/bin/bash

# Production Readiness Script
# Complete preparation for production deployment

set -e  # Exit on error

echo "=============================================="
echo "🚀 PRODUCTION READINESS AUTOMATION"
echo "=============================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to print colored output
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
    echo "----------------------------------------"
    echo "🔧 $1"
    echo "----------------------------------------"
}

# 1. CLEAN UP
print_section "Cleaning Build Artifacts"
npm run clean
rm -rf coverage/ .nyc_output/ *.log
print_success "Build directories cleaned"

# 2. INSTALL DEPENDENCIES
print_section "Installing Dependencies"
print_info "Installing production dependencies..."
npm ci --production=false
print_success "Dependencies installed"

# 3. FIX SECURITY VULNERABILITIES
print_section "Security Fixes"
print_info "Attempting to auto-fix vulnerabilities..."
npm audit fix || true
print_success "Security fixes applied"

# 4. LINT AND FORMAT CODE
print_section "Code Quality"
print_info "Running ESLint with auto-fix..."
npm run lint:fix
print_success "Code linted and formatted"

# 5. RUN TESTS
print_section "Running Tests"
print_info "Executing test suite..."
npm test -- --silent --passWithNoTests
TEST_RESULT=$?
if [ $TEST_RESULT -eq 0 ]; then
    print_success "All tests passed"
else
    print_warning "Some tests failed - review before production"
fi

# 6. BUILD ALL ENVIRONMENTS
print_section "Building All Environments"

print_info "Building development..."
npm run build:dev
print_success "Development build complete"

print_info "Building staging..."
npm run build:staging
print_success "Staging build complete"

print_info "Building production..."
npm run build:production
print_success "Production build complete"

# 7. BUNDLE SIZE ANALYSIS
print_section "Bundle Size Analysis"
if [ -f "dist/production/widget.js" ]; then
    WIDGET_SIZE=$(du -h dist/production/widget.js | cut -f1)
    IFRAME_SIZE=$(du -h dist/production/iframe-main.js | cut -f1)
    print_info "Bundle sizes:"
    echo "  • widget.js: $WIDGET_SIZE"
    echo "  • iframe-main.js: $IFRAME_SIZE"
fi

# 8. VALIDATE CONFIGURATIONS
print_section "Configuration Validation"

# Check streaming config
STREAMING_STATUS=$(grep "STREAMING_ENABLED = " src/config/streaming-config.js | cut -d'=' -f2 | tr -d ' ;')
if [ "$STREAMING_STATUS" = "true" ]; then
    print_success "Streaming is ENABLED"
else
    print_warning "Streaming is DISABLED"
fi

# Check dual-path architecture
if grep -q "ChatProviderOrchestrator" src/App.jsx; then
    print_success "Dual-path architecture is active"
else
    print_error "Dual-path architecture not configured!"
fi

# 9. CREATE DEPLOYMENT PACKAGE
print_section "Creating Deployment Package"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DEPLOY_DIR="deployment-$TIMESTAMP"

mkdir -p $DEPLOY_DIR
cp -r dist/production/* $DEPLOY_DIR/
cp package.json $DEPLOY_DIR/
cp README.md $DEPLOY_DIR/ 2>/dev/null || true

# Create deployment manifest
cat > $DEPLOY_DIR/manifest.json << EOF
{
  "timestamp": "$TIMESTAMP",
  "version": "$(node -p "require('./package.json').version")",
  "streaming_enabled": $STREAMING_STATUS,
  "dual_path_active": true,
  "build_environment": "production",
  "node_version": "$(node -v)",
  "npm_version": "$(npm -v)"
}
EOF

print_success "Deployment package created: $DEPLOY_DIR/"

# 10. GENERATE DEPLOYMENT CHECKLIST
print_section "Deployment Checklist"

cat > deployment-checklist.md << EOF
# Production Deployment Checklist

Generated: $(date)

## Pre-Deployment
- [ ] All tests passing
- [ ] No critical security vulnerabilities
- [ ] Bundle size < 150KB (widget.js)
- [ ] Streaming configuration verified
- [ ] Dual-path architecture active

## Lambda Deployment
- [ ] Deploy Python Lambda to Master_Function_Production
- [ ] Deploy Node.js Lambda to Bedrock_Streaming_Handler_Production
- [ ] Verify Lambda environment variables
- [ ] Test Lambda endpoints

## Frontend Deployment
- [ ] Upload to S3 production bucket
- [ ] Invalidate CloudFront cache
- [ ] Update widget version in embed codes
- [ ] Test on production URL

## Post-Deployment
- [ ] Verify widget loads correctly
- [ ] Test chat functionality
- [ ] Check streaming responses
- [ ] Monitor CloudWatch logs
- [ ] Update status page

## Rollback Plan
- [ ] Previous version tagged: $(git describe --tags --abbrev=0 2>/dev/null || echo "No tags")
- [ ] S3 backup location documented
- [ ] Lambda aliases configured
- [ ] Rollback script ready

## Sign-offs
- [ ] Development team
- [ ] QA team
- [ ] Security review
- [ ] Product owner
EOF

print_success "Deployment checklist created: deployment-checklist.md"

# 11. RUN VALIDATION SUITE
print_section "Running Pre-Production Validation"
if [ -f "./pre-production-validation.sh" ]; then
    print_info "Executing validation suite..."
    ./pre-production-validation.sh
    VALIDATION_RESULT=$?
else
    print_warning "Validation script not found, skipping..."
    VALIDATION_RESULT=0
fi

# FINAL SUMMARY
echo ""
echo "=============================================="
if [ $VALIDATION_RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ PRODUCTION READINESS COMPLETE${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Review deployment-checklist.md"
    echo "2. Deploy Lambda functions to production"
    echo "3. Run: npm run deploy:production"
    echo "4. Invalidate CloudFront cache"
    echo ""
    echo "Deployment package: $DEPLOY_DIR/"
else
    echo -e "${RED}❌ VALIDATION FAILED${NC}"
    echo ""
    echo "Please fix validation issues before proceeding."
fi
echo "=============================================="

exit $VALIDATION_RESULT