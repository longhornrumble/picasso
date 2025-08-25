#!/bin/bash
# Production API Gateway Cleanup - EXTRA SAFETY MEASURES
# Use this for production environment cleanup with additional safeguards
# Requires explicit confirmation steps and creates multiple backups

set -e  # Exit on any error
set -u  # Exit on undefined variables

# Configuration
API_ID="kgvc8xnewf"
REGION="us-east-1"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Production safety settings
REQUIRE_EXPLICIT_CONFIRMATION=true
CREATE_MULTIPLE_BACKUPS=true
TEST_ENDPOINTS_BEFORE_AFTER=true
ENABLE_CANARY_VALIDATION=true

echo "🏭 PRODUCTION API Gateway Cleanup"
echo "================================="
echo "⚠️  PRODUCTION ENVIRONMENT DETECTED"
echo "⚠️  Extra safety measures enabled"
echo ""

# ==============================================================================
# PRODUCTION SAFETY CHECKS
# ==============================================================================

echo "🔒 PRODUCTION SAFETY CHECKS"
echo "============================================="

# Check AWS CLI credentials and region
echo "1️⃣  Validating AWS credentials and region..."
CURRENT_REGION=$(aws configure get region 2>/dev/null || echo "not-set")
if [ "$CURRENT_REGION" != "$REGION" ]; then
  echo "   ⚠️  Warning: AWS CLI region ($CURRENT_REGION) differs from target region ($REGION)"
  read -p "   Continue anyway? (y/N): " continue_region
  if [[ $continue_region != [yY] ]]; then
    exit 1
  fi
fi

# Verify API Gateway exists and is accessible
echo "2️⃣  Verifying API Gateway access..."
API_INFO=$(aws apigatewayv2 get-api --api-id ${API_ID} --region ${REGION} --output json 2>/dev/null || echo "")
if [ -z "$API_INFO" ]; then
  echo "   ❌ ERROR: Cannot access API Gateway ${API_ID}"
  echo "   Check your AWS credentials and permissions"
  exit 1
fi

API_NAME=$(echo "$API_INFO" | jq -r '.Name // "Unknown"')
echo "   ✅ API Gateway accessible: $API_NAME"

# Test Master_Function BEFORE making any changes
echo "3️⃣  Testing Master_Function BEFORE cleanup..."
CONFIG_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com/primary/staging/Master_Function?action=get_config&t=fo85e6a06dcdf4"
CHAT_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com/primary/staging/Master_Function?action=chat&t=fo85e6a06dcdf4"

echo "   Testing config endpoint..."
PRE_CONFIG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$CONFIG_URL" || echo "000")
echo "   Config endpoint status: $PRE_CONFIG_STATUS"

echo "   Testing chat endpoint..."
PRE_CHAT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"tenant_hash":"fo85e6a06dcdf4","user_input":"test","session_id":"safety-test"}' \
  "$CHAT_URL" || echo "000")
echo "   Chat endpoint status: $PRE_CHAT_STATUS"

if [ "$PRE_CONFIG_STATUS" == "000" ] && [ "$PRE_CHAT_STATUS" == "000" ]; then
  echo "   ❌ ERROR: Master_Function is not responding at all"
  echo "   This suggests a larger infrastructure issue"
  read -p "   Continue with cleanup anyway? (y/N): " continue_broken
  if [[ $continue_broken != [yY] ]]; then
    exit 1
  fi
fi

# ==============================================================================
# MULTIPLE BACKUP CREATION
# ==============================================================================

echo ""
echo "💾 CREATING MULTIPLE BACKUPS"
echo "============================================="

# Create comprehensive backup with metadata
MAIN_BACKUP="production-backup-${TIMESTAMP}.json"
ROUTES_BACKUP="production-routes-${TIMESTAMP}.json"
INTEGRATIONS_BACKUP="production-integrations-${TIMESTAMP}.json"
STAGES_BACKUP="production-stages-${TIMESTAMP}.json"

echo "1️⃣  Creating main API backup..."
aws apigatewayv2 get-api \
  --api-id ${API_ID} \
  --region ${REGION} \
  --output json > "${MAIN_BACKUP}"

echo "2️⃣  Creating routes backup..."
aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --output json > "${ROUTES_BACKUP}"

echo "3️⃣  Creating integrations backup..."
aws apigatewayv2 get-integrations \
  --api-id ${API_ID} \
  --region ${REGION} \
  --output json > "${INTEGRATIONS_BACKUP}"

echo "4️⃣  Creating stages backup..."
aws apigatewayv2 get-stages \
  --api-id ${API_ID} \
  --region ${REGION} \
  --output json > "${STAGES_BACKUP}"

echo "✅ Backups created:"
echo "   - Main: $MAIN_BACKUP"
echo "   - Routes: $ROUTES_BACKUP"
echo "   - Integrations: $INTEGRATIONS_BACKUP"
echo "   - Stages: $STAGES_BACKUP"

# ==============================================================================
# DETAILED ANALYSIS
# ==============================================================================

echo ""
echo "🔍 DETAILED INFRASTRUCTURE ANALYSIS"
echo "============================================="

# Show current routes with details
echo "1️⃣  Current route configuration:"
aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[*].{RouteId:RouteId,RouteKey:RouteKey,Target:Target}' \
  --output table

# Identify streaming routes more precisely
echo "2️⃣  Analyzing routes for streaming patterns..."
BEDROCK_STREAMING_ROUTES=$(aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[?contains(RouteKey, `Bedrock_Streaming_Handler`)].{RouteId:RouteId,RouteKey:RouteKey}' \
  --output text)

GENERIC_STREAMING_ROUTES=$(aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[?contains(RouteKey, `streaming`) || contains(RouteKey, `stream`) || contains(RouteKey, `Streaming`)].{RouteId:RouteId,RouteKey:RouteKey}' \
  --output text)

echo "📊 Bedrock streaming routes found:"
if [ -z "$BEDROCK_STREAMING_ROUTES" ]; then
  echo "   None found"
else
  echo "$BEDROCK_STREAMING_ROUTES" | while read -r route_id route_key; do
    echo "   - $route_key ($route_id)"
  done
fi

echo "📊 Generic streaming routes found:"
if [ -z "$GENERIC_STREAMING_ROUTES" ]; then
  echo "   None found"
else
  echo "$GENERIC_STREAMING_ROUTES" | while read -r route_id route_key; do
    echo "   - $route_key ($route_id)"
  done
fi

# Identify Master_Function routes to preserve
echo "3️⃣  Master_Function routes (WILL BE PRESERVED):"
MASTER_ROUTES=$(aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[?contains(RouteKey, `Master_Function`)].{RouteId:RouteId,RouteKey:RouteKey}' \
  --output text)

if [ -z "$MASTER_ROUTES" ]; then
  echo "   ❌ ERROR: No Master_Function routes found!"
  echo "   This is unexpected - production should have Master_Function routes"
  exit 1
else
  echo "$MASTER_ROUTES" | while read -r route_id route_key; do
    echo "   - $route_key ($route_id) ✅"
  done
fi

# ==============================================================================
# PRODUCTION CONFIRMATION SEQUENCE
# ==============================================================================

echo ""
echo "⚠️  PRODUCTION CONFIRMATION SEQUENCE"
echo "============================================="

ALL_STREAMING_ROUTES=$(echo -e "$BEDROCK_STREAMING_ROUTES\n$GENERIC_STREAMING_ROUTES" | grep -v "^$" | sort -u)

if [ -z "$ALL_STREAMING_ROUTES" ]; then
  echo "ℹ️  No streaming routes found to remove"
  echo "🎉 Cleanup not needed - infrastructure is already clean"
  exit 0
fi

echo "Routes to be DELETED:"
echo "$ALL_STREAMING_ROUTES" | while read -r route_id route_key; do
  echo "   🗑️  $route_key ($route_id)"
done

echo ""
echo "Routes to be PRESERVED:"
echo "$MASTER_ROUTES" | while read -r route_id route_key; do
  echo "   🔒 $route_key ($route_id)"
done

echo ""
echo "⚠️  FINAL PRODUCTION CONFIRMATION"
echo "================================="
echo "Environment: PRODUCTION"
echo "API Gateway: $API_NAME ($API_ID)"
echo "Timestamp: $(date)"
echo "Operator: $(whoami)"
echo ""
echo "This operation will:"
echo "✅ Preserve all Master_Function routes"
echo "❌ DELETE streaming routes permanently"
echo "💾 Keep multiple backups for rollback"
echo "🧪 Test functionality before and after"
echo ""

# Require typing "DELETE STREAMING ROUTES" for production
echo "To confirm, type exactly: DELETE STREAMING ROUTES"
read -p "> " confirmation

if [ "$confirmation" != "DELETE STREAMING ROUTES" ]; then
  echo "❌ Confirmation text incorrect. Cleanup cancelled for safety."
  exit 1
fi

echo ""
echo "⚠️  Last chance to cancel!"
sleep 3
read -p "Press ENTER to proceed or Ctrl+C to cancel..."

# ==============================================================================
# PRODUCTION CLEANUP EXECUTION
# ==============================================================================

echo ""
echo "🚀 EXECUTING PRODUCTION CLEANUP"
echo "============================================="

CLEANUP_LOG="production-cleanup-${TIMESTAMP}.log"
exec > >(tee -a "$CLEANUP_LOG") 2>&1

echo "$(date): Starting production API Gateway cleanup"
echo "Operator: $(whoami)"
echo "API Gateway: $API_NAME ($API_ID)"

# Remove streaming routes one by one with validation
echo "1️⃣  Removing streaming routes with individual validation..."
echo "$ALL_STREAMING_ROUTES" | while read -r route_id route_key; do
  if [ ! -z "$route_id" ] && [ ! -z "$route_key" ]; then
    echo "   $(date): Deleting $route_key ($route_id)"
    
    # Delete the route
    aws apigatewayv2 delete-route \
      --api-id ${API_ID} \
      --route-id $route_id \
      --region ${REGION}
    
    echo "   $(date): ✅ Deleted $route_key"
    
    # Immediate validation that Master_Function still works
    echo "   $(date): Testing Master_Function after deleting $route_key..."
    POST_DELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$CONFIG_URL" || echo "000")
    
    if [ "$POST_DELETE_STATUS" != "000" ] && [ "$POST_DELETE_STATUS" != "403" ]; then
      echo "   $(date): ✅ Master_Function still responding ($POST_DELETE_STATUS)"
    else
      echo "   $(date): ❌ Master_Function not responding after deleting $route_key"
      echo "   $(date): This may indicate a problem - check Lambda logs"
    fi
    
    # Small delay to avoid rate limiting
    sleep 2
  fi
done

# Clean up orphaned integrations
echo "2️⃣  Cleaning up orphaned integrations..."
ORPHANED_INTEGRATIONS=$(aws apigatewayv2 get-integrations \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[?contains(IntegrationUri, `Bedrock_Streaming`) || contains(IntegrationUri, `streaming`) || contains(IntegrationUri, `Streaming`)].IntegrationId' \
  --output text)

if [ ! -z "$ORPHANED_INTEGRATIONS" ]; then
  for integration_id in $ORPHANED_INTEGRATIONS; do
    echo "   $(date): Removing integration $integration_id"
    aws apigatewayv2 delete-integration \
      --api-id ${API_ID} \
      --integration-id $integration_id \
      --region ${REGION}
    echo "   $(date): ✅ Integration $integration_id removed"
  done
else
  echo "   $(date): No orphaned integrations found"
fi

# ==============================================================================
# COMPREHENSIVE POST-CLEANUP VALIDATION
# ==============================================================================

echo ""
echo "✅ COMPREHENSIVE VALIDATION"
echo "============================================="

# Test all Master_Function endpoints
echo "1️⃣  Testing all Master_Function endpoints..."

# Config endpoint
POST_CONFIG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$CONFIG_URL" || echo "000")
echo "   Config endpoint: $PRE_CONFIG_STATUS → $POST_CONFIG_STATUS"

# Chat endpoint
POST_CHAT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"tenant_hash":"fo85e6a06dcdf4","user_input":"post-cleanup test","session_id":"cleanup-validation"}' \
  "$CHAT_URL" || echo "000")
echo "   Chat endpoint: $PRE_CHAT_STATUS → $POST_CHAT_STATUS"

# Health check if available
HEALTH_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com/primary/staging/Master_Function?action=health_check&t=fo85e6a06dcdf4"
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")
echo "   Health check: $HEALTH_STATUS"

# Validate route structure
echo "2️⃣  Final route validation..."
FINAL_ROUTES=$(aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[*].RouteKey' \
  --output text)

FINAL_MASTER_COUNT=$(echo "$FINAL_ROUTES" | grep -c "Master_Function" || echo "0")
FINAL_STREAMING_COUNT=$(echo "$FINAL_ROUTES" | grep -c -i "stream" || echo "0")

echo "   Master_Function routes remaining: $FINAL_MASTER_COUNT"
echo "   Streaming routes remaining: $FINAL_STREAMING_COUNT"

if [ "$FINAL_MASTER_COUNT" -gt 0 ] && [ "$FINAL_STREAMING_COUNT" -eq 0 ]; then
  echo "   ✅ Route structure looks correct"
else
  echo "   ⚠️  Route structure may need attention"
fi

# Final route display
echo "3️⃣  Final API Gateway configuration:"
aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[*].{RouteId:RouteId,RouteKey:RouteKey,Target:Target}' \
  --output table

# ==============================================================================
# CLEANUP SUMMARY
# ==============================================================================

echo ""
echo "🎉 PRODUCTION CLEANUP COMPLETED"
echo "============================================="

# Create comprehensive summary
SUMMARY_FILE="production-cleanup-summary-${TIMESTAMP}.txt"
cat > ${SUMMARY_FILE} << EOF
PRODUCTION API Gateway Cleanup Summary
======================================
Date: $(date)
Operator: $(whoami)
API Gateway: $API_NAME ($API_ID)
Region: $REGION

Pre-Cleanup Status:
- Config Endpoint: HTTP $PRE_CONFIG_STATUS
- Chat Endpoint: HTTP $PRE_CHAT_STATUS

Post-Cleanup Status:
- Config Endpoint: HTTP $POST_CONFIG_STATUS
- Chat Endpoint: HTTP $POST_CHAT_STATUS
- Health Check: HTTP $HEALTH_STATUS

Route Analysis:
- Master_Function routes remaining: $FINAL_MASTER_COUNT
- Streaming routes remaining: $FINAL_STREAMING_COUNT

Backup Files Created:
- Main API: $MAIN_BACKUP
- Routes: $ROUTES_BACKUP  
- Integrations: $INTEGRATIONS_BACKUP
- Stages: $STAGES_BACKUP

Log File: $CLEANUP_LOG

NEXT STEPS:
1. Monitor Master_Function performance for 24 hours
2. Update environment.js to remove streaming endpoint references
3. Deploy updated frontend configuration
4. Archive backup files securely
5. Update documentation with new infrastructure state

ROLLBACK INSTRUCTIONS:
If issues arise, use: ./api-gateway-rollback-procedure.sh
Select backup file: $ROUTES_BACKUP
EOF

echo "📄 Detailed summary saved to: $SUMMARY_FILE"
echo "📄 Full log available in: $CLEANUP_LOG"
echo ""
echo "🚨 IMPORTANT POST-CLEANUP ACTIONS:"
echo "1. Monitor application for 24 hours"
echo "2. Update environment.js configuration"
echo "3. Deploy updated frontend"
echo "4. Archive backup files securely"
echo ""
echo "If issues arise, run: ./api-gateway-rollback-procedure.sh"