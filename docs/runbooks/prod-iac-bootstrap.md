# Prod IaC Bootstrap (Phase 2 of P0) — Step 1

**Goal:** stand up the Terraform "belt" for the **prod account (614056832592)** so prod infrastructure
(IAM, alarms, WAF, Lambda config, eventually tables) can be managed as code and shipped through the
**same staging→approve→prod flow** the app code already uses — instead of by hand.

This is the one-time foundation. It mirrors the existing **staging** setup
(`backend/staging.tfbackend`, `GitHubActionsDeployRole` in 525) exactly; only the account, names,
and the trust-policy gate differ. The repo's `infra/README.md` already scoped this as "Phase 2".

> **Operator-run, out-of-band.** This is the deliberate exception to "everything via Terraform":
> you cannot store Terraform state in a bucket that Terraform hasn't created yet. Run these with the
> `chris-admin` prod profile. The agent cannot apply to prod.

> **⚡ One command runs all of Steps A–E:** `bash docs/runbooks/prod-iac-bootstrap.sh`
> (idempotent + account-guarded — refuses to run unless `chris-admin` resolves to 614). The steps
> below are the explained reference for what that script does.

---

## The one design difference from staging (important)

Staging's deploy role trusts `refs/heads/staging` → **auto-applies** on push to the staging branch.
**Prod's role trusts only `environment:production`** — a GitHub Environment with **required reviewers**.
That environment approval IS the "hold for my authorization before prod" gate. Prod has **no
auto-apply branch trigger**; a prod apply only runs after you click approve. (PRs may still *plan*
against prod read-only, so you can review the diff before approving.)

---

## Prerequisites
- `chris-admin` profile (static-key prod admin; no SSO needed).
- Repo: `longhornrumble/picasso`.
- Region: `us-east-1`.

---

## Step A — KMS CMK for state encryption (mirrors staging's state CMK)

```bash
PROFILE=chris-admin; REGION=us-east-1
KEY_ID=$(aws kms create-key --profile $PROFILE --region $REGION \
  --description "Terraform prod state encryption (myrecruiter-tfstate-production)" \
  --query 'KeyMetadata.KeyId' --output text)
aws kms create-alias --profile $PROFILE --region $REGION \
  --alias-name alias/tfstate-production --target-key-id "$KEY_ID"
echo "CMK: $KEY_ID  (arn: arn:aws:kms:$REGION:614056832592:key/$KEY_ID)"
```

## Step B — S3 state bucket (versioned, encrypted, locked-down)

```bash
BUCKET=myrecruiter-tfstate-production
aws s3api create-bucket --bucket $BUCKET --profile $PROFILE --region $REGION
aws s3api put-bucket-versioning --bucket $BUCKET --profile $PROFILE \
  --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket $BUCKET --profile $PROFILE \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket $BUCKET --profile $PROFILE \
  --server-side-encryption-configuration "{\"Rules\":[{\"ApplyServerSideEncryptionByDefault\":{\"SSEAlgorithm\":\"aws:kms\",\"KMSMasterKeyID\":\"$KEY_ID\"},\"BucketKeyEnabled\":true}]}"
```
(State locking uses S3-native `use_lockfile=true`, same as staging — no DynamoDB lock table needed.)

## Step C — GitHub OIDC provider in 614 (prod needs its own)

```bash
aws iam create-open-id-connect-provider --profile $PROFILE \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```
(AWS no longer validates the thumbprint for this provider, but the API still requires a value;
the one above is GitHub's well-known root. If the provider already exists, skip.)

## Step D — `GitHubActionsDeployRole` in 614

Trust policy — **prod gate = `environment:production`** (+ `pull_request` for read-only plans):

```bash
cat > /tmp/prod-deploy-trust.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::614056832592:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": [
        "repo:longhornrumble/*:environment:production",
        "repo:longhornrumble/*:pull_request"
      ]}
    }
  }]
}
JSON
aws iam create-role --role-name GitHubActionsDeployRole --profile $PROFILE \
  --assume-role-policy-document file:///tmp/prod-deploy-trust.json \
  --description "GitHub Actions OIDC deploy role for prod IaC (Phase 2). Apply gated by the production GitHub Environment."
```

**Initial permissions — deliberately NARROW (state backend + the pilot only).** Expand per tier as
more resources come under IaC; do not grant broad admin up front.

```bash
cat > /tmp/prod-deploy-perms.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "TfState", "Effect": "Allow",
      "Action": ["s3:ListBucket","s3:GetObject","s3:PutObject","s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::myrecruiter-tfstate-production","arn:aws:s3:::myrecruiter-tfstate-production/*"] },
    { "Sid": "TfStateKms", "Effect": "Allow",
      "Action": ["kms:Encrypt","kms:Decrypt","kms:GenerateDataKey"],
      "Resource": ["arn:aws:kms:us-east-1:614056832592:key/REPLACE_WITH_KEY_ID"] },
    { "Sid": "PilotAlarms", "Effect": "Allow",
      "Action": ["cloudwatch:PutMetricAlarm","cloudwatch:DeleteAlarms","cloudwatch:DescribeAlarms",
                 "cloudwatch:ListTagsForResource","cloudwatch:TagResource","cloudwatch:UntagResource",
                 "logs:PutMetricFilter","logs:DeleteMetricFilter","logs:DescribeMetricFilters"],
      "Resource": "*" }
  ]
}
JSON
# replace the CMK id, then:
aws iam put-role-policy --role-name GitHubActionsDeployRole --profile $PROFILE \
  --policy-name prod-iac-bootstrap-and-pilot \
  --policy-document file:///tmp/prod-deploy-perms.json
echo "Role ARN: arn:aws:iam::614056832592:role/GitHubActionsDeployRole"
```

## Step E — GitHub `production` Environment + approval gate (in the GitHub UI)

1. Repo **Settings → Environments → New environment** → name it **`production`**.
2. Add **Required reviewers** = you. (This is the approval hold.)
3. In that environment, add a **variable** `AWS_DEPLOY_ROLE_ARN` =
   `arn:aws:iam::614056832592:role/GitHubActionsDeployRole`.

---

## Verify
```bash
aws s3api get-bucket-versioning --bucket myrecruiter-tfstate-production --profile chris-admin   # Enabled
aws iam get-role --role-name GitHubActionsDeployRole --profile chris-admin --query 'Role.Arn'
```
GitHub: the `production` environment exists with you as a required reviewer + the `AWS_DEPLOY_ROLE_ARN` var.

---

## What comes next (agent-written, normal PR)
Once A–E are done:
1. `infra/backend/production.tfbackend` + `infra/envs/production.tfvars` (`env = "production"`).
2. An approval-gated prod CI job (plan on PR, apply only via the `production` environment).
3. **Pilot:** a Terraform module for the #10/#11 alarms + metric filter, run through the belt to prove
   the pipeline end-to-end on zero-risk resources — then climb the tiers (BSH config → Lambda cutover → tables via import).
