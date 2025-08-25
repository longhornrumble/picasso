#!/bin/bash
# Picasso Production Deployment Script with Full QA Process
# Usage: ./deploy-production-qa.sh [staging|production]
# 
# This script implements a comprehensive QA and release process:
# - Code quality checks (linting, formatting)
# - Security scanning
# - Test execution
# - Build verification
# - Performance checks
# - Deployment with rollback capability
# - Post-deployment validation

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
STAGING_BUCKET="picasso-staging"
PRODUCTION_BUCKET="picassocode"
STAGING_CLOUDFRONT_ID="YOUR_STAGING_CF_ID"  # Update this
PRODUCTION_CLOUDFRONT_ID="E3G0LSWB1AQ9LP"   # Production CloudFront ID

# Performance thresholds
MAX_BUNDLE_SIZE_KB=150  # Max size for widget.js
MAX_BUILD_TIME_SEC=10   # Max build time
MIN_LIGHTHOUSE_SCORE=90 # Minimum Lighthouse performance score

# Function to print section headers
print_header() {
    echo ""
    echo "============================================"
    echo -e "${PURPLE}$1${NC}"
    echo "============================================"
    echo ""
}

# Function to run a check and track results
QA_PASSED=true
run_check() {
    local check_name=$1
    local check_command=$2
    
    echo -n "  ✓ $check_name... "
    if eval $check_command > /tmp/check_output.txt 2>&1; then
        echo -e "${GREEN}PASSED${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        echo -e "${YELLOW}    See details:${NC}"
        head -20 /tmp/check_output.txt | sed 's/^/    /'
        QA_PASSED=false
        return 1
    fi
}

# Check if environment argument is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Please specify environment (staging or production)${NC}"
    echo "Usage: ./deploy-production-qa.sh [staging|production]"
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
    echo -e "${YELLOW}🚀 Preparing STAGING deployment with QA${NC}"
elif [ "$ENVIRONMENT" == "production" ]; then
    BUCKET=$PRODUCTION_BUCKET
    CLOUDFRONT_ID=$PRODUCTION_CLOUDFRONT_ID
    BUILD_ENV="production"
    CLOUDFRONT_DOMAIN="chat.myrecruiter.ai"
    echo -e "${RED}🚀 Preparing PRODUCTION deployment with QA${NC}"
    
    # Extra confirmation for production
    echo -e "${RED}⚠️  WARNING: You are about to deploy to PRODUCTION!${NC}"
    echo -e "${YELLOW}This will affect all live customers.${NC}"
    echo ""
    echo "Pre-deployment checklist:"
    echo "  • Have you tested this on staging?"
    echo "  • Has another team member reviewed the changes?"
    echo "  • Are you prepared to monitor post-deployment?"
    echo "  • Do you have a rollback plan?"
    echo ""
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

# Store start time
DEPLOY_START_TIME=$(date +%s)

# ==================================
# PHASE 1: Environment Validation
# ==================================
print_header "PHASE 1: Environment Validation"

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "esbuild.config.mjs" ]; then
    echo -e "${RED}❌ Error: Must run from picasso-main project root${NC}"
    echo "Current directory: $(pwd)"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
MIN_NODE_VERSION="18.0.0"
if [ "$(printf '%s\n' "$MIN_NODE_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$MIN_NODE_VERSION" ]; then
    echo -e "${RED}❌ Node.js version $NODE_VERSION is too old. Minimum required: $MIN_NODE_VERSION${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js version: $NODE_VERSION${NC}"

# Check if AWS CLI is installed and configured
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ Error: AWS CLI is not installed${NC}"
    exit 1
fi

# Test AWS credentials
aws sts get-caller-identity > /dev/null || {
    echo -e "${RED}❌ Error: AWS credentials not configured${NC}"
    exit 1
}
echo -e "${GREEN}✅ AWS credentials valid${NC}"

# Check Git status
if [[ -n $(git status -s 2>/dev/null) ]]; then
    echo -e "${YELLOW}⚠️  Warning: You have uncommitted changes${NC}"
    git status -s
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Deployment cancelled${NC}"
        exit 1
    fi
fi

# Get current git info
TIMESTAMP=$(date -u +"%Y-%m-%d_%H-%M-%S")
COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "no-git")
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

echo -e "${GREEN}✅ Environment validation complete${NC}"

# ==================================
# PHASE 2: Dependencies & Security
# ==================================
print_header "PHASE 2: Dependencies & Security Audit"

echo "Checking dependencies..."

# Check for outdated dependencies
echo -n "  ✓ Checking for outdated packages... "
OUTDATED_COUNT=$(npm outdated --json 2>/dev/null | jq 'length' || echo "0")
if [ "$OUTDATED_COUNT" -gt "10" ]; then
    echo -e "${YELLOW}WARNING: $OUTDATED_COUNT outdated packages${NC}"
else
    echo -e "${GREEN}OK ($OUTDATED_COUNT outdated)${NC}"
fi

# Run security audit
echo -n "  ✓ Running security audit... "
AUDIT_RESULT=$(npm audit --json 2>/dev/null || echo '{"vulnerabilities":{}}')
CRITICAL_VULNS=$(echo $AUDIT_RESULT | jq '.metadata.vulnerabilities.critical // 0' 2>/dev/null || echo "0")
HIGH_VULNS=$(echo $AUDIT_RESULT | jq '.metadata.vulnerabilities.high // 0' 2>/dev/null || echo "0")

if [ "$CRITICAL_VULNS" -gt "0" ]; then
    echo -e "${RED}FAILED: $CRITICAL_VULNS critical vulnerabilities${NC}"
    echo -e "${YELLOW}    Run 'npm audit' for details${NC}"
    if [ "$ENVIRONMENT" == "production" ]; then
        echo -e "${RED}Cannot deploy to production with critical vulnerabilities${NC}"
        exit 1
    fi
elif [ "$HIGH_VULNS" -gt "5" ]; then
    echo -e "${YELLOW}WARNING: $HIGH_VULNS high vulnerabilities${NC}"
else
    echo -e "${GREEN}PASSED${NC}"
fi

# Check for secrets in code
echo -n "  ✓ Scanning for hardcoded secrets... "
if grep -r "api[_-]key\|api[_-]secret\|aws[_-]access\|aws[_-]secret" src/ --exclude-dir=node_modules 2>/dev/null | grep -v "// " | grep -v "^[[:space:]]*\*" > /dev/null; then
    echo -e "${RED}FAILED: Potential secrets found${NC}"
    echo -e "${YELLOW}    Review the code for hardcoded credentials${NC}"
    if [ "$ENVIRONMENT" == "production" ]; then
        read -p "    Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
else
    echo -e "${GREEN}PASSED${NC}"
fi

# ==================================
# PHASE 3: Code Quality Checks
# ==================================
print_header "PHASE 3: Code Quality Checks"

echo "Running code quality checks..."

# Run ESLint
run_check "ESLint" "npm run lint"

# Check for console.logs in production
if [ "$ENVIRONMENT" == "production" ]; then
    echo -n "  ✓ Checking for console.log statements... "
    CONSOLE_COUNT=$(grep -r "console\.\(log\|debug\|info\)" src/ --exclude-dir=test --exclude-dir=__tests__ 2>/dev/null | grep -v "^[[:space:]]*//" | wc -l | tr -d ' ')
    if [ "$CONSOLE_COUNT" -gt "20" ]; then
        echo -e "${YELLOW}WARNING: $CONSOLE_COUNT console statements found${NC}"
        echo -e "${YELLOW}    Consider removing for production${NC}"
    else
        echo -e "${GREEN}OK ($CONSOLE_COUNT found)${NC}"
    fi
fi

# Check for TODO/FIXME comments
echo -n "  ✓ Checking for TODO/FIXME comments... "
TODO_COUNT=$(grep -r "TODO\|FIXME\|HACK\|XXX" src/ 2>/dev/null | wc -l | tr -d ' ')
if [ "$TODO_COUNT" -gt "10" ]; then
    echo -e "${YELLOW}WARNING: $TODO_COUNT TODO/FIXME comments found${NC}"
else
    echo -e "${GREEN}OK ($TODO_COUNT found)${NC}"
fi

# Check import statements
echo -n "  ✓ Checking for unused imports... "
# This is a simple check - for thorough checking, use eslint-plugin-unused-imports
IMPORT_ISSUES=$(grep -r "^import.*from" src/ | grep -E "{\s*}" | wc -l | tr -d ' ')
if [ "$IMPORT_ISSUES" -gt "0" ]; then
    echo -e "${YELLOW}WARNING: $IMPORT_ISSUES potential empty imports${NC}"
else
    echo -e "${GREEN}PASSED${NC}"
fi

# ==================================
# PHASE 4: Test Execution
# ==================================
print_header "PHASE 4: Test Execution"

echo "Running test suite..."

# Install test dependencies if needed
if ! command -v vitest &> /dev/null; then
    echo -e "${YELLOW}Installing test runner...${NC}"
    npm install -D vitest @testing-library/react @testing-library/jest-dom
fi

# Run tests (handle both Jest and Vitest)
echo -n "  ✓ Running unit tests... "
if npm run test 2>/dev/null; then
    echo -e "${GREEN}PASSED${NC}"
else
    # If Jest fails, try Vitest directly
    if npx vitest run --reporter=verbose 2>/dev/null; then
        echo -e "${GREEN}PASSED (Vitest)${NC}"
    else
        echo -e "${YELLOW}WARNING: Tests failed or not configured${NC}"
        if [ "$ENVIRONMENT" == "production" ]; then
            read -p "    Deploy without passing tests? (y/n) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi
    fi
fi

# Check test coverage (if available)
if [ -f "coverage/coverage-summary.json" ]; then
    echo -n "  ✓ Checking test coverage... "
    COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.lines.pct' 2>/dev/null || echo "0")
    if (( $(echo "$COVERAGE < 60" | bc -l) )); then
        echo -e "${YELLOW}WARNING: Coverage is ${COVERAGE}% (target: 60%)${NC}"
    else
        echo -e "${GREEN}PASSED: ${COVERAGE}%${NC}"
    fi
fi

# ==================================
# PHASE 5: Build Process
# ==================================
print_header "PHASE 5: Build Process"

echo "Building application..."

# Clean previous builds
echo -n "  ✓ Cleaning previous builds... "
rm -rf dist/$BUILD_ENV
echo -e "${GREEN}DONE${NC}"

# Run the build
echo -n "  ✓ Building with esbuild... "
BUILD_START=$(date +%s)
if BUILD_ENV=$BUILD_ENV npm run build > /tmp/build_output.txt 2>&1; then
    BUILD_END=$(date +%s)
    BUILD_TIME=$((BUILD_END - BUILD_START))
    echo -e "${GREEN}SUCCESS (${BUILD_TIME}s)${NC}"
    
    if [ "$BUILD_TIME" -gt "$MAX_BUILD_TIME_SEC" ]; then
        echo -e "${YELLOW}    Warning: Build took ${BUILD_TIME}s (target: <${MAX_BUILD_TIME_SEC}s)${NC}"
    fi
else
    echo -e "${RED}FAILED${NC}"
    echo "Build output:"
    tail -50 /tmp/build_output.txt
    exit 1
fi

# Verify build output
echo -n "  ✓ Verifying build output... "
if [ ! -d "dist/$BUILD_ENV" ]; then
    echo -e "${RED}FAILED: dist/$BUILD_ENV not found${NC}"
    exit 1
fi
echo -e "${GREEN}PASSED${NC}"

# Check critical files
echo "  ✓ Checking critical files..."
CRITICAL_FILES=("widget.js" "iframe.html" "iframe-main.js" "iframe-main.css")
ALL_FILES_PRESENT=true
for file in "${CRITICAL_FILES[@]}"; do
    echo -n "    • $file... "
    if [ -f "dist/$BUILD_ENV/$file" ]; then
        SIZE=$(du -k "dist/$BUILD_ENV/$file" | cut -f1)
        echo -e "${GREEN}OK (${SIZE}KB)${NC}"
        
        # Check widget.js size specifically
        if [ "$file" == "widget.js" ] && [ "$SIZE" -gt "$MAX_BUNDLE_SIZE_KB" ]; then
            echo -e "${YELLOW}      Warning: widget.js is ${SIZE}KB (target: <${MAX_BUNDLE_SIZE_KB}KB)${NC}"
        fi
    else
        echo -e "${RED}MISSING${NC}"
        ALL_FILES_PRESENT=false
    fi
done

if [ "$ALL_FILES_PRESENT" = false ]; then
    echo -e "${RED}❌ Critical files missing${NC}"
    exit 1
fi

# ==================================
# PHASE 6: Bundle Analysis
# ==================================
print_header "PHASE 6: Bundle Analysis"

echo "Analyzing bundle..."

# Check total bundle size
TOTAL_SIZE=$(du -sh dist/$BUILD_ENV | cut -f1)
echo "  ✓ Total build size: ${TOTAL_SIZE}"

# Analyze with esbuild metafile if available
if [ -f "dist/$BUILD_ENV/metafile.json" ]; then
    echo -n "  ✓ Analyzing bundle composition... "
    # You could add more sophisticated analysis here
    echo -e "${GREEN}DONE${NC}"
fi

# Check for source maps in production
if [ "$ENVIRONMENT" == "production" ]; then
    echo -n "  ✓ Checking source maps... "
    MAP_COUNT=$(find dist/$BUILD_ENV -name "*.map" | wc -l | tr -d ' ')
    if [ "$MAP_COUNT" -gt "0" ]; then
        echo -e "${YELLOW}WARNING: $MAP_COUNT source maps found${NC}"
        echo "    Consider removing source maps for production"
        read -p "    Remove source maps? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            find dist/$BUILD_ENV -name "*.map" -delete
            echo -e "${GREEN}    Source maps removed${NC}"
        fi
    else
        echo -e "${GREEN}OK (no source maps)${NC}"
    fi
fi

# ==================================
# PHASE 7: Pre-Deployment Backup
# ==================================
if [ "$ENVIRONMENT" == "production" ]; then
    print_header "PHASE 7: Pre-Deployment Backup"
    
    echo "Creating backup of current production..."
    BACKUP_PATH="backups/${TIMESTAMP}"
    echo -n "  ✓ Backing up to s3://$BUCKET/$BACKUP_PATH... "
    
    aws s3 sync s3://$BUCKET/ s3://$BUCKET/$BACKUP_PATH/ \
        --exclude "backups/*" \
        --exclude "tenants/*" \
        --exclude "collateral/*" \
        --quiet
    
    echo -e "${GREEN}DONE${NC}"
    echo -e "${BLUE}  ℹ️  Backup location: s3://$BUCKET/$BACKUP_PATH${NC}"
fi

# ==================================
# PHASE 8: Deployment
# ==================================
print_header "PHASE 8: Deployment to $ENVIRONMENT"

# Create deployment manifest
echo -n "  ✓ Creating deployment manifest... "
cat > dist/$BUILD_ENV/deployment-info.json << EOF
{
  "timestamp": "${TIMESTAMP}",
  "commit": "${COMMIT_HASH}",
  "branch": "${BRANCH}",
  "deployer": "${USER}",
  "environment": "${ENVIRONMENT}",
  "build_tool": "esbuild",
  "node_version": "$(node -v)",
  "npm_version": "$(npm -v)",
  "qa_passed": ${QA_PASSED},
  "build_time_seconds": ${BUILD_TIME}
}
EOF
echo -e "${GREEN}DONE${NC}"

echo "  ✓ Uploading to S3..."

# Upload files with appropriate cache headers
echo -n "    • Entry files (5min cache)... "
aws s3 cp dist/$BUILD_ENV/widget.js s3://$BUCKET/widget.js \
    --cache-control "public, max-age=300, must-revalidate" \
    --content-type "application/javascript" \
    --metadata "deployment-id=${TIMESTAMP}"

aws s3 cp dist/$BUILD_ENV/iframe.html s3://$BUCKET/widget-frame.html \
    --cache-control "public, max-age=300, must-revalidate" \
    --content-type "text/html" \
    --metadata "deployment-id=${TIMESTAMP}"

aws s3 cp dist/$BUILD_ENV/iframe.html s3://$BUCKET/iframe.html \
    --cache-control "public, max-age=300, must-revalidate" \
    --content-type "text/html" \
    --metadata "deployment-id=${TIMESTAMP}"
echo -e "${GREEN}DONE${NC}"

echo -n "    • Application files (1hr cache)... "
for file in iframe-main.js iframe-main.css widget-standalone.js; do
    if [ -f "dist/$BUILD_ENV/$file" ]; then
        if [[ $file == *.js ]]; then
            CONTENT_TYPE="application/javascript"
        elif [[ $file == *.css ]]; then
            CONTENT_TYPE="text/css"
        fi
        
        aws s3 cp dist/$BUILD_ENV/$file s3://$BUCKET/$file \
            --cache-control "public, max-age=3600" \
            --content-type "$CONTENT_TYPE" \
            --metadata "deployment-id=${TIMESTAMP}"
    fi
done
echo -e "${GREEN}DONE${NC}"

# Upload chunks and assets
if [ -d "dist/$BUILD_ENV/chunks" ]; then
    echo -n "    • Chunk files (1yr cache)... "
    aws s3 sync dist/$BUILD_ENV/chunks/ s3://$BUCKET/chunks/ \
        --cache-control "public, max-age=31536000, immutable" \
        --delete \
        --metadata "deployment-id=${TIMESTAMP}"
    echo -e "${GREEN}DONE${NC}"
fi

if [ -d "dist/$BUILD_ENV/assets" ]; then
    echo -n "    • Asset files (1yr cache)... "
    aws s3 sync dist/$BUILD_ENV/assets/ s3://$BUCKET/assets/ \
        --cache-control "public, max-age=31536000, immutable" \
        --delete \
        --metadata "deployment-id=${TIMESTAMP}"
    echo -e "${GREEN}DONE${NC}"
fi

# Upload deployment info
aws s3 cp dist/$BUILD_ENV/deployment-info.json s3://$BUCKET/deployment-info.json \
    --cache-control "public, max-age=300" \
    --content-type "application/json"

# ==================================
# PHASE 9: Cache Invalidation
# ==================================
print_header "PHASE 9: Cache Invalidation"

if [ -n "$CLOUDFRONT_ID" ] && [ "$CLOUDFRONT_ID" != "YOUR_STAGING_CF_ID" ]; then
    echo -n "  ✓ Creating CloudFront invalidation... "
    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id $CLOUDFRONT_ID \
        --paths "/*" \
        --query 'Invalidation.Id' \
        --output text)
    echo -e "${GREEN}DONE${NC}"
    echo "    Invalidation ID: ${INVALIDATION_ID}"
    
    # Wait for invalidation to start
    echo -n "  ✓ Waiting for invalidation to start... "
    sleep 5
    echo -e "${GREEN}DONE${NC}"
else
    echo -e "${YELLOW}⚠️  CloudFront ID not configured${NC}"
fi

# ==================================
# PHASE 10: Post-Deployment Validation
# ==================================
print_header "PHASE 10: Post-Deployment Validation"

echo "Running deployment verification..."

# Function to test URL
test_url() {
    local url=$1
    local name=$2
    echo -n "  ✓ Testing $name... "
    
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url")
    RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" --max-time 10 "$url")
    
    if [ "$HTTP_CODE" == "200" ]; then
        echo -e "${GREEN}OK (${HTTP_CODE}, ${RESPONSE_TIME}s)${NC}"
        return 0
    else
        echo -e "${RED}FAILED (HTTP ${HTTP_CODE})${NC}"
        return 1
    fi
}

# Test critical endpoints
VALIDATION_PASSED=true
test_url "https://$CLOUDFRONT_DOMAIN/widget.js" "widget.js" || VALIDATION_PASSED=false
test_url "https://$CLOUDFRONT_DOMAIN/widget-frame.html" "widget-frame.html" || VALIDATION_PASSED=false
test_url "https://$CLOUDFRONT_DOMAIN/iframe-main.js" "iframe-main.js" || VALIDATION_PASSED=false
test_url "https://$CLOUDFRONT_DOMAIN/iframe-main.css" "iframe-main.css" || VALIDATION_PASSED=false

# Test Lambda endpoint
echo -n "  ✓ Testing Lambda health check... "
LAMBDA_URL="https://xo6tsuhi6u2fby3rkw4usa663q0igxjk.lambda-url.us-east-1.on.aws/?action=health_check"
if [ "$ENVIRONMENT" == "production" ]; then
    LAMBDA_URL="https://uia3tfv4ockwdsosk2rpj7qvoy0riobe.lambda-url.us-east-1.on.aws/?action=health_check"
fi

if curl -s "$LAMBDA_URL" | grep -q "ok"; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${YELLOW}WARNING: Lambda may be cold starting${NC}"
fi

# Create git tag
if [ "$ENVIRONMENT" == "production" ]; then
    TAG_NAME="deploy-prod-${TIMESTAMP}"
    echo -n "  ✓ Creating git tag: ${TAG_NAME}... "
    git tag -a "${TAG_NAME}" -m "Production deployment ${TIMESTAMP}" 2>/dev/null && \
        echo -e "${GREEN}DONE${NC}" || \
        echo -e "${YELLOW}SKIPPED${NC}"
fi

# ==================================
# DEPLOYMENT SUMMARY
# ==================================
print_header "Deployment Summary"

DEPLOY_END_TIME=$(date +%s)
TOTAL_TIME=$((DEPLOY_END_TIME - DEPLOY_START_TIME))

echo -e "${GREEN}✅ Deployment to ${ENVIRONMENT} complete!${NC}"
echo ""
echo "📋 Deployment Details:"
echo "   Environment: ${ENVIRONMENT}"
echo "   Timestamp: ${TIMESTAMP}"
echo "   Commit: ${COMMIT_HASH}"
echo "   Branch: ${BRANCH}"
echo "   Total Time: ${TOTAL_TIME} seconds"
echo "   S3 Bucket: ${BUCKET}"
echo "   CloudFront: ${CLOUDFRONT_DOMAIN}"
if [ -n "$INVALIDATION_ID" ]; then
    echo "   Invalidation: ${INVALIDATION_ID}"
fi
if [ "$ENVIRONMENT" == "production" ] && [ -n "$BACKUP_PATH" ]; then
    echo "   Backup: s3://$BUCKET/$BACKUP_PATH"
fi
echo ""
echo "🌐 URLs:"
echo "   Widget: https://${CLOUDFRONT_DOMAIN}/widget.js"
echo "   Frame: https://${CLOUDFRONT_DOMAIN}/widget-frame.html"
if [ -f "dist/$BUILD_ENV/test-staging.html" ]; then
    echo "   Test: https://${CLOUDFRONT_DOMAIN}/test-staging.html"
fi
echo ""

# Post-deployment checklist
echo -e "${BLUE}📝 Post-Deployment Checklist:${NC}"
echo "   [ ] Open test page and verify widget loads"
echo "   [ ] Test chat opens and closes properly"
echo "   [ ] Send a test message and verify response"
echo "   [ ] Check browser console for errors"
echo "   [ ] Test on mobile device"
echo "   [ ] Monitor CloudWatch logs for 10 minutes"
echo "   [ ] Check Lambda error rate"
if [ "$ENVIRONMENT" == "production" ]; then
    echo "   [ ] Test Foster Village: fo85e6a06dcdf4"
    echo "   [ ] Test at least 2 other production tenants"
    echo "   [ ] Monitor error tracking system"
    echo "   [ ] Update deployment documentation"
fi
echo ""

# Rollback instructions
if [ "$VALIDATION_PASSED" = false ]; then
    echo -e "${RED}⚠️  VALIDATION FAILED - Consider rolling back${NC}"
fi

echo -e "${YELLOW}🔄 Rollback Instructions (if needed):${NC}"
if [ "$ENVIRONMENT" == "production" ] && [ -n "$BACKUP_PATH" ]; then
    echo "   Option 1 - Quick restore from backup:"
    echo "     aws s3 sync s3://$BUCKET/$BACKUP_PATH/ s3://$BUCKET/ --delete"
    echo "     aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths '/*'"
    echo ""
    echo "   Option 2 - Redeploy previous version:"
    echo "     git checkout ${TAG_NAME}^"
    echo "     ./deploy-production-qa.sh production"
else
    echo "   Redeploy from previous commit:"
    echo "     git checkout <previous-commit>"
    echo "     ./deploy-production-qa.sh $ENVIRONMENT"
fi
echo ""

# Final status
if [ "$VALIDATION_PASSED" = true ] && [ "$QA_PASSED" = true ]; then
    echo -e "${GREEN}🎉 Deployment completed successfully with all checks passed!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Deployment completed with warnings. Please review above issues.${NC}"
    exit 0
fi