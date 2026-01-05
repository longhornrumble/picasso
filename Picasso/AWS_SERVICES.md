# AWS Services Version Control

This document tracks AWS service configurations, versions, and deployment history for the Picasso Chat Widget infrastructure.

**Last Updated**: 2026-01-05

---

## Production Environment

### S3 Buckets

| Bucket | Purpose | Versioning | Encryption | Last Deploy |
|--------|---------|------------|------------|-------------|
| `picassocode` | Widget assets (widget.js, iframe, fonts) | Enabled | AES256 | 2026-01-05 |
| `myrecruiter-picasso` | Tenant configurations | Enabled | AES256 | - |
| `picassocode-cloudfront-logs` | CloudFront access logs | Disabled | AES256 | - |

### CloudFront Distributions

| Distribution ID | Domain | Origin | Status | Last Invalidation |
|----------------|--------|--------|--------|-------------------|
| `E3G0LSWB1AQ9LP` | chat.myrecruiter.ai | picassocode.s3 | Deployed | `I2YG0Q3RBCGZBJS7LIX9RP8HUP` (2026-01-05) |

### Lambda Functions

| Function | Runtime | Memory | Timeout | Last Deploy |
|----------|---------|--------|---------|-------------|
| `Master_Function_Staging` | Python 3.13 | 512 MB | 300s | - |
| `Bedrock_Streaming_Handler_Staging` | Node.js 20.x | 2048 MB | 300s | - |
| `Analytics_Dashboard_API` | Python 3.13 | 512 MB | 30s | - |
| `Analytics_Event_Processor` | Python 3.13 | 256 MB | 60s | - |

### DynamoDB Tables

| Table | Billing | PITR | TTL | GSIs |
|-------|---------|------|-----|------|
| `picasso-audit-staging` | PAY_PER_REQUEST | Yes | Enabled | - |
| `picasso-form-submissions` | PAY_PER_REQUEST | Yes | Disabled | `tenant-submissions-index` |
| `picasso-session-summaries` | PAY_PER_REQUEST | Yes | Enabled | - |
| `picasso-session-events` | PAY_PER_REQUEST | Yes | Enabled | - |
| `picasso-token-blacklist` | PAY_PER_REQUEST | No | Enabled | - |

### Secrets Manager

| Secret ID | Purpose | Rotation |
|-----------|---------|----------|
| `picasso/staging/jwt/signing-key` | JWT token signing | Manual (90 days) |
| `picasso/production/jwt/signing-key` | JWT token signing | Manual (90 days) |

---

## Staging Environment

### S3 Buckets

| Bucket | Purpose | Last Deploy |
|--------|---------|-------------|
| `picassostaging` | Widget assets (staging) | - |

### CloudFront Distributions

| Distribution ID | Domain | Last Invalidation |
|----------------|--------|-------------------|
| `E2EXAMPLE` | staging.chat.myrecruiter.ai | - |

---

## Deployment History

### 2026-01-05 - Production Deploy v2.1.1

**Commit**: `34a82e5` + `f6b6900`
**Deployed By**: Claude Code
**Build Time**: 2026-01-05T23:52:43.414Z

**Files Deployed**:
| File | Size | Content-Type |
|------|------|--------------|
| `widget.js` | 21.2 KB | application/javascript |
| `iframe-main.js` | 435.2 KB | application/javascript |
| `iframe-main.css` | 95.9 KB | text/css |
| `iframe.html` | 640 B | text/html |
| `fonts/inter/inter-latin.woff2` | 48 KB | font/woff2 |
| `fonts/montserrat/montserrat-latin.woff2` | 35 KB | font/woff2 |

**CloudFront Invalidation**: `I2YG0Q3RBCGZBJS7LIX9RP8HUP`

**Changes**:
- Self-hosted fonts (Inter, Montserrat)
- ESBuild fix for console statements
- Form submission duplication fix

---

### 2026-01-05 - Production Deploy v2.1.0

**Changes**:
- Unified session IDs for form-to-conversation linking
- Analytics session ID format (`sess_*`)

---

## Cache Settings

### CloudFront Cache Behavior

| Path Pattern | Cache Policy | TTL |
|--------------|--------------|-----|
| `*.js` | CachingOptimized | 24 hours |
| `*.css` | CachingOptimized | 24 hours |
| `fonts/*` | CachingOptimized | 1 year |
| `*.html` | CachingOptimized | 24 hours |
| `collateral/*` | CachingOptimized | 1 year |

### S3 Cache-Control Headers

| File Type | Cache-Control |
|-----------|---------------|
| JavaScript | `max-age=86400` (24h) |
| CSS | `max-age=86400` (24h) |
| Fonts | `max-age=31536000` (1y) |
| HTML | `max-age=86400` (24h) |

---

## Monitoring

### CloudWatch Alarms

| Alarm | Metric | Threshold |
|-------|--------|-----------|
| Lambda Errors | `AWS/Lambda/Errors` | > 5 per 5 min |
| Lambda Duration | `AWS/Lambda/Duration` | > 200s |
| DynamoDB Throttles | `AWS/DynamoDB/ThrottledRequests` | > 0 |
| CloudFront 5xx | `AWS/CloudFront/5xxErrorRate` | > 1% |

### Log Groups

| Log Group | Retention |
|-----------|-----------|
| `/aws/lambda/Master_Function_Staging` | 30 days |
| `/aws/lambda/Bedrock_Streaming_Handler_Staging` | 30 days |
| `/aws/lambda/Analytics_Dashboard_API` | 30 days |

---

## Quick Commands

### Check Current Versions

```bash
# Widget version (check build timestamp in console)
curl -sI https://chat.myrecruiter.ai/widget.js | grep last-modified

# Lambda function versions
aws lambda list-versions-by-function --function-name Master_Function_Staging --profile chris-admin

# S3 object versions
aws s3api list-object-versions --bucket picassocode --prefix widget.js --max-items 5 --profile chris-admin
```

### Deploy Commands

```bash
# Build production
npm run build:production

# Deploy to S3
aws s3 sync dist/production/ s3://picassocode/ --profile chris-admin

# Invalidate CloudFront
aws cloudfront create-invalidation --distribution-id E3G0LSWB1AQ9LP --paths "/*" --profile chris-admin
```

### Rollback Commands

```bash
# Restore previous S3 version
aws s3api copy-object --bucket picassocode --key widget.js \
  --copy-source "picassocode/widget.js?versionId=VERSION_ID" --profile chris-admin

# Invalidate after rollback
aws cloudfront create-invalidation --distribution-id E3G0LSWB1AQ9LP --paths "/*" --profile chris-admin
```

---

## Related Documentation

- [CHANGELOG.md](./CHANGELOG.md) - Version history and release notes
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Full deployment procedures
- [INFRASTRUCTURE_GUIDE.md](./infrastructure/INFRASTRUCTURE_GUIDE.md) - IaC documentation
- [DEPLOYMENT_QUICK_REFERENCE.md](./DEPLOYMENT_QUICK_REFERENCE.md) - Quick reference card
