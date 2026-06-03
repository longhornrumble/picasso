terraform {
  required_version = ">= 1.5.0"

  # Backend is configured per-env via -backend-config=backend/<env>.tfbackend
  # at `terraform init` time — keeps a single root module deploying to N envs.
  backend "s3" {}

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  # AWS credentials sourced from AWS_PROFILE env var. Set it before running terraform:
  #   AWS_PROFILE=myrecruiter-staging terraform plan -var-file=envs/staging.tfvars
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.env
      ManagedBy   = "terraform"
      Project     = "myrecruiter"
    }
  }
}

module "session_summaries" {
  source = "./modules/ddb-session-summaries"
  env    = var.env
}

# BSH form_handler twin tables — Phase A of the staging-twin sequencing
# (`project_staging_twin_resource_provisioning_backlog.md`). Provisions the 2
# tables BSH form_handler.js references that didn't yet exist in either env:
# `picasso-sms-consent-{env}` and `picasso-sms-usage-{env}`. The other 2
# tables (`picasso-form-submissions-staging`, `picasso-notification-sends-staging`)
# are already managed by `ddb_form_submissions_staging` (lines 91-94) +
# `ddb_notification_sends_staging` (lines 101-104) below — Phase A intentionally
# does NOT redeclare them.
#
# DEVIATION FROM PATTERN (Phase A.1 audit row #5): this module has no
# `count = var.env == "staging" ? 1 : 0` guard, unlike every other staging-specific
# module below. Intentional — BSH form_handler.js needs these tables in every
# environment that runs the Lambda (dev for iteration, staging for live traffic
# pre-Phase-D, prod after promotion). Tables are PAY_PER_REQUEST so cost-zero
# when idle. If someone runs a prod apply, `picasso-sms-consent-prod` +
# `picasso-sms-usage-prod` would be created — that is the correct behavior for
# prod promotion, NOT an accident.
module "picasso_form_tables" {
  source = "./modules/picasso-form-tables"
  env    = var.env
}

# Staging-only: cross-account replication target for prod tenant configs.
# Bucket lives in the staging account; replication IS configured on the prod
# source bucket (hand-applied with chris-admin until P0 Phase 2 brings prod
# under Terraform). See infra/README.md and the v7 Issue #5 plan.
module "tenant_config_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/s3-tenant-config-staging"

  # Q5 Phase 1 Apply 2 [B2]: grant the staging widget CloudFront OAC
  # s3:GetObject so /tenants/* + /collateral/* serve from THIS bucket
  # (severs the prod-account cross-account read). One-directional dep:
  # this module's bucket policy ← cloudfront-widget-staging's ARN.
  cloudfront_distribution_arn = module.cloudfront_widget_staging[0].distribution_arn
}

# Issue #5 batch 2a: dependent state for staging-account Lambdas. Each table
# mirrors the schema of its prod-account legacy twin (audited 2026-05-04).
# JWT secret value is injected post-apply via aws CLI — never enters state.
module "ddb_tenant_registry_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-tenant-registry-staging"
}

module "ddb_recent_messages_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-recent-messages-staging"
}

module "ddb_audit_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-audit-staging"
}

module "ddb_conversation_summaries_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-conversation-summaries-staging"
}

# Phase 4.1 (analytics-dashboard staging twin): session-events table — first
# of six new tables backing the staging Analytics_Dashboard_API. Mirrors the
# prod-account `picasso-session-events` schema: writer is Analytics_Event_
# Processor (PK SESSION#{id} / SK STEP#{nnn}); reader is Analytics_Dashboard_
# API which queries via the `tenant-date-index` GSI. TTL attribute set by
# the writer; PITR enabled per the rest of the staging account convention.
module "ddb_session_events_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-session-events-staging"
}

# Phase 4.1 batch 2: remaining 5 DDB tables backing the staging-account
# Analytics_Dashboard_API. Each mirrors the schema of its prod-account
# legacy twin (sources cited per module). All are referenced by the new
# Lambda module shipped in a follow-up PR.

module "ddb_form_submissions_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-form-submissions-staging"
}

# Consumer PII Remediation Path A, Phase 1 — normalized-email -> pii_subject_id index.
# Additive: scheduling continues keying on form_submission_id (PII Identity Contract §1).
module "ddb_pii_subject_index_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-pii-subject-index-staging"
}

# Consumer PII Remediation Path A, Post-Phase-0.5 — capability-bundle item 2
# (`docs/roadmap/PII-Project/CONSUMER_PII_REMEDIATION.md` §"Path A Re-baseline v3").
# Immutable event-log audit for DSAR fulfillment. Empty until the picasso-pii-dsar-
# staging Lambda (capability-bundle items 1a + 1b) writes rows. Defined ahead of the
# Lambda so the GSI lands on an empty table (no online backfill).
module "ddb_pii_dsar_audit_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-pii-dsar-audit-staging"

  # C2 SSE-KMS DEFERRED: see ddb-pii-dsar-audit-staging/main.tf inline note.
  # Apply-2 precondition (CMK service-principal Allow) must land first.
  # Audit-table DeleteItem-Deny resource policy ships in PR1 (no CMK dep).
}

# Consumer PII Remediation Path A, Phase 2 — APPLY 1 (design
# docs/roadmap/PII_DELETE_PIPELINE_DESIGN.md §13 step 2, gate-cleared rev 3).
# Scoped CMK + the dedicated delete / short-lived back-fill / MFA break-glass
# roles ONLY (no Lambda, no table association — those are Apply 2/3 + step 7,
# HARD-GATED before any live-tenant staging traffic). The NB-A key policy is
# the root-level `aws_kms_key_policy.pii_staging` below (cycle-break, mirrors
# the `aws_secretsmanager_secret_policy` pattern).
module "kms_pii_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/kms-pii-staging"
}

module "lambda_pii_delete_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-pii-delete-staging"

  pii_cmk_key_arn = module.kms_pii_staging[0].key_arn
}

# Consumer PII Remediation Path A — capability-bundle item 1a (IAM half).
# Plan: docs/roadmap/PII-Project/CONSUMER_PII_REMEDIATION.md §"Path A Re-baseline v3".
# IAM-only at this PR; aws_lambda_function resource lands with Python code follow-up.
module "lambda_pii_dsar_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-pii-dsar-staging"

  pii_cmk_key_arn      = module.kms_pii_staging[0].key_arn
  dsar_audit_table_arn = module.ddb_pii_dsar_audit_staging[0].table_arn

  # M2 Sprint D Q3(c) — integration test synthetic-tenant fixture grant.
  # Bucket `picasso-pii-dsar-int-staging` exists in staging acct 525 (created
  # manually 2026-05-26 with AWS-default block-public-access ON). Used ONLY by
  # `Lambdas/lambda/picasso_pii_dsar_staging/test_dsar_integration.py::test_k/l/m`
  # (lambda#167) — never invoked by real DSAR traffic. Tenant id
  # `TEN-SMOKE-FULFILL` is the convention chosen by the test scaffold so the
  # grant scope matches the integration-test seed data exactly.
  #
  # When a real tenant turns on `fulfillment.type='s3'`, append a real
  # `{bucket=..., tenant_id=...}` pair alongside this one (do NOT replace).
  fulfillment_grants = [
    { bucket = "picasso-pii-dsar-int-staging", tenant_id = "TEN-SMOKE-FULFILL" },
  ]
}

# Per-tenant offboarding purge — P1 (Class A surfaces). Routes to
# data-retention-strategy.md §9 "per-tenant offboarding purge"; design doc
# docs/roadmap/PII-Project/tenant-offboarding-purge-design.md (picasso#361).
# Lambda code: lambda#214 (picasso_pii_tenant_purge_staging). Dedicated audit
# table (clean separation from DSAR per the design) defined ahead of the Lambda
# so its GSI lands on an empty table (no online backfill).
module "ddb_pii_tenant_purge_audit_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-pii-tenant-purge-audit-staging"
}

module "lambda_pii_tenant_purge_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-pii-tenant-purge-staging"

  purge_audit_table_arn = module.ddb_pii_tenant_purge_audit_staging[0].table_arn
}

# send_email — staging test-support deployment (operator-authorized 2026-06-02).
# Stands up the bare-named `send_email` Lambda so the scheduling consumers'
# best-effort volunteer-notice dispatch (shared/scheduling/notify ->
# Event-invoke send_email; gap-C grant on function:send_email, picasso#336) can
# be exercised E2E per scheduling/docs/e2e_staging_validation_plan.md. Real prod
# code (Lambdas/lambda/send_email/) deploys over the placeholder via
# update-function-code. Dedicated role + the picasso-emails SES config set.
module "lambda_send_email_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-send-email-staging"
}

# Consumer PII Remediation Path A, M3 done-bar #1 (master plan v0.3 §M3).
# Daily EventBridge-triggered Lambda that scans picasso-pii-dsar-audit-staging
# StatusIndex for open DSARs past intake+25d (SLA-at-risk window) and publishes
# SNS alerts to ops-alerts topic. Closes D5 G-D.
#
# Reuses the existing ops-alerts SNS topic from ops-alarms-master-function-staging
# (operator-subscribed via Console; no per-alarm topic). Dedicated IAM role
# (CLAUDE.md never-share rule); scoped read on audit table + Publish on the
# single topic; no DDB writes, no PII CMK access (audit table remains default
# DDB SSE pending M7 F-DSAR-C2-SSE-DEFER resolution).
module "lambda_pii_dsar_sla_monitor_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-pii-dsar-sla-monitor-staging"

  dsar_audit_table_arn = module.ddb_pii_dsar_audit_staging[0].table_arn
  ops_sns_topic_arn    = module.ops_alarms_master_function_staging[0].topic_arn
}

# M9.G6 (master plan v0.12). Closes D5 F-DSAR22 (M3 SLA monitor secondary-
# control independence). Belt-and-suspenders weekly reminder Lambda — an
# independent EventBridge schedule + dedicated Lambda + dedicated IAM role,
# publishing to the same ops-alerts SNS topic. Fires every Monday 14:00 UTC
# regardless of the primary monitor's state, so a silent primary-monitor
# failure still surfaces to the operator via the weekly reminder + the
# embedded CLI snippets the operator runs to verify.
module "lambda_pii_dsar_weekly_reminder_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-pii-dsar-weekly-reminder-staging"

  ops_sns_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn
}

module "ddb_notification_events_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-notification-events-staging"
}

module "ddb_notification_sends_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-notification-sends-staging"
}

module "ddb_billing_events_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-billing-events-staging"
}

module "ddb_employee_registry_v2_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-employee-registry-v2-staging"
}

module "ddb_token_blacklist_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-token-blacklist"
  env    = var.env
}

# Scheduling v1 (impl plan sub-phase A8c, R1 intent, R6 naming). Both tables
# are greenfield creates in staging-525: the A6 jti table (PR #52) was
# provisioned in prod-614 under a staging name pre-account-split and is
# Q3-parked there (left untouched), so there is nothing to import. The
# Booking table's two GSIs are created at table-creation time.
module "ddb_token_jti_blacklist_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-token-jti-blacklist"
  env    = var.env
}

module "ddb_booking_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-booking"
  env    = var.env
}

# Sub-phase C Task C3 — the three remaining scheduling-core tables (the Booking
# table above shipped earlier in A8c so B5/B11 could query it). All follow the
# ddb-booking convention: tenantId PK + per-table snake sort key (canonical §18),
# PAY_PER_REQUEST, PITR on, no GSI (canonical §18 places GSIs only on Booking),
# no TTL (retention is sub-phase F). C5/C6/C8/C9 read/write these.
module "ddb_appointment_type_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-appointment-type"
  env    = var.env
}

module "ddb_routing_policy_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-routing-policy"
  env    = var.env
}

module "ddb_conversation_scheduling_session_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-conversation-scheduling-session"
  env    = var.env
}

# B1 runbook-provisioned table (PR #231, 2026-05-25). Not yet under Terraform
# state — bringing it in via `terraform import` is tracked as a follow-up to
# close R1 fully for sub-phase B. This data source lets B2 reference the ARN
# + construct GSI ARNs (used by lambda_calendar_watch_listener_staging below)
# without blocking on the import work.
data "aws_dynamodb_table" "calendar_watch_channels_staging" {
  count = var.env == "staging" ? 1 : 0
  name  = "picasso-calendar-watch-channels-staging"
}

module "secrets_jwt_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/secrets-jwt-staging"
}

# Phase 4.1: Clerk dev-project secret slot. Value is populated post-apply
# via aws secretsmanager put-secret-value (out of Terraform state, same
# pattern as JWT). Value injected 2026-05-10 from the now-decommissioned
# legacy Lambda's env var; rotate via Clerk console + put-secret-value
# when the dev project's key is rotated.
module "secrets_clerk_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/secrets-clerk-staging"
}

# Issue #5 batch 2b: staging-account Bedrock streaming handler.
# Placeholder code; real handler ships via PR A (analytics_writer
# integration) using `aws lambda update-function-code`.
module "lambda_bedrock_handler_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-bedrock-handler-staging"

  tenant_config_bucket_arn     = module.tenant_config_staging[0].bucket_arn
  config_bucket_name           = module.tenant_config_staging[0].bucket_name
  session_summaries_table_arn  = module.session_summaries.table_arn
  session_summaries_table_name = module.session_summaries.table_name
  tenant_registry_table_arn    = module.ddb_tenant_registry_staging[0].table_arn
  tenant_registry_table_name   = module.ddb_tenant_registry_staging[0].table_name

  # Phase 1 v3 enforcement-on (PR #5 + #6): CF-origin-header validator
  # secret ARN. Wildcard `-*` matches any AWS-generated 6-char suffix so
  # secret rotation (which creates a new ARN suffix) doesn't break IAM.
  cf_origin_secret_arn  = "arn:aws:secretsmanager:us-east-1:525409062831:secret:picasso/bsh/cf-origin-secret-*"
  cf_origin_secret_name = "picasso/bsh/cf-origin-secret"

  # Phase A staging-twin form tables. The 2 existing tables (form_submissions,
  # notification_sends) come from the Phase 4 modules; the 2 new tables
  # (sms_consent, sms_usage) come from the picasso_form_tables module above.
  form_submissions_table_arn    = module.ddb_form_submissions_staging[0].table_arn
  form_submissions_table_name   = module.ddb_form_submissions_staging[0].table_name
  notification_sends_table_arn  = module.ddb_notification_sends_staging[0].table_arn
  notification_sends_table_name = module.ddb_notification_sends_staging[0].table_name
  sms_consent_table_arn         = module.picasso_form_tables.sms_consent_table_arn
  sms_consent_table_name        = module.picasso_form_tables.sms_consent_table_name
  sms_usage_table_arn           = module.picasso_form_tables.sms_usage_table_arn
  sms_usage_table_name          = module.picasso_form_tables.sms_usage_table_name

  # M1.G6 (master plan v0.12 / F-DSAR18 closure). BSH form_handler.js port
  # of pii_subject.js needs the same picasso-pii-subject-index-staging
  # table the Master_Function_Staging Python writer uses; least-priv grant
  # (GetItem + conditional PutItem only). Closes the BSH active-writer gap
  # where DSAR walker FilterExpression on pii_subject_id silently
  # false-negatives every BSH-written row.
  pii_subject_index_table_arn  = module.ddb_pii_subject_index_staging[0].table_arn
  pii_subject_index_table_name = module.ddb_pii_subject_index_staging[0].table_name

  # Sprint F3 / audit-of-audit finding 2: PII subject-index EMF metric alarms
  # publish to the existing ops-alerts SNS topic (same one used by SLA monitor
  # + weekly reminder). Reuses the M3 alarm topic so operators get one
  # consistent paging channel for all PII alerts.
  pii_subject_index_alarm_sns_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn

  # Phase C analytics-events pipeline. Wiring the queue URL flips BSH's
  # handleAnalyticsEvent from no-op to live SQS send (index.js:66-106).
  analytics_queue_arn = module.analytics_events_pipeline_staging[0].queue_arn
  analytics_queue_url = module.analytics_events_pipeline_staging[0].queue_url

  # Phase B SMS twin. Wiring SMS_SENDER_FUNCTION flips form_handler.js
  # from invoking the bare `SMS_Sender` default (resolves to nothing in
  # staging account today) to the explicit staging-account ARN. IAM Sid
  # InvokeSmsSender is rendered conditionally on the ARN being non-empty.
  sms_sender_function_arn  = module.lambda_sms_twin_staging[0].sms_sender_function_arn
  sms_sender_function_name = module.lambda_sms_twin_staging[0].sms_sender_function_name

  # MYR test tenant KB — the only KB allowed for Issue #5 batch 2b.
  # Add more tenants here as they're enrolled in staging coverage.
  kb_arns = [
    "arn:aws:bedrock:us-east-1:614056832592:knowledge-base/0BQBWFYDMT",
  ]

  # Cross-account KB access: AWS RAM doesn't support Bedrock KBs, so
  # the staging Lambda assumes a prod-side role that has Retrieve.
  # The role + its inline policy were hand-applied in prod (chris-admin)
  # since prod is hand-managed until P0 Phase 2.
  kb_retriever_role_arns = [
    "arn:aws:iam::614056832592:role/picasso-kb-retriever-from-staging",
  ]
}

# Issue #5 batch 2b: staging-account Master_Function. Placeholder code;
# real handler ships via PR A2.
module "lambda_master_function_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-master-function-staging"

  tenant_config_bucket_arn          = module.tenant_config_staging[0].bucket_arn
  config_bucket_name                = module.tenant_config_staging[0].bucket_name
  jwt_secret_arn                    = module.secrets_jwt_staging[0].secret_arn
  jwt_secret_name                   = module.secrets_jwt_staging[0].secret_name
  session_summaries_table_arn       = module.session_summaries.table_arn
  session_summaries_table_name      = module.session_summaries.table_name
  tenant_registry_table_arn         = module.ddb_tenant_registry_staging[0].table_arn
  tenant_registry_table_name        = module.ddb_tenant_registry_staging[0].table_name
  audit_table_arn                   = module.ddb_audit_staging[0].table_arn
  audit_table_name                  = module.ddb_audit_staging[0].table_name
  recent_messages_table_arn         = module.ddb_recent_messages_staging[0].table_arn
  recent_messages_table_name        = module.ddb_recent_messages_staging[0].table_name
  conversation_summaries_table_arn  = module.ddb_conversation_summaries_staging[0].table_arn
  conversation_summaries_table_name = module.ddb_conversation_summaries_staging[0].table_name
  token_blacklist_table_arn         = module.ddb_token_blacklist_staging[0].table_arn
  token_blacklist_table_name        = module.ddb_token_blacklist_staging[0].table_name
  form_submissions_table_arn        = module.ddb_form_submissions_staging[0].table_arn
  form_submissions_table_name       = module.ddb_form_submissions_staging[0].table_name
  notification_sends_table_arn      = module.ddb_notification_sends_staging[0].table_arn
  notification_sends_table_name     = module.ddb_notification_sends_staging[0].table_name
  pii_subject_index_table_arn       = module.ddb_pii_subject_index_staging[0].table_arn
  pii_subject_index_table_name      = module.ddb_pii_subject_index_staging[0].table_name
  streaming_endpoint                = module.lambda_bedrock_handler_staging[0].function_url

  # CloudFront origin secret ARN. Activates the conditional CfOriginSecretRead
  # grant in the module (no-op when empty). The Lambda's REQUIRE_CF_ORIGIN_HEADER
  # flag stays off until CF is also configured to inject the matching header —
  # see the activation runbook in project_mfs_phase4_complete_handoff_2026-05-12.
  cf_origin_secret_arn = "arn:aws:secretsmanager:us-east-1:525409062831:secret:picasso/mfs/cf-origin-secret-ZU7vTU"

  # Mirrors the BSH module block above (lines 88-98). Same KB + same prod-side
  # retriever role — Master_Function needs identical cross-account access for
  # its HTTP-fallback chat path.
  kb_arns = [
    "arn:aws:bedrock:us-east-1:614056832592:knowledge-base/0BQBWFYDMT",
  ]
  kb_retriever_role_arns = [
    "arn:aws:iam::614056832592:role/picasso-kb-retriever-from-staging",
  ]

  # Phase 2 MFS cleanup R5 set staging MFS log retention to 14d. Codify so
  # `terraform apply` doesn't revert to the module default of 30.
  # PII retention strategy (data-retention-strategy.md §5 #5): align staging chat-path
  # log retention to prod's 7d. CloudWatch holds redacted QA_COMPLETE Q&A; 7d is the policy.
  log_retention_days = 7
}

# Phase 4.1: staging-account Analytics_Dashboard_API. Bundles IAM exec
# role + CloudWatch log group + Lambda placeholder + Function URL
# (AuthType NONE, BUFFERED). Real code ships via Phase 4.2 lambda repo
# CI matrix entry. CLERK_SECRET_KEY is in Secrets Manager only — never
# in env vars or tfstate (Plan Security F2).
module "lambda_analytics_dashboard_api_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-analytics-dashboard-api-staging"

  tenant_config_bucket_arn = module.tenant_config_staging[0].bucket_arn
  config_bucket_name       = module.tenant_config_staging[0].bucket_name

  # Super-admin tenant-purge trigger (POST /admin/tenants/{id}/purge): grant the
  # dashboard role lambda:InvokeFunction on the purge Lambda. Staging-only.
  tenant_purge_function_arn = module.lambda_pii_tenant_purge_staging[0].function_arn

  jwt_secret_arn    = module.secrets_jwt_staging[0].secret_arn
  jwt_secret_name   = module.secrets_jwt_staging[0].secret_name
  clerk_secret_arn  = module.secrets_clerk_staging[0].secret_arn
  clerk_secret_name = module.secrets_clerk_staging[0].secret_name

  tenant_registry_table_arn      = module.ddb_tenant_registry_staging[0].table_arn
  tenant_registry_table_name     = module.ddb_tenant_registry_staging[0].table_name
  session_summaries_table_arn    = module.session_summaries.table_arn
  session_summaries_table_name   = module.session_summaries.table_name
  session_events_table_arn       = module.ddb_session_events_staging[0].table_arn
  session_events_table_name      = module.ddb_session_events_staging[0].table_name
  form_submissions_table_arn     = module.ddb_form_submissions_staging[0].table_arn
  form_submissions_table_name    = module.ddb_form_submissions_staging[0].table_name
  notification_events_table_arn  = module.ddb_notification_events_staging[0].table_arn
  notification_events_table_name = module.ddb_notification_events_staging[0].table_name
  notification_sends_table_arn   = module.ddb_notification_sends_staging[0].table_arn
  notification_sends_table_name  = module.ddb_notification_sends_staging[0].table_name
  billing_events_table_arn       = module.ddb_billing_events_staging[0].table_arn
  billing_events_table_name      = module.ddb_billing_events_staging[0].table_name
  employee_registry_table_arn    = module.ddb_employee_registry_v2_staging[0].table_arn
  employee_registry_table_name   = module.ddb_employee_registry_v2_staging[0].table_name
  audit_table_arn                = module.ddb_audit_staging[0].table_arn
  audit_table_name               = module.ddb_audit_staging[0].table_name

  # Tier-3 archive bucket is currently hand-created (Phase 2 of MFS cleanup).
  # ARN inlined here rather than via module output until the bucket itself is
  # Terraformed. Follow-up tracked in project memory.
  archive_bucket_arn = "arn:aws:s3:::picasso-archive-${var.env}"
}

# Phase C (BSH staging-twin): analytics-events pipeline.
# Path 2 of the analytics architecture — browser POSTs to BSH `?action=analytics`
# get batched to SQS, processed into S3 (raw NDJSON archive, 30d expiry) +
# picasso-session-events-staging (per-event DDB rows). Path 1 (server-side direct
# write to session-summaries via analytics_writer.js/py) is unchanged.
# Athena + Aggregator are intentionally NOT twinned — those are dead/dormant
# in prod (zero invocations 5d; picasso-dashboard-aggregates empty); separate
# project_cleanup_prod_analytics_legacy.md tracks removal.
module "analytics_events_pipeline_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/analytics-events-pipeline-staging"

  session_events_table_arn     = module.ddb_session_events_staging[0].table_arn
  session_events_table_name    = module.ddb_session_events_staging[0].table_name
  session_summaries_table_name = module.session_summaries.table_name
  tenant_config_bucket_arn     = module.tenant_config_staging[0].bucket_arn
  tenant_config_bucket_name    = module.tenant_config_staging[0].bucket_name

  # Phase C audit F1 closure: SQS queue policy needs the BSH role ARN to
  # scope the Allow statement. Module gates the queue policy on this being
  # the legitimate sender — no other staging-account principal may send.
  bsh_role_arn = module.lambda_bedrock_handler_staging[0].role_arn
}

# Phase B (BSH staging-twin): SMS_Sender + SMS_Webhook_Handler twin.
# Provisions both Lambdas + their IAM + KMS-encrypted log groups +
# picasso/telnyx-staging secret (placeholder values; operator populates
# real API key + public key post-Telnyx-account-procurement via
# `aws secretsmanager update-secret`). Real Lambda code deploys via
# lambda-repo CI matrix (parallel PR).
module "lambda_sms_twin_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-sms-twin-staging"

  notification_sends_table_arn   = module.ddb_notification_sends_staging[0].table_arn
  notification_sends_table_name  = module.ddb_notification_sends_staging[0].table_name
  notification_events_table_arn  = module.ddb_notification_events_staging[0].table_arn
  notification_events_table_name = module.ddb_notification_events_staging[0].table_name
  sms_consent_table_arn          = module.picasso_form_tables.sms_consent_table_arn
  sms_consent_table_name         = module.picasso_form_tables.sms_consent_table_name
  sms_usage_table_arn            = module.picasso_form_tables.sms_usage_table_arn
  sms_usage_table_name           = module.picasso_form_tables.sms_usage_table_name

  # Telnyx Ed25519 webhook signing public key for the staging Telnyx account.
  # Public half of an Ed25519 keypair — not sensitive. Source: operator-
  # provisioned standalone Telnyx account, copied from Mission Control Portal
  # → Auth → Public Keys. Handed off via session 2026-05-15 Phase B P-0.
  telnyx_public_key = "EYM8gLQtICrOBbIZd8CIdcE5r4tRPccmnBMUyeOnY5I="
}

# Clerk secret resource policy — restricts read to the ADA exec role
# only. Lives at root level (mirrors JWT pattern) to avoid the same
# circular-dep issue: secret policy needs the role ARN; the Lambda
# module needs the secret ARN.
resource "aws_secretsmanager_secret_policy" "clerk_secret_key_staging" {
  count      = var.env == "staging" ? 1 : 0
  secret_arn = module.secrets_clerk_staging[0].secret_arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowAnalyticsDashboardAPIRoleOnly"
        Effect    = "Allow"
        Principal = { AWS = module.lambda_analytics_dashboard_api_staging[0].role_arn }
        Action    = "secretsmanager:GetSecretValue"
        Resource  = "*"
      },
      {
        # See note in jwt_signing_key_staging policy above — NotPrincipal
        # with role ARN doesn't reliably exclude assumed-role sessions.
        # aws:PrincipalArn normalizes the session ARN back to the role ARN.
        Sid       = "DenyAllOtherStagingPrincipals"
        Effect    = "Deny"
        Principal = "*"
        Action    = "secretsmanager:GetSecretValue"
        Resource  = "*"
        Condition = {
          StringNotEquals = {
            "aws:PrincipalArn" = module.lambda_analytics_dashboard_api_staging[0].role_arn
          }
        }
      },
    ]
  })
}

# Issue #5 PR A2-infra: ops alarms + SNS topic for Master_Function_Staging.
# - p99 duration > 5s (catches HTTP-fallback chat path latency regression
#   from analytics writer's 2s boto3 timeout, per v7 plan PR A2 §item 4).
# - kb_creds_init_failed signal (PR A finding B3 — alerts on cross-account
#   credential init failure that would silently degrade KB Retrieve).
# - analytics_write_failure signal (catches IAM/schema regressions in the
#   analytics writer DDB path).
# SNS subscriptions are intentionally OUT of Terraform — wire them via
# Console (email/PagerDuty/Slack) since they involve confirmation flows.
module "ops_alarms_master_function_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ops-alarms-master-function-staging"

  function_name  = module.lambda_master_function_staging[0].function_name
  log_group_name = module.lambda_master_function_staging[0].log_group_name
}

# ──────────────────────────────────────────────────────────────────────
# Meta Messenger project — staging-account cluster. Twin of the dormant
# prod-614 Meta_Webhook_Handler / Meta_Response_Processor / Meta_OAuth_Handler
# + their DDB/KMS/secret/DLQ/alarms (Q3-parked prod residue). Stands the
# integration up correctly in 525 per the staging-first SOP. Reuses what 525
# already has: staging-recent-messages, the analytics SQS pipeline, the
# tenant-config bucket, the tenant registry, the cross-account KB retriever
# role, and the ops SNS topic. Real Lambda code lands via the lambda-repo CI
# matrix; this ships placeholder zips. Plan:
# ~/.claude/plans/i-m-continuing-work-on-zany-popcorn.md
# ──────────────────────────────────────────────────────────────────────
module "ddb_channel_mappings_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-channel-mappings-staging"
}

module "ddb_webhook_dedup_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-webhook-dedup-staging"
}

module "kms_channel_tokens_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/kms-channel-tokens-staging"
}

module "secrets_meta_app_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/secrets-meta-app-staging"
}

module "lambda_meta_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-meta-staging"

  channel_mappings_table_arn        = module.ddb_channel_mappings_staging[0].table_arn
  channel_mappings_table_name       = module.ddb_channel_mappings_staging[0].table_name
  channel_mappings_tenant_index_arn = module.ddb_channel_mappings_staging[0].tenant_index_arn
  webhook_dedup_table_arn           = module.ddb_webhook_dedup_staging[0].table_arn
  webhook_dedup_table_name          = module.ddb_webhook_dedup_staging[0].table_name

  # Shared with core chat — schema-identical, already Terraform-managed.
  recent_messages_table_arn  = module.ddb_recent_messages_staging[0].table_arn
  recent_messages_table_name = module.ddb_recent_messages_staging[0].table_name

  # bedrock-core registry resolution (cross-account-KB twin requirement).
  tenant_registry_table_arn  = module.ddb_tenant_registry_staging[0].table_arn
  tenant_registry_table_name = module.ddb_tenant_registry_staging[0].table_name

  channel_tokens_kms_key_arn   = module.kms_channel_tokens_staging[0].key_arn
  channel_tokens_kms_key_alias = module.kms_channel_tokens_staging[0].key_alias

  meta_app_secret_arn = module.secrets_meta_app_staging[0].app_secret_arn
  ig_app_secret_arn   = module.secrets_meta_app_staging[0].ig_app_secret_arn

  # Faithful-twin rewrite of the 614 ANALYTICS_QUEUE_URL → the 525 queue.
  analytics_queue_arn = module.analytics_events_pipeline_staging[0].queue_arn
  analytics_queue_url = module.analytics_events_pipeline_staging[0].queue_url

  tenant_config_bucket_arn = module.tenant_config_staging[0].bucket_arn
  config_bucket_name       = module.tenant_config_staging[0].bucket_name

  # Same KB + prod-side retriever role as the BSH/MFS modules above.
  kb_arns = [
    "arn:aws:bedrock:us-east-1:614056832592:knowledge-base/0BQBWFYDMT",
  ]
  kb_retriever_role_arns = [
    "arn:aws:iam::614056832592:role/picasso-kb-retriever-from-staging",
  ]

  # Single Meta App for both accounts (dev-mode). Not a secret.
  meta_app_id = "791705810685396"

  messenger_verify_token = var.messenger_verify_token

  # Two-apply step 2: captured from apply-#1's Meta_OAuth_Handler Function URL
  # (a Lambda can't reference its own Function URL without a Terraform cycle, so
  # apply #1 created it with "" and this literal closes the loop on apply #2).
  # This is the value registered in the Meta App Dashboard at cutover C1/C2.
  meta_oauth_callback_url = "https://zqzw7c4jol6tsvoabbvgxly6ya0cusst.lambda-url.us-east-1.on.aws/meta/oauth/callback"
}

module "ops_alarms_meta_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ops-alarms-meta-staging"

  webhook_function_name            = module.lambda_meta_staging[0].webhook_function_name
  response_processor_function_name = module.lambda_meta_staging[0].response_processor_function_name
  response_dlq_name                = module.lambda_meta_staging[0].response_dlq_name
  sns_topic_arn                    = module.ops_alarms_master_function_staging[0].topic_arn
}

# Meta secret resource policies — locked to the consuming Lambda exec roles.
# Root-level (not in the secrets module) to avoid the circular dep: the policy
# needs the role ARNs; the roles live in lambda_meta_staging which needs the
# secret ARNs. Same pattern as the JWT/Clerk secret policies above.
resource "aws_secretsmanager_secret_policy" "meta_app_secret_staging" {
  count      = var.env == "staging" ? 1 : 0
  secret_arn = module.secrets_meta_app_staging[0].app_secret_arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowMetaWebhookAndOAuthRoles"
        Effect = "Allow"
        Principal = { AWS = [
          module.lambda_meta_staging[0].webhook_role_arn,
          module.lambda_meta_staging[0].oauth_role_arn,
        ] }
        Action   = "secretsmanager:GetSecretValue"
        Resource = "*"
      },
      {
        Sid       = "DenyAllOtherStagingPrincipals"
        Effect    = "Deny"
        Principal = "*"
        Action    = "secretsmanager:GetSecretValue"
        Resource  = "*"
        Condition = {
          StringNotEquals = {
            "aws:PrincipalArn" = [
              module.lambda_meta_staging[0].webhook_role_arn,
              module.lambda_meta_staging[0].oauth_role_arn,
            ]
          }
        }
      },
    ]
  })
}

resource "aws_secretsmanager_secret_policy" "meta_ig_app_secret_staging" {
  count      = var.env == "staging" ? 1 : 0
  secret_arn = module.secrets_meta_app_staging[0].ig_app_secret_arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowMetaWebhookRole"
        Effect    = "Allow"
        Principal = { AWS = module.lambda_meta_staging[0].webhook_role_arn }
        Action    = "secretsmanager:GetSecretValue"
        Resource  = "*"
      },
      {
        Sid       = "DenyAllOtherStagingPrincipals"
        Effect    = "Deny"
        Principal = "*"
        Action    = "secretsmanager:GetSecretValue"
        Resource  = "*"
        Condition = {
          StringNotEquals = {
            "aws:PrincipalArn" = module.lambda_meta_staging[0].webhook_role_arn
          }
        }
      },
    ]
  })
}

# ──────────────────────────────────────────────────────────────────────
# Scheduling sub-phase B Task B2 — Calendar_Watch_Listener Lambda.
# Receives Google Calendar push notifications; validates channel_token via
# SHA-256 hash + constant-time compare; calls events.get; derives typed
# events per scheduling/docs/listener_dispatch_interface.md (B0 spec) and
# dispatches to picasso-calendar-watch-events-staging.fifo keyed by
# event_id (= booking_id).
# ──────────────────────────────────────────────────────────────────────
module "lambda_calendar_watch_listener_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-calendar-watch-listener-staging"

  # Calendar-watch-channels (runbook-provisioned PR #231; data source for now)
  calendar_watch_channels_table_arn               = data.aws_dynamodb_table.calendar_watch_channels_staging[0].arn
  calendar_watch_channels_table_name              = data.aws_dynamodb_table.calendar_watch_channels_staging[0].name
  calendar_watch_channels_tenant_status_index_arn = "${data.aws_dynamodb_table.calendar_watch_channels_staging[0].arn}/index/tenant-status-index"

  # Booking table (Terraform-managed via ddb-booking module)
  booking_table_arn                   = module.ddb_booking_staging[0].table_arn
  booking_table_name                  = module.ddb_booking_staging[0].table_name
  booking_start_at_index_arn          = module.ddb_booking_staging[0].tenant_id_start_at_index_arn
  booking_coordinator_email_index_arn = module.ddb_booking_staging[0].tenant_id_coordinator_email_index_arn

  # Tenant registry (Terraform-managed)
  tenant_registry_table_arn  = module.ddb_tenant_registry_staging[0].table_arn
  tenant_registry_table_name = module.ddb_tenant_registry_staging[0].table_name

  # Ops alerts SNS topic (shared with MFS + Meta — created by ops_alarms_master_function_staging)
  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn
}

# ──────────────────────────────────────────────────────────────────────
# Scheduling sub-phase B Task B5 — Calendar_Watch_Onboarder Lambda.
# Registers an initial Google Calendar push-notification watch channel for
# a (tenant_id, coordinator_id, calendar_id) tuple. v1 pilot scale uses
# direct invocation (aws lambda invoke); AdminEmployee DDB-stream trigger
# named in the B5 plan-row lands later when sub-phase E13 UI / F2
# onboarding populates `scheduling_tags`.
# ──────────────────────────────────────────────────────────────────────
module "lambda_calendar_watch_onboarder_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-calendar-watch-onboarder-staging"

  # Calendar-watch-channels (runbook-provisioned PR #231; data source for now)
  calendar_watch_channels_table_arn  = data.aws_dynamodb_table.calendar_watch_channels_staging[0].arn
  calendar_watch_channels_table_name = data.aws_dynamodb_table.calendar_watch_channels_staging[0].name

  # Listener Function URL — Google posts push notifications here once a
  # channel is registered. Sourced from the Listener module output so the
  # URL stays in lockstep with Listener provisioning.
  listener_function_url = module.lambda_calendar_watch_listener_staging[0].listener_function_url

  # Ops alerts SNS topic (shared with MFS + Meta — created by ops_alarms_master_function_staging)
  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn
}

# Scheduling sub-phase B Task B3 (+ B4 schedule, B7 alarms) — Calendar_Watch_Renewer.
# EventBridge-Scheduler-driven re-watch of Google Calendar push channels before
# they expire (~7d). Reuses the same channels table + Listener URL + per-tenant
# OAuth scope as the Onboarder.
module "lambda_calendar_watch_renewer_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-calendar-watch-renewer-staging"

  # Calendar-watch-channels (runbook-provisioned PR #231; data source for now).
  # Renewer Queries the tenant-expiration-index GSI + Put/Update/Deletes rows.
  calendar_watch_channels_table_arn  = data.aws_dynamodb_table.calendar_watch_channels_staging[0].arn
  calendar_watch_channels_table_name = data.aws_dynamodb_table.calendar_watch_channels_staging[0].name

  # Listener Function URL — the renewed channel posts here, same as the
  # initial channel the Onboarder registers. Sourced from the Listener module
  # output so the URL stays in lockstep.
  listener_function_url = module.lambda_calendar_watch_listener_staging[0].listener_function_url

  # Ops alerts SNS topic (shared with MFS + Meta — created by ops_alarms_master_function_staging)
  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn
}

# Scheduling sub-phase B Task B6 — Calendar_Watch_Offboarder.
# Tears down a coordinator's Google Calendar push channel(s) when they are no
# longer bookable: channels.stop + delete the DDB row. Reuses the same channels
# table + per-tenant OAuth scope as the Onboarder/Renewer. Needs NO Listener URL
# (it never registers a watch).
module "lambda_calendar_watch_offboarder_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-calendar-watch-offboarder-staging"

  # Calendar-watch-channels (runbook-provisioned PR #231; data source for now).
  # Offboarder GetItem/Query (tenant-expiration-index GSI) + DeleteItem.
  calendar_watch_channels_table_arn  = data.aws_dynamodb_table.calendar_watch_channels_staging[0].arn
  calendar_watch_channels_table_name = data.aws_dynamodb_table.calendar_watch_channels_staging[0].name

  # Ops alerts SNS topic (shared with MFS + Meta — created by ops_alarms_master_function_staging)
  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn

  # B11 offboarding trigger (gap B): the Offboarder async-invokes the
  # Stranded_Booking_Remediator on the coordinator-offboarding path. One-way
  # dependency (offboarder -> remediator); the remediator module takes no offboarder
  # input, so there is no module cycle.
  remediator_function_name = module.lambda_stranded_booking_remediator_staging[0].remediator_function_name
  remediator_function_arn  = module.lambda_stranded_booking_remediator_staging[0].remediator_function_arn
}

# ──────────────────────────────────────────────────────────────────────
# Scheduling sub-phase C Task C8 — Booking_Commit_Handler (the booking-commit
# keystone). The single transactional commit path: live freeBusy re-check (C4)
# → C6 pool.lockSlot → ConferenceProvider.createConference → Google Calendar
# events.insert (extendedProperties.private.booking_id) → C5 round-robin advance
# → Booking row write → confirmation email (.ics + signed cancel/reschedule
# links) within the 60s SLA. Reads/writes the Booking table + UpdateItems the
# RoutingPolicy table; per-tenant OAuth + Zoom + JWT-signing secrets. Dedicated
# exec role; SNS DLQ for failed async invocations. Handler in lambda-repo PR
# #190; deployed via deploy-staging.yml.
# ──────────────────────────────────────────────────────────────────────
module "lambda_booking_commit_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-booking-commit-staging"

  # Booking table (Terraform-managed via ddb-booking): Get/Put/Update/DeleteItem.
  booking_table_arn  = module.ddb_booking_staging[0].table_arn
  booking_table_name = module.ddb_booking_staging[0].table_name

  # RoutingPolicy table (Terraform-managed via ddb-routing-policy): UpdateItem
  # only (C5 atomic round-robin cursor advance/revert).
  routing_policy_table_arn  = module.ddb_routing_policy_staging[0].table_arn
  routing_policy_table_name = module.ddb_routing_policy_staging[0].table_name

  # Ops alerts SNS topic (shared with MFS + Meta — created by ops_alarms_master_function_staging)
  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn
}

# ══════════════════════════════════════════════════════════════════════════
# WS-IAC (integrator-glue I4 + topology cutover I2-A) — booking-event consumers
# + SNS fan-out. Provisions the deployed surface for the merged consumers
# (lambda#195 Calendar_Event_Consumer + lambda#194 Stranded_Booking_Remediator)
# and the SNS-FIFO fan-out that replaces the single bare events queue.
#
# >>> INTEGRATOR REVIEW: this is the scoped main.tf hunk for WS-IAC. Two coupled
#     changes land in the lambda repo WITH the cutover (NOT in this PR):
#       (1) Listener SQSClient SendMessage → SNSClient Publish (to fanout topic;
#           MessageGroupId=event_id + MessageDeduplicationId preserved) + the
#           Listener role sns:Publish grant + EVENTS_TOPIC_ARN env var
#           (= module.sns_calendar_watch_fanout_staging[0].events_topic_arn).
#           Topic MUST exist (this PR applied) before the Listener flips.
#       (2) Calendar_Watch_Offboarder → async-invoke Stranded_Booking_Remediator
#           ({tenant_id, coordinator_email, offboarding_time}) + the Offboarder
#           role lambda:InvokeFunction grant on remediator_function_arn + a
#           REMEDIATOR_FUNCTION_NAME env var on the Offboarder module.
#     The bare picasso-calendar-watch-events-staging.fifo queue in the listener
#     module is retired/repurposed by the integrator after cutover.
# ══════════════════════════════════════════════════════════════════════════

module "sns_calendar_watch_fanout_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/sns-calendar-watch-fanout-staging"
  env    = var.env

  # Ops alerts SNS topic (shared — created by ops_alarms_master_function_staging) for
  # the DLQ-depth + lifecycle-backlog alarms.
  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn

  # B-1: the ONLY principal allowed to SNS:Publish to the fan-out topic is the
  # Listener exec role. The role exists today; the Listener's own sns:Publish
  # grant + EVENTS_TOPIC_ARN env (the SQS->SNS flip) land WITH the integrator's
  # cutover — but the topic policy referencing the role is valid now.
  listener_exec_role_arn = module.lambda_calendar_watch_listener_staging[0].listener_role_arn
}

# Calendar_Event_Consumer (lambda#195, MERGED) — owns booking.ooo_overlap_detected
# (B9) + booking.attendee_declined (B10). Polls the fan-out event-consumer queue.
module "lambda_calendar_event_consumer_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-calendar-event-consumer-staging"

  # Booking table (Terraform-managed via ddb-booking): conditional UpdateItem only.
  booking_table_arn  = module.ddb_booking_staging[0].table_arn
  booking_table_name = module.ddb_booking_staging[0].table_name

  # Fan-out event-consumer FIFO queue (event-source-mapping + IAM consume).
  source_queue_arn = module.sns_calendar_watch_fanout_staging[0].event_consumer_queue_arn

  # gap C (B9 reoffer = X + Y): routing/appt/registry reads for the pool re-check +
  # send_email invoke + the §13.4 jwt signing key (send_email_function_name defaults to
  # 'send_email'). One-way deps; no cycle.
  appointment_type_table_arn   = module.ddb_appointment_type_staging[0].table_arn
  appointment_type_table_name  = module.ddb_appointment_type_staging[0].table_name
  routing_policy_table_arn     = module.ddb_routing_policy_staging[0].table_arn
  routing_policy_table_name    = module.ddb_routing_policy_staging[0].table_name
  employee_registry_table_arn  = module.ddb_employee_registry_v2_staging[0].table_arn
  employee_registry_table_name = module.ddb_employee_registry_v2_staging[0].table_name

  # Ops alerts SNS topic (admin OOO-conflict alert publish + the Errors alarm).
  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn
}

# Calendar_Lifecycle_Consumer (lambda#196 + gap-C Y wire lambda#201, MERGED) — §14.2
# calendar-reconciliation consumer. Drains the fan-out lifecycle FIFO queue: event_deleted
# → Booking.status=canceled + (Y) cancel_notice (the path B11's cancel depends on),
# event_moved → (Y) move_optin_sms (SMS stub), channel-degrade → watch-channel row + alert.
# Narrower than the event-consumer (NO candidate re-resolution): booking GetItem/UpdateItem +
# channels UpdateItem + send_email invoke + jwt signing key + ops-alerts publish + SQS consume.
module "lambda_calendar_lifecycle_consumer_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-calendar-lifecycle-consumer-staging"

  # Booking table (Terraform-managed via ddb-booking): GetItem + conditional UpdateItem.
  booking_table_arn  = module.ddb_booking_staging[0].table_arn
  booking_table_name = module.ddb_booking_staging[0].table_name

  # Watch-channels table (pre-existing, read via data source): channel-degrade UpdateItem.
  channels_table_arn  = data.aws_dynamodb_table.calendar_watch_channels_staging[0].arn
  channels_table_name = data.aws_dynamodb_table.calendar_watch_channels_staging[0].name

  # Fan-out lifecycle-consumer FIFO queue (event-source-mapping + IAM consume).
  source_queue_arn = module.sns_calendar_watch_fanout_staging[0].lifecycle_consumer_queue_arn

  # Ops alerts SNS topic (channel-degrade alert publish + the Errors alarm).
  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn
}

# Scheduling redemption edge — staging.schedule.myrecruiter.ai (WS-D3 #347, sub-phase D §13.8).
# The public HTTPS edge that fronts the WS-D4 token-redemption Lambda (the six /cancel
# /reschedule /resume /attended/* endpoints). The cancel/reschedule email links minted by
# C8 + the cal-lifecycle consumer are dead until this resolves + serves.
# Apply is OPERATOR-gated + two-phase (cert must reach ISSUED before the alias attaches):
#   Apply 1 (enable_custom_domain = false, the default): cert PENDING_VALIDATION + dist on the
#     default *.cloudfront.net cert. Operator adds the GoDaddy validation CNAME (myrecruiter.ai
#     is at GoDaddy, NOT Route53 — same as the chat edge) → cert ISSUED.
#   Apply 2 (enable_custom_domain = true): attaches the staging.schedule.myrecruiter.ai alias +
#     the ISSUED cert. Operator then adds the GoDaddy alias CNAME → <distribution_domain_name>.
# redemption_function_url_domain defaults to a placeholder until WS-D4's Function URL exists —
# the integrator re-points it (and flips enable_custom_domain at Apply 2) when D4 lands.
module "scheduling_redemption_domain_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/scheduling-redemption-domain-staging"
}

# Stranded_Booking_Remediator (lambda#194, MERGED) — B11 coordinator-offboarding
# stranded-booking remediation. Invoked directly (offboarding-trigger wiring is the
# integrator's coupled change — see the banner above); NOT a queue consumer.
module "lambda_stranded_booking_remediator_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-stranded-booking-remediator-staging"

  # Booking table (Terraform-managed via ddb-booking): UpdateItem + coordinator GSI Query.
  booking_table_arn                   = module.ddb_booking_staging[0].table_arn
  booking_table_name                  = module.ddb_booking_staging[0].table_name
  booking_coordinator_email_index_arn = module.ddb_booking_staging[0].tenant_id_coordinator_email_index_arn

  # AppointmentType + RoutingPolicy (Terraform-managed): GetItem only (routing-context).
  appointment_type_table_arn  = module.ddb_appointment_type_staging[0].table_arn
  appointment_type_table_name = module.ddb_appointment_type_staging[0].table_name
  routing_policy_table_arn    = module.ddb_routing_policy_staging[0].table_arn
  routing_policy_table_name   = module.ddb_routing_policy_staging[0].table_name

  # gap C (X wire): employee registry — (X) resolveCandidates Queries it for the reassignment roster.
  employee_registry_table_arn  = module.ddb_employee_registry_v2_staging[0].table_arn
  employee_registry_table_name = module.ddb_employee_registry_v2_staging[0].table_name

  # Ops alerts SNS topic (Errors alarm only — the remediator does not publish to SNS).
  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn
}

# ──────────────────────────────────────────────────────────────────────
# Q5: staging widget edge migration (prod acct 614056832592 → staging
# 525409062831). Plan: ~/.claude/plans/glistening-strolling-oasis.md.
# Phase D moved the staging COMPUTE (MFS+BSH) to the staging account; the
# staging EDGE (CloudFront E1CGYA1AJ9OYL0 + S3 + WAF + ACM + OAC) still
# lives in the prod account. Q5 twins the edge here, GoDaddy-CNAME cuts
# over, soaks, then decommissions the prod-account edge.
#
# TWO-APPLY [B1]: this PR is APPLY 1 — the ACM cert ONLY. It is created
# PENDING_VALIDATION; the `validation_record` output is the CNAME the
# operator adds in the GoDaddy console (DNS is GoDaddy, not Route53 —
# verified P0.1). Apply 2 (OAC + WAF + S3 widget bucket + CloudFront
# distribution + the tenant-bucket OAC grant) is a SEPARATE later PR,
# gated on this cert reaching ISSUED.
# ──────────────────────────────────────────────────────────────────────
module "acm_chat_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/acm-chat-staging"
}

# ──────────────────────────────────────────────────────────────────────
# Q5 APPLY 2 — the edge twin. Gated on Apply 1's cert reaching ISSUED
# (verified 2026-05-16: arn …525409062831:certificate/8e60e2b9-… = ISSUED).
# Provisions, in the staging account, a faithful twin of prod-account
# CloudFront E1CGYA1AJ9OYL0: a fresh OAC, a CLOUDFRONT WAF (twin of
# picasso-streaming-waf), the hardened widget S3 bucket, and the CloudFront
# distribution itself (4 origins — the dangling API-GW origin is dropped).
# Still NO DNS change — the twin is validated via its raw d###.cloudfront.net
# domain (EC-Q5.4) before the GoDaddy cutover (Q5 Phase 3).
#
# OPERATOR-GATED PREREQUISITE [B3 / locked decision #5]: the two distinct
# `x-picasso-cf-origin` header values are non-committed sensitive vars
# (q5_mfs_cf_origin_secret / q5_streaming_cf_origin_secret) with NO default.
# They are supplied to CI via TF_VAR_ from two `staging`-environment GitHub
# secrets the operator MUST create before this PR's CI plan/apply can
# succeed (Q5 PR body documents the exact values' source — the P0.2 rollback
# dump; never rotated, never committed).
# ──────────────────────────────────────────────────────────────────────
module "cloudfront_oac_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/cloudfront-oac-staging"
}

module "waf_streaming_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/waf-streaming-staging"
}

module "s3_widget_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/s3-widget-staging"

  # OAC GetObject grant scoped to the new distribution. One-directional
  # dep (this bucket policy ← cloudfront-widget ARN); the CF module
  # references this bucket by fixed regional domain, so no cycle.
  cloudfront_distribution_arn = module.cloudfront_widget_staging[0].distribution_arn
}

# Q5 Phase 3 (domain attach). Exact-name cert 8e60e2b9 (acm-chat-staging,
# ISSUED) is wired below; enable_custom_domain = true attaches the
# staging.chat.myrecruiter.ai alias + that cert to E3G30AUOEJTB36 in-place.
# Prerequisite: the prod-account dist E1CGYA1AJ9OYL0 must release the alias
# first (operator deletes it via chris-admin) or this apply fails with
# CloudFront CNAMEAlreadyExists. No wildcard cert / no associate-alias / no
# zero-downtime dance — staging carries no real traffic.
module "cloudfront_widget_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/cloudfront-widget-staging"

  acm_certificate_arn  = module.acm_chat_staging[0].certificate_arn
  enable_custom_domain = true
  web_acl_arn          = module.waf_streaming_staging[0].web_acl_arn
  oac_id               = module.cloudfront_oac_staging[0].oac_id

  # Non-committed, distinct per origin. See operator-gated prerequisite above.
  mfs_cf_origin_secret       = var.q5_mfs_cf_origin_secret
  streaming_cf_origin_secret = var.q5_streaming_cf_origin_secret
}

# Q5 Phase 2 [locked decision #9]: minimal CI widget-deploy role. No module
# deps (bucket/dist/repo are locked Q5 literals) — pure logical grouping.
# Phase 2.2 sets its ARN as GitHub secret AWS_DEPLOY_ROLE_ARN_STAGING and
# repoints build-and-deploy-staging off the prod-account legacy role.
module "iam_widget_deploy_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/iam-widget-deploy-staging"
}

# JWT secret resource policy — restricts read to the Lambda exec roles
# that legitimately validate Picasso-issued JWTs. Defense-in-depth: the
# Lambda IAM policies already grant the read; this resource-side Deny
# blocks PowerUserAccess principals in the staging account from reading
# the signing key out-of-band. Lives at root level (not in the secrets
# module) to avoid a circular dep with the Lambda modules.
#
# Both Master_Function_Staging (chat HTTP fallback) and
# Analytics_Dashboard_API (dashboard self-signed admin tokens) need
# read access. The original #81 policy only allowed MFS, which surfaced
# as AccessDeniedException on ADA's self-signed JWT validation path.
# Phase C.2 audit-of-audit closure (row 21 / F3): BSH CF-origin secret
# resource policy. The IAM identity policy on the BSH role already grants
# read; this resource-side Deny blocks any other staging-account principal
# (admin SSO, contractor, broadly-permissioned service role) from reading
# the secret out-of-band. Reading the secret would give an attacker the
# CF-origin-header bypass token, allowing direct Function URL hits that
# bypass CloudFront WAF/rate-limiting.
#
# The secret was hand-created in Phase 1 v3 (not a module output) — data
# source resolves the current rotation suffix (`-*`) so the policy follows
# rotations automatically. IAM grant in the BSH module uses the wildcard
# ARN; this resource-side policy needs the concrete ARN.
data "aws_secretsmanager_secret" "bsh_cf_origin_staging" {
  count = var.env == "staging" ? 1 : 0
  name  = "picasso/bsh/cf-origin-secret"
}

resource "aws_secretsmanager_secret_policy" "bsh_cf_origin_staging" {
  count      = var.env == "staging" ? 1 : 0
  secret_arn = data.aws_secretsmanager_secret.bsh_cf_origin_staging[0].arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowBSHLambdaRoleOnly"
        Effect    = "Allow"
        Principal = { AWS = module.lambda_bedrock_handler_staging[0].role_arn }
        Action    = "secretsmanager:GetSecretValue"
        Resource  = "*"
      },
      {
        # Same NotPrincipal-via-aws:PrincipalArn pattern as the JWT/Clerk
        # secret policies below. Normalizes assumed-role sessions back to
        # the role ARN. Permits BSH; denies all others including admin SSO.
        Sid       = "DenyAllOtherStagingPrincipals"
        Effect    = "Deny"
        Principal = "*"
        Action    = "secretsmanager:GetSecretValue"
        Resource  = "*"
        Condition = {
          StringNotEquals = {
            "aws:PrincipalArn" = module.lambda_bedrock_handler_staging[0].role_arn
          }
        }
      },
    ]
  })
}

resource "aws_secretsmanager_secret_policy" "jwt_signing_key_staging" {
  count      = var.env == "staging" ? 1 : 0
  secret_arn = module.secrets_jwt_staging[0].secret_arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowJWTValidatingLambdaRoles"
        Effect = "Allow"
        Principal = { AWS = [
          module.lambda_master_function_staging[0].role_arn,
          module.lambda_analytics_dashboard_api_staging[0].role_arn,
          # Scheduling §13.4 signed-token signers (same key; iss claim isolates from
          # chat-session JWTs). Calendar_Event_Consumer mints the B9 reoffer link (gap C);
          # Booking_Commit_Handler mints the C8 confirmation cancel/reschedule links (latent
          # until its real zip deploys — the resource-policy Deny below would have blocked it).
          module.lambda_calendar_event_consumer_staging[0].consumer_role_arn,
          module.lambda_booking_commit_staging[0].commit_role_arn,
          # Calendar_Lifecycle_Consumer mints the §14.2 cancel_notice reschedule link (gap C Y).
          module.lambda_calendar_lifecycle_consumer_staging[0].consumer_role_arn,
        ] }
        Action   = "secretsmanager:GetSecretValue"
        Resource = "*"
      },
      {
        # NotPrincipal with a role ARN doesn't reliably exclude assumed-role
        # sessions of that role — AWS evaluates literally and the session ARN
        # (arn:aws:sts::ACCT:assumed-role/NAME/SESSION) doesn't string-match
        # the role ARN. Use aws:PrincipalArn instead — that condition key
        # normalizes assumed-role sessions back to the role ARN.
        Sid       = "DenyAllOtherStagingPrincipals"
        Effect    = "Deny"
        Principal = "*"
        Action    = "secretsmanager:GetSecretValue"
        Resource  = "*"
        Condition = {
          StringNotEquals = {
            "aws:PrincipalArn" = [
              module.lambda_master_function_staging[0].role_arn,
              module.lambda_analytics_dashboard_api_staging[0].role_arn,
              module.lambda_calendar_event_consumer_staging[0].consumer_role_arn,
              module.lambda_booking_commit_staging[0].commit_role_arn,
              module.lambda_calendar_lifecycle_consumer_staging[0].consumer_role_arn,
            ]
          }
        }
      },
    ]
  })
}

# ──────────────────────────────────────────────────────────────────────
# Consumer PII Remediation Path A, Phase 2 — NB-A scoped-CMK key policy.
# Root-level (not in kms-pii-staging) for the SAME cycle-break the
# JWT/Clerk/Meta/BSH secret policies above use: this policy must name the
# delete / back-fill / break-glass role ARNs, those roles live in
# lambda_pii_delete_staging, and that module needs the CMK ARN for its
# kms:Decrypt grant — a cycle if the policy lived in the kms module.
#
# NB-A (design PII_DELETE_PIPELINE_DESIGN.md §6, gate round-2 fix): the rev-1
# `NotPrincipal`+`Deny` would have caught the DynamoDB SSE service principal
# and bricked every encrypted table on Apply 2. This uses the repo's proven
# condition-based-Deny shape (jwt_signing_key_staging et al. above) —
# `Deny` + `Principal:"*"` + `StringNotEqualsIfExists aws:PrincipalArn` —
# DELIBERATELY extended from those policies' `StringNotEquals` to the
# `…IfExists` form: a CMK used by DynamoDB SSE has service-principal /
# grant data-plane callers that do NOT populate aws:PrincipalArn; with
# IfExists an absent key makes the condition not-match, so the Deny is
# skipped for the service (SSE keeps working) while still firing for any
# IAM principal — incl. staging PowerUser — not on the allow-list.
# Root is admin-only (NO kms:Decrypt/GenerateDataKey/kms:*), so PowerUser
# cannot decrypt via IAM delegation (the Q5 Row-7 bug the channel-tokens
# key still has). Root retains kms:Put* ⇒ no policy lockout.
# ──────────────────────────────────────────────────────────────────────
data "aws_caller_identity" "current" {}

resource "aws_kms_key_policy" "pii_staging" {
  count  = var.env == "staging" ? 1 : 0
  key_id = module.kms_pii_staging[0].key_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "KeyAdminNoDataPlane"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        # Administration only — deliberately NO kms:Decrypt / kms:Encrypt /
        # kms:GenerateDataKey / kms:* so the root principal is not a
        # data-plane decrypt path that IAM (PowerUserAccess) could delegate.
        # kms:Put* preserves PutKeyPolicy ⇒ no lockout.
        Action = [
          "kms:Create*", "kms:Describe*", "kms:Enable*", "kms:List*",
          "kms:Put*", "kms:Update*", "kms:Revoke*", "kms:Disable*",
          "kms:Get*", "kms:Delete*", "kms:ScheduleKeyDeletion",
          "kms:CancelKeyDeletion", "kms:TagResource", "kms:UntagResource",
        ]
        Resource = "*"
      },
      {
        # GitHubActionsDeployRole is DELIBERATELY NOT a data-plane principal
        # (Apply-1 phase-completion-audit G-1): it needs ONLY kms:CreateGrant
        # for DDB SSE association (DeployRoleDdbSseGrant below). Granting it
        # Decrypt/GenerateDataKey would let any CI run decrypt consumer PII
        # once the tables are CMK-associated (Apply 2). Do not re-add it here.
        # H3 (PR1 fix-now-4): DSAR Lambda role added so the role can
        # GenerateDataKey when writing audit rows (audit table is CMK-encrypted
        # per C2) AND Decrypt when the AuditReadOnly walker reads them.
        # SLA Lambda role is added in a separate PR4b SR-G edit (two-pass
        # mitigated by the shadow-key gate per kms-pii-staging-policy-change-runbook.md).
        Sid    = "DataPlaneAllowListedRoles"
        Effect = "Allow"
        Principal = { AWS = [
          module.lambda_master_function_staging[0].role_arn,
          module.lambda_pii_delete_staging[0].delete_role_arn,
          module.lambda_pii_delete_staging[0].backfill_role_arn,
          module.lambda_pii_dsar_staging[0].dsar_role_arn,
        ] }
        Action   = ["kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
        Resource = "*"
      },
      {
        # DynamoDB SSE association (Apply 2) is performed by the deploy role
        # creating a service grant. Scoped to AWS-resource grants only.
        Sid       = "DeployRoleDdbSseGrant"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/GitHubActionsDeployRole" }
        Action    = ["kms:CreateGrant"]
        Resource  = "*"
        Condition = {
          Bool = { "kms:GrantIsForAWSResource" = "true" }
        }
      },
      {
        # The NB-A control. Explicit Deny overrides any IAM Allow (incl. a
        # PowerUserAccess-delegated kms:Decrypt). StringNotEqualsIfExists +
        # aws:PrincipalArn: service principals / DynamoDB SSE grants do not
        # set aws:PrincipalArn → IfExists makes the condition not-match →
        # Deny skipped for them (SSE works). aws:PrincipalArn also
        # normalizes assumed-role sessions back to the role ARN (same
        # rationale as the secret policies above). Audit G-10: GenerateDataKey*
        # (wildcard) also denies GenerateDataKeyWithoutPlaintext / future
        # variants. Audit G-1: GitHubActionsDeployRole is NOT in the exception
        # list — it is explicitly denied direct data-plane decrypt and retains
        # only kms:CreateGrant (DeployRoleDdbSseGrant); the DDB SSE service
        # path is grant-based (no aws:PrincipalArn) so it is unaffected.
        Sid       = "DenyDecryptToAllOtherPrincipals"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["kms:Decrypt", "kms:GenerateDataKey*"]
        Resource  = "*"
        Condition = {
          StringNotEqualsIfExists = {
            # H3 (PR1 fix-now-4): DSAR Lambda role added to the Deny-exception
            # list. SLA Lambda role added in PR4b SR-G under its own shadow-key
            # gate per kms-pii-staging-policy-change-runbook.md §"PR4b SR-G".
            "aws:PrincipalArn" = [
              module.lambda_master_function_staging[0].role_arn,
              module.lambda_pii_delete_staging[0].delete_role_arn,
              module.lambda_pii_delete_staging[0].backfill_role_arn,
              module.lambda_pii_delete_staging[0].breakglass_role_arn,
              module.lambda_pii_dsar_staging[0].dsar_role_arn,
            ]
          }
        }
      },
      {
        # MFA-gated emergency decrypt. Off by default — the break-glass role
        # is only assumable with MFA (its trust policy); this is its sole
        # capability. Replaces root-delegated decrypt (Q5 Row-7 anti-pattern).
        Sid       = "BreakGlassDecrypt"
        Effect    = "Allow"
        Principal = { AWS = module.lambda_pii_delete_staging[0].breakglass_role_arn }
        Action    = ["kms:Decrypt"]
        Resource  = "*"
      },
    ]
  })
}

# ------------------------------------------------------------------
# picasso-session-archiver — Event Source Mapping (Phase 2 audit row G)
# ------------------------------------------------------------------
# Imports the live ESM into Terraform state so future StartingPosition or
# config changes flow via the IaC SOP rather than direct CLI. The Lambda
# itself + its IAM + the DLQ are still hand-created — bringing them under
# Terraform is follow-up scope. UUID below is the post-B9 fix recreate.
import {
  to = aws_lambda_event_source_mapping.picasso_session_archiver[0]
  id = "9132fb62-9eb0-43cc-bb91-e15e75429752"
}

resource "aws_lambda_event_source_mapping" "picasso_session_archiver" {
  count = var.env == "staging" ? 1 : 0

  function_name                      = "picasso-session-archiver"
  event_source_arn                   = module.session_summaries.stream_arn
  starting_position                  = "TRIM_HORIZON"
  batch_size                         = 100
  maximum_retry_attempts             = 3
  maximum_batching_window_in_seconds = 5
  function_response_types            = ["ReportBatchItemFailures"]

  destination_config {
    on_failure {
      destination_arn = "arn:aws:sqs:us-east-1:525409062831:picasso-session-archiver-dlq"
    }
  }
}
