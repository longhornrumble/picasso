# send_email — staging deployment (test-support dependency for the scheduling
# notice path). Operator authorized 2026-06-02 to stand up `send_email` in
# staging so the scheduling consumers' best-effort volunteer-notice dispatch
# (shared/scheduling/notify.dispatchVolunteerNotice -> Event-invoke send_email)
# can be exercised end-to-end per scheduling/docs/e2e_staging_validation_plan.md.
#
# WHY THE FUNCTION NAME IS BARE `send_email` (not `{name}-{env}`):
# notify.js resolves the target as `process.env.SEND_EMAIL_FUNCTION || 'send_email'`
# and the merged gap-C IAM grants the consumer roles `lambda:InvokeFunction` on
# `function:send_email` (picasso#336). Naming this `send_email` matches the
# already-wired invoke target with zero consumer/IAM churn. Account isolation
# (staging 525 vs prod 614) means this is NOT cross-environment resource sharing
# — same pattern as the bare-named scheduling consumers (Calendar_Watch_Listener
# et al.) already running in staging.
#
# This is the real prod send_email Python code (Lambdas/lambda/send_email/
# lambda_function.py), deployed via `aws lambda update-function-code` over the
# Terraform placeholder (same pattern as lambda-pii-dsar-staging /
# lambda-master-function-staging). Terraform owns existence + config + role
# binding; lifecycle.ignore_changes keeps it from reverting the CLI code deploy.
#
# Staging SES is in sandbox (Max24HourSend=200, MaxSendRate=1) — real sends only
# reach verified recipients. Verified identities present 2026-06-02:
# staging.myrecruiter.ai (domain), notify@myrecruiter.ai (sender), chris@.
# E2E test attendees use @staging.myrecruiter.ai addresses so sends succeed.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  acct   = data.aws_caller_identity.current.account_id
  region = data.aws_region.current.name
}

variable "default_sender" {
  description = "SES Source address for send_email. Must be an SES-verified identity in this account. Maps to the Lambda's DEFAULT_SENDER env."
  type        = string
  # Subdomain sender, NOT notify@myrecruiter.ai: in the staging account the
  # myrecruiter.ai domain identity has DKIM NOT_STARTED (domain DKIM only
  # verified in prod), so root-domain sends fail DMARC (p=quarantine) and
  # Gmail spam-folders them. staging.myrecruiter.ai is verified with DKIM
  # SUCCESS here, satisfying relaxed DMARC alignment.
  default = "notify@staging.myrecruiter.ai"
}

variable "log_retention_days" {
  description = "CloudWatch log retention. Matches the 14d staging default."
  type        = number
  default     = 14
}

# SES configuration set. The send_email code passes ConfigurationSetName
# unconditionally (lambda_function.py:245, default 'picasso-emails'); SES rejects
# a non-existent config set, and staging had none. Create it (no event
# destinations needed) so sends succeed.
resource "aws_ses_configuration_set" "this" {
  name = "picasso-emails"
}

# ─────────────────────────────────────────────────────────────────────────────
# Dedicated execution role (CLAUDE.md: never share roles). Trust = lambda only.
# ─────────────────────────────────────────────────────────────────────────────
data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "this" {
  name                 = "send_email-role-staging"
  permissions_boundary = var.permissions_boundary_arn
  description          = "Dedicated exec role for the staging send_email Lambda (scheduling notice-path test dependency, operator-authorized 2026-06-02)."
  assume_role_policy   = data.aws_iam_policy_document.trust.json
}

data "aws_iam_policy_document" "policy" {
  # CloudWatch Logs — scoped to this function's log group.
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.lambda.arn}:*"]
  }

  # SES send — scoped to this account's verified identities (no cross-account).
  # send_email uses ses:SendRawEmail (MIME w/ attachments); SendEmail kept for parity.
  # A send that names a ConfigurationSet is authorized against BOTH the sending
  # identity AND the config-set resource (smoke-confirmed 2026-06-02: AccessDenied
  # on configuration-set/picasso-emails when only identity/* was granted), so the
  # set ARN must be in the resource list too.
  statement {
    sid     = "SesSend"
    actions = ["ses:SendRawEmail", "ses:SendEmail"]
    resources = [
      "arn:aws:ses:${local.region}:${local.acct}:identity/*",
      "arn:aws:ses:${local.region}:${local.acct}:configuration-set/${aws_ses_configuration_set.this.name}",
    ]
  }
}

resource "aws_iam_role_policy" "this" {
  name   = "send_email-staging-policy"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.policy.json
}

# ─────────────────────────────────────────────────────────────────────────────
# Log group + Lambda (placeholder code; real code via update-function-code).
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/send_email"
  retention_in_days = var.log_retention_days
}

data "archive_file" "placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "this" {
  function_name = "send_email"
  role          = aws_iam_role.this.arn
  runtime       = "python3.13"
  handler       = "lambda_function.lambda_handler"
  memory_size   = 256
  timeout       = 30
  architectures = ["x86_64"]

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment {
    variables = {
      DEFAULT_SENDER    = var.default_sender
      CONFIGURATION_SET = aws_ses_configuration_set.this.name
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # Real code deploys via `aws lambda update-function-code` from
    # Lambdas/lambda/send_email/. Terraform must not revert it.
    # KNOWN HAZARD (G8): a future apply touching this module can still re-deploy
    # the placeholder over live code — re-verify CodeSha256 after any apply.
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.lambda, aws_iam_role_policy.this]
}

output "function_name" {
  value = aws_lambda_function.this.function_name
}

output "function_arn" {
  value = aws_lambda_function.this.arn
}

output "role_arn" {
  value = aws_iam_role.this.arn
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.lambda.name
}

output "configuration_set_name" {
  value = aws_ses_configuration_set.this.name
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
