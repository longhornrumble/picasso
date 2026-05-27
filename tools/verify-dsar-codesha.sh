#!/usr/bin/env bash
# verify-dsar-codesha.sh — guard against IaC placeholder overwriting the
# real DSAR Lambda code on staging Terraform apply.
#
# Audit closure 2026-05-26 row #22 (Security-Reviewer 🟡): the
# `lifecycle.ignore_changes = [filename, source_code_hash]` block on
# `aws_lambda_function "this"` (infra/modules/lambda-pii-dsar-staging/main.tf)
# DOES NOT reliably prevent re-deploy when the surrounding IAM policy
# document changes. Empirically: 2026-05-26T17:37Z apply re-wrote the
# manual deploy from `nvWZ/fiAG...` (real source) to `DLAsbw3...`
# (placeholder, 30411 bytes — silent capability degradation).
#
# This script:
# 1. Reads the deployed CodeSha256 from staging acct 525.
# 2. Compares against the placeholder zip's hash.
# 3. Exits 1 if the deployed code is the placeholder (silent regression).
#
# Usage:
#   AWS_PROFILE=myrecruiter-staging ./tools/verify-dsar-codesha.sh
# CI usage (after any staging IaC apply):
#   - Add as a post-apply step that fails the deploy if regression detected.
#   - The job that ran apply already has the AWS_PROFILE/role context.
#
# Expected state when this script runs cleanly:
#   - Deployed CodeSha256 != placeholder hash
#   - Operator may verify against an expected-known-good value if available
#     (passed as $1 — optional)
set -euo pipefail

LAMBDA_NAME="picasso-pii-dsar-staging"
PLACEHOLDER_PATH="$(dirname "$0")/../infra/modules/lambda-pii-dsar-staging/placeholder/lambda_function.py"

# Expected-known-good CodeSha256 (optional first arg). If provided, this
# script asserts the deployed code matches it. Otherwise, the script only
# detects the placeholder-regression case.
EXPECTED_CODESHA="${1:-}"

# Step 1: read deployed CodeSha256
DEPLOYED_CODESHA="$(
  aws lambda get-function-configuration \
    --function-name "$LAMBDA_NAME" \
    --query CodeSha256 \
    --output text
)"

echo "deployed CodeSha256: $DEPLOYED_CODESHA"

# Step 2: compute placeholder hash (base64 SHA256 of the zip Terraform
# would produce). The placeholder is `lambda_function.py` only; the zip
# wraps just that file. Compute the hash of an in-memory zip to compare.
if [[ -f "$PLACEHOLDER_PATH" ]]; then
  PLACEHOLDER_TMPDIR="$(mktemp -d -t placeholder-XXXXXX)"
  PLACEHOLDER_TMPZIP="$PLACEHOLDER_TMPDIR/placeholder.zip"
  rm -f "$PLACEHOLDER_TMPZIP"
  (cd "$(dirname "$PLACEHOLDER_PATH")" && zip -q "$PLACEHOLDER_TMPZIP" lambda_function.py)
  PLACEHOLDER_SHA="$(openssl dgst -sha256 -binary "$PLACEHOLDER_TMPZIP" | base64)"
  rm -rf "$PLACEHOLDER_TMPDIR"
  echo "placeholder CodeSha256: $PLACEHOLDER_SHA"
else
  echo "warning: placeholder source not found at $PLACEHOLDER_PATH; cannot self-detect regression"
  PLACEHOLDER_SHA=""
fi

# Step 3: regression check
if [[ -n "$PLACEHOLDER_SHA" && "$DEPLOYED_CODESHA" == "$PLACEHOLDER_SHA" ]]; then
  echo "❌ FAIL: deployed DSAR Lambda is the placeholder (silent regression)"
  echo "   This means a recent staging Terraform apply overwrote the real code."
  echo "   Re-deploy with: aws lambda update-function-code --function-name $LAMBDA_NAME --zip-file fileb://<your-real-zip>"
  exit 1
fi

# Step 4: optional positive assertion
if [[ -n "$EXPECTED_CODESHA" ]]; then
  if [[ "$DEPLOYED_CODESHA" != "$EXPECTED_CODESHA" ]]; then
    echo "❌ FAIL: deployed CodeSha256 ($DEPLOYED_CODESHA) does not match expected ($EXPECTED_CODESHA)"
    exit 1
  fi
  echo "✅ deployed CodeSha256 matches expected value"
else
  echo "✅ deployed DSAR Lambda is NOT the placeholder (positive expected value not asserted; pass \$1 to verify)"
fi
