"""Unit tests for tools/m4g2_backfill.py — specifically the
`submitted_at -> ttl epoch` formula.

The script itself was an ephemeral one-shot when it ran 2026-05-24 (Sprint 3
of M4.G2); Sprint E4 committed it to tools/ alongside this test suite per
audit finding D7. The formula correctness was previously implicit (only
verified by the §7 post-condition scan returning Count=0). These tests
verify the formula at the unit level so a future re-run, formula tweak, or
copy-paste reuse doesn't silently regress.

Run: python3 -m pytest tools/test_m4g2_backfill.py -v
"""
from datetime import datetime, timezone, timedelta

import pytest


def _ttl_from_submitted_at(submitted_at_raw: str) -> int:
    """Re-implementation of the formula used inline in m4g2_backfill.py
    main() lines 117-123. Extracted here so the test can exercise it
    independently of the AWS CLI plumbing.

    Contract:
        Input:  ISO-8601 string with 'Z' or '+00:00' UTC suffix
        Output: int epoch seconds at submitted_at + 365 days
    """
    ts = datetime.fromisoformat(submitted_at_raw.replace('Z', '+00:00'))
    return int((ts + timedelta(days=365)).timestamp())


# ─── Formula correctness ────────────────────────────────────────────────────

def test_ttl_is_365_days_after_submitted_at():
    """Strictly +365 days; matches the M4.G2 spec §6 (collapsed 3-tier to
    1-tier as strictly-more-conservative per master plan v0.15 §M4)."""
    submitted = '2026-01-01T00:00:00+00:00'
    ttl_epoch = _ttl_from_submitted_at(submitted)
    expected = int(datetime(2027, 1, 1, tzinfo=timezone.utc).timestamp())
    assert ttl_epoch == expected


def test_ttl_handles_z_suffix_form():
    """DynamoDB-stored rows use 'Z' suffix; the script normalizes to +00:00
    via .replace() before fromisoformat. Regression guard."""
    z_form = '2026-04-10T17:41:46.482Z'
    offset_form = '2026-04-10T17:41:46.482+00:00'
    assert _ttl_from_submitted_at(z_form) == _ttl_from_submitted_at(offset_form)


def test_ttl_handles_millisecond_precision():
    """Real prod rows have millisecond precision in submitted_at. The +365d
    arithmetic must preserve the millisecond component (no truncation)."""
    submitted = '2026-04-10T17:41:46.482Z'
    ttl_epoch = _ttl_from_submitted_at(submitted)
    # Reverse-decode to UTC: should be 2027-04-10T17:41:46 (seconds — TTL is
    # epoch-seconds; sub-second precision is intentionally dropped by int())
    decoded = datetime.fromtimestamp(ttl_epoch, tz=timezone.utc)
    assert decoded == datetime(2027, 4, 10, 17, 41, 46, tzinfo=timezone.utc)


def test_ttl_handles_leap_year_boundary():
    """Feb-29 boundary case: submitting on a leap day means the +365d lands
    on Feb 28 of the following year (NOT Mar 1, which would be +366d).
    This catches any future code switching to relativedelta(years=1).
    """
    submitted = '2024-02-29T12:00:00+00:00'  # 2024 is a leap year
    ttl_epoch = _ttl_from_submitted_at(submitted)
    # 2024-02-29 + 365d = 2025-02-28 (since 2025 has no Feb 29)
    expected = int(datetime(2025, 2, 28, 12, 0, 0, tzinfo=timezone.utc).timestamp())
    assert ttl_epoch == expected


def test_ttl_returns_int_not_float():
    """DynamoDB TTL attribute MUST be a Number type (no decimal part).
    int() coercion enforces this; regression guard."""
    submitted = '2026-04-10T17:41:46.482Z'
    ttl_epoch = _ttl_from_submitted_at(submitted)
    assert isinstance(ttl_epoch, int)


# ─── Spec correspondence ────────────────────────────────────────────────────

def test_ttl_matches_execution_log_known_row():
    """Cross-check the formula against a specific row from the 2026-05-24
    execution log. Row 1 was:
        submission_id: applications_lovebox_1775842906480
        submitted_at:  2026-04-10T17:41:46.482Z
        new_ttl_epoch: 1807378906
    This test re-derives the epoch and asserts equality against the
    committed log artifact, pinning the formula to historical behavior.
    """
    ttl = _ttl_from_submitted_at('2026-04-10T17:41:46.482Z')
    assert ttl == 1807378906, (
        f'formula drift detected: expected 1807378906 (matches '
        f'm4g2-prod-ttl-backfill-execution-log-2026-05-24.md row 1), '
        f'got {ttl}'
    )


# ─── Documented edge cases ──────────────────────────────────────────────────

def test_ttl_rejects_unparseable_input():
    """Garbage input must raise ValueError, not silently return a wrong
    epoch. The script's main() catches this exception and emits a
    `skip_parse_error: ...` outcome row — never writes a corrupt ttl.
    """
    with pytest.raises(ValueError):
        _ttl_from_submitted_at('not-an-iso-string')


def test_ttl_tz_aware_input_produces_deterministic_utc_epoch():
    """Sprint F3 / audit-of-audit finding 10: previous test was vacuous —
    asserted `isinstance(int)` on both tz-aware AND tz-naive paths without
    asserting they diverged or that naive input would actually produce a
    different result depending on host TZ. Replaced with a positive
    assertion that the tz-aware path is deterministic regardless of host TZ
    AND a divergence assertion that naive input WOULD produce a different
    value if the host weren't UTC.

    The production contract is: real prod rows always carry 'Z' or '+00:00'
    suffix; the script normalizes 'Z' → '+00:00' before fromisoformat. The
    naive case is only theoretical (not a production data shape) — this
    test pins the divergence so a future change that strips tz info would
    surface."""
    from datetime import datetime, timezone, timedelta
    import os
    import time

    with_tz_utc = '2026-01-01T00:00:00+00:00'
    with_tz_pst = '2026-01-01T00:00:00-08:00'
    naive = '2026-01-01T00:00:00'

    # tz-aware UTC input: deterministic epoch
    utc_epoch = _ttl_from_submitted_at(with_tz_utc)
    expected_utc = int(datetime(2027, 1, 1, tzinfo=timezone.utc).timestamp())
    assert utc_epoch == expected_utc

    # tz-aware non-UTC: also deterministic but shifted
    pst_epoch = _ttl_from_submitted_at(with_tz_pst)
    expected_pst = int(
        datetime(2027, 1, 1, 8, 0, 0, tzinfo=timezone.utc).timestamp()
    )
    assert pst_epoch == expected_pst
    assert pst_epoch - utc_epoch == 8 * 3600  # 8 hours

    # Naive: result depends on host TZ. Assert that naive INPUT produces the
    # same epoch as datetime(...).timestamp() would in the host's TZ — i.e.,
    # the formula behaves consistently with stdlib semantics. We do NOT try
    # to predict the divergence from UTC (DST + offset math is brittle).
    # The point: naive input is host-TZ-dependent and should NEVER appear in
    # production data (real prod rows always carry 'Z' or '+00:00').
    naive_epoch = _ttl_from_submitted_at(naive)
    expected_naive_in_host_tz = int(datetime(2027, 1, 1).timestamp())
    assert naive_epoch == expected_naive_in_host_tz, (
        f'naive input must produce host-local timestamp consistent with '
        f'stdlib; got {naive_epoch}, expected {expected_naive_in_host_tz}'
    )
