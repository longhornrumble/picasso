#!/usr/bin/env bash
# Phase 1 naming-convention guard — DynamoDB tables.
#
# Fails if a PR ADDS a DynamoDB table physical name carrying an environment token
# (-staging / -production / staging- / production- / ${var.env}) that is NOT in
# scripts/naming-allowlist.txt. The AWS account boundary is the environment
# (CLAUDE.md), so new tables MUST be created with a bare picasso-<name>.
#
# Scope: name= literals in infra/modules/ddb-*/ only (the active program surface).
# Non-DDB resources are the long-term program; extend this guard when they start.
#
# Usage: scripts/check-ddb-naming.sh [BASE_REF]   (default: origin/main)
# In CI pass the PR base sha: scripts/check-ddb-naming.sh "$BASE_SHA"
set -euo pipefail

BASE="${1:-origin/main}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ALLOWLIST="${SCRIPT_DIR}/naming-allowlist.txt"
ENV_TOKEN='(-staging|-production|staging-|production-|\$\{var\.env\})'

# Added (+) physical-name assignments in DDB modules introduced by this PR.
added="$(git diff "${BASE}" HEAD -- 'infra/modules/ddb-*/' \
  | grep -E '^\+[[:space:]]*name[[:space:]]*=[[:space:]]*"' || true)"

violations=0
while IFS= read -r line; do
  [ -z "${line}" ] && continue
  val="$(printf '%s' "${line}" | sed -E 's/^\+[[:space:]]*name[[:space:]]*=[[:space:]]*"//; s/".*$//')"
  printf '%s' "${val}" | grep -qE "${ENV_TOKEN}" || continue   # only env-token names
  if grep -qxF "${val}" "${ALLOWLIST}" 2>/dev/null; then
    echo "ok (grandfathered, pending migration): ${val}"
    continue
  fi
  echo "::error::New DDB table name carries an environment token: \"${val}\". Create it bare (picasso-<name>) — the account boundary is the environment. See docs/roadmap/ENVIRONMENT_NAMING_PARITY_PLAN.md §3."
  violations=$((violations + 1))
done <<< "${added}"

if [ "${violations}" -gt 0 ]; then
  echo "FAIL: ${violations} new env-suffixed DDB table name(s) introduced."
  exit 1
fi
echo "PASS: no new env-suffixed DDB table names."
