# Scheduling integrator-glue I4 + topology cutover I2-A — SNS FIFO fan-out for
# the typed booking.* calendar-watch events.
#
# TOPOLOGY (resolved 2026-06-01, operator I2-A; see
# scheduling/docs/listener_dispatch_interface.md "Queue topology RESOLVED"):
# the Calendar_Watch_Listener (B2) currently SendMessages each typed event to a
# SINGLE bare FIFO queue. A single FIFO consumer SILENTLY DISCARDS every event
# type it does not own (no DLQ trace). To give each logical consumer exactly the
# event types it owns, the Listener instead PUBLISHES to this SNS FIFO topic and
# the topic fans out to per-consumer FIFO queues via subscription filter policies:
#
#   Calendar_Watch_Listener ──publish──▶ picasso-calendar-watch-events-staging.fifo (SNS FIFO)
#                                              │
#                  filter {event_type: ooo_overlap_detected | attendee_declined}
#                                              ├──▶ picasso-calendar-event-consumer-staging.fifo ──▶ Calendar_Event_Consumer (lambda#195, LIVE)
#                                              │
#       filter {event_type: calendar_deleted | calendar_moved | calendar_reassigned | event_made_private}
#                                              └──▶ picasso-calendar-lifecycle-consumer-staging.fifo ──▶ (WS-CAL-LIFECYCLE, NOT YET DEPLOYED)
#
#   booking.attendee_accepted matches NEITHER filter → it is intentionally
#   dropped at the topic (no consumer; an accept causes no Booking.status change).
#
# COUPLED INTEGRATOR CHANGE (NOT in this module — flagged in the PR): the Listener
# code flip from SQSClient SendMessage → SNSClient Publish (MessageGroupId=event_id
# and MessageDeduplicationId=(event_id,last_calendar_mutation_at) PRESERVED) lands
# in the lambda repo WITH this cutover, plus the Listener exec-role sns:Publish grant
# + the EVENTS_TOPIC_ARN env var (output below). The topic MUST exist (this PR
# applied) BEFORE the Listener flips. The bare picasso-calendar-watch-events-*.fifo
# queue in the listener module is retired/repurposed by the integrator AFTER cutover.
#
# FILTERING: payload-based (FilterPolicyScope = MessageBody) on the envelope's
# `event_type` field — so the Listener publishes the SAME envelope JSON it sends
# to SQS today (no MessageAttributes required). raw_message_delivery = true so each
# consumer's record.body is the bare envelope JSON (NOT an SNS notification wrapper)
# — the merged consumer code does JSON.parse(record.body) expecting the envelope.
#
# Dedup: the Listener supplies MessageDeduplicationId explicitly, so
# content_based_deduplication = false on the topic AND every queue.
#
# PII: every envelope may carry attendee_email (declined/accepted) — every queue
# and DLQ is encrypted at rest with SQS-managed SSE, matching the listener module's
# events queue (sub-phase B audit SR-3).

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "env" {
  description = "Environment suffix (staging). This module is staging-gated in main.tf."
  type        = string
}

variable "ops_alerts_topic_arn" {
  description = "ARN of picasso-ops-alerts-staging SNS topic — target of the DLQ-depth and lifecycle-backlog alarms."
  type        = string
}

variable "event_consumer_visibility_timeout_seconds" {
  description = "Visibility timeout for the Calendar_Event_Consumer queue. AWS guidance: >= 6x the consumer Lambda timeout (30s) = 180s."
  type        = number
  default     = 180
}

variable "listener_exec_role_arn" {
  description = "ARN of the Calendar_Watch_Listener execution role — the ONLY principal allowed to SNS:Publish booking.* envelopes to this topic. Wired from main.tf via the listener module's listener_role_arn output. Without this lock-down the default SNS topic policy lets ANY same-account principal publish a forged envelope that the consumers would act on (review B-1)."
  type        = string
}

# ------------------------------------------------------------------
# Data sources
# ------------------------------------------------------------------

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_partition" "current" {}

# ==============================================================================
# SNS FIFO fan-out topic — the Listener publishes typed booking.* events here.
# ==============================================================================

resource "aws_sns_topic" "events" {
  name                        = "picasso-calendar-watch-events-${var.env}.fifo"
  fifo_topic                  = true
  content_based_deduplication = false # Listener supplies MessageDeduplicationId explicitly

  # SR-1: envelopes carry attendee_email (PII). The SQS queues are SSE-encrypted;
  # encrypt the SNS hop too. AWS-managed SNS key (no dedicated CMK needed) — its
  # key policy lets account principals use it via SNS, so the Listener publish
  # works without an extra kms grant.
  kms_master_key_id = "alias/aws/sns"

  tags = {
    Name     = "picasso-calendar-watch-events-${var.env}.fifo"
    Subphase = "I4"
  }
}

# B-1: lock down SNS:Publish to the Listener exec role ONLY. Setting an explicit
# topic policy REPLACES the permissive default (which lets any same-account
# principal publish via AWS:SourceOwner) — without this, any same-account
# principal could publish a forged booking.* envelope (e.g. a fabricated
# attendee_declined that silently cancels a Booking). Root retains admin so
# Terraform/operators can manage the topic + create the subscriptions below.
data "aws_iam_policy_document" "events_topic" {
  statement {
    sid     = "AllowListenerPublishOnly"
    effect  = "Allow"
    actions = ["SNS:Publish"]
    principals {
      type        = "AWS"
      identifiers = [var.listener_exec_role_arn]
    }
    resources = [aws_sns_topic.events.arn]
  }

  statement {
    sid     = "AllowAccountAdmin"
    effect  = "Allow"
    actions = ["SNS:*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
    resources = [aws_sns_topic.events.arn]
  }
}

resource "aws_sns_topic_policy" "events" {
  arn    = aws_sns_topic.events.arn
  policy = data.aws_iam_policy_document.events_topic.json
}

# ==============================================================================
# Consumer 1 — Calendar_Event_Consumer (lambda#195, LIVE): ooo_overlap + decline
# ==============================================================================

resource "aws_sqs_queue" "event_consumer_dlq" {
  name                        = "picasso-calendar-event-consumer-dlq-${var.env}.fifo"
  fifo_queue                  = true
  content_based_deduplication = false
  message_retention_seconds   = 1209600 # 14 days for forensic review
  sqs_managed_sse_enabled     = true    # envelopes carry attendee_email (PII)

  tags = {
    Name     = "picasso-calendar-event-consumer-dlq-${var.env}.fifo"
    Subphase = "I4"
  }
}

resource "aws_sqs_queue" "event_consumer" {
  name                        = "picasso-calendar-event-consumer-${var.env}.fifo"
  fifo_queue                  = true
  content_based_deduplication = false  # SNS delivers the publisher's MessageDeduplicationId
  message_retention_seconds   = 345600 # 4 days — consumer-SLA per dispatch-interface idempotency note
  visibility_timeout_seconds  = var.event_consumer_visibility_timeout_seconds
  receive_wait_time_seconds   = 20   # long-poll
  sqs_managed_sse_enabled     = true # envelopes carry attendee_email (PII)

  # maxReceiveCount = 3: a permanently-malformed message redrives to the DLQ after
  # 3 receives so it cannot stall its FIFO message group (MessageGroupId = event_id =
  # booking_id, so a poison message only blocks that one booking's group, never others).
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.event_consumer_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name     = "picasso-calendar-event-consumer-${var.env}.fifo"
    Subphase = "I4"
  }
}

resource "aws_sqs_queue_redrive_allow_policy" "event_consumer_dlq" {
  queue_url = aws_sqs_queue.event_consumer_dlq.id
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.event_consumer.arn]
  })
}

# Allow ONLY this SNS topic to SendMessage to the queue.
resource "aws_sqs_queue_policy" "event_consumer" {
  queue_url = aws_sqs_queue.event_consumer.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowSNSFanoutPublish"
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.event_consumer.arn
      Condition = { ArnEquals = { "aws:SourceArn" = aws_sns_topic.events.arn } }
    }]
  })
}

resource "aws_sns_topic_subscription" "event_consumer" {
  topic_arn            = aws_sns_topic.events.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.event_consumer.arn
  raw_message_delivery = true # consumer record.body must be the bare envelope JSON

  # Payload-based filter on the envelope's event_type. Values carry the canonical
  # `booking.` prefix per listener_dispatch_interface.md + the merged consumer code
  # (EVENT_OOO_OVERLAP = 'booking.ooo_overlap_detected'). NOTE: the WS-IAC work-order
  # listed these unprefixed for brevity — the FULL prefixed values are used here so the
  # filter matches the actual published envelope (flagged in the PR as a doc shorthand).
  filter_policy_scope = "MessageBody"
  filter_policy = jsonencode({
    event_type = ["booking.ooo_overlap_detected", "booking.attendee_declined"]
  })
}

# ==============================================================================
# Consumer 2 — Calendar_Lifecycle_Consumer (WS-CAL-LIFECYCLE, NOT YET DEPLOYED).
# The queue + subscription are provisioned NOW so the four calendar-lifecycle event
# types are RETAINED (not dropped at the topic) during the gap before WS-CAL-LIFECYCLE
# ships its consumer Lambda + event-source-mapping. Until then NO Lambda polls this
# queue: messages accumulate up to the 14-day retention, and the backlog alarm below
# makes that visible. WS-CAL-LIFECYCLE adds the consumer module, the event-source-
# mapping, and tunes visibility_timeout to >= 6x its Lambda timeout.
# ==============================================================================

resource "aws_sqs_queue" "lifecycle_consumer_dlq" {
  name                        = "picasso-calendar-lifecycle-consumer-dlq-${var.env}.fifo"
  fifo_queue                  = true
  content_based_deduplication = false
  message_retention_seconds   = 1209600 # 14 days
  sqs_managed_sse_enabled     = true

  tags = {
    Name     = "picasso-calendar-lifecycle-consumer-dlq-${var.env}.fifo"
    Subphase = "I4"
  }
}

resource "aws_sqs_queue" "lifecycle_consumer" {
  name                        = "picasso-calendar-lifecycle-consumer-${var.env}.fifo"
  fifo_queue                  = true
  content_based_deduplication = false
  message_retention_seconds   = 1209600 # 14 days — maximize the capture window pre-consumer
  visibility_timeout_seconds  = 180     # placeholder; WS-CAL-LIFECYCLE retunes to 6x its Lambda timeout
  receive_wait_time_seconds   = 20
  sqs_managed_sse_enabled     = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.lifecycle_consumer_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name     = "picasso-calendar-lifecycle-consumer-${var.env}.fifo"
    Subphase = "I4"
  }
}

resource "aws_sqs_queue_redrive_allow_policy" "lifecycle_consumer_dlq" {
  queue_url = aws_sqs_queue.lifecycle_consumer_dlq.id
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.lifecycle_consumer.arn]
  })
}

resource "aws_sqs_queue_policy" "lifecycle_consumer" {
  queue_url = aws_sqs_queue.lifecycle_consumer.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowSNSFanoutPublish"
      Effect    = "Allow"
      Principal = { Service = "sns.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.lifecycle_consumer.arn
      Condition = { ArnEquals = { "aws:SourceArn" = aws_sns_topic.events.arn } }
    }]
  })
}

resource "aws_sns_topic_subscription" "lifecycle_consumer" {
  topic_arn            = aws_sns_topic.events.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.lifecycle_consumer.arn
  raw_message_delivery = true

  filter_policy_scope = "MessageBody"
  filter_policy = jsonencode({
    event_type = [
      "booking.calendar_deleted",
      "booking.calendar_moved",
      "booking.calendar_reassigned",
      "booking.event_made_private",
    ]
  })
}

# ==============================================================================
# CloudWatch alarms — DLQ depth (both) + lifecycle no-consumer backlog
# ==============================================================================

resource "aws_cloudwatch_metric_alarm" "event_consumer_dlq_depth" {
  alarm_name          = "picasso-calendar-event-consumer-dlq-depth"
  alarm_description   = "picasso-calendar-event-consumer-dlq-${var.env}.fifo has >= 1 message — Calendar_Event_Consumer failed an event past max-receive-count. Inspect via aws sqs receive-message; do NOT purge without forensic review."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "ApproximateNumberOfMessagesVisible"
  namespace   = "AWS/SQS"
  period      = 300
  statistic   = "Maximum"

  dimensions = {
    QueueName = aws_sqs_queue.event_consumer_dlq.name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

resource "aws_cloudwatch_metric_alarm" "lifecycle_consumer_dlq_depth" {
  alarm_name          = "picasso-calendar-lifecycle-consumer-dlq-depth"
  alarm_description   = "picasso-calendar-lifecycle-consumer-dlq-${var.env}.fifo has >= 1 message. Inspect via aws sqs receive-message; do NOT purge without forensic review."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "ApproximateNumberOfMessagesVisible"
  namespace   = "AWS/SQS"
  period      = 300
  statistic   = "Maximum"

  dimensions = {
    QueueName = aws_sqs_queue.lifecycle_consumer_dlq.name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# Backlog alarm — until WS-CAL-LIFECYCLE deploys a consumer, NO Lambda polls the
# lifecycle queue, so lifecycle events accumulate. This makes the "no consumer yet"
# state visible (and distinguishes it from "consumer broke" once WS-CAL-LIFECYCLE
# ships). Threshold > 0 over 1h (oldest-message age would be a better signal but
# ApproximateNumberOfMessagesVisible is the simplest depth proxy at pilot scale).
resource "aws_cloudwatch_metric_alarm" "lifecycle_consumer_backlog" {
  alarm_name          = "picasso-calendar-lifecycle-consumer-backlog"
  alarm_description   = "picasso-calendar-lifecycle-consumer-${var.env}.fifo has >= 1 message. EXPECTED while WS-CAL-LIFECYCLE is undeployed (no consumer Lambda yet — events are retained up to 14 days then expire). Once WS-CAL-LIFECYCLE ships its consumer, a sustained backlog means the consumer is failing to drain."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  treat_missing_data  = "notBreaching"

  metric_name = "ApproximateNumberOfMessagesVisible"
  namespace   = "AWS/SQS"
  period      = 3600
  statistic   = "Maximum"

  dimensions = {
    QueueName = aws_sqs_queue.lifecycle_consumer.name
  }

  alarm_actions = [var.ops_alerts_topic_arn]
  ok_actions    = [var.ops_alerts_topic_arn]
}

# ==============================================================================
# Outputs
# ==============================================================================

output "events_topic_arn" {
  description = "ARN of the SNS FIFO fan-out topic. The integrator sets this as the Listener's EVENTS_TOPIC_ARN env var (replacing EVENTS_QUEUE_URL) and grants the Listener role sns:Publish on it (coupled change)."
  value       = aws_sns_topic.events.arn
}

output "events_topic_name" {
  value = aws_sns_topic.events.name
}

output "event_consumer_queue_arn" {
  value = aws_sqs_queue.event_consumer.arn
}

output "event_consumer_queue_url" {
  value = aws_sqs_queue.event_consumer.url
}

output "event_consumer_queue_name" {
  value = aws_sqs_queue.event_consumer.name
}

output "event_consumer_dlq_arn" {
  value = aws_sqs_queue.event_consumer_dlq.arn
}

output "lifecycle_consumer_queue_arn" {
  value = aws_sqs_queue.lifecycle_consumer.arn
}

output "lifecycle_consumer_queue_url" {
  value = aws_sqs_queue.lifecycle_consumer.url
}

output "lifecycle_consumer_dlq_arn" {
  value = aws_sqs_queue.lifecycle_consumer_dlq.arn
}
