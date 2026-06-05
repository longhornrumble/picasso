#!/usr/bin/env python3
"""G-A.3 — subject-index backfill for historical prod form-submissions.

Companion to `~/.claude/plans/pii-prod-cutover-GA-subject-index-2026-06-04.md`.
Stamps `pii_subject_id` onto every historical prod `picasso_form_submissions`
row that predates the subject-index writer (the rows written by the
pre-F-DSAR18 deployed code), and populates the prod subject-index table so
DSAR-by-email can resolve those subjects. Mirrors the M4.G2 prod-TTL backfill
pattern (tools/m4g2_backfill.py): operator-run, account-guarded, dry-run by
default, structured execution log on stdout.

The get-or-create + UNINDEXED rules are a faithful port of the deployed writer
(`Master_Function_Staging/pii_subject.py` / `Bedrock_Streaming_Handler_Staging/
pii_subject.js`): `normalize_email` and `extract_email` are copied VERBATIM
from pii_subject.py, and a parity test (test_ga3_subject_index_backfill.py)
replays the test_pii_subject.py vectors so the port is proven, not assumed.

Email source per row (universal across both writers, see form_handler.py:642
and form_handler.js:559):
  - BSH rows carry a `contact` map with `.email` → preferred.
  - Both writers store `form_data` (the raw responses bag) → `extract_email`
    fallback. Pre-F-DSAR18 MFS rows have NO `contact` dict, so extract_email
    is the PRIMARY path for them (not a rare fallback).

Stamp key is `submission_id` ONLY — prod `picasso_form_submissions` is
single-key (unlike staging's composite key).

NO PII IN LOGS: only submission_ids, counts, and a salted-free sha256 prefix of
`(tenant_id|normalized_email)` are emitted — never a raw email. Capture stdout
to a committed execution log (prod CloudTrail does NOT record DDB data events,
so the committed log is the only audit trail — same as M4.G2).

Usage:
  python3 ga3_subject_index_backfill.py             # DRY-RUN (default; no writes)
  python3 ga3_subject_index_backfill.py --apply     # real run (after dry-run review)
  python3 ga3_subject_index_backfill.py --index-table picasso-pii-subject-index-production
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone

PROFILE = 'myrecruiter-prod'
EXPECTED_ACCOUNT = '614056832592'  # prod-614
TABLE_FORM = 'picasso_form_submissions'
# D1 (operator 2026-06-04): canonical, no env suffix. Override for a -production
# suffix variant with --index-table if the decision is revisited.
DEFAULT_INDEX_TABLE = 'picasso-pii-subject-index'

# ---------------------------------------------------------------------------
# normalize_email + extract_email — VERBATIM PORT of pii_subject.py (lines
# 75-123). Do NOT edit independently; test_ga3_subject_index_backfill.py
# replays the test_pii_subject.py vectors to prove this stays in parity with
# the deployed writer (which is itself parity-tested against pii_subject.js).
# ---------------------------------------------------------------------------
_GMAIL_DOMAINS = {"gmail.com", "googlemail.com"}
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_EMAIL_KEY_HINTS = ("email", "e-mail", "email_address", "emailaddress")


def normalize_email(email):
    """Deterministic email normalization (PII Identity Contract §4).

    Pure function: same input -> same output. Returns ``None`` for anything that
    is not a syntactically usable address (caller still mints a subject id).
    """
    if email is None:
        return None
    e = str(email).strip()
    if not e or any(ch.isspace() for ch in e):
        return None  # internal whitespace ⇒ not a usable address (R1)
    if "@" not in e:
        return None
    local, _, domain = e.rpartition("@")
    if not local or not domain or "@" in local:  # multi-@ == malformed
        return None
    domain = domain.lower()
    local = local.lower()
    # Only Gmail's dot/plus aliasing is provider-guaranteed to deliver every
    # variant to one inbox, so only Gmail is safe to collapse.
    if domain in _GMAIL_DOMAINS:
        domain = "gmail.com"
        if "+" in local:
            local = local.split("+", 1)[0]
        local = local.replace(".", "")
    if not local:
        return None
    return f"{local}@{domain}"


def extract_email(responses):
    """Best-effort: find the submitter's email in arbitrary form responses.

    First an email-named key (case-insensitive), then the first value that looks
    like an address. Returns the raw string (caller normalizes).
    """
    if not isinstance(responses, dict):
        return None
    for key, value in responses.items():
        if isinstance(key, str) and any(h in key.lower() for h in _EMAIL_KEY_HINTS):
            if value and _EMAIL_RE.match(str(value).strip()):
                return str(value).strip()
    for value in responses.values():
        if isinstance(value, str) and _EMAIL_RE.match(value.strip()):
            return value.strip()
    return None


# ---------------------------------------------------------------------------
# AWS plumbing (subprocess CLI, pins --profile cleanly — same as m4g2_backfill)
# ---------------------------------------------------------------------------
def run_aws(args):
    """Run aws CLI with the prod profile + return parsed JSON (or __error__)."""
    cmd = ['aws', '--profile', PROFILE] + args
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return {'__error__': True, 'stderr': result.stderr, 'rc': result.returncode}
    try:
        return json.loads(result.stdout) if result.stdout.strip() else {}
    except json.JSONDecodeError:
        return {'__error__': True, 'stderr': 'invalid json', 'stdout': result.stdout}


def _assert_prod_account():
    """Account guard — abort if PROFILE doesn't resolve to prod-614. Runs FIRST,
    before any scan or write, in dry-run too (mirrors m4g2_backfill._assert_prod_account)."""
    identity = run_aws(['sts', 'get-caller-identity', '--output', 'json'])
    if identity.get('__error__'):
        raise SystemExit(
            f'ACCOUNT GUARD ABORT: sts:get-caller-identity failed via PROFILE={PROFILE}: '
            f'{identity.get("stderr", "unknown")[:300]}'
        )
    actual = identity.get('Account')
    if actual != EXPECTED_ACCOUNT:
        raise SystemExit(
            f'ACCOUNT GUARD ABORT: PROFILE={PROFILE} resolved to account {actual} '
            f'(Arn={identity.get("Arn")}); expected {EXPECTED_ACCOUNT} (prod-614). '
            f'Refusing to proceed; check ~/.aws/config + active SSO session.'
        )
    print(
        f'[{_now()}] Account guard PASSED: PROFILE={PROFILE} → Account={actual}',
        file=sys.stderr,
    )


# Lazy boto3 import — only the TypeDeserializer (a pure shape converter, no AWS
# calls). Keeps the script runnable even if boto3's credential chain is unset
# (all AWS I/O goes through the CLI subprocess + --profile).
def _deserializer():
    from boto3.dynamodb.types import TypeDeserializer
    return TypeDeserializer()


def _py(item, deser):
    """DDB-typed item -> plain python dict."""
    return {k: deser.deserialize(v) for k, v in item.items()}


def scan_form_rows(deser):
    """Scan the prod form table (paginated), return plain-python rows with the
    fields the backfill needs. Aliased projection avoids any reserved-word risk."""
    rows = []
    start_key = None
    names = {
        '#sid': 'submission_id', '#tid': 'tenant_id', '#c': 'contact',
        '#fd': 'form_data', '#psid': 'pii_subject_id',
    }
    while True:
        args = [
            'dynamodb', 'scan', '--table-name', TABLE_FORM,
            '--projection-expression', '#sid, #tid, #c, #fd, #psid',
            '--expression-attribute-names', json.dumps(names),
            '--output', 'json',
        ]
        if start_key:
            args += ['--exclusive-start-key', json.dumps(start_key)]
        out = run_aws(args)
        if out.get('__error__'):
            raise RuntimeError(f'scan failed: {out}')
        for raw in out.get('Items', []):
            rows.append(_py(raw, deser))
        start_key = out.get('LastEvaluatedKey')
        if not start_key:
            break
    return rows


def get_index(index_table, tenant_id, normalized, consistent):
    out = run_aws([
        'dynamodb', 'get-item', '--table-name', index_table,
        '--key', json.dumps({'tenant_id': {'S': tenant_id},
                             'normalized_email': {'S': normalized}}),
    ] + (['--consistent-read'] if consistent else []) + ['--output', 'json'])
    if out.get('__error__'):
        raise RuntimeError(f'index get-item failed: {out.get("stderr", "")[:200]}')
    item = out.get('Item') or {}
    sid = item.get('pii_subject_id', {}).get('S')
    return sid if isinstance(sid, str) and sid else None


def put_index(index_table, tenant_id, normalized, sid):
    """Conditional PutItem — returns 'put' | 'race' (someone won) | 'error: ...'."""
    out = run_aws([
        'dynamodb', 'put-item', '--table-name', index_table,
        '--item', json.dumps({
            'tenant_id': {'S': tenant_id},
            'normalized_email': {'S': normalized},
            'pii_subject_id': {'S': sid},
            'created_at': {'S': _now()},
        }),
        '--condition-expression', 'attribute_not_exists(normalized_email)',
        '--output', 'json',
    ])
    if out.get('__error__'):
        if 'ConditionalCheckFailedException' in out.get('stderr', ''):
            return 'race'
        return f'error: {out.get("stderr", "unknown")[:200]}'
    return 'put'


def stamp_row(submission_id, sid):
    """Stamp pii_subject_id onto the form row; idempotent (skip if already set)."""
    out = run_aws([
        'dynamodb', 'update-item', '--table-name', TABLE_FORM,
        '--key', json.dumps({'submission_id': {'S': submission_id}}),
        '--update-expression', 'SET pii_subject_id = :sid',
        '--condition-expression', 'attribute_not_exists(pii_subject_id)',
        '--expression-attribute-values', json.dumps({':sid': {'S': sid}}),
        '--output', 'json',
    ])
    if out.get('__error__'):
        if 'ConditionalCheckFailedException' in out.get('stderr', ''):
            return 'already_stamped'
        return f'error: {out.get("stderr", "unknown")[:200]}'
    return 'stamped'


# ---------------------------------------------------------------------------
def mint_pii_subject_id():
    import uuid
    return 'psub_' + uuid.uuid4().hex


def _now():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.') \
        + f'{datetime.now(timezone.utc).microsecond // 1000:03d}Z'


def _khash(tenant_id, normalized):
    """Non-PII log token: sha256(tenant|normalized) prefix. Never log raw email."""
    return hashlib.sha256(f'{tenant_id}|{normalized}'.encode()).hexdigest()[:12]


def email_for_row(row):
    """contact.email (BSH) preferred, else extract_email(form_data) (both)."""
    contact = row.get('contact')
    if isinstance(contact, dict):
        ce = contact.get('email')
        if ce and _EMAIL_RE.match(str(ce).strip()):
            return str(ce).strip()
    return extract_email(row.get('form_data') or {})


def plan_row(row, index_cache, index_table, apply, log_get):
    """Resolve one row to an action plan dict (no row-stamp write here).

    Mirrors the writer's UNINDEXED rules. In dry-run, index lookups still run
    read-only (so the dry-run plan is accurate) but no writes occur.
    """
    sid_existing = row.get('pii_subject_id')
    submission_id = row.get('submission_id')
    plan = {'submission_id': submission_id}

    if isinstance(sid_existing, str) and sid_existing:
        plan['outcome'] = 'skip_already_has_subject_id'  # new/self-indexed or prior backfill
        return plan

    if not submission_id:
        plan['outcome'] = 'skip_no_submission_id'
        return plan

    tenant_id = row.get('tenant_id')
    norm_tenant = (str(tenant_id).strip().lower() if tenant_id else '')
    if not norm_tenant or norm_tenant == 'unknown':
        plan.update(outcome='unindexed_no_tenant', sid=mint_pii_subject_id())
        return plan  # mint + stamp, NO index row (mirrors writer)

    raw = email_for_row(row)
    normalized = normalize_email(raw)
    if not normalized:
        plan.update(outcome='unindexed_no_email', sid=mint_pii_subject_id())
        return plan  # mint + stamp, NO index row

    plan['khash'] = _khash(tenant_id, normalized)
    cache_key = (tenant_id, normalized)
    if cache_key in index_cache:
        plan.update(outcome='index_cache_hit', sid=index_cache[cache_key])
        return plan

    existing = get_index(index_table, tenant_id, normalized, consistent=False)
    log_get()
    if existing:
        index_cache[cache_key] = existing
        plan.update(outcome='index_existing', sid=existing)
        return plan

    # Not yet indexed → mint a candidate; the actual conditional PUT happens in
    # the apply phase (dry-run reports the intent without writing).
    plan.update(outcome='index_create', sid=mint_pii_subject_id())
    return plan


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--apply', action='store_true',
                        help='Execute writes. Default is DRY-RUN (no writes).')
    parser.add_argument('--index-table', default=DEFAULT_INDEX_TABLE,
                        help=f'Subject-index table name (default {DEFAULT_INDEX_TABLE}).')
    args = parser.parse_args()
    apply = args.apply
    index_table = args.index_table

    _assert_prod_account()

    log = {
        'start_ts': _now(),
        'mode': 'apply' if apply else 'dry-run',
        'profile': PROFILE,
        'expected_account': EXPECTED_ACCOUNT,
        'form_table': TABLE_FORM,
        'index_table': index_table,
    }

    print(f'[{_now()}] Scanning prod {TABLE_FORM}...', file=sys.stderr)
    deser = _deserializer()
    rows = scan_form_rows(deser)
    log['scanned_rows'] = len(rows)
    print(f'[{_now()}] Scanned {len(rows)} rows', file=sys.stderr)

    index_cache = {}
    gets = {'n': 0}

    def log_get():
        gets['n'] += 1

    # Pass 1: build the plan (read-only).
    plans = [plan_row(r, index_cache, index_table, apply, log_get) for r in rows]
    log['index_gets'] = gets['n']

    # Apply writes need the (tenant_id, normalized) key, which the plan does not
    # retain (only a khash, to keep PII out of the plan). _execute re-walks the
    # rows so the key is in-hand for the conditional index PUT.
    if apply:
        _execute(rows, plans, index_table, index_cache, log)
    else:
        # Dry-run tallies straight from the plan.
        log['tally'] = _tally(plans)
        log['end_ts'] = _now()
        log['result'] = 'dry-run-complete'
        print(json.dumps(log, indent=2))
        return 0

    log['end_ts'] = _now()
    log['post_condition_missing_subject_id'] = _post_condition_count()
    log['post_condition_pass'] = log['post_condition_missing_subject_id'] == 0
    log['result'] = ('apply-complete'
                     if log['post_condition_pass'] and log['tally'].get('errors', 0) == 0
                     else 'apply-with-issues')
    print(json.dumps(log, indent=2))
    return 0 if log['result'] == 'apply-complete' else 1


def _execute(rows, plans, index_table, index_cache, log):
    """Second walk (apply): create index rows where planned, then stamp rows."""
    by_sub = {r.get('submission_id'): r for r in rows}
    results = []
    for p in plans:
        sub = p['submission_id']
        outcome = p['outcome']
        if outcome.startswith('skip_'):
            results.append(outcome)
            continue
        sid = p['sid']

        if outcome == 'index_create':
            row = by_sub.get(sub, {})
            tenant_id = row.get('tenant_id')
            normalized = normalize_email(email_for_row(row))
            put = put_index(index_table, tenant_id, normalized, sid)
            if put == 'race':
                # Someone (a concurrent G-A.2 writer or a re-run) won — adopt theirs.
                won = get_index(index_table, tenant_id, normalized, consistent=True)
                if won:
                    sid = won
                    index_cache[(tenant_id, normalized)] = won
            elif put.startswith('error:'):
                results.append(f'index_{put}')
                print(f'  {sub} → index PUT {put}', file=sys.stderr)
                continue
            else:
                index_cache[(tenant_id, normalized)] = sid

        st = stamp_row(sub, sid)
        results.append(f'{outcome}:{st}')
        token = p.get('khash', '-')
        print(f'  {sub:<50s} {outcome:<22s} stamp={st} khash={token}', file=sys.stderr)

    log['results'] = results
    log['tally'] = _tally_results(results)


def _tally(plans):
    t = {}
    for p in plans:
        t[p['outcome']] = t.get(p['outcome'], 0) + 1
    return t


def _tally_results(results):
    t = {'stamped': 0, 'already_stamped': 0, 'unindexed': 0, 'errors': 0, 'skipped': 0}
    for r in results:
        if r.startswith('skip_'):
            t['skipped'] += 1
        elif 'error' in r:
            t['errors'] += 1
        elif r.endswith(':stamped'):
            t['stamped'] += 1
            if r.startswith('unindexed'):
                t['unindexed'] += 1
        elif r.endswith(':already_stamped'):
            t['already_stamped'] += 1
    return t


def _post_condition_count():
    """Count form rows STILL missing pii_subject_id (expect 0 after apply)."""
    out = run_aws([
        'dynamodb', 'scan', '--table-name', TABLE_FORM,
        '--filter-expression', 'attribute_not_exists(pii_subject_id)',
        '--select', 'COUNT', '--output', 'json',
    ])
    if out.get('__error__'):
        raise RuntimeError(f'post-condition scan failed: {out}')
    return out.get('Count', -1)


if __name__ == '__main__':
    sys.exit(main())
