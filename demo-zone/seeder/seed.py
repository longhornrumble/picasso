#!/usr/bin/env python3
"""BrightPath demo-tenant seeder.

Writes synthetic-but-real rows for tenant BRI071351 (hash 8b464847ae0ede) into
the staging data plane so every Mission-Intelligence dashboard renders a
believable "day in the life". Seed the data plane; never mock the UI.

SAFETY
  * Dry-run is the DEFAULT. Nothing is written unless you pass --live.
  * Only ever touches the hard-coded demo tenant (ALLOWED_TENANT_IDS /
    ALLOWED_HASH). Every key is asserted against that allowlist before write.
  * `reset` purges demo rows; it prints a dry-run manifest first and refuses to
    delete unless --live is given (dry-run-before-destroy).

USAGE
  python3 seed.py all                 # dry-run everything
  python3 seed.py conversations --live --limit 40   # small live sample first
  python3 seed.py all --live          # full seed
  python3 seed.py reset               # dry-run purge manifest
  python3 seed.py reset --live        # actually purge demo rows

Credentials come from the ambient AWS_PROFILE (operator SSO). Region us-east-1.
"""
import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timedelta, timezone

import ddb
from generate import (
    TENANT_ID, TENANT_HASH, CHANNELS, LOCAL_TZ, build_universe, after_hours_fraction,
    _load,
)

# ---- allowlist (defense in depth; IAM will scope prod separately) -----------
ALLOWED_TENANT_IDS = {"BRI071351"}
ALLOWED_HASH = {"8b464847ae0ede"}
DEMO_STAFF_EMAIL = "demo@myrecruiter.ai"   # the scoped Clerk demo user (P1). Bookings'
#   coordinator_email must equal the viewing staffer's LOWERCASED email or the
#   default staff_self scheduling scope returns nothing. Change if the demo user
#   is provisioned under a different address.

TABLES = {
    "summaries": "picasso-session-summaries",
    "events": "picasso-session-events",
    "forms": "picasso-form-submissions",
    "booking": "picasso-booking",
    "notif": "picasso-notification-events",
    "attrib": "picasso-attribution-aggregates",
    "entrypoints": "picasso-entry-points",
}

TTL_LONG = 400 * 86400     # conversations / forms
TTL_ATTRIB = 420 * 86400   # matches arc _c5_row_shapes (now + 420d)
TTL_NOTIF = 120 * 86400


def _now():
    return datetime.now(timezone.utc)


def _epoch(dt):
    return int(dt.timestamp())


def _assert_tenant(tid=None, hsh=None):
    if tid is not None and tid not in ALLOWED_TENANT_IDS:
        raise SystemExit(f"REFUSING: tenant_id {tid!r} not in demo allowlist")
    if hsh is not None and hsh not in ALLOWED_HASH:
        raise SystemExit(f"REFUSING: tenant_hash {hsh!r} not in demo allowlist")


def _ep_id(ref):
    """Deterministic ep_ id matching /^ep_[0-9A-Za-z]{8,64}$/ (placeholder until
    real ids are minted in staging at P3)."""
    return "ep_" + hashlib.sha256(f"{TENANT_ID}:{ref}".encode()).hexdigest()[:20]


# ===========================================================================
# 1) CONVERSATIONS -> picasso-session-summaries
# ===========================================================================
def write_conversations(convs, dry_run, limit=None):
    _assert_tenant(hsh=TENANT_HASH)
    rows = convs if not limit else convs[-limit:]  # -limit => most recent
    now_epoch = _epoch(_now())
    items = []
    for c in rows:
        item = {
            "pk": f"TENANT#{TENANT_HASH}",
            "sk": f"SESSION#{c['session_id']}",
            "session_id": c["session_id"],
            "tenant_id": TENANT_ID,
            "started_at": c["started_at"],
            "ended_at": c["ended_at"],
            "outcome": c["outcome"],
            "first_question": c["first_question"],
            "message_count": c["message_count"],
            "user_message_count": c["user_message_count"],
            "bot_message_count": c["bot_message_count"],
            "response_count": c["response_count"],
            "total_response_time_ms": c["total_response_time_ms"],
            "channel": c["channel"],           # extra attr; harmless, aids future use
            "ttl": now_epoch + TTL_LONG,
        }
        if c.get("form_id"):
            item["form_id"] = c["form_id"]
        items.append(item)
    return ddb.batch_write(TABLES["summaries"], items, dry_run, f"conversations x{len(items)}")


# ===========================================================================
# 2) FORMS / LEADS -> picasso-form-submissions
# ===========================================================================
_FORMS_DOC = None
_ROSTER = None


def _forms_doc():
    global _FORMS_DOC
    if _FORMS_DOC is None:
        _FORMS_DOC = _load("forms.json")["conversational_forms"]
    return _FORMS_DOC


def _roster():
    global _ROSTER
    if _ROSTER is None:
        _ROSTER = _load("persona.json")["roster"]["contacts"]
    return _ROSTER


def _contact_for(session_id):
    r = _roster()
    return r[int(hashlib.sha256(session_id.encode()).hexdigest(), 16) % len(r)]


def write_forms(convs, dry_run):
    _assert_tenant(tid=TENANT_ID)
    forms_doc = _forms_doc()
    now_epoch = _epoch(_now())
    items = []
    for c in (x for x in convs if x["is_lead"]):
        fid = c["form_id"]
        fdef = forms_doc.get(fid, {})
        contact = _contact_for(c["session_id"])
        name = contact["name"]
        first, _, last = name.partition(" ")
        status = c["lead_status"]
        # completions happen at end-of-conversation
        submitted_at = c["ended_at"]
        submission_id = "sub-demo-" + hashlib.sha256(c["session_id"].encode()).hexdigest()[:24]
        # a compact labeled/display form_data from the persona contact
        display = {
            "Name": name,
            "Email": contact["email"],
            "Phone": contact.get("phone", ""),
            "Program": fdef.get("program") or "general",
        }
        labeled = {
            "Name": {"type": "name", "value": {"first": first, "last": last}},
            "Email": {"type": "email", "value": contact["email"]},
            "Phone": {"type": "phone", "value": contact.get("phone", "")},
        }
        item = {
            "tenant_id": TENANT_ID,
            "submission_id": submission_id,
            "tenant_hash": TENANT_HASH,
            "session_id": c["session_id"],
            "form_id": fid,
            "form_title": fdef.get("title", fid),
            "form_type": fid,
            "timestamp": submitted_at,          # tenant-timestamp-index sort key
            "submitted_at": submitted_at,        # tenant-pipeline-index sort key + display
            "created_at": submitted_at,          # FormTypeIndex/StatusIndex sort key
            "status": "pending_fulfillment",     # fulfillment state (unrelated to pipeline)
            "pipeline_status": status,           # new|reviewing|contacted|archived
            "tenant_pipeline_key": f"{TENANT_ID}#{status}",
            "contact": {
                "first_name": first, "last_name": last, "full_name": name,
                "email": contact["email"], "phone": contact.get("phone", ""),
            },
            "form_data_display": display,
            "form_data_labeled": labeled,
            "internal_notes": "",
            "ttl": now_epoch + TTL_LONG,
        }
        if status == "contacted":
            item["contacted_at"] = c["ended_at"]
            item["processed_by"] = DEMO_STAFF_EMAIL
        if status == "archived":
            item["archived_at"] = c["ended_at"]
        items.append(item)
    return ddb.batch_write(TABLES["forms"], items, dry_run, f"leads x{len(items)}")


# ===========================================================================
# 2b) FORM FUNNEL -> picasso-session-events (Forms dashboard summary tiles)
# ===========================================================================
# The Forms /summary tiles read session-events via GSI tenant-date-index and
# count FORM_VIEWED / FORM_STARTED / FORM_COMPLETED (abandoned = started -
# completed; avg time from FORM_COMPLETED payload.duration_seconds). Emit a
# funnel per conversation so the tiles reconcile (~68% completion).
_TOPIC_PRIMARY_FORM = {
    "Volunteer": "volunteer_application",
    "Services": "volunteer_application",
    "Donation": "donation_inquiry",
    "Events": "event_registration",
}


def _event_row(c, step, when_iso, event_type, payload, now_epoch):
    return {
        "pk": f"SESSION#{c['session_id']}",
        "sk": f"STEP#{step:03d}",
        "session_id": c["session_id"],
        "tenant_id": TENANT_ID,
        "tenant_hash": TENANT_HASH,          # GSI tenant-date-index HASH key
        "timestamp": when_iso,                # GSI RANGE key
        "event_type": event_type,
        "event_payload": json.dumps(payload),  # JSON string; form_id filter matches '"form_id": "..."'
        "step_number": step,
        "ttl": now_epoch + TTL_LONG,
    }


def write_session_events(convs, dry_run):
    _assert_tenant(hsh=TENANT_HASH)
    now_epoch = _epoch(_now())
    items = []
    for c in convs:
        started, ended = c["started_at"], c["ended_at"]
        # a "+30s after start" view/start timestamp, clamped before end
        started_dt = datetime.fromisoformat(started.replace("Z", "+00:00"))
        start_iso = (started_dt + timedelta(seconds=20)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        if c["is_lead"]:
            fid = c["form_id"]
            dur = max(20, (datetime.fromisoformat(ended.replace("Z", "+00:00")) - started_dt).seconds)
            items.append(_event_row(c, 1, started, "FORM_VIEWED", {"form_id": fid}, now_epoch))
            items.append(_event_row(c, 2, start_iso, "FORM_STARTED", {"form_id": fid}, now_epoch))
            items.append(_event_row(c, 3, ended, "FORM_COMPLETED", {"form_id": fid, "duration_seconds": dur}, now_epoch))
            continue
        fid = _TOPIC_PRIMARY_FORM.get(c["topic"])
        if not fid:
            continue
        h = int(hashlib.sha256(c["session_id"].encode()).hexdigest(), 16) % 100
        if h < 10:      # abandoned: viewed + started, no complete
            items.append(_event_row(c, 1, started, "FORM_VIEWED", {"form_id": fid}, now_epoch))
            items.append(_event_row(c, 2, start_iso, "FORM_STARTED", {"form_id": fid}, now_epoch))
        elif h < 18:    # viewed only
            items.append(_event_row(c, 1, started, "FORM_VIEWED", {"form_id": fid}, now_epoch))
    return ddb.batch_write(TABLES["events"], items, dry_run, f"form-funnel events x{len(items)}")


# ===========================================================================
# 3) ATTRIBUTION -> picasso-attribution-aggregates (+ entry-points registry)
# ===========================================================================
def _attrib_row(pk_sk_month, sk, metrics, dry_run_now_epoch):
    """Build a C5 row. Metrics are written TOP-LEVEL (the attribution_api.py
    reader the dashboard imports reads them top-level) AND mirrored under `data`
    (the aggregator/writer convention) as a hedge — see README 'attribution shape'."""
    row = {
        "pk": f"TENANT#{TENANT_ID}",
        "sk": sk,
        "updated_at": _now().isoformat(),
        "ttl": dry_run_now_epoch + TTL_ATTRIB,
        "data": dict(metrics),   # hedge copy
    }
    row.update(metrics)          # primary: top-level
    return row


def _month_str(j):
    """Calendar YYYY-MM for month j-ago (j=0 => current month)."""
    d = _now().replace(day=15)
    # step back j months
    y, m = d.year, d.month
    m -= j
    while m <= 0:
        m += 12
        y -= 1
    return f"{y:04d}-{m:02d}"


def write_attribution(dry_run):
    _assert_tenant(tid=TENANT_ID)
    arc = _load("arc.json")
    series = arc["monthly_series"]
    conv_s, lead_s = series["conversations"], series["leads"]
    n_months = len(conv_s["total"])
    now_epoch = _epoch(_now())

    # m0 ratios (from the hand-reconciled arc m0 summary) applied to history totals
    m0 = arc["m0_summary_row"]["data"]
    R_ENGAGED = m0["engaged"] / m0["conversations"]
    R_APPS = m0["applications"] / m0["conversations"]
    R_AH = m0["after_hours_conversations"] / m0["conversations"]
    R_MIN = m0["conversation_minutes"] / m0["conversations"]
    R_REACH = m0["reach_page_views_sessions"] / m0["conversations"]
    weights = _load("persona.json")["topic_mix"]["weights"]

    rows = []
    for idx in range(n_months):
        j = (n_months - 1) - idx
        month = _month_str(j)
        tot_conv = conv_s["total"][idx]
        tot_lead = lead_s["total"][idx]

        # ---- summary row ----
        if j == 0:
            summ = dict(m0)   # exact hand-authored m0
        else:
            summ = {
                "conversations": tot_conv,
                "engaged": round(tot_conv * R_ENGAGED),
                "applications": round(tot_conv * R_APPS),
                "leads": tot_lead,
                "after_hours_conversations": round(tot_conv * R_AH),
                "conversation_minutes": round(tot_conv * R_MIN),
                "reach_page_views_sessions": round(tot_conv * R_REACH),
                "self_booked_pct": None,
                "median_first_response_minutes": None,
            }
        rows.append(_attrib_row(month, f"METRIC#attribution_summary#{month}", summ, now_epoch))

        # ---- channel rows ----
        for channel in CHANNELS:
            c_conv = conv_s[channel][idx]
            c_lead = lead_s[channel][idx]
            if c_conv == 0:
                continue
            if j == 0:
                cdata = dict(arc["m0_channel_rows"][channel]["data"])
                cdata["channel"] = channel
            else:
                cdata = {
                    "channel": channel,
                    "conversations": c_conv,
                    "leads": c_lead,
                    "engaged": round(c_conv * R_ENGAGED),
                    "applications": round(c_conv * R_APPS),
                    "topic_counts": {t: round(c_conv * w) for t, w in weights.items()},
                    "resource_clicks": {},
                    "self_booked_pct": None,
                    "median_first_response_minutes": None,
                }
                if channel == "standalone":
                    cdata["reach"] = {"scans": round(c_conv * 3.0), "clicks": 0}
                elif channel == "campaign":
                    cdata["reach"] = {"scans": 0, "clicks": round(c_conv * 5.6)}
            rows.append(_attrib_row(month, f"METRIC#attribution_channel#{month}#{channel}", cdata, now_epoch))

    # ---- entry-point aggregate rows (current month only) + registry ----
    ep_rows, reg_rows = _entry_points(now_epoch)
    rows.extend(ep_rows)

    n1 = ddb.batch_write(TABLES["attrib"], rows, dry_run, f"attribution C5 x{len(rows)}")
    n2 = ddb.batch_write(TABLES["entrypoints"], reg_rows, dry_run, f"entry-points registry x{len(reg_rows)}")
    return n1 + n2


def _entry_points(now_epoch):
    """The 4 mintable entry points (standalone QR + campaign email). Website
    per-page eps are intentionally omitted — the mint service rejects
    channel:website (arc entry_points._not_mintable). v1 accepts a single
    undifferentiated website channel."""
    arc = _load("arc.json")
    month = _month_str(0)
    created = _now().isoformat()
    mint = arc["entry_points"]["_mintable"]
    ep_agg, registry = [], []
    for channel in ("standalone", "campaign"):
        for ep in mint[channel]:
            epid = _ep_id(ep["ref"])
            scans = ep.get("scans", 0)
            clicks = ep.get("clicks", 0)
            agg = {
                "channel": channel,
                "entry_point_id": epid,
                "conversations": ep["conversations"],
                "leads": ep["leads"],
                "dub_scans": scans,
                "dub_clicks": clicks,
                "label": ep["label"],
                "campaign": ep.get("campaign", ""),
                "placement": ep["placement"],
                "created_at": created,
            }
            ep_agg.append(_attrib_row(month, f"METRIC#attribution_entrypoint#{month}#{epid}", agg, now_epoch))
            registry.append({
                "tenant_id": TENANT_ID,
                "entry_point_id": epid,
                "channel": channel,
                "label": ep["label"],
                "campaign": ep.get("campaign", ""),
                "placement": ep["placement"],
                "created_at": created,
                "dub_short_link": "",
                "target_type": ep.get("target_type", ""),
            })
    return ep_agg, registry


# ===========================================================================
# 4) SCHEDULING -> picasso-booking
# ===========================================================================
def write_scheduling(dry_run):
    _assert_tenant(tid=TENANT_ID)
    arc = _load("arc.json")["scheduling"]
    contacts = _roster()
    now = _now()
    items = []

    def _booking(i, when, status):
        contact = contacts[i % len(contacts)]
        start = when
        end = start + timedelta(minutes=30)
        bid = "bk-demo-" + hashlib.sha256(f"{status}-{i}-{start.isoformat()}".encode()).hexdigest()[:20]
        return {
            "tenantId": TENANT_ID,   # camelCase HASH key
            "booking_id": bid,
            "status": status,
            "start_at": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "end_at": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "coordinator_email": DEMO_STAFF_EMAIL.lower(),
            "appointment_type_id": "appt_intro_30",
            "attendee_name": contact["name"],
            "attendee_email": contact["email"],
            "attendee_phone": contact.get("phone", ""),
            "created_at": (start - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "prep_note": "Wants to learn about volunteering with BrightPath.",
            # NB: is_synthetic deliberately OMITTED (setting it hides the row).
        }

    # upcoming: spread over the next ~40 days, business hours
    for i in range(arc["upcoming"]):
        when = (now + timedelta(days=2 + i * 4)).replace(hour=15, minute=0, second=0, microsecond=0)
        items.append(_booking(i, when, "booked"))
    # past: spread over the previous ~80 days, mix of outcomes
    past_statuses = ["completed", "completed", "completed", "no_show", "canceled"]
    for i in range(arc["past"]):
        when = (now - timedelta(days=3 + i * 3)).replace(hour=14, minute=0, second=0, microsecond=0)
        items.append(_booking(100 + i, when, past_statuses[i % len(past_statuses)]))
    return ddb.batch_write(TABLES["booking"], items, dry_run, f"bookings x{len(items)}")


# ===========================================================================
# 5) NOTIFICATIONS -> picasso-notification-events (lifecycle, shared message_id)
# ===========================================================================
def write_notifications(dry_run):
    _assert_tenant(tid=TENANT_ID)
    arc = _load("arc.json")["notifications"]
    contacts = _roster()
    now = _now()
    sends = arc["m0_sends"]
    d_rate, o_rate, c_rate = arc["delivery_rate"], arc["open_rate"], arc["click_rate"]
    items = []

    def _row(msg_id, when, event_type):
        iso = when.strftime("%Y-%m-%dT%H:%M:%SZ")
        date = when.strftime("%Y-%m-%d")
        contact = contacts[int(msg_id[-6:], 16) % len(contacts)]
        return {
            "pk": f"TENANT#{TENANT_ID}",
            "sk": f"{date}#{event_type}#{msg_id}",
            "message_id": msg_id,
            "event_type": event_type,
            "event_type_timestamp": f"{event_type}#{iso}",
            "channel": "email",
            "destination": [contact["email"]],
            "detail": {f"{event_type}_timestamp": iso},
            "tags": {"email_type": "internal_notification", "form_type": "volunteer_application"},
            "ttl": _epoch(when) + TTL_NOTIF,
        }

    for i in range(sends):
        # spread sends across the last 30 days
        when = now - timedelta(minutes=int((i / sends) * 30 * 24 * 60))
        msg_id = "msg-demo-" + hashlib.sha256(f"{i}".encode()).hexdigest()[:16]
        items.append(_row(msg_id, when, "send"))
        # deterministic lifecycle progression keyed off i
        frac = (i % 100) / 100.0
        if frac < d_rate:
            items.append(_row(msg_id, when + timedelta(seconds=8), "delivery"))
            if frac < o_rate:
                items.append(_row(msg_id, when + timedelta(minutes=12), "open"))
                if frac < c_rate:
                    items.append(_row(msg_id, when + timedelta(minutes=14), "click"))
        else:
            items.append(_row(msg_id, when + timedelta(seconds=8), "bounce"))
    return ddb.batch_write(TABLES["notif"], items, dry_run, f"notification events x{len(items)}")


# ===========================================================================
# RESET (guarded purge — dry-run-before-destroy)
# ===========================================================================
def reset(dry_run):
    """Delete all demo rows for the allowlisted tenant across every table.
    Prints a manifest first; only deletes when --live is passed."""
    _assert_tenant(tid=TENANT_ID, hsh=TENANT_HASH)
    total = 0

    # session-summaries: query pk=TENANT#{hash}, sk begins SESSION#
    summ = ddb.query_all(TABLES["summaries"], "pk = :pk AND begins_with(sk, :p)",
                         {":pk": f"TENANT#{TENANT_HASH}", ":p": "SESSION#"},
                         projection="pk, sk")
    total += ddb.batch_delete(TABLES["summaries"], [{"pk": r["pk"], "sk": r["sk"]} for r in summ], dry_run, "summaries")

    # session-events: query GSI tenant-date-index (returns base keys pk/sk)
    evs = ddb.query_all(TABLES["events"], "tenant_hash = :th", {":th": TENANT_HASH},
                        index="tenant-date-index", projection="pk, sk")
    total += ddb.batch_delete(TABLES["events"], [{"pk": r["pk"], "sk": r["sk"]} for r in evs], dry_run, "session-events")

    # form-submissions: query tenant_id, filter demo submission_ids
    frm = ddb.query_all(TABLES["forms"], "tenant_id = :t", {":t": TENANT_ID}, projection="tenant_id, submission_id")
    frm = [r for r in frm if str(r.get("submission_id", "")).startswith("sub-demo-")]
    total += ddb.batch_delete(TABLES["forms"], [{"tenant_id": r["tenant_id"], "submission_id": r["submission_id"]} for r in frm], dry_run, "forms")

    # booking: query tenantId, filter demo booking_ids
    bk = ddb.query_all(TABLES["booking"], "tenantId = :t", {":t": TENANT_ID}, projection="tenantId, booking_id")
    bk = [r for r in bk if str(r.get("booking_id", "")).startswith("bk-demo-")]
    total += ddb.batch_delete(TABLES["booking"], [{"tenantId": r["tenantId"], "booking_id": r["booking_id"]} for r in bk], dry_run, "booking")

    # notification-events: query pk=TENANT#{tenant_id}
    nt = ddb.query_all(TABLES["notif"], "pk = :pk", {":pk": f"TENANT#{TENANT_ID}"}, projection="pk, sk")
    total += ddb.batch_delete(TABLES["notif"], [{"pk": r["pk"], "sk": r["sk"]} for r in nt], dry_run, "notifications")

    # attribution-aggregates: query pk=TENANT#{tenant_id}
    at = ddb.query_all(TABLES["attrib"], "pk = :pk", {":pk": f"TENANT#{TENANT_ID}"}, projection="pk, sk")
    total += ddb.batch_delete(TABLES["attrib"], [{"pk": r["pk"], "sk": r["sk"]} for r in at], dry_run, "attribution")

    # entry-points: query tenant_id
    ep = ddb.query_all(TABLES["entrypoints"], "tenant_id = :t", {":t": TENANT_ID}, projection="tenant_id, entry_point_id")
    total += ddb.batch_delete(TABLES["entrypoints"], [{"tenant_id": r["tenant_id"], "entry_point_id": r["entry_point_id"]} for r in ep], dry_run, "entry-points")

    verb = "would delete" if dry_run else "deleted"
    print(f"\nRESET {verb} {total} demo rows total.")
    return total


# ===========================================================================
# CLI
# ===========================================================================
def main():
    ap = argparse.ArgumentParser(description="BrightPath demo seeder")
    ap.add_argument("surface", choices=["all", "conversations", "events", "forms", "attribution",
                                        "scheduling", "notifications", "reset"])
    ap.add_argument("--live", action="store_true", help="actually write/delete (default: dry-run)")
    ap.add_argument("--limit", type=int, default=None, help="conversations: only the N most recent")
    args = ap.parse_args()
    dry = not args.live

    if os.environ.get("AWS_PROFILE") is None and not dry:
        print("WARNING: AWS_PROFILE not set; relying on ambient credentials", file=sys.stderr)

    mode = "DRY-RUN" if dry else "LIVE"
    print(f"=== BrightPath seeder [{mode}] tenant={TENANT_ID} hash={TENANT_HASH} ===")

    if args.surface == "reset":
        reset(dry)
        return

    convs = None
    if args.surface in ("all", "conversations", "events", "forms"):
        convs, meta = build_universe()
        print(f"universe: {meta['total_conversations']} conversations, {meta['total_leads']} leads, "
              f"after_hours={after_hours_fraction(convs):.3f}")

    total = 0
    if args.surface in ("all", "conversations"):
        total += write_conversations(convs, dry, args.limit)
    if args.surface in ("all", "events"):
        total += write_session_events(convs, dry)
    if args.surface in ("all", "forms"):
        total += write_forms(convs, dry)
    if args.surface in ("all", "attribution"):
        total += write_attribution(dry)
    if args.surface in ("all", "scheduling"):
        total += write_scheduling(dry)
    if args.surface in ("all", "notifications"):
        total += write_notifications(dry)

    verb = "would write" if dry else "wrote"
    print(f"\n=== {verb} {total} rows ===")
    if dry:
        print("(dry-run — pass --live to write)")


if __name__ == "__main__":
    main()
