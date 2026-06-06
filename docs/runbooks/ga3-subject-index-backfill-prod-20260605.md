# G-A.3 subject-index backfill — PROD 614 execution log (2026-06-05)

Audit trail for the §P5.2 backfill (prod CloudTrail does not record DDB data events, so this committed log is the audit trail). PII-safe: submission_ids + counts + a sha256 prefix (`khash`) of `tenant_id|normalized_email` only — never a raw email.

```
[2026-06-05T23:37:54.730Z] Account guard PASSED: PROFILE=myrecruiter-prod → Account=614056832592
[2026-06-05T23:37:54.731Z] Scanning prod picasso_form_submissions...
[2026-06-05T23:37:55.498Z] Scanned 47 rows
  applications_lovebox_1775842906480                 index_create           stamp=stamped khash=7900744f0756
  applications_lovebox_1775848809629                 index_create           stamp=stamped khash=7900744f0756
  volunteer_dare2dream_1771260354831                 index_create           stamp=stamped khash=27554cacc32b
  volunteer_dare2dream_1776229040896                 index_create           stamp=stamped khash=a9ee96da8b7e
  applications_lovebox_1776195892260                 index_create           stamp=stamped khash=7ca171d6189c
  applications_lovebox_1775843317577                 index_create           stamp=stamped khash=7900744f0756
  volunteer_dare2dream_1771474175286                 index_create           stamp=stamped khash=8aef7f0226e0
  applications_lovebox_1776022324137                 index_create           stamp=stamped khash=7900744f0756
  applications_lovebox_1775835487511                 index_create           stamp=stamped khash=7900744f0756
  love_box_referral_1770747854274                    unindexed_no_email     stamp=stamped khash=-
  applications_lovebox_1776196354768                 index_create           stamp=stamped khash=e10cfe7853e2
  apply_mentor_form_1774284367527                    index_create           stamp=stamped khash=d384de445e0b
  volunteer_dare2dream_1769039358701                 index_create           stamp=stamped khash=d95dda5af72d
  form_contact_1777663449291                         index_create           stamp=stamped khash=7900744f0756
  applications_lovebox_1775842508885                 index_create           stamp=stamped khash=7900744f0756
  volunteer_dare2dream_1770934660797                 index_create           stamp=stamped khash=60ada4864b43
  apply_mentor_form_1774283918142                    index_create           stamp=stamped khash=d384de445e0b
  applications_lovebox_1775836276793                 index_create           stamp=stamped khash=7900744f0756
  volunteer_dare2dream_1777254581166                 index_create           stamp=stamped khash=5c895b7f9f2d
  volunteer_dare2dream_1767462601731                 index_create           stamp=stamped khash=71ca8a2b7093
  volunteer_dare2dream_1770159165564                 index_create           stamp=stamped khash=e365281d401e
  applications_lovebox_1775835387050                 index_create           stamp=stamped khash=7900744f0756
  donate_items_1769212987954                         index_create           stamp=stamped khash=489000105a34
  apply_mentor_form_1774284164305                    index_create           stamp=stamped khash=d384de445e0b
  apply_mentor_form_1774283579079                    index_create           stamp=stamped khash=d384de445e0b
  applications_lovebox_1775844816999                 index_create           stamp=stamped khash=7900744f0756
  volunteer_dare2dream_1768863552312                 index_create           stamp=stamped khash=5618f43e9550
  apply_mentor_form_1774283242108                    index_create           stamp=stamped khash=d384de445e0b
  volunteer_dare2dream_1768796820091                 index_create           stamp=stamped khash=96514be9af50
  love_box_referral_1770666370816                    unindexed_no_email     stamp=stamped khash=-
  applications_lovebox_1775836549256                 index_create           stamp=stamped khash=7900744f0756
  love_box_referral_1771264683986                    unindexed_no_email     stamp=stamped khash=-
  love_box_referral_1769793722165                    unindexed_no_email     stamp=stamped khash=-
  volunteer_dare2dream_1767768787397                 index_create           stamp=stamped khash=04f92a1c589f
  applications_lovebox_1775836461360                 index_create           stamp=stamped khash=7900744f0756
  applications_lovebox_1775849359994                 index_create           stamp=stamped khash=7900744f0756
  donate_items_1769203473438                         index_create           stamp=stamped khash=c3fd521b9960
  love_box_referral_1776379224277                    unindexed_no_email     stamp=stamped khash=-
  applications_lovebox_1776195768689                 index_create           stamp=stamped khash=7426de4b8fbd
  volunteer_dare2dream_1770793694379                 index_create           stamp=stamped khash=7d87712251c5
  volunteer_lovebox_1776279935375                    unindexed_no_email     stamp=stamped khash=-
  applications_lovebox_1775840029731                 index_create           stamp=stamped khash=7900744f0756
  applications_lovebox_1776275615954                 index_create           stamp=stamped khash=7426de4b8fbd
  volunteer_dare2dream_1776085160756                 index_create           stamp=stamped khash=b1c568e77f86
  love_box_referral_1778015262868                    unindexed_no_email     stamp=stamped khash=-
  volunteer_dare2dream_1768199410755                 index_create           stamp=stamped khash=870bb98716ee
  volunteer_dare2dream_1776194362503                 index_create           stamp=stamped khash=4fede3ef4870
{
  "start_ts": "2026-06-05T23:37:54.731Z",
  "mode": "apply",
  "profile": "myrecruiter-prod",
  "expected_account": "614056832592",
  "form_table": "picasso_form_submissions",
  "index_table": "picasso-pii-subject-index",
  "scanned_rows": 47,
  "index_gets": 40,
  "results": [
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "unindexed_no_email:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "unindexed_no_email:stamped",
    "index_create:stamped",
    "unindexed_no_email:stamped",
    "unindexed_no_email:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "unindexed_no_email:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "unindexed_no_email:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "index_create:stamped",
    "unindexed_no_email:stamped",
    "index_create:stamped",
    "index_create:stamped"
  ],
  "tally": {
    "stamped": 47,
    "already_stamped": 0,
    "unindexed": 7,
    "unresolved": 0,
    "errors": 0,
    "skipped": 0
  },
  "end_ts": "2026-06-05T23:39:11.702Z",
  "post_condition_missing_subject_id": 0,
  "post_condition_pass": true,
  "result": "apply-complete"
}
```
