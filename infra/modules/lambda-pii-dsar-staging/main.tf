# Consumer PII Remediation Path A — capability-bundle item 1a (IAM half).
# Plan: docs/roadmap/PII-Project/CONSUMER_PII_REMEDIATION.md §"Path A Re-baseline v3"
# (PR #155, merged 2026-05-20).
#
# SCOPE — IAM ONLY at this PR (item 1a / milestone 1). The aws_lambda_function
# resource itself lands with the Python Lambda code in the follow-up PR (lambda
# submodule). This module ships:
#   - picasso-pii-dsar-staging-role (dedicated exec role per CLAUDE.md never-share-roles)
#   - inline policy granting the data-plane permissions equivalent to walking the
#     MFS-scoped surfaces (form-submissions, notification-sends + events,
#     recent-messages, conversation-summaries, audit, pii-subject-index) plus
#     PutItem on the DSAR audit table (ddb-pii-dsar-audit-staging, PR #157).
#
# CALL OUT — v3 spec wording deviation:
# The v3 re-baseline says the DSAR role "assumes (or is granted permissions
# equivalent to) the Apply-1 `pii-delete-staging` + `pii-export-staging` roles".
# The Apply-1 module (`lambda-pii-delete-staging/main.tf`) defines THREE roles —
# delete, backfill, breakglass — but NO `pii-export-staging` role was ever
# created. This module takes the "equivalent permissions" path: direct grants
# on the named surfaces, no cross-role AssumeRole. The Apply-1 delete role's
# trust policy only trusts `lambda.amazonaws.com` anyway; cross-role assume
# would also require modifying that trust policy (non-surgical).
#
# MILESTONE-1 SCOPE — explicitly NOT in this PR (lands in item 1b / milestone 2):
#   - S3 fulfillment buckets (per-tenant configured)
#   - Meta channel-mappings PSID-keyed walk
#   - ARCHIVE_BUCKET reachability (pending item 4 decision-doc completion)
#
# DELIBERATE ABSENCES (least-privilege design discipline — same convention as
# Apply-1 module's "DELIBERATELY ABSENT" block):
#   - NO s3:* grants on tenant-fulfillment buckets by default — Sprint D (lambda
#     PR #164 walker + lambda #166 writer) wired the `fulfillment_grants`
#     variable below. Default `[]` = no grants today (empirical scan 2026-05-26:
#     none of ATL642715/AUS123957/FOS402334/MYR384719 configures S3 fulfillment;
#     they all use the default email path). When the first tenant enables S3
#     fulfillment, append `{bucket=..., tenant_id=...}` to var.fulfillment_grants
#     and re-apply. Until then, the walker fails-closed with AccessDenied →
#     manual followup, by design (PII_DELETE_PIPELINE_DESIGN.md Arm 3).
#     Sprint C added the ARCHIVE_BUCKET grants only (picasso-archive-staging;
#     sessions/* prefix).
#   - NO s3:GetObject on ARCHIVE_BUCKET — walker returns keys only, not bodies
#     (operator pulls bodies via their own SSO role with `aws s3 cp`).
#   - NO Scan on any surface except where unavoidable (subject-lookups go through GSI)
#   - NO DeleteItem on picasso-audit (Art 17(3)(b) carve-out, D5 G-C)
#   - NO DeleteItem on picasso-channel-mappings (M2 Sprint B IaC follow-up:
#     psid resolver is read-only; mapping rows are tenant-config, not subject PII)
#   - NO writes to picasso-pii-subject-index UpdateItem (that grant belongs to
#     the Apply-1 backfill role, not DSAR)
#
# ACCEPTED RESIDUAL RISK — tenant isolation is code-only (D5 row F-DSAR2,
# added 2026-05-20 from DSAR Lambda item-1a audit, Security advisor F-5):
# DeleteItem on form-submissions (and the other MFS surfaces this role can
# reach once their walkers ship) does NOT carry a dynamodb:LeadingKeys
# condition bounding writes to the operator-requested tenant_id. The walker
# enforces tenant isolation in code via:
#   KeyConditionExpression = Key("tenant_id").eq(tenant_id)
# in Lambdas/lambda/picasso_pii_dsar_staging/lambda_function.py
# (_walk_form_submissions). DeleteItem Key uses the row's tenant_id+submission_id
# recovered from that bounded Query.
#
# Three IAM-level alternatives were considered and explicitly rejected for the
# Phase 0.5 posture:
#   1. Static dynamodb:LeadingKeys enumeration of all tenant_ids — defeats
#      isolation as the list expands; trivially stale on new-tenant onboarding.
#   2. Per-tenant assumed-role pattern — adds an STS hop and per-tenant role
#      provisioning; over-engineered at current scale (<50 tenants, single
#      operator).
#   3. Session policy via aws lambda invoke per-call — operator must construct
#      and inject policy per invocation; operationally fragile and error-prone.
#
# Revisit triggers (any one): tenant count >50; cross-tenant near-miss observed
# in integration tests; operator role expands beyond a single operator; any
# post-incident finding implicating cross-tenant blast radius. See
# docs/roadmap/PII-Project/privacy-risk-register.md row F-DSAR2.
#
# AUDIT CLOSURE 2026-05-26 row #19 (Security-Reviewer 🟡): the
# `aws_lambda_permission "operator_only"` below grants explicit
# `lambda:InvokeFunction` to the SSO operator role. In staging acct 525 with
# PowerUserAccess, ANY staging PowerUser principal can still invoke the
# Lambda via their own IAM grant — the env-guard (`_assert_account`) defends
# against wrong-account invocation, NOT wrong-principal invocation.
# Acceptable in staging (synthetic data + a single operator team) but MUST
# be tightened before prod cutover. Defer-with-trigger:
#   - Trigger 1: Atlanta tenant LOI signed (M6 prod gate).
#   - Trigger 2: any operator role count expansion beyond a single team.
#   - Trigger 3: 2026-08-22 calendar backstop (D2/D3/D4 currency review).
# Fix at trigger: add `Deny lambda:InvokeFunction` resource-based policy
# fragment for all principals EXCEPT the operator SSO role + service roles
# we explicitly enumerate. The env-guard is necessary but not sufficient
# as an authZ control.
#
# 2026-05-26 row #22 (Security-Reviewer 🟡) ORIGINAL CLAIM: the
# `lifecycle.ignore_changes = [filename, source_code_hash]` block was
# believed to NOT reliably prevent a placeholder re-deploy on staging apply
# — a 2026-05-26T17:37Z apply was recorded as having re-written the manual
# DSAR deploy (CodeSha256 nvWZ/fiAG... → DLAsbw3..., size 33883 → 30411).
# Tech-lead audit row #9 hypothesized a policy-document refresh triggers a
# dependency-chain rebuild that overrides ignore_changes; the documented
# Sprint-E follow-up was to split the function into a policy-independent
# module.
#
# 2026-05-29 EMPIRICAL RE-INVESTIGATION — HYPOTHESIS DISPROVEN, FIX NOT
# WARRANTED. Three `terraform plan` runs against acct 525 (this config,
# unchanged since 2026-05-20) show:
#   (a) Adding a fulfillment_grant (policy-doc change) → plan touches ONLY
#       aws_iam_role_policy.dsar; aws_lambda_function.this is NOT in the
#       changeset (targeted AND full plan). depends_on does NOT propagate an
#       in-place policy update to the function.
#   (b) A function-config change (timeout 60→61) → function updates in-place
#       but source_code_hash/filename are NOT in the diff — ignore_changes
#       holds.
#   (c) The placeholder is 305 bytes; the 2026-05-26 note's "30411 bytes"
#       cannot be this placeholder (a zip of a 305-byte file is ~300-500 B).
#       No CI workflow deploys this function's code (infra-deploy.yml only
#       RUNS verify-dsar-codesha.sh post-apply as a detection guard).
# Conclusion: the 2026-05-26 CodeSha256 change was almost certainly a
# stale/wrong manual deploy zip during that multi-zip session, NOT a
# Terraform revert. The module-split would fix a mechanism the evidence
# disproves, so it is NOT being built (Simplicity-First).
#
# RESIDUAL (cheap defense-in-depth, retained): a force-REPLACEMENT of the
# function (rare — only a function_name change forces replace) or a
# wrong-zip manual deploy would still leave inert code running. Mitigation:
#   1. `tools/verify-dsar-codesha.sh` runs in CI post-apply (detection).
#   2. If it flags placeholder/regression, operator re-deploys via
#      `aws lambda update-function-code` from the known-good zip.
# Re-open the module-split question ONLY if the verify-script ever flags a
# genuine post-apply regression that bisects to a Terraform plan entry for
# this function.

variable "pii_cmk_key_arn" {
  description = "ARN of the scoped PII CMK (module.kms_pii_staging.key_arn). The DSAR role gets kms:Decrypt/GenerateDataKey/DescribeKey on it for the data-plane walk."
  type        = string
}

variable "dsar_audit_table_arn" {
  description = "ARN of picasso-pii-dsar-audit-staging (module.ddb_pii_dsar_audit_staging[0].table_arn, PR #157). DSAR role gets PutItem only — append-only audit, never read or delete its own audit trail."
  type        = string
}

# Grant-ARN table names — single-sourced from the sibling ddb_* modules so a
# table rename cascades to the DSAR IAM grants automatically (closes the
# hardcoded-ARN seam; see locals block). Wired in root main.tf from
# `module.ddb_<table>_staging[0].table_name`. Required (no default) so a dropped
# wire fails the plan loudly rather than silently using a stale literal. These
# feed IAM grants ONLY — table names remain hardcoded constants in the Lambda
# code per F-DSAR29 (no Lambda env block here).
variable "form_submissions_table_name" {
  type = string
}

variable "notification_sends_table_name" {
  type = string
}

variable "notification_events_table_name" {
  type = string
}

variable "recent_messages_table_name" {
  type = string
}

variable "conversation_summaries_table_name" {
  type = string
}

variable "audit_table_name" {
  type = string
}

variable "subject_index_table_name" {
  type = string
}

variable "channel_mappings_table_name" {
  type = string
}

variable "session_events_table_name" {
  type = string
}

# Sprint D follow-up: per-(bucket, tenant_id) S3 fulfillment grants. The
# fulfillment walker (lambda picasso_pii_dsar_staging::_walk_fulfillment_s3,
# PR lambda#164) chases per-row `fulfillment_path` values written by the form
# handlers (lambda#166). Without an Allow on the specific `(bucket, tenant_id)`
# pair the walker hits AccessDenied → row routes to walker manual followup
# (fail-closed; design intent per PII_DELETE_PIPELINE_DESIGN.md Arm 3).
#
# Default `[]` — empirical scan 2026-05-26 found no tenant currently configures
# `fulfillment.type='s3'`. When the first tenant turns it on, append the pair:
#
#   module "lambda_pii_dsar_staging" {
#     # ...
#     fulfillment_grants = [
#       { bucket = "tenant-x-submissions", tenant_id = "TENANT_X" },
#     ]
#   }
#
# Then `terraform apply` (staging). One Allow statement is produced per pair,
# scoped to `s3:DeleteObject` on `arn:aws:s3:::{bucket}/submissions/{tenant_id}/*`.
# No `s3:GetObject` and no bucket-level `s3:ListBucket` — the walker reads the
# exact key off the form-submission row (no enumeration), and the response
# carries `objects_found` count only (no bodies). Matches the
# `submissions/{tenant_id}/{form_type}/{submission_id}.json` key pattern written
# by both form_handlers (Master_Function_Staging/form_handler.py line 984 +
# Bedrock_Streaming_Handler_Staging/form_handler.js line 696).
variable "fulfillment_grants" {
  description = "List of {bucket, tenant_id} pairs granting the DSAR role s3:DeleteObject on submissions/{tenant_id}/* in each bucket. Default empty — populate per-tenant as tenants enable type='s3' fulfillment. See module header for the gate-trigger procedure."
  type = list(object({
    bucket    = string
    tenant_id = string
  }))
  default = []
  # Audit closure 2026-05-26 row #26 (code-reviewer/Security 🟢): reject
  # malformed bucket names + non-alphanumeric tenant_ids at plan time. AWS S3
  # bucket names: 3–63 chars, lowercase + digits + hyphens, must start+end
  # alphanumeric, no underscores. Catches misconfigurations at plan, not
  # at apply (which is the IAM-charset-gotcha pattern documented in CLAUDE.md
  # — em-dash in IAM desc 2026-05-19 + # in CW tag values 2026-05-26).
  validation {
    condition = alltrue([
      for g in var.fulfillment_grants : (
        length(g.bucket) >= 3 && length(g.bucket) <= 63
        && length(g.tenant_id) > 0
        && can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", g.bucket))
        && can(regex("^[A-Za-z0-9][A-Za-z0-9-]*$", g.tenant_id))
      )
    ])
    error_message = "Each fulfillment_grants entry must have a valid S3 bucket name (3-63 chars, lowercase+digits+hyphens+dots, alphanumeric edges) and a non-empty alphanumeric+hyphen tenant_id."
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  acct   = data.aws_caller_identity.current.account_id
  region = data.aws_region.current.name
  ddb    = "arn:aws:dynamodb:${local.region}:${local.acct}:table"

  # Grant-ARN table names are single-sourced from the sibling ddb_* modules
  # (root main.tf wires `<table>_table_name = module.ddb_<table>_staging[0].table_name`).
  # A table rename now cascades to these IAM grants automatically — closing the
  # hardcoded-ARN seam that silently broke recent-messages (picasso#377). The
  # wired values are the current live names, so the rendered ARNs are byte-identical.
  # NOTE: table names stay hardcoded constants in the *Lambda code* per F-DSAR29
  # (no env vars — code-change-gated prod promotion); this wiring is IaC-internal
  # only and deliberately does NOT add a Lambda environment block.
  t_form_submissions   = "${local.ddb}/${var.form_submissions_table_name}"
  t_notification_sends = "${local.ddb}/${var.notification_sends_table_name}"
  t_notification_evts  = "${local.ddb}/${var.notification_events_table_name}"
  t_recent_messages    = "${local.ddb}/${var.recent_messages_table_name}"
  t_conv_summaries     = "${local.ddb}/${var.conversation_summaries_table_name}"
  t_audit              = "${local.ddb}/${var.audit_table_name}"
  t_subject_index      = "${local.ddb}/${var.subject_index_table_name}"
  # M2 Sprint B IaC follow-up (added Sprint C, picasso PR):
  # channel-mappings is queried via TenantIndex GSI by the psid resolver
  # (_resolve_psid_subject); session-events is queried by SESSION#{sessionId}
  # by the Meta-path walker (_walk_session_events). Both surfaces were
  # added in Sprint B (lambda PR #157) without the corresponding IaC grants
  # — surfaced + closed under Sprint C per the M2 Sprint A gap-routing rule.
  t_channel_mappings = "${local.ddb}/${var.channel_mappings_table_name}"
  t_session_events   = "${local.ddb}/${var.session_events_table_name}"
  # F-DSAR31 (closed 2026-06-03): pseudonymized session-summaries surface,
  # pk=TENANT#{tenant_hash}, filtered by pii_subject_id. NOT the operational
  # `picasso-conversation-summaries` (t_conv_summaries) — a distinct table.
  # Left as a literal: session-summaries is hand-managed (no ddb_* module to
  # single-source from). Renamed manually when its alignment slice comes.
  t_session_summaries = "${local.ddb}/picasso-session-summaries"

  # Forward references to GSIs (already exist in their respective ddb modules).
  gsi_form_subjectid    = "${local.t_form_submissions}/index/PiiSubjectIdIndex"
  gsi_notif_bymessageid = "${local.t_notification_evts}/index/ByMessageId"
  gsi_subject_id        = "${local.t_subject_index}/index/PiiSubjectIdIndex"
  gsi_chmap_tenantindex = "${local.t_channel_mappings}/index/TenantIndex"

  # M2 Sprint C — ARCHIVE_BUCKET (picasso-archive-staging). Per
  # archive-reachability-decision.md (2026-05-23): bucket exists in
  # staging acct 525 only; prod-614 has no archive surface (F-DSAR17
  # staging-only scope). Versioning ENABLED — walker uses
  # ListObjectVersions + DeleteObject(VersionId) per version.
  s3_archive_bucket   = "arn:aws:s3:::picasso-archive-staging"
  s3_archive_sessions = "arn:aws:s3:::picasso-archive-staging/sessions/*"
}

# ─────────────────────────────────────────────────────────────────────────────
# Dedicated DSAR Lambda execution role (CLAUDE.md: never share roles).
# Trust = lambda service only; no cross-role assume.
# ─────────────────────────────────────────────────────────────────────────────
data "aws_iam_policy_document" "dsar_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "dsar" {
  name               = "picasso-pii-dsar-staging-role"
  assume_role_policy = data.aws_iam_policy_document.dsar_trust.json
  description        = "Dedicated exec role for the capability-bundle DSAR Lambda (CONSUMER_PII_REMEDIATION.md v3 item 1a). IAM-only at this PR; Lambda function resource lands with Python code follow-up."
}

data "aws_iam_policy_document" "dsar" {
  # Forward ref to the future DSAR Lambda's log group. The log group itself
  # is auto-created by AWS on first Lambda invocation, OR explicitly by the
  # lambda module follow-up PR.
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${local.region}:${local.acct}:log-group:/aws/lambda/picasso-pii-dsar-staging:*"]
  }

  # form-submissions — Arm-1 spine. Query via PiiSubjectIdIndex (subject→rows),
  # GetItem for direct row reads, DeleteItem for delete-type requests.
  statement {
    sid       = "FormSubmissionsReadDelete"
    actions   = ["dynamodb:Query", "dynamodb:GetItem", "dynamodb:DeleteItem"]
    resources = [local.t_form_submissions, local.gsi_form_subjectid]
  }

  # MFS-scoped surfaces — Query to enumerate, GetItem to read, DeleteItem to
  # erase. DSAR supports access + delete + correct request types, hence the
  # GetItem grant (the Apply-1 delete role omits GetItem on these because it
  # only does delete; DSAR does both export and delete).
  statement {
    sid     = "MfsScopedReadDelete"
    actions = ["dynamodb:Query", "dynamodb:GetItem", "dynamodb:DeleteItem"]
    resources = [
      local.t_notification_sends,
      local.t_notification_evts, local.gsi_notif_bymessageid,
      local.t_recent_messages,
      local.t_conv_summaries,
    ]
  }

  # picasso-audit — READ ONLY. Art 17(3)(b) carve-out (D5 G-C row,
  # counsel-pending): audit-integrity reasoning means we surface audit rows
  # in an access-type DSAR but do NOT delete them on a delete-type DSAR.
  # If counsel later concludes deletion is required, this statement gets
  # DeleteItem added; until then, deliberately omitted.
  statement {
    sid       = "AuditReadOnly"
    actions   = ["dynamodb:Query", "dynamodb:GetItem"]
    resources = [local.t_audit]
  }

  # pii-subject-index — Query to resolve subject_identifier → pii_subject_id
  # (the lookup that opens every DSAR walk), DeleteItem to clean up the index
  # entry on delete-type requests. UpdateItem deliberately omitted (that grant
  # belongs to the Apply-1 backfill role; per never-share-roles, DSAR cannot
  # widen the index in any way).
  statement {
    sid       = "SubjectIndexReadDelete"
    actions   = ["dynamodb:Query", "dynamodb:GetItem", "dynamodb:DeleteItem"]
    resources = [local.t_subject_index, local.gsi_subject_id]
  }

  # M2 Sprint B IaC follow-up — channel-mappings TenantIndex GSI Query for
  # the psid resolver (_resolve_psid_subject). Read-only; no DeleteItem
  # (the resolver only reads PAGE# rows to compose Meta sessionIds, never
  # mutates the channel-mappings table). Grants both the base table ARN and
  # the GSI ARN because IAM does not inherit GSI ARNs from the base.
  statement {
    sid       = "ChannelMappingsReadOnly"
    actions   = ["dynamodb:Query", "dynamodb:GetItem"]
    resources = [local.t_channel_mappings, local.gsi_chmap_tenantindex]
  }

  # M2 Sprint B IaC follow-up — session-events walker keyed by
  # pk=SESSION#{sessionId}. Same Query + GetItem + DeleteItem pattern as the
  # other MFS-scoped surfaces; tenant isolation enforced upstream by
  # _resolve_psid_subject (channel-mappings TenantIndex GSI Query bounded on
  # tenantId) and by _walk_form_submissions (email path) — see F-DSAR2 row.
  statement {
    sid       = "SessionEventsReadDelete"
    actions   = ["dynamodb:Query", "dynamodb:GetItem", "dynamodb:DeleteItem"]
    resources = [local.t_session_events]
  }

  # F-DSAR31 (closed): session-summaries walker. Query pk=TENANT#{tenant_hash}
  # + FilterExpression on pii_subject_id; DeleteItem per (pk, sk) on delete.
  # tenant_hash is operator-passed on the DSAR event; tenant isolation is by
  # the tenant_hash-keyed partition (see F-DSAR2 — code-only isolation).
  statement {
    sid       = "SessionSummariesReadDelete"
    actions   = ["dynamodb:Query", "dynamodb:GetItem", "dynamodb:DeleteItem"]
    resources = [local.t_session_summaries]
  }

  # M2 Sprint C — ARCHIVE_BUCKET (picasso-archive-staging). Version-aware
  # walker (_walk_archive_bucket) needs:
  #   - ListBucketVersions on the bucket ARN (Prefix-scoped via API call;
  #     IAM-level Prefix conditions on s3:prefix would over-restrict because
  #     ListObjectVersions doesn't accept the same prefix condition shape as
  #     ListObjectsV2 — operationally simpler to scope-via-API + IAM-Allow
  #     on the bucket ARN; mitigated by the per-session_id Prefix on every
  #     API call enforced in lambda_function.py:_walk_archive_bucket).
  #   - DeleteObject on the objects ARN scoped to sessions/* prefix.
  #   - DeleteObjectVersion required to fully erase under versioning=ON
  #     (single-shot DeleteObject without VersionId only creates a
  #     delete-marker; prior versions persist).
  #   - GetObject scope-omitted: the walker returns keys only, not object
  #     bodies (keeps Lambda response < 6 MB on chatty archives); operator
  #     pulls bodies via `aws s3 cp` under their own SSO role.
  statement {
    sid       = "ArchiveBucketListVersions"
    actions   = ["s3:ListBucket", "s3:ListBucketVersions"]
    resources = [local.s3_archive_bucket]
    # Audit fix #7 (M2 phase-completion-audit, Security #1a): scope the
    # bucket-level list to the sessions/ prefix. Without this condition,
    # the DSAR role could enumerate the full bucket namespace; if future
    # non-session keys are added (config dumps, diagnostics), they would
    # be listable. The walker only ever calls list_object_versions with
    # Prefix=sessions/{sessionId}/ — this condition mirrors the API
    # constraint in IAM.
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["sessions/*"]
    }
  }
  # Closeout-audit blocker #2 (2026-05-26 phase-completion-audit, Security
  # Blocker #1): the cold-start `_check_archive_mfa_delete_posture()`
  # function at lambda_function.py:1358 calls `s3:GetBucketVersioning`
  # on the archive bucket to verify the MFA-Delete posture before any
  # walker runs. This is a bucket-level action that does NOT accept
  # `s3:prefix` context — it CANNOT live in the ListVersions statement
  # above (whose StringLike condition would deny it). Separate statement,
  # narrow action, bucket-resource-scoped.
  statement {
    sid       = "ArchiveBucketGetVersioningPosture"
    actions   = ["s3:GetBucketVersioning"]
    resources = [local.s3_archive_bucket]
  }
  statement {
    sid       = "ArchiveBucketDeleteVersions"
    actions   = ["s3:DeleteObject", "s3:DeleteObjectVersion"]
    resources = [local.s3_archive_sessions]
  }

  # Sprint D — per-tenant fulfillment-bucket DeleteObject. Renders one Allow
  # statement per (bucket, tenant_id) entry in var.fulfillment_grants; renders
  # ZERO statements when the variable is `[]` (default; current state). See
  # the variable's description block above for the gate-trigger procedure.
  # Sids are stable per pair so terraform plan diffs are readable on tenant
  # adds/removes.
  #
  # Audit closure 2026-05-26 row #25 (code-reviewer 🟢): IAM Sids have a
  # 64-char limit. A 63-char bucket name + a 20-char tenant_id would produce
  # `FulfillmentDelete{bucket}{tenant_id}` exceeding 64 chars (apply-time
  # error). Use a deterministic 12-char SHA1 prefix of `{bucket}/{tenant_id}`
  # so the Sid is always 17 + 12 = 29 chars, well under the limit, and
  # remains stable per (bucket, tenant_id) pair across plans.
  dynamic "statement" {
    for_each = { for g in var.fulfillment_grants : "${g.bucket}-${g.tenant_id}" => g }
    content {
      sid       = "FulfillmentDelete${substr(sha1("${statement.value.bucket}/${statement.value.tenant_id}"), 0, 12)}"
      actions   = ["s3:DeleteObject"]
      resources = ["arn:aws:s3:::${statement.value.bucket}/submissions/${statement.value.tenant_id}/*"]
    }
  }

  # picasso-pii-dsar-audit-staging — PutItem ONLY. Append-only event log;
  # the DSAR role cannot read or delete its own audit trail. Read is for the
  # follow-up EventBridge SLA alarm Lambda (item 3) under a separate role.
  statement {
    sid       = "DsarAuditPutOnly"
    actions   = ["dynamodb:PutItem"]
    resources = [var.dsar_audit_table_arn]
  }

  # CMK data plane — the DSAR walk reads + (on delete-type) deletes encrypted
  # items. Same grants the Apply-1 delete role gets.
  statement {
    sid       = "PiiCmkDataPlane"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
    resources = [var.pii_cmk_key_arn]
  }

  # Cold-start env-guard (same pattern as Apply-1 delete role): Lambda asserts
  # the running account vs. the CLAUDE.md account→env map (account 525 =
  # staging) and fails closed on mismatch. Prevents accidental prod invocation.
  statement {
    sid       = "StsCallerIdentity"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "dsar" {
  name   = "picasso-pii-dsar-staging-policy"
  role   = aws_iam_role.dsar.id
  policy = data.aws_iam_policy_document.dsar.json
}

# ─────────────────────────────────────────────────────────────────────────────
# Log group + Lambda function — capability-bundle item 1a (Lambda half).
# Wires the dedicated role above to the Python code shipped in lambda repo
# PR #132 (`picasso_pii_dsar_staging/lambda_function.py`).
#
# Same placeholder pattern as lambda-master-function-staging: Terraform owns
# function existence + config + role binding; real code deploys via
# `aws lambda update-function-code` per CLAUDE.md (lifecycle.ignore_changes
# prevents Terraform from reverting CLI/CI code deploys).
# ─────────────────────────────────────────────────────────────────────────────

variable "log_retention_days" {
  description = "CloudWatch log retention for the DSAR Lambda. Matches the 14d staging default per MFS Phase 2 R5."
  type        = number
  default     = 14
}

variable "operator_sso_permission_set_name" {
  description = "Name of the AWS SSO permission set whose assumed role is the sole authorized DSAR invoker (C1, PR1 fix-now-4). The reserved-SSO role ARN is computed at apply time as arn:aws:iam::<acct>:role/aws-reserved/sso.amazonaws.com/<name>. Discovered 2026-05-21 in acct 525; MERGE-BLOCKING smoke test in PR1 acceptance gate validates the grant works. Override only if a different SSO permission set is discovered."
  type        = string
  default     = "AWSReservedSSO_AdministratorAccess_c46cb409a39e2990"
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/picasso-pii-dsar-staging"
  retention_in_days = var.log_retention_days
}

data "archive_file" "placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "this" {
  function_name = "picasso-pii-dsar-staging"
  role          = aws_iam_role.dsar.arn
  runtime       = "python3.11"
  handler       = "lambda_function.lambda_handler"
  memory_size   = 256
  timeout       = 60
  architectures = ["x86_64"]

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  # No env vars — table names + expected account are constants in the Lambda
  # code (CONSUMER_PII_REMEDIATION.md v3 §"Decision A — FLIP": IaC pins the
  # account assertion; config-only prod promotion is intentionally impossible).

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # Real code deploys via `aws lambda update-function-code` from
    # Lambdas/lambda/picasso_pii_dsar_staging/. Terraform must not revert.
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.lambda, aws_iam_role_policy.dsar]
}

# C1 (PR1 fix-now-4): Lambda resource-based permission grants the SSO
# operator-role explicit `lambda:InvokeFunction`. The reserved-SSO role ARN
# is computed at apply time from the permission-set name (which is what AWS
# documents for cross-account SSO references — the underlying role ARN
# includes the permission-set ID suffix and may differ across accounts/
# permission-set assignments). The role is the only intentionally-authorized
# operator path; any other AdministratorAccess principal can still invoke via
# its IAM grant — the env-guard (`_assert_account`) is the additional defense
# against wrong-account invocation, and the operator-attestation gate (§6.7)
# captures the operator-rotation discipline.
#
# **MERGE-BLOCKING:** PR1 acceptance gates a live smoke test where the SSO
# role is assumed and the Lambda is invoked. If AccessDenied → the SSO
# permission-set discovery was wrong; surface to operator for re-discovery
# via `aws sso-admin list-permission-sets`.
resource "aws_lambda_permission" "operator_only" {
  statement_id  = "AllowOperatorInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "arn:aws:iam::${local.acct}:role/aws-reserved/sso.amazonaws.com/${var.operator_sso_permission_set_name}"
}

output "dsar_role_arn" {
  value = aws_iam_role.dsar.arn
}

output "operator_principal_arn" {
  description = "The SSO-role principal granted lambda:InvokeFunction. Used by the C1 smoke test to assume + invoke."
  value       = aws_lambda_permission.operator_only.principal
}

output "dsar_role_name" {
  value = aws_iam_role.dsar.name
}

output "function_name" {
  value = aws_lambda_function.this.function_name
}

output "function_arn" {
  value = aws_lambda_function.this.arn
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.lambda.name
}
