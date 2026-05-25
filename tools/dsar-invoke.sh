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
#     to type "DELETE PROD" verbatim on an interactive TTY (refuses piped stdin).
#   - Otherwise hands off to `aws lambda invoke`; output goes to /tmp/dsar-out.json.
#
# M9.G4 Sprint G1 hardening (phase-completion-audit fix-now 2026-05-24):
#   - AWS_PROFILE env-var promotion warning (audit row 4)
#   - --function per-account allowlist (audit row 5)
#   - python3 availability check + JSON pre-validation (audit row 6)
#   - --out path /tmp warning (audit row 7)
#   - TTY guard + `< /dev/tty` on prod confirm (audit row 1)
#   - PII stdout-leak warning comment (audit row 16)
#   - Pre-invoke audit log line (audit row 17)

set -euo pipefail

# Capture env-var profile separately so we can warn if it silently promotes to prod.
PROFILE_FROM_ENV="${AWS_PROFILE:-}"
PROFILE="${AWS_PROFILE:-myrecruiter-staging}"
PROFILE_EXPLICIT=0
FUNCTION=""
PAYLOAD=""
COMMIT=0
OUT_FILE="/tmp/dsar-out.json"

ACCOUNT_STAGING="525409062831"
ACCOUNT_PROD="614056832592"
ALLOWED_FN_STAGING="picasso-pii-dsar-staging"
ALLOWED_FN_PROD="picasso-pii-dsar-production"
AUDIT_LOG="/tmp/dsar-wrapper-audit.log"

while [ $# -gt 0 ]; do
  case "$1" in
    --commit)    COMMIT=1; shift ;;
    --profile)   PROFILE="$2"; PROFILE_EXPLICIT=1; shift 2 ;;
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

# Audit row 6a: python3 must exist before we attempt JSON edits.
command -v python3 >/dev/null 2>&1 || {
  echo "❌ python3 required (used to validate + edit --payload JSON)" >&2; exit 2
}

if [ -z "$PAYLOAD" ]; then
  echo "❌ --payload <json> required" >&2; exit 2
fi

# Audit row 6b: pre-validate JSON shape with a clear message before any AWS call.
python3 -c "import json,sys; json.loads(sys.argv[1])" "$PAYLOAD" 2>/dev/null || {
  echo "❌ --payload is not valid JSON" >&2; exit 2
}

# Audit row 7: warn if --out is outside /tmp/ — Lambda response can contain PII.
case "$OUT_FILE" in
  /tmp/*) ;;
  *) echo "⚠️  --out '$OUT_FILE' is outside /tmp — DSAR responses may contain PII; ensure handling per policy" >&2 ;;
esac

# 1. Account guard. sts get-caller-identity is the source of truth — the profile
# name is a label, the account ID is what matters for "am I about to touch prod".
ACCT=$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text 2>/dev/null) || {
  echo "❌ sts get-caller-identity failed for profile=$PROFILE — check SSO login" >&2; exit 1
}

case "$ACCT" in
  "$ACCOUNT_STAGING")
    ENV_LABEL="STAGING (acct 525)"
    : "${FUNCTION:=$ALLOWED_FN_STAGING}"
    ;;
  "$ACCOUNT_PROD")
    ENV_LABEL="PROD (acct 614)"
    : "${FUNCTION:=$ALLOWED_FN_PROD}"
    # Audit row 4: warn if profile was promoted to prod by env var (not --flag).
    if [ "$PROFILE_EXPLICIT" -eq 0 ] && [ -n "$PROFILE_FROM_ENV" ]; then
      echo "⚠️  AWS_PROFILE env var → PROD (no --profile flag); pass --profile $PROFILE explicitly to suppress this warning." >&2
    fi
    echo "⚠️  Profile $PROFILE → account 614. No prod DSAR Lambda is deployed today;"
    echo "   for prod DSARs, use the manual-walk procedures in dsar-operator-playbook.md §3.1/§4.1/§6.1."
    echo "   Continuing in case a prod twin has been deployed since the wrapper was written."
    ;;
  *)
    echo "❌ Account $ACCT is neither staging (525) nor prod (614) — refusing" >&2; exit 1 ;;
esac

# Audit row 5: function name must be in per-account allowlist.
case "$ACCT" in
  "$ACCOUNT_STAGING")
    if [ "$FUNCTION" != "$ALLOWED_FN_STAGING" ]; then
      echo "❌ --function '$FUNCTION' not in staging allowlist (expected: $ALLOWED_FN_STAGING)" >&2; exit 1
    fi ;;
  "$ACCOUNT_PROD")
    if [ "$FUNCTION" != "$ALLOWED_FN_PROD" ]; then
      echo "❌ --function '$FUNCTION' not in prod allowlist (expected: $ALLOWED_FN_PROD)" >&2; exit 1
    fi ;;
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
    # Audit row 1: TTY guard + read from /dev/tty to defeat piped stdin
    # bypass (`echo "DELETE PROD" | wrapper --commit ...` would otherwise
    # silently satisfy the confirmation).
    if [ ! -t 0 ]; then
      echo "❌ Stdin is not a terminal — DELETE PROD confirmation requires interactive TTY" >&2; exit 1
    fi
    echo "Type 'DELETE PROD' to proceed; anything else aborts:"
    read -r CONFIRM < /dev/tty
    if [ "$CONFIRM" != "DELETE PROD" ]; then
      echo "❌ Aborted (no match)" >&2; exit 1
    fi
  fi
fi

# Audit row 17: pre-invoke authorization log line. Persists even if the
# subsequent `aws lambda invoke` crashes / network-partitions — durable record
# that the operator authorized the action. Complements CloudTrail (which logs
# the invoke if it reaches AWS).
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) wrapper_authorized commit=$COMMIT acct=$ACCT function=$FUNCTION out=$OUT_FILE" >> "$AUDIT_LOG"

echo "▶  Invoking $FUNCTION in $ENV_LABEL ..."
aws lambda invoke \
  --profile "$PROFILE" \
  --function-name "$FUNCTION" \
  --payload "$PAYLOAD" \
  --cli-binary-format raw-in-base64-out \
  "$OUT_FILE" >/dev/null

echo "✅ Output → $OUT_FILE"
# Audit row 16: pretty-print may contain consumer PII (form_data, email, etc.)
# in access-path responses. Operator should be aware: terminal scrollback +
# shell history may capture this. Redirect or `--out /tmp/<file>` + `cat` later
# if PII exposure to terminal is a concern.
python3 -m json.tool "$OUT_FILE" 2>/dev/null || cat "$OUT_FILE"
