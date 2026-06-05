/**
 * Prod ops alarms for Bedrock_Streaming_Handler (BSH) — the observability that
 * closes the Jun-2 FOS402334 silent-failure gap. This is the Phase-2 PILOT:
 * the first hand-managed prod resources brought under Terraform.
 *
 * Mirrors the ops-alarms-master-function-staging pattern, with two differences:
 *   1. It REFERENCES the existing hand-managed `picasso-ops-alerts` SNS topic by
 *      ARN (passed in) — it does NOT create it. That topic + its email/SMS
 *      subscriptions are managed outside Terraform (subscriptions don't fit IaC).
 *   2. All three resources ALREADY EXIST in prod (hand-created 2026-06-05 via
 *      Sandbox runbook). The HCL below matches them field-for-field, so
 *      `terraform import` adopts them and the first plan is a NO-OP. See
 *      docs/runbooks/prod-iac-pilot-alarms.md.
 *
 * Incident + design rationale: docs/runbooks/ + the foster-village incident memory.
 */

variable "bsh_log_group_name" {
  description = "Prod BSH CloudWatch log group — source for the analytics_write_failure metric filter."
  type        = string
  default     = "/aws/lambda/Bedrock_Streaming_Handler"
}

variable "ops_alerts_topic_arn" {
  description = "ARN of the existing hand-managed picasso-ops-alerts SNS topic (alarm target). NOT managed by this module."
  type        = string
}

variable "streaming_waf_name" {
  description = "Name of the prod CloudFront-scope WAF web ACL (for the SizeRestrictions_BODY count alarm)."
  type        = string
  default     = "picasso-streaming-waf"
}

# ─────────────────────────────────────────────────────────────────────────────
# #10 — metric filter: count `analytics_write_failure` log lines.
# Quoted-substring pattern, NOT a JSON `{$.evt=...}` pattern: the Node Lambda
# runtime prefixes each line with `TIMESTAMP RequestId INFO`, which breaks JSON
# metric-filter matching. The substring is unique to the real-failure path
# (distinct from benign analytics_write_duplicate / analytics_write_invalid).
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_metric_filter" "analytics_write_failure" {
  name           = "picasso-analytics-write-failure"
  log_group_name = var.bsh_log_group_name
  pattern        = "\"analytics_write_failure\""

  metric_transformation {
    name          = "AnalyticsWriteFailure"
    namespace     = "Picasso/Ops"
    value         = "1"
    default_value = "0"
    unit          = "None" # explicit: matches the live filter's default; avoids a cosmetic plan diff
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# #10 — alarm: BSH summary writes failing (the Jun-2 silent-failure gap).
# Foster Village is low-volume (the only active tenant) → 1-hour window, >=3
# failures. A real env-var/IAM outage fails EVERY message so it clears 3/hr; a
# lone transient throttle won't. notBreaching keeps quiet/healthy periods silent.
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "analytics_write_failure" {
  alarm_name          = "OUTAGE! Picasso analytics-summary writes failing"
  alarm_description   = "BSH writeSessionSummary is logging analytics_write_failure (env var / IAM / DDB). Silent failure class that caused the Jun-2 FOS402334 stoppage. Check BSH SESSION_SUMMARIES_TABLE env + role grant + the picasso-session-summaries table."
  namespace           = "Picasso/Ops"
  metric_name         = "AnalyticsWriteFailure"
  statistic           = "Sum"
  period              = 3600
  threshold           = 3
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# ─────────────────────────────────────────────────────────────────────────────
# #11 — alarm: WAF oversized-body counts (403-class resurgence early warning).
# SizeRestrictions_BODY is overridden to Count (kept permanently — 1yr browser
# cache). Healthy = 0 counted requests. A sustained rise = oversized POST bodies
# reaching the edge again (trim regression / cache not refreshing).
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "waf_oversized_body" {
  alarm_name          = "WARN! Picasso WAF oversized-body hits (SizeRestrictions_BODY)"
  alarm_description   = "WAF SizeRestrictions_BODY (overridden to Count) is counting oversized POST bodies again. Functionally passing (Count, not Block) but signals the >8KB-body / 403 class is resurging. Check widget body-trim is reaching clients (cache) or a new path inflating the request body."
  namespace           = "AWS/WAFV2"
  metric_name         = "CountedRequests"
  statistic           = "Sum"
  period              = 3600
  threshold           = 20
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    WebACL               = var.streaming_waf_name
    ManagedRuleGroup     = "AWSManagedRulesCommonRuleSet"
    ManagedRuleGroupRule = "SizeRestrictions_BODY"
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}
