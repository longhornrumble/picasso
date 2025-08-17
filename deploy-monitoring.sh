#!/bin/bash

# DEPLOY SECURITY MONITORING DASHBOARD
# Real-time monitoring for emergency security controls

set -e

ENVIRONMENT=${1:-staging}
REGION=${AWS_REGION:-us-east-1}
STACK_NAME="security-monitoring-${ENVIRONMENT}"

echo "📊 DEPLOYING SECURITY MONITORING"
echo "Environment: $ENVIRONMENT"
echo "Stack: $STACK_NAME"
echo "Timestamp: $(date -u)"
echo "================================"

# Validate AWS credentials
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo "❌ ERROR: AWS credentials not configured"
    exit 1
fi

echo "🚀 Deploying security monitoring dashboard..."

aws cloudformation deploy \
    --template-file security-monitoring-dashboard.yaml \
    --stack-name "$STACK_NAME" \
    --parameter-overrides \
        Environment="$ENVIRONMENT" \
    --capabilities CAPABILITY_IAM \
    --region "$REGION" \
    --tags \
        Purpose=SecurityMonitoring \
        Environment="$ENVIRONMENT" \
        DeployedBy=EmergencySecurityTeam \
        DeploymentTime="$(date -u)" \
    || {
        echo "❌ Monitoring deployment failed"
        exit 1
    }

echo "✅ Security monitoring deployed successfully"

# Get dashboard URL
DASHBOARD_URL=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='DashboardURL'].OutputValue" --output text --region "$REGION")

echo ""
echo "📊 SECURITY MONITORING ACTIVE"
echo "==============================="
echo "Dashboard URL: $DASHBOARD_URL"
echo "Monitor continuously for security events"
echo ""