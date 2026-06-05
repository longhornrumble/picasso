# Per-tenant offboarding purge Lambda — IAM + function (P1, Class A surfaces).
# Code: Lambdas/lambda/picasso_pii_tenant_purge_staging/ (lambda#214).
# Design: docs/roadmap/PII-Project/tenant-offboarding-purge-design.md (picasso#361).
# Routes to data-retention-strategy.md §9 "per-tenant offboarding purge".
#
# WHY A DEDICATED ROLE (not the DSAR role): CLAUDE.md never-share-roles, and the
# blast radii differ — DSAR does per-subject FilterExpression+DeleteItem; this
# Lambda does whole-tenant-partition DeleteItem. Separate role = separate audit
# of who can erase a whole tenant.
#
# SCOPE — P1 Class A surfaces ONLY (cleanly tenant-partitioned). The role grants
# Query + DeleteItem on exactly the 5 surfaces the handler walks, PutItem on the
# dedicated purge audit table, and sts:GetCallerIdentity for the cold-start
# account guard. Deliberate absences (least-privilege):
#   - NO GetItem: the handler only Query-s partitions; it never GetItem-s.
#   - NO kms grant: all 5 Class-A tables are on AWS-owned default DDB SSE
#     (verified 2026-06-03 — picasso-form-tables / ddb-pii-subject-index /
#     ddb-notification-sends / ddb-notification-events all lack a
#     server_side_encryption{kms_key_arn} block). DeleteItem needs no decrypt;
#     Query on default-SSE tables needs no kms:Decrypt. If any Class-A table is
#     later moved to the PII CMK, add a kms:Decrypt statement here.
#   - NO DeleteItem on the purge audit table (PutItem only — append-only).
#   - NO access to carve-out surfaces (sms-consent, SES suppression, audit
#     tables) — they survive the purge by design (strategy §5). Not granting
#     reach to them is the structural enforcement.
#   - NO Class B/C/D surfaces (recent-messages, session-events, archive,
#     session-summaries, Glacier) — TTL age-out / P2 / age-out per design §3.
#
# TENANT ISOLATION is code-only (same accepted residual as DSAR F-DSAR2): the
# DeleteItem grants carry no dynamodb:LeadingKeys condition; the handler bounds
# every delete to the operator-supplied tenant via KeyConditionExpression
# (PK=tenant_id or pk=TENANT#{tenant_id}). Acceptable at current scale (single
# operator, <50 tenants); revisit at the same triggers as F-DSAR2.
#
# INVOKE AUTHZ (same staging caveat as DSAR): the operator_only permission grants
# the SSO operator role lambda:InvokeFunction, but any staging PowerUser can still
# invoke via their own IAM. The account guard defends wrong-account, not
# wrong-principal. Tighten with a Deny-all-except-operator resource policy before
# any prod cutover (this Lambda is staging-only today — account guard refuses
# outside 525).

variable "purge_audit_table_arn" {
  description = "ARN of picasso-pii-tenant-purge-audit (module.ddb_pii_tenant_purge_audit_staging[0].table_arn). The purge role gets PutItem only - append-only audit, never read or delete its own trail."
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the purge Lambda. 7d aligns with the post-retention-strategy staging standard (data-retention-strategy.md §5 #5)."
  type        = number
  default     = 7
}

variable "operator_sso_permission_set_name" {
  description = "AWS SSO permission set whose assumed role is the authorized invoker. Reserved-SSO role ARN computed at apply time. Matches the DSAR module default."
  type        = string
  default     = "AWSReservedSSO_AdministratorAccess_c46cb409a39e2990"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  acct   = data.aws_caller_identity.current.account_id
  region = data.aws_region.current.name
  ddb    = "arn:aws:dynamodb:${local.region}:${local.acct}:table"

  # Live-verified table names (same source-of-truth as the DSAR module + the
  # Lambda's constants).
  t_form_submissions   = "${local.ddb}/picasso-form-submissions-staging"
  t_notification_sends = "${local.ddb}/picasso-notification-sends"
  t_notification_evts  = "${local.ddb}/picasso-notification-events"
  t_subject_index      = "${local.ddb}/picasso-pii-subject-index"
  t_sms_usage          = "${local.ddb}/picasso-sms-usage"
  # D2: the prod single-key form-submissions table is tenant-queryable only via
  # the tenant-timestamp-index GSI (present on both staging + prod tables).
  gsi_form_tenant_ts = "${local.t_form_submissions}/index/tenant-timestamp-index"
  # Class C (F-DSAR31): session-summaries, pk=TENANT#{tenant_hash}. Purged as a
  # whole-partition delete when the caller supplies tenant_hash.
  t_session_summaries = "${local.ddb}/picasso-session-summaries"

  # notification-events is queried via the ByMessageId GSI (chained from the
  # notification-sends message_ids). Query needs the GSI ARN; DeleteItem needs
  # the base-table ARN.
  gsi_notif_bymessageid = "${local.t_notification_evts}/index/ByMessageId"
}

# Dedicated execution role (CLAUDE.md never-share-roles). Trust = lambda only.
data "aws_iam_policy_document" "purge_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "purge" {
  name               = "picasso-pii-tenant-purge-staging-role"
  assume_role_policy = data.aws_iam_policy_document.purge_trust.json
  description        = "Dedicated exec role for the per-tenant offboarding purge Lambda (P1 Class A). Query+DeleteItem on 5 tenant-partitioned surfaces + PutItem on the purge audit table. See module header for least-privilege absences."
}

data "aws_iam_policy_document" "purge" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${local.region}:${local.acct}:log-group:/aws/lambda/picasso-pii-tenant-purge-staging:*"]
  }

  # Class A surface: form-submissions. Query (base table on staging; the
  # tenant-timestamp-index GSI on the prod single-key table) + DeleteItem per
  # row. DescribeTable lets the purger discover the table key schema once
  # (cached) to adapt query+delete shape across the account-divergent key
  # schema (D2).
  statement {
    sid       = "FormSubmissionsQueryDelete"
    actions   = ["dynamodb:Query", "dynamodb:DeleteItem", "dynamodb:DescribeTable"]
    resources = [local.t_form_submissions, local.gsi_form_tenant_ts]
  }

  # Class A surface: notification-sends. Query PK=TENANT#{tenant_id}, DeleteItem.
  statement {
    sid       = "NotificationSendsQueryDelete"
    actions   = ["dynamodb:Query", "dynamodb:DeleteItem"]
    resources = [local.t_notification_sends]
  }

  # Class A surface: notification-events. Query the ByMessageId GSI (chained
  # from sends), DeleteItem on the base table. Both ARNs because IAM does not
  # inherit the GSI ARN from the base table.
  statement {
    sid       = "NotificationEventsQueryDelete"
    actions   = ["dynamodb:Query", "dynamodb:DeleteItem"]
    resources = [local.t_notification_evts, local.gsi_notif_bymessageid]
  }

  # Class A surface: pii-subject-index. Query PK=tenant_id, DeleteItem (the
  # tenant's re-identification key rows — no subject survives the tenant).
  statement {
    sid       = "SubjectIndexQueryDelete"
    actions   = ["dynamodb:Query", "dynamodb:DeleteItem"]
    resources = [local.t_subject_index]
  }

  # Class A surface: sms-usage. Query PK=tenant_id, DeleteItem (monthly
  # counters; also self-expire at 30d TTL).
  statement {
    sid       = "SmsUsageQueryDelete"
    actions   = ["dynamodb:Query", "dynamodb:DeleteItem"]
    resources = [local.t_sms_usage]
  }

  # Class C surface: session-summaries. Query pk=TENANT#{tenant_hash} (supplied
  # by the caller/dashboard), whole-partition DeleteItem. Reaches the
  # pseudonymized summary surface the Class-A grants don't cover (F-DSAR31).
  statement {
    sid       = "SessionSummariesQueryDelete"
    actions   = ["dynamodb:Query", "dynamodb:DeleteItem"]
    resources = [local.t_session_summaries]
  }

  # Purge audit table — PutItem ONLY. Append-only event log; the purge role
  # cannot read or delete its own audit trail (the table's resource policy
  # additionally Deny-s DeleteItem/UpdateItem/BatchWriteItem/DeleteTable to all
  # principals).
  statement {
    sid       = "PurgeAuditPutOnly"
    actions   = ["dynamodb:PutItem"]
    resources = [var.purge_audit_table_arn]
  }

  # Cold-start account guard (refuse outside staging 525).
  statement {
    sid       = "StsCallerIdentity"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "purge" {
  name   = "picasso-pii-tenant-purge-staging-policy"
  role   = aws_iam_role.purge.id
  policy = data.aws_iam_policy_document.purge.json
}

# ─────────────────────────────────────────────────────────────────────────────
# Log group + Lambda function. Terraform owns existence + config + role binding;
# real code deploys via `aws lambda update-function-code` from the lambda repo
# (lifecycle.ignore_changes prevents Terraform from reverting CLI deploys) —
# same placeholder pattern as the DSAR + master-function modules.
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/picasso-pii-tenant-purge-staging"
  retention_in_days = var.log_retention_days
}

data "archive_file" "placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "this" {
  function_name = "picasso-pii-tenant-purge-staging"
  role          = aws_iam_role.purge.arn
  runtime       = "python3.11"
  handler       = "lambda_function.lambda_handler"
  memory_size   = 256
  timeout       = 120

  # Single-flight: at most one purge running at a time. A whole-tenant purge is
  # destructive; serializing prevents two operators (or a double-invoke) from
  # racing the same tenant's partitions concurrently.
  reserved_concurrent_executions = 1

  architectures = ["x86_64"]

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  # #1a (prod-cutover D1, 2026-06-04): the account guard reads EXPECTED_ACCOUNT
  # from the env (fail-closed: unset ⇒ refuse). A LITERAL per-module value — NOT
  # data.aws_caller_identity.account_id — so a staging module accidentally
  # instantiated in the prod account still REFUSES (525 ≠ 614). The prod module
  # sets "614056832592". This is the prod-promotion gate that replaces the former
  # code-constant friction. Canonicalized table names remain code constants;
  # form-submissions is the lone exception (its name diverges across accounts —
  # D2) so it is passed here.
  environment {
    variables = {
      EXPECTED_ACCOUNT = "525409062831"
      # D2: account-divergent name (carve-out). Default in code = the staging
      # name; the prod runbook sets this to picasso_form_submissions.
      FORM_SUBMISSIONS_TABLE = "picasso-form-submissions-staging"
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # Real code deploys via `aws lambda update-function-code` from
    # Lambdas/lambda/picasso_pii_tenant_purge_staging/. Terraform must not revert.
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.lambda, aws_iam_role_policy.purge]
}

# Operator-role explicit invoke grant (same staging caveat as DSAR — the account
# guard is the additional defense against wrong-account invocation).
resource "aws_lambda_permission" "operator_only" {
  statement_id  = "AllowOperatorInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "arn:aws:iam::${local.acct}:role/aws-reserved/sso.amazonaws.com/${var.operator_sso_permission_set_name}"
}

output "purge_role_arn" {
  value = aws_iam_role.purge.arn
}

output "purge_role_name" {
  value = aws_iam_role.purge.name
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
