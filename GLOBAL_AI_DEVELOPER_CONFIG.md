# Global AI Developer Configuration - Ready for Any Project 🚀

## ✅ CONFIGURATION COMPLETE

Your AWS CLI is now configured with the AI developer role as the **default** for ALL projects and agents.

## Current Setup

### Default Profile (Used Everywhere)
```bash
aws configure list
```
```
Name                    Value             Type    Location
----                    -----             ----    --------
profile            <not set>             None    None
access_key    ****************N7KU    assume-role    
secret_key    ****************p9UY    assume-role    
region             us-east-1       config-file    ~/.aws/config
```

**Identity**: `arn:aws:sts::614056832592:assumed-role/ai-developer-role/botocore-session-*`

### Root Profile (When You Need Full Access)
```bash
aws configure list --profile root
```
**Identity**: `arn:aws:iam::614056832592:root`

## Cross-Project Usage

### ✅ Automatic in ANY Directory/Project:
```bash
cd ~/any-project/
aws lambda list-functions     # ✅ Uses AI developer role
aws s3 cp file.txt s3://dev/   # ✅ Dev/staging access only
aws logs tail /aws/lambda/fn   # ✅ Monitoring access
```

### ✅ Agent Integration:
All AI agents (Claude Code, GitHub Copilot, custom tools) automatically use the restricted role:
- **Safe by default** - Can't damage production
- **Full dev access** - No friction in development
- **Cross-project** - Works in every repository

## Permission Summary

### 🟢 ALLOWED (Any Project/Agent):
- **Lambda**: Create, update, invoke (non-production functions)
- **S3**: Full access to staging/dev buckets (`picassocode`, `picassostaging`, `*-dev-*`, `*-staging-*`)
- **CloudWatch**: Logs, metrics, monitoring
- **API Gateway**: Full development access
- **Bedrock**: AI model access
- **DynamoDB**: Dev/staging tables
- **CloudFormation**: Dev/staging stacks

### 🔴 BLOCKED (Production Protected):
- **Production Lambda**: No modifications to production functions
- **Production S3**: No writes to production buckets
- **Production DynamoDB**: No production table access
- **IAM**: Limited to project-specific roles
- **Destructive Operations**: No deletions of critical resources

### 👀 READ-ONLY (Production Monitoring):
- **View production functions** - For debugging/monitoring
- **Read production logs** - For troubleshooting
- **Access production metrics** - For performance analysis

## Emergency Production Access

When you absolutely need production access:

```bash
# 1. Attach production policy (requires MFA)
aws iam attach-role-policy \
    --role-name ai-developer-role \
    --policy-arn arn:aws:iam::614056832592:policy/developers/production-access-elevation \
    --profile root

# 2. Work is done automatically in next AWS CLI calls

# 3. Remove when done
aws iam detach-role-policy \
    --role-name ai-developer-role \
    --policy-arn arn:aws:iam::614056832592:policy/developers/production-access-elevation \
    --profile root
```

## Project Types This Supports

### ✅ Web Applications (like Picasso)
- S3 static hosting
- Lambda API backends
- CloudFront distributions
- DynamoDB data storage

### ✅ Serverless Applications
- Lambda functions
- API Gateway REST/HTTP APIs
- EventBridge rules
- Step Functions

### ✅ AI/ML Projects
- Bedrock model access
- Lambda inference functions
- S3 data lakes
- SageMaker (if added to policy)

### ✅ DevOps/Infrastructure
- CloudFormation templates
- CloudWatch monitoring
- AWS CLI automation
- Terraform (with AWS provider)

## Files Created (Persistent Configuration)

### AWS Config Files:
- `~/.aws/credentials` - Contains AI developer keys + root backup
- `~/.aws/config` - Contains role assumption configuration

### Project Documentation:
- `ai-developer-iam-role.json` - Main IAM policy
- `production-access-elevation.json` - Emergency production access
- `ai-developer-trust-policy.json` - Role trust relationship
- `AI_DEVELOPER_SETUP_COMPLETE.md` - Initial setup summary
- `GLOBAL_AI_DEVELOPER_CONFIG.md` - This cross-project guide

## Verification Commands

Test the configuration in any project directory:

```bash
# Check current identity
aws sts get-caller-identity

# Test dev access
aws s3 ls s3://picassocode/

# Test Lambda access
aws lambda list-functions --max-items 3

# Switch to root when needed
aws s3 ls --profile root
```

## Troubleshooting

### Access Denied Errors:
1. **Check resource naming** - Does it have "prod" in the name?
2. **Verify environment** - Are you accessing staging/dev resources?
3. **Use root profile** - For legitimate production needs

### Role Assumption Failures:
1. **IP changed** - Update trust policy with new IP
2. **External ID** - Ensure `picasso-ai-dev-2025-821584` is correct
3. **Network issues** - Check internet connection

### Agent Integration Issues:
1. **Environment variables** - Agents should inherit AWS config automatically
2. **Docker/containers** - Mount `~/.aws/` volume if needed
3. **CI/CD** - Use the AI developer access keys in secrets

## Security Benefits

✅ **Defense in Depth** - Multiple layers protect production  
✅ **Least Privilege** - Only necessary permissions granted  
✅ **Audit Trail** - All actions logged with role identity  
✅ **IP Restrictions** - Geographic access control  
✅ **MFA Gates** - Production requires multi-factor auth  
✅ **Time-Bounded** - Production policies expire annually  

## Future Projects

This configuration **automatically works** for any new project because:
1. **Account-wide role** - Not tied to specific projects
2. **Default AWS profile** - All tools use it automatically
3. **Broad service access** - Covers most AWS services you'll need
4. **Safe defaults** - Production protected by default

Just start coding in any directory - the AI developer role is ready! 🎉

---

**Setup Date**: 2025-08-12  
**Next Review**: 2025-09-12 (Monthly)  
**Role ARN**: `arn:aws:iam::614056832592:role/developers/ai-developer-role`