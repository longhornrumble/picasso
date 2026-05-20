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
#   - NO s3:* grants (milestone 2)
#   - NO Scan on any surface except where unavoidable (subject-lookups go through GSI)
#   - NO DeleteItem on picasso-audit-staging (Art 17(3)(b) carve-out, D5 G-C)
#   - NO writes to picasso-pii-subject-index UpdateItem (that grant belongs to
#     the Apply-1 backfill role, not DSAR)

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

  # Forward references to GSIs (already exist in their respective ddb modules).
  gsi_form_subjectid    = "${local.t_form_submissions}/index/PiiSubjectIdIndex"
  gsi_notif_bymessageid = "${local.t_notification_evts}/index/ByMessageId"
  gsi_subject_id        = "${local.t_subject_index}/index/PiiSubjectIdIndex"
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

output "dsar_role_arn" {
  value = aws_iam_role.dsar.arn
}

output "dsar_role_name" {
  value = aws_iam_role.dsar.name
}
