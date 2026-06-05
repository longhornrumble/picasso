"""Unit tests for tools/ga3_subject_index_backfill.py.

Two jobs:
  1. PARITY — replay the canonical test_pii_subject.py vectors against the
     backfill's verbatim-ported normalize_email + extract_email, so the port
     is proven equal to the deployed writer (which is itself parity-tested
     against pii_subject.js). This guards against silent drift if anyone edits
     the in-script copies.
  2. ALGORITHM — the backfill-specific logic the writer doesn't have:
     email_for_row (contact.email vs form_data) and plan_row's outcome
     classification (skip / unindexed / cache-hit / existing / create), with
     get_index monkeypatched so no AWS is touched.

Run: python3 -m pytest tools/test_ga3_subject_index_backfill.py -v
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ga3_subject_index_backfill as bf  # noqa: E402


# ─── PARITY: normalize_email (vectors lifted verbatim from test_pii_subject.py) ─

@pytest.mark.parametrize("raw,expected", [
    ("Foo.Bar@Gmail.com", "foobar@gmail.com"),            # gmail: lower+dropdots
    ("foo.bar+tag@googlemail.com", "foobar@gmail.com"),   # googlemail alias+plus
    ("a.b.c@gmail.com", "abc@gmail.com"),
    ("x+promo@gmail.com", "x@gmail.com"),                 # gmail plus stripped
    ("CASE@Test.io", "case@test.io"),                     # non-gmail: lower only
    ("Keep.Dots@example.com", "keep.dots@example.com"),   # non-gmail keeps dots
    ("  User+promo@Example.COM  ", "user+promo@example.com"),
    ("alice+work@acme.com", "alice+work@acme.com"),
    ("bob+x@outlook.com", "bob+x@outlook.com"),
])
def test_normalize_email_parity(raw, expected):
    assert bf.normalize_email(raw) == expected
    assert bf.normalize_email(raw) == bf.normalize_email(raw)  # idempotent / pure


@pytest.mark.parametrize("bad", [
    None, "", "   ", "noatsign", "@nolocal.com", "local@", "a@b@gmail.com",
    "a b@gmail.com", "a\tb@example.com",  # incl. internal-whitespace (R1)
])
def test_normalize_email_invalid_returns_none(bad):
    assert bf.normalize_email(bad) is None


def test_normalize_email_non_gmail_plus_preserved():
    assert bf.normalize_email("+@example.com") == "+@example.com"
    assert bf.normalize_email("user+tag@example.com") == "user+tag@example.com"


def test_normalize_email_gmail_plus_edge_cases():
    assert bf.normalize_email("+tag@gmail.com") is None
    assert bf.normalize_email("+@gmail.com") is None
    assert bf.normalize_email("a+tag@gmail.com") == "a@gmail.com"


# ─── PARITY: extract_email (vectors lifted verbatim from test_pii_subject.py) ──

def test_extract_email_prefers_named_key():
    assert bf.extract_email({"Email Address": "x@y.com", "note": "z@w.com"}) == "x@y.com"


def test_extract_email_falls_back_to_value_scan():
    assert bf.extract_email({"q1": "hello", "q2": "find@me.org"}) == "find@me.org"


def test_extract_email_none_when_absent():
    assert bf.extract_email({"name": "Jane", "age": 30}) is None
    assert bf.extract_email("not a dict") is None


def test_extract_email_tie_break_is_insertion_order():
    assert bf.extract_email({"a": "first@x.com", "b": "second@y.com"}) == "first@x.com"


def test_extract_email_substring_key_hint_matches():
    assert bf.extract_email({"applicant_email_field": "hit@x.com"}) == "hit@x.com"


def test_extract_email_nested_dict_value_is_ignored():
    assert bf.extract_email({"contact": {"email": "nested@z.com"}}) is None


# ─── ALGORITHM: email_for_row (contact.email preferred, form_data fallback) ────

def test_email_for_row_prefers_contact_email_bsh_shape():
    row = {"contact": {"email": "bsh@example.com"},
           "form_data": {"email": "other@example.com"}}
    assert bf.email_for_row(row) == "bsh@example.com"


def test_email_for_row_falls_back_to_form_data_mfs_shape():
    # MFS pre-F-DSAR18 rows have no contact dict; email lives in the bag.
    row = {"form_data": {"q1": "Jane", "q2": "mfs@example.com"}}
    assert bf.email_for_row(row) == "mfs@example.com"


def test_email_for_row_ignores_blank_contact_email():
    row = {"contact": {"email": ""}, "form_data": {"email": "fallback@example.com"}}
    assert bf.email_for_row(row) == "fallback@example.com"


def test_email_for_row_none_when_no_email_anywhere():
    assert bf.email_for_row({"form_data": {"name": "Jane"}}) is None
    assert bf.email_for_row({}) is None


# ─── ALGORITHM: plan_row outcome classification (get_index monkeypatched) ──────

@pytest.fixture
def no_aws(monkeypatch):
    """Default: index has no entry (get_index → None). Tests override as needed."""
    calls = {"gets": 0}

    def fake_get(index_table, tenant_id, normalized, consistent):
        calls["gets"] += 1
        return None
    monkeypatch.setattr(bf, "get_index", fake_get)
    return calls


def _plan(row, cache=None, get_log=None):
    return bf.plan_row(row, cache if cache is not None else {},
                       "picasso-pii-subject-index",
                       log_get=(get_log or (lambda: None)))


def test_plan_skip_when_already_has_subject_id(no_aws):
    p = _plan({"submission_id": "s1", "pii_subject_id": "psub_abc",
               "tenant_id": "T1", "contact": {"email": "a@b.com"}})
    assert p["outcome"] == "skip_already_has_subject_id"
    assert no_aws["gets"] == 0  # short-circuits before any index read


def test_plan_skip_when_no_submission_id(no_aws):
    p = _plan({"tenant_id": "T1", "contact": {"email": "a@b.com"}})
    assert p["outcome"] == "skip_no_submission_id"


@pytest.mark.parametrize("bad_tenant", [None, "", "   ", "unknown", "UNKNOWN", " Unknown "])
def test_plan_unindexed_when_tenant_missing_or_unknown(no_aws, bad_tenant):
    # Mirrors the writer: never index under a missing/unknown tenant (collision).
    p = _plan({"submission_id": "s2", "tenant_id": bad_tenant,
               "contact": {"email": "a@b.com"}})
    assert p["outcome"] == "unindexed_no_tenant"
    assert p["sid"].startswith("psub_")
    assert no_aws["gets"] == 0  # no index read for an unindexed row


def test_plan_unindexed_when_no_usable_email(no_aws):
    p = _plan({"submission_id": "s3", "tenant_id": "T1",
               "form_data": {"name": "Jane"}})
    assert p["outcome"] == "unindexed_no_email"
    assert p["sid"].startswith("psub_")


def test_plan_index_create_when_email_present_and_not_indexed(no_aws):
    get_calls = {"n": 0}
    p = _plan({"submission_id": "s4", "tenant_id": "T1",
               "contact": {"email": "New@b.com"}},
              get_log=lambda: get_calls.__setitem__("n", get_calls["n"] + 1))
    assert p["outcome"] == "index_create"
    assert p["sid"].startswith("psub_")
    assert "khash" in p and ":" not in p["khash"]  # opaque token, no PII
    assert no_aws["gets"] == 1
    assert get_calls["n"] == 1


def test_plan_index_existing_adopts_stored_id(monkeypatch):
    monkeypatch.setattr(bf, "get_index",
                        lambda index_table, t, n, consistent: "psub_EXISTING")
    p = _plan({"submission_id": "s5", "tenant_id": "T1",
               "contact": {"email": "a@b.com"}})
    assert p["outcome"] == "index_existing"
    assert p["sid"] == "psub_EXISTING"


def test_plan_cache_hit_avoids_index_read(no_aws):
    cache = {("T1", "a@b.com"): "psub_CACHED"}
    p = _plan({"submission_id": "s6", "tenant_id": "T1",
               "contact": {"email": "a@b.com"}}, cache=cache)
    assert p["outcome"] == "index_cache_hit"
    assert p["sid"] == "psub_CACHED"
    assert no_aws["gets"] == 0  # served from cache, no AWS read


def test_plan_khash_is_non_pii_and_stable():
    # Same (tenant, normalized) → same token; raw email never appears in it.
    t1 = bf._khash("T1", "abc@gmail.com")
    t2 = bf._khash("T1", "abc@gmail.com")
    assert t1 == t2 and len(t1) == 12
    assert "abc" not in t1 and "gmail" not in t1


# ─── WRITE PATH: get_or_create_index bounded loop (get_index/put_index mocked) ─

def test_goci_returns_existing_without_put(monkeypatch):
    monkeypatch.setattr(bf, "get_index", lambda *a, **k: "psub_EXISTING")
    put_calls = {"n": 0}
    monkeypatch.setattr(bf, "put_index",
                        lambda *a: put_calls.__setitem__("n", put_calls["n"] + 1) or "put")
    sid, outcome = bf.get_or_create_index("tbl", "T1", "a@b.com", "psub_CAND")
    assert (sid, outcome) == ("psub_EXISTING", "existing")
    assert put_calls["n"] == 0  # never attempted a PUT when an entry exists


def test_goci_creates_when_absent(monkeypatch):
    monkeypatch.setattr(bf, "get_index", lambda *a, **k: None)
    monkeypatch.setattr(bf, "put_index", lambda *a: "put")
    sid, outcome = bf.get_or_create_index("tbl", "T1", "a@b.com", "psub_CAND")
    assert (sid, outcome) == ("psub_CAND", "created")


def test_goci_race_then_adopts_winner(monkeypatch):
    # 1st GET None → PUT races (someone won) → 2nd consistent GET returns winner.
    seq = iter([None, "psub_WINNER"])
    monkeypatch.setattr(bf, "get_index", lambda *a, **k: next(seq))
    monkeypatch.setattr(bf, "put_index", lambda *a: "race")
    sid, outcome = bf.get_or_create_index("tbl", "T1", "a@b.com", "psub_CAND")
    assert (sid, outcome) == ("psub_WINNER", "existing")  # adopted, NOT our candidate


def test_goci_unresolved_returns_none_no_phantom(monkeypatch):
    # Pathological: every GET None and every PUT races → never resolves. The
    # contract: return (None, 'unresolved') so the caller does NOT stamp a phantom.
    monkeypatch.setattr(bf, "get_index", lambda *a, **k: None)
    monkeypatch.setattr(bf, "put_index", lambda *a: "race")
    sid, outcome = bf.get_or_create_index("tbl", "T1", "a@b.com", "psub_CAND", attempts=3)
    assert sid is None and outcome == "unresolved"


def test_goci_propagates_put_error(monkeypatch):
    monkeypatch.setattr(bf, "get_index", lambda *a, **k: None)
    monkeypatch.setattr(bf, "put_index", lambda *a: "error: AccessDenied")
    sid, outcome = bf.get_or_create_index("tbl", "T1", "a@b.com", "psub_CAND")
    assert sid is None and outcome.startswith("error")


# ─── WRITE PATH: _tally_results result-string parsing ─────────────────────────

def test_tally_results_classifies_every_outcome():
    results = [
        "skip_already_has_subject_id", "skip_no_submission_id",
        "index_create:stamped", "index_existing:stamped",
        "unindexed_no_email:stamped", "unindexed_no_tenant:already_stamped",
        "index_cache_hit:already_stamped",
        "index_race_unresolved",
        "index_error: AccessDenied",
    ]
    t = bf._tally_results(results)
    assert t["skipped"] == 2
    assert t["stamped"] == 3           # 3 ":stamped"
    assert t["unindexed"] == 1         # the unindexed_*:stamped one
    assert t["already_stamped"] == 2
    assert t["unresolved"] == 1
    assert t["errors"] == 1
