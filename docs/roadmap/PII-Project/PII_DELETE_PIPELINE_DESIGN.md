# PII Delete Pipeline Design — Consumer PII Remediation Path A, Phase 2

**Status:** DESIGN, **rev 3** (post gate-round-2 remediation). No code in this document —
it resolves the named Phase-2 design decisions so implementation can proceed with the
surface set, the dedicated role, the CMK key-policy, and the executor authz model fully
specified.

**Gate history:** rev 1 FAILED (Security-Reviewer + system-architect; 6 blockers) → rev 2
(user-authorized full remediation) → rev 2 re-gate: **all 6 prior blockers independently
verified GENUINELY closed by code trace**, but the remediation introduced 4 new
document-level blockers + strong-recs → rev 3 (user-authorized full remediation). §15 =
two-round remediation log. Rev 3's 4 new-blocker fixes (NB-A/B/C/D) get a targeted
re-verification before any implementation/CMK apply.

**Governs:** the greenfield identity-driven delete pipeline (Path A Phase 2). Companion
to `PII_SURFACE_INVENTORY.md` and `PII_IDENTITY_CONTRACT.md` (Phase-1 locked decisions —
§3 "index outlives submissions", §4 Gmail-only normalization, §2 per-tenant controller).

**Inputs (locked):** plan `~/.claude/plans/let-s-work-on-the-cheerful-manatee.md`
§"Phase 1 audit + re-audit — MANDATORY Phase-2 gate items" (G1–G8);
`PII_SURFACE_INVENTORY.md`; `PII_IDENTITY_CONTRACT.md` §2–§5/§7.

**Live-state anchor (verified 2026-05-19):** `picasso-pii-subject-index-staging` ACTIVE
in acct 525, `SSEDescription: null` (no CMK), MFS env+IAM applied, **zero live-tenant
traffic**. Authoritative live table names (`aws dynamodb list-tables --profile
myrecruiter-staging`, cross-checked vs. each `infra/modules/ddb-*/main.tf` `name =`):

| Surface | Authoritative name | Note |
|---|---|---|
| form-submissions | `picasso-form-submissions-staging` | |
| notification-sends | `picasso-notification-sends-staging` | |
| notification-events | `picasso-notification-events-staging` | **`ses_event_handler.py:21` writer bug — NB-E §12** |
| recent-messages | **`staging-recent-messages`** | non-`picasso-…-staging` convention |
| conversation-summaries | **`staging-conversation-summaries`** | non-`picasso-…-staging` convention |
| session-events | `picasso-session-events-staging` | **S8 — PSID-bearing, §9** |
| channel-mappings | `picasso-channel-mappings-staging` | **NOT-CONSUMER — removed, §2** |
| pii-subject-index | `picasso-pii-subject-index-staging` | |

The **pre-live-traffic envelope** (§13) is the hard deadline for G2 (CMK) + G8 (alarm) +
the `raw_email` write/back-fill. Still open (zero live-tenant traffic).

---

## 0. Gate map (rev-3 status)

| Gate | Resolved in | Status |
|---|---|---|
| G1 orphan-sweep | §4 | Mechanism (Sweep A GSI-walk authoritative; Sweep B delete-only) |
| G2 scoped CMK pre-traffic | §6 + §13 | Mechanism (condition-based Deny — service-principal-safe; two-apply split) |
| G3 verifiable-request raw addr | §5 + §3 | Mechanism Arm 1 (raw_email + back-fill); Arm 2/all-arms intake-token guard |
| G4 dedicated delete role | §7 | Mechanism (ARN-scoped, fail-closed, resource-policy invoke guard) |
| G5 real-DynamoDB test | §12 | Built in implementation; matrix incl. S2→S3 + S8 + invoke-authz negatives |
| G6 prod-promotion env guard | §10 | Mechanism (`sts:GetCallerIdentity`; both delete Lambda + `pii_subject.py`) |
| G7 design inputs a/b/c | §3 + §9 | (a) S4/S5/**S8** + intake-gated; (b) ARN-scoped S3 + stale-config x-ref; (c) allow-list + guard test |
| G8 UNINDEXED alarm | §8 + §13 | Mechanism; `form_handler` log string fixed; lands Apply-1 |

No gate deferred. Genuine **counsel dependencies** (privacy-notice/retention legal
sufficiency) are flagged, not engineering deferrals (plan's existing legal-scoping gate).

---

## 1. What Phase 1 shipped / what Phase 2 consumes

- `pii_subject_id` = opaque `psub_`+uuid4().hex, minted at `_store_submission`, written
  additively on form-submissions + (when email normalizes) into the index keyed
  `(tenant_id, normalized_email)`, GSI `PiiSubjectIdIndex`. Per-tenant. Forward-compatible.
- **Phase-2 executor request contract:** the pipeline is the **executor** for an
  identity-verified request the Phase-4 DSAR intake (the **resolver**) produces. Shape
  (≥1 arm; one `tenant_id`): `(tenant_id, resolver_authorization, pii_subject_id?,
  page_id+psid?)`. `resolver_authorization` is mandatory for **every** arm (NB-C — not
  just Arm 2). A machine-readable JSON Schema for this shape is a committed Phase-2
  artifact (NB-H, §3/§14). The resolver assembles arms + performs identity verification;
  the executor refuses any arm lacking a valid resolver authorization (fail-closed).

---

## 2. DELETE-scoped surface set (authoritative allow-list, live-verified names)

Explicit allow-list, fail-closed (a surface not listed is never touched; carve-outs by
*absence* §9). Per-tenant always.

| # | Surface (table) | Delete locator (per `tenant_id`) | Access pattern |
|---|---|---|---|
| S1 | `picasso-form-submissions-staging` | rows where `pii_subject_id == :sid` | New GSI `PiiSubjectIdIndex` (HASH `tenant_id`, RANGE `pii_subject_id`, **`projection_type = ALL`** — NB-D, so `submission_id`/`session_id`/`conversation_id`/`message_id`s/`fulfillment_path` are all projected; no extra GetItem). Query the GSI; delete by `(tenant_id, submission_id)`. Collect those attrs for downstream surfaces. |
| S2 | `picasso-notification-sends-staging` | PK `TENANT#{tenant_id}`, SK `{iso_date}#email#{ses_message_id}`; rows whose `submission_id` ∈ S1 set | Query PK partition, filter `submission_id ∈ set`. Delete `(pk,sk)`. Collect each non-empty `message_id`. Verified: `form_handler.py:790,808` writes SES `MessageId` as `message_id` + SK suffix; failed-send rows write `message_id:''` (`:832`) — deleted here, excluded from the S3 join (no SES event exists for them). |
| S3 | `picasso-notification-events-staging` | rows for each non-empty `message_id` from S2 (GSI `ByMessageId`) | Verified: `ses_event_handler.py:53,193` writes the **same SES `MessageId`** (`mail.messageId`), GSI `ByMessageId` keyed on it → join by identical value. Query GSI, delete `(pk,sk)`. **Depends on NB-E writer fix** (else S3 may be vacuously empty in staging — §12). |
| S4 | `staging-recent-messages` | `sessionId` ∈ {S1 `session_id`/`conversation_id`} ∪ {Arm-2 exact Meta session ids} | **Exact** `KeyConditionExpression sessionId = :sid` (no `LIKE`; Arm 2 → `:sid="meta:{page_id}:{psid}"`). Delete all `(sessionId, messageTimestamp)`. No TTL (Inventory Finding 1) — delete is the only removal path until Phase 3. |
| S5 | `staging-conversation-summaries` | `sessionId` ∈ the same set | PK `sessionId`, exact match. Delete by `sessionId`. |
| S7 | Conditional S3 fulfillment | `s3://{tenant-fulfillment-bucket}/submissions/{tenant_id}/{form_type}/{submission_id}.json` per S1 `submission_id` | Bucket resolved from tenant config **∪ each S1 row's stored `fulfillment_path`** (N3 stale-config defense). `DeleteObject`, resource-ARN-scoped IAM (§7). |
| **S8** | `picasso-session-events-staging` | **Arm 2 only.** rows where `pk = SESSION#meta:{page_id}:{psid}` | PSID confirmed in payload (`Meta_Response_Processor` emits `session_id:meta:{pageId}:{psid}`+`psid`; `Analytics_Event_Processor` writes `pk=SESSION#{session_id}`, `sk=STEP#{n}`). **PK-direct Query** on the exact `SESSION#meta:{page_id}:{psid}` (`page_id`+`psid` are Arm-2 inputs), delete all `(pk,sk)`. **IAM grants only table-ARN-level `Query`/`DeleteItem` — it CANNOT scope a PK Query by `tenant_id`; therefore the executor MUST verify each retrieved row's `tenant_id` attribute equals the request tenant before deleting** (NB-B; defense vs. the theoretical shared-pageId case; also enforced in §11). |

**S6 `channel-mappings` REMOVED (NOT-CONSUMER).** Code-verified: `Meta_OAuth_Handler`
writes only page-level `PK=PAGE#{pageId}, SK=CHANNEL#messenger`;
`Meta_Response_Processor.updateLastUserMessageAt` updates that same page row;
**no per-PSID rows exist**. `lastUserMessageAt` is page-wide infra (Meta 24h-window for
*all* the page's users) + the encrypted page token = tenant integration, not consumer
PII; deleting it = over-deletion breaking Meta for all users. Only persistent Meta PSID
consumer data = S4 + S5 + S8. `channel-mappings` is absent from the allow-list and §7.

**Session-id linkage (S4/S5):** S1 rows are the Arm-1 spine (`session_id`/
`conversation_id`); Arm 2 supplies Meta session ids independently (§3). A session with
conversation content but no form submission *and* no Meta identity = anonymous,
TTL-ONLY, out of scope. Pre-form conversational PII (known subject chatted, then later
submitted in a different session) = a **conscious scope boundary** (§14 Q6; Phase-5
counsel), not an oversight.

---

## 3. Identity graph, executor authz, resolver/executor contract

Three arms, unioned, per-tenant. **All identity verification is upstream (Phase-4
resolver). The executor refuses any arm without a valid resolver authorization
(fail-closed, ALL arms — NB-C).**

### Executor invocation authz (NB-C — closes the Arm-1 deletion oracle)
Two layers, both Phase-2 deliverables:
1. **Lambda resource-based policy:** `lambda:InvokeFunction` is allowed ONLY to the
   Phase-4 DSAR-intake Lambda execution-role ARN (placeholder at Phase-2 build; bound at
   Phase-4 integration) + the break-glass role. Explicit Deny to all other principals
   incl. staging `PowerUserAccess`. The delete Lambda has NO function URL and is not
   otherwise publicly/account-wide invocable.
2. **Code-level resolver-authorization guard (defense in depth):** every invocation
   (Arm 1 *and* Arm 2 *and* Sweeps) must carry a `resolver_authorization` proving the
   Phase-4 intake verified the subject's identity for that arm. Missing/invalid ⇒ reject,
   no deletion. Deletion code paths stay **disabled (token-required, fail-closed) until
   the Phase-4 intake exists** — Phase 2 builds the guard; Phase 4 issues the
   authorization. This generalizes the rev-2 Arm-2 guard to all arms (rev-2 left Arm 1
   ungated — that was NB-C).

### Arm 1 — `pii_subject_id` (email-rooted spine)
`(tenant_id, pii_subject_id)`. S1 (GSI) → S2 → S3; supplies session ids for S4/S5 and
submission_ids for S7. Identity verification = Phase-4 corrected verifiable-request bound
to the **raw submitted email** (§5).

### Arm 2 — Meta PSID
`(tenant_id, page_id, psid)`. Surfaces S4 + S5 + **S8** (exact `meta:{page_id}:{psid}`).
The Phase-4 challenge = a round-trip message to the Messenger thread via the Meta Send
API (provider-trusted equivalent of the email round-trip: only the human controlling the
thread can return the code; PSID enumeration via Graph cannot read messages sent to the
thread). Arm-2 deletion stays disabled until the Phase-4 Meta-challenge intake exists.

### Resolver/executor contract (B4 — Q1 resolved; NB-H makes it machine-checkable)
> The Phase-4 DSAR intake (**resolver**) identifies every applicable identity arm for one
> data subject, performs identity verification, and issues `resolver_authorization` +
> the arm inputs to the Phase-2 **executor**. The executor is pure, idempotent,
> multi-invocable: given a validly-authorized request it deletes exactly the supplied
> arms, completely. Mixed-identity completeness is the resolver's responsibility; the
> executor guarantees per-arm completeness + idempotency so arms may be invoked
> separately or together safely.

**NB-H:** a machine-readable **JSON Schema** for the executor input
(`tenant_id`, `resolver_authorization`, `pii_subject_id?`, `page_id+psid?`) is published
as a committed Phase-2 artifact (`docs/roadmap/` or the module) and is the contract
Phase-4 consumes — the prose contract is not the only record. Cross-arm correlation
*heuristics* remain out of scope (privacy-safe; over-linking is the risk).

### Arm 3 — Conditional S3 fulfillment
`fulfillment_type:'s3'` → tenant-configured bucket (`form_handler.py:967-980`), not
IaC-managed. Resolution = tenant config **∪ S1 rows' stored `fulfillment_path`** (N3
closes "tenant removed S3 fulfillment from config after objects written"). No
fulfillment declared anywhere ⇒ no-op (logged). Declared but `DeleteObject` fails ⇒ hard
partial-failure (§11), never reported complete. IAM: `s3:DeleteObject` is
**resource-ARN-scoped** `arn:aws:s3:::{bucket}/submissions/{tenant_id}/*` per known
`(bucket,tenant_id)` pair (cannot use `s3:prefix` — that's `ListBucket`-only);
**tenant-segment wildcard forbidden**; an unknown bucket ⇒ denied ⇒ hard partial-failure
until the IAM policy is updated (runbook §14 Q4) — fail-closed, never silent.

---

## 4. Orphan-sweep (G1) — two sweeps, both required

### Sweep A — form-submissions rows with an unindexed `pii_subject_id`
Covers ids from **all** unindexed paths: `pii_subject` best-effort fallback (logs
`UNINDEXED`) **and** `form_handler.py` import-failure fallback (mints `psub_…`, **no**
`UNINDEXED` log — NB §8). **Closure mechanism:** deletion enumerates S1 via the new
`PiiSubjectIdIndex` GSI keyed on the form-submissions table's own `pii_subject_id`
attribute — written **regardless** of whether the email-index recorded it. *The email
index is the email→sid resolver for DSAR; it is NEVER the deletion enumeration source.*
The GSI (projection ALL — NB-D) makes the walk correct **and** bounded (resolves the
rev-1 partition-scan scale/timeout risk). Backfill (pre-Phase-1 no-`pii_subject_id` rows;
decision #5 email-match + Phase-3 TTL) is distinct from orphan-sweep (Phase-1+ rows with
a sid not in the email index — handled for *deletion* by the GSI walk).

### Sweep B — corrupted email-index rows, **delete-only (N2)**
An index row with missing/empty `pii_subject_id` permanently blocks future indexing for
that `(tenant_id, normalized_email)`. Sweep: scan the index for such rows and **DELETE**
them (never "repair" — re-minting is non-idempotent + creates dangling subjects).
Deleting unblocks the key (next genuine submission re-creates a clean row). Periodic
integrity sweep, scoped to the index table ARN only (§7). Both sweeps are a Phase-2
completion gate and require a valid `resolver_authorization` of an integrity-sweep type
(Sweeps are not subject-deletes but still must not be arbitrarily invocable — §3 layer 1
resource-policy applies).

---

## 5. Corrected verifiable-request — raw submitted address (G3, Arm 1)

**Decision: `raw_email` on the index row (Option X)** — the only choice consistent with
locked Contract §3 (index outlives submissions); Option Y (join at challenge time) breaks
when submissions TTL-age while the index persists.

- Phase 2 extends the index put in `pii_subject.get_or_create_pii_subject_id` to also
  persist `raw_email` (exact submitted string) additively.
- **Existing Phase-1 index rows** never receive it via the conditional put. **One-time
  back-fill (NB-F-scoped):** a bounded job scans the index; for any row lacking
  `raw_email`, recovers it from the matching form-submissions row(s) and writes via
  `UpdateItem`; if no matching submission exists, sets `raw_email_unrecoverable=true`
  (Phase-4 then treats it as verification-not-possible-via-index, explicit, no silent
  gap). **The back-fill runs under a dedicated, short-lived back-fill role** —
  `dynamodb:UpdateItem` on the index ARN only + `Query`/`GetItem` on form-submissions +
  `kms:Decrypt`/`GenerateDataKey` on the CMK — **NOT** the delete role (the delete role
  must never hold `UpdateItem` on the index; that would widen its blast radius). The
  back-fill role is created for the run and removed after (NB-F).
- Back-fill completion is on the **pre-live-traffic hard-deadline list** (§13, NB-I).
- The CMK (§6) is the compensating control for the added density; mandatory pre-traffic
  regardless ⇒ Option X adds no un-mitigated exposure.

---

## 6. Scoped CMK (G2) — key, policy (NB-A), tables, sequencing

Customer-managed KMS key, scoped (NOT platform-wide). Q5 Row-7 precedent +
`feedback_secret_admin_unread_antipattern`. `infra/modules/kms-pii-staging/`,
`count = var.env=="staging"?1:0`, rotation enabled, single-Region,
alias `alias/picasso-pii-staging`.

**Tables under this CMK** (6 — S6 removed; live-verified names; wired by module output
not literals): `picasso-pii-subject-index-staging`, `picasso-form-submissions-staging`,
`picasso-notification-sends-staging`, `picasso-notification-events-staging`,
`staging-recent-messages`, `staging-conversation-summaries`. **Plus S8**
`picasso-session-events-staging` joins this CMK set (it now holds Arm-2-deletable PSID
PII — NB-B) ⇒ **7 tables**. S7's tenant-configured S3 bucket is out of this DynamoDB
CMK's scope (§14 Q4). TTL-ONLY/carve-out/NOT-CONSUMER keep default SSE.

**Key policy — NB-A fix (the rev-2 `NotPrincipal`+`Deny` would have blocked the DynamoDB
service principal `dynamodb.amazonaws.com` → `KMSAccessDeniedException` → all encrypted
tables inoperable after Apply 2; `kms-channel-tokens-staging` avoids this only by an
over-broad root `kms:*` which is the Q5 Row-7 bug):**

| Statement | Principal | Effect / Actions | Why |
|---|---|---|---|
| Key admin (NO data plane) | account root | Allow `kms:Create*,Describe*,Enable*,List*,Put*,Update*,Revoke*,Disable*,Get*,Delete*,ScheduleKeyDeletion,CancelKeyDeletion,TagResource,UntagResource` — **no `Decrypt`/`Encrypt`/`GenerateDataKey`/`kms:*`** | key administration only; root is not a data-plane path |
| Data-plane allow | MFS role, dedicated delete role, the short-lived back-fill role, `GitHubActionsDeployRole` (also `kms:CreateGrant` for DynamoDB SSE) | Allow `kms:Decrypt`,`GenerateDataKey`,`DescribeKey` | only principals that legitimately touch PII at rest; DynamoDB obtains its own grant via the deploy role's `CreateGrant` at table-association time |
| **Explicit decrypt Deny — condition-based (NB-A)** | `Principal: { AWS: "*" }` | **Deny** `kms:Decrypt`,`GenerateDataKey` **`Condition: StringNotEqualsIfExists { aws:PrincipalArn: [MFS-role, delete-role, back-fill-role, deploy-role, break-glass] }`** | An IAM `PowerUserAccess` `kms:Decrypt` is overridden by this explicit key-policy Deny. **`StringNotEqualsIfExists` + `aws:PrincipalArn`:** AWS **service** principals (`dynamodb.amazonaws.com`, `logs.amazonaws.com`) and grant-based DynamoDB SSE operations do **not** populate `aws:PrincipalArn` → with `IfExists` the key is absent → the condition does not match → **the Deny does not fire for the service principal** (DynamoDB SSE keeps working). Construction basis: the repo's Secrets Manager policies (`main.tf:754-766`) use `StringNotEquals` (IAM-only resource — no service-principal data-plane caller, so no `IfExists` needed there); this CMK **deliberately extends that to `StringNotEqualsIfExists`** precisely because a key used by DynamoDB SSE *does* have service-principal/grant data-plane callers that must not be caught. NOT `NotPrincipal`+`Deny` (the rev-2 footgun). §12 tests both arms (PowerUser denied; DynamoDB-service/grant allowed). |
| Break-glass | named role, MFA-gated, off by default | Allow `kms:Decrypt` | replaces "all staging admins decrypt by default" (Q5 Row-7) |

`kms:Decrypt` is provably unavailable to general staging Admin/PowerUser (explicit
condition-Deny beats IAM allow), while DynamoDB SSE (service principal / grant) is
unaffected (the `IfExists` clause). §12 has a key-policy negative test for **both**: a
PowerUser-equivalent is denied; a simulated DynamoDB-service/grant path is allowed.

**Sequencing — split apply, IAM→KMS propagation verified (S-Seq), and the NB-G
constraint:**
1. **Apply 1:** dedicated delete IAM role + the short-lived back-fill role + the CMK
   (key policy references all required role ARNs — all now exist) + the UNINDEXED
   metric-filter/alarm (§8). No table association.
2. **Verify** in acct 525: key exists; policy present; MFS-role + delete-role grants for
   `GenerateDataKey` propagated (explicit check — IAM↔KMS is eventually-consistent).
3. **Apply 2:** associate the CMK with the 7 tables. In-place SSE-key change, no data
   migration; must complete before any live-tenant write.
4. **Apply 3 (separate, AFTER Apply-2 fully completes — NB-G):** add the
   `PiiSubjectIdIndex` GSI to `picasso-form-submissions-staging`. DynamoDB permits only
   **one** in-flight table update; CMK-association and GSI-add on the *same* table in the
   *same* apply ⇒ `ResourceInUseException`. They MUST be separate, sequential applies.

Verified zero-traffic + `SSEDescription: null` ⇒ envelope still open.

---

## 7. Dedicated delete IAM role (G4) + invoke policy (NB-C) + back-fill role (NB-F)

Dedicated execution role — never MFS (CLAUDE.md). `infra/modules/lambda-pii-delete-staging/`.
Trusts only `lambda.amazonaws.com`; one function; no resource wildcards.

| Resource (live-verified) | Actions | NOT granted |
|---|---|---|
| `picasso-form-submissions-staging` + GSI `PiiSubjectIdIndex` (proj ALL) | `Query`,`DeleteItem`,`GetItem` | Put/Update/Scan/`*` |
| `picasso-notification-sends-staging` | `Query`,`DeleteItem` | Put/Update/Scan |
| `picasso-notification-events-staging` + GSI `ByMessageId` | `Query`,`DeleteItem` | Put/Update/Scan |
| `staging-recent-messages` | `Query`,`DeleteItem` | Put/Update/Scan |
| `staging-conversation-summaries` | `Query`,`DeleteItem` | Put/Update/Scan |
| `picasso-session-events-staging` (S8) | `Query`,`DeleteItem` | Put/Update/Scan/GetItem — tenant scoping is **code-enforced** (§2 S8, §11), IAM is table-ARN-level only |
| `picasso-pii-subject-index-staging` + GSI | `Query`,`DeleteItem`, **`Scan` on this ARN only** (Sweep B) | Put/**Update**/Scan-elsewhere |
| S7 fulfillment bucket(s) | `s3:DeleteObject`,`s3:ListBucket` ARN-scoped `…/submissions/{tenant_id}/*` per known pair | bucket-wide; tenant wildcard |
| CMK (§6) | `kms:Decrypt`,`GenerateDataKey`,`DescribeKey` | `kms:*`, key admin |
| `picasso-pii-delete-audit-staging` (new) | `dynamodb:PutItem` only | read/delete of audit |
| `sts:GetCallerIdentity` | Allow (cold-start guard §10) | — |
| own CloudWatch log group | standard | cross-group |
| **channel-mappings, sms-usage, audit, all TTL-ONLY/carve-out** | **absent — unreachable** | everything |

**Lambda resource-based policy (NB-C):** `lambda:InvokeFunction` Allow ONLY = Phase-4
DSAR-intake role ARN + break-glass; explicit Deny all else (incl. PowerUser). No function
URL.

**Short-lived back-fill role (NB-F), created for the §5 run, removed after:**
`dynamodb:UpdateItem` on the index ARN only + `Query`/`GetItem` on
`picasso-form-submissions-staging` + `kms:Decrypt`/`GenerateDataKey` on the CMK. Distinct
from the delete role (which never gets index `UpdateItem`).

---

## 8. UNINDEXED observability (G8)

CloudWatch metric filter on the MFS log group → metric → alarm → existing SNS pipeline
(MFS Phase 5.5). Lands in **Apply 1** (pre-live-traffic; corrected placement — the apply
already happened at Q1 merge-now, so it joins the CMK in the same envelope, per the
handoff TL;DR). **N1 fix:** `form_handler.py`'s import-failure fallback log currently has
no `UNINDEXED` token (`"pii_subject index module unavailable (non-fatal): %s"`) — Phase 2
adds `UNINDEXED` so **both** unindexed paths trip the alarm. §4 Sweep A is the
*correctness* backstop (GSI walk deletes unlogged ids too); the alarm is the
*early-warning* for the IAM/throttle failure mode. (Tracked as an open Phase-2 code item —
not yet in the worktree code; honest.)

---

## 9. Carve-outs & exclusions (G7c)

Allow-list-only, fail-closed; carve-outs by **absence** + a build-failing guard test
(§12) asserting no carve-out name appears in §2 or §7.

**Named never-deleted set (assert ABSENT from §2/§7):** `picasso-sms-usage-staging`
(TCPA 4-yr, SMS-twin) · SMS opt-in/STOP consent (SMS-twin surface) · COPPA (counsel) ·
`picasso-audit-staging` (audit integrity) · `picasso-channel-mappings-staging`
(NOT-CONSUMER — S6) · all TTL-ONLY/NOT-CONSUMER.

**`picasso-session-events-staging` = S8, OPERATIONALIZED (NB-B).** PSID confirmed in
payload (code-verified). Engineering decision = treat as Arm-2-reachable: **S8 is in the
§2 allow-list, the §7 role, the §12 zero-residue + delete test, and the §13 step-6 build
list** — not a §9 assertion that could slip. Delete locator = PK-direct
`SESSION#meta:{page_id}:{psid}` with code-level `tenant_id` verification (the
`tenant-date-index` GSI cannot scope by PSID; PK-direct is correct + efficient; IAM
cannot tenant-scope a PK Query — §2 S8/§11). The **legal sufficiency** of delete-vs-TTL
remains a Phase-5 counsel determination (privacy-notice wording) — flagged, not an
engineering deferral.

---

## 10. Prod-promotion env guard (G6)

`PII_SUBJECT_INDEX_TABLE` + new delete-pipeline table-name env vars default to staging
names. **Guard (predicate specified):** at cold start, both the delete Lambda **and**
`pii_subject.py` call `sts:GetCallerIdentity`, resolve the account id, assert it vs. the
CLAUDE.md account→env map (prod 614056832592 / staging 525409062831 / dev 372666940362).
Account-env vs. resolved-table-env mismatch, or a required table-name env var unset ⇒
**raise a configuration error at cold start** (fail-closed; no silent staging-name
fallback in a non-staging account). Secondary: explicit `ENVIRONMENT` consistency. Built
Phase 2; enforced at the Phase-5-counsel-gated prod cutover (no prod apply in Phase 2).
`sts:GetCallerIdentity` is in the §7 role.

---

## 11. Core pipeline properties

- **Idempotent** (deletes; Sweep B delete-only). **Per-tenant, single-controller.**
- **Multi-invocable executor** but **never invocable without a valid
  `resolver_authorization`** (§3 NB-C) and never invocable by a non-allow-listed
  principal (resource policy).
- **S8 tenant verification (NB-B):** before deleting an S8 row the executor asserts the
  row's `tenant_id` attribute == request tenant (IAM cannot enforce this on a PK Query).
- **Non-PII delete-audit** → `picasso-pii-delete-audit-staging`: `tenant_id`, opaque
  `pii_subject_id`/hashed PSID-ref, timestamp, **per-arm + per-surface** counts, terminal
  status. No raw PII. Append-only (`PutItem`-only).
- **Partial failure is loud:** any surface fails ⇒ `INCOMPLETE`, audit names the
  arm+surface, retried/escalated, **never** reported complete (GDPR Art 17). The
  resolver learns per-arm status from the audit/return; a retried run is safe (idempotent)
  and restarts the affected arm.
- **Carve-out honored** by allow-list + guard test.

---

## 12. Test strategy (G5)

- **Real-DynamoDB test (mandatory, built in implementation):** DynamoDB Local / scratch
  table. Covers: multi-arm multi-surface delete; idempotent re-run; Sweep A (unindexed
  id via GSI); Sweep B (corrupted row **deleted**); Arm-2 exact `meta:{page}:{psid}` on
  S4/S5; **S8 session-events delete + tenant-verification** (seed two tenants sharing a
  contrived pageId → assert only the request tenant's rows deleted); **S2→S3
  cross-table join, non-vacuous** (seed a real `notification-events` row keyed by a known
  SES `message_id`; assert the GSI query finds + deletes it — NOT just "assert empty",
  which would pass vacuously if NB-E is unfixed); partial-failure → INCOMPLETE; S7
  stale-config (config dropped, S1 `fulfillment_path` present → still deleted).
- **NB-E required code fix (not a "verify"):** `ses_event_handler/lambda_function.py:21`
  builds the table handle from a **module-load literal** `_dynamodb.Table('picasso-
  notification-events')` — an env var cannot override it. Phase 2 changes it to
  env-driven (`os.environ.get('NOTIFICATION_EVENTS_TABLE', …)`, resolved in-handler) +
  IaC passes the staging-suffixed name. Without this, the staging `ses_event_handler`
  writes to a wrong/absent table, S3 is empty, and the S2→S3 test passes vacuously. This
  is a small, additive, surgical change to an existing Lambda — required for S3 deletion
  correctness.
- **Invoke-authz negatives (NB-C):** a non-allow-listed principal is denied
  `lambda:InvokeFunction`; the executor rejects any arm (incl. Arm 1) lacking a valid
  `resolver_authorization`.
- **CMK key-policy test (NB-A):** a PowerUser-equivalent principal is **denied**
  `kms:Decrypt`; a simulated DynamoDB-service/grant path is **allowed** (proves the
  `StringNotEqualsIfExists`/`aws:PrincipalArn` construction doesn't brick SSE).
- **Carve-out guard test (build-failing):** every §9 name absent from §2 + §7.
- **Forward-compat fixtures:** old-shape rows (no `pii_subject_id`; index row without
  `raw_email`) read without `KeyError`; back-fill handles missing-`raw_email` +
  `raw_email_unrecoverable`.
- **IAM negatives:** delete role denied on carve-out/channel-mappings, on Put/Update, on
  Scan outside the index ARN, on tenant-wildcard S3, on index `UpdateItem` (back-fill
  role only).
- **Zero-residue:** post-delete every §2 surface (S1–S5, S7, **S8**) empty for the
  subject; every §9 carve-out row for an overlapping tenant still present.
- Pre-existing broken `@mock_dynamodb` `test_form_handler`/`test_dynamodb_operations`
  remain out of scope (separate refactor) — do not chase.

---

## 13. Build sequencing & the pre-live-traffic envelope

Zero live-tenant traffic + `SSEDescription:null` (verified) ⇒ envelope open; closes at
first real submission.

1. **(rev 3)** → targeted re-verify of NB-A/B/C/D → user ratification.
2. **Apply 1:** delete role + short-lived back-fill role + CMK + key policy (NB-A) +
   UNINDEXED alarm (§8). **Verify** IAM→KMS propagation.
3. **Apply 2:** associate CMK with the 7 tables. **Hard deadline: before any live-tenant
   staging traffic.**
4. **Apply 3 (separate, AFTER Apply-2 completes — NB-G):** add `PiiSubjectIdIndex` GSI
   (projection ALL) on `picasso-form-submissions-staging`.
5. `raw_email` additive index-write + the one-time back-fill under the back-fill role
   (§5). **On the hard pre-live-traffic deadline list (NB-I).**
6. `ses_event_handler.py` writer fix (NB-E) — before relying on the S3 surface.
7. Delete-pipeline Lambda on the dedicated role + resource policy (NB-C): Arm 1
   (S1→S2→S3, S4/S5, S7), Arm 2 (S4/S5/**S8** + token-gated), Arm 3, Sweeps A+B; all arms
   resolver-authorization-gated; non-PII per-arm audit; loud partial-failure. Publish the
   executor-input JSON Schema (NB-H). Arm-2 deletion disabled until the Phase-4
   Meta-challenge intake exists.
8. Real-DynamoDB tests (§12). `phase-completion-audit` (independent — do NOT re-run
   Phase-1's). Staging soak.
9. Prod-promotion env guard built (§10); enforced only at the Phase-5 counsel-gated
   cutover.

**Pre-live-traffic hard-deadline block (all before any real tenant submits):** Apply 2
(CMK on 7 tables) · Apply 1 (UNINDEXED alarm) · Apply 3 (GSI) · step 5 (`raw_email`
write + back-fill completion) · step 6 (`ses_event_handler` fix). Steps 7–9 = the
substantive build (delete logic + tests), gated additionally on the Phase-4 intake for
any *enabled* deletion.

---

## 14. Open decisions (resolved vs. genuine deferrals)

| # | Question | Rev-3 position | Status |
|---|---|---|---|
| Q1 | Cross-arm correlation | RESOLVED (B4): resolver assembles+verifies; executor pure/idempotent/multi-invocable; JSON-Schema contract (NB-H). Correlation heuristics out of scope. | resolved |
| Q2 | channel-mappings PSID scoping | RESOLVED (B2/S6): no per-PSID rows; removed, NOT-CONSUMER. | resolved |
| Q3 | form-submissions enumeration | RESOLVED: GSI `PiiSubjectIdIndex` (proj **ALL** — NB-D); bounded Query. | resolved |
| Q4 | Tenant-configured S3 bucket not IaC-managed | Operational deferral: new bucket = PR+plan/apply+verify before that tenant's DSAR is "complete"; fail-closed until then. Runbook. | deferral (operational, explicit, fail-closed) |
| Q5 | Option X vs Y | RESOLVED: X + back-fill (dedicated back-fill role — NB-F). | resolved |
| Q6 | Pre-form conversational PII | Conscious scope boundary; legal sufficiency = Phase-5 counsel. No architecture change. | counsel dependency |
| Q7 | session-events PSID | RESOLVED (NB-B): operationalized as S8 across §2/§7/§12/§13. Legal sufficiency of delete-vs-TTL = Phase-5 counsel. | resolved (eng) + counsel (legal) |

No 🔴 remains. Q4 + the *legal-sufficiency* halves of Q6/Q7 are genuine counsel
dependencies under the plan's existing legal-scoping gate — engineering builds the
capability, counsel rules meet/exceed. Not engineering deferrals, not skirting.

---

## 15. Remediation log (two rounds — traceability)

**Round 1** — Security-Reviewer `ac27d724dbc4673cd` + system-architect `a20d3cf0e84c0da09`,
both **FAIL**, 6 blockers (B1–B6) + strong-recs. User authorized full remediation
2026-05-19 → rev 2. (Per-finding dispositions retained: B1 CMK Deny; B2 S6 removed;
B3 Arm-2 token; B4 resolver/executor; B5 SES-MessageId join verified; B6 names reconciled;
plus S-S1 GSI, S-RawEmail back-fill, S-S3scope, S-LIKE, S-Seq, S-SE, S-EnvGuard,
S-PreForm, N1, N2, N3, N4.)

**Round 2 re-gate** — Security-Reviewer `a7a7041092e7a7280` (**FAIL**) + system-architect
`a5ba2cf9663929025` (**PASS-WITH-FIXES**). Both **independently re-traced and verified all
6 prior blockers GENUINELY closed by code** (not papered over). The rev-2 remediation
introduced new document-level blockers — fixed in rev 3:

| Finding | Disposition in rev 3 |
|---|---|
| NB-A `NotPrincipal`+`Deny` bricks `dynamodb.amazonaws.com` (SR-1) | §6: condition-based Deny `Principal:"*"` + `StringNotEqualsIfExists aws:PrincipalArn:[roles]` (service principals/grants don't set the key → Deny doesn't fire for SSE). Repo-consistent (Secrets Manager `main.tf:754-766`). §12 dual key-policy test. |
| NB-B S8 session-events declared not operationalized (SR-2 + SA-NB3) | §2 adds **S8** (PK-direct `SESSION#meta:{page}:{psid}` + code-level tenant verify); added to §7 role, §12 zero-residue + delete test, §13 step 6/7, §9, §0, §14 Q7. Not deferred. |
| NB-C executor invoke authz absent — Arm-1 oracle (SR-3) | §3 + §7: Lambda resource-based policy (invoke = Phase-4 role + break-glass only, Deny PowerUser, no function URL) **plus** code-level resolver-authorization required for **all** arms (generalized the rev-2 Arm-2-only guard). §12 invoke-authz negatives. |
| NB-D form-submissions GSI projection unspecified (SA-NB1) | §2 S1 / §7 / §13 step 4: **`projection_type = ALL`** explicit. |
| NB-E `ses_event_handler.py:21` literal not env-overridable (SR-6) | §12/§2 S3/§13 step 6: reclassified from "verify" to a **required code fix** (env-driven table) + non-vacuous S3-populated join test. |
| NB-F back-fill IAM unspecified (SR-4) | §5/§7: dedicated **short-lived back-fill role** (`UpdateItem` index ARN only + `Query`/`GetItem` form-submissions + CMK), distinct from the delete role; removed after run. |
| NB-G CMK-assoc + GSI-add same apply ⇒ ResourceInUseException (SA-NB2) | §6/§13: Apply 3 (GSI) is a **separate apply AFTER Apply 2 fully completes**; stated DynamoDB one-in-flight-update constraint. |
| NB-H prose-only Phase-2↔4 contract (SA-NB4) | §3/§14: a committed machine-readable **JSON Schema** for the executor input is a Phase-2 artifact Phase-4 consumes. |
| NB-I back-fill not on the pre-traffic deadline list (SA-NB5) | §13: explicit pre-live-traffic hard-deadline block now includes the `raw_email` write+back-fill + the `ses_event_handler` fix. |

Rev 3 defers **no gate**. Genuine deferrals: Q4 (operational, fail-closed runbook) and
the *legal-sufficiency* of Q6/Q7 (Phase-5 counsel — the plan's pre-existing legal gate).
The 4 new-blocker fixes (NB-A/B/C/D) get a **targeted re-verification** (not a full 3rd
whole-doc gate — proportionality per `feedback_multi_audit_reactive_loop`) before any
implementation or CMK apply.
