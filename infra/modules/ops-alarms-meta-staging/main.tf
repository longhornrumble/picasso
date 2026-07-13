# Meta Messenger project — CloudWatch alarms.
#
# Faithful reproduction of Meta_Webhook_Handler/cloudwatch-alarms.json (the
# standalone artifact the prod-account originals carried). Five alarms, exact
# thresholds preserved. They publish to the EXISTING staging ops SNS topic
# (picasso-ops-alerts-staging, created by ops-alarms-master-function-staging) —
# this module takes the topic ARN as input rather than creating a second topic,
# keeping a single staging alerting channel.

variable "webhook_function_name" {
  description = "Meta_Webhook_Handler function name (alarm dimension)."
  type        = string
}

variable "response_processor_function_name" {
  description = "Meta_Response_Processor function name (alarm dimension)."
  type        = string
}

variable "response_dlq_name" {
  description = "meta-response-processor-dlq-staging queue name (SQS alarm dimension)."
  type        = string
}

variable "sns_topic_arn" {
  description = "Existing staging ops SNS topic ARN (module.ops_alarms_master_function_staging.topic_arn)."
  type        = string
}

# 1. Webhook handler errors — Sum >= 5 / 5min.
resource "aws_cloudwatch_metric_alarm" "webhook_errors" {
  alarm_name          = "meta-webhook-handler-errors-staging"
  alarm_description   = "Webhook handler Lambda errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { FunctionName = var.webhook_function_name }
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
}

# 2. Webhook handler approaching Meta's 5s deadline — p99 >= 4000ms / 2x5min.
resource "aws_cloudwatch_metric_alarm" "webhook_duration" {
  alarm_name          = "meta-webhook-handler-duration-staging"
  alarm_description   = "Webhook handler approaching Meta's 5-second deadline"
  namespace           = "AWS/Lambda"
  metric_name         = "Duration"
  extended_statistic  = "p99"
  period              = 300
  evaluation_periods  = 2
  threshold           = 4000
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { FunctionName = var.webhook_function_name }
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
}

# 3. Response processor errors — Sum >= 3 / 5min (messages failing to send).
resource "aws_cloudwatch_metric_alarm" "response_errors" {
  alarm_name          = "meta-response-processor-errors-staging"
  alarm_description   = "Response processor Lambda errors (messages failing to send)"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { FunctionName = var.response_processor_function_name }
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
}

# 4. DLQ depth > 0 — failed Messenger responses need investigation.
resource "aws_cloudwatch_metric_alarm" "response_dlq_depth" {
  alarm_name          = "meta-response-processor-dlq-depth-staging"
  alarm_description   = "DLQ has messages — failed Messenger responses need investigation"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { QueueName = var.response_dlq_name }
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
}

# 5. Response processor slow — p95 >= 20000ms / 2x5min (Bedrock slowness).
resource "aws_cloudwatch_metric_alarm" "response_duration" {
  alarm_name          = "meta-response-processor-duration-staging"
  alarm_description   = "Response processor taking too long (>20s indicates Bedrock slowness)"
  namespace           = "AWS/Lambda"
  metric_name         = "Duration"
  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 2
  threshold           = 20000
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { FunctionName = var.response_processor_function_name }
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
}

# ─────────────────────────────────────────────────────────────────────────────
# M-Ha — channel-health detection (Messenger Channel Experience, G1).
#
# Meta emits no token-invalidation webhook; a dead Page token just makes every
# send fail. The processor logs a structured META_SEND_FAILURE line per failed
# send (metaSendErrors.js, lambda repo) with a `classification` field from the
# reconciled error set. Filters below turn those into per-class metrics with a
# ChannelType dimension; alarms fire on the channel-death signals.
#
# Alarm philosophy (plan M-Ha adversarial focus - sustained vs one-off):
#   token_dead      - sustained (a dead token fails EVERY send; 2+/5min over
#                     3 periods separates real death from a blip)
#   page_restricted - immediate (a policy restriction is discrete + severe)
#   rate_limited    - burst threshold only
#   user_unavailable / window_closed - metrics only, NO alarm (per-user noise;
#                     the 24h guard owns window behavior)
# ─────────────────────────────────────────────────────────────────────────────

locals {
  meta_send_failure_classes = [
    "token_dead",
    "user_unavailable",
    "rate_limited",
    "window_closed",
    "page_restricted",
  ]
  response_processor_log_group = "/aws/lambda/${var.response_processor_function_name}"
}

resource "aws_cloudwatch_log_metric_filter" "meta_send_failure" {
  for_each       = toset(local.meta_send_failure_classes)
  name           = "meta-send-failure-${replace(each.key, "_", "-")}"
  log_group_name = local.response_processor_log_group
  pattern        = "{ $.message = \"META_SEND_FAILURE\" && $.classification = \"${each.key}\" }"

  metric_transformation {
    name      = "MetaSendFailure_${each.key}"
    namespace = "Picasso/MetaSend"
    value     = "1"
    # default_value deliberately omitted - incompatible with dimensions
    dimensions = {
      ChannelType = "$.channelType"
    }
  }
}

# token_dead: sustained per channel. OUTAGE! prefix per the ops convention -
# this is the silent-channel-death signal the subphase exists for.
resource "aws_cloudwatch_metric_alarm" "meta_send_token_dead" {
  for_each            = toset(["messenger", "instagram"])
  alarm_name          = "OUTAGE! Meta ${each.key} channel dead - Page token failing (staging)"
  alarm_description   = "Sustained Page-token failures on ${each.key} sends - the channel is dead (Meta error 190). Reconnect runbook: docs/runbooks/MESSENGER_OPS.md"
  namespace           = "Picasso/MetaSend"
  metric_name         = "MetaSendFailure_token_dead"
  dimensions          = { ChannelType = each.key }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 3
  threshold           = 2
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
}

resource "aws_cloudwatch_metric_alarm" "meta_send_page_restricted" {
  for_each            = toset(["messenger", "instagram"])
  alarm_name          = "OUTAGE! Meta ${each.key} Page messaging restricted (staging)"
  alarm_description   = "Page messaging restricted by Meta on ${each.key} (error 10/1893063) - policy enforcement. Runbook: docs/runbooks/MESSENGER_OPS.md"
  namespace           = "Picasso/MetaSend"
  metric_name         = "MetaSendFailure_page_restricted"
  dimensions          = { ChannelType = each.key }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
}

resource "aws_cloudwatch_metric_alarm" "meta_send_rate_limited" {
  for_each            = toset(["messenger", "instagram"])
  alarm_name          = "meta-send-rate-limited-${each.key}-staging"
  alarm_description   = "Burst of Meta rate-limit errors (613) on ${each.key} sends"
  namespace           = "Picasso/MetaSend"
  metric_name         = "MetaSendFailure_rate_limited"
  dimensions          = { ChannelType = each.key }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 15
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.sns_topic_arn]
  ok_actions          = [var.sns_topic_arn]
}
