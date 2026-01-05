# Picasso Deployment - Quick Reference Card

## One-Command Deployment

```bash
cd /Users/chrismiller/Desktop/Working_Folder/Picasso
npm run deploy:production
```

## Manual Deployment Steps

```bash
# 1. Navigate to project
cd /Users/chrismiller/Desktop/Working_Folder/Picasso

# 2. Run deployment script
./deploy-production.sh

# 3. Follow prompts and confirm
# Script handles everything automatically
```

## Emergency Rollback

```bash
# List recent backups
ls -lh backups/

# Rollback to most recent backup
aws s3 sync backups/production-YYYYMMDD-HHMMSS/ s3://picassocode/ \
  --profile chris-admin \
  --delete

# Verify logo preserved
aws s3 ls s3://picassocode/collateral/MyRecruiterLogo.png --profile chris-admin
```

## CloudFront Cache Invalidation

```bash
# Get distribution ID from AWS Console
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths '/*' \
  --profile chris-admin
```

## Check Deployment Status

```bash
# Local deployment logs
cat deployments/deploy-history.log

# GitHub Actions deployments
# Visit: https://github.com/longhornrumble/picasso/actions

# Widget live URL
# https://chat.myrecruiter.ai/widget.js
```

## Verify Protected Files

```bash
# Check MyRecruiterLogo.png exists
aws s3 ls s3://picassocode/collateral/MyRecruiterLogo.png --profile chris-admin

# View in browser
# https://chat.myrecruiter.ai/collateral/MyRecruiterLogo.png
```

## Common Issues

### Permission Denied
```bash
chmod +x deploy-production.sh
```

### AWS Credentials
```bash
aws configure --profile chris-admin
```

### Build Failures
```bash
npm run clean
npm install
npm run build:production
```

## File Locations

| File | Location |
|------|----------|
| Deploy Script | `/Users/chrismiller/Desktop/Working_Folder/Picasso/deploy-production.sh` |
| Full Guide | `/Users/chrismiller/Desktop/Working_Folder/Picasso/DEPLOYMENT_GUIDE.md` |
| Summary | `/Users/chrismiller/Desktop/Working_Folder/Picasso/DEPLOYMENT_COMPLETE_SUMMARY.md` |
| CI/CD | `/Users/chrismiller/Desktop/Working_Folder/Picasso/.github/workflows/deploy-production.yml` |
| IaC Guide | `/Users/chrismiller/Desktop/Working_Folder/Picasso/infrastructure/INFRASTRUCTURE_GUIDE.md` |

## Support

- Full Documentation: See `DEPLOYMENT_GUIDE.md`
- Infrastructure: See `infrastructure/INFRASTRUCTURE_GUIDE.md`
- Project Overview: See `CLAUDE.md`
