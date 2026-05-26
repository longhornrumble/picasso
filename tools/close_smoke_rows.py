#!/usr/bin/env python3
"""M9.G7 Sprint C — close all open smoke rows in the staging audit table.

Writes a synthetic `closed` event for each `smoke-*` dsar_id that has an
open `request_received` event. After this runs, SLA monitor's
`_has_closed_event` check finds the closed event + skips these rows from
the at-risk list. F-DSAR28 closure.

Staging only (picasso-pii-dsar-audit-staging in acct 525). No prod ops.
Idempotent via PK uniqueness (dsar_id, event_timestamp) — re-running adds
new closing events at new timestamps, which is harmless (multiple closes
for one dsar are valid in the audit append-only model).
"""
import subprocess
import json
import sys
from datetime import datetime, timezone

PROFILE = 'myrecruiter-staging'
TABLE = 'picasso-pii-dsar-audit-staging'


def run_aws(args):
    cmd = ['aws', '--profile', PROFILE] + args
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        return {'__error__': True, 'stderr': r.stderr}
    return json.loads(r.stdout) if r.stdout.strip() else {}


# Find open smoke rows
res = run_aws([
    'dynamodb', 'query',
    '--table-name', TABLE,
    '--index-name', 'StatusIndex',
    '--key-condition-expression', '#s = :s',
    '--expression-attribute-names', '{"#s":"status"}',
    '--expression-attribute-values', '{":s":{"S":"in_progress"}}',
    '--output', 'json',
])
if res.get('__error__'):
    print('query failed:', res, file=sys.stderr)
    sys.exit(1)

smoke_dsars = sorted(set(
    item['dsar_id']['S']
    for item in res.get('Items', [])
    if item.get('dsar_id', {}).get('S', '').startswith('smoke-')
    and item.get('event_type', {}).get('S') == 'request_received'
))

print(f'Found {len(smoke_dsars)} smoke dsar_ids with open request_received events',
      file=sys.stderr)

closed_count = 0
errors = 0
for sid in smoke_dsars:
    # Each closing event uses a fresh microsecond-precision timestamp so PK
    # (dsar_id, event_timestamp) is unique vs the open intake's timestamp.
    now_iso = datetime.now(timezone.utc).isoformat(timespec='microseconds')
    item = {
        'dsar_id': {'S': sid},
        'event_timestamp': {'S': now_iso},
        'event_type': {'S': 'closed'},
        'status': {'S': 'completed'},
        'details': {'S': json.dumps({
            'reason': 'M9.G7 Sprint C smoke-row hygiene close (F-DSAR28)',
            'closed_by': 'M9.G7 retroactive cleanup script',
            'closed_at': now_iso,
        })},
        'created_at_partition': {'S': now_iso[:7]},
    }
    out = run_aws([
        'dynamodb', 'put-item',
        '--table-name', TABLE,
        '--item', json.dumps(item),
        '--condition-expression',
        'attribute_not_exists(dsar_id) AND attribute_not_exists(event_timestamp)',
    ])
    if out.get('__error__'):
        if 'ConditionalCheckFailedException' in out.get('stderr', ''):
            # Already had a close at this exact microsecond (impossibly rare)
            print(f'  {sid}: skipped (CCF — already closed at same ts)',
                  file=sys.stderr)
            continue
        errors += 1
        print(f'  {sid}: ERROR {out.get("stderr", "")[:200]}', file=sys.stderr)
        continue
    closed_count += 1
    print(f'  {sid}: closed', file=sys.stderr)

print(f'\nTotal: closed {closed_count}; errors {errors}; total_processed {len(smoke_dsars)}')
sys.exit(0 if errors == 0 else 1)
