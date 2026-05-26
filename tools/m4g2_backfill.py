#!/usr/bin/env python3
"""M4.G2 prod TTL backfill — one-shot per the §6 spec.

Reads picasso_form_submissions in prod-614, computes ttl = submitted_at + 365d
for each row missing ttl, writes via UpdateItem with idempotency guard.

Usage:
  python3 m4g2_backfill.py --dry-run   # no writes; prints plan
  python3 m4g2_backfill.py             # real run (must be after dry-run review)

Output: structured execution log on stdout (capture to file per §6.7).
"""
import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone, timedelta

PROFILE = 'myrecruiter-prod'
TABLE = 'picasso_form_submissions'
BASELINE = 46  # §2 baseline candidate count

# Sprint F3 / audit-of-audit finding 3 (Security 🟡): account guard.
# The hardcoded PROFILE relies on ~/.aws/config resolving to prod-614, but a
# future operator with a misconfigured profile (or a stale assumed role
# carrying different credentials) could silently target the wrong account.
# `_assert_prod_account()` calls sts:get-caller-identity and aborts if the
# resolved account isn't prod-614 BEFORE any write loop runs. Mirrors the
# pattern in picasso_pii_dsar_staging/lambda_function.py:_assert_account.
EXPECTED_ACCOUNT = '614056832592'  # prod-614


def run_aws(args):
    """Run aws CLI with the prod profile + return parsed JSON."""
    cmd = ['aws', '--profile', PROFILE] + args
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return {'__error__': True, 'stderr': result.stderr, 'rc': result.returncode}
    try:
        return json.loads(result.stdout) if result.stdout.strip() else {}
    except json.JSONDecodeError:
        return {'__error__': True, 'stderr': 'invalid json', 'stdout': result.stdout}


def _assert_prod_account():
    """Sprint F3 / audit-of-audit finding 3: account guard.

    Calls sts:get-caller-identity via the configured PROFILE and aborts the
    script if the resolved account isn't EXPECTED_ACCOUNT (prod-614). Run
    BEFORE any write loop so a misconfigured profile cannot trigger
    UpdateItem against the wrong account.
    """
    identity = run_aws(['sts', 'get-caller-identity', '--output', 'json'])
    if identity.get('__error__'):
        raise SystemExit(
            f'ACCOUNT GUARD ABORT: sts:get-caller-identity failed via PROFILE={PROFILE}: '
            f'{identity.get("stderr", "unknown")[:300]}'
        )
    actual = identity.get('Account')
    if actual != EXPECTED_ACCOUNT:
        raise SystemExit(
            f'ACCOUNT GUARD ABORT: PROFILE={PROFILE} resolved to account '
            f'{actual} (Arn={identity.get("Arn")}); expected {EXPECTED_ACCOUNT} '
            f'(prod-614). Refusing to proceed; check ~/.aws/config + active '
            f'SSO session.'
        )
    print(
        f'[{datetime.now(timezone.utc).isoformat()}] Account guard PASSED: '
        f'PROFILE={PROFILE} → Account={actual} ({identity.get("Arn")})',
        file=sys.stderr,
    )


def scan_missing_ttl():
    """Scan prod table for rows missing ttl; return list of items."""
    out = run_aws([
        'dynamodb', 'scan',
        '--table-name', TABLE,
        '--projection-expression', 'submission_id, submitted_at, #ttl',
        '--expression-attribute-names', '{"#ttl":"ttl"}',
        '--output', 'json',
    ])
    if out.get('__error__'):
        raise RuntimeError(f'scan failed: {out}')
    return [item for item in out.get('Items', []) if 'ttl' not in item]


def post_condition_count():
    """§7 post-condition: scan + count of rows still missing ttl."""
    out = run_aws([
        'dynamodb', 'scan',
        '--table-name', TABLE,
        '--filter-expression', 'attribute_not_exists(#ttl)',
        '--expression-attribute-names', '{"#ttl":"ttl"}',
        '--select', 'COUNT',
        '--output', 'json',
    ])
    if out.get('__error__'):
        raise RuntimeError(f'post-condition scan failed: {out}')
    return out.get('Count', -1)


def update_one_ttl(submission_id, new_ttl_epoch):
    """UpdateItem for a single row; idempotent via ConditionExpression."""
    out = run_aws([
        'dynamodb', 'update-item',
        '--table-name', TABLE,
        '--key', json.dumps({'submission_id': {'S': submission_id}}),
        '--update-expression', 'SET #ttl = :ttl',
        '--condition-expression', 'attribute_not_exists(#ttl)',
        '--expression-attribute-names', json.dumps({'#ttl': 'ttl'}),
        '--expression-attribute-values', json.dumps({':ttl': {'N': str(new_ttl_epoch)}}),
        '--output', 'json',
    ])
    if out.get('__error__'):
        if 'ConditionalCheckFailedException' in out.get('stderr', ''):
            return 'already_had_ttl'
        return f'error: {out.get("stderr", "unknown")[:200]}'
    return 'updated'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true',
                        help='No writes; print the plan only')
    args = parser.parse_args()

    # Sprint F3 / audit-of-audit finding 3: account guard runs FIRST, before
    # any scan or write. Fails fast if PROFILE resolves to the wrong account.
    # Runs even in dry-run mode (read-only Scan also costs DDB RCU on the
    # wrong account, even if no rows are written).
    _assert_prod_account()

    log = {
        'start_ts': datetime.now(timezone.utc).isoformat(),
        'mode': 'dry-run' if args.dry_run else 'real-run',
        'profile': PROFILE,
        'expected_account': EXPECTED_ACCOUNT,
        'table': TABLE,
        'baseline_count': BASELINE,
    }

    # Sprint 3 step 1: re-scan
    print(f'[{datetime.now(timezone.utc).isoformat()}] Re-scanning prod for rows missing ttl...',
          file=sys.stderr)
    candidates = scan_missing_ttl()
    log['rescan_count'] = len(candidates)
    log['drift_delta'] = len(candidates) - BASELINE

    print(f'[{datetime.now(timezone.utc).isoformat()}] '
          f'Re-scan: {len(candidates)} candidates (baseline §2 = {BASELINE}; '
          f'drift = {log["drift_delta"]:+d})', file=sys.stderr)

    # Per §6 step 1: proceed against live re-scan set; log drift; do not halt
    rows = []
    for item in candidates:
        sid = item['submission_id']['S']
        ts_raw = item.get('submitted_at', {}).get('S')
        if not ts_raw:
            rows.append({'sid': sid, 'outcome': 'skip_no_submitted_at'})
            continue
        try:
            ts = datetime.fromisoformat(ts_raw.replace('Z', '+00:00'))
        except Exception as e:
            rows.append({'sid': sid, 'outcome': f'skip_parse_error: {e}',
                         'submitted_at': ts_raw})
            continue
        new_ttl = int((ts + timedelta(days=365)).timestamp())
        evicts_at = (ts + timedelta(days=365)).isoformat()
        rows.append({'sid': sid, 'submitted_at': ts_raw,
                     'new_ttl_epoch': new_ttl, 'evicts_at': evicts_at,
                     'outcome': 'planned'})

    log['rows'] = rows

    if args.dry_run:
        log['end_ts'] = datetime.now(timezone.utc).isoformat()
        log['result'] = 'dry-run-complete'
        print(json.dumps(log, indent=2))
        return 0

    # Real run: execute updates
    print(f'[{datetime.now(timezone.utc).isoformat()}] '
          f'Executing {len([r for r in rows if r["outcome"] == "planned"])} UpdateItem calls...',
          file=sys.stderr)
    for r in rows:
        if r['outcome'] != 'planned':
            continue
        outcome = update_one_ttl(r['sid'], r['new_ttl_epoch'])
        r['outcome'] = outcome
        print(f'  {r["sid"]:<55s} → {outcome}', file=sys.stderr)

    # Final tallies
    updated = sum(1 for r in rows if r['outcome'] == 'updated')
    already_had = sum(1 for r in rows if r['outcome'] == 'already_had_ttl')
    skipped = sum(1 for r in rows if r['outcome'].startswith('skip_'))
    errors = sum(1 for r in rows if r['outcome'].startswith('error:'))

    log['tally'] = {
        'updated': updated,
        'already_had_ttl': already_had,
        'skipped': skipped,
        'errors': errors,
        'total_processed': len(rows),
    }

    # §7 post-condition
    print(f'[{datetime.now(timezone.utc).isoformat()}] §7 post-condition verifying...',
          file=sys.stderr)
    post_count = post_condition_count()
    log['post_condition_count'] = post_count
    log['post_condition_pass'] = post_count == 0

    log['end_ts'] = datetime.now(timezone.utc).isoformat()
    log['result'] = 'real-run-complete' if errors == 0 else 'real-run-with-errors'

    print(json.dumps(log, indent=2))
    return 0 if errors == 0 and post_count == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
