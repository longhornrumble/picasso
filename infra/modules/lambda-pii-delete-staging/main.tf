# Consumer PII Remediation Path A, Phase 2 — dedicated identity-driven
# delete-pipeline IAM identities. Design: docs/roadmap/PII_DELETE_PIPELINE_DESIGN.md
# §7 / §3 / §5 (rev 3, gate-cleared).
#
# APPLY 1 SCOPE (design §13 step 2): ROLES ONLY. No Lambda, no Function URL,
# no resource-based invoke policy yet — those land in Phase-2 step 7 (the
# delete Lambda) when the executor code exists. The roles must exist now so
# the root-level `aws_kms_key_policy.pii_staging` (NB-A) can name their ARNs.
#
# Three identities, deliberately separate (CLAUDE.md: never share roles):
#   - delete      : the future delete-pipeline Lambda exec role (§7)
#   - backfill    : a short-lived one-time role for the §5 raw_email back-fill;
#                   removed after the back-fill run (NB-F). It holds the ONE
#                   write the delete role must NEVER have — UpdateItem on the
#                   index — so the delete pipeline's blast radius can't widen.
#   - breakglass  : MFA-gated, zero standing permissions; its only power is
#                   being a kms:Decrypt principal in the PII key policy,
#                   replacing "every staging admin can decrypt by default"
#                   (Q5 Row-7 / feedback_secret_admin_unread_antipattern).
#
# The CMK ARN arrives as a variable (kms-pii-staging has no role dependency)
# so kms → these roles → root key-policy is a DAG, not a cycle.

variable "pii_cmk_key_arn" {
  description = "ARN of the scoped PII CMK (module.kms_pii_staging.key_arn). The delete + back-fill roles get kms:Decrypt/GenerateDataKey on it; the root aws_kms_key_policy reciprocally allow-lists these roles."
  type        = string
}

# Grant-ARN table names — single-sourced from the sibling ddb_* modules so a
# table rename cascades to these delete-pipeline IAM grants automatically
# (closes the hardcoded-ARN seam; see locals block). Wired in root main.tf from
# `module.ddb_<table>_staging[0].table_name`. Required (no default) so a dropped
# wire fails the plan loudly. IAM grants only — no Lambda env block (this module
# creates IAM roles, not a function).
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

variable "session_events_table_name" {
  type = string
}

variable "subject_index_table_name" {
  type = string
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  acct   = data.aws_caller_identity.current.account_id
  region = data.aws_region.current.name
  ddb    = "arn:aws:dynamodb:${local.region}:${local.acct}:table"

  # Grant-ARN table names are single-sourced from the sibling ddb_* modules
  # (root main.tf wires `<table>_table_name = module.ddb_<table>_staging[0].table_name`).
  # A table rename cascades to these IAM grants automatically — closing the
  # hardcoded-ARN seam that silently broke recent-messages (picasso#377). Var
  # values are the live names, so the rendered ARNs are byte-identical.
  t_form_submissions   = "${local.ddb}/${var.form_submissions_table_name}"
  t_notification_sends = "${local.ddb}/${var.notification_sends_table_name}"
  t_notification_evts  = "${local.ddb}/${var.notification_events_table_name}"
  t_recent_messages    = "${local.ddb}/${var.recent_messages_table_name}"
  t_conv_summaries     = "${local.ddb}/${var.conversation_summaries_table_name}"
  t_session_events     = "${local.ddb}/${var.session_events_table_name}"
  t_subject_index      = "${local.ddb}/${var.subject_index_table_name}"

  # Forward references — these resources do not exist at Apply 1; an IAM
  # policy naming a not-yet-created ARN is valid (the grant is simply inert
  # until the resource exists). Avoids a later policy-edit PR.
  #   - form-submissions GSI PiiSubjectIdIndex : created Apply 3 (design §13 step 4)
  #   - notification-events GSI ByMessageId    : already exists (ddb module)
  #   - subject-index GSI PiiSubjectIdIndex    : already exists (ddb module)
  #   - delete-audit table                     : created Phase-2 step 7 (§11)
  gsi_form_subjectid    = "${local.t_form_submissions}/index/PiiSubjectIdIndex"
  gsi_notif_bymessageid = "${local.t_notification_evts}/index/ByMessageId"
  gsi_subject_id        = "${local.t_subject_index}/index/PiiSubjectIdIndex"
  t_delete_audit        = "${local.ddb}/picasso-pii-delete-audit-staging"
}

# ─────────────────────────────────────────────────────────────────────────────
# 1. Dedicated delete-pipeline execution role (§7). NEVER the MFS role.
# ─────────────────────────────────────────────────────────────────────────────
data "aws_iam_policy_document" "delete_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "delete" {
  name                 = "picasso-pii-delete-staging-role"
  permissions_boundary = var.permissions_boundary_arn
  assume_role_policy   = data.aws_iam_policy_document.delete_trust.json
  description          = "Dedicated exec role for the Phase-2 PII delete pipeline (design §7). Role-only at Apply 1; the Lambda lands Phase-2 step 7."
}

data "aws_iam_policy_document" "delete" {
  # Forward ref to the future delete Lambda's log group. Matches the MFS
  # module grant shape (CreateLogStream + PutLogEvents; the log group itself
  # is created with the Lambda in step 7).
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${local.region}:${local.acct}:log-group:/aws/lambda/picasso-pii-delete-staging:*"]
  }

  # S1 form-submissions — the Arm-1 spine. Query the new PiiSubjectIdIndex
  # GSI (projection ALL), delete by primary key, GetItem for any direct read.
  statement {
    sid       = "FormSubmissionsReadDelete"
    actions   = ["dynamodb:Query", "dynamodb:DeleteItem", "dynamodb:GetItem"]
    resources = [local.t_form_submissions, local.gsi_form_subjectid]
  }

  # S2/S3/S4/S5/S8 — Query to enumerate the subject's rows, DeleteItem to
  # erase them. No GetItem, no Put/Update, no Scan (least-privilege §7).
  statement {
    sid     = "DeleteScopedTablesReadDelete"
    actions = ["dynamodb:Query", "dynamodb:DeleteItem"]
    resources = [
      local.t_notification_sends,
      local.t_notification_evts, local.gsi_notif_bymessageid,
      local.t_recent_messages,
      local.t_conv_summaries,
      local.t_session_events, # S8 — tenant scoping is CODE-enforced (design §2 S8/§11); IAM is table-ARN-level only
    ]
  }

  # The email→subject index: Query/Delete a subject's entries (Arm 1) + the
  # GSI. Scan is granted ONLY on the index table ARN (Sweep B corrupted-row
  # integrity sweep — design §4/§7); it is NOT granted on any other table.
  statement {
    sid       = "SubjectIndexReadDelete"
    actions   = ["dynamodb:Query", "dynamodb:DeleteItem"]
    resources = [local.t_subject_index, local.gsi_subject_id]
  }
  statement {
    sid       = "SubjectIndexSweepScan"
    actions   = ["dynamodb:Scan"]
    resources = [local.t_subject_index]
  }

  # Append-only non-PII delete-audit (§11). PutItem ONLY — the delete role
  # cannot read or delete the audit trail.
  statement {
    sid       = "DeleteAuditPutOnly"
    actions   = ["dynamodb:PutItem"]
    resources = [local.t_delete_audit]
  }

  # Cold-start prod-promotion env guard (§10): the executor asserts the
  # running account vs. the CLAUDE.md account→env map and fails closed.
  statement {
    sid       = "StsCallerIdentity"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }

  # CMK data plane — the pipeline must read+rewrite (delete) encrypted items.
  statement {
    sid       = "PiiCmkDataPlane"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
    resources = [var.pii_cmk_key_arn]
  }

  # DELIBERATELY ABSENT (design §3 Arm 3 / §7 / §14 Q4 — fail-closed):
  # NO s3:DeleteObject. Conditional S3 fulfillment buckets are
  # tenant-configured and not IaC-managed; an unknown bucket ⇒ no grant ⇒
  # the DSAR is a hard partial-failure (never silently "complete") until the
  # Q4 runbook adds a resource-ARN-scoped grant for that concrete
  # (bucket, tenant_id) pair. No bucket is registered at Apply 1.
}

resource "aws_iam_role_policy" "delete" {
  name   = "picasso-pii-delete-staging-policy"
  role   = aws_iam_role.delete.id
  policy = data.aws_iam_policy_document.delete.json
}

# ─────────────────────────────────────────────────────────────────────────────
# 2. Short-lived raw_email back-fill role (§5 / NB-F). Created for the
#    one-time back-fill run and removed after. Holds UpdateItem on the index
#    — the single write the delete role must never have.
# ─────────────────────────────────────────────────────────────────────────────
data "aws_iam_policy_document" "backfill_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backfill" {
  name                 = "picasso-pii-backfill-staging-role"
  permissions_boundary = var.permissions_boundary_arn
  assume_role_policy   = data.aws_iam_policy_document.backfill_trust.json
  description          = "Short-lived one-time role for the §5 raw_email back-fill. Remove after the back-fill run completes (design NB-F)."
}

data "aws_iam_policy_document" "backfill" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${local.region}:${local.acct}:log-group:/aws/lambda/picasso-pii-backfill-staging:*"]
  }

  # The one write — UpdateItem on the index table ARN ONLY (adds raw_email /
  # raw_email_unrecoverable to existing rows). Not on the GSI, not on any
  # other table.
  statement {
    sid       = "BackfillIndexUpdateOnly"
    actions   = ["dynamodb:UpdateItem"]
    resources = [local.t_subject_index]
  }

  # Recover the raw submitted email from the matching form-submission row(s).
  statement {
    sid       = "BackfillFormSubmissionsRead"
    actions   = ["dynamodb:Query", "dynamodb:GetItem"]
    resources = [local.t_form_submissions, local.gsi_form_subjectid]
  }

  statement {
    sid       = "PiiCmkDataPlane"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [var.pii_cmk_key_arn]
  }
}

resource "aws_iam_role_policy" "backfill" {
  name   = "picasso-pii-backfill-staging-policy"
  role   = aws_iam_role.backfill.id
  policy = data.aws_iam_policy_document.backfill.json
}

# ─────────────────────────────────────────────────────────────────────────────
# 3. Break-glass role (§6). MFA-gated, ZERO standing permissions. Its only
#    capability is being an allow-listed kms:Decrypt principal in the PII key
#    policy — assumable only by an account principal presenting MFA, off by
#    default. This is the deliberate replacement for root-delegated decrypt
#    (the Q5 Row-7 anti-pattern the channel-tokens key still has).
# ─────────────────────────────────────────────────────────────────────────────
data "aws_iam_policy_document" "breakglass_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${local.acct}:root"]
    }
    condition {
      test     = "Bool"
      variable = "aws:MultiFactorAuthPresent"
      values   = ["true"]
    }
  }
}

resource "aws_iam_role" "breakglass" {
  name               = "picasso-pii-breakglass-staging"
  assume_role_policy = data.aws_iam_policy_document.breakglass_trust.json
  description        = "MFA-gated PII CMK break-glass. No permissions policy by design; power is solely the kms:Decrypt allow-list entry in aws_kms_key_policy.pii_staging."
  # Intentionally NO aws_iam_role_policy attached.
}

output "delete_role_arn" {
  value = aws_iam_role.delete.arn
}

output "backfill_role_arn" {
  value = aws_iam_role.backfill.arn
}

output "breakglass_role_arn" {
  value = aws_iam_role.breakglass.arn
}

variable "permissions_boundary_arn" {
  description = "ARN of the picasso-workload-boundary permission boundary (module.iam_workload_boundary). Caps this role's effective permissions to the intersection with the boundary. Null = no boundary (keeps the module usable standalone)."
  type        = string
  default     = null
  validation {
    condition     = var.permissions_boundary_arn == null || can(regex("^arn:aws:iam::[0-9]{12}:policy/", var.permissions_boundary_arn))
    error_message = "permissions_boundary_arn must be null or a valid IAM policy ARN."
  }
}
