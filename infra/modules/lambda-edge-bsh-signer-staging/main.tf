# =============================================================================
# Remedy A (#435) — Lambda@Edge SigV4 signer for the BSH streaming Function URL.
#
# An origin-request Lambda@Edge function that SigV4-signs every /stream request
# (service=lambda, incl. the POST body hash) using its execution-role creds, so
# the Function URL can enforce authorization_type=AWS_IAM and reject any
# unsigned direct request. This replaces the OAC approach, which cannot sign
# POST bodies (CloudFront OAC → InvalidSignatureException on POST; proven on
# staging 2026-06-06). The signer (src/index.js) is dependency-free (node:crypto)
# and was validated locally against the live staging AWS_IAM Function URL (200 +
# SSE). See docs/runbooks/remedy-a-cloudfront-oac-iam.md.
#
# Constraints honored: Lambda@Edge functions carry NO env vars (creds come from
# the runtime), publish=true (a qualified version ARN is required for the CF
# association), us-east-1 (root provider), trust includes edgelambda.amazonaws.com.
# =============================================================================

variable "bsh_function_arns" {
  description = "ARNs of the BSH streaming functions this edge signer is allowed to invoke (lambda:InvokeFunctionUrl). Same-account identity grant on the L@E role. Plural since task 2.5 Wave 1b: both the suffixed and bare-named BSH instances are listed during the de-suffix transition; drops back to one entry in Wave 4."
  type        = list(string)
}

variable "function_name" {
  description = "Name of the edge signer function."
  type        = string
  default     = "picasso-bsh-edge-signer-staging"
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

# The signer identity: allow the L@E role to invoke the BSH Function URL under IAM.
#
# lambda:InvokeFunction is REQUIRED alongside InvokeFunctionUrl in this
# account (2.5 Wave-2 incident, 2026-06-10): AWS_IAM Function URL auth here
# evaluates a dual permission. For 4 days the check was silently satisfied
# by the legacy resource-policy statement FunctionURLAllowInvokeAction
# (Principal *, lambda:InvokeFunction, InvokedViaFunctionUrl=true) left on
# the suffixed BSH from its AuthType NONE era — a console "Function URL >
# Edit > Save" reconciliation stripped it, and the bare BSH never had it
# (Terraform cannot express that resource statement; see the MANUAL STEP
# comment in lambda-bedrock-handler-staging). Granting InvokeFunction
# identity-side (scoped to the BSH ARNs) satisfies the check without any
# resource policy and survives function recreation. NOTE: prod's signer
# works with InvokeFunctionUrl alone — prod is the SCP-exempt management
# account; this account's evaluation demands both.
resource "aws_iam_role_policy" "invoke_bsh_url" {
  name = "InvokeBshFunctionUrl"
  role = aws_iam_role.this.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "InvokeBshFunctionUrl"
      Effect = "Allow"
      Action = [
        "lambda:InvokeFunctionUrl",
        "lambda:InvokeFunction",
      ]
      Resource = var.bsh_function_arns
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
