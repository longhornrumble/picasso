# Scheduling sub-phase B Task B2 — Calendar_Watch_Listener Lambda + supporting infra.
#
#   Calendar_Watch_Listener  node20  256MB 10s   public Function URL (Google -> us)
#
# Receives Google Calendar push notifications, validates the X-Goog-Channel-Token
# (constant-time compare of SHA-256 hashes per channel_token encryption Option 2 —
# B1 audit-of-audit row 12 closure), looks up the channel in
# picasso-calendar-watch-channels-staging, calls events.get against the Google
# Calendar API (OAuth secret per tenant from Secrets Manager), derives the typed
# event per scheduling/docs/listener_dispatch_interface.md (B0 spec), and
# dispatches to the picasso-calendar-watch-events-staging.fifo queue keyed by
# event_id (= booking_id) so events for the same booking are processed in order.
#
# Dedicated execution role per CLAUDE.md "Never share IAM roles" rule
# (lambda#44 lesson).
#
# B1 audit row 13 carry-forward: secretsmanager:GetSecretValue is scoped to
# picasso/scheduling/oauth/* at v1 pilot scale. Before tenant #2 enters
# staging, the grant MUST be parameterized to picasso/scheduling/oauth/${tenantId}/*
# (either per-Lambda parameterized or tag-based ABAC via aws:PrincipalTag/tenantId).

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "calendar_watch_channels_table_arn" {
  description = "ARN of picasso-calendar-watch-channels-staging. Listener GetItem's the channel row by channel_id, reads the stored channel_token_sha256 hash for validation, and reads tenant_id / calendar_id."
  type        = string
}

variable "calendar_watch_channels_table_name" {
  type = string
}

variable "calendar_watch_channels_tenant_status_index_arn" {
  description = "ARN of the tenant-status-index GSI on picasso-calendar-watch-channels-staging — listener queries for active channels by tenant for ops/diagnostics paths."
  type        = string
}

variable "booking_table_arn" {
  description = "ARN of picasso-booking-staging. Listener GetItem's (tenantId, booking_id) for moved/reassigned/deleted derivations."
  type        = string
}

variable "booking_table_name" {
  type = string
}

variable "booking_coordinator_email_index_arn" {
  description = "ARN of the tenantId-coordinator_email-index GSI on picasso-booking-staging. NOTE (Phase 2b audit 2026-05-29): NOT used by the current Listener code — the OOO path Queries the start_at index (var.booking_start_at_index_arn) with a coordinator_id FilterExpression. Retained for a possible future coordinator-keyed query path (e.g. B9); revisit for least-privilege removal if it stays unused."
  type        = string
}

# Phase 2b audit row 11 (tech-lead): the OOO-overlap path
# (queryBookedBookingsForOoo) Queries the tenantId-start_at-index GSI (env
# BOOKING_TENANT_START_INDEX). Without Query on THIS index the OOO query hits
# AccessDenied → caught → silent empty result (no overlap detected, no alarm).
# Zero impact at v1 pilot scale (no bookings until C8) but a latent landmine.
variable "booking_start_at_index_arn" {
  description = "ARN of the tenantId-start_at-index GSI on picasso-booking-staging — the OOO-overlap path Queries it for booked bookings overlapping an out-of-office window."
  type        = string
}

variable "booking_external_event_id_index_arn" {
  description = "ARN of the external_event_id-index GSI on picasso-booking-staging — the deletion path Queries it to resolve a booking from its Google event id when Google strips extendedProperties from a cancelled-event delta (env BOOKING_EXTERNAL_EVENT_INDEX)."
  type        = string
}

variable "tenant_registry_table_arn" {
  description = "ARN of picasso-tenant-registry-staging. Listener resolves tenant config (e.g. tenant-level scheduling settings) when needed."
  type        = string
}

variable "tenant_registry_table_name" {
  type = string
}

variable "ops_alerts_topic_arn" {
  description = "ARN of picasso-ops-alerts-staging SNS topic — receives Lambda errors, DLQ-depth alarms, and listener-derived alarms per scheduling_implementation_plan.md B7."
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention. Phase C.2 default."
  type        = number
  default     = 90
}

variable "scheduling_oauth_tenant_ids" {
  description = "Tenant IDs whose OAuth secrets the Listener may read. The exec role's secretsmanager:GetSecretValue is scoped to picasso/scheduling/oauth/{tenant}/* for each — NOT a wildcard (closes B1 audit row 13 for the Listener; matches Onboarder/Renewer/Offboarder, which were already per-tenant — sub-phase B audit row SR-1, 2026-05-30). Adding tenant #2 = append here in a reviewed PR, not a silent wildcard grant."
  type        = list(string)
  default     = ["MYR384719"]
}

# ------------------------------------------------------------------
# Data sources
# ------------------------------------------------------------------

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_partition" "current" {}

# ------------------------------------------------------------------
# Locals
# ------------------------------------------------------------------

locals {
  # I2-A cutover: SNS FIFO fan-out topic the Listener PUBLISHES typed booking.*
  # events to (replacing the direct SQS SendMessage to aws_sqs_queue.events). The
  # topic is created by infra/modules/sns-calendar-watch-fanout-staging as
  # picasso-calendar-watch-events-staging.fifo. We CONSTRUCT its ARN here rather
  # than wiring module.sns_calendar_watch_fanout_staging.events_topic_arn because
  # that module already depends on THIS module's listener_role_arn output (for its
  # publish-lockdown topic policy) — referencing it back would create a module
  # cycle. Same construction style as the per-tenant Secrets ARNs below. The name
  # MUST stay in sync with that module's aws_sns_topic.events.name.
  events_topic_arn = "arn:${data.aws_partition.current.partition}:sns:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:picasso-calendar-watch-events-staging.fifo"
}

# ==============================================================================
# SQS FIFO dispatch queue + DLQ
# ==============================================================================

# Dead-letter queue for events the consumer(s) (C4/C8/C9) cannot process after
# the redrive-policy max-receive-count. FIFO so message ordering is preserved
# in the DLQ for forensic review.
resource "aws_sqs_queue" "events_dlq" {
  name                        = "picasso-calendar-watch-events-dlq-staging.fifo"
  fifo_queue                  = true
  content_based_deduplication = false   # listener supplies MessageDeduplicationId explicitly
  message_retention_seconds   = 1209600 # 14 days
  sqs_managed_sse_enabled     = true    # envelopes carry attendee_email (PII) — encrypt at rest like every other scheduling PII sink (sub-phase B audit SR-3)

  tags = {
    Name     = "picasso-calendar-watch-events-dlq-staging.fifo"
    Subphase = "B2"
  }
}

# Primary FIFO queue receiving typed events from the listener
# (booking.calendar_deleted | booking.calendar_moved | booking.calendar_reassigned
#  | booking.ooo_overlap_detected | booking.attendee_accepted
#  | booking.attendee_declined | booking.event_made_private).
# MessageGroupId == event_id (booking_id) — same booking events ordered.
# Different bookings may be processed concurrently.
resource "aws_sqs_queue" "events" {
  name                        = "picasso-calendar-watch-events-staging.fifo"
  fifo_queue                  = true
  content_based_deduplication = false  # listener supplies MessageDeduplicationId from (event_id, last_calendar_mutation_at)
  message_retention_seconds   = 345600 # 4 days — consumer SLA per dispatch interface idempotency note
  visibility_timeout_seconds  = 60     # consumer Lambda timeout will be <60s
  receive_wait_time_seconds   = 20     # long-poll
  sqs_managed_sse_enabled     = true   # envelopes carry attendee_email (PII) — encrypt at rest like every other scheduling PII sink (sub-phase B audit SR-3)

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.events_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name     = "picasso-calendar-watch-events-staging.fifo"
    Subphase = "B2"
  }
}

# ==============================================================================
# CloudWatch log group (KMS-encrypted per Phase C.2 pattern)
# ==============================================================================

resource "aws_kms_key" "listener_logs" {
  description             = "KMS key for Calendar_Watch_Listener CloudWatch logs. Phase C.2 pattern; dedicated per-Lambda KMS key.."
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
            "kms:EncryptionContext:aws:logs:arn" = "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Calendar_Watch_Listener"
          }
        }
      },
    ]
  })

  tags = {
    Name     = "picasso-calendar-watch-listener-logs-staging"
    Subphase = "B2"
  }
}

resource "aws_kms_alias" "listener_logs" {
  name          = "alias/picasso-calendar-watch-listener-logs-staging"
  target_key_id = aws_kms_key.listener_logs.key_id
}

resource "aws_cloudwatch_log_group" "listener" {
  name              = "/aws/lambda/Calendar_Watch_Listener"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.listener_logs.arn
}

# ==============================================================================
# IAM execution role (dedicated per CLAUDE.md "Never share IAM roles" rule)
# ==============================================================================

resource "aws_iam_role" "listener" {
  name = "Calendar_Watch_Listener-exec-staging"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    Subphase = "B2"
  }
}

data "aws_iam_policy_document" "listener_exec" {
  # CloudWatch logs (group + streams)
  statement {
    sid       = "CloudWatchLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.listener.arn}:*"]
  }

  # DDB read+update on calendar-watch-channels: GetItem by channel_id PK +
  # tenant-status GSI for ops paths, PLUS UpdateItem — the Phase 2b handler
  # advances `last_sync_token` (advanceSyncToken) on every successful delta push
  # and REMOVEs it on a Google 410. WITHOUT UpdateItem the FIRST real push fails
  # AccessDenied → the syncToken never advances → retry-storm + perpetual
  # re-dispatch (sub-phase B audit row B-1, 2026-05-30; the sync-handshake-only
  # operator smoke could not catch this).
  statement {
    sid     = "DDBReadWriteCalendarWatchChannels"
    actions = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:UpdateItem"]
    resources = [
      var.calendar_watch_channels_table_arn,
      var.calendar_watch_channels_tenant_status_index_arn,
    ]
  }

  # DDB read on booking: GetItem by (tenantId, booking_id) for moved/reassigned
  # derivations; Query the tenantId-start_at-index for OOO-overlap detection; Query
  # the external_event_id-index to resolve a booking from its Google event id on the
  # deletion path (Google strips extendedProperties from cancelled-event deltas).
  # The coordinator_email index is granted but not used by current code (see variable
  # note) — retained for a possible future query path.
  statement {
    sid     = "DDBReadBooking"
    actions = ["dynamodb:GetItem", "dynamodb:Query"]
    resources = [
      var.booking_table_arn,
      var.booking_start_at_index_arn,
      var.booking_coordinator_email_index_arn,
      var.booking_external_event_id_index_arn,
    ]
  }

  # DDB read on tenant-registry (resolve tenant config for scheduling settings)
  statement {
    sid       = "DDBReadTenantRegistry"
    actions   = ["dynamodb:GetItem"]
    resources = [var.tenant_registry_table_arn]
  }

  # Secrets Manager read on scheduling OAuth secrets — scoped PER TENANT
  # (sub-phase B audit row SR-1, 2026-05-30): the Listener is the only
  # internet-facing scheduling Lambda and processes attacker-influenced input
  # (Google headers + Onboarder-written channel rows), yet was the LAST holder of
  # the wildcard `oauth/*` grant while Onboarder/Renewer/Offboarder were already
  # per-tenant. Closing B1 audit row 13 here too — one ARN per entry in
  # var.scheduling_oauth_tenant_ids, no wildcard. Adding tenant #2 = a reviewed PR.
  statement {
    sid     = "SecretsReadSchedulingOAuth"
    actions = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
    resources = [
      for t in var.scheduling_oauth_tenant_ids :
      "arn:${data.aws_partition.current.partition}:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/oauth/${t}/*"
    ]
  }

  # SQS send to the FIFO events queue. SendMessage only — no Receive (consumer
  # Lambdas in C-phase get their own dedicated role with Receive).
  # RETAINED during the I2-A cutover window: the Listener code still SendMessages
  # to this queue until the coupled lambda publish-flip lands. Retire this
  # statement (and aws_sqs_queue.events) AFTER cutover is confirmed on staging.
  statement {
    sid       = "SQSSendCalendarWatchEvents"
    actions   = ["sqs:SendMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.events.arn]
  }

  # I2-A cutover: SNS publish to the FIFO fan-out topic. The Listener flips from
  # SQS SendMessage to SNS Publish; the topic fans out to the per-consumer FIFO
  # queues by event_type filter policy. Identity-based grant complementing the
  # topic's resource policy (AllowListenerPublishOnly), which already names this
  # role — both sides reference the role so the grant is explicit on the role
  # itself, not solely inherited from the topic policy. Publish only; the Listener
  # never subscribes/receives. Applied BEFORE the lambda publish-flip per the
  # cutover ordering (topic must exist + role must be granted before code flips).
  statement {
    sid       = "SNSPublishCalendarWatchEvents"
    actions   = ["SNS:Publish"]
    resources = [local.events_topic_arn]
  }
}

resource "aws_iam_role_policy" "listener_exec" {
  name   = "listener-exec"
  role   = aws_iam_role.listener.id
  policy = data.aws_iam_policy_document.listener_exec.json
}

# ==============================================================================
# Lambda function (placeholder code; real handler lands via lambda-repo CI)
# ==============================================================================

data "archive_file" "listener_placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "listener" {
  function_name = "Calendar_Watch_Listener"
  role          = aws_iam_role.listener.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  memory_size   = 256
  timeout       = 10
  architectures = ["x86_64"]

  filename         = data.archive_file.listener_placeholder.output_path
  source_code_hash = data.archive_file.listener_placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT                   = "staging"
      CALENDAR_WATCH_CHANNELS_TABLE = var.calendar_watch_channels_table_name
      BOOKING_TABLE                 = var.booking_table_name
      BOOKING_TENANT_START_INDEX    = "tenantId-start_at-index"
      BOOKING_EXTERNAL_EVENT_INDEX  = "external_event_id-index"
      TENANT_REGISTRY_TABLE         = var.tenant_registry_table_name
      EVENTS_QUEUE_URL              = aws_sqs_queue.events.url
      # I2-A cutover: the publish target after the SQS->SNS flip. Set NOW (this
      # PR applies before the lambda flip) so the flipped code finds it. EVENTS_QUEUE_URL
      # is retained until cutover is confirmed, then retired with aws_sqs_queue.events.
      EVENTS_TOPIC_ARN                 = local.events_topic_arn
      OAUTH_SECRET_PATH_PREFIX         = "picasso/scheduling/oauth"
      REPLAY_WINDOW_SECONDS            = "300"
      RATE_LIMIT_NOTIFICATIONS_PER_MIN = "100"
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    # Real code lands via lambda-repo CI matrix (aws lambda update-function-code).
    # Env vars are Terraform-managed (NOT ignored — Phase D audit row #1).
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.listener, aws_iam_role_policy.listener_exec]
}

# Public Function URL — Google POSTs push notifications here. Auth NONE at the
# URL layer; the handler validates the X-Goog-Channel-Token via SHA-256 hash +
# constant-time compare against the stored hash in DDB on every POST. No cors{}
# block — server-to-server (Google backends, not browsers); AWS rejects empty
# AllowOrigins (Phase D #12 lesson, lambda-meta-staging precedent).
resource "aws_lambda_function_url" "listener" {
  function_name      = aws_lambda_function.listener.function_name
  authorization_type = "NONE"
}

# ──────────────────────────────────────────────────────────────────────
# # MANUAL STEP REQUIRED — see full note in lambda-meta-staging module.
# After creation, AWS Console -> Lambda -> Calendar_Watch_Listener ->
# Configuration -> Function URL -> Edit -> Save (no changes). Adds the
# missing FunctionURLAllowInvokeAction policy statement that AWS provider
# 5.x cannot create — without it the URL returns HTTP 403 and the handler
# is never invoked. Verify both SIDs present:
#   aws lambda get-policy --function-name Calendar_Watch_Listener
# Re-run if the Lambda is ever destroyed/recreated.
# ──────────────────────────────────────────────────────────────────────

# ==============================================================================
# CloudWatch alarms (per scheduling_implementation_plan.md B7 — 3 alarms)
# ==============================================================================

# Alarm 1: Lambda errors on Calendar_Watch_Listener — any error in any 5-min
# window. Catches malformed payloads, secret-fetch failures, downstream SQS
# throttling.
resource "aws_cloudwatch_metric_alarm" "listener_errors" {
  alarm_name          = "Calendar_Watch_Listener-errors"
  alarm_description   = "Calendar_Watch_Listener Lambda errors >= 1 in any 5-minute period. Investigate via CloudWatch logs: /aws/lambda/Calendar_Watch_Listener."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "Errors"
  namespace   = "AWS/Lambda"
  period      = 300
  statistic   = "Sum"

  dimensions = {
    FunctionName = aws_lambda_function.listener.function_name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# Alarm 2: DLQ depth > 0 — at least one event the consumer(s) could not
# process after max-receive-count redrives. Indicates a consumer bug, a
# malformed event the listener emitted, or downstream rate-limiting.
resource "aws_cloudwatch_metric_alarm" "events_dlq_depth" {
  alarm_name          = "picasso-calendar-watch-events-dlq-depth"
  alarm_description   = "picasso-calendar-watch-events-dlq-staging.fifo has >= 1 message. Inspect via aws sqs receive-message; do NOT purge without forensic review."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "ApproximateNumberOfMessagesVisible"
  namespace   = "AWS/SQS"
  period      = 300
  statistic   = "Maximum"

  dimensions = {
    QueueName = aws_sqs_queue.events_dlq.name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# Alarm 3: Custom CalendarWatchListenerMalformedPayload metric — emitted by
# the Lambda when it rejects a payload (bad header, missing channel_id,
# unparseable body). Fires when count > 0 in any 5-minute window. The Lambda
# emits this via embedded metric format (EMF) from its structured logs.
# The metric filter that turns log lines into the CW metric is defined here
# so the alarm and its source live in one module.
resource "aws_cloudwatch_log_metric_filter" "malformed_payload" {
  name           = "Calendar_Watch_Listener-malformed-payload"
  log_group_name = aws_cloudwatch_log_group.listener.name

  # Match structured JSON log lines with event=malformed_payload.
  pattern = "{ $.event = \"malformed_payload\" }"

  metric_transformation {
    name          = "CalendarWatchListenerMalformedPayload"
    namespace     = "Picasso/Scheduling"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "malformed_payload" {
  alarm_name          = "Calendar_Watch_Listener-malformed-payload"
  alarm_description   = "Calendar_Watch_Listener rejected >= 1 push notification as malformed in any 5-minute window. Possible Google API drift, replay attack, or upstream bug. Inspect /aws/lambda/Calendar_Watch_Listener structured logs."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "CalendarWatchListenerMalformedPayload"
  namespace   = "Picasso/Scheduling"
  period      = 300
  statistic   = "Sum"

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# Alarm 4: auth_rejected — the Listener returns 403 + logs event=auth_rejected for
# unknown_channel_id (an orphaned Google channel still pushing after the Renewer's
# failed-renewal row-delete OR the Offboarder's auth-revoked delete) and for
# channel_token_mismatch (a forged/replayed push). This is the shared security
# backstop for the B3 + B6 orphan residuals; a 403 is NOT a Lambda Error, so it
# was previously invisible to alarming (sub-phase B audit SR-5, 2026-05-30). A
# sustained pattern (threshold 5 / 5min) flags a forgery attempt or a stuck orphan
# storm; the occasional orphan push (Google only pushes on calendar changes) stays
# under the threshold.
resource "aws_cloudwatch_log_metric_filter" "auth_rejected" {
  name           = "Calendar_Watch_Listener-auth-rejected"
  log_group_name = aws_cloudwatch_log_group.listener.name

  pattern = "{ $.event = \"auth_rejected\" }"

  metric_transformation {
    name          = "CalendarWatchListenerAuthRejected"
    namespace     = "Picasso/Scheduling"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "auth_rejected" {
  alarm_name          = "Calendar_Watch_Listener-auth-rejected"
  alarm_description   = "Calendar_Watch_Listener returned 403 (auth_rejected) >= 5 times in a 5-minute window. Either a forged/replayed push (channel_token_mismatch) or a stuck orphaned channel pushing after offboarding/failed-renewal (unknown_channel_id). Inspect /aws/lambda/Calendar_Watch_Listener structured logs for the reason field."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 5
  treat_missing_data  = "notBreaching"

  metric_name = "CalendarWatchListenerAuthRejected"
  namespace   = "Picasso/Scheduling"
  period      = 300
  statistic   = "Sum"

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# ==============================================================================
# Outputs
# ==============================================================================

output "listener_function_name" {
  value = aws_lambda_function.listener.function_name
}

output "listener_function_arn" {
  value = aws_lambda_function.listener.arn
}

output "listener_function_url" {
  value = aws_lambda_function_url.listener.function_url
}

output "listener_role_arn" {
  value = aws_iam_role.listener.arn
}

output "events_queue_arn" {
  value = aws_sqs_queue.events.arn
}

output "events_queue_url" {
  value = aws_sqs_queue.events.url
}

output "events_queue_name" {
  value = aws_sqs_queue.events.name
}

output "events_dlq_arn" {
  value = aws_sqs_queue.events_dlq.arn
}

output "events_dlq_name" {
  value = aws_sqs_queue.events_dlq.name
}
