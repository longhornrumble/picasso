#!/usr/bin/env bash
#
# tools/dsar-invoke.sh — safety wrapper for `aws lambda invoke` on the DSAR Lambda.
#
# M9.G4 / F-DSAR20 closure (phase-completion-audit security 🔴 2026-05-23):
# add mandatory dry-run default + account guard + explicit prod confirmation
# before any write operation. Forward-looking: the DSAR Lambda is staging-only
# today (picasso-pii-dsar-staging in acct 525); a prod-twin is not yet
# deployed. This wrapper enforces safety today (staging) and prepares for prod
# (when a prod twin eventually ships, the same wrapper protects it).
#
# Usage:
#   ./tools/dsar-invoke.sh --payload '<json>'           # dry-run (default)
#   ./tools/dsar-invoke.sh --commit --payload '<json>'  # actually delete (extra prompts on prod)
#   ./tools/dsar-invoke.sh --profile myrecruiter-prod --commit --payload '<json>'
#
# Behavior:
#   - Confirms AWS profile resolves to an expected account (525 staging, 614 prod).
#   - Forces dry_run=true in the payload unless --commit is passed.
#   - With --commit on prod (acct 614): prints a banner + requires the operator
#     to type "DELETE PROD" verbatim to proceed.
#   - Otherwise hands off to `aws lambda invoke`; output goes to /tmp/dsar-out.json.

set -euo pipefail

PROFILE="${AWS_PROFILE:-myrecruiter-staging}"
FUNCTION=""
PAYLOAD=""
COMMIT=0
OUT_FILE="/tmp/dsar-out.json"

ACCOUNT_STAGING="525409062831"
ACCOUNT_PROD="614056832592"

while [ $# -gt 0 ]; do
  case "$1" in
    --commit)    COMMIT=1; shift ;;
    --profile)   PROFILE="$2"; shift 2 ;;
    --function)  FUNCTION="$2"; shift 2 ;;
    --payload)   PAYLOAD="$2"; shift 2 ;;
    --out)       OUT_FILE="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "❌ Unknown flag: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$PAYLOAD" ]; then
  echo "❌ --payload <json> required" >&2; exit 2
fi

# 1. Account guard. sts get-caller-identity is the source of truth — the profile
# name is a label, the account ID is what matters for "am I about to touch prod".
ACCT=$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text 2>/dev/null) || {
  echo "❌ sts get-caller-identity failed for profile=$PROFILE — check SSO login" >&2; exit 1
}

case "$ACCT" in
  "$ACCOUNT_STAGING")
    ENV_LABEL="STAGING (acct 525)"
    : "${FUNCTION:=picasso-pii-dsar-staging}"
    ;;
  "$ACCOUNT_PROD")
    ENV_LABEL="PROD (acct 614)"
    : "${FUNCTION:=picasso-pii-dsar-production}"
    echo "⚠️  Profile $PROFILE → account 614. No prod DSAR Lambda is deployed today;"
    echo "   for prod DSARs, use the manual-walk procedures in dsar-operator-playbook.md §3.1/§4.1/§6.1."
    echo "   Continuing in case a prod twin has been deployed since the wrapper was written."
    ;;
  *)
    echo "❌ Account $ACCT is neither staging (525) nor prod (614) — refusing" >&2; exit 1 ;;
esac

# 2. Dry-run enforcement. The Lambda defaults to dry_run=true, but the operator
# may have set false in their payload — we strip that and force true unless
# --commit. (Uses python3 for reliable JSON edit; jq would also work.)
if [ "$COMMIT" -eq 0 ]; then
  PAYLOAD=$(python3 -c "import json,sys; p=json.loads(sys.argv[1]); p['dry_run']=True; print(json.dumps(p))" "$PAYLOAD")
  echo "🛡  dry_run forced to TRUE (default). Pass --commit to actually mutate."
else
  PAYLOAD=$(python3 -c "import json,sys; p=json.loads(sys.argv[1]); p['dry_run']=False; print(json.dumps(p))" "$PAYLOAD")
  if [ "$ACCT" = "$ACCOUNT_PROD" ]; then
    echo ""
    echo "════════════════════════════════════════════════════════════════════"
    echo "⚠️  ⚠️  ⚠️   YOU ARE TARGETING PROD (account 614)   ⚠️  ⚠️  ⚠️"
    echo "════════════════════════════════════════════════════════════════════"
    echo "Function: $FUNCTION"
    echo "Payload:  $PAYLOAD"
    echo ""
    echo "Type 'DELETE PROD' to proceed; anything else aborts:"
    read -r CONFIRM
    if [ "$CONFIRM" != "DELETE PROD" ]; then
      echo "❌ Aborted (no match)" >&2; exit 1
    fi
  fi
fi

echo "▶  Invoking $FUNCTION in $ENV_LABEL ..."
aws lambda invoke \
  --profile "$PROFILE" \
  --function-name "$FUNCTION" \
  --payload "$PAYLOAD" \
  --cli-binary-format raw-in-base64-out \
  "$OUT_FILE" >/dev/null

echo "✅ Output → $OUT_FILE"
python3 -m json.tool "$OUT_FILE" 2>/dev/null || cat "$OUT_FILE"
