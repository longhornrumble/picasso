# Attribution_Mint_Service -- Wave-1 attribution Lambda (WS-B).
#
# Mints entry-point registry records (picasso-entry-points), calls Dub.co to
# create tracked short links, and returns the mint payload to the caller (ADA
# via C4b direct invoke). C4 contract governs Dub API behaviour; C3 governs
# registry record shape.
#
# Real code deploys via lambda-repo CI matrix; this module ships a placeholder
# zip for first apply, then ignores code-side changes via
# lifecycle { ignore_changes = [filename, source_code_hash] }.

# ------------------------------------------------------------------
# Inputs
# ------------------------------------------------------------------

variable "entry_points_table_arn" {
  description = "ARN of picasso-entry-points. Mint writes registry records (PutItem/GetItem/Query)."
  type        = string
}

variable "entry_points_table_name" {
  description = "Name of picasso-entry-points (for ENTRY_POINTS_TABLE env var)."
  type        = string
}

variable "dub_secret_arn" {
  description = "ARN of picasso/staging/dub/api-key in Secrets Manager."
  type        = string
}

variable "dub_secret_name" {
  description = "Name of the Dub secret (for DUB_SECRET_NAME env var)."
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 30
}

# ------------------------------------------------------------------
# Common data sources
# ------------------------------------------------------------------

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ------------------------------------------------------------------
# IAM -- dedicated execution role (never shared -- hard repo rule)
# ------------------------------------------------------------------

variable "dub_workspace_id" {
  description = "Dub workspace id (ws_...) appended as ?workspaceId= - required for personal-type Dub API keys, harmless with workspace keys. Empty disables."
  type        = string
  default     = ""
}

resource "aws_iam_role" "exec" {
  name                 = "Attribution_Mint_Service-role"
  permissions_boundary = var.permissions_boundary_arn
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  description          = "Execution role for Attribution_Mint_Service. Wave-1 attribution."
}

data "aws_iam_policy_document" "exec" {
  statement {
    sid     = "Logs"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/Attribution_Mint_Service:*",
    ]
  }

  statement {
    sid     = "EntryPointsReadWrite"
    actions = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query", "dynamodb:UpdateItem"]
    resources = [
      var.entry_points_table_arn,
    ]
  }

  statement {
    sid       = "DubSecretRead"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = ["${var.dub_secret_arn}*"]
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
  name              = "/aws/lambda/Attribution_Mint_Service"
  retention_in_days = var.log_retention_days
}

# ------------------------------------------------------------------
# Placeholder code zip (Node.js). Real code via lambda-repo CI.
# ------------------------------------------------------------------

data "archive_file" "placeholder" {
  type        = "zip"
  source_dir  = "${path.module}/placeholder"
  output_path = "${path.module}/placeholder.zip"
}

resource "aws_lambda_function" "this" {
  function_name = "Attribution_Mint_Service"
  role          = aws_iam_role.exec.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  memory_size   = 256
  timeout       = 30
  architectures = ["x86_64"]

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  environment {
    variables = {
      ENVIRONMENT        = "staging"
      ENTRY_POINTS_TABLE = var.entry_points_table_name
      DUB_SECRET_NAME    = var.dub_secret_name
      DUB_WORKSPACE_ID   = var.dub_workspace_id
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

variable "permissions_boundary_arn" {
  description = "ARN of the picasso-workload-boundary permission boundary (module.iam_workload_boundary). Caps this role's effective permissions to the intersection with the boundary. Null = no boundary (keeps the module usable standalone)."
  type        = string
  default     = null
  validation {
    condition     = var.permissions_boundary_arn == null || can(regex("^arn:aws:iam::[0-9]{12}:policy/", var.permissions_boundary_arn))
    error_message = "permissions_boundary_arn must be null or a valid IAM policy ARN."
  }
}
