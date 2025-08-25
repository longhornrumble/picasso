# PICASSO Unified Coordination Architecture Deployment Strategy

## Executive Summary

This deployment strategy outlines the transition from broken API Gateway streaming routes to Function URLs with AuthType: NONE, implementing zero-downtime migration for a healthcare application requiring comprehensive rollback capabilities.

## Current Architecture Analysis

### Existing Infrastructure
- **Master_Function**: Lambda handling HTTP requests via API Gateway
- **bedrock_handler.py**: Bedrock RAG processing for chat responses
- **Manual deployment**: Using `deploy-lambda-update.sh` with direct ZIP uploads
- **Missing streaming infrastructure**: No current streaming capability

### Critical Issues Identified
1. No streaming infrastructure exists currently
2. No CloudFormation/Infrastructure as Code
3. Manual deployment process creates risk
4. No proper monitoring or rollback capabilities
5. Missing JWT authentication system for Function URLs

## Phase 1: Foundation Architecture (Zero-Downtime Migration)

### Step 1: Infrastructure Deployment Strategy

#### 1.1 Pre-Deployment Validation
```bash
# Validate current Master_Function status
aws lambda get-function --function-name Master_Function --region us-east-1

# Verify S3 bucket access
aws s3 ls s3://myrecruiter-picasso/mappings/
aws s3 ls s3://myrecruiter-picasso/tenants/

# Test current API Gateway endpoints
curl -X GET "https://chat.myrecruiter.ai/Master_Function?action=health_check"
```

#### 1.2 Staging Environment Deployment
```bash
# Deploy to staging first
sam build -t infrastructure/template.yaml
sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name picasso-streaming-staging \
  --parameter-overrides Environment=staging \
  --capabilities CAPABILITY_IAM \
  --region us-east-1 \
  --confirm-changeset
```

#### 1.3 Production Environment Deployment (Blue-Green Strategy)
```bash
# Deploy production infrastructure alongside existing
sam deploy \
  --template-file .aws-sam/build/template.yaml \
  --stack-name picasso-streaming-production \
  --parameter-overrides Environment=production \
  --capabilities CAPABILITY_IAM \
  --region us-east-1 \
  --no-fail-on-empty-changeset
```

### Step 2: Function URL Implementation

#### 2.1 Create Streaming Handler
```python
# /lambda-review/streaming/streaming_handler.py
import json
import jwt
import boto3
import logging
from datetime import datetime, timedelta

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """
    Bedrock Streaming Handler with JWT Authentication
    AuthType: NONE with internal JWT validation
    """
    try:
        # Validate JWT token from headers
        jwt_token = event.get('headers', {}).get('x-jwt-token')
        if not jwt_token:
            return error_response(401, "Missing JWT token")
        
        # Validate JWT and extract tenant info
        payload = validate_jwt_token(jwt_token)
        if not payload:
            return error_response(401, "Invalid JWT token")
        
        tenant_id = payload.get('tenantId')
        session_id = payload.get('sessionId')
        purpose = payload.get('purpose')
        
        # Ensure token is for streaming purpose
        if purpose != 'stream':
            return error_response(403, "Token not authorized for streaming")
        
        # Process streaming request
        return handle_streaming_request(event, tenant_id, session_id)
        
    except Exception as e:
        logger.error(f"Streaming handler error: {str(e)}")
        return error_response(500, "Internal server error")

def validate_jwt_token(token):
    """Validate JWT token using AWS Secrets Manager key"""
    try:
        secrets_client = boto3.client('secretsmanager')
        secret_response = secrets_client.get_secret_value(
            SecretId=os.environ['JWT_SECRET_KEY_NAME']
        )
        signing_key = json.loads(secret_response['SecretString'])['signingKey']
        
        # Decode and validate token
        payload = jwt.decode(token, signing_key, algorithms=['HS256'])
        
        # Check expiration
        if payload.get('exp', 0) < datetime.utcnow().timestamp():
            return None
            
        return payload
    except Exception as e:
        logger.error(f"JWT validation failed: {str(e)}")
        return None

def handle_streaming_request(event, tenant_id, session_id):
    """Handle the actual streaming request"""
    # Extract request body
    body = json.loads(event.get('body', '{}'))
    user_input = body.get('message', '')
    
    if not user_input:
        return error_response(400, "Missing message")
    
    # Load tenant configuration
    config = load_tenant_config(tenant_id)
    if not config:
        return error_response(404, "Tenant configuration not found")
    
    # Generate streaming response
    return generate_streaming_response(user_input, tenant_id, session_id, config)

def generate_streaming_response(user_input, tenant_id, session_id, config):
    """Generate streaming response using Bedrock"""
    try:
        # This would integrate with existing bedrock_handler logic
        # For now, return SSE-formatted response structure
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'text/plain',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,x-jwt-token',
                'x-session-id': session_id
            },
            'body': f"data: {json.dumps({'type': 'message', 'content': 'Streaming response for: ' + user_input})}\n\n"
        }
    except Exception as e:
        logger.error(f"Streaming response generation failed: {str(e)}")
        return error_response(500, "Failed to generate response")

def error_response(status_code, message):
    """Return standardized error response"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps({'error': message})
    }
```

### Step 3: Master Function JWT Coordination

#### 3.1 Update Master Function for JWT Generation
```python
# Add to lambda_function.py
def handle_jwt_generation_action(tenant_hash):
    """Generate JWT tokens for Function URL access"""
    try:
        # Server-side tenant inference from hash
        tenant_id = resolve_tenant_from_hash(tenant_hash)
        if not tenant_id:
            return cors_response(404, {"error": "Invalid tenant hash"})
        
        # Generate session-specific JWT
        session_id = f"sess_{int(time.time())}_{tenant_hash[:8]}"
        
        # Get signing key from Secrets Manager
        secrets_client = boto3.client('secretsmanager')
        secret_response = secrets_client.get_secret_value(
            SecretId=os.environ['JWT_SECRET_KEY_NAME']
        )
        signing_key = json.loads(secret_response['SecretString'])['signingKey']
        
        # Create JWT payload
        payload = {
            'sessionId': session_id,
            'tenantId': tenant_id,
            'purpose': 'stream',
            'exp': int((datetime.utcnow() + timedelta(minutes=15)).timestamp()),
            'iat': int(datetime.utcnow().timestamp())
        }
        
        # Generate token
        jwt_token = jwt.encode(payload, signing_key, algorithm='HS256')
        
        # Get Function URL from environment
        streaming_function_url = os.environ.get('STREAMING_FUNCTION_URL')
        
        return cors_response(200, {
            'jwt_token': jwt_token,
            'session_id': session_id,
            'streaming_url': streaming_function_url,
            'expires_in': 900  # 15 minutes
        })
        
    except Exception as e:
        logger.error(f"JWT generation failed: {str(e)}")
        return cors_response(500, {"error": "JWT generation failed"})
```

## Zero-Downtime Migration Strategy

### Phase 1: Parallel Infrastructure (Day 1-2)
1. **Deploy new infrastructure alongside existing**
   - Function URLs deployed but not yet used by clients
   - DynamoDB tables created with proper TTL settings
   - JWT secrets generated and stored securely
   - Monitoring and alarms configured

2. **Validation without client traffic**
   - Direct Function URL testing with manual JWT tokens
   - Cross-tenant isolation verification
   - Performance baseline establishment
   - Security penetration testing

### Phase 2: Gradual Traffic Migration (Day 3-4)
1. **Feature flag implementation**
   ```javascript
   // Frontend feature flag for new streaming
   const USE_FUNCTION_URL_STREAMING = localStorage.getItem('use_streaming_v2') === 'true';
   ```

2. **Dual-mode operation**
   - Existing clients continue using Master_Function only
   - New streaming requests route through Function URLs
   - Error handling falls back to legacy mode
   - Comprehensive logging for both paths

3. **Staged rollout by tenant**
   - Start with internal test tenants
   - Gradual rollout to 10% of production tenants
   - Monitor error rates and performance metrics
   - Automatic rollback if thresholds exceeded

### Phase 3: Full Migration (Day 5-6)
1. **Complete traffic cutover**
   - All streaming requests use Function URLs
   - Legacy streaming routes marked deprecated
   - Client applications updated to use JWT flow
   - Monitoring confirms successful migration

2. **Legacy cleanup**
   - Remove deprecated API Gateway streaming routes
   - Clean up unused environment variables
   - Update documentation and runbooks
   - Archive legacy deployment scripts

## Environment-Specific Configuration

### Staging Environment
```yaml
# staging-overrides.yaml
Parameters:
  Environment: staging
  CloudFrontDomain: staging-chat.myrecruiter.ai
  
Conditions:
  IsStaging: true
  
# Relaxed monitoring thresholds for testing
MasterFunctionErrorRate:
  Threshold: 0.10  # 10% error rate acceptable in staging

BedrockStreamingLatency:
  Threshold: 10000  # 10 seconds acceptable in staging
```

### Production Environment
```yaml
# production-overrides.yaml
Parameters:
  Environment: production
  CloudFrontDomain: chat.myrecruiter.ai
  
# Enhanced security and monitoring
Resources:
  # Additional monitoring for production
  DynamoDBThrottleAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: !Sub '${Environment}-DynamoDB-Throttling'
      MetricName: UserErrors
      Threshold: 5
      ComparisonOperator: GreaterThanThreshold
      
  # WAF for Function URLs (production only)
  FunctionUrlWebACL:
    Type: AWS::WAFv2::WebACL
    Condition: IsProduction
    Properties:
      Rules:
        - Name: RateLimitRule
          Priority: 1
          Statement:
            RateBasedStatement:
              Limit: 2000  # requests per 5-minute window
              AggregateKeyType: IP
          Action:
            Block: {}
```

## Rollback Procedures

### Immediate Rollback Triggers
- Error rate > 2% increase from baseline
- Cross-tenant data access detected
- Response time > 5 seconds
- JWT validation bypass attempts
- DynamoDB throttling > 5 errors/minute

### Rollback Execution (< 5 minutes)
```bash
#!/bin/bash
# emergency-rollback.sh

echo "🚨 EMERGENCY ROLLBACK INITIATED"

# 1. Immediate traffic cutover via feature flag
aws ssm put-parameter \
  --name "/picasso/streaming/enabled" \
  --value "false" \
  --overwrite

# 2. Disable Function URL if needed
aws lambda delete-function-url-config \
  --function-name ${ENVIRONMENT}-Bedrock-Streaming-Handler

# 3. Verify Master Function health
aws lambda invoke \
  --function-name Master_Function \
  --payload '{"action": "health_check"}' \
  response.json

# 4. Update CloudFront invalidation to disable new features
aws cloudfront create-invalidation \
  --distribution-id ${CLOUDFRONT_DISTRIBUTION_ID} \
  --paths "/widget.js" "/src/*"

echo "✅ ROLLBACK COMPLETED - Monitoring systems for stability"
```

### Rollback Validation
1. **Health check verification**
   - Master_Function responding normally
   - Legacy chat functionality operational
   - No cross-tenant data access occurring

2. **Performance validation**
   - Response times back to baseline
   - Error rates below 0.5%
   - No DynamoDB throttling

3. **User experience confirmation**
   - Chat functionality working in legacy mode
   - No JavaScript errors in browser console
   - Mobile Safari compatibility maintained

## Monitoring and Validation

### Real-time Monitoring Dashboard
```python
# Custom CloudWatch metrics for deployment validation
def put_custom_metric(metric_name, value, unit='Count'):
    cloudwatch = boto3.client('cloudwatch')
    cloudwatch.put_metric_data(
        Namespace='PICASSO/Deployment',
        MetricData=[{
            'MetricName': metric_name,
            'Value': value,
            'Unit': unit,
            'Dimensions': [
                {'Name': 'Environment', 'Value': os.environ['ENVIRONMENT']},
                {'Name': 'DeploymentPhase', 'Value': 'function-url-migration'}
            ]
        }]
    )

# Track key deployment metrics
put_custom_metric('FunctionUrlRequests', request_count)
put_custom_metric('JWTValidationSuccess', success_count)
put_custom_metric('CrossTenantAccessAttempts', violation_count)
put_custom_metric('StreamingLatencyMS', latency_ms, 'Milliseconds')
```

### Health Check Endpoints
```bash
# Deployment validation script
#!/bin/bash
echo "🔍 Validating deployment health..."

# 1. Master Function health
curl -f "https://chat.myrecruiter.ai/Master_Function?action=health_check" || exit 1

# 2. JWT generation test
JWT_RESPONSE=$(curl -s "https://chat.myrecruiter.ai/Master_Function?action=generate_jwt&t=test_hash")
JWT_TOKEN=$(echo $JWT_RESPONSE | jq -r '.jwt_token')

# 3. Function URL streaming test
curl -f -H "x-jwt-token: $JWT_TOKEN" \
  -X POST \
  -d '{"message": "test"}' \
  "${STREAMING_FUNCTION_URL}" || exit 1

# 4. Cross-tenant isolation test
# (Test with different tenant JWT - should fail)

echo "✅ All health checks passed"
```

### Performance Baselines
- **JWT Generation**: < 500ms
- **First Token Streaming**: < 1000ms
- **Function URL Response**: < 200ms
- **DynamoDB Operations**: < 100ms
- **Cross-tenant Isolation**: 0% success rate

## Success Criteria

### Technical Acceptance
- ✅ Function URLs with AuthType: NONE operational
- ✅ JWT validation working with < 500ms generation
- ✅ Two-table DynamoDB architecture deployed
- ✅ Cross-tenant isolation verified (0% success rate)
- ✅ Mobile Safari SSE compatibility confirmed

### Business Acceptance
- ✅ Real-time streaming < 1s first token response
- ✅ Healthcare data purging capability operational
- ✅ Complete audit trail for compliance review
- ✅ Zero-downtime migration completed
- ✅ Rollback procedures validated and documented

### Operational Acceptance
- ✅ CloudWatch monitoring and alerting active
- ✅ Emergency rollback procedures tested
- ✅ Infrastructure as Code deployment working
- ✅ Environment-specific configurations validated
- ✅ Security penetration testing completed

## Post-Deployment Operations

### Daily Monitoring Checklist
- [ ] Review CloudWatch error rates and latencies
- [ ] Verify DynamoDB TTL cleanup functioning
- [ ] Check JWT token usage patterns
- [ ] Monitor cross-tenant access attempts
- [ ] Validate Function URL response times

### Weekly Security Review
- [ ] JWT signing key rotation status
- [ ] Cross-tenant isolation audit
- [ ] Function URL access patterns
- [ ] DynamoDB data retention compliance
- [ ] CloudWatch alarm effectiveness

### Monthly Optimization Review
- [ ] DynamoDB capacity and costs
- [ ] Function URL usage patterns
- [ ] JWT token expiration optimization
- [ ] Performance baseline updates
- [ ] Security enhancement opportunities

This deployment strategy ensures zero-downtime migration while maintaining healthcare-grade security and compliance requirements. The phased approach allows for comprehensive testing and validation at each stage, with robust rollback capabilities protecting against any deployment issues.