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
# tables (`picasso-form-submissions-staging`, `picasso-notification-sends`)
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

# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 PILOT (production-only): BSH ops alarms — the first hand-managed prod
# resources adopted into Terraform. Gated to production; the three resources
# already exist live and are `terraform import`ed (no-op plan beyond default_tags).
# Production applies are -target-scoped to this module for now (a full prod apply
# would create orphan `picasso-sms-*-prod` tables via the un-gated form-tables
# module above, since prod uses bare names). See docs/runbooks/prod-iac-pilot-alarms.md.
# ─────────────────────────────────────────────────────────────────────────────
module "ops_alarms_bsh_prod" {
  count  = var.env == "production" ? 1 : 0
  source = "./modules/ops-alarms-bsh-prod"

  ops_alerts_topic_arn      = "arn:aws:sns:us-east-1:614056832592:picasso-ops-alerts"
  streaming_distribution_id = "E3G0LSWB1AQ9LP" # Remedy A (#435): /stream 5xx signer-failure alarm
}

# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 Tier 1 (production-only): BSH execution-role inline-policy grants.
# Adopts the 7 hand-made inline policies on the live `Bedrock-Streaming-Handler-Role`
# into Terraform via `terraform import` (state-only). Version-controls the
# highest-churn surface on the role (grants were hand-mutated 3x in the
# 2026-06-04/05 Foster Village incident). Role resource + function/env stay
# hand-managed (function = Tier 2). -target-scoped applies per the header above.
# See docs/runbooks/prod-iac-tier1-bsh-iam.md.
# ─────────────────────────────────────────────────────────────────────────────
module "bsh_iam_grants_prod" {
  count     = var.env == "production" ? 1 : 0
  source    = "./modules/bsh-iam-grants-prod"
  role_name = "Bedrock-Streaming-Handler-Role" # explicit: the load-bearing import target
}

# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 Tier 2 (production-only): the BSH Lambda FUNCTION + its 14 env vars.
# Adopts the live `Bedrock_Streaming_Handler` function via `terraform import`
# (state-only). Closes the env-var-drift incident class (Foster Village 2026-05-23
# was an unset BEDROCK_MODEL_ID). Scope = function + Function URL ONLY; log group
# + API-GW invoke permission stay hand-managed (see module header). Role resource
# is Tier 1's (referenced by ARN, not managed). -target-scoped applies per the
# header above. See docs/runbooks/prod-iac-tier2-bsh-function.md.
# ─────────────────────────────────────────────────────────────────────────────
module "bsh_function_prod" {
  count  = var.env == "production" ? 1 : 0
  source = "./modules/bsh-function-prod"

  # Remedy A (#435) Phase 2: enforce IAM on the streaming Function URL, closing the
  # public bypass durably. The prod Lambda@Edge signer + /stream* association are
  # live + CloudFront-propagated + PROVEN (Phase 1.5 controlled-flip on prod:
  # CF-signed /stream -> 200+SSE, direct unsigned -> 403). This flips
  # authorization_type NONE -> AWS_IAM. Rollback = set back to "NONE" (instant on
  # the Function URL); the Remedy B header still guards during rollback.
  streaming_function_url_auth_type = "AWS_IAM"
}

# Phase 2 (production-only): the Master_Function (MFS) chat Lambda + its 20 env
# vars + the 14 inline IAM policies on its hand-made execution role. Adopts the
# live `Master_Function` via `terraform import` (state-only). Mirrors the bsh
# prod tiers: function/log-group module + IAM-grants module split. Self-gated via
# var.env (resources count=0 outside production), so these blocks carry no
# module-level count and outputs are null-safe; import addresses therefore use a
# trailing [0] on the resources (e.g. module.lambda_master_function_prod.
# aws_lambda_function.this[0]). Role + its 4 managed-policy attachments stay
# hand-managed (referenced by name, not created). Faithful import verified offline
# (20/20 env vars, 14/14 policy docs byte-exact vs live). Ground truth captured in
# Sandbox/mfs-prod-modeling/. See docs runbook for the import sequence.
module "mfs_iam_grants_prod" {
  source    = "./modules/mfs-iam-grants-prod"
  env       = var.env
  role_name = "Master_Function-role-zyux77wq" # explicit: the load-bearing import target
}

module "lambda_master_function_prod" {
  source = "./modules/lambda-master-function-prod"
  env    = var.env
}

# B3 drift-detection: read-only OIDC role assumed by the scheduled
# infra-drift-detection.yml cron (the prod deploy role's trust forbids the cron's
# ref:refs/heads/main sub). ReadOnlyAccess only — apply-incapable. Production-only.
# After the gated apply, set its ARN as the repo variable PROD_PLAN_ROLE_ARN to
# activate the workflow (docs/runbooks/infra-drift-detection-setup.md).
module "ci_drift_plan_role_prod" {
  count  = var.env == "production" ? 1 : 0
  source = "./modules/ci-drift-plan-role-prod"
}

# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 Tier 4 (production-only): the prod chat CloudFront distribution
# E3G0LSWB1AQ9LP (alias chat.myrecruiter.ai). Adopts the live, hand-managed
# distribution via `terraform import` (state-only). Prerequisite for Remedy A
# (#435): brings CloudFront under TF so the streaming origin can get a `lambda`
# OAC + the Function URL can flip to AuthType:AWS_IAM. The live x-picasso-cf-origin
# secret header is left untouched (lifecycle.ignore_changes on `origin`; the
# value never enters git/state). -target-scoped applies per the header above.
# See docs/runbooks/prod-iac-tier4-cloudfront.md.
# ─────────────────────────────────────────────────────────────────────────────
# Remedy A (#435): origin-request Lambda@Edge that SigV4-signs /stream requests to
# the prod BSH Function URL (replaces OAC, which can't sign POST bodies — proven
# infeasible on staging). Its role holds lambda:InvokeFunctionUrl on the prod BSH
# function; its qualified ARN is associated on /stream* by cloudfront_streaming_prod
# below. Inert until the Function URL flips to AWS_IAM (bsh-function-prod
# streaming_function_url_auth_type, Phase 2). Mirrors the proven staging signer.
module "lambda_edge_bsh_signer_prod" {
  count  = var.env == "production" ? 1 : 0
  source = "./modules/lambda-edge-bsh-signer-prod"

  # Module output (not a literal ARN) so Terraform has a real dependency edge to
  # the prod BSH function — same value, but the signer's invoke grant now tracks
  # a function replace/re-import instead of racing it.
  bsh_function_arn = module.bsh_function_prod[0].function_arn
}

module "cloudfront_streaming_prod" {
  count  = var.env == "production" ? 1 : 0
  source = "./modules/cloudfront-streaming-prod"

  # Remedy A (#435): the edge signer's versioned ARN, associated on /stream*.
  streaming_edge_signer_qualified_arn = module.lambda_edge_bsh_signer_prod[0].qualified_arn
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
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-pii-delete-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  pii_cmk_key_arn = module.kms_pii_staging[0].key_arn

  # Single-source table names for the delete-pipeline IAM grants (renames cascade).
  form_submissions_table_name       = module.ddb_form_submissions_staging[0].table_name
  notification_sends_table_name     = module.ddb_notification_sends_staging[0].table_name
  notification_events_table_name    = module.ddb_notification_events_staging[0].table_name
  recent_messages_table_name        = module.ddb_recent_messages_staging[0].table_name
  conversation_summaries_table_name = module.ddb_conversation_summaries_staging[0].table_name
  session_events_table_name         = module.ddb_session_events_staging[0].table_name
  subject_index_table_name          = module.ddb_pii_subject_index_staging[0].table_name
}

# Consumer PII Remediation Path A — capability-bundle item 1a (IAM half).
# ─────────────────────────────────────────────────────────────────────────────
# Workload Blast-Radius Permission Boundary (Phase 1) — the IAM ceiling attached
# to every staging workload role via permissions_boundary. Created once here;
# its ARN is threaded into each lambda module as permissions_boundary_arn.
# Excludes Lambda@Edge roles (region-lock incompatible) + deploy/break-glass roles.
# ─────────────────────────────────────────────────────────────────────────────
module "iam_workload_boundary" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/iam-workload-boundary"

  account_id  = data.aws_caller_identity.current.account_id
  home_region = "us-east-1"
  # The one sanctioned cross-account sts:AssumeRole hop (prod KB retriever).
  kb_retriever_role_arns = [
    "arn:aws:iam::614056832592:role/picasso-kb-retriever-from-staging",
  ]
}

# Plan: docs/roadmap/PII-Project/CONSUMER_PII_REMEDIATION.md §"Path A Re-baseline v3".
# IAM-only at this PR; aws_lambda_function resource lands with Python code follow-up.
module "lambda_pii_dsar_staging" {
  count = var.env == "staging" ? 1 : 0

  # Phase-1 blast-radius ceiling (canary role — the broadest cross-tenant reach).
  permissions_boundary_arn = module.iam_workload_boundary[0].arn
  source                   = "./modules/lambda-pii-dsar-staging"

  pii_cmk_key_arn      = module.kms_pii_staging[0].key_arn
  dsar_audit_table_arn = module.ddb_pii_dsar_audit_staging[0].table_arn

  # Single-source table names for the DSAR walker IAM grants (renames cascade).
  form_submissions_table_name       = module.ddb_form_submissions_staging[0].table_name
  notification_sends_table_name     = module.ddb_notification_sends_staging[0].table_name
  notification_events_table_name    = module.ddb_notification_events_staging[0].table_name
  recent_messages_table_name        = module.ddb_recent_messages_staging[0].table_name
  conversation_summaries_table_name = module.ddb_conversation_summaries_staging[0].table_name
  audit_table_name                  = module.ddb_audit_staging[0].table_name
  subject_index_table_name          = module.ddb_pii_subject_index_staging[0].table_name
  channel_mappings_table_name       = module.ddb_channel_mappings_staging[0].table_name
  session_events_table_name         = module.ddb_session_events_staging[0].table_name

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
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-pii-tenant-purge-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  purge_audit_table_arn       = module.ddb_pii_tenant_purge_audit_staging[0].table_arn
  form_submissions_table_name = module.ddb_form_submissions_staging[0].table_name
}

# send_email — staging test-support deployment (operator-authorized 2026-06-02).
# Stands up the bare-named `send_email` Lambda so the scheduling consumers'
# best-effort volunteer-notice dispatch (shared/scheduling/notify ->
# Event-invoke send_email; gap-C grant on function:send_email, picasso#336) can
# be exercised E2E per scheduling/docs/e2e_staging_validation_plan.md. Real prod
# code (Lambdas/lambda/send_email/) deploys over the placeholder via
# update-function-code. Dedicated role + the picasso-emails SES config set.
module "lambda_send_email_staging" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-send-email-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn
}

# Consumer PII Remediation Path A, M3 done-bar #1 (master plan v0.3 §M3).
# Daily EventBridge-triggered Lambda that scans picasso-pii-dsar-audit
# StatusIndex for open DSARs past intake+25d (SLA-at-risk window) and publishes
# SNS alerts to ops-alerts topic. Closes D5 G-D.
#
# Reuses the existing ops-alerts SNS topic from ops-alarms-master-function-staging
# (operator-subscribed via Console; no per-alarm topic). Dedicated IAM role
# (CLAUDE.md never-share rule); scoped read on audit table + Publish on the
# single topic; no DDB writes, no PII CMK access (audit table remains default
# DDB SSE pending M7 F-DSAR-C2-SSE-DEFER resolution).
module "lambda_pii_dsar_sla_monitor_staging" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-pii-dsar-sla-monitor-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

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
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-pii-dsar-weekly-reminder-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  ops_sns_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn
  # Wire the audit table name from the ddb module output so the weekly SNS
  # reminder's operator CLI snippet tracks the canonical table name (the
  # module's own default is a fallback only). Closes the D1 phase-audit
  # cascade gap (#402 follow-up).
  audit_table_name = module.ddb_pii_dsar_audit_staging[0].table_name
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

# G2 / E14 scheduling notification-template overrides (PK tenantId, SK moment).
module "ddb_scheduling_notif_template_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-scheduling-notif-template"
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

# Environment naming-parity migration (Phase 2 8/9). Brings the calendar-watch
# channel ledger under Terraform management with the bare canonical name. PR-A
# only CREATES the empty bare table; the data source above still serves all
# consumers. PR-B (after data is copied) deletes the data source and repoints
# the consumers to this module; the suffixed table is then dropped out of band
# (it was never in Terraform state).
module "ddb_calendar_watch_channels_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-calendar-watch-channels"
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

# ──────────────────────────────────────────────────────────────────────
# CI-modernization task 2.5 (TASK_2_5_DESUFFIX_SCOPE.md): bare-named staging
# twins. Stood up as parallel instances in Wave 1a, granted alongside the
# suffixed pair in Wave 1b, cut over to all staging traffic in Wave 2 (CF
# origins + lambda-repo CI matrix), soak-proven, and the suffixed module
# blocks (lambda_master_function_staging / lambda_bedrock_handler_staging,
# which used to live above) decommissioned in Wave 4. The old MFS log group
# was `terraform state rm`'d pre-apply (retained orphaned, decision #2);
# the old BSH log group + its CMK were destroyed with the module — its logs
# are CMK-encrypted, so retaining the group past the key would have been
# dead weight (operator call, 2026-06-10).
# ──────────────────────────────────────────────────────────────────────
module "lambda_bedrock_handler" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-bedrock-handler-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  function_name = "Bedrock_Streaming_Handler"

  tenant_config_bucket_arn     = module.tenant_config_staging[0].bucket_arn
  config_bucket_name           = module.tenant_config_staging[0].bucket_name
  session_summaries_table_arn  = module.session_summaries.table_arn
  session_summaries_table_name = module.session_summaries.table_name
  tenant_registry_table_arn    = module.ddb_tenant_registry_staging[0].table_arn
  tenant_registry_table_name   = module.ddb_tenant_registry_staging[0].table_name

  cf_origin_secret_arn  = "arn:aws:secretsmanager:us-east-1:525409062831:secret:picasso/bsh/cf-origin-secret-*"
  cf_origin_secret_name = "picasso/bsh/cf-origin-secret"

  form_submissions_table_arn    = module.ddb_form_submissions_staging[0].table_arn
  form_submissions_table_name   = module.ddb_form_submissions_staging[0].table_name
  notification_sends_table_arn  = module.ddb_notification_sends_staging[0].table_arn
  notification_sends_table_name = module.ddb_notification_sends_staging[0].table_name
  sms_consent_table_arn         = module.picasso_form_tables.sms_consent_table_arn
  sms_consent_table_name        = module.picasso_form_tables.sms_consent_table_name
  sms_usage_table_arn           = module.picasso_form_tables.sms_usage_table_arn
  sms_usage_table_name          = module.picasso_form_tables.sms_usage_table_name

  scheduling_session_table_arn  = module.ddb_conversation_scheduling_session_staging[0].table_arn
  scheduling_session_table_name = module.ddb_conversation_scheduling_session_staging[0].table_name
  booking_table_arn             = module.ddb_booking_staging[0].table_arn
  booking_table_name            = module.ddb_booking_staging[0].table_name

  scheduling_executor_function_arn  = module.lambda_booking_commit_staging[0].commit_function_arn
  scheduling_executor_function_name = module.lambda_booking_commit_staging[0].commit_function_name

  pii_subject_index_table_arn  = module.ddb_pii_subject_index_staging[0].table_arn
  pii_subject_index_table_name = module.ddb_pii_subject_index_staging[0].table_name

  pii_subject_index_alarm_sns_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn

  analytics_queue_arn = module.analytics_events_pipeline_staging[0].queue_arn
  analytics_queue_url = module.analytics_events_pipeline_staging[0].queue_url

  sms_sender_function_arn  = module.lambda_sms_twin_staging[0].sms_sender_function_arn
  sms_sender_function_name = module.lambda_sms_twin_staging[0].sms_sender_function_name


  # Cross-account KB access. Wave-1 gate: the operator must add
  # Bedrock_Streaming_Handler-role to this 614 role's trust policy before
  # cutover (prod-account edit — see scope doc Decisions #3).
  kb_retriever_role_arns = [
    "arn:aws:iam::614056832592:role/picasso-kb-retriever-from-staging",
  ]

  # Remedy A posture carried over from the suffixed instance: AWS_IAM from
  # birth. The L@E signer's InvokeFunctionUrl grant gains this instance's
  # ARN in Wave 1b — until then the URL is intentionally unreachable
  # (no traffic is expected before Wave 2 anyway).
  streaming_function_url_auth_type = "AWS_IAM"
}

module "lambda_master_function" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-master-function-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  function_name = "Master_Function"

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

  # The bare MFS streams via the bare BSH — the new pair is wired together
  # from birth; nothing about the suffixed pair changes.
  streaming_endpoint = module.lambda_bedrock_handler[0].function_url

  cf_origin_secret_arn = "arn:aws:secretsmanager:us-east-1:525409062831:secret:picasso/mfs/cf-origin-secret-ZU7vTU"

  # Same Wave-1 operator gate as the BSH instance above: add
  # Master_Function-role to the 614 trust policy before cutover.
  kb_retriever_role_arns = [
    "arn:aws:iam::614056832592:role/picasso-kb-retriever-from-staging",
  ]

  # Same retention policy as the suffixed instance (7d, PII retention strategy).
  log_retention_days = 7
}

# Phase 4.1: staging-account Analytics_Dashboard_API. Bundles IAM exec
# role + CloudWatch log group + Lambda placeholder + Function URL
# (AuthType NONE, BUFFERED). Real code ships via Phase 4.2 lambda repo
# CI matrix entry. CLERK_SECRET_KEY is in Secrets Manager only — never
# in env vars or tfstate (Plan Security F2).
module "lambda_analytics_dashboard_api_staging" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-analytics-dashboard-api-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  tenant_config_bucket_arn = module.tenant_config_staging[0].bucket_arn
  config_bucket_name       = module.tenant_config_staging[0].bucket_name

  # Super-admin tenant-purge trigger (POST /admin/tenants/{id}/purge): grant the
  # dashboard role lambda:InvokeFunction on the purge Lambda. Staging-only.
  tenant_purge_function_arn = module.lambda_pii_tenant_purge_staging[0].function_arn

  jwt_secret_arn            = module.secrets_jwt_staging[0].secret_arn
  jwt_secret_name           = module.secrets_jwt_staging[0].secret_name
  clerk_secret_arn          = module.secrets_clerk_staging[0].secret_arn
  clerk_secret_name         = module.secrets_clerk_staging[0].secret_name
  clerk_webhook_secret_arn  = module.secrets_clerk_staging[0].webhook_secret_arn
  clerk_webhook_secret_name = module.secrets_clerk_staging[0].webhook_secret_name

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

  # §E7 GET /scheduling/bookings reader (Query on the two booking GSIs only).
  booking_table_arn  = module.ddb_booking_staging[0].table_arn
  booking_table_name = module.ddb_booking_staging[0].table_name

  # G6/E12 booking actions (cancel + reschedule-link): ADA GetItems the booking for the §8
  # permission check, then invokes BCH's scheduling_mutate executor for the side-effect.
  booking_commit_function_arn  = module.lambda_booking_commit_staging[0].commit_function_arn
  booking_commit_function_name = module.lambda_booking_commit_staging[0].commit_function_name

  # §E13b AppointmentType/RoutingPolicy write API (admin-only CRUD over the
  # routing tables the live booking router reads).
  appointment_type_table_arn  = module.ddb_appointment_type_staging[0].table_arn
  appointment_type_table_name = module.ddb_appointment_type_staging[0].table_name
  routing_policy_table_arn    = module.ddb_routing_policy_staging[0].table_arn
  routing_policy_table_name   = module.ddb_routing_policy_staging[0].table_name

  # G2/E14 scheduling notification-template overrides (Query GET + UpdateItem PATCH).
  scheduling_notif_template_table_arn  = module.ddb_scheduling_notif_template_staging[0].table_arn
  scheduling_notif_template_table_name = module.ddb_scheduling_notif_template_staging[0].table_name

  # G3/E0 OAuth init-token mint: the browser-facing base for connect_url/status_url, and the
  # state-signing key it reads to sign init tokens (same key Calendar_OAuth_Connect
  # state.verify reads). The base is the FRIENDLY domain, not the raw Function URL: the
  # CloudFront dist routes /connect, /oauth/callback, /connection/status to the OAuth Lambda,
  # the dashboard pins this origin (assertOAuthUrl), CORS for the status fetch lives at the
  # edge, and the Google-console redirect URI uses the same host. (2026-06-11 E2E: the raw
  # Function URL here tripped the dashboard's origin pin.)
  oauth_function_url             = "https://${module.scheduling_redemption_domain_staging[0].redemption_host}"
  oauth_state_signing_secret_arn = "arn:aws:secretsmanager:us-east-1:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/oauth/_state-signing-key-*"

  # Tier-3 archive bucket is currently hand-created (Phase 2 of MFS cleanup).
  # ARN inlined here rather than via module output until the bucket itself is
  # Terraformed. Follow-up tracked in project memory.
  archive_bucket_arn = "arn:aws:s3:::picasso-archive-${var.env}"

  # Attribution Wave-1 (C4b, C5, C6): entry-points + aggregates read access
  # and mint function invoke for /attribution/* routes.
  entry_points_table_arn            = module.ddb_entry_points_staging[0].table_arn
  entry_points_table_name           = module.ddb_entry_points_staging[0].table_name
  attribution_aggregates_table_arn  = module.ddb_attribution_aggregates_staging[0].table_arn
  attribution_aggregates_table_name = module.ddb_attribution_aggregates_staging[0].table_name
  mint_function_arn                 = module.lambda_attribution_mint_staging[0].function_arn
  mint_function_name                = module.lambda_attribution_mint_staging[0].function_name
}

# Phase C (BSH staging-twin): analytics-events pipeline.
# Path 2 of the analytics architecture — browser POSTs to BSH `?action=analytics`
# get batched to SQS, processed into S3 (raw NDJSON archive, 30d expiry) +
# picasso-session-events (per-event DDB rows). Path 1 (server-side direct
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

  # Phase C audit F1 closure: SQS queue policy needs the BSH role ARNs to
  # scope the Allow statement. Module gates the queue policy on these being
  # the legitimate senders — no other staging-account principal may send.
  # Task 2.5 Wave 4: bare instance only (the suffixed instance carried a
  # second entry during the Wave 1b–4 transition).
  bsh_role_arns = [
    module.lambda_bedrock_handler[0].role_arn,
  ]
}

# Phase B (BSH staging-twin): SMS_Sender + SMS_Webhook_Handler twin.
# Provisions both Lambdas + their IAM + KMS-encrypted log groups +
# picasso/telnyx-staging secret (placeholder values; operator populates
# real API key + public key post-Telnyx-account-procurement via
# `aws secretsmanager update-secret`). Real Lambda code deploys via
# lambda-repo CI matrix (parallel PR).
module "lambda_sms_twin_staging" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-sms-twin-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

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

# Same lock-to-the-exec-role pattern as clerk_secret_key_staging above, for the
# Clerk webhook (Svix) signing secret.
resource "aws_secretsmanager_secret_policy" "clerk_webhook_secret_staging" {
  count      = var.env == "staging" ? 1 : 0
  secret_arn = module.secrets_clerk_staging[0].webhook_secret_arn

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

  # Task 2.5 Wave 2: alarms watch the bare-named MFS instance (alarm names
  # + metric filters re-key from these outputs; the SNS topic and its
  # out-of-band subscriptions are untouched). The module's hardcoded
  # `Picasso/Master_Function_Staging` metric NAMESPACES stay — renaming a
  # namespace orphans metric history; filter+alarm pairs stay consistent.
  function_name  = module.lambda_master_function[0].function_name
  log_group_name = module.lambda_master_function[0].log_group_name
}

# ──────────────────────────────────────────────────────────────────────
# Meta Messenger project — staging-account cluster. Twin of the dormant
# prod-614 Meta_Webhook_Handler / Meta_Response_Processor / Meta_OAuth_Handler
# + their DDB/KMS/secret/DLQ/alarms (Q3-parked prod residue). Stands the
# integration up correctly in 525 per the staging-first SOP. Reuses what 525
# already has: recent-messages, the analytics SQS pipeline, the
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
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-meta-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

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
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-calendar-watch-listener-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  # Calendar-watch-channels (runbook-provisioned PR #231; data source for now)
  calendar_watch_channels_table_arn               = data.aws_dynamodb_table.calendar_watch_channels_staging[0].arn
  calendar_watch_channels_table_name              = data.aws_dynamodb_table.calendar_watch_channels_staging[0].name
  calendar_watch_channels_tenant_status_index_arn = "${data.aws_dynamodb_table.calendar_watch_channels_staging[0].arn}/index/tenant-status-index"

  # Booking table (Terraform-managed via ddb-booking module)
  booking_table_arn                   = module.ddb_booking_staging[0].table_arn
  booking_table_name                  = module.ddb_booking_staging[0].table_name
  booking_start_at_index_arn          = module.ddb_booking_staging[0].tenant_id_start_at_index_arn
  booking_coordinator_email_index_arn = module.ddb_booking_staging[0].tenant_id_coordinator_email_index_arn
  booking_external_event_id_index_arn = module.ddb_booking_staging[0].external_event_id_index_arn

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
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-calendar-watch-onboarder-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  # Calendar-watch-channels (runbook-provisioned PR #231; data source for now)
  calendar_watch_channels_table_arn  = data.aws_dynamodb_table.calendar_watch_channels_staging[0].arn
  calendar_watch_channels_table_name = data.aws_dynamodb_table.calendar_watch_channels_staging[0].name

  # Listener Function URL — Google posts push notifications here once a
  # channel is registered. Sourced from the Listener module output so the
  # URL stays in lockstep with Listener provisioning.
  listener_function_url = module.lambda_calendar_watch_listener_staging[0].listener_function_url

  # Ops alerts SNS topic (shared with MFS + Meta — created by ops_alarms_master_function_staging)
  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn

  # Tenant config bucket — the scheduling feature gate reads tenants/{id}/config.json.
  tenant_config_bucket_arn = module.tenant_config_staging[0].bucket_arn
  config_bucket_name       = module.tenant_config_staging[0].bucket_name
}

# Scheduling sub-phase B Task B3 (+ B4 schedule, B7 alarms) — Calendar_Watch_Renewer.
# EventBridge-Scheduler-driven re-watch of Google Calendar push channels before
# they expire (~7d). Reuses the same channels table + Listener URL + per-tenant
# OAuth scope as the Onboarder.
module "lambda_calendar_watch_renewer_staging" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-calendar-watch-renewer-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

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
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-calendar-watch-offboarder-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

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
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-booking-commit-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  # Booking table (Terraform-managed via ddb-booking): Get/Put/Update/DeleteItem.
  booking_table_arn  = module.ddb_booking_staging[0].table_arn
  booking_table_name = module.ddb_booking_staging[0].table_name

  # RoutingPolicy table (Terraform-managed via ddb-routing-policy): UpdateItem
  # (C5 round-robin) + GetItem (§B16a propose route candidate-resolver read).
  routing_policy_table_arn  = module.ddb_routing_policy_staging[0].table_arn
  routing_policy_table_name = module.ddb_routing_policy_staging[0].table_name

  # AppointmentType + employee-registry-v2 (§B16a propose route reads — lambda#227).
  # candidate-resolver GetItems the appointment type and Querys the registry partition.
  appointment_type_table_arn   = module.ddb_appointment_type_staging[0].table_arn
  appointment_type_table_name  = module.ddb_appointment_type_staging[0].table_name
  employee_registry_table_arn  = module.ddb_employee_registry_v2_staging[0].table_arn
  employee_registry_table_name = module.ddb_employee_registry_v2_staging[0].table_name

  # G6 reschedule_link (the ADA-triggered "send reschedule link" action): notify.js emails the
  # guest via send_email + reads the per-tenant §E14 template override (fail-safe → default).
  scheduling_notif_template_table_arn  = module.ddb_scheduling_notif_template_staging[0].table_arn
  scheduling_notif_template_table_name = module.ddb_scheduling_notif_template_staging[0].table_name

  # G7b reschedule_link SMS supplement: notify.js texts the guest the reschedule link when org
  # SMS is enabled + the guest consented + it's not quiet-hours. BCH pre-filters consent on the
  # SAME picasso-sms-consent-staging table the SMS_Sender twin re-checks, and invokes that twin.
  sms_consent_table_arn    = module.picasso_form_tables.sms_consent_table_arn
  sms_consent_table_name   = module.picasso_form_tables.sms_consent_table_name
  sms_sender_function_arn  = module.lambda_sms_twin_staging[0].sms_sender_function_arn
  sms_sender_function_name = module.lambda_sms_twin_staging[0].sms_sender_function_name

  # Ops alerts SNS topic (shared with MFS + Meta — created by ops_alarms_master_function_staging)
  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn

  # Tenant config bucket — the scheduling feature gate reads tenants/{id}/config.json.
  tenant_config_bucket_arn = module.tenant_config_staging[0].bucket_arn
  config_bucket_name       = module.tenant_config_staging[0].bucket_name

  # Track 1 S6: reminder system wiring. scheduleReminders() + rebindReminders()
  # create/delete per-booking EventBridge reminder schedules.
  scheduled_messages_table_arn  = module.ddb_scheduled_messages_staging[0].table_arn
  scheduled_messages_table_name = module.ddb_scheduled_messages_staging[0].table_name
  scheduler_exec_role_arn       = module.lambda_reminder_scheduler_staging[0].scheduler_exec_role_arn
  scheduler_target_arn          = module.lambda_reminder_scheduler_staging[0].scheduler_target_arn
  scheduler_group_name          = module.lambda_reminder_scheduler_staging[0].scheduler_group_name
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
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-calendar-event-consumer-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

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

  # §E14 notification-template override (notify.js GetItem at dispatch; fail-safe → default).
  scheduling_notif_template_table_arn  = module.ddb_scheduling_notif_template_staging[0].table_arn
  scheduling_notif_template_table_name = module.ddb_scheduling_notif_template_staging[0].table_name

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
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-calendar-lifecycle-consumer-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  # Booking table (Terraform-managed via ddb-booking): GetItem + conditional UpdateItem.
  booking_table_arn  = module.ddb_booking_staging[0].table_arn
  booking_table_name = module.ddb_booking_staging[0].table_name

  # Watch-channels table (pre-existing, read via data source): channel-degrade UpdateItem.
  channels_table_arn  = data.aws_dynamodb_table.calendar_watch_channels_staging[0].arn
  channels_table_name = data.aws_dynamodb_table.calendar_watch_channels_staging[0].name

  # Fan-out lifecycle-consumer FIFO queue (event-source-mapping + IAM consume).
  source_queue_arn = module.sns_calendar_watch_fanout_staging[0].lifecycle_consumer_queue_arn

  # §E14 notification-template override (notify.js GetItem at cancel/reschedule dispatch).
  scheduling_notif_template_table_arn  = module.ddb_scheduling_notif_template_staging[0].table_arn
  scheduling_notif_template_table_name = module.ddb_scheduling_notif_template_staging[0].table_name

  # Ops alerts SNS topic (channel-degrade alert publish + the Errors alarm).
  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn

  # Track 1 S6: reminder cleanup on cancel/move. deleteReminders() purges the
  # per-booking EventBridge reminder schedules when a booking is canceled or moved.
  # Consumer needs DeleteSchedule only -- no Create/PassRole (design Q1), so no exec-role ARN.
  scheduled_messages_table_arn  = module.ddb_scheduled_messages_staging[0].table_arn
  scheduled_messages_table_name = module.ddb_scheduled_messages_staging[0].table_name
  scheduler_target_arn          = module.lambda_reminder_scheduler_staging[0].scheduler_target_arn
  scheduler_group_name          = module.lambda_reminder_scheduler_staging[0].scheduler_group_name
}

# Scheduling sub-phase D Task D4 — Scheduling_Redemption_Handler (lambda#205, MERGED).
# The token-redemption Lambda + Function URL that the WS-D3 CloudFront dist (below)
# fronts as its custom origin. Dedicated least-priv role: Booking GetItem, conv-session
# PutItem, jti-blacklist conditional PutItem, jwt-signing-key GetSecretValue — no
# calendar/Zoom/SES/SNS (those run in-chat, WS-D6/D7). Code ships via lambda-repo CI;
# this is the integrator IaC (A1). Wiring the Function URL into the D3 origin +
# enable_custom_domain = true is the SEPARATE Apply-2 step (A2).
module "lambda_scheduling_redemption_handler_staging" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-scheduling-redemption-handler-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  # Booking table (Terraform-managed via ddb-booking): GetItem only.
  booking_table_arn  = module.ddb_booking_staging[0].table_arn
  booking_table_name = module.ddb_booking_staging[0].table_name

  # ConversationSchedulingSession table (Terraform-managed): PutItem only (§B10 binding write).
  conversation_scheduling_session_table_arn  = module.ddb_conversation_scheduling_session_staging[0].table_arn
  conversation_scheduling_session_table_name = module.ddb_conversation_scheduling_session_staging[0].table_name

  # Tenant registry (Terraform-managed): GetItem only — tenant_id -> public tenantHash
  # reverse-lookup for the branded /schedule/ page redirect (M1a).
  tenant_registry_table_arn  = module.ddb_tenant_registry_staging[0].table_arn
  tenant_registry_table_name = module.ddb_tenant_registry_staging[0].table_name

  # jti-blacklist table (Terraform-managed): conditional PutItem only (§13.7 one-time-redeem burn).
  jti_blacklist_table_arn  = module.ddb_token_jti_blacklist_staging[0].table_arn
  jti_blacklist_table_name = module.ddb_token_jti_blacklist_staging[0].table_name

  # Ops alerts SNS topic (Errors alarm target only — the handler does not publish).
  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn

  # Tenant config bucket — the scheduling feature gate reads tenants/{id}/config.json.
  tenant_config_bucket_arn = module.tenant_config_staging[0].bucket_arn
  config_bucket_name       = module.tenant_config_staging[0].bucket_name
}

# ──────────────────────────────────────────────────────────────────────
# Scheduling PAGE M1 — Scheduling_Page_Api (lambda#330, MERGED). The deterministic
# Calendly-style scheduling-page gateway: the SAME-ORIGIN /schedule-api endpoint
# behind the widget CloudFront dist. hash->tenantId (registry GSI) -> resolveBinding
# (§B10 binding = the auth) -> load booking -> invoke the SHIPPED Booking_Commit_Handler
# scheduling_propose/scheduling_mutate seam. NO new executor. Dedicated exec role;
# 3 DDB read-ops + 1 BCH invoke only (no secrets/S3/calendar). Function URL is the
# /schedule-api* custom origin (wired into cloudfront_widget_staging below).
# ──────────────────────────────────────────────────────────────────────
module "lambda_scheduling_page_api_staging" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-scheduling-page-api-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  # Booking table (Terraform-managed via ddb-booking): GetItem only (load booking).
  booking_table_arn  = module.ddb_booking_staging[0].table_arn
  booking_table_name = module.ddb_booking_staging[0].table_name

  # SchedulingSession table (Terraform-managed): GetItem only — resolveBinding reads
  # the §B10 binding row. NOTE: the gateway env var is SCHEDULING_SESSION_TABLE.
  scheduling_session_table_arn  = module.ddb_conversation_scheduling_session_staging[0].table_arn
  scheduling_session_table_name = module.ddb_conversation_scheduling_session_staging[0].table_name

  # Tenant registry (Terraform-managed): Query on the TenantHashIndex GSI only —
  # public tenantHash -> tenant_id (the page is keyed by the hash, never raw id).
  tenant_registry_table_arn  = module.ddb_tenant_registry_staging[0].table_arn
  tenant_registry_table_name = module.ddb_tenant_registry_staging[0].table_name

  # Booking_Commit_Handler — the propose/mutate seam the gateway invokes (the SAME
  # deterministic seam the agent path uses). InvokeFunction only; SCHEDULING_EXECUTOR
  # env = its name.
  bch_function_arn  = module.lambda_booking_commit_staging[0].commit_function_arn
  bch_function_name = module.lambda_booking_commit_staging[0].commit_function_name

  # Ops alerts SNS topic (Errors + Throttles alarm targets only — the gateway does
  # not publish).
  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn
}

# Scheduling sub-phase E Task E11 — Calendar_OAuth_Connect (lambda#248, MERGED).
# The per-staff Google Calendar 3LO consent flow + its public Function URL — the
# 2nd custom origin behind the WS-D3 staging.schedule.myrecruiter.ai dist (the D3
# routing for /connect, /oauth/callback, /connection/status is a SEPARATE PR-2 on
# the redemption-domain module). Dedicated least-priv role (FROZEN_CONTRACTS §E11 +
# Calendar_OAuth_Connect/DEPLOY_NOTES.md): read the 2 reserved platform secrets,
# manage per-coordinator OAuth secrets (fenced off the reserved _* prefix), invoke
# the B5 watch onboarder, GetObject the tenant-config Flag-A gate. Code ships via
# lambda-repo CI (deploy-staging.yml — add Calendar_OAuth_Connect to the matrix +
# dispatch options, then deploy onto this shell). OPERATOR-provision before first
# live connect: the _platform/google-app secret (Google client creds + the
# /oauth/callback redirect URI registered in Google Cloud Console) + the
# _state-signing-key secret. After first apply: add the manual Function URL 2nd
# resource-policy statement via the Console (see the module banner).
module "lambda_calendar_oauth_connect_staging" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-calendar-oauth-connect-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  # Tenant config bucket — featureGate.js Flag-A gate reads tenants/{id}/config.json.
  tenant_config_bucket_arn = module.tenant_config_staging[0].bucket_arn
  config_bucket_name       = module.tenant_config_staging[0].bucket_name

  # B5 watch onboarder — best-effort invoke after a successful connect.
  onboarder_function_arn  = module.lambda_calendar_watch_onboarder_staging[0].onboarder_function_arn
  onboarder_function_name = module.lambda_calendar_watch_onboarder_staging[0].onboarder_function_name

  # T3 (§E11b disconnect, lambda#294): best-effort watch teardown on disconnect.
  offboarder_function_arn  = module.lambda_calendar_watch_offboarder_staging[0].offboarder_function_arn
  offboarder_function_name = module.lambda_calendar_watch_offboarder_staging[0].offboarder_function_name

  # Track 2: init-token single-use burn table (jti) + the friendly return domain
  # (DASHBOARD_RETURN_URL default in the module now points at staging.app.myrecruiter.ai).
  jti_blacklist_table_arn  = module.ddb_token_jti_blacklist_staging[0].table_arn
  jti_blacklist_table_name = module.ddb_token_jti_blacklist_staging[0].table_name

  # Ops alerts SNS topic (Errors/Throttles alarm target only — the handler does not publish).
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

  # A2: wire the live WS-D4 Function URL host as the CloudFront custom origin,
  # and flip enable_custom_domain → true (Apply-2: attaches the
  # staging.schedule.myrecruiter.ai alias + the ISSUED ACM cert). The cert is
  # already ISSUED; after this applies the operator adds the GoDaddy CNAME #2
  # (dns_alias_record output) to make the host resolve.
  redemption_function_url_domain = module.lambda_scheduling_redemption_handler_staging[0].function_url_domain
  enable_custom_domain           = true

  # G3: the 2nd origin — the E11 Calendar_OAuth_Connect Function URL — for the 3 OAuth paths
  # (/connect, /oauth/callback, /connection/status). The callback path is what Google redirects
  # back to, so it must equal the Lambda's OAUTH_REDIRECT_URI + the Google console redirect URI.
  oauth_function_url_domain = module.lambda_calendar_oauth_connect_staging[0].function_url_domain
}

# Stranded_Booking_Remediator (lambda#194, MERGED) — B11 coordinator-offboarding
# stranded-booking remediation. Invoked directly (offboarding-trigger wiring is the
# integrator's coupled change — see the banner above); NOT a queue consumer.
module "lambda_stranded_booking_remediator_staging" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-stranded-booking-remediator-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

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
# Remedy A (#435): origin-request Lambda@Edge that SigV4-signs /stream requests to
# the BSH Function URL (replaces OAC, which can't sign POST bodies). Its role holds
# lambda:InvokeFunctionUrl on the BSH function; its qualified ARN is associated on
# /stream by the cloudfront_widget_staging module below. Inert until the Function
# URL flips to AWS_IAM (streaming_function_url_auth_type, Phase 2).
module "lambda_edge_bsh_signer_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/lambda-edge-bsh-signer-staging"

  # Task 2.5 Wave 4: bare instance only (the suffixed instance's literal
  # ARN carried a second entry during the Wave 1b–4 transition).
  bsh_function_arns = [
    module.lambda_bedrock_handler[0].function_arn,
  ]
}

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

  # Remedy A (#435): the edge signer's versioned ARN, associated on /stream.
  streaming_edge_signer_qualified_arn = module.lambda_edge_bsh_signer_staging[0].qualified_arn

  # Scheduling PAGE M1: the Scheduling_Page_Api Function URL host — the /schedule-api*
  # custom origin (deterministic reschedule/cancel gateway, same-origin with the page).
  scheduling_page_api_origin_domain = module.lambda_scheduling_page_api_staging[0].function_url_domain
}

# ──────────────────────────────────────────────────────────────────────
# ANALYTICS-DASHBOARD STAGING RE-HOME (prod acct 614 -> staging 525)
# Mirrors the Q5 widget edge migration above. Re-homes the analytics
# dashboard staging hosting out of the prod account (legacy CF
# E2R9VHBON5PHMK + public-read bucket picasso-analytics-portal-staging)
# into the staging account as an OAC-hardened faithful twin of the prod
# dashboard dist EJ0Y6ZUIUBSAT. Simpler than the widget twin: 2 origins
# (private S3 + the 525 Analytics_Dashboard_API Function URL), 2 behaviors
# (SPA default + /api/*), 2 CloudFront functions (spa + api rewrite), no WAF.
#
# DNS is deliberately LAST: the cert is created PENDING_VALIDATION (operator
# adds the GoDaddy CNAME at cutover) and enable_custom_domain stays false
# until the operator releases the alias from E2R9VHBON5PHMK + repoints the
# GoDaddy CNAME. Until then the twin is validated via its raw
# d###.cloudfront.net domain. No prod-account change here.
# ──────────────────────────────────────────────────────────────────────
module "acm_app_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/acm-app-staging"
}

module "cloudfront_analytics_dashboard_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/cloudfront-analytics-dashboard-staging"

  acm_certificate_arn = module.acm_app_staging[0].certificate_arn
  # CUTOVER 2026-06-26: prerequisites done — the legacy 614 dist E2R9VHBON5PHMK
  # released the staging.app alias (switched to its default cert), the GoDaddy
  # staging.app CNAME was repointed to this twin's domain, and the ACM cert
  # reached ISSUED. true attaches the staging.app.myrecruiter.ai alias + cert.
  enable_custom_domain = true
}

module "s3_analytics_dashboard_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/s3-analytics-dashboard-staging"

  # OAC GetObject grant scoped to the new distribution. One-directional dep
  # (this bucket policy ← cloudfront ARN); the CF module references this
  # bucket by fixed regional domain, so no cycle.
  cloudfront_distribution_arn = module.cloudfront_analytics_dashboard_staging[0].distribution_arn
}

# Phase 2b: least-privilege CI deploy role for the dashboard staging deploy.
# Its ARN is set as the picasso-analytics-dashboard repo secret
# AWS_DEPLOY_ROLE_ARN_STAGING (operator), and pr-checks.yml's deploy-staging
# job is repointed off the prod-account 614 role onto it. No module deps
# (bucket/dist/repo are locked literals) — pure logical grouping.
module "iam_analytics_dashboard_deploy_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/iam-analytics-dashboard-deploy-staging"
}

# Q5 Phase 2 [locked decision #9]: minimal CI widget-deploy role. No module
# deps (bucket/dist/repo are locked Q5 literals) — pure logical grouping.
# Phase 2.2 sets its ARN as GitHub secret AWS_DEPLOY_ROLE_ARN_STAGING and
# repoints build-and-deploy-staging off the prod-account legacy role.
module "iam_widget_deploy_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/iam-widget-deploy-staging"
}

# CI-modernization Phase 2.3: staging deploy target for picasso-config-builder
# (closes the prod workflow's TODO(staging-env)). Bucket = public-read website
# endpoint mirroring the prod bucket's posture (see module note); role =
# per-product deploy role consumed by pcb's pr-checks via repo secret
# AWS_DEPLOY_ROLE_ARN_STAGING.
module "s3_config_builder_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/s3-config-builder-staging"
}

module "iam_config_builder_deploy_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/iam-config-builder-deploy-staging"

  bucket_arn                 = module.s3_config_builder_staging[0].bucket_arn
  cloudfront_distribution_id = module.cloudfront_config_builder_staging[0].distribution_id
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
        # Task 2.5 Wave 4: bare instance only.
        Sid    = "AllowBSHLambdaRoleOnly"
        Effect = "Allow"
        Principal = { AWS = [
          module.lambda_bedrock_handler[0].role_arn,
        ] }
        Action   = "secretsmanager:GetSecretValue"
        Resource = "*"
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
            "aws:PrincipalArn" = [
              module.lambda_bedrock_handler[0].role_arn,
            ]
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
          # Task 2.5 Wave 4: bare-named MFS instance only (the suffixed
          # entry carried the Wave 1b–4 transition).
          module.lambda_master_function[0].role_arn,
          module.lambda_analytics_dashboard_api_staging[0].role_arn,
          # Scheduling §13.4 signed-token signers (same key; iss claim isolates from
          # chat-session JWTs). Calendar_Event_Consumer mints the B9 reoffer link (gap C);
          # Booking_Commit_Handler mints the C8 confirmation cancel/reschedule links (latent
          # until its real zip deploys — the resource-policy Deny below would have blocked it).
          module.lambda_calendar_event_consumer_staging[0].consumer_role_arn,
          module.lambda_booking_commit_staging[0].commit_role_arn,
          # Calendar_Lifecycle_Consumer mints the §14.2 cancel_notice reschedule link (gap C Y).
          module.lambda_calendar_lifecycle_consumer_staging[0].consumer_role_arn,
          # Scheduling_Redemption_Handler VALIDATES the cancel/reschedule tokens at the
          # staging.schedule endpoint — it must read the same key to verify(). Omitting it
          # caused signing_key_unavailable on the first link click (the Deny below blocked it).
          module.lambda_scheduling_redemption_handler_staging[0].redemption_role_arn,
          # Attendance_Disposition_Handler MINTS the 3 "did you connect?" tokens (WS-E-ATTEND
          # attendance_check/escalate). Hand-deployed (no TF module yet) → literal ARN. Omitting
          # it made the disposition path AccessDenied on this key → signing_key_unavailable
          # (100% disposition-cycle failure). Added 2026-06-21.
          "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/Attendance_Disposition_Handler-exec-staging",
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
              module.lambda_master_function[0].role_arn,
              module.lambda_analytics_dashboard_api_staging[0].role_arn,
              module.lambda_calendar_event_consumer_staging[0].consumer_role_arn,
              module.lambda_booking_commit_staging[0].commit_role_arn,
              module.lambda_calendar_lifecycle_consumer_staging[0].consumer_role_arn,
              # Redemption handler — same exemption as the Allow above (token validator).
              module.lambda_scheduling_redemption_handler_staging[0].redemption_role_arn,
              # Attendance_Disposition_Handler — token minter (WS-E-ATTEND); literal ARN
              # (hand-deployed, no TF module). Mirrors the Allow above. Added 2026-06-21.
              "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/Attendance_Disposition_Handler-exec-staging",
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
          # Task 2.5 Wave 4: bare-named MFS instance only. Both the Wave-1b
          # add and the Wave-4 suffixed-entry drop were shadow-key-gated per
          # kms-pii-staging-policy-change-runbook.md (runs 2026-06-10).
          module.lambda_master_function[0].role_arn,
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
              module.lambda_master_function[0].role_arn,
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

# ══════════════════════════════════════════════════════════════════════════
# Track 1 S6 — Reminder system activation (STAGING ONLY)
#
# Three new modules wire the merged-but-inert reminder code (lambda main S1/S2/S3)
# into live AWS infrastructure:
#
#   1. ddb_scheduled_messages_staging — the picasso-scheduled-messages table that
#      stores per-booking reminder rows. OPERATOR: check if this table already exists
#      (created out-of-band by create-scheduled-messages-table.sh) and run
#      `terraform import` before apply if so (see module banner).
#
#   2. lambda_scheduled_message_sender_staging — Scheduled_Message_Sender Lambda
#      (the EventBridge Scheduler target). No deps on the scheduler module; creates
#      its own execution role with send_email + SMS_Sender invoke grants.
#
#   3. lambda_reminder_scheduler_staging — houses THREE things:
#        a. The dedicated schedule group "picasso-scheduling-reminders-staging"
#        b. The EventBridge Scheduler execution role (ArnLike confused-deputy for
#           dynamic per-booking schedule names; invoke-only on sender ARN)
#        c. The Reminder_Scheduler (nightly reconciler) Lambda + its own role +
#           a nightly cron schedule
#
# Dependency order (no cycle):
#   ddb_scheduled_messages_staging  (no module deps)
#   lambda_scheduled_message_sender_staging  (no module deps)
#   lambda_reminder_scheduler_staging  →  lambda_scheduled_message_sender_staging
#   lambda_booking_commit_staging  →  lambda_reminder_scheduler_staging + ddb
#   lambda_calendar_lifecycle_consumer_staging  →  lambda_reminder_scheduler_staging + ddb
#
# Apply order (operator-gated):
#   Step 0 — MANDATORY GATE (do NOT skip): the picasso-scheduled-messages table was likely
#             created out-of-band by Scheduled_Message_Sender/create-scheduled-messages-table.sh.
#             Run `aws dynamodb describe-table --table-name picasso-scheduled-messages
#             --profile myrecruiter-staging`. If it EXISTS, `terraform import` it (command below)
#             BEFORE apply — otherwise the create fails ResourceInUseException AFTER the roles +
#             functions are already created (a messy partial apply). Proceed only when describe
#             returns 404 OR the import is done + a plan shows no destructive table diff.
#   Step 1 — apply with all three new modules + the BCH/lifecycle edits.
#             The placeholder Lambdas + nightly cron fire = harmless no-op.
#             AFTER apply: re-verify CodeSha256 on ALL FOUR touched functions (placeholder-revert
#             hazard — the BCH + lifecycle edits re-touch their live functions):
#               for f in Booking_Commit_Handler Calendar_Lifecycle_Consumer \
#                        Scheduled_Message_Sender Reminder_Scheduler; do
#                 aws lambda get-function-configuration --function-name "$f" \
#                   --profile myrecruiter-staging --query CodeSha256; done
#             Re-run the lambda-repo CI deploy for any that reverted to the placeholder.
#   Step 2 — merge PR B / run lambda-repo CI deploys for the 3 functions.
#   Step 3 — smoke: a synthetic cycle, OR exercise the CANCEL/RESCHEDULE path (not just a fresh
#             booking) to confirm rows + schedules are created AND torn down.
# ══════════════════════════════════════════════════════════════════════════

# Track 1 S6 step 1: picasso-scheduled-messages table.
# OPERATOR NOTE (see Step 0 gate above): if this table already exists, run BEFORE apply:
#   terraform import \
#     module.ddb_scheduled_messages_staging[0].aws_dynamodb_table.scheduled_messages \
#     picasso-scheduled-messages
module "ddb_scheduled_messages_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-scheduled-messages-staging"
}

# Track 1 S6 step 2: Scheduled_Message_Sender Lambda (the EventBridge schedule target).
# No dependency on the scheduler module -- keeps the dependency graph acyclic.
module "lambda_scheduled_message_sender_staging" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-scheduled-message-sender-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  scheduled_messages_table_arn  = module.ddb_scheduled_messages_staging[0].table_arn
  scheduled_messages_table_name = module.ddb_scheduled_messages_staging[0].table_name

  # picasso-sms-consent (no -staging suffix) -- same table BCH + SMS_Sender use.
  sms_consent_table_arn  = module.picasso_form_tables.sms_consent_table_arn
  sms_consent_table_name = module.picasso_form_tables.sms_consent_table_name

  # E14 S4b: per-tenant reminder template overrides (read-only, fire-time).
  sched_notif_template_table_arn  = module.ddb_scheduling_notif_template_staging[0].table_arn
  sched_notif_template_table_name = module.ddb_scheduling_notif_template_staging[0].table_name

  # Invoke grants scoped to exactly these ARNs (no wildcard).
  sms_sender_function_arn  = module.lambda_sms_twin_staging[0].sms_sender_function_arn
  sms_sender_function_name = module.lambda_sms_twin_staging[0].sms_sender_function_name
  # send_email_function_name defaults to "send_email" (bare, matches the staging function).

  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn
}

# Track 1 S6 step 3: Reminder_Scheduler (nightly reconciler) + EventBridge exec role
# + dedicated schedule group. Depends on lambda_scheduled_message_sender_staging for
# the sender ARN (the target of every per-booking reminder schedule).
module "lambda_reminder_scheduler_staging" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-reminder-scheduler-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  # Scheduled_Message_Sender is the EventBridge schedule target; its ARN is wired into
  # the scheduler_exec role's invoke policy + the reconciler's SCHEDULER_TARGET_ARN env.
  sender_function_arn  = module.lambda_scheduled_message_sender_staging[0].sender_function_arn
  sender_function_name = module.lambda_scheduled_message_sender_staging[0].sender_function_name

  # Booking table (Query tenantId-start_at-index GSI + UpdateItem base table).
  booking_table_arn          = module.ddb_booking_staging[0].table_arn
  booking_table_name         = module.ddb_booking_staging[0].table_name
  booking_start_at_index_arn = module.ddb_booking_staging[0].tenant_id_start_at_index_arn

  # Scheduled-messages table (reconciler DeleteItem terminal rows).
  scheduled_messages_table_arn  = module.ddb_scheduled_messages_staging[0].table_arn
  scheduled_messages_table_name = module.ddb_scheduled_messages_staging[0].table_name

  # Ops alerts SNS topic (Errors alarm target).
  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn
}

# ------------------------------------------------------------------
# picasso-session-archiver — Event Source Mapping (Phase 2 audit row G)
# ------------------------------------------------------------------
# The ESM is Terraform-managed (resource below). The Lambda itself + its IAM
# + the DLQ are still hand-created — bringing them under Terraform is follow-up
# scope. (A prior `import {}` block pinning the live ESM UUID was removed in
# batch-3 of the naming-alignment program: renaming
# picasso-session-summaries-staging -> picasso-session-summaries replaced the
# table's stream, which destroyed the imported ESM; Terraform now recreates the
# ESM against the new stream ARN. The hand-managed archiver role's DDBStreamRead
# grant was also repointed to the new stream ARN out-of-band -- see runbook.)
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

# DDB-stream read + S3 archive-write grant for the (hand-managed) archiver role.
# Brought under Terraform in batch-3 of the naming-alignment program: renaming
# picasso-session-summaries-staging -> picasso-session-summaries replaced the
# table's stream, and the hand-managed grant (pinned to the OLD stream ARN)
# blocked the ESM with a 400. The DDBStreamRead resource is now wired from
# module.session_summaries.table_arn so the grant cascades on any future rename
# (the /stream/* wildcard already covers the per-replace stream timestamp).
# No import block needed: create issues an idempotent PutRolePolicy that adopts
# the existing identically-shaped inline policy. The role itself, the Lambda, and
# the DLQ stay hand-managed (follow-up scope).
resource "aws_iam_role_policy" "picasso_session_archiver_inline" {
  count = var.env == "staging" ? 1 : 0

  name = "picasso-session-archiver-inline"
  role = "picasso-session-archiver-role"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DDBStreamRead"
        Effect = "Allow"
        Action = [
          "dynamodb:DescribeStream",
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
          "dynamodb:ListStreams",
        ]
        Resource = "${module.session_summaries.table_arn}/stream/*"
      },
      {
        Sid      = "S3ArchiveWrite"
        Effect   = "Allow"
        Action   = "s3:PutObject"
        Resource = "arn:aws:s3:::picasso-archive-staging/sessions/*"
      },
    ]
  })
}

# Config-builder staging twin: Picasso_Config_Manager Lambda + Function URL.
# Completes the frontend-first twin (picasso-config-builder-staging bucket) --
# the staging UI had no backend in this account and its default VITE_API_URL
# pointed at the PROD Function URL, which cannot serve the staging config
# bucket across the account boundary. After apply: deploy the real code from
# Lambdas/lambda/Picasso_Config_Manager, then rebuild the staging UI with
# VITE_API_URL = this module's function_url output.
module "lambda_config_manager_staging" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-config-manager-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  config_bucket_name = module.tenant_config_staging[0].bucket_name
  # clerk_jwks_url defaults to the prod Clerk instance (shared operator identity).

  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn
}

# staging.config.myrecruiter.ai -- HTTPS edge for the config-builder staging UI
# (twin of prod's config.myrecruiter.ai). TWO-APPLY: this first apply creates
# only the ACM cert; after the operator adds the GoDaddy validation CNAME and
# the cert is ISSUED, a one-line PR sets create_distribution = true. See the
# module header for the full sequence (incl. the Clerk allowed-origin step).
module "cloudfront_config_builder_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/cloudfront-config-builder-staging"

  # Apply 2 (cert ISSUED 2026-06-11): distribution live.
  create_distribution = true
}


# WS-E-CI6 ACTIVATION: Scheduling_Synthetic_Monitor (synthetic booking/cancel/reminder/
# cleanup cycles against the burn-in tenant). Code merged since lambda#245/#283; this
# module provisions it. Pairs with STAGING_TEST_MODE=true on lambda_booking_commit_staging
# (the cadence-compression gate, double-gated by is_synthetic). Spec:
# Lambdas/lambda/Scheduling_Synthetic_Monitor/INFRA_NOTES.md.
module "lambda_scheduling_synthetic_monitor_staging" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-scheduling-synthetic-monitor-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  booking_commit_function_arn  = module.lambda_booking_commit_staging[0].commit_function_arn
  booking_commit_function_name = module.lambda_booking_commit_staging[0].commit_function_name

  # T3 disposition cycle (lambda#292): the 5th CI-6 cycle's invoke target.
  attendance_disposition_function_arn  = module.lambda_attendance_disposition_staging[0].function_arn
  attendance_disposition_function_name = module.lambda_attendance_disposition_staging[0].function_name

  booking_table_arn  = module.ddb_booking_staging[0].table_arn
  booking_table_name = module.ddb_booking_staging[0].table_name

  scheduled_messages_table_arn  = module.ddb_scheduled_messages_staging[0].table_arn
  scheduled_messages_table_name = module.ddb_scheduled_messages_staging[0].table_name

  ops_alerts_topic_arn = module.ops_alarms_master_function_staging[0].topic_arn
}

# Attendance_Disposition_Handler (WS-E-ATTEND #243) -- T3 ACTIVATION. The E5/E10/C13
# missed-event handler: provisioned here (role + placeholder), real code ships via the
# lambda-repo CI matrix. Invoked by the monitor's disposition cycle today; the REMIND
# attendance-schedule wiring (E5-TRIGGER SEAM) is a tracked follow-up.
module "lambda_attendance_disposition_staging" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-attendance-disposition-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  booking_table_arn  = module.ddb_booking_staging[0].table_arn
  booking_table_name = module.ddb_booking_staging[0].table_name

  tenant_config_bucket_arn  = module.tenant_config_staging[0].bucket_arn
  tenant_config_bucket_name = module.tenant_config_staging[0].bucket_name
}

# ──────────────────────────────────────────────────────────────────────
# Attribution Wave-1 -- staging glue (G1)
#
# Resources:
#   - picasso-entry-points DDB table (C3 registry)
#   - picasso-attribution-aggregates DDB table (C5 rollups, TTL 420d)
#   - picasso/staging/dub/api-key Secrets Manager secret (C4 Dub key;
#     value operator-injected post-apply via put-secret-value)
#   - Attribution_Mint_Service Lambda (WS-B, nodejs20.x, placeholder)
#   - Attribution_Aggregator Lambda (WS-C, python3.13, hourly EventBridge)
#   - Dub secret resource policy scoped to the two Lambda exec roles
#   - ADA (lambda_analytics_dashboard_api_staging) extended with
#     read grants on both tables + InvokeFunction on the mint Lambda
#
# Placeholder-code pattern: real code deploys via lambda-repo CI matrix.
# ──────────────────────────────────────────────────────────────────────

module "ddb_entry_points_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-entry-points-staging"
}

module "ddb_attribution_aggregates_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/ddb-attribution-aggregates-staging"
}

module "secrets_dub_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/secrets-dub-staging"
}

module "lambda_attribution_mint_staging" {
  dub_workspace_id         = "ws_1JQ7P29YHBZBY3YX9961NCST7"
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-attribution-mint-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  entry_points_table_arn  = module.ddb_entry_points_staging[0].table_arn
  entry_points_table_name = module.ddb_entry_points_staging[0].table_name

  dub_secret_arn  = module.secrets_dub_staging[0].secret_arn
  dub_secret_name = module.secrets_dub_staging[0].secret_name
}

module "lambda_attribution_aggregator_staging" {
  dub_workspace_id         = "ws_1JQ7P29YHBZBY3YX9961NCST7"
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-attribution-aggregator-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  session_events_table_arn  = module.ddb_session_events_staging[0].table_arn
  session_events_table_name = module.ddb_session_events_staging[0].table_name

  entry_points_table_arn  = module.ddb_entry_points_staging[0].table_arn
  entry_points_table_name = module.ddb_entry_points_staging[0].table_name

  attribution_aggregates_table_arn  = module.ddb_attribution_aggregates_staging[0].table_arn
  attribution_aggregates_table_name = module.ddb_attribution_aggregates_staging[0].table_name

  dub_secret_arn  = module.secrets_dub_staging[0].secret_arn
  dub_secret_name = module.secrets_dub_staging[0].secret_name

  tenant_config_bucket_arn  = module.tenant_config_staging[0].bucket_arn
  tenant_config_bucket_name = module.tenant_config_staging[0].bucket_name
}

# Attribution_Unsubscribe -- Wave-2 WS-I.
# Public Function URL (AuthType=NONE; HMAC token is the auth layer).
# Validates one-click unsubscribe tokens and writes permanent suppression rows
# to picasso-attribution-aggregates (sk=SUPPRESS#recap#{email}).
# Reviewed by communications-consent-advisor (WS-I consent gate, 2026-06).
module "secrets_attribution_unsub_staging" {
  count  = var.env == "staging" ? 1 : 0
  source = "./modules/secrets-attribution-unsub-staging"
}

module "lambda_attribution_unsubscribe_staging" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-attribution-unsubscribe-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  attribution_aggregates_table_arn  = module.ddb_attribution_aggregates_staging[0].table_arn
  attribution_aggregates_table_name = module.ddb_attribution_aggregates_staging[0].table_name

  unsub_secret_arn  = module.secrets_attribution_unsub_staging[0].secret_arn
  unsub_secret_name = module.secrets_attribution_unsub_staging[0].secret_name
}

# Attribution_Recap_Generator -- Wave-2 WS-H.
# Runs monthly (1st of month 14:00 UTC), reads prior-month aggregates from
# picasso-attribution-aggregates, and dispatches recap emails via send_email.
# RECAP_SEND_ENABLED defaults to "false" (safety gate; flip after consent advisory).
# RECAP_POSTAL_ADDRESS defaults to "" (fail-closed; operator sets via envs/staging.tfvars).
module "lambda_attribution_recap_generator_staging" {
  count                    = var.env == "staging" ? 1 : 0
  source                   = "./modules/lambda-attribution-recap-generator-staging"
  permissions_boundary_arn = module.iam_workload_boundary[0].arn

  attribution_aggregates_table_arn  = module.ddb_attribution_aggregates_staging[0].table_arn
  attribution_aggregates_table_name = module.ddb_attribution_aggregates_staging[0].table_name

  tenant_config_bucket_arn  = module.tenant_config_staging[0].bucket_arn
  tenant_config_bucket_name = module.tenant_config_staging[0].bucket_name

  send_email_function_arn  = module.lambda_send_email_staging[0].function_arn
  send_email_function_name = module.lambda_send_email_staging[0].function_name

  unsubscribe_base_url = module.lambda_attribution_unsubscribe_staging[0].function_url
  unsub_secret_arn     = module.secrets_attribution_unsub_staging[0].secret_arn
  unsub_secret_name    = module.secrets_attribution_unsub_staging[0].secret_name
}

# Dub secret resource policy -- restricts GetSecretValue to the two
# attribution Lambda exec roles only. Root-level (not in the secrets
# module) to avoid the circular dep: policy needs role ARNs; Lambda
# modules need the secret ARN. Same pattern as jwt_signing_key_staging
# and clerk_secret_key_staging above.
resource "aws_secretsmanager_secret_policy" "dub_api_key_staging" {
  count      = var.env == "staging" ? 1 : 0
  secret_arn = module.secrets_dub_staging[0].secret_arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowAttributionLambdaRoles"
        Effect = "Allow"
        Principal = { AWS = [
          module.lambda_attribution_mint_staging[0].role_arn,
          module.lambda_attribution_aggregator_staging[0].role_arn,
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
              module.lambda_attribution_mint_staging[0].role_arn,
              module.lambda_attribution_aggregator_staging[0].role_arn,
            ]
          }
        }
      },
    ]
  })
}

# Unsub signing key resource policy -- restricts GetSecretValue to the two
# attribution Lambda roles that need it: Unsubscribe (validates) and
# Recap_Generator (signs). Root-level (not in the secrets module) to avoid
# the circular dep: policy needs role ARNs; Lambda modules need the secret ARN.
# Same pattern as dub_api_key_staging and jwt_signing_key_staging above.
resource "aws_secretsmanager_secret_policy" "attribution_unsub_staging" {
  count      = var.env == "staging" ? 1 : 0
  secret_arn = module.secrets_attribution_unsub_staging[0].secret_arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowAttributionUnsubRoles"
        Effect = "Allow"
        Principal = { AWS = [
          module.lambda_attribution_unsubscribe_staging[0].role_arn,
          module.lambda_attribution_recap_generator_staging[0].role_arn,
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
              module.lambda_attribution_unsubscribe_staging[0].role_arn,
              module.lambda_attribution_recap_generator_staging[0].role_arn,
            ]
          }
        }
      },
    ]
  })
}
