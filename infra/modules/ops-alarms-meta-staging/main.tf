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
