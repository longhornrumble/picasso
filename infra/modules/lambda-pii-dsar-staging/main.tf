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
#   - NO s3:* grants on tenant-fulfillment buckets — Sprint D will add scoped
#     s3:DeleteObject on `s3://{tenant-bucket}/submissions/{tenant_id}/*` ARN
#     pattern per PII_DELETE_PIPELINE_DESIGN.md Arm 3. Sprint C added the
#     ARCHIVE_BUCKET grants only (picasso-archive-staging; sessions/* prefix).
#   - NO s3:GetObject on ARCHIVE_BUCKET — walker returns keys only, not bodies
#     (operator pulls bodies via their own SSO role with `aws s3 cp`).
#   - NO Scan on any surface except where unavoidable (subject-lookups go through GSI)
#   - NO DeleteItem on picasso-audit-staging (Art 17(3)(b) carve-out, D5 G-C)
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

variable "pii_cmk_key_arn" {
  description = "ARN of the scoped PII CMK (module.kms_pii_staging.key_arn). The DSAR role gets kms:Decrypt/GenerateDataKey/DescribeKey on it for the data-plane walk."
  type        = string
}

variable "dsar_audit_table_arn" {
  description = "ARN of picasso-pii-dsar-audit-staging (module.ddb_pii_dsar_audit_staging[0].table_arn, PR #157). DSAR role gets PutItem only — append-only audit, never read or delete its own audit trail."
  type        = string
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  acct   = data.aws_caller_identity.current.account_id
  region = data.aws_region.current.name
  ddb    = "arn:aws:dynamodb:${local.region}:${local.acct}:table"

  # Live-verified table names (same source-of-truth as Apply-1 module locals).
  # recent-messages / conversation-summaries use the `staging-*` convention,
  # NOT `picasso-*-staging` (design §0 / B6).
  t_form_submissions   = "${local.ddb}/picasso-form-submissions-staging"
  t_notification_sends = "${local.ddb}/picasso-notification-sends-staging"
  t_notification_evts  = "${local.ddb}/picasso-notification-events-staging"
  t_recent_messages    = "${local.ddb}/staging-recent-messages"
  t_conv_summaries     = "${local.ddb}/staging-conversation-summaries"
  t_audit              = "${local.ddb}/picasso-audit-staging"
  t_subject_index      = "${local.ddb}/picasso-pii-subject-index-staging"
  # M2 Sprint B IaC follow-up (added Sprint C, picasso PR):
  # channel-mappings is queried via TenantIndex GSI by the psid resolver
  # (_resolve_psid_subject); session-events is queried by SESSION#{sessionId}
  # by the Meta-path walker (_walk_session_events). Both surfaces were
  # added in Sprint B (lambda PR #157) without the corresponding IaC grants
  # — surfaced + closed under Sprint C per the M2 Sprint A gap-routing rule.
  t_channel_mappings = "${local.ddb}/picasso-channel-mappings-staging"
  t_session_events   = "${local.ddb}/picasso-session-events-staging"

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

  # picasso-audit-staging — READ ONLY. Art 17(3)(b) carve-out (D5 G-C row,
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
