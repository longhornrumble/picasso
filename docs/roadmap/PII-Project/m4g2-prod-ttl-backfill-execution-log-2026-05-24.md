# M4.G2 — Prod TTL Backfill Execution Log

**Generated:** 2026-05-24T05:02:32.523460+00:00
**Operator:** chris@myrecruiter.ai (via SSO profile `myrecruiter-prod`)
**Operator IAM identity (Sprint E4 D4 retrospective capture, 2026-05-24):**
  - `Account`: `614056832592` (prod)
  - `UserId`: `AROAY56FDVZIM65V6ER4R:chris`
  - `Arn`: `arn:aws:sts::614056832592:assumed-role/AWSReservedSSO_AdministratorAccess_e71915a66e3fbdc7/chris`
  - SSO role: `AWSReservedSSO_AdministratorAccess_e71915a66e3fbdc7` (Administrator)
  - Snapshot command: `aws sts get-caller-identity --profile myrecruiter-prod`
  - **Note:** snapshot captured retroactively (Sprint E4); per phase-completion-audit
    finding D4 (Sec 🔴 #7). The SSO role + AWS_PROFILE were unchanged between
    the 05:02Z execution and the 06:00Z+ retroactive snapshot.
**Mode:** real-run
**Result:** real-run-complete
**Script:** `tools/m4g2_backfill.py` (preserved as Sprint 3 artifact; committed
  to repo in Sprint E4 per audit finding D7; see also §6 of
  `m4g2-prod-ttl-backfill-decision.md` and `tools/test_m4g2_backfill.py` for
  the formula unit tests added at commit time)
**Closes:** D5 row **F-DSAR19**; master plan **M4.G2**

## Execution summary

- **Start:** 2026-05-24T05:02:06.236395+00:00
- **End:** 2026-05-24T05:02:32.523460+00:00
- **Re-scan candidate count:** 46 (baseline §2 = 46; drift = +0)
- **§7 post-condition scan:** `Count = 0` — **PASS** (target 0 rows missing `ttl`)

### Tally

| Outcome | Count |
|---|---|
| Updated | 46 |
| Already had `ttl` (idempotency hit) | 0 |
| Skipped (parse error or missing `submitted_at`) | 0 |
| Errors | 0 |
| **Total processed** | **46** |

### §5.1 mystery row pre-execution gate result

GetItem on `volunteer_dare2dream_1776194362503` returned:
- `submission_id`: `volunteer_dare2dream_1776194362503`
- `submitted_at`: `2026-04-14T19:19:22.505Z`
- `status`: `pending_fulfillment`
- `ttl`: `1807730427` (decodes to **2027-04-14T19:20:27Z** ≈ `submitted_at + 364d`)

Interpretation per §5.1 rules: **future epoch → INFORMATIONAL**. The 364-day retention is unusual but introduces no risk (row simply persists ~1 day shorter than the 365d-retention sibling rows). Source unidentified — likely a manual Console set or an out-of-band write (no automated path uses a 364d formula). Idempotency safely skipped this row during Sprint 3 (the row does NOT appear in the per-row outcomes below because the re-scan filter `attribute_not_exists(ttl)` excluded it before the candidate list was built).

#### Sprint E4 / audit D5 — CloudTrail forensic lookup (2026-05-24 retroactive)

Per audit finding D5 (Sec 🟡 #4 + TL 🟡 #5), ran retrospective CloudTrail
lookup against prod-614 for the 2026-04-14 window to attempt source
identification of the mystery row:

```
aws cloudtrail lookup-events \
  --start-time 2026-04-13T00:00:00Z --end-time 2026-04-15T00:00:00Z \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=picasso_form_submissions \
  --max-results 50 \
  --profile myrecruiter-prod
```

**Returned 2 events**, both `DescribeTable` from user `ChrisIam`. **No `UpdateItem`
or `PutItem` events recorded** — consistent with the master plan v0.15 §M4
note that prod CloudTrail (`myrecruiter-management-events` trail) is
**management-events-only** (`CloudWatchLogsLogGroupArn=null`). The 364d
write would have been a DynamoDB data-plane event, which the prod trail
does not capture.

**Negative finding documented; source remains unattributed via CloudTrail.**
The forensic limit on CloudTrail is the prod trail's data-event posture
(broader gap tracked under F-DSAR21 / M9.G5).

#### Sprint F4 / audit-of-audit finding 9 — writer-fingerprint analysis

Sprint E4's CloudTrail-only investigation left an unknown-unknown
unaddressed. Per the audit-of-audit Security-Reviewer
(session `a5db671ddf84ce7fa`), the row's `submission_id` format and field
shape can be fingerprinted against known writer code paths even without
CloudTrail data events.

**Field-shape fingerprint:**

| Field | Mystery row value | BSH writer | MFS writer |
|---|---|---|---|
| `submission_id` | `volunteer_dare2dream_1776194362503` | `{formId}_{Date.now()}` — **matches exactly** (13-digit ms timestamp) | `uuid.uuid4()` hex — does NOT match |
| `submitted_at` | `2026-04-14T19:19:22.505Z` | `new Date().toISOString()` → `.NNNZ` suffix — **matches exactly** | `datetime.isoformat()` → `+00:00` suffix — does NOT match |
| `status` | `pending_fulfillment` | Both emit this — not distinguishing | Both — not distinguishing |
| `ttl` | `1807730427` (~364d) | Pre-F-DSAR18 BSH had no `ttl` field; current BSH writes `+365d`. The 364d value matches NEITHER current BSH (365d) nor MFS (no ttl until M4.G2 backfill). | N/A |

**Conclusion:** the row's `submission_id` prefix + `submitted_at` suffix both
point to **BSH `form_handler.js` as the writer**, not a manual Console set
(which was the Sprint E4 hypothesis). The 364d `ttl` likely came from one
of:
1. A transient earlier BSH revision that used 364d formula (predating
   PR #145's 365d standardization).
2. A one-off manual edit on the `ttl` attribute only, on a row whose other
   fields were written by BSH.

The most likely explanation given timing (2026-04-14 predates BSH 365d ttl
landing on 2026-05-23): the row was written by BSH BEFORE TTL was ever
added to BSH's writer; somebody later manually set `ttl=1807730427` via
Console as an ad-hoc retention experiment. The exact source remains
historically unverified, but the **writer identity is now attributed** to
BSH for the originating PutItem.

**Impact on M4.G2 closure:** none. The row has a valid future TTL, has
been correctly skipped by idempotency, and the writer-fingerprint
investigation confirms it's not a synthetic or out-of-band insertion. The
broader question of "what other prod-vs-staging IaC drift exists" remains
routed to F-DSAR21 / M9.G5.

## Per-row outcomes

| # | submission_id | submitted_at | new_ttl_epoch | evicts_at | outcome |
|---|---|---|---|---|---|
| 1 | `applications_lovebox_1775842906480` | 2026-04-10T17:41:46.482Z | 1807378906 | 2027-04-10T17:41:46.482000+00:00 | updated |
| 2 | `applications_lovebox_1775848809629` | 2026-04-10T19:20:09.631Z | 1807384809 | 2027-04-10T19:20:09.631000+00:00 | updated |
| 3 | `volunteer_dare2dream_1771260354831` | 2026-02-16T16:45:54.833Z | 1802796354 | 2027-02-16T16:45:54.833000+00:00 | updated |
| 4 | `volunteer_dare2dream_1776229040896` | 2026-04-15T04:57:20.898Z | 1807765040 | 2027-04-15T04:57:20.898000+00:00 | updated |
| 5 | `applications_lovebox_1776195892260` | 2026-04-14T19:44:52.261Z | 1807731892 | 2027-04-14T19:44:52.261000+00:00 | updated |
| 6 | `applications_lovebox_1775843317577` | 2026-04-10T17:48:37.578Z | 1807379317 | 2027-04-10T17:48:37.578000+00:00 | updated |
| 7 | `volunteer_dare2dream_1771474175286` | 2026-02-19T04:09:35.288Z | 1803010175 | 2027-02-19T04:09:35.288000+00:00 | updated |
| 8 | `applications_lovebox_1776022324137` | 2026-04-12T19:32:04.139Z | 1807558324 | 2027-04-12T19:32:04.139000+00:00 | updated |
| 9 | `applications_lovebox_1775835487511` | 2026-04-10T15:38:07.511Z | 1807371487 | 2027-04-10T15:38:07.511000+00:00 | updated |
| 10 | `love_box_referral_1770747854274` | 2026-02-10T18:24:14.275Z | 1802283854 | 2027-02-10T18:24:14.275000+00:00 | updated |
| 11 | `applications_lovebox_1776196354768` | 2026-04-14T19:52:34.770Z | 1807732354 | 2027-04-14T19:52:34.770000+00:00 | updated |
| 12 | `apply_mentor_form_1774284367527` | 2026-03-23T16:46:07.528Z | 1805820367 | 2027-03-23T16:46:07.528000+00:00 | updated |
| 13 | `volunteer_dare2dream_1769039358701` | 2026-01-21T23:49:18.703Z | 1800575358 | 2027-01-21T23:49:18.703000+00:00 | updated |
| 14 | `form_contact_1777663449291` | 2026-05-01T19:24:09.292Z | 1809199449 | 2027-05-01T19:24:09.292000+00:00 | updated |
| 15 | `applications_lovebox_1775842508885` | 2026-04-10T17:35:08.886Z | 1807378508 | 2027-04-10T17:35:08.886000+00:00 | updated |
| 16 | `volunteer_dare2dream_1770934660797` | 2026-02-12T22:17:40.798Z | 1802470660 | 2027-02-12T22:17:40.798000+00:00 | updated |
| 17 | `apply_mentor_form_1774283918142` | 2026-03-23T16:38:38.143Z | 1805819918 | 2027-03-23T16:38:38.143000+00:00 | updated |
| 18 | `applications_lovebox_1775836276793` | 2026-04-10T15:51:16.794Z | 1807372276 | 2027-04-10T15:51:16.794000+00:00 | updated |
| 19 | `volunteer_dare2dream_1777254581166` | 2026-04-27T01:49:41.168Z | 1808790581 | 2027-04-27T01:49:41.168000+00:00 | updated |
| 20 | `volunteer_dare2dream_1767462601731` | 2026-01-03T17:50:01.733Z | 1798998601 | 2027-01-03T17:50:01.733000+00:00 | updated |
| 21 | `volunteer_dare2dream_1770159165564` | 2026-02-03T22:52:45.565Z | 1801695165 | 2027-02-03T22:52:45.565000+00:00 | updated |
| 22 | `applications_lovebox_1775835387050` | 2026-04-10T15:36:27.052Z | 1807371387 | 2027-04-10T15:36:27.052000+00:00 | updated |
| 23 | `donate_items_1769212987954` | 2026-01-24T00:03:07.955Z | 1800748987 | 2027-01-24T00:03:07.955000+00:00 | updated |
| 24 | `apply_mentor_form_1774284164305` | 2026-03-23T16:42:44.305Z | 1805820164 | 2027-03-23T16:42:44.305000+00:00 | updated |
| 25 | `apply_mentor_form_1774283579079` | 2026-03-23T16:32:59.080Z | 1805819579 | 2027-03-23T16:32:59.080000+00:00 | updated |
| 26 | `applications_lovebox_1775844816999` | 2026-04-10T18:13:37.001Z | 1807380817 | 2027-04-10T18:13:37.001000+00:00 | updated |
| 27 | `volunteer_dare2dream_1768863552312` | 2026-01-19T22:59:12.314Z | 1800399552 | 2027-01-19T22:59:12.314000+00:00 | updated |
| 28 | `apply_mentor_form_1774283242108` | 2026-03-23T16:27:22.109Z | 1805819242 | 2027-03-23T16:27:22.109000+00:00 | updated |
| 29 | `volunteer_dare2dream_1768796820091` | 2026-01-19T04:27:00.092Z | 1800332820 | 2027-01-19T04:27:00.092000+00:00 | updated |
| 30 | `love_box_referral_1770666370816` | 2026-02-09T19:46:10.818Z | 1802202370 | 2027-02-09T19:46:10.818000+00:00 | updated |
| 31 | `applications_lovebox_1775836549256` | 2026-04-10T15:55:49.256Z | 1807372549 | 2027-04-10T15:55:49.256000+00:00 | updated |
| 32 | `love_box_referral_1771264683986` | 2026-02-16T17:58:03.987Z | 1802800683 | 2027-02-16T17:58:03.987000+00:00 | updated |
| 33 | `love_box_referral_1769793722165` | 2026-01-30T17:22:02.167Z | 1801329722 | 2027-01-30T17:22:02.167000+00:00 | updated |
| 34 | `volunteer_dare2dream_1767768787397` | 2026-01-07T06:53:07.400Z | 1799304787 | 2027-01-07T06:53:07.400000+00:00 | updated |
| 35 | `applications_lovebox_1775836461360` | 2026-04-10T15:54:21.361Z | 1807372461 | 2027-04-10T15:54:21.361000+00:00 | updated |
| 36 | `applications_lovebox_1775849359994` | 2026-04-10T19:29:19.995Z | 1807385359 | 2027-04-10T19:29:19.995000+00:00 | updated |
| 37 | `donate_items_1769203473438` | 2026-01-23T21:24:33.439Z | 1800739473 | 2027-01-23T21:24:33.439000+00:00 | updated |
| 38 | `love_box_referral_1776379224277` | 2026-04-16T22:40:24.279Z | 1807915224 | 2027-04-16T22:40:24.279000+00:00 | updated |
| 39 | `applications_lovebox_1776195768689` | 2026-04-14T19:42:48.691Z | 1807731768 | 2027-04-14T19:42:48.691000+00:00 | updated |
| 40 | `volunteer_dare2dream_1770793694379` | 2026-02-11T07:08:14.380Z | 1802329694 | 2027-02-11T07:08:14.380000+00:00 | updated |
| 41 | `volunteer_lovebox_1776279935375` | 2026-04-15T19:05:35.377Z | 1807815935 | 2027-04-15T19:05:35.377000+00:00 | updated |
| 42 | `applications_lovebox_1775840029731` | 2026-04-10T16:53:49.733Z | 1807376029 | 2027-04-10T16:53:49.733000+00:00 | updated |
| 43 | `applications_lovebox_1776275615954` | 2026-04-15T17:53:35.956Z | 1807811615 | 2027-04-15T17:53:35.956000+00:00 | updated |
| 44 | `volunteer_dare2dream_1776085160756` | 2026-04-13T12:59:20.758Z | 1807621160 | 2027-04-13T12:59:20.758000+00:00 | updated |
| 45 | `love_box_referral_1778015262868` | 2026-05-05T21:07:42.870Z | 1809551262 | 2027-05-05T21:07:42.870000+00:00 | updated |
| 46 | `volunteer_dare2dream_1768199410755` | 2026-01-12T06:30:10.757Z | 1799735410 | 2027-01-12T06:30:10.757000+00:00 | updated |


## Audit trail note (§6.7 explicit per the spec)

Per the M4.G2 decision doc §6.7, prod-614 CloudTrail (`myrecruiter-management-events` trail)
captures management events only — NO data events on DynamoDB. Verified via
`aws cloudtrail get-event-selectors` on 2026-05-24. **This log file IS the audit
artifact** for the 46 `UpdateItem` calls; CloudTrail does not have a record of them.

For regulator defensibility, this file records: which rows, what value, when written,
by which operator (SSO identity), and the §7 post-condition verifying every prior gap
is closed.

## Closure status

- **M4.G2** — ✅ CLOSED 2026-05-24
- **D5 F-DSAR19** — ✅ CLOSED 2026-05-24 (residual L/L)
- **Master plan §M4** residual deferrals: 2 → 1 (only **F-DSAR23** widget-bullet remains)

