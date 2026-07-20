"""Deterministic conversation universe for persona BrightPath.

Reads the six-month arc (arc.json) + persona (persona.json) and produces the
single canonical list of conversations that every writer serializes from:

  - conversations  -> picasso-session-summaries rows
  - the is_lead ones -> picasso-form-submissions rows (Lead Workspace)
  - channel/topic/month totals -> picasso-attribution-aggregates (history)

Design decisions (see README):
  * Anti-time-rot: timestamps are RELATIVE to the seed run. "month j-ago" (j=0
    is the current trailing 30 days) places conversations uniformly in
    [now-(j+1)*30d, now-j*30d). A trailing-30d dashboard view therefore reads
    the arc's m0 total; 90d reads m0+m-1+m-2; etc.
  * Determinism: a fixed RNG seed + deterministic session_ids make the whole
    run idempotent — re-running overwrites the same rows instead of duplicating.
  * session_id carries the reserved `sess-demo-` prefix so a future prod IAM
    policy can scope SESSION#sess-demo-* (roadmap §4 prod-safety).
"""
import json
import os
import random
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

_HERE = os.path.dirname(os.path.abspath(__file__))
_PERSONA_DIR = os.path.normpath(os.path.join(_HERE, "..", "personas", "brightpath"))

TENANT_ID = "BRI071351"
TENANT_HASH = "8b464847ae0ede"          # LITERAL — never recompute from the id.
LOCAL_TZ = ZoneInfo("America/Chicago")   # the tz the dashboard buckets hours in
CHANNELS = ["website", "messenger", "standalone", "campaign"]

# Local-hour weights (America/Chicago). Tuned so ~46% of conversations start
# outside 9am-5pm (the arc's after-hours "money band" beat). Business hours
# 9..16 carry the bulk; evenings 17..22 are the after-hours peak.
_HOUR_WEIGHTS = [
    0.8, 0.5, 0.4, 0.3, 0.3, 0.5,      # 00-05 night
    1.0, 1.7, 2.4,                     # 06-08 morning ramp (after-hours)
    3.9, 4.2, 4.0, 3.6, 3.9, 4.0, 3.9, 3.7,  # 09-16 business (~54%)
    3.3, 3.7, 3.6, 3.0, 2.4, 1.6,      # 17-22 evening (after-hours peak)
    1.0,                               # 23
]
# Weekday weight (Mon..Sun); weekends lighter.
_DOW_WEIGHTS = [1.0, 1.0, 1.05, 1.05, 0.95, 0.55, 0.45]

# The arc's lead-pipeline states are aspirational; the product enum is 4-valued
# (VALID_PIPELINE_STATUSES = new/reviewing/contacted/archived). Map on the way in.
_ARC_STATUS_TO_PRODUCT = {
    "new": "new",
    "qualified": "reviewing",
    "contacted": "contacted",
    "converted": "archived",   # a won lead is closed; there is no "converted" state
    "archived": "archived",
}

# topic -> which form a lead from that topic completes
_TOPIC_FORM = {
    "Volunteer": ("volunteer_application", "mentor_application"),  # split 70/30
    "Services": ("volunteer_application",),
    "Donation": ("donation_inquiry",),
    "Events": ("event_registration",),
    "General": ("volunteer_application",),
}


def _load(name):
    with open(os.path.join(_PERSONA_DIR, name)) as f:
        return json.load(f)


def _weighted_hour(rng):
    return rng.choices(range(24), weights=_HOUR_WEIGHTS, k=1)[0]


def _pick_datetime(rng, now, j):
    """A UTC datetime in the trailing window for 'month j-ago', hour-weighted in
    local time and weekday-weighted."""
    for _ in range(12):  # rejection-sample the weekday weighting
        secs = rng.random() * 30 * 86400
        base_local = (now.astimezone(LOCAL_TZ) - timedelta(days=j * 30) - timedelta(seconds=secs))
        if rng.random() <= _DOW_WEIGHTS[base_local.weekday()]:
            break
    hour = _weighted_hour(rng)
    minute = rng.randint(0, 59)
    second = rng.randint(0, 59)
    local_dt = base_local.replace(hour=hour, minute=minute, second=second, microsecond=0)
    return local_dt.astimezone(timezone.utc)


def _topic(rng, weights):
    topics = list(weights.keys())
    w = list(weights.values())
    return rng.choices(topics, weights=w, k=1)[0]


def _lead_form(rng, topic):
    forms = _TOPIC_FORM.get(topic, ("volunteer_application",))
    if topic == "Volunteer" and len(forms) == 2:
        return forms[0] if rng.random() < 0.7 else forms[1]
    return forms[0]


def build_universe(now=None, seed="BRI071351"):
    """Return (conversations, meta). Each conversation is a plain dict."""
    persona = _load("persona.json")
    arc = _load("arc.json")
    now = now or datetime.now(timezone.utc)
    rng = random.Random(seed)

    weights = persona["topic_mix"]["weights"]
    samples = persona["topic_mix"]["sample_first_questions"]
    series = arc["monthly_series"]
    conv_series = series["conversations"]
    lead_series = series["leads"]
    # arc arrays are ordered [m-5, m-4, m-3, m-2, m-1, m0]; index 5 = m0 (j=0)
    n_months = len(conv_series["total"])

    # m0 lead-pipeline distribution (product-mapped) for the current month's leads
    m0_dist_arc = arc["lead_pipeline"]["distribution"]
    m0_status_pool = []
    for arc_state, count in m0_dist_arc.items():
        m0_status_pool += [_ARC_STATUS_TO_PRODUCT[arc_state]] * count
    rng.shuffle(m0_status_pool)

    conversations = []
    for idx in range(n_months):
        j = (n_months - 1) - idx            # months-ago: idx 5 -> j 0 (m0)
        month_tag = f"m{j}ago"
        for channel in CHANNELS:
            n_conv = conv_series[channel][idx]
            n_lead = lead_series[channel][idx]
            # first n_lead conversations in this group are the leads
            for seq in range(n_conv):
                is_lead = seq < n_lead
                topic = _topic(rng, weights)
                first_q = rng.choice(samples[topic])
                started = _pick_datetime(rng, now, j)
                user_msgs = rng.randint(3, 9)
                bot_msgs = user_msgs
                resp_times = [rng.randint(700, 2600) for _ in range(bot_msgs)]
                duration_s = (user_msgs + bot_msgs) * rng.randint(18, 70)
                ended = started + timedelta(seconds=duration_s)
                # Lead the session_id with the started-at epoch so the id sorts
                # chronologically. handle_sessions_list scans session-summaries by
                # SK (=SESSION#{session_id}) descending and applies the date filter
                # per-page; a non-chronological id front-loads old sessions that
                # fail the filter, so the first page comes back empty even though
                # recent sessions exist. Epoch-led ids put recent first.
                epoch = int(started.timestamp())
                conv = {
                    "session_id": f"sess-demo-{epoch}-{channel[:4]}-{seq:04d}",
                    "channel": channel,
                    "month_ago": j,
                    "started_at": started.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                    "ended_at": ended.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                    "topic": topic,
                    "first_question": first_q,
                    "user_message_count": user_msgs,
                    "bot_message_count": bot_msgs,
                    "message_count": user_msgs + bot_msgs,
                    "response_count": bot_msgs,
                    "total_response_time_ms": sum(resp_times),
                    "is_lead": is_lead,
                    "outcome": "form_completed" if is_lead else "conversation",
                }
                if is_lead:
                    conv["form_id"] = _lead_form(rng, topic)
                    if j == 0 and m0_status_pool:
                        conv["lead_status"] = m0_status_pool.pop()
                    else:
                        # older leads are resolved
                        conv["lead_status"] = "archived"
                conversations.append(conv)

    meta = {
        "now": now.isoformat(),
        "total_conversations": len(conversations),
        "total_leads": sum(1 for c in conversations if c["is_lead"]),
        "arc_total_conversations": conv_series["total"][-1] + sum(conv_series["total"][:-1]),
        "by_channel": {ch: sum(1 for c in conversations if c["channel"] == ch) for ch in CHANNELS},
        "by_topic": {t: sum(1 for c in conversations if c["topic"] == t) for t in weights},
        "lead_status_counts": {},
    }
    for c in conversations:
        if c["is_lead"]:
            s = c["lead_status"]
            meta["lead_status_counts"][s] = meta["lead_status_counts"].get(s, 0) + 1
    return conversations, meta


def after_hours_fraction(conversations):
    ah = 0
    for c in conversations:
        dt = datetime.fromisoformat(c["started_at"].replace("Z", "+00:00")).astimezone(LOCAL_TZ)
        if dt.hour < 9 or dt.hour >= 17:
            ah += 1
    return ah / len(conversations) if conversations else 0


if __name__ == "__main__":
    convs, meta = build_universe()
    print(json.dumps(meta, indent=2))
    print(f"after_hours_fraction = {after_hours_fraction(convs):.3f} (target ~0.46)")
    print("sample:", json.dumps(convs[0], indent=2))
    print("sample lead:", json.dumps(next(c for c in convs if c['is_lead']), indent=2))
