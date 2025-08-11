#!/bin/bash
# API Gateway Rollback Procedure
# Restores API Gateway routes from backup if something goes wrong
# Use this if Master_Function stops working after cleanup

set -e  # Exit on any error
set -u  # Exit on undefined variables

# Configuration
API_ID="kgvc8xnewf"
REGION="us-east-1"

echo "🚨 API Gateway Emergency Rollback Procedure"
echo "============================================="

# Check for backup files
echo "1️⃣  Searching for backup files..."
BACKUP_FILES=$(ls -t api-gateway-backup-*.json 2>/dev/null | head -5 || true)

if [ -z "$BACKUP_FILES" ]; then
  echo "❌ ERROR: No backup files found!"
  echo "   Expected files: api-gateway-backup-YYYYMMDD_HHMMSS.json"
  echo "   Current directory: $(pwd)"
  echo "   Available files:"
  ls -la *.json 2>/dev/null || echo "   No JSON files found"
  exit 1
fi

echo "📁 Available backup files (newest first):"
for file in $BACKUP_FILES; do
  echo "   - $file ($(stat -c %y "$file" 2>/dev/null || stat -f "%Sm" "$file"))"
done

# Select backup file
LATEST_BACKUP=$(echo "$BACKUP_FILES" | head -1)
echo ""
read -p "🤔 Use latest backup: $LATEST_BACKUP? (y/N): " use_latest

if [[ $use_latest == [yY] || $use_latest == [yY][eE][sS] ]]; then
  BACKUP_FILE="$LATEST_BACKUP"
else
  echo "Available backups:"
  select backup in $BACKUP_FILES "Cancel"; do
    case $backup in
      "Cancel")
        echo "❌ Rollback cancelled"
        exit 1
        ;;
      *)
        if [ -f "$backup" ]; then
          BACKUP_FILE="$backup"
          break
        else
          echo "Invalid selection"
        fi
        ;;
    esac
  done
fi

echo "📋 Using backup file: $BACKUP_FILE"

# Validate backup file
echo ""
echo "2️⃣  Validating backup file..."
if ! jq empty "$BACKUP_FILE" 2>/dev/null; then
  echo "❌ ERROR: Backup file is not valid JSON"
  exit 1
fi

ROUTE_COUNT=$(jq '.Items | length' "$BACKUP_FILE")
echo "   ✅ Backup contains $ROUTE_COUNT routes"

# Show current state vs backup
echo ""
echo "3️⃣  Comparing current state to backup..."

echo "📊 Current routes:"
CURRENT_ROUTES=$(aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[*].RouteKey' \
  --output text)
echo "   $CURRENT_ROUTES"

echo "📊 Backup routes:"
BACKUP_ROUTES=$(jq -r '.Items[].RouteKey' "$BACKUP_FILE" | tr '\n' ' ')
echo "   $BACKUP_ROUTES"

echo ""
echo "⚠️  WARNING: This will restore ALL routes from backup"
echo "⚠️  This may overwrite recent changes not in the backup"
echo "⚠️  Current routes will be deleted and replaced"
echo ""
read -p "🚨 Are you sure you want to proceed? (yes/NO): " confirm

if [[ $confirm != "yes" ]]; then
  echo "❌ Rollback cancelled for safety"
  exit 1
fi

# ==============================================================================
# ROLLBACK EXECUTION
# ==============================================================================

echo ""
echo "🔄 EXECUTING ROLLBACK"
echo "============================================="

# Step 1: Get all current routes to delete
echo "1️⃣  Getting current routes to delete..."
CURRENT_ROUTE_IDS=$(aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[].RouteId' \
  --output text)

# Step 2: Delete current routes
if [ ! -z "$CURRENT_ROUTE_IDS" ]; then
  echo "2️⃣  Deleting current routes..."
  for route_id in $CURRENT_ROUTE_IDS; do
    echo "   Deleting route: $route_id"
    aws apigatewayv2 delete-route \
      --api-id ${API_ID} \
      --route-id $route_id \
      --region ${REGION} || echo "   ⚠️ Failed to delete route $route_id (may already be deleted)"
  done
else
  echo "2️⃣  No current routes to delete"
fi

# Step 3: Get integrations from backup and recreate them
echo "3️⃣  Recreating integrations from backup..."

# First, we need to get the integration info from the backup routes
# This is complex because we need to match routes to their integrations
jq -r '.Items[] | select(.Target != null) | .Target' "$BACKUP_FILE" | sort -u | while read -r target; do
  if [ ! -z "$target" ]; then
    echo "   Checking integration target: $target"
    
    # Extract integration ID from target (format: integrations/integration_id)
    INTEGRATION_ID=$(echo "$target" | sed 's/integrations\///')
    
    # Check if this integration exists
    EXISTING_INTEGRATION=$(aws apigatewayv2 get-integration \
      --api-id ${API_ID} \
      --integration-id $INTEGRATION_ID \
      --region ${REGION} 2>/dev/null || echo "")
    
    if [ -z "$EXISTING_INTEGRATION" ]; then
      echo "   ⚠️ Integration $INTEGRATION_ID not found - you may need to recreate it manually"
    else
      echo "   ✅ Integration $INTEGRATION_ID exists"
    fi
  fi
done

# Step 4: Recreate routes from backup
echo "4️⃣  Recreating routes from backup..."
jq -c '.Items[]' "$BACKUP_FILE" | while read -r route; do
  ROUTE_KEY=$(echo "$route" | jq -r '.RouteKey')
  TARGET=$(echo "$route" | jq -r '.Target // empty')
  
  echo "   Creating route: $ROUTE_KEY"
  
  if [ ! -z "$TARGET" ] && [ "$TARGET" != "null" ]; then
    # Route with integration
    aws apigatewayv2 create-route \
      --api-id ${API_ID} \
      --route-key "$ROUTE_KEY" \
      --target "$TARGET" \
      --region ${REGION} >/dev/null
    echo "   ✅ Route created with target: $TARGET"
  else
    # Route without integration (if any)
    aws apigatewayv2 create-route \
      --api-id ${API_ID} \
      --route-key "$ROUTE_KEY" \
      --region ${REGION} >/dev/null
    echo "   ✅ Route created (no target)"
  fi
done

# ==============================================================================
# VALIDATION
# ==============================================================================

echo ""
echo "✅ ROLLBACK VALIDATION"
echo "============================================="

# Check route count
echo "1️⃣  Validating route restoration..."
RESTORED_COUNT=$(aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items | length' \
  --output text)

echo "   📊 Original route count: $ROUTE_COUNT"
echo "   📊 Restored route count: $RESTORED_COUNT"

if [ "$RESTORED_COUNT" -eq "$ROUTE_COUNT" ]; then
  echo "   ✅ Route count matches!"
else
  echo "   ⚠️ Route count mismatch - some routes may need manual attention"
fi

# Test Master_Function
echo "2️⃣  Testing Master_Function after rollback..."
CONFIG_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com/primary/staging/Master_Function?action=get_config&t=fo85e6a06dcdf4"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$CONFIG_URL" || echo "000")

if [ "$HTTP_STATUS" == "200" ] || [ "$HTTP_STATUS" == "400" ] || [ "$HTTP_STATUS" == "422" ]; then
  echo "   ✅ Master_Function responding (HTTP $HTTP_STATUS)"
else
  echo "   ❌ Master_Function not responding properly (HTTP $HTTP_STATUS)"
  echo "   🔧 You may need to check Lambda function permissions"
fi

# Show final state
echo "3️⃣  Final API Gateway state:"
aws apigatewayv2 get-routes \
  --api-id ${API_ID} \
  --region ${REGION} \
  --query 'Items[*].{RouteKey:RouteKey,Target:Target}' \
  --output table

echo ""
echo "🎉 Rollback completed!"
echo "📋 Backup used: $BACKUP_FILE"
echo "🔍 Please test your application thoroughly"

# Create rollback log
ROLLBACK_LOG="rollback-log-$(date +%Y%m%d_%H%M%S).txt"
cat > ${ROLLBACK_LOG} << EOF
API Gateway Rollback Log
========================
Timestamp: $(date)
API ID: ${API_ID}
Region: ${REGION}
Backup File Used: ${BACKUP_FILE}

Rollback Results:
- Original route count: ${ROUTE_COUNT}
- Restored route count: ${RESTORED_COUNT}
- Master_Function test: HTTP ${HTTP_STATUS}

Actions Taken:
- Deleted all current routes
- Restored routes from backup: ${BACKUP_FILE}
- Validated Master_Function connectivity

Post-Rollback Actions Needed:
1. Test full application functionality
2. Check Lambda function logs for any errors
3. Verify all expected endpoints are responding
4. Monitor for any integration issues
EOF

echo "📄 Rollback log saved to: ${ROLLBACK_LOG}"