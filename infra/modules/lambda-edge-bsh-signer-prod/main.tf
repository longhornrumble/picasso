# =============================================================================
# Remedy A (#435) — PRODUCTION Lambda@Edge SigV4 signer for the BSH streaming
# Function URL. The prod mirror of lambda-edge-bsh-signer-staging (proven +
# enforced on staging 2026-06-06).
#
# An origin-request Lambda@Edge function that SigV4-signs every /stream request
# (service=lambda, incl. the POST body hash) using its execution-role creds, so
# the prod BSH Function URL can enforce authorization_type=AWS_IAM and reject any
# unsigned direct request — closing the #435 public bypass at the IAM layer.
# This replaces the OAC approach, which cannot sign POST bodies (CloudFront OAC →
# InvalidSignatureException on POST; proven on staging 2026-06-06). The signer
# (src/index.js) is dependency-free (node:crypto) and BYTE-IDENTICAL to the
# staging signer that is live + enforcing. See docs/runbooks/remedy-a-prod-cutover.md.
#
# Constraints honored: Lambda@Edge functions carry NO env vars (creds come from
# the runtime), publish=true (a qualified version ARN is required for the CF
# association), us-east-1 (root provider), trust includes edgelambda.amazonaws.com.
#
# Naming: BARE name per the prod-IaC convention (env carried via provider
# default_tags Environment=production, NOT a name suffix). The staging twin keeps
# its `-staging` suffix (predates the strict convention); prod uses the bare name.
# =============================================================================

variable "bsh_function_arn" {
  description = "ARN of the prod BSH streaming function this edge signer is allowed to invoke (lambda:InvokeFunctionUrl). Same-account (614) identity grant on the L@E role."
  type        = string
}

variable "function_name" {
  description = "Name of the edge signer function (bare per prod convention)."
  type        = string
  default     = "picasso-bsh-edge-signer"
}

data "archive_file" "signer" {
  type        = "zip"
  source_dir  = "${path.module}/src"
  output_path = "${path.module}/signer.zip"
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com", "edgelambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "this" {
  name               = "${var.function_name}-role"
  assume_role_policy = data.aws_iam_policy_document.trust.json
}

resource "aws_iam_role_policy_attachment" "basic" {
  role       = aws_iam_role.this.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# The signer identity: allow the L@E role to invoke the prod BSH Function URL under IAM.
resource "aws_iam_role_policy" "invoke_bsh_url" {
  name = "InvokeBshFunctionUrl"
  role = aws_iam_role.this.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "InvokeBshFunctionUrl"
      Effect   = "Allow"
      Action   = "lambda:InvokeFunctionUrl"
      Resource = var.bsh_function_arn
    }]
  })
}

resource "aws_lambda_function" "this" {
  function_name    = var.function_name
  role             = aws_iam_role.this.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.signer.output_path
  source_code_hash = data.archive_file.signer.output_base64sha256
  memory_size      = 128
  timeout          = 5    # L@E origin-request max is 30s; signing is sub-ms
  publish          = true # Lambda@Edge requires a qualified version ARN
}

output "qualified_arn" {
  description = "Versioned ARN of the signer, for the CloudFront lambda_function_association (origin-request)."
  value       = aws_lambda_function.this.qualified_arn
}
