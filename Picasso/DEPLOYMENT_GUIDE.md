# Picasso Production Deployment Guide

## Overview

The `deploy-production.sh` script provides a comprehensive, safe deployment workflow for the Picasso chat widget to production S3 with automatic backups, validation, and rollback capabilities.

## Quick Start

```bash
# From the Picasso directory
npm run deploy:production

# Or directly
./deploy-production.sh
```

## Prerequisites

1. AWS CLI configured with `chris-admin` profile
2. Node.js 18+ and npm 9+
3. Git repository initialized
4. All dependencies installed (`npm install`)

## Deployment Steps (17 Total)

### Pre-Deployment Validation (Steps 1-6)

1. **Clean dist directory** - Removes old build artifacts
2. **Run linting** - Ensures code quality standards
3. **Run type checking** - Validates TypeScript/JSX types
4. **Run tests** - Executes full test suite
5. **Verify git branch** - Confirms deployment from main branch
6. **Check uncommitted changes** - Warns about dirty working directory

### Backup Phase (Steps 7-9)

7. **Create backup directory** - Timestamped backup location
8. **Download current production** - Full S3 sync to local backup
9. **Log backup location** - Records backup for rollback reference

### Build & Deploy Phase (Steps 10-13)

10. **Build production bundle** - Runs `npm run build:production`
11. **Verify build output** - Checks for critical files
12. **Show build artifacts** - Displays all files and sizes
13. **Final confirmation** - Last chance to cancel deployment

### Deployment Phase (Steps 14-15)

14. **Deploy to S3** - Syncs files with exclusions and cache headers
15. **Verify protected files** - Confirms MyRecruiterLogo.png preserved

### Post-Deployment Phase (Steps 16-17)

16. **Deployment summary** - Shows timestamp, commit, size, URLs
17. **Rollback instructions** - Provides one-command rollback

## Protected Files

The following files are **NEVER** deleted during deployment:

- `collateral/MyRecruiterLogo.png` - Shared tenant logo
- `*.map` files - Source maps (excluded from deployment)

These are protected using the `--exclude` flag in the S3 sync command.

## S3 Deployment Configuration

```bash
aws s3 sync dist/production/ s3://picassocode/ \
  --profile chris-admin \
  --exclude "*.map" \
  --exclude "collateral/*" \
  --cache-control "public, max-age=31536000" \
  --delete
```

### Flags Explained

- `--exclude "*.map"` - Don't upload source maps to production
- `--exclude "collateral/*"` - Protect shared assets
- `--cache-control "public, max-age=31536000"` - 1 year browser caching
- `--delete` - Remove old files (but not excluded ones)

## Backup & Rollback

### Automatic Backups

Every deployment creates a timestamped backup:

```
backups/
└── production-20251111-143022/
    ├── widget.js
    ├── iframe-main.js
    ├── iframe-main.css
    └── ... (all production files)
```

Backup history is logged in `backups/backup-history.log`:

```
2025-11-11 14:30:22 - backups/production-20251111-143022 - 485KB - Branch: main
```

### Manual Rollback

If deployment fails or issues are detected:

```bash
# Rollback to most recent backup
aws s3 sync backups/production-20251111-143022/ s3://picassocode/ \
  --profile chris-admin \
  --delete

# List available backups
ls -lh backups/
```

### Rollback Process

1. Identify the backup directory (shown in deployment summary)
2. Run the `aws s3 sync` command provided in rollback instructions
3. Optionally invalidate CloudFront cache (see below)
4. Verify widget loads correctly at https://chat.myrecruiter.ai/widget.js

## CloudFront Cache Invalidation

The script optionally invalidates CloudFront cache after deployment.

### When to Invalidate

- **Critical fixes** - Immediate propagation needed
- **New features** - Users should see changes right away
- **Breaking changes** - Old cached version may cause issues

### When NOT to Invalidate

- **Minor updates** - Cache will expire naturally (1 year max-age)
- **Non-user-facing changes** - Internal refactors, logging, etc.
- **Cost sensitivity** - Invalidations have AWS costs

### Manual Invalidation

```bash
# Get your CloudFront distribution ID from AWS Console
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths '/*' \
  --profile chris-admin
```

## Deployment Logs

All deployments are logged to `deployments/deploy-history.log`:

```
2025-11-11 14:30:45 | a3f8d2c | main | 485KB | SUCCESS
2025-11-10 09:15:23 | 7b4e9f1 | main | 482KB | SUCCESS
```

## Example Deployment Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PICASSO PRODUCTION DEPLOYMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Target:        s3://picassocode/
CloudFront:    https://chat.myrecruiter.ai
AWS Profile:   chris-admin
Timestamp:     2025-11-11 14:30:22

[1/17] Cleaning dist directory
✓ Cleaned dist directory

[2/17] Running linting checks
✓ Linting passed

[3/17] Running type checking
✓ Type checking passed

[4/17] Running test suite
✓ All tests passed

[5/17] Verifying git branch
✓ On main branch

[6/17] Checking for uncommitted changes
✓ Working directory is clean

[7/17] Creating backup directory
✓ Created backup directory: backups/production-20251111-143022

[8/17] Backing up current production files
Downloading from S3...
✓ Backup complete (485KB stored in backups/production-20251111-143022)

[9/17] Logging backup location
✓ Backup logged for rollback reference

[10/17] Building production bundle
Running npm run build:production...
✓ Production build complete

[11/17] Verifying build output
✓ Build output verified

[12/17] Analyzing build artifacts

Build Artifacts:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
widget.js                           14KB
iframe-main.js                     375KB
iframe-main.css                     85KB
iframe.html                          2KB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL:                             476KB

[13/17] Final deployment confirmation
⚠ WARNING: This will deploy to PRODUCTION ⚠

Deployment Details:
  • Source:        dist/production
  • Destination:   s3://picassocode/
  • Total Size:    476KB
  • Protected:     collateral/*
  • Backup:        backups/production-20251111-143022

Continue? (y/n): y

[14/17] Deploying to S3
Syncing files to s3://picassocode/...
✓ Deployment to S3 complete

[15/17] Verifying protected files
✓ Protected file preserved: collateral/MyRecruiterLogo.png

[16/17] Deployment summary

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DEPLOYMENT SUCCESSFUL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Deployment Details:
  • Timestamp:     2025-11-11 14:30:45
  • Git Commit:    a3f8d2c
  • Git Branch:    main
  • Total Size:    476KB
  • Destination:   s3://picassocode/
  • CloudFront:    https://chat.myrecruiter.ai
  • Backup:        backups/production-20251111-143022

[17/17] Rollback instructions

ROLLBACK INSTRUCTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If you need to rollback this deployment, run:

  aws s3 sync backups/production-20251111-143022/ s3://picassocode/ \
    --profile chris-admin \
    --delete

This will restore all files from the backup created at:
  backups/production-20251111-143022

CLOUDFRONT CACHE INVALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CloudFront cache is set to 1 year max-age.
To immediately invalidate the cache, run:

  aws cloudfront create-invalidation \
    --distribution-id <DISTRIBUTION_ID> \
    --paths '/*' \
    --profile chris-admin

Do you want to invalidate CloudFront cache now? (y/n): n
ℹ Skipping CloudFront invalidation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Deployment complete! Widget is live at:
  https://chat.myrecruiter.ai/widget.js
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Deployment logged to deployments/deploy-history.log
```

## Error Handling

The script exits immediately on any error:

- **Linting failures** - Fix code quality issues
- **Type errors** - Resolve TypeScript/JSX type issues
- **Test failures** - Fix failing tests
- **Build failures** - Check build configuration
- **S3 sync failures** - Verify AWS credentials and permissions

No changes are deployed to production if any validation step fails.

## Safety Features

1. **Pre-flight checks** - Linting, types, tests before deployment
2. **Automatic backups** - Every deployment creates timestamped backup
3. **Protected files** - Critical assets never deleted
4. **Confirmation prompts** - Multiple chances to cancel
5. **Rollback instructions** - One-command rollback provided
6. **Deployment logs** - Complete audit trail
7. **Protected files verification** - Confirms assets preserved

## Best Practices

1. **Always deploy from main branch** - Ensures clean production history
2. **Commit all changes first** - Clean working directory recommended
3. **Review build artifacts** - Check sizes before confirming
4. **Keep backups** - Don't delete backup directories
5. **Test locally first** - Use `npm run dev` to verify changes
6. **Invalidate cache selectively** - Only when necessary
7. **Monitor after deployment** - Check production widget loads correctly

## Troubleshooting

### AWS Credentials Not Found

```bash
# Configure AWS CLI
aws configure --profile chris-admin

# Or set environment variables
export AWS_PROFILE=chris-admin
```

### Permission Denied on Script

```bash
# Make script executable
chmod +x deploy-production.sh
```

### Build Failures

```bash
# Clean and rebuild
npm run clean
npm install
npm run build:production
```

### S3 Sync Failures

```bash
# Verify bucket access
aws s3 ls s3://picassocode/ --profile chris-admin

# Check IAM permissions
aws iam get-user --profile chris-admin
```

### Protected Files Missing

If protected files are accidentally deleted:

```bash
# Restore from latest backup
aws s3 sync backups/production-YYYYMMDD-HHMMSS/collateral/ s3://picassocode/collateral/ \
  --profile chris-admin
```

## CI/CD Integration

For automated deployments, see the CI/CD section below for GitHub Actions workflow integration.

## Related Documentation

- `/Users/chrismiller/Desktop/Working_Folder/Picasso/CLAUDE.md` - Project overview
- `/Users/chrismiller/Desktop/Working_Folder/Picasso/docs/WEB_CONFIG_BUILDER_PRD.md` - Config builder
- `/Users/chrismiller/Desktop/Working_Folder/Picasso/docs/TENANT_CONFIG_SCHEMA.md` - Config schema

## Support

For issues or questions:
1. Check deployment logs in `deployments/deploy-history.log`
2. Review backup history in `backups/backup-history.log`
3. Verify AWS credentials and permissions
4. Contact the development team
