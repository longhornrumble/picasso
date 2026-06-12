variable "function_name" {
  description = "Lambda function name. Per uniform-env-rules in this account, NO _Staging suffix — the account boundary is the env separation."
  type        = string
  default     = "Analytics_Dashboard_API"
}

variable "tenant_config_bucket_arn" {
  description = "ARN of the staging tenant config S3 bucket."
  type        = string
}

variable "config_bucket_name" {
  description = "Name of the staging tenant config S3 bucket (for env var)."
  type        = string
}

variable "jwt_secret_arn" {
  description = "ARN of the JWT signing key in Secrets Manager."
  type        = string
}

variable "jwt_secret_name" {
  description = "Name of the JWT secret (for env var)."
  type        = string
}

variable "clerk_secret_arn" {
  description = "ARN of the Clerk dev-project secret key in Secrets Manager. Code path reads via CLERK_SECRET_KEY_SECRET_ID env var (Plan Security F2 — secret never enters env vars or tfstate)."
  type        = string
}

variable "clerk_secret_name" {
  description = "Name of the Clerk secret (for CLERK_SECRET_KEY_SECRET_ID env var)."
  type        = string
}

variable "tenant_registry_table_arn" {
  type = string
}

variable "tenant_registry_table_name" {
  type = string
}

variable "session_summaries_table_arn" {
  type = string
}

variable "session_summaries_table_name" {
  type = string
}

variable "session_events_table_arn" {
  type = string
}

variable "session_events_table_name" {
  type = string
}

variable "form_submissions_table_arn" {
  type = string
}

variable "form_submissions_table_name" {
  type = string
}

variable "notification_events_table_arn" {
  type = string
}

variable "notification_events_table_name" {
  type = string
}

variable "notification_sends_table_arn" {
  type = string
}

variable "notification_sends_table_name" {
  type = string
}

variable "billing_events_table_arn" {
  type = string
}

variable "billing_events_table_name" {
  type = string
}

variable "employee_registry_table_arn" {
  type = string
}

variable "employee_registry_table_name" {
  type = string
}

variable "audit_table_arn" {
  type = string
}

variable "audit_table_name" {
  type = string
}

variable "booking_table_arn" {
  description = "ARN of picasso-booking-{env}. ADA's §E7 GET /scheduling/bookings reader Querys the two GSIs only (no base-table read, no write). Staging-only; scheduling has no prod table yet."
  type        = string
}

variable "booking_table_name" {
  type = string
}

variable "appointment_type_table_arn" {
  description = "ARN of picasso-appointment-type-{env}. ADA's §E13b write API does Query/GetItem/PutItem/UpdateItem (no GSI on this table). Staging-only; scheduling has no prod table yet."
  type        = string
}

variable "appointment_type_table_name" {
  type = string
}

variable "routing_policy_table_arn" {
  description = "ARN of picasso-routing-policy-{env}. ADA's §E13b write API does Query/GetItem/PutItem/UpdateItem (no GSI). The write API never touches the commit-owned round-robin state (UpdateItem SETs editable fields only). Staging-only."
  type        = string
}

variable "routing_policy_table_name" {
  type = string
}

variable "scheduling_notif_template_table_arn" {
  description = "ARN of picasso-scheduling-notif-template-{env}. ADA's G2/E14 API does Query (GET) + UpdateItem (PATCH upsert-merge) only — no GSI. Staging-only."
  type        = string
}

variable "scheduling_notif_template_table_name" {
  type = string
}

variable "oauth_function_url" {
  description = "Full Function URL of Calendar_OAuth_Connect (G3/E0) -> OAUTH_FUNCTION_URL env. The ADA init-token mint appends /connect and /connection/status to it. Empty until PR-1's Lambda exists; the mint handler 503s while empty."
  type        = string
  default     = ""
}

variable "oauth_state_signing_secret_arn" {
  description = "ARN (with -* suffix) of picasso/scheduling/oauth/_state-signing-key. The ADA init-token mint reads it (GetSecretValue) to state.sign — the SAME key Calendar_OAuth_Connect state.verify reads. OPERATOR PRE-PROVISION: the secret at this ARN must exist before the mint runs (it is created out-of-band, NOT Terraform-managed, so its value never enters tfstate). See Calendar_OAuth_Connect/DEPLOY_NOTES.md §4."
  type        = string
}

variable "clerk_jwks_url" {
  description = "Clerk JWKS endpoint. Defaults to the Clerk dev project shared with legacy staging."
  type        = string
  default     = "https://divine-impala-48.clerk.accounts.dev/.well-known/jwks.json"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 30
}

variable "archive_bucket_arn" {
  description = "ARN of the Tier-3 archive S3 bucket (picasso-archive-staging). ADA reads from it via _fetch_archived_sessions when the requested date range extends past the 90d DDB TTL window."
  type        = string
}

variable "tenant_purge_function_arn" {
  description = "ARN of picasso-pii-tenant-purge-staging. When set, the dashboard exec role gets lambda:InvokeFunction on it (the super-admin POST /admin/tenants/{id}/purge endpoint). Default empty renders ZERO grant — staging-only; the purge Lambda is staging-only (account guard refuses outside 525)."
  type        = string
  default     = ""
}

variable "booking_commit_function_arn" {
  description = "ARN of Booking_Commit_Handler. When set, the dashboard exec role gets lambda:InvokeFunction on it (the G6/E12 POST /scheduling/bookings/{id}/cancel + /reschedule-link actions proxy the side-effect to BCH's scheduling_mutate executor). Default empty renders ZERO grant — staging-only; scheduling has no prod surface yet."
  type        = string
  default     = ""
}

variable "booking_commit_function_name" {
  description = "Name of Booking_Commit_Handler (BOOKING_COMMIT_FUNCTION_NAME env — the InvocationType=RequestResponse target for the G6 booking actions). Code default is the bare 'Booking_Commit_Handler'; pinned here for parity with the ARN grant."
  type        = string
  default     = "Booking_Commit_Handler"
}

# Attribution Wave-1 (C4b, C5, C6 contracts)

variable "entry_points_table_arn" {
  description = "ARN of picasso-entry-points. ADA reads entry-point registry records for GET /attribution/entry-points (read-only: Query/GetItem)."
  type        = string
  default     = ""
}

variable "entry_points_table_name" {
  description = "Name of picasso-entry-points (for ENTRY_POINTS_TABLE env var)."
  type        = string
  default     = ""
}

variable "attribution_aggregates_table_arn" {
  description = "ARN of picasso-attribution-aggregates. ADA reads monthly rollup rows for /attribution/* routes (read-only: Query/GetItem)."
  type        = string
  default     = ""
}

variable "attribution_aggregates_table_name" {
  description = "Name of picasso-attribution-aggregates (for ATTRIBUTION_AGGREGATES_TABLE env var)."
  type        = string
  default     = ""
}

variable "mint_function_arn" {
  description = "ARN of Attribution_Mint_Service. ADA invokes it for POST /attribution/entry-points (C4b proxy). Default empty renders ZERO grant."
  type        = string
  default     = ""
}

variable "mint_function_name" {
  description = "Name of Attribution_Mint_Service (for MINT_FUNCTION_NAME env var). ADA passes this to the C4b invoke path."
  type        = string
  default     = "Attribution_Mint_Service"
}

# ------------------------------------------------------------------
# IAM role + minimum-scope inline policy (with explicit Denies on prod)
# ------------------------------------------------------------------

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "exec" {
  name               = "${var.function_name}-role"
  assume_role_policy = data.aws_iam_policy_document.trust.json
  description        = "Execution role for staging-account Analytics_Dashboard_API."
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_iam_policy_document" "exec" {
  statement {
    sid     = "Logs"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.function_name}:*",
    ]
  }

  statement {
    sid       = "TenantConfigGet"
    actions   = ["s3:GetObject"]
    resources = ["${var.tenant_config_bucket_arn}/*"]
  }

  statement {
    sid       = "TenantConfigList"
    actions   = ["s3:ListBucket"]
    resources = [var.tenant_config_bucket_arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["tenants/*", "mappings/*"]
    }
  }

  statement {
    sid     = "SecretsRead"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      var.jwt_secret_arn,
      var.clerk_secret_arn,
    ]
  }

  # Read+Write on the three tables ADA actually mutates at runtime:
  # form-submissions (lead status / notes), tenant-registry (admin tenant
  # ops), employee-registry-v2 (admin invites / role updates).
  statement {
    sid = "DynamoDBReadWriteRuntimeMutating"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:BatchGetItem",
      "dynamodb:BatchWriteItem",
    ]
    resources = [
      var.form_submissions_table_arn,
      "${var.form_submissions_table_arn}/index/*",
      var.tenant_registry_table_arn,
      "${var.tenant_registry_table_arn}/index/*",
      var.employee_registry_table_arn,
      "${var.employee_registry_table_arn}/index/*",
    ]
  }

  # Scan on the tenant-registry ONLY. handle_admin_tenants ->
  # tenant_registry_ops.list_all_tenants() does a full Scan (acceptable at
  # <50 tenants). Without it the super-admin tenant list 500s with
  # AccessDeniedException on dynamodb:Scan. Deliberately a separate statement
  # scoped to the registry table — NOT added to the mutating statement above,
  # which also covers form-submissions (PII) and employee-registry; those must
  # not become Scan-able.
  statement {
    sid       = "TenantRegistryScan"
    actions   = ["dynamodb:Scan"]
    resources = [var.tenant_registry_table_arn]
  }

  # Read-only on the analytics fact tables — ADA queries these for
  # dashboard rendering but never writes.
  statement {
    sid = "DynamoDBReadOnly"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:BatchGetItem",
    ]
    resources = [
      var.session_summaries_table_arn,
      "${var.session_summaries_table_arn}/index/*",
      var.session_events_table_arn,
      "${var.session_events_table_arn}/index/*",
      var.notification_events_table_arn,
      "${var.notification_events_table_arn}/index/*",
      var.notification_sends_table_arn,
      "${var.notification_sends_table_arn}/index/*",
      var.billing_events_table_arn,
      "${var.billing_events_table_arn}/index/*",
      var.audit_table_arn,
      "${var.audit_table_arn}/index/*",
    ]
  }

  # §E7 GET /scheduling/bookings reader. Query on the two booking GSIs ONLY
  # (tenantId-start_at-index for the date-window list, tenantId-coordinator_email-index
  # for the staff_self scope) — deliberately NOT the base table and NOT /index/*, so a
  # code bug can't read by raw booking_id or via an unintended GSI. Read-only; ADA never
  # mutates bookings. Staging-only — scheduling has no prod booking table yet.
  statement {
    sid     = "SchedulingBookingsRead"
    actions = ["dynamodb:Query"]
    resources = [
      "${var.booking_table_arn}/index/tenantId-start_at-index",
      "${var.booking_table_arn}/index/tenantId-coordinator_email-index",
    ]
  }

  # G6/E12 booking ACTIONS (cancel + reschedule-link): the action handlers GetItem ONE booking
  # by its (tenantId, booking_id) base-table key to run the §8 permission check (own-by-
  # coordinator_email vs admin) before proxying to BCH. This is a deliberate, narrow exception
  # to the GSI-Query-only posture above — GetItem on the BASE table ONLY (no GSI, no write); the
  # tenant is IN the key, so a cross-tenant booking_id is structurally unfindable.
  statement {
    sid       = "SchedulingBookingActionRead"
    actions   = ["dynamodb:GetItem"]
    resources = [var.booking_table_arn]
  }

  # §E13b AppointmentType/RoutingPolicy write API (admin-only). Query (list by
  # tenantId PK), GetItem (FK check / RR-state-preserving PATCH reads ALL_NEW),
  # PutItem (create), UpdateItem (patch). NO DeleteItem (delete is v2). Base
  # tables ONLY — these tables have no GSI (canonical §18). The write API never
  # mutates bookings and never sets the commit-owned round-robin state.
  statement {
    sid = "SchedulingConfigWrite"
    actions = [
      "dynamodb:Query",
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]
    resources = [
      var.appointment_type_table_arn,
      var.routing_policy_table_arn,
    ]
  }

  # G2/E14 scheduling notification-template overrides. ADA reads via Query (GET
  # list) and writes via UpdateItem (PATCH upsert-merge of subject/body_text/
  # body_html). No GetItem/PutItem/DeleteItem needed; base table only (no GSI).
  statement {
    sid = "SchedulingNotifTemplateWrite"
    actions = [
      "dynamodb:Query",
      "dynamodb:UpdateItem",
    ]
    resources = [
      var.scheduling_notif_template_table_arn,
    ]
  }

  # G3/E0: the init-token mint reads the OAuth state-signing key to state.sign the
  # init tokens the E16 connect UI uses. GetSecretValue only, on the single
  # reserved _state-signing-key secret (NOT the per-coordinator OAuth secrets,
  # NOT the platform app secret — ADA only signs, it never reads/writes those).
  statement {
    sid       = "OAuthStateSigningKeyRead"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.oauth_state_signing_secret_arn]
  }

  # G8 (E13 D3 warnings): the GET /team/members calendar_connected flag reads each staff member's
  # per-coordinator OAuth secret `status` (the SAME signal §B7 consults). GetSecretValue only, on
  # the per-coordinator secrets, FENCED OFF the reserved `_*` (the _state-signing-key, read via
  # OAuthStateSigningKeyRead above). Mirrors the Calendar_Event_Consumer SecretsReadCoordinatorOAuthStatus
  # fence (both ARN + short-name patterns, since callers pass the short SecretId), + the per-tenant
  # `*/_*` fence (so any future per-tenant reserved key is also excluded — G8 audit SR-2).
  #
  # ⚠ OPERATOR-ACCEPTED RISK (G8 audit B1, 2026-06-09): GetSecretValue returns the FULL secret
  # (Google OAuth refresh/access tokens), not just `status` — so this grant gives ADA the CAPABILITY
  # to read coordinator OAuth tokens, though the code uses only `status`. Accepted for the v1 pilot
  # with this fence. TRACKED v2 follow-up: have the OAuth connect/revoke flow stamp `connected_at` on
  # the employee registry → ADA reads the registry field → this statement is REMOVED entirely.
  statement {
    sid       = "SchedulingOAuthStatusRead"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/oauth/*"]
    condition {
      test     = "StringNotLike"
      variable = "secretsmanager:SecretId"
      values = [
        "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/oauth/_*",
        "arn:aws:secretsmanager:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:secret:picasso/scheduling/oauth/*/_*",
        "picasso/scheduling/oauth/_*",
        "picasso/scheduling/oauth/*/_*",
      ]
    }
  }

  # B5 audit: Tier-3 archive read path. Tightened from the hand-attached
  # ada-archive-read policy to require the tenant-partition prefix shape
  # — sessions/tenant=*/ — so any code bug that uses a flat legacy prefix
  # (e.g. sessions/year=...) is IAM-denied. True per-tenant IAM (session
  # policy per request) is Phase 6.
  statement {
    sid       = "ArchiveList"
    actions   = ["s3:ListBucket"]
    resources = [var.archive_bucket_arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["sessions/tenant=*", "sessions/tenant=*/"]
    }
  }

  statement {
    sid       = "ArchiveGet"
    actions   = ["s3:GetObject"]
    resources = ["${var.archive_bucket_arn}/sessions/tenant=*/*"]
  }

  # Attribution Wave-1 (C4b, C5, C6): read-only on the two attribution tables.
  # Renders ZERO statements when the ARNs are not wired (default "").
  dynamic "statement" {
    for_each = var.entry_points_table_arn != "" ? [1] : []
    content {
      sid     = "AttributionEntryPointsRead"
      actions = ["dynamodb:Query", "dynamodb:GetItem"]
      resources = [
        var.entry_points_table_arn,
      ]
    }
  }

  dynamic "statement" {
    for_each = var.attribution_aggregates_table_arn != "" ? [1] : []
    content {
      sid     = "AttributionAggregatesRead"
      actions = ["dynamodb:Query", "dynamodb:GetItem"]
      resources = [
        var.attribution_aggregates_table_arn,
      ]
    }
  }

  # C4b: ADA proxies POST /attribution/entry-points to Attribution_Mint_Service
  # via direct Lambda invoke (same-account 525->525, no resource-policy entry
  # needed on the mint function). Renders ZERO statements when mint_function_arn
  # is "" (default) -- matches the tenant_purge / booking_commit pattern above.
  dynamic "statement" {
    for_each = var.mint_function_arn != "" ? [1] : []
    content {
      sid       = "InvokeMintService"
      actions   = ["lambda:InvokeFunction"]
      resources = [var.mint_function_arn]
    }
  }

  # Defense-in-depth: never write to the prod tenant-config bucket even
  # if an allow rule above is later widened by accident (Plan Security F4).
  statement {
    sid       = "DenyProdConfigBucketWrites"
    effect    = "Deny"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::myrecruiter-picasso/*"]
  }

  # Defense-in-depth: never touch any DynamoDB table in the prod account
  # even if an allow rule resolves a cross-account ARN by mistake. Account
  # boundary is the primary control; this is belt-and-braces.
  statement {
    sid       = "DenyAllProdDynamoDB"
    effect    = "Deny"
    actions   = ["dynamodb:*"]
    resources = ["arn:aws:dynamodb:*:614056832592:*"]
  }

  # Super-admin tenant-purge trigger: invoke the picasso-pii-tenant-purge-staging
  # Lambda from POST /admin/tenants/{id}/purge. Scoped to the single function
  # ARN; renders ZERO statements when tenant_purge_function_arn == "" (default).
  # Same-account (525->525) identity grant — no resource-policy entry needed on
  # the purge function. Design: tenant-purge-ui-trigger-design.md §5.
  dynamic "statement" {
    for_each = var.tenant_purge_function_arn != "" ? [1] : []
    content {
      sid       = "InvokeTenantPurge"
      actions   = ["lambda:InvokeFunction"]
      resources = [var.tenant_purge_function_arn]
    }
  }

  # G6/E12 booking actions: the cancel + reschedule-link handlers proxy the side-effect to
  # Booking_Commit_Handler's scheduling_mutate executor (events.delete / §B4 token mint + notify).
  # Same-account (525->525) identity grant, scoped to the single BCH function ARN. Renders ZERO
  # statements when booking_commit_function_arn == "" (default) — staging-only wiring.
  dynamic "statement" {
    for_each = var.booking_commit_function_arn != "" ? [1] : []
    content {
      sid       = "InvokeBookingCommit"
      actions   = ["lambda:InvokeFunction"]
      resources = [var.booking_commit_function_arn]
    }
  }
}

resource "aws_iam_role_policy" "exec" {
  name   = "exec-policy"
  role   = aws_iam_role.exec.id
  policy = data.aws_iam_policy_document.exec.json
}

# ------------------------------------------------------------------
# Log group
# ------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days
}

# ------------------------------------------------------------------
# Placeholder code zip (Python). Real code via Phase 4.2 lambda repo PR
# (deploy-staging.yml CI matrix entry).
# ------------------------------------------------------------------

data "archive_file" "placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "this" {
  function_name = var.function_name
  role          = aws_iam_role.exec.arn
  runtime       = "python3.13"
  handler       = "lambda_function.lambda_handler"
  memory_size   = 512
  timeout       = 60
  architectures = ["x86_64"]

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT      = "staging"
      S3_CONFIG_BUCKET = var.config_bucket_name
      # get_tenant_hash() reads tenant_id->tenant_hash mappings from
      # MAPPINGS_BUCKET (mappings/ prefix). Code default is the PROD bucket
      # `myrecruiter-picasso`; unset in staging it fell back to prod ->
      # s3:ListBucket AccessDenied -> /forms/summary 500 "Could not resolve
      # tenant configuration". Pin it to the staging config bucket (same bucket
      # as S3_CONFIG_BUCKET; the role already grants ListBucket mappings/* there).
      MAPPINGS_BUCKET            = var.config_bucket_name
      JWT_SECRET_KEY_NAME        = var.jwt_secret_name
      CLERK_SECRET_KEY_SECRET_ID = var.clerk_secret_name
      CLERK_JWKS_URL             = var.clerk_jwks_url
      TENANT_REGISTRY_TABLE      = var.tenant_registry_table_name
      SESSION_SUMMARIES_TABLE    = var.session_summaries_table_name
      SESSION_EVENTS_TABLE       = var.session_events_table_name
      FORM_SUBMISSIONS_TABLE     = var.form_submissions_table_name
      NOTIFICATION_EVENTS_TABLE  = var.notification_events_table_name
      NOTIFICATION_SENDS_TABLE   = var.notification_sends_table_name
      BILLING_EVENTS_TABLE       = var.billing_events_table_name
      EMPLOYEE_REGISTRY_TABLE    = var.employee_registry_table_name
      AUDIT_TABLE_NAME           = var.audit_table_name
      # §E7 GET /scheduling/bookings reader. Code default is the BARE name
      # `picasso-booking`; staging's table is still env-suffixed, so pin it.
      BOOKING_TABLE = var.booking_table_name
      # §E13b AppointmentType/RoutingPolicy write API. Code defaults are the BARE
      # names (picasso-appointment-type / picasso-routing-policy); staging tables
      # are env-suffixed, so pin them — else the write API reads/writes the wrong
      # (nonexistent) table. Mirrors the candidate-resolver.js read-side env.
      APPOINTMENT_TYPE_TABLE     = var.appointment_type_table_name
      ROUTING_POLICY_TABLE       = var.routing_policy_table_name
      SCHED_NOTIF_TEMPLATE_TABLE = var.scheduling_notif_template_table_name
      OAUTH_FUNCTION_URL         = var.oauth_function_url
      # G6/E12 booking actions proxy to BCH's scheduling_mutate executor (cancel + reschedule-link).
      BOOKING_COMMIT_FUNCTION_NAME = var.booking_commit_function_name
      # G8: pin the per-coordinator OAuth secret prefix so the calendar_connected read path + the
      # SchedulingOAuthStatusRead IAM fence can never silently diverge (code default matches).
      OAUTH_SECRET_PATH_PREFIX = "picasso/scheduling/oauth"
      USE_DYNAMO_CACHE         = "false"
      # Attribution Wave-1 (C4b, C5, C6)
      ENTRY_POINTS_TABLE           = var.entry_points_table_name
      ATTRIBUTION_AGGREGATES_TABLE = var.attribution_aggregates_table_name
      MINT_FUNCTION_NAME           = var.mint_function_name
      # Plan Security F8: restrict test-send endpoints to recipients whose
      # email domain is in this comma-list. Without it, an authenticated
      # admin could trigger a test send to any address (including real
      # customer emails) by hitting the dashboard's notification preview.
      # Code default (unset) is no restriction; staging sets it explicitly.
      TEST_SEND_ALLOWED_DOMAINS = "myrecruiter.ai,staging.myrecruiter.ai"
      # Route outbound SES through the staging-owned identity. The domain
      # `staging.myrecruiter.ai` was verified in SES on 2026-05-10 (TXT +
      # 3 DKIM CNAMEs added at GoDaddy). Code default is notify@myrecruiter.ai
      # (verified in prod SES); this override keeps prod identity out of
      # staging traffic.
      SES_SENDER_ADDRESS = "notify@staging.myrecruiter.ai"
    }
  }

  tracing_config {
    mode = "PassThrough"
  }

  lifecycle {
    ignore_changes = [filename, source_code_hash]
  }

  depends_on = [aws_cloudwatch_log_group.lambda, aws_iam_role_policy.exec]
}

# ------------------------------------------------------------------
# Function URL — AuthType NONE (CloudFront fronts; JWT auth in handler).
# Buffered invoke (request/response API, not streaming).
# ------------------------------------------------------------------

resource "aws_lambda_function_url" "this" {
  function_name      = aws_lambda_function.this.function_name
  authorization_type = "NONE"
  invoke_mode        = "BUFFERED"

  cors {
    allow_credentials = false
    # OPTIONS (7 chars) excluded: Lambda Function URL CORS API enforces a
    # 6-char-max-per-member constraint on allow_methods, and CORS preflight
    # (OPTIONS) is handled implicitly by the Function URL — no need to list
    # it here. Surfaced via apply failure on PR #81's first run.
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE"]
    allow_origins = [
      "https://d2t5sxdcthprgd.cloudfront.net",
      "http://localhost:5173",
    ]
    allow_headers = ["authorization", "content-type"]
    max_age       = 86400
  }
}

# ──────────────────────────────────────────────────────────────────────
# # MANUAL STEP REQUIRED (one-time, post-apply)
# Two resource-policy statements are required for a public Function URL:
#
#   1. FunctionURLAllowPublicAccess — Action: lambda:InvokeFunctionUrl
#      Auto-created by AWS when the URL is created with AuthType=NONE.
#
#   2. FunctionURLAllowInvokeAction — Action: lambda:InvokeFunction
#      Condition: lambda:InvokedViaFunctionUrl=true.
#      AWS does NOT auto-create this. Without it, the URL boundary lets
#      the request through, then AWS rejects at invoke time with HTTP
#      403 AccessDeniedException because principal `*` can't
#      InvokeFunction. The terraform aws_lambda_permission resource
#      cannot create this statement — function_url_auth_type only
#      works with action=lambda:InvokeFunctionUrl, and the AWS
#      add-permission API has no flag to set InvokedViaFunctionUrl=true
#      for InvokeFunction. update-function-url-config does NOT trigger
#      AWS to add it. This was verified empirically against the staging
#      account 2026-05-10.
#
# After this module first applies cleanly, do exactly once per function:
#   AWS Console → Lambda → ${function_name} → Configuration →
#   Function URL → Edit → Save (no changes).
#
# AWS's console-side logic adds statement (2). Verify with:
#   aws lambda get-policy --function-name ${function_name} \
#     --profile myrecruiter-staging | jq -r '.Policy | fromjson |
#     .Statement[] | "\(.Sid): \(.Action)"'
#
# Should print BOTH FunctionURLAllowPublicAccess (InvokeFunctionUrl)
# AND FunctionURLAllowInvokeAction (InvokeFunction).
# ──────────────────────────────────────────────────────────────────────

# ------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------

output "function_name" {
  value = aws_lambda_function.this.function_name
}

output "function_arn" {
  value = aws_lambda_function.this.arn
}

output "role_arn" {
  value = aws_iam_role.exec.arn
}

output "function_url" {
  value = aws_lambda_function_url.this.function_url
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.lambda.name
}
