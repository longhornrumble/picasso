# 🚀 Production Deployment Guide

## 📊 Architecture Overview

### Environment Configuration
| Environment | HTTP Lambda | HTTP Endpoint | Streaming Lambda | Streaming Endpoint |
|------------|-------------|---------------|------------------|-------------------|
| **Development** | Master_Function_Staging | Function URL | Bedrock_Streaming_Handler_Staging | `https://7pluzq3axftklmb4gbgchfdahu0lcnqd.lambda-url.us-east-1.on.aws/` |
| **Staging** | Master_Function_Staging | Function URL | Bedrock_Streaming_Handler_Staging | `https://7pluzq3axftklmb4gbgchfdahu0lcnqd.lambda-url.us-east-1.on.aws/` |
| **Production** | Master_Function | `https://chat.myrecruiter.ai` (CloudFront → API Gateway) | Bedrock_Streaming_Handler | `https://xqc4wnxwia2nytjkbw6xasjd6q0jckgb.lambda-url.us-east-1.on.aws/` |

### Key Differences in Production
1. **HTTP Path**: Uses CloudFront CDN → API Gateway → Lambda (not direct Function URL)
2. **Streaming Path**: Uses Function URL directly for low-latency SSE
3. **Versioning**: Both production Lambdas use version control and aliases
4. **Endpoint URLs**: Different from staging/development

## 📋 Pre-Deployment Checklist

### 1. Code Verification
- [ ] Dual-path architecture active in App.jsx
- [ ] environment.js has correct production endpoints:
  - [ ] HTTP: `https://chat.myrecruiter.ai/Master_Function`
  - [ ] Streaming: `https://xqc4wnxwia2nytjkbw6xasjd6q0jckgb.lambda-url.us-east-1.on.aws/`
- [ ] Streaming enabled in streaming-config.js
- [ ] No console.log statements in production code
- [ ] All tests passing

### 2. Build Verification
```bash
# Run production readiness check
npm run make-ready

# Verify production build
npm run build:production
ls -lah dist/production/
```

### 3. Staging Testing
- [ ] Test widget in staging environment
- [ ] Verify HTTP responses < 2 seconds
- [ ] Verify streaming works correctly
- [ ] Test conversation persistence
- [ ] Test clear conversation functionality

## 🚀 Deployment Steps

### Step 1: Deploy Lambda Functions
```bash
# Deploy both Lambda functions from staging to production
./deploy-lambdas-production.sh

# This script will:
# 1. Copy code from staging functions
# 2. Update production functions
# 3. Create new versions
# 4. Update/create production aliases
# 5. Verify endpoints
```

### Step 2: Deploy Frontend to S3
```bash
# Build production assets
npm run build:production

# Deploy to S3 production bucket
aws s3 sync dist/production/ s3://picassocode/ \
  --delete \
  --profile ai-developer \
  --cache-control "public, max-age=300" \
  --exclude "*.map"

# Set specific cache headers for index files
aws s3 cp dist/production/widget.js s3://picassocode/widget.js \
  --profile ai-developer \
  --cache-control "public, max-age=300" \
  --content-type "application/javascript"

aws s3 cp dist/production/widget-frame.html s3://picassocode/widget-frame.html \
  --profile ai-developer \
  --cache-control "public, max-age=300" \
  --content-type "text/html"
```

### Step 3: Invalidate CloudFront Cache
```bash
# Create CloudFront invalidation
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*" \
  --profile ai-developer

# Wait for invalidation to complete (usually 5-10 minutes)
aws cloudfront wait invalidation-completed \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --id INVALIDATION_ID \
  --profile ai-developer
```

## 🧪 Post-Deployment Verification

### 1. Function URL Verification
```bash
# Verify production streaming endpoint
curl -X POST https://xqc4wnxwia2nytjkbw6xasjd6q0jckgb.lambda-url.us-east-1.on.aws/ \
  -H "Content-Type: application/json" \
  -d '{"test": true}' \
  -w "\nStatus: %{http_code}\n"
```

### 2. CloudFront Endpoint Verification
```bash
# Test HTTP endpoint through CloudFront
curl https://chat.myrecruiter.ai/Master_Function?action=health_check \
  -H "Accept: application/json" \
  -w "\nStatus: %{http_code}\n"
```

### 3. Widget Testing
1. Load a page with the production widget
2. Verify widget loads in < 500ms
3. Send a test message
4. Verify response time < 2 seconds
5. Test streaming mode
6. Test conversation clear
7. Check for console errors

### 4. CloudWatch Monitoring
- [ ] Check Lambda execution metrics
- [ ] Review error logs
- [ ] Monitor response times
- [ ] Check for throttling

## 🔄 Rollback Procedure

### If Issues Arise:

#### 1. Lambda Rollback
```bash
# Get previous version numbers
aws lambda list-versions-by-function \
  --function-name Master_Function \
  --profile ai-developer \
  --max-items 5

aws lambda list-versions-by-function \
  --function-name Bedrock_Streaming_Handler \
  --profile ai-developer \
  --max-items 5

# Rollback to previous version
aws lambda update-alias \
  --function-name Master_Function \
  --name production \
  --function-version PREVIOUS_VERSION_NUMBER \
  --profile ai-developer

aws lambda update-alias \
  --function-name Bedrock_Streaming_Handler \
  --name production \
  --function-version PREVIOUS_VERSION_NUMBER \
  --profile ai-developer
```

#### 2. S3 Rollback
```bash
# If you have a backup
aws s3 sync s3://picassocode-backup/ s3://picassocode/ \
  --delete \
  --profile ai-developer

# Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*" \
  --profile ai-developer
```

## 📊 Success Metrics

### Performance Targets
- ✅ Widget load time: < 500ms
- ✅ Config fetch: < 200ms  
- ✅ First message response: < 2 seconds
- ✅ Streaming latency: < 100ms per chunk
- ✅ Error rate: < 0.1%

### Key Achievements
- **45-second delays**: ELIMINATED ✅
- **Dual-path architecture**: ACTIVE ✅
- **Response time**: <2 seconds ✅
- **Streaming quality**: OPTIMIZED ✅

## 🔐 Security Considerations

1. **Function URLs**: 
   - Production streaming uses dedicated Function URL
   - CORS configured for your domains only
   
2. **CloudFront**:
   - Provides DDoS protection
   - Geographic distribution
   - SSL/TLS termination

3. **API Gateway**:
   - Request throttling
   - API key management (if configured)
   - Request/response transformation

## 📝 Important Notes

1. **Environment.js is Critical**: The production build MUST have the correct endpoints:
   - HTTP must point to CloudFront
   - Streaming must point to production Function URL

2. **Version Control**: Always create new versions when deploying to production

3. **Monitoring**: Watch CloudWatch for the first hour after deployment

4. **Cache Timing**: CloudFront cache invalidation takes 5-10 minutes

## 🎯 Final Checklist

Before marking deployment complete:
- [ ] Both Lambda functions deployed and versioned
- [ ] Frontend deployed to S3
- [ ] CloudFront cache invalidated
- [ ] Widget loads correctly
- [ ] Chat responses working
- [ ] Streaming functioning
- [ ] No console errors
- [ ] CloudWatch logs clean
- [ ] Performance metrics met
- [ ] Deployment record created

---

**Deployment Contact**: If issues arise, contact the DevOps team immediately.
**Documentation**: Update deployment log with version numbers and timestamps.