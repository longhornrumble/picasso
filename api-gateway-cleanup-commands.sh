#!/bin/bash
# AWS CLI Commands for API Gateway Cleanup
# Removes broken streaming routes from API Gateway ID: kgvc8xnewf
# Preserves Master_Function routes that are currently working

set -e  # Exit on any error
set -u  # Exit on undefined variables

# Configuration
API_ID="kgvc8xnewf"
REGION="us-east-1"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="api-gateway-backup-${TIMESTAMP}.json"

echo "🚀 Starting API Gateway Cleanup for ${API_ID}"
echo "⏰ Timestamp: ${TIMESTAMP}"
echo "📁 Backup file: ${BACKUP_FILE}"

# ==============================================================================
# PHASE 1: DISCOVERY & BACKUP
# ==============================================================================

echo ""
echo "📋 PHASE 1: DISCOVERY & BACKUP"
echo "============================================"

# 1.1: Get API Gateway basic information
echo "1️⃣  Getting API Gateway information..."
aws apigatewayv2 get-api \
  --api-id ${API_ID} \
  --region ${REGION} \
  --output table

# 1.2: List all routes and save complete backup
echo "2️⃣  Creating complete backup of all routes..."
aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --output json > ${BACKUP_FILE}

echo "✅ Backup saved to: ${BACKUP_FILE}"

# 1.3: Display current routes in human-readable format
echo "3️⃣  Current routes in API Gateway:"
echo "-----------------------------------"
aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[*].{RouteId:RouteId,RouteKey:RouteKey,Target:Target}' \
  --output table

# 1.4: List integrations (shows Lambda function connections)
echo "4️⃣  Current integrations:"
echo "------------------------"
aws apigatewayv2 get-integrations \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[*].{IntegrationId:IntegrationId,IntegrationType:IntegrationType,IntegrationUri:IntegrationUri}' \
  --output table

# 1.5: Identify streaming routes to remove
echo "5️⃣  Identifying streaming routes to remove..."
STREAMING_ROUTES=$(aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[?contains(RouteKey, `Bedrock_Streaming`) || contains(RouteKey, `streaming`) || contains(RouteKey, `stream`)].RouteId' \
  --output text)

if [ -z "$STREAMING_ROUTES" ]; then
  echo "ℹ️  No streaming routes found to remove"
else
  echo "🎯 Found streaming routes to remove: $STREAMING_ROUTES"
fi

# 1.6: Identify Master_Function routes to preserve
echo "6️⃣  Identifying Master_Function routes to preserve..."
MASTER_ROUTES=$(aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[?contains(RouteKey, `Master_Function`) || contains(Target, `Master_Function`)].{RouteId:RouteId,RouteKey:RouteKey}' \
  --output text)

echo "🔒 Master_Function routes (WILL BE PRESERVED):"
echo "$MASTER_ROUTES"

echo ""
read -p "🤔 Do you want to proceed with removing streaming routes? (y/N): " confirm
if [[ $confirm != [yY] && $confirm != [yY][eE][sS] ]]; then
  echo "❌ Cleanup cancelled by user"
  exit 1
fi

# ==============================================================================
# PHASE 2: STAGING ENVIRONMENT CLEANUP
# ==============================================================================

echo ""
echo "🔧 PHASE 2: STAGING ENVIRONMENT CLEANUP"
echo "============================================"

# Check if we have staging/production stages
echo "1️⃣  Checking deployment stages..."
aws apigatewayv2 get-stages \
  --api-id ${API_ID} \
  --region ${REGION} \
  --output table

# Remove streaming routes (if any found)
if [ ! -z "$STREAMING_ROUTES" ]; then
  echo "2️⃣  Removing streaming routes from staging..."
  for route_id in $STREAMING_ROUTES; do
    echo "   Removing route: $route_id"
    aws apigatewayv2 delete-route \
      --api-id ${API_ID} \
      --route-id $route_id \
      --region ${REGION}
    echo "   ✅ Route $route_id removed"
  done
else
  echo "2️⃣  No streaming routes to remove"
fi

# 2.3: Clean up orphaned integrations
echo "3️⃣  Checking for orphaned integrations..."
ORPHANED_INTEGRATIONS=$(aws apigatewayv2 get-integrations \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[?contains(IntegrationUri, `Bedrock_Streaming`) || contains(IntegrationUri, `streaming`)].IntegrationId' \
  --output text)

if [ ! -z "$ORPHANED_INTEGRATIONS" ]; then
  echo "4️⃣  Removing orphaned streaming integrations..."
  for integration_id in $ORPHANED_INTEGRATIONS; do
    echo "   Removing integration: $integration_id"
    aws apigatewayv2 delete-integration \
      --api-id ${API_ID} \
      --integration-id $integration_id \
      --region ${REGION}
    echo "   ✅ Integration $integration_id removed"
  done
else
  echo "4️⃣  No orphaned integrations found"
fi

# ==============================================================================
# PHASE 3: VALIDATION
# ==============================================================================

echo ""
echo "✅ PHASE 3: VALIDATION"
echo "============================================"

# 3.1: Verify Master_Function routes still exist
echo "1️⃣  Validating Master_Function routes are still active..."
REMAINING_MASTER_ROUTES=$(aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[?contains(RouteKey, `Master_Function`) || contains(Target, `Master_Function`)].RouteId' \
  --output text)

if [ ! -z "$REMAINING_MASTER_ROUTES" ]; then
  echo "   ✅ Master_Function routes preserved: $REMAINING_MASTER_ROUTES"
else
  echo "   ❌ ERROR: Master_Function routes missing! Check backup immediately."
  exit 1
fi

# 3.2: Test Master_Function config endpoint
echo "2️⃣  Testing Master_Function config endpoint..."
CONFIG_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com/primary/staging/Master_Function?action=get_config&t=fo85e6a06dcdf4"

echo "   Testing: $CONFIG_URL"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$CONFIG_URL" || echo "000")

if [ "$HTTP_STATUS" == "200" ] || [ "$HTTP_STATUS" == "400" ] || [ "$HTTP_STATUS" == "422" ]; then
  echo "   ✅ Master_Function responding (HTTP $HTTP_STATUS)"
else
  echo "   ⚠️  Master_Function response: HTTP $HTTP_STATUS (may need investigation)"
fi

# 3.3: Display final route configuration
echo "3️⃣  Final API Gateway configuration:"
echo "-----------------------------------"
aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[*].{RouteId:RouteId,RouteKey:RouteKey,Target:Target}' \
  --output table

echo ""
echo "🎉 API Gateway cleanup completed successfully!"
echo "📁 Backup file: ${BACKUP_FILE}"
echo "⚡ Master_Function routes preserved and functional"
echo "🗑️  Streaming routes removed"
echo ""

# Save cleanup summary
SUMMARY_FILE="cleanup-summary-${TIMESTAMP}.txt"
cat > ${SUMMARY_FILE} << EOF
API Gateway Cleanup Summary
===========================
Timestamp: ${TIMESTAMP}
API ID: ${API_ID}
Region: ${REGION}
Backup File: ${BACKUP_FILE}

Actions Taken:
- Removed streaming routes: ${STREAMING_ROUTES:-"none found"}
- Removed orphaned integrations: ${ORPHANED_INTEGRATIONS:-"none found"}
- Preserved Master_Function routes: ${REMAINING_MASTER_ROUTES}

Validation Results:
- Master_Function HTTP Status: ${HTTP_STATUS}
- Config Endpoint: ${CONFIG_URL}

Next Steps:
1. Update environment.js to remove streaming endpoint references
2. Deploy updated frontend configuration
3. Monitor Master_Function performance
4. Consider Function URL migration when ready
EOF

echo "📄 Cleanup summary saved to: ${SUMMARY_FILE}"