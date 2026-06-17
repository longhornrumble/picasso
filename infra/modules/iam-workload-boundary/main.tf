# ─────────────────────────────────────────────────────────────────────────────
# Workload Blast-Radius Permission Boundary (Phase 1)
#
# A permission boundary is a managed policy attached to a workload role that caps
# the role's EFFECTIVE permissions to the INTERSECTION of (its identity policies)
# and (this boundary). It is a ceiling, not a grant -- it never adds permission,
# only removes. The ceiling holds even if a role's identity policy is later
# widened or a stolen credential tries to escalate: "set the radius before
# anything goes wrong."
#
# Shape = broad Allow on the data-plane services workloads actually use (so the
# boundary never starves a legitimate grant) + explicit Deny on the blast-radius
# amplifiers. Explicit Deny always overrides the broad Allow.
#
# The Allow-service set is the machine-extracted union of every action across all
# staging workload role policies (dynamodb/kms/logs/secretsmanager/s3/sqs/sns/
# xray/scheduler/bedrock/bedrock-agent-runtime/ses/cloudwatch + lambda:Invoke* +
# sts:GetCallerIdentity/AssumeRole + iam:PassRole). A missed service would break a
# Lambda at runtime, so the union is generated, not hand-listed.
#
# NOT attached to: Lambda@Edge roles (region-lock is incompatible with @Edge's
# multi-region replication) or deploy/break-glass roles (they need IAM write).
# ─────────────────────────────────────────────────────────────────────────────

variable "boundary_name" {
  type        = string
  default     = "picasso-workload-boundary"
  description = "Name of the managed permission-boundary policy."
}

variable "account_id" {
  type        = string
  description = "This account's ID. Cross-account resource access (other than the sanctioned KB-retriever AssumeRole hop) is denied."
}

variable "home_region" {
  type        = string
  default     = "us-east-1"
  description = "The single region workloads operate in. Action outside it is denied (global services carved out)."
}

variable "kb_retriever_role_arns" {
  type        = list(string)
  default     = []
  description = "Sanctioned cross-account sts:AssumeRole targets (the prod KB-retriever role). The ONLY AssumeRole the boundary permits; every other AssumeRole is denied by omission."
}

variable "tags" {
  type    = map(string)
  default = {}
}

data "aws_iam_policy_document" "boundary" {

  # ---- ALLOW: data-plane services workloads actually use (the ceiling's positive
  # space). Broad per-service; the Deny statements below carve the blast-radius
  # amplifiers back out (explicit Deny wins).
  statement {
    sid    = "AllowDataPlaneServices"
    effect = "Allow"
    actions = [
      "dynamodb:*",
      "kms:*",
      "logs:*",
      "secretsmanager:*",
      "s3:*",
      "sqs:*",
      "sns:*",
      "xray:*",
      "scheduler:*",
      "bedrock:*",
      "bedrock-agent-runtime:*",
      "ses:*",
      "cloudwatch:*",
      "lambda:InvokeFunction",
      "lambda:InvokeFunctionUrl",
      "sts:GetCallerIdentity",
      "iam:PassRole",
    ]
    # resource = "*" is intentional: this is a shared ceiling, not a per-Lambda
    # grant. Narrowing to ARN patterns would require per-role customization and
    # defeats the single-boundary design -- the Deny statements below do the
    # blast-radius work. (lambda:GetFunction* deliberately NOT allowed: no workload
    # reads function config at runtime, and GetFunction leaks env vars -- omission
    # is tighter than a Deny.)
    resources = ["*"]
  }

  # ---- ALLOW (scoped): the ONE sanctioned cross-account hop -- sts:AssumeRole to
  # the prod KB-retriever role only. Kept resource-scoped so AssumeRole to any
  # other role is denied by omission.
  dynamic "statement" {
    for_each = length(var.kb_retriever_role_arns) > 0 ? [1] : []
    content {
      sid       = "AllowAssumeKbRetrieverOnly"
      effect    = "Allow"
      actions   = ["sts:AssumeRole"]
      resources = var.kb_retriever_role_arns
    }
  }

  # ===== DENY CLASSES (explicit Deny overrides the broad Allow above) =====

  # (1) Region lock -- deny everything outside the home region. Global services
  # (iam/sts/cloudfront/route53/organizations/support) have no regional endpoint
  # and are carved out via not_actions so PassRole/AssumeRole/GetCallerIdentity
  # are never region-blocked.
  statement {
    sid    = "DenyOutsideHomeRegion"
    effect = "Deny"
    not_actions = [
      "iam:*",
      "sts:*",
      "cloudfront:*",
      "route53:*",
      "organizations:*",
      "support:*",
    ]
    resources = ["*"]
    condition {
      test     = "StringNotEquals"
      variable = "aws:RequestedRegion"
      values   = [var.home_region]
    }
  }

  # (2) Cross-account containment -- deny resource access in any account other than
  # self. not_actions carves out global/identity services and sts (the sanctioned
  # AssumeRole hop to the prod KB retriever).
  #
  # The two conditions are ANDed and deny ONLY when aws:ResourceAccount is PRESENT
  # AND foreign. This precision matters: a negated operator (StringNotEquals) by
  # itself MATCHES when the key is absent (absent != self), and ...IfExists is
  # the same on absent -- both would deny AWS-owned resources that carry no account
  # (e.g. bedrock foundation-models => would break BSH model invocation; a canary
  # simulation caught this). The `Null = false` guard means "key must be present",
  # so an absent aws:ResourceAccount short-circuits the AND to false (no deny). The
  # exfil-relevant data services (dynamodb/s3/secretsmanager/kms/sqs/sns) DO populate
  # the key, so a foreign account value still trips the Deny.
  statement {
    sid    = "DenyCrossAccountResourceAccess"
    effect = "Deny"
    not_actions = [
      "iam:*",
      "sts:*",
      "cloudfront:*",
      "route53:*",
      "organizations:*",
    ]
    resources = ["*"]
    condition {
      test     = "Null"
      variable = "aws:ResourceAccount"
      values   = ["false"]
    }
    condition {
      test     = "StringNotEquals"
      variable = "aws:ResourceAccount"
      values   = [var.account_id]
    }
  }

  # (3) IAM self-protection -- a compromised workload cannot rewrite IAM to widen
  # itself, nor strip/swap its own permission boundary. Scoped to roles AND
  # policies so it can't CreatePolicy + AttachRolePolicy around the Deny.
  statement {
    sid    = "DenyIamWriteOnRolesAndPolicies"
    effect = "Deny"
    actions = [
      "iam:CreateRole",
      "iam:CreatePolicy",
      "iam:CreatePolicyVersion",
      "iam:PutRolePolicy",
      "iam:PutUserPolicy",
      "iam:PutGroupPolicy",
      "iam:AttachRolePolicy",
      "iam:AttachUserPolicy",
      "iam:AttachGroupPolicy",
      "iam:DetachRolePolicy",
      "iam:DetachUserPolicy",
      "iam:DetachGroupPolicy",
      "iam:DeleteRole",
      "iam:DeleteRolePolicy",
      "iam:DeletePolicy",
      "iam:DeletePolicyVersion",
      "iam:UpdateRole",
      "iam:UpdateAssumeRolePolicy",
      "iam:UpdateRoleDescription",
      "iam:PutRolePermissionsBoundary",
      "iam:DeleteRolePermissionsBoundary",
      # SR-2 (review 2026-06-16): a compromised role can't mint a service-linked
      # role, nor retag roles (role tags feed org-level SCP conditions). No
      # workload uses these -- pure Deny, zero legit impact.
      "iam:CreateServiceLinkedRole",
      "iam:DeleteServiceLinkedRole",
      "iam:TagRole",
      "iam:UntagRole",
    ]
    resources = [
      "arn:aws:iam::*:role/*",
      "arn:aws:iam::*:policy/*",
    ]
  }

  # (3b) PassRole only to the two services workloads legitimately hand a role to:
  # lambda (function exec roles) and scheduler (EventBridge Scheduler target role,
  # passed by booking-commit on every scheduler:CreateSchedule).
  statement {
    sid       = "DenyPassRoleExceptSanctionedServices"
    effect    = "Deny"
    actions   = ["iam:PassRole"]
    resources = ["*"]
    condition {
      test     = "StringNotEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com", "scheduler.amazonaws.com"]
    }
  }

  # (4) Observability / audit / key tamper -- don't let a compromised workload
  # blind the detective layer or destroy audit trails / keys.
  statement {
    sid    = "DenyObservabilityAndKeyTamper"
    effect = "Deny"
    actions = [
      "cloudtrail:StopLogging",
      "cloudtrail:DeleteTrail",
      "cloudtrail:UpdateTrail",
      "cloudtrail:PutEventSelectors",
      "guardduty:DeleteDetector",
      "guardduty:DisassociateFromMasterAccount",
      "guardduty:UpdateDetector",
      "guardduty:DeleteMembers",
      "config:DeleteConfigurationRecorder",
      "config:StopConfigurationRecorder",
      "config:DeleteDeliveryChannel",
      "logs:DeleteLogGroup",
      "dynamodb:DeleteTable",
      "kms:ScheduleKeyDeletion",
      "kms:DisableKey",
      "kms:DeleteAlias",
    ]
    resources = ["*"]
  }

  # (5) Code self-implant -- no workload mutates Lambda code/config at runtime;
  # deny it so a compromised role can't turn a function into a persistent implant
  # or rewrite its own env vars.
  statement {
    sid    = "DenyLambdaSelfImplant"
    effect = "Deny"
    actions = [
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:AddPermission",
      "lambda:AddLayerVersionPermission",
    ]
    resources = ["*"]
  }

  # (6) Bulk / channel exfil amplifiers -- bulk table export and Bedrock
  # control-plane creation. Cross-account S3 PutObject is already covered by (2).
  # SES from-identity scoping is deferred (sends are identity/* across multiple
  # platform senders in a single account; see PR notes / Phase-1 honest residual).
  statement {
    sid    = "DenyBulkExfilAndBedrockControlPlane"
    effect = "Deny"
    actions = [
      "dynamodb:ExportTableToPointInTime",
      "bedrock:CreateAgent",
      "bedrock:CreateKnowledgeBase",
      "bedrock:CreateModelCustomizationJob",
      "bedrock:CreateDataSource",
      # CONCERN-5 (review 2026-06-16): destructive / poisoning control-plane verbs.
      # DeleteKnowledgeBase/DeleteAgent destroy RAG infra; StartIngestionJob +
      # UpdateKnowledgeBase/UpdateDataSource could re-point a KB at a poisoned
      # source. No workload mutates Bedrock control-plane at runtime (only
      # InvokeModel + agent-runtime Retrieve).
      "bedrock:DeleteKnowledgeBase",
      "bedrock:DeleteAgent",
      "bedrock:DeleteDataSource",
      "bedrock:StartIngestionJob",
      "bedrock:UpdateKnowledgeBase",
      "bedrock:UpdateAgent",
      "bedrock:UpdateDataSource",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "boundary" {
  name        = var.boundary_name
  description = "Workload blast-radius permission boundary (Phase 1): broad data-plane Allow capped by region-lock, cross-account containment, IAM self-protection, observability/key-tamper, lambda self-implant, and bulk-exfil/bedrock-control-plane Deny classes. Ceiling only; never grants."
  policy      = data.aws_iam_policy_document.boundary.json
  tags        = var.tags
}

output "arn" {
  value       = aws_iam_policy.boundary.arn
  description = "Attach as permissions_boundary on every workload role."
}

output "name" {
  value = aws_iam_policy.boundary.name
}
