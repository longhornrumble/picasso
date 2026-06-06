# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 Tier 1 (production-only): BSH execution-role inline-policy grants.
#
# Adopts the SEVEN hand-made inline policies on the live, hand-managed prod role
# `Bedrock-Streaming-Handler-Role` into Terraform via `terraform import`
# (state-only — no resource change). These grants are the highest-churn surface
# on the role (3 were hand-mutated via `aws iam put-role-policy` in the
# 2026-06-04/05 Foster Village incident alone); version-controlling them routes
# future grant changes through PR → plan → gated apply instead of hand-CLI.
#
# SCOPE — surgical, IAM-only:
#   • This module manages ONLY the 7 `aws_iam_role_policy` resources, referencing
#     the role BY NAME (var.role_name). It does NOT manage the role resource
#     itself — the role's trust policy + any managed-policy attachments stay
#     hand-managed (they don't churn). The function + its env vars are Tier 2.
#   • Names mirror LIVE EXACTLY (role name, policy names, table ARNs). A faithful
#     import requires byte-equivalent policy documents → zero-change plan. Some
#     mirrored names are not yet naming-aligned (`picasso_form_submissions`
#     underscore, `picasso-tenant-registry-production`, `picasso-sms-usage`);
#     Terraform mirrors live as-is per the "mirror the environment value names
#     already present, don't translate" principle. Reconciling those names is the
#     separate naming-alignment program, not this adoption.
#
# Gated to production; imported, so the post-import plan is no-op beyond
# default_tags. Production applies stay -target-scoped (see main.tf header +
# docs/runbooks/prod-iac-tier1-bsh-iam.md).
#
# ── NOT modeled here (deferred — do not assume this file = the role's effective
#    permissions). Phase-completion-audit 2026-06-05 surfaced these; faithful
#    import mirrors live as-is, remediation is deferred to Tier 2: ──
#   • Managed-policy ATTACHMENTS on this role are NOT managed here:
#       - AmazonBedrockFullAccess  (OVER-BROAD — BSH needs only InvokeModel/
#         InvokeModelWithResponseStream + bedrock-agent-runtime:Retrieve; the
#         staging module already scopes this. Tier-2 remediation: replace with a
#         scoped inline grant.)
#       - AmazonS3ReadOnlyAccess   (read-all-buckets; should be scoped to the
#         tenant-config bucket — Tier-2 remediation.)
#       - Bedrock-Streaming-Handler-Production-Logs-Policy (custom; logs).
#     The role's effective permissions are therefore BROADER than the 7 inline
#     policies below. The role resource + trust policy + these attachments stay
#     hand-managed (don't churn); Tier 2 brings them in with the function import.
#   • picasso-sms-consent: RESOLVED — the DynamoDBSmsConsent policy below now
#     grants the PutItem the BSH writeConsentRecord() path needs (was a latent
#     TCPA-compliance gap: the conditional consent write AccessDenied + swallowed,
#     silently dropping the consent record). This is the ONE deferred-posture item
#     closed in Tier 2; the others (mgd attachments, SES `*`) remain deferred.
#   • SES-SendEmail uses Resource:"*" (pre-existing) — can send as any verified
#     identity. Faithful import mirrors it; scope to the actual sender identity at Tier 2.
#   • Clerk secret ARN below hardcodes the version suffix `-IVjCkY`. Secrets-Manager
#     rotation is OFF today; it MUST stay off until this ARN is widened to
#     `secret:prod/clerk/picasso/secret_key-*`, else a rotated ARN AccessDenies
#     every Clerk auth → BSH chat outage.
#   • DynamoDBFormSubmissions bundles 3 unrelated tables (form_submissions +
#     sms-usage + notification-sends) under a form-named policy — mirrors live;
#     a future editor searching "sms" finds it bundled. Un-bundle at Tier 3.
# ─────────────────────────────────────────────────────────────────────────────

variable "role_name" {
  description = "Name of the hand-managed prod BSH execution role whose inline policies this module adopts. The role itself is NOT managed here — only its inline policies."
  type        = string
  default     = "Bedrock-Streaming-Handler-Role"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  ddb_prefix = "arn:aws:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table"
}

# Action is a single string in the live policy; mirror it for exact fidelity.
resource "aws_iam_role_policy" "clerk_secret_read" {
  name = "ClerkSecretRead"
  role = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "secretsmanager:GetSecretValue"
      Resource = "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:prod/clerk/picasso/secret_key-IVjCkY"
    }]
  })
}

resource "aws_iam_role_policy" "dynamodb_form_submissions" {
  name = "DynamoDBFormSubmissions"
  role = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
      ]
      Resource = [
        "${local.ddb_prefix}/picasso_form_submissions",
        "${local.ddb_prefix}/picasso_form_submissions/index/*",
        "${local.ddb_prefix}/picasso-sms-usage",
        "${local.ddb_prefix}/picasso-notification-sends",
      ]
    }]
  })
}

# §P5.1: least-privilege grant for the BSH pii_subject.js writer - conditional
# PutItem (attribute_not_exists) + GetItem on the email->subject index. Mirrors
# the staging BSH role grant (DynamoDBPiiSubjectIndex). Base table only, no
# index/* - the writer keys on (tenant_id, normalized_email) directly. Pairs
# with PII_SUBJECT_INDEX_TABLE env in bsh-function-prod; both must land together.
# INERT until the separate pii_subject.js code deploy (PII/deploy-owned).
resource "aws_iam_role_policy" "dynamodb_pii_subject_index" {
  name = "DynamoDBPiiSubjectIndex"
  role = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "PiiSubjectIndexWrite"
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
      ]
      Resource = "${local.ddb_prefix}/picasso-pii-subject-index"
    }]
  })
}

resource "aws_iam_role_policy" "dynamodb_session_summaries" {
  name = "DynamoDBSessionSummaries"
  role = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "SessionSummariesWrite"
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
      ]
      Resource = "${local.ddb_prefix}/picasso-session-summaries"
    }]
  })
}

resource "aws_iam_role_policy" "employee_registry_v2_read" {
  name = "EmployeeRegistryV2Read"
  role = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:BatchGetItem",
        "dynamodb:Query",
      ]
      Resource = [
        "${local.ddb_prefix}/picasso-employee-registry",
        "${local.ddb_prefix}/picasso-employee-registry/index/*",
      ]
    }]
  })
}

resource "aws_iam_role_policy" "ses_send_email" {
  name = "SES-SendEmail"
  role = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ses:SendEmail",
        "ses:SendRawEmail",
      ]
      Resource = "*"
    }]
  })
}

# Action is a single string in the live policy; mirror it for exact fidelity.
resource "aws_iam_role_policy" "sqs_analytics_send" {
  name = "SQS-AnalyticsSend"
  role = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "sqs:SendMessage"
      Resource = "arn:aws:sqs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:picasso-analytics-events"
    }]
  })
}

resource "aws_iam_role_policy" "tenant_registry_read" {
  name = "TenantRegistryRead"
  role = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:BatchGetItem",
        "dynamodb:Query",
      ]
      Resource = [
        "${local.ddb_prefix}/picasso-tenant-registry-production",
        "${local.ddb_prefix}/picasso-tenant-registry-production/index/*",
      ]
    }]
  })
}

# NEW grant (Tier 2 — a create, not an import). Closes the latent TCPA-compliance
# gap the phase-completion-audit surfaced: BSH form_handler.js writeConsentRecord()
# does a conditional PutItem to picasso-sms-consent when a form captures phone +
# explicit SMS consent (form_handler.js:294-298), but no inline policy granted it,
# so the write AccessDenied and was swallowed (the catch at :1220 + the .catch at
# :299) — silently losing the consent record. Least-privilege: PutItem only (the
# sole sms-consent operation anywhere in BSH; no read/query path exists).
resource "aws_iam_role_policy" "dynamodb_sms_consent" {
  name = "DynamoDBSmsConsent"
  role = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "SmsConsentWrite"
      Effect   = "Allow"
      Action   = "dynamodb:PutItem"
      Resource = "${local.ddb_prefix}/picasso-sms-consent"
    }]
  })
}

# NEW grant (Tier 2-SEC Remedy B for the #435 streaming-bypass — a create, not an
# import). BSH's validateCfOriginHeader reads the cf-origin secret at runtime to
# validate the CloudFront-injected x-picasso-cf-origin header (the defense that
# closes the AuthType:NONE direct-invoke bypass). Mirrors the live staging
# CfOriginSecretRead Sid (lambda-bedrock-handler-staging:325-332). Least-privilege:
# GetSecretValue only, the one cf-origin secret. WILDCARD ARN suffix (-*) so
# Secrets Manager rotation (new ARN suffix) does NOT break the grant — UNLIKE the
# ClerkSecretRead landmine above (hardcoded version suffix -> rotation must stay OFF).
# Granting this alone changes nothing at runtime; enforcement turns on only when
# bsh-function-prod's REQUIRE_CF_ORIGIN_HEADER flips to "true".
resource "aws_iam_role_policy" "cf_origin_secret_read" {
  name = "CfOriginSecretRead"
  role = var.role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "CfOriginSecretRead"
      Effect   = "Allow"
      Action   = "secretsmanager:GetSecretValue"
      Resource = "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/bsh/cf-origin-secret-*"
    }]
  })
}
