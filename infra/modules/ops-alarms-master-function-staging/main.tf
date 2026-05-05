/**
 * Issue #5 PR A2-infra: SNS topic + CloudWatch alarms for Master_Function_Staging.
 *
 * The PR A2 plan (~/.claude/plans/issue-5-server-side-analytics-recording.md)
 * requires a CloudWatch alarm on `handle_chat` p99 duration > 5s for 5 min.
 * The 2-second boto3 timeout on the analytics writer adds ~2s worst-case to
 * the HTTP-fallback chat path; this alarm catches sustained latency
 * regressions before they erode user experience.
 *
 * Also creates an alarm on the kb_creds_init_failed structured signal
 * (added in PR A) so cross-account credential failures alert immediately.
 */

variable "function_name" {
  description = "The Master_Function_Staging Lambda function name."
  type        = string
}

variable "log_group_name" {
  description = "CloudWatch log group for Master_Function_Staging (used by metric filter)."
  type        = string
}

variable "topic_name" {
  description = "SNS topic name for ops alerts."
  type        = string
  default     = "picasso-ops-alerts-staging"
}

# ─────────────────────────────────────────────────────────────────────────────
# SNS topic for ops alerts. Subscribers (email/PagerDuty/Slack) wired
# manually via Console — this module only creates the topic so alarms have
# a target. Subscriptions are intentionally OUT of Terraform state because
# they often involve email confirmation flows that don't fit IaC well.
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_sns_topic" "ops_alerts" {
  name = var.topic_name
}

# ─────────────────────────────────────────────────────────────────────────────
# Alarm 1: handle_chat p99 duration > 5s for 5 minutes.
# Lambda function-level Duration metric covers ALL invocations of the function;
# the v7 plan references handle_chat specifically because it's the dominant
# code path. Using function-level Duration is acceptable proxy — handle_chat
# accounts for the bulk of traffic on this Lambda.
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "master_function_p99_duration" {
  alarm_name          = "${var.function_name}-p99-duration-high"
  alarm_description   = "Master_Function_Staging p99 duration exceeded 5s for 5 minutes — analytics writer or downstream DDB latency may be impacting chat responses."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 5000 # milliseconds
  treat_missing_data  = "notBreaching"

  metric_name        = "Duration"
  namespace          = "AWS/Lambda"
  period             = 300 # 5 minutes
  extended_statistic = "p99"

  dimensions = {
    FunctionName = var.function_name
  }

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]
}

# ─────────────────────────────────────────────────────────────────────────────
# Alarm 2: kb_creds_init_failed signal from shared/bedrock-core.js.
# Fires when the Bedrock Lambda's cross-account credential setup falls back
# to default creds (= cross-account KB Retrieve will AccessDenied silently).
# Per PR A finding B3.
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_metric_filter" "kb_creds_init_failed" {
  name           = "kb_creds_init_failed"
  log_group_name = var.log_group_name
  pattern        = "kb_creds_init_failed"

  metric_transformation {
    name          = "KbCredsInitFailed"
    namespace     = "Picasso/Master_Function_Staging"
    value         = "1"
    default_value = 0
  }
}

resource "aws_cloudwatch_metric_alarm" "kb_creds_init_failed" {
  alarm_name          = "${var.function_name}-kb-creds-init-failed"
  alarm_description   = "Cross-account KB credential initialization failed in Master_Function_Staging. Bedrock Retrieve calls will degrade silently. Likely cause: @aws-sdk/credential-providers missing from deploy package."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  treat_missing_data  = "notBreaching"

  metric_name = "KbCredsInitFailed"
  namespace   = "Picasso/Master_Function_Staging"
  period      = 300
  statistic   = "Sum"

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
}

# ─────────────────────────────────────────────────────────────────────────────
# Alarm 3: analytics_write_failure log signal — non-throttle, non-duplicate
# DDB failures from the analytics writer itself. Catches IAM regressions,
# table missing, schema drift.
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_metric_filter" "analytics_write_failure" {
  name           = "analytics_write_failure"
  log_group_name = var.log_group_name
  pattern        = "analytics_write_failure"

  metric_transformation {
    name          = "AnalyticsWriteFailure"
    namespace     = "Picasso/Master_Function_Staging"
    value         = "1"
    default_value = 0
  }
}

resource "aws_cloudwatch_metric_alarm" "analytics_write_failure" {
  alarm_name          = "${var.function_name}-analytics-write-failure"
  alarm_description   = "Analytics writer failed (non-throttle, non-duplicate) more than 5 times in 5 minutes. See classify_error in analytics_writer.py for what error codes can fire this."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 5
  treat_missing_data  = "notBreaching"

  metric_name = "AnalyticsWriteFailure"
  namespace   = "Picasso/Master_Function_Staging"
  period      = 300
  statistic   = "Sum"

  alarm_actions = [aws_sns_topic.ops_alerts.arn]
}

# ─────────────────────────────────────────────────────────────────────────────
output "topic_arn" {
  value = aws_sns_topic.ops_alerts.arn
}

output "topic_name" {
  value = aws_sns_topic.ops_alerts.name
}
