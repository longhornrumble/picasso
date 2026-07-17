#!/usr/bin/env python3
"""
Contract test for the demo-zone persona fixture packs.

Run:  python3 demo-zone/verify-fixtures.py

Checks that a fixture pack is internally consistent AND conforms to the
constraints the product actually enforces. The parked frontend mock this
fixture derives from failed several of these (deltas contradicting its own
trend series; channel engaged/applications not summing to the funnel; topic
labels the aggregator cannot emit) -- which is why this exists.

Exit 0 = pack is safe for the seeder to consume.
"""
import json
import re
import sys
from pathlib import Path

PACK = Path(__file__).parent / "personas" / "brightpath"

# The ONLY topic categories the product can emit.
# Analytics_Dashboard_API/lambda_function.py:6024-6036 keyword-matches first_question.
VALID_TOPICS = {"Volunteer", "Donation", "Events", "Services", "Supplies", "General"}

# picasso-config-builder/src/lib/schemas/cta.schema.ts:106-113
TYPE_FOR_ACTION = {
    "start_form": "form_trigger",
    "external_link": "external_link",
    "send_query": "bedrock_query",
    "show_info": "info_request",
    "start_scheduling": "scheduling_trigger",
    "resume_scheduling": "scheduling_trigger",
}
# cta.schema.ts:58-103
REQUIRED_FIELD_FOR_ACTION = {
    "start_form": "formId",
    "external_link": "url",
    "send_query": "query",
    "show_info": "prompt",
}
CHANNELS = ["website", "messenger", "standalone", "campaign"]
C7_FLOOR = 50  # FROZEN_CONTRACTS.md:201 -- n < 50 => rate suppressed

failures = []


def check(name, cond, detail=""):
    if cond:
        print(f"PASS  {name}")
    else:
        print(f"FAIL  {name}  <-- {detail}")
        failures.append(name)


def main():
    persona = json.loads((PACK / "persona.json").read_text())
    forms_doc = json.loads((PACK / "forms.json").read_text())
    arc = json.loads((PACK / "arc.json").read_text())
    forms = set(forms_doc["conversational_forms"])
    series = arc["monthly_series"]
    summary = arc["m0_summary_row"]["data"]
    rows = arc["m0_channel_rows"]

    # --- the arc's series is the source of truth -----------------------------
    for metric in ("conversations", "leads"):
        computed = [sum(series[metric][c][i] for c in CHANNELS) for i in range(6)]
        check(f"{metric}: channels sum to total every month",
              computed == series[metric]["total"],
              f"computed {computed} vs stated {series[metric]['total']}")

    # deltas must be DERIVED from the series, never asserted independently
    d = series["_derived_deltas_m0_vs_m1"]
    for metric in ("conversations", "leads"):
        tot = series[metric]["total"]
        check(f"delta {metric}: abs is derived from series",
              d[metric]["abs"] == tot[5] - tot[4], f"expected {tot[5] - tot[4]}")
        check(f"delta {metric}: pct is derived from series",
              abs(d[metric]["pct"] - round((tot[5] - tot[4]) / tot[4] * 100, 1)) < 0.05,
              f"expected {round((tot[5] - tot[4]) / tot[4] * 100, 1)}")

    # --- m0 rows reconcile ---------------------------------------------------
    for field in ("conversations", "engaged", "applications", "leads"):
        total = sum(rows[c]["data"][field] for c in CHANNELS)
        check(f"m0 summary {field} == sum(channels)", summary[field] == total,
              f"summary {summary[field]} vs channel sum {total}")

    for c in CHANNELS:
        for metric in ("conversations", "leads"):
            check(f"m0 {c} {metric} matches the series' last month",
                  rows[c]["data"][metric] == series[metric][c][5])

        topics = rows[c]["data"]["topic_counts"]
        check(f"m0 {c} topic_counts sum to its conversations",
              sum(topics.values()) == rows[c]["data"]["conversations"],
              f"topics {sum(topics.values())} vs conv {rows[c]['data']['conversations']}")
        check(f"m0 {c} topics use only the real taxonomy",
              not (set(topics) - VALID_TOPICS), f"invalid: {set(topics) - VALID_TOPICS}")

    ah = sum(rows[c]["data"]["after_hours_conversations"] for c in CHANNELS)
    check("m0 after_hours: channels sum to summary", ah == summary["after_hours_conversations"],
          f"channels {ah} vs summary {summary['after_hours_conversations']}")
    check("m0 after_hours is ~46% of conversations",
          abs(summary["after_hours_conversations"] / summary["conversations"] - 0.46) < 0.005)

    # --- product-enforced constraints ---------------------------------------
    check(f"campaign stays under the C7 floor (n<{C7_FLOOR}) to exercise held-rate UI",
          rows["campaign"]["data"]["conversations"] < C7_FLOOR)
    for c in ("website", "messenger", "standalone"):
        check(f"{c} clears the C7 floor (n>={C7_FLOOR})",
              rows[c]["data"]["conversations"] >= C7_FLOOR)
    check("website channel row omits `reach` (aggregator omits it for website)",
          "reach" not in rows["website"]["data"])

    lp = arc["lead_pipeline"]["distribution"]
    check("lead_pipeline distribution sums to m0 leads", sum(lp.values()) == summary["leads"],
          f"{sum(lp.values())} vs {summary['leads']}")

    # --- CTA schema conformance + referential integrity ----------------------
    ctas = {k: v for k, v in persona["cta_definitions"].items() if not k.startswith("_")}
    for name, cta in ctas.items():
        action = cta["action"]
        check(f"CTA {name}: type matches action", cta["type"] == TYPE_FOR_ACTION[action],
              f"{cta['type']} != {TYPE_FOR_ACTION[action]}")
        req = REQUIRED_FIELD_FOR_ACTION[action]
        check(f"CTA {name}: has required '{req}' for action '{action}'", bool(cta.get(req)))
        check(f"CTA {name}: ai_available is true (V4 vocabulary)", cta.get("ai_available") is True)
        if action == "start_form":
            check(f"CTA {name}: formId '{cta['formId']}' resolves to a real form",
                  cta["formId"] in forms, f"known forms: {sorted(forms)}")

    routed = {c["formId"] for c in ctas.values() if c["action"] == "start_form"}
    check("every form is reachable from a CTA", forms == routed, f"unrouted: {sorted(forms - routed)}")

    programs = {p["program_id"] for p in persona["programs"]}
    for fid, f in forms_doc["conversational_forms"].items():
        if f.get("program"):
            check(f"form {fid}: program '{f['program']}' exists",
                  f["program"] in programs, f"known: {sorted(programs)}")

    # --- synthetic-person governance (roadmap §7) ----------------------------
    blob = json.dumps(persona)
    stray = re.findall(r'"[\w.]+@(?!example\.org)[\w.]+"', blob)
    check("every roster email is @example.org", not stray, f"stray: {stray}")
    phones = re.findall(r'"phone":\s*"([^"]+)"', blob)
    check("every roster phone is in the 555-01xx reserved range",
          all(p.startswith("555-01") for p in phones), f"{phones}")

    weights = persona["topic_mix"]["weights"]
    check("topic weights sum to 1.0", abs(sum(weights.values()) - 1.0) < 0.001, f"{sum(weights.values())}")
    check("topic weights use only the real taxonomy",
          not (set(weights) - VALID_TOPICS), f"invalid: {set(weights) - VALID_TOPICS}")

    print()
    if failures:
        print(f"*** {len(failures)} FAILED ***")
        return 1
    print("ALL CHECKS PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
