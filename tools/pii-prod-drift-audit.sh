#!/usr/bin/env bash
# M9.G5 Step 1 — prod PII table drift audit (read-only).
#
# Compares prod-614 PII table configurations (TTL, PITR, SSE, deletion-protection)
# against the staging IaC expected state under infra/modules/ddb-*. Read-only:
# only DescribeTable / DescribeTimeToLive / DescribeContinuousBackups are issued.
# No mutations. No data Scans.
#
# Surfaces audited (per dsar-operator-playbook.md §3.1 substitution table):
#   picasso_form_submissions
#   picasso-notification-sends
#   picasso-notification-events
#   production-recent-messages
#   picasso-session-summaries
#
# Usage:
#   ./tools/pii-prod-drift-audit.sh                       # default profile myrecruiter-prod
#   AWS_PROFILE=myrecruiter-prod ./tools/pii-prod-drift-audit.sh
#
# Exit codes:
#   0 — script ran; drift report on stdout (drift may or may not exist).
#   2 — pre-flight failure (wrong account, missing SSO, python3 missing).

set -euo pipefail

PROFILE="${AWS_PROFILE:-myrecruiter-prod}"
EXPECTED_ACCT="614056832592"

command -v python3 >/dev/null 2>&1 || { echo "❌ python3 required for JSON parsing" >&2; exit 2; }

ACCT=$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text 2>/dev/null) || {
  echo "❌ STOP — cannot read account; profile=$PROFILE may need: aws sso login --profile $PROFILE" >&2
  exit 2
}
[ "$ACCT" = "$EXPECTED_ACCT" ] || {
  echo "❌ STOP — wrong account ($ACCT); expected $EXPECTED_ACCT (prod). Set AWS_PROFILE=myrecruiter-prod." >&2
  exit 2
}

cat <<EOF
# PII Prod Drift Audit Report

**Account**: $ACCT (prod-614)
**Profile**: $PROFILE
**Generated**: $(date -u +%Y-%m-%dT%H:%M:%SZ)

**Method**: read-only \`describe-table\` + \`describe-time-to-live\` + \`describe-continuous-backups\` against the 5 prod PII surfaces named in \`dsar-operator-playbook.md\` §3.1 substitution table. Expected-state derived from staging IaC modules under \`infra/modules/ddb-*\`.

## Findings table

| Prod table | TTL (expected) | TTL (actual) | PITR (expected) | PITR (actual) | SSE (expected) | SSE (actual) | DelProt (expected) | DelProt (actual) | Drift? |
|---|---|---|---|---|---|---|---|---|---|
EOF

# Expected state derived from infra/modules/ddb-*/main.tf:
#   ttl_expected = "enabled:<attr>" or "disabled"
#   pitr_expected = "enabled" or "disabled"
#   sse_expected = "default" (AWS-owned; no server_side_encryption block in IaC) or "kms:<alias>"
#   delprot_expected = "disabled" (none of the IaC modules set deletion_protection_enabled)
EXPECTED='picasso_form_submissions|enabled:ttl|enabled|default|disabled
picasso-notification-sends|enabled:ttl|enabled|default|disabled
picasso-notification-events|enabled:ttl|enabled|default|disabled
production-recent-messages|disabled|enabled|default|disabled
picasso-session-summaries|enabled:ttl|enabled|default|disabled'

drift_count=0
total=0

while IFS='|' read -r prod_table ttl_exp pitr_exp sse_exp delprot_exp; do
  [ -z "$prod_table" ] && continue
  total=$((total+1))

  desc=$(aws dynamodb describe-table --table-name "$prod_table" --profile "$PROFILE" --output json 2>/dev/null) || {
    echo "| \`$prod_table\` | $ttl_exp | ❌ table-missing | $pitr_exp | — | $sse_exp | — | $delprot_exp | — | **YES** (table not found) |"
    drift_count=$((drift_count+1))
    continue
  }

  sse_act=$(echo "$desc" | python3 -c "
import sys, json
d = json.load(sys.stdin)
sse = d['Table'].get('SSEDescription')
if not sse or sse.get('Status') is None:
    print('default')
else:
    print(f\"{sse.get('SSEType','?')}:{sse.get('KMSMasterKeyArn','')}\")
")

  delprot_act=$(echo "$desc" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('enabled' if d['Table'].get('DeletionProtectionEnabled') else 'disabled')
")

  ttl_desc=$(aws dynamodb describe-time-to-live --table-name "$prod_table" --profile "$PROFILE" --output json 2>/dev/null) || ttl_desc='{"TimeToLiveDescription":{}}'
  ttl_act=$(echo "$ttl_desc" | python3 -c "
import sys, json
d = json.load(sys.stdin).get('TimeToLiveDescription', {})
s = d.get('TimeToLiveStatus', 'DISABLED')
a = d.get('AttributeName', '')
if s == 'DISABLED':
    print('disabled')
elif a:
    print(f'enabled:{a}')
else:
    print('enabled:?')
")

  pitr_desc=$(aws dynamodb describe-continuous-backups --table-name "$prod_table" --profile "$PROFILE" --output json 2>/dev/null) || pitr_desc='{}'
  pitr_act=$(echo "$pitr_desc" | python3 -c "
import sys, json
d = json.load(sys.stdin)
p = d.get('ContinuousBackupsDescription', {}).get('PointInTimeRecoveryDescription', {})
print('enabled' if p.get('PointInTimeRecoveryStatus') == 'ENABLED' else 'disabled')
")

  drift="NO"
  if [ "$ttl_exp" != "$ttl_act" ] || [ "$pitr_exp" != "$pitr_act" ] || [ "$sse_exp" != "$sse_act" ] || [ "$delprot_exp" != "$delprot_act" ]; then
    drift="**YES**"
    drift_count=$((drift_count+1))
  fi

  echo "| \`$prod_table\` | $ttl_exp | $ttl_act | $pitr_exp | $pitr_act | $sse_exp | $sse_act | $delprot_exp | $delprot_act | $drift |"
done <<< "$EXPECTED"

cat <<EOF

## Summary

**Total drift findings**: $drift_count of $total surfaces.

EOF

if [ "$drift_count" -eq 0 ]; then
  echo "✅ All $total prod PII surfaces match staging IaC expected state across TTL + PITR + SSE + DeletionProtection."
else
  echo "⚠️  Drift detected; see findings table above. Each drift row should be classified as one of:"
  echo "- **(a) acceptable historical pattern** (record rationale; no action)"
  echo "- **(b) fix-now** via prod Terraform import or explicit cutover work"
  echo "- **(c) accept-with-named-trigger** (record trigger condition + calendar backstop)"
fi

cat <<EOF

## Sub-scope follow-ups (per audit-of-audit v0.21 — M9.G5 Step 1.5+)

Beyond the 5-surface DDB config drift check above, F-DSAR21 scope (post-2026-05-24 audit-of-audit expansion) also includes:

- **Sprint B placeholder-body anomaly** — staging DSAR Lambda returned placeholder-shaped response body despite CodeSha256 matching expected (\`2tQsnrZ9vA0V7DJQH+1RBPgAF0XDbKY/d31OXChgvtg=\`). Separate investigation needed — likely a Lambda env-var-driven code path or a wrapper hand-off mismatch, not a DDB drift.
- **Python+Node writer-pair enumeration** — list all surfaces with dual writers (BSH Node, MFS Python) and confirm wire-format parity is currently held (contract tests cover form_submissions + audit-table; enumerate remaining pairs).
- **Audit-table CloudTrail data-events config** — confirm \`picasso-pii-dsar-audit-staging\` is named in the staging-525 CloudTrail \`data-events\` selector OR document that it isn't, with rationale (operator-only writes today; tamper visibility relies on the 4-action append-only resource policy).
- **Prod CloudTrail → CW Logs export** — investigate enabling \`myrecruiter-management-events\` \`CloudWatchLogsLogGroupArn\` for prod UpdateTimeToLive alarming (sub-item routed here from M9.G7 closure).

These are M9.G5 sub-step targets, NOT part of Step 1 (this script). They each require their own scoped investigation.
EOF
