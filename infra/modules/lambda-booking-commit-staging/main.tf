# Scheduling sub-phase C Task C8 — Booking_Commit_Handler Lambda (the
# booking-commit keystone). The single transactional commit path that turns a
# chosen slot into a confirmed booking:
#   0. idempotency gate (deterministic booking_id) -> return an already-booked row
#   1. live Google freeBusy re-check (C4 availability.getBusyIntervals)
#   2. C6 pool.lockSlot conditional-write slot lock (Booking table)
#   3. ConferenceProvider.createConference (GoogleMeet | Zoom | Null)
#   4. Google Calendar events.insert with extendedProperties.private.booking_id
#   5a. C5 routing.advanceRoundRobin (reverted if 5b fails)
#   5b. Booking record write (status=booked), conditional attribute_not_exists
#   6. confirmation email (.ics + signed cancel/reschedule links) within 60s SLA
# Handler + tests live in Lambdas/lambda/Booking_Commit_Handler (PR #190, merged
# to lambda main). This module is the integrator-owned IaC for it.
#
# Dedicated execution role per CLAUDE.md "Never share IAM roles" rule
# (lambda#44 lesson). NO wildcards on secrets or DynamoDB.
#
# IAM scoped to ACTUAL merged-code usage (ground-truthed against
# origin/main:Booking_Commit_Handler/* + the shared/scheduling/* it bundles),
# which is NARROWER than PR #190's prose IAM section. Divergences, with reason:
#   - PR prose: "read AppointmentType / ConversationSchedulingSession". The
#     merged code reads NEITHER table (no APPOINTMENT_TYPE_TABLE /
#     SCHEDULING_SESSION_TABLE env var, no client reference). OMITTED -> least
#     privilege. The coordinator/appointment-type are resolved upstream (the
#     conversational session) and passed into the commit.
#   - PR prose: "jti-blacklist conditional PutItem". The merged code only calls
#     tokens.sign() (which does NO DynamoDB); tokens.redeem() (the only jti
#     writer) is NOT reached by C8. OMITTED -> the PR itself flagged this as
#     "deferrable". The cancel/reschedule REDEEM happens in a later workstream.
#   - DynamoDB footprint is exactly TWO tables: Booking (Get/Put/Update/Delete,
#     no GSI/Query) + RoutingPolicy (UpdateItem only — atomic round-robin
#     cursor advance/revert).
# If the integrator's live smoke surfaces a path that needs a table this role
# lacks, that is a one-line reviewed grant — but the merged code shows none.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "booking_table_arn" {
  description = "ARN of picasso-booking-staging. Booking_Commit_Handler GetItem (idempotency gate + lock read), PutItem (slot-lock conditional put + Booking row), UpdateItem (record conference-id on lock / reconciliation flag / degraded marker), DeleteItem (lock release)."
  type        = string
}

variable "booking_table_name" {
  type = string
}

variable "routing_policy_table_arn" {
  description = "ARN of picasso-routing-policy-staging. C5 routing.advanceRoundRobin does an atomic conditional UpdateItem (and the compensating revert UpdateItem). UpdateItem ONLY — no read; the cursor advance/revert is expressed as a single UpdateExpression."
  type        = string
}

variable "routing_policy_table_name" {
  type = string
}

variable "scheduling_oauth_tenant_ids" {
  description = "Tenant IDs whose scheduling secrets the handler may read. secretsmanager:GetSecretValue is scoped to picasso/scheduling/oauth/{tenant}/* (Google OAuth + freeBusy) AND picasso/scheduling/zoom/{tenant} (Zoom S2S) for each — NOT a wildcard. Adding tenant #2 = append here in a reviewed PR, not a silent wildcard grant. A Zoom secret may not exist yet for a listed tenant (Zoom path is secret-gated at runtime); the grant is harmless until the secret is provisioned."
  type        = list(string)
  default     = ["MYR384719"]
}

variable "ops_alerts_topic_arn" {
  description = "ARN of picasso-ops-alerts-staging SNS topic. The handler publishes degrade / SLA / orphan-lock alerts here (OPS_ALERTS_TOPIC_ARN env), and the Errors alarm targets it."
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention. Phase C.2 default."
  type        = number
  default     = 90
}

# ------------------------------------------------------------------
# Data sources
# ------------------------------------------------------------------

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_partition" "current" {}

# ==============================================================================
# CloudWatch log group (KMS-encrypted per Phase C.2 pattern)
# ==============================================================================

resource "aws_kms_key" "commit_logs" {
  description             = "KMS key for Booking_Commit_Handler CloudWatch logs. Phase C.2 pattern; dedicated per-Lambda KMS key."
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnableRootAccount"
        Effect    = "Allow"
        Principal = { AWS = "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "AllowCloudWatchLogsEncryption"
        Effect    = "Allow"
        Principal = { Service = "logs.${data.aws_region.current.name}.amazonaws.com" }
        Action = [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*",
        ]
        Resource = "*"
        Condition = {
          ArnEquals = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Booking_Commit_Handler"
          }
        }
      },
    ]
  })

  tags = {
    Name     = "picasso-booking-commit-logs-staging"
    Subphase = "C8"
  }
}

resource "aws_kms_alias" "commit_logs" {
  name          = "alias/picasso-booking-commit-logs-staging"
  target_key_id = aws_kms_key.commit_logs.key_id
}

resource "aws_cloudwatch_log_group" "commit" {
  name              = "/aws/lambda/Booking_Commit_Handler"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.commit_logs.arn
}

# ==============================================================================
# No dead-letter queue — by design. aws_lambda_function.dead_letter_config only
# fires on ASYNCHRONOUS invocations. C8 is invoked SYNCHRONOUSLY: the handler is
# called at the volunteer's "Confirm" and RETURNS a structured outcome the caller
# acts on ({status:'COMMIT_FAILED',action:'graceful_error'} /
# {status:'SLOT_UNAVAILABLE',action:'reoffer'}), and it catches its own errors
# rather than throwing. A synchronous invoke never delivers to a DLQ — the error
# surfaces directly in the caller's response. An async C8 is also incoherent by
# design (you cannot 'reoffer' a slot to a user who is not awaiting the reply).
#
# A DLQ topic + DeadLetterErrors alarm here would therefore be inert forever and,
# worse, read as "DLQ coverage exists" on a dashboard (false confidence). Removed.
# Failure observability is covered by: (1) the handler returning the failure to
# its caller, (2) alertAdmin() -> ops-alerts on degrade/SLA/orphan-lock, and
# (3) the Errors alarm below. If C8 is ever genuinely wired to an async trigger
# (EventBridge / SQS / DDB stream), re-add a DLQ in THAT PR where it is exercised
# and its alarm is testable.
# ==============================================================================
# IAM execution role (dedicated per CLAUDE.md "Never share IAM roles" rule)
# ==============================================================================

resource "aws_iam_role" "commit" {
  name = "Booking_Commit_Handler-exec-staging"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Subphase = "C8"
  }
}

data "aws_iam_policy_document" "commit_exec" {
  # CloudWatch logs (group + streams)
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.commit.arn}:*"]
  }

  # Booking table: full single-item lifecycle. booking-store.js does all four
  # verbs (idempotency GetItem, Booking-row + slot-lock PutItem, conference-id /
  # reconciliation / degraded-marker UpdateItem, lock-release DeleteItem); C6
  # pool.lockSlot adds a conditional PutItem. No GSI/Query — C8 never queries a
  # Booking index (the Listener does; C8 commits by deterministic key).
  statement {
    sid = "DDBBookingTableItemLifecycle"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
    ]
    resources = [var.booking_table_arn]
  }

  # RoutingPolicy table: C5 routing.advanceRoundRobin only — a single atomic
  # conditional UpdateItem to advance the round-robin cursor, plus the
  # compensating revert UpdateItem. No GetItem (the advance/revert is one
  # UpdateExpression), no PutItem/DeleteItem.
  statement {
    sid       = "DDBRoutingPolicyUpdate"
    actions   = ["dynamodb:UpdateItem"]
    resources = [var.routing_policy_table_arn]
  }

  # Secrets Manager: per-tenant scheduling OAuth (Google) + Zoom S2S secrets,
  # plus the shared HS256 JWT signing key for the signed cancel/reschedule
  # links. Per-tenant, NOT wildcard (closes the B1 audit row 13 posture). The
  # trailing -* / /* matches the AWS-generated secret-ARN suffix and sub-paths.
  statement {
    sid     = "SecretsReadSchedulingOAuth"
    actions = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = concat(
      [
        for t in var.scheduling_oauth_tenant_ids :
        "arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/oauth/${t}/*"
      ],
      [
        for t in var.scheduling_oauth_tenant_ids :
        "arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/zoom/${t}-*"
      ],
    )
  }

  # Shared HS256 JWT signing key for tokens.sign() (cancel/reschedule signed
  # links). Same secret chat-session JWTs use; the iss claim distinguishes them.
  # Single secret, not per-tenant. The -* matches the AWS-generated ARN suffix.
  statement {
    sid     = "SecretsReadJwtSigningKey"
    actions = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [
      "arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/staging/jwt/signing-key-*"
    ]
  }

  # SES: confirmation email is SendRawEmail (a .ics attachment forces the raw
  # form). SendRawEmail only — no SendEmail/template/identity-management verbs.
  statement {
    sid       = "SESSendRawEmail"
    actions   = ["ses:SendRawEmail"]
    resources = ["*"]
  }

  # SNS: publish degrade / SLA / orphan-lock alerts to the ops-alerts topic
  # (alertAdmin() -> OPS_ALERTS_TOPIC_ARN). No DLQ publish — C8 is synchronous,
  # so there is no dead_letter_config target (see the "No dead-letter queue"
  # note above). No KMS-for-DLQ grant for the same reason.
  statement {
    sid       = "SNSPublishOpsAlerts"
    actions   = ["sns:Publish"]
    resources = [var.ops_alerts_topic_arn]
  }
}

resource "aws_iam_role_policy" "commit_exec" {
  name   = "booking-commit-exec"
  role   = aws_iam_role.commit.id
  policy = data.aws_iam_policy_document.commit_exec.json
}

# ==============================================================================
# Lambda function (placeholder code; real handler lands via lambda-repo CI)
# ==============================================================================

data "archive_file" "commit_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "commit" {
  function_name = "Booking_Commit_Handler"
  role          = aws_iam_role.commit.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  # 512MB / 90s: the commit chain is a sequence of remote calls (Google freeBusy
  # + Calendar insert, optional Zoom create, SES SendRawEmail, DDB lock/write)
  # that must complete within the §AC #7 60s confirmation-email SLA; 90s leaves
  # headroom for the OAuth-401 refresh-and-retry-once path.
  memory_size = 512
  timeout     = 90
  # Cap concurrency at the commit keystone: bound the blast radius of a runaway
  # caller and the rate of Google/Zoom/SES calls at v1 pilot scale.
  reserved_concurrent_executions = 5
  architectures                  = ["x86_64"]

  filename         = data.archive_file.commit_placeholder.output_path
  source_code_hash = data.archive_file.commit_placeholder.output_base64sha256

  # No dead_letter_config — C8 is invoked synchronously; a DLQ would be inert
  # (see the "No dead-letter queue" note above).

  environment {
    variables = {
      ENVIRONMENT              = "staging"
      BOOKING_TABLE            = var.booking_table_name
      ROUTING_POLICY_TABLE     = var.routing_policy_table_name
      OAUTH_SECRET_PATH_PREFIX = "picasso/scheduling/oauth"
      ZOOM_SECRET_PATH_PREFIX  = "picasso/scheduling/zoom"
      SES_FROM_EMAIL           = "notify@myrecruiter.ai"
      SES_CONFIGURATION_SET    = "picasso-emails"
      SCHEDULE_BASE_URL        = "https://staging.chat.myrecruiter.ai"
      OPS_ALERTS_TOPIC_ARN     = var.ops_alerts_topic_arn
      JWT_SECRET_KEY_NAME      = "picasso/staging/jwt/signing-key"
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # Real code lands via lambda-repo CI matrix (aws lambda update-function-code,
    # deploy-staging.yml). Env vars are Terraform-managed (NOT ignored).
    #
    # KNOWN HAZARD (sibling-module phase-audit G8): despite this ignore_changes,
    # a `terraform apply` triggered by a change to a DEPENDED-ON resource (the
    # IAM policy below, or appending a tenant to scheduling_oauth_tenant_ids) can
    # re-deploy the placeholder zip OVER the real CI-deployed code — the same
    # regression empirically hit lambda-pii-dsar-staging on 2026-05-26.
    # AFTER ANY apply that touches this module, re-verify the live CodeSha256 is
    # NOT the placeholder and re-run the CI deploy if it is:
    #   aws lambda get-function-configuration --function-name Booking_Commit_Handler \
    #     --query CodeSha256
    #   gh workflow run "Deploy Lambda — Staging" -f lambda=Booking_Commit_Handler
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.commit, aws_iam_role_policy.commit_exec]
}

# ==============================================================================
# CloudWatch alarms
# ==============================================================================

# Errors >= 1 in any 5-minute period.
resource "aws_cloudwatch_metric_alarm" "commit_errors" {
  alarm_name          = "Booking_Commit_Handler-errors"
  alarm_description   = "Booking_Commit_Handler Lambda errors >= 1 in any 5-minute period. The commit keystone — investigate immediately via CloudWatch logs: /aws/lambda/Booking_Commit_Handler."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "Errors"
  namespace   = "AWS/Lambda"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    FunctionName = aws_lambda_function.commit.function_name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# ==============================================================================
# Outputs
# ==============================================================================

output "commit_function_name" {
  value = aws_lambda_function.commit.function_name
}

output "commit_function_arn" {
  value = aws_lambda_function.commit.arn
}

output "commit_role_arn" {
  value = aws_iam_role.commit.arn
}
