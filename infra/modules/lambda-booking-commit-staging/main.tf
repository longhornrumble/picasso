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
#   - DynamoDB footprint at C8 was exactly TWO tables: Booking (Get/Put/Update/
#     Delete, no GSI/Query) + RoutingPolicy (UpdateItem only — atomic round-robin
#     cursor advance/revert).
# UPDATE (2026-06-04, lambda#227 propose route): the §B16a scheduling_propose route
# was later added to this SAME function and brings candidate-resolver, which READS
# two more tables (AppointmentType + employee-registry-v2) and ALSO GetItems
# RoutingPolicy (read, not just the commit-route UpdateItem). Those grants were
# missed in the #227 weave and the route AccessDenied on its first read until the
# 2026-06-04 live UAT surfaced it. Added as DDBSchedulingProposeReads +
# DDBEmployeeRegistryQuery (the S3 config-gate grant was already codified separately).
# If a future live smoke surfaces another needed table, that is again a reviewed grant.

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

# ── scheduling_propose route reads (added when the §B16a propose route landed on
# BCH in lambda#227; the C8 commit-only scoping below predates it). candidate-resolver
# (bundled via shared/scheduling) does GetItem on AppointmentType + RoutingPolicy and a
# tenant-partition Query on the employee registry to resolve the candidate pool. Without
# these the propose route AccessDenies on its first read — caught by the 2026-06-04 live
# UAT (the route had never been invoked end-to-end on staging). ──
variable "appointment_type_table_arn" {
  description = "ARN of picasso-appointment-type-staging. §B16a propose route: candidate-resolver defaultGetAppointmentType GetItem (resolve the appointment type → its routing_policy_id)."
  type        = string
}

variable "appointment_type_table_name" {
  type = string
}

variable "employee_registry_table_arn" {
  description = "ARN of picasso-employee-registry-v2-staging. §B16a propose route: candidate-resolver defaultQueryEmployees tenant-partition Query (scheduling-tagged employees → candidate pool; resourceId = email). Query on the base table by tenantId PK — no index."
  type        = string
}

variable "employee_registry_table_name" {
  type = string
}

# ── G6 reschedule_link: notify.js emails the guest a self-serve reschedule link. It invokes
# the send_email Lambda and reads the per-tenant §E14 template override (fail-safe → default). ──
variable "scheduling_notif_template_table_arn" {
  description = "ARN of picasso-scheduling-notif-template-staging. G6 reschedule_link: notify.js GetItem of the per-tenant §E14 template override at dispatch (read-only; fail-safe to the platform default if absent)."
  type        = string
}

variable "scheduling_notif_template_table_name" {
  type = string
}

variable "send_email_function_name" {
  description = "Name of the reusable send_email Lambda the G6 reschedule_link notice invokes (async). The exec role is granted lambda:InvokeFunction on exactly this function ARN."
  type        = string
  default     = "send_email"
}

# ── G7b reschedule_link SMS supplement: notify.js ALSO texts the guest the reschedule link
# when the tenant enabled org SMS AND the guest has live consent AND it is not quiet-hours
# (selectChannels gate). BCH GetItems the guest's consent record (pre-filter) and invokes the
# SMS_Sender twin (which re-checks consent server-side). Both grants are scoped to one ARN. ──
variable "sms_consent_table_arn" {
  description = "ARN of picasso-sms-consent-staging. G7b reschedule_link: BCH GetItem of the guest's transactional-SMS consent record (read-only pre-filter; fail-safe → SMS suppressed if absent). MUST be the SAME table the SMS_Sender twin re-checks."
  type        = string
}

variable "sms_consent_table_name" {
  type = string
}

variable "sms_sender_function_arn" {
  description = "ARN of the staging SMS_Sender twin. G7b reschedule_link: notify.js async-invokes it (sendType:'contact') for the SMS supplement. The exec role is granted lambda:InvokeFunction on exactly this ARN — no wildcard."
  type        = string
}

variable "sms_sender_function_name" {
  type = string
}

# ── Track 1 S6: reminder-system wiring (scheduleReminders + rebindReminders) ──
variable "scheduled_messages_table_arn" {
  description = "ARN of picasso-scheduled-messages. BCH PutItem (scheduleReminders writes new rows at commit) + DeleteItem (rebindReminders removes old rows before re-scheduling)."
  type        = string
}

variable "scheduled_messages_table_name" {
  type = string
}

variable "scheduler_exec_role_arn" {
  description = "ARN of the dedicated EventBridge Scheduler execution role (in lambda-reminder-scheduler-staging). BCH iam:PassRole is scoped to EXACTLY this ARN (never *). Passed as Target.RoleArn on every scheduler:CreateSchedule call."
  type        = string
}

variable "scheduler_target_arn" {
  description = "ARN of the Scheduled_Message_Sender Lambda (the EventBridge schedule target). BCH passes this as Target.Arn on every CreateSchedule."
  type        = string
}

variable "scheduler_group_name" {
  description = "Name of the dedicated reminder schedule group. BCH CreateSchedule + DeleteSchedule are scoped to this group."
  type        = string
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

variable "tenant_config_bucket_arn" {
  description = "ARN of the staging tenant config S3 bucket. The scheduling feature gate reads tenants/{id}/config.json to check feature_flags.scheduling_enabled (fail-closed when unreadable)."
  type        = string
}

variable "config_bucket_name" {
  description = "Name of the staging tenant config S3 bucket (CONFIG_BUCKET env for the feature gate)."
  type        = string
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

  # §B16a propose route reads (lambda#227): candidate-resolver does GetItem on the
  # AppointmentType row (→ routing_policy_id) and the RoutingPolicy row (→ tag_conditions).
  # GetItem ONLY — the propose route never writes these (the round-robin write stays the
  # commit route's UpdateItem statement above). Precisely scoped per action↔resource.
  statement {
    sid       = "DDBSchedulingProposeReads"
    actions   = ["dynamodb:GetItem"]
    resources = [var.appointment_type_table_arn, var.routing_policy_table_arn]
  }

  # §B16a propose route: candidate-resolver Query of the employee registry's tenant
  # partition (tenantId PK) for scheduling-tagged candidates. Query ONLY, base table (no index).
  statement {
    sid       = "DDBEmployeeRegistryQuery"
    actions   = ["dynamodb:Query"]
    resources = [var.employee_registry_table_arn]
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

  # Scheduling feature gate: read the tenant config to check feature_flags.scheduling_enabled.
  # Scoped to tenants/*/config.json + tenants/*/{id}-config.json (both config-key
  # conventions; NOT the whole bucket) - the gate reads nothing else.
  statement {
    sid     = "ConfigBucketReadSchedulingGate"
    actions = ["s3:GetObject"]
    resources = [
      "${var.tenant_config_bucket_arn}/tenants/*/config.json",
      "${var.tenant_config_bucket_arn}/tenants/*/*-config.json",
    ]
  }

  # G6 reschedule_link (the ADA-triggered "send reschedule link" action): notify.js emails the
  # guest via the reusable send_email Lambda (async invoke). Scoped to EXACTLY that function ARN
  # — no wildcard. Mirrors the Calendar_Event_Consumer reoffer-notice grant.
  statement {
    sid       = "InvokeSendEmail"
    actions   = ["lambda:InvokeFunction"]
    resources = ["arn:${data.aws_partition.current.partition}:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:${var.send_email_function_name}"]
  }

  # G6 reschedule_link: notify.js reads the per-tenant §E14 notification-template override at
  # dispatch (GetItem on (tenantId, moment); fail-safe → platform default if absent). Read-only,
  # base table only. Mirrors the consumers' DDBReadSchedulingNotifTemplate grant.
  statement {
    sid       = "DDBReadSchedulingNotifTemplate"
    actions   = ["dynamodb:GetItem"]
    resources = [var.scheduling_notif_template_table_arn]
  }

  # G7b reschedule_link SMS supplement: BCH reads the guest's transactional-SMS consent record
  # (GetItem on (pk=TENANT#{tenantId}, sk=CONSENT#transactional#{E.164})) to pre-filter the
  # selectChannels gate. Read-only, base table only — no GSI. Fail-safe: a miss/error → SMS
  # suppressed (email floor stands). The SMS_Sender twin re-checks the SAME record server-side.
  statement {
    sid       = "DDBReadSmsConsent"
    actions   = ["dynamodb:GetItem"]
    resources = [var.sms_consent_table_arn]
  }

  # G7b reschedule_link SMS supplement: notify.js async-invokes the SMS_Sender twin
  # (sendType:'contact'). Scoped to EXACTLY that function ARN — no wildcard. Mirrors the
  # InvokeSendEmail grant above.
  statement {
    sid       = "InvokeSmsSender"
    actions   = ["lambda:InvokeFunction"]
    resources = [var.sms_sender_function_arn]
  }

  # ── Track 1 S6: reminder system (scheduleReminders + rebindReminders) ──

  # EventBridge Scheduler: BCH calls scheduleReminders() at commit and
  # rebindReminders() on reschedule -- both create and delete per-booking reminder
  # schedules in the dedicated group. Scoped to the group pattern (not account-wide *).
  statement {
    sid = "SchedulerCreateDelete"
    actions = [
      "scheduler:CreateSchedule",
      "scheduler:DeleteSchedule",
    ]
    resources = [
      "arn:${data.aws_partition.current.partition}:scheduler:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:schedule/${var.scheduler_group_name}/*",
    ]
  }

  # iam:PassRole: BCH sets Target.RoleArn on every CreateSchedule to the dedicated
  # Scheduler execution role. Scoped to EXACTLY that role ARN -- never *.
  # HIGH-RISK: a wildcard here would allow BCH to pass any role in the account
  # to EventBridge Scheduler (privilege escalation). The ARN is the scheduler_exec
  # role from lambda-reminder-scheduler-staging; BCH cannot vary it.
  statement {
    sid       = "PassReminderSchedulerRole"
    actions   = ["iam:PassRole"]
    resources = [var.scheduler_exec_role_arn]
    # Defense-in-depth: the role may ONLY be passed to EventBridge Scheduler (the
    # scheduler_exec trust policy already restricts who can assume it; this also
    # restricts where BCH can hand it off).
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["scheduler.amazonaws.com"]
    }
  }

  # Scheduled-messages table: PutItem (scheduleReminders writes new rows at commit)
  # + DeleteItem (rebindReminders removes old rows before re-scheduling).
  statement {
    sid = "DDBScheduledMessagesWrite"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
    ]
    resources = [var.scheduled_messages_table_arn]
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
      APPOINTMENT_TYPE_TABLE   = var.appointment_type_table_name
      EMPLOYEE_REGISTRY_TABLE  = var.employee_registry_table_name
      OAUTH_SECRET_PATH_PREFIX = "picasso/scheduling/oauth"
      ZOOM_SECRET_PATH_PREFIX  = "picasso/scheduling/zoom"
      SES_FROM_EMAIL           = "notify@myrecruiter.ai"
      SES_CONFIGURATION_SET    = "picasso-emails"
      SCHEDULE_BASE_URL        = "https://staging.schedule.myrecruiter.ai"
      OPS_ALERTS_TOPIC_ARN     = var.ops_alerts_topic_arn
      JWT_SECRET_KEY_NAME      = "picasso/staging/jwt/signing-key"
      # G6 reschedule_link: notify.js emails the guest via the send_email Lambda + honors the
      # per-tenant §E14 template override (fail-safe → default if the table/row is absent).
      SEND_EMAIL_FUNCTION        = var.send_email_function_name
      SCHED_NOTIF_TEMPLATE_TABLE = var.scheduling_notif_template_table_name
      # G7b reschedule_link SMS supplement: the SMS_Sender twin + the consent table BCH
      # pre-filters against (same table the twin re-checks server-side).
      SMS_SENDER_FUNCTION = var.sms_sender_function_name
      SMS_CONSENT_TABLE   = var.sms_consent_table_name
      CONFIG_BUCKET       = var.config_bucket_name
      S3_CONFIG_BUCKET    = var.config_bucket_name
      # Track 1 S6: reminder system wiring. scheduleReminders() + rebindReminders()
      # read these from env to create/delete per-booking EventBridge reminder schedules.
      SCHEDULER_TARGET_ARN     = var.scheduler_target_arn
      SCHEDULER_ROLE_ARN       = var.scheduler_exec_role_arn
      SCHEDULER_GROUP_NAME     = var.scheduler_group_name
      SCHEDULED_MESSAGES_TABLE = var.scheduled_messages_table_name
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
