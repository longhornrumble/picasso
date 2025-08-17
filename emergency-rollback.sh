#!/bin/bash

# EMERGENCY ROLLBACK SCRIPT
# Tech Lead Emergency Directive - Rollback security controls if issues arise
# Use only if legitimate traffic is being blocked

set -e

ENVIRONMENT=${1:-staging}
REGION=${AWS_REGION:-us-east-1}
STACK_NAME="emergency-security-${ENVIRONMENT}"

echo "🔄 EMERGENCY ROLLBACK INITIATED"
echo "Environment: $ENVIRONMENT"
echo "Stack: $STACK_NAME"
echo "Timestamp: $(date -u)"
echo "======================================"

# Validate AWS credentials
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "❌ ERROR: AWS credentials not configured"
    exit 1
fi

# Confirm rollback
echo "⚠️  WARNING: This will remove all emergency security protections"
echo "🔒 Cross-tenant vulnerability will be UNPROTECTED after rollback"
echo ""
read -p "Are you sure you want to proceed? (type 'ROLLBACK' to confirm): " confirmation

if [ "$confirmation" != "ROLLBACK" ]; then
    echo "❌ Rollback cancelled"
    exit 1
fi

echo "🚀 Proceeding with emergency rollback..."

# Check if stack exists
if ! aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" > /dev/null 2>&1; then
    echo "⚠️  Stack $STACK_NAME not found. Nothing to rollback."
    exit 0
fi

# Get stack resources before deletion for logging
echo "📋 Documenting resources before rollback..."
aws cloudformation describe-stack-resources --stack-name "$STACK_NAME" --region "$REGION" > "rollback-resources-${ENVIRONMENT}-$(date +%Y%m%d_%H%M%S).json"

# Remove emergency security stack
echo "🗑️  Deleting emergency security stack..."
aws cloudformation delete-stack --stack-name "$STACK_NAME" --region "$REGION"

# Wait for deletion to complete
echo "⏳ Waiting for stack deletion to complete..."
aws cloudformation wait stack-delete-complete --stack-name "$STACK_NAME" --region "$REGION"

echo "✅ Emergency security stack deleted successfully"

# Verify rollback
echo "🔍 Validating rollback completion..."

# Check that stack is gone
if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" > /dev/null 2>&1; then
    echo "❌ ERROR: Stack still exists after rollback attempt"
    exit 1
else
    echo "  ✅ Emergency security stack: REMOVED"
fi

# Generate rollback summary
cat > emergency-rollback-summary.json << EOF
{
  "rollback": {
    "timestamp": "$(date -u)",
    "environment": "$ENVIRONMENT",
    "stack_name": "$STACK_NAME",
    "region": "$REGION",
    "status": "COMPLETED"
  },
  "security_status": "UNPROTECTED",
  "vulnerability_status": "ACTIVE - IMMEDIATE ACTION REQUIRED",
  "critical_warning": "Cross-tenant access vulnerability is now UNPROTECTED",
  "immediate_actions": [
    "Monitor for cross-tenant access attempts",
    "Implement code-level fixes immediately", 
    "Consider alternative security measures",
    "Notify security team of rollback"
  ]
}
EOF

echo ""
echo "🔄 EMERGENCY ROLLBACK COMPLETE"
echo "======================================"
echo "Stack Name: $STACK_NAME"
echo "Security Controls: REMOVED"
echo "Network Isolation: DISABLED"
echo "Monitoring: DISABLED"
echo "Rollback Time: $(date -u)"
echo ""
echo "🚨 CRITICAL WARNING: SYSTEM IS NOW UNPROTECTED"
echo "Cross-tenant access vulnerability is ACTIVE and unmitigated."
echo ""
echo "🔴 IMMEDIATE ACTIONS REQUIRED:"
echo "1. Implement code-level fixes IMMEDIATELY"
echo "2. Monitor for any cross-tenant access attempts"
echo "3. Consider implementing alternative security measures"
echo "4. Notify security team and stakeholders of rollback"
echo ""
echo "📋 Rollback summary saved to: emergency-rollback-summary.json"
echo "📋 Pre-rollback resources saved to: rollback-resources-${ENVIRONMENT}-$(date +%Y%m%d_%H%M%S).json"
echo ""
echo "🚨 ROLLBACK COMPLETE - SECURITY PROTECTION REMOVED"