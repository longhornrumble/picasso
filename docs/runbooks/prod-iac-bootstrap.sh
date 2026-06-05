#!/usr/bin/env bash
# Prod IaC bootstrap (Phase 2 of P0) — Step 1. See prod-iac-bootstrap.md.
# Idempotent + account-guarded. Run with: bash docs/runbooks/prod-iac-bootstrap.sh
# Prereqs: `chris-admin` AWS profile (static-key prod admin) + `gh` authenticated with
# admin on longhornrumble/picasso. Creates the prod Terraform state backend, OIDC
# deploy role (narrow perms), and the approval-gated `production` GitHub Environment.
set -euo pipefail

PROFILE=chris-admin
REGION=us-east-1
ACCOUNT_EXPECTED=614056832592
BUCKET=myrecruiter-tfstate-production
REPO=longhornrumble/picasso
ROLE=GitHubActionsDeployRole

# ---------- Guard: refuse to run against the wrong account ----------
ACCOUNT=$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)
if [ "$ACCOUNT" != "$ACCOUNT_EXPECTED" ]; then
  echo "ABORT: profile '$PROFILE' resolves to account $ACCOUNT, expected $ACCOUNT_EXPECTED"; exit 1
fi
echo "✓ account $ACCOUNT (prod)"

# ---------- A. KMS CMK for state (idempotent via alias) ----------
if aws kms describe-key --profile "$PROFILE" --region "$REGION" --key-id alias/tfstate-production >/dev/null 2>&1; then
  KEY_ID=$(aws kms describe-key --profile "$PROFILE" --region "$REGION" --key-id alias/tfstate-production --query 'KeyMetadata.KeyId' --output text)
  echo "✓ CMK exists: $KEY_ID"
else
  KEY_ID=$(aws kms create-key --profile "$PROFILE" --region "$REGION" \
    --description "Terraform prod state encryption (myrecruiter-tfstate-production)" \
    --query 'KeyMetadata.KeyId' --output text)
  aws kms create-alias --profile "$PROFILE" --region "$REGION" --alias-name alias/tfstate-production --target-key-id "$KEY_ID"
  echo "✓ CMK created: $KEY_ID"
fi
KEY_ARN="arn:aws:kms:$REGION:$ACCOUNT_EXPECTED:key/$KEY_ID"

# ---------- B. S3 state bucket (versioned, SSE-KMS, locked down) ----------
if aws s3api head-bucket --bucket "$BUCKET" --profile "$PROFILE" 2>/dev/null; then
  echo "✓ bucket exists: $BUCKET"
else
  aws s3api create-bucket --bucket "$BUCKET" --profile "$PROFILE" --region "$REGION"
  echo "✓ bucket created: $BUCKET"
fi
aws s3api put-bucket-versioning --bucket "$BUCKET" --profile "$PROFILE" --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket "$BUCKET" --profile "$PROFILE" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$BUCKET" --profile "$PROFILE" \
  --server-side-encryption-configuration "{\"Rules\":[{\"ApplyServerSideEncryptionByDefault\":{\"SSEAlgorithm\":\"aws:kms\",\"KMSMasterKeyID\":\"$KEY_ID\"},\"BucketKeyEnabled\":true}]}"
echo "✓ bucket hardened (versioned, SSE-KMS, public-access-blocked)"

# ---------- C. GitHub OIDC provider ----------
OIDC_ARN="arn:aws:iam::$ACCOUNT_EXPECTED:oidc-provider/token.actions.githubusercontent.com"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" --profile "$PROFILE" >/dev/null 2>&1; then
  echo "✓ OIDC provider exists"
else
  aws iam create-open-id-connect-provider --profile "$PROFILE" \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
  echo "✓ OIDC provider created"
fi

# ---------- D. Deploy role: OIDC trust (env:production gate) + NARROW perms ----------
cat > /tmp/prod-deploy-trust.json <<JSON
{ "Version":"2012-10-17","Statement":[{ "Effect":"Allow",
  "Principal":{"Federated":"$OIDC_ARN"},
  "Action":"sts:AssumeRoleWithWebIdentity",
  "Condition":{
    "StringEquals":{"token.actions.githubusercontent.com:aud":"sts.amazonaws.com"},
    "StringLike":{"token.actions.githubusercontent.com:sub":[
      "repo:longhornrumble/*:environment:production",
      "repo:longhornrumble/*:pull_request"]}}}]}
JSON
if aws iam get-role --role-name "$ROLE" --profile "$PROFILE" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$ROLE" --profile "$PROFILE" --policy-document file:///tmp/prod-deploy-trust.json
  echo "✓ role trust updated"
else
  aws iam create-role --role-name "$ROLE" --profile "$PROFILE" \
    --assume-role-policy-document file:///tmp/prod-deploy-trust.json \
    --description "GitHub Actions OIDC deploy role for prod IaC (Phase 2). Apply gated by the production GitHub Environment."
  echo "✓ role created"
fi
cat > /tmp/prod-deploy-perms.json <<JSON
{ "Version":"2012-10-17","Statement":[
  {"Sid":"TfState","Effect":"Allow",
   "Action":["s3:ListBucket","s3:GetObject","s3:PutObject","s3:DeleteObject"],
   "Resource":["arn:aws:s3:::$BUCKET","arn:aws:s3:::$BUCKET/*"]},
  {"Sid":"TfStateKms","Effect":"Allow",
   "Action":["kms:Encrypt","kms:Decrypt","kms:GenerateDataKey"],
   "Resource":["$KEY_ARN"]},
  {"Sid":"PilotAlarms","Effect":"Allow",
   "Action":["cloudwatch:PutMetricAlarm","cloudwatch:DeleteAlarms","cloudwatch:DescribeAlarms",
             "cloudwatch:ListTagsForResource","cloudwatch:TagResource","cloudwatch:UntagResource",
             "logs:PutMetricFilter","logs:DeleteMetricFilter","logs:DescribeMetricFilters"],
   "Resource":"*"}]}
JSON
aws iam put-role-policy --role-name "$ROLE" --profile "$PROFILE" \
  --policy-name prod-iac-bootstrap-and-pilot --policy-document file:///tmp/prod-deploy-perms.json
echo "✓ role permissions set (state backend + alarm pilot only — expand per tier later)"
ROLE_ARN="arn:aws:iam::$ACCOUNT_EXPECTED:role/$ROLE"

# ---------- E. GitHub `production` environment + required reviewer + role var ----------
# (Private-repo environment protection rules require a paid GitHub plan. If this block
#  errors, create the environment + reviewer + variable in the repo UI instead.)
USER_ID=$(gh api user --jq .id)
gh api -X PUT "repos/$REPO/environments/production" --input - <<JSON
{"reviewers":[{"type":"User","id":$USER_ID}],"deployment_branch_policy":null}
JSON
gh variable set AWS_DEPLOY_ROLE_ARN --env production --repo "$REPO" --body "$ROLE_ARN"
echo "✓ GitHub 'production' environment + required reviewer + AWS_DEPLOY_ROLE_ARN set"

# ---------- Verify ----------
echo "=== VERIFY ==="
echo -n "bucket versioning: "; aws s3api get-bucket-versioning --bucket "$BUCKET" --profile "$PROFILE" --query Status --output text
echo -n "deploy role:       "; aws iam get-role --role-name "$ROLE" --profile "$PROFILE" --query 'Role.Arn' --output text
echo -n "gh environment:    "; gh api "repos/$REPO/environments/production" --jq '.name + " (protection: " + ((.protection_rules // []) | map(.type) | join(",")) + ")"'
echo ""
echo "DONE. AWS_DEPLOY_ROLE_ARN = $ROLE_ARN"
echo "Tell the agent it's done — next: backend/production.tfbackend + envs/production.tfvars + prod CI job + the alarm pilot."
