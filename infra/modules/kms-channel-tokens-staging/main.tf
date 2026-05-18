# Meta Messenger project — KMS CMK for per-tenant Page access-token encryption.
#
# Twin of the prod-account (614) `alias/picasso-channel-tokens` CUSTOMER CMK
# (SYMMETRIC_DEFAULT / ENCRYPT_DECRYPT). Two Lambdas use it:
#   - Meta_OAuth_Handler:      Encrypt + GenerateDataKey (stores Page tokens)
#   - Meta_Response_Processor: Decrypt (reads Page tokens to call the Send API)
#
# The key policy is ROOT-ENABLE-ONLY (no role principals). Access is granted
# instead via each Lambda's IAM exec policy scoped to this key ARN — this is
# the deliberate pattern to avoid the circular dependency that listing role
# ARNs in the key policy would create (key policy ← role ARNs; roles live in
# the lambda-meta-staging module which would then need this key first).

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "channel_tokens_kms" {
  statement {
    sid     = "EnableRootAccount"
    actions = ["kms:*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
    resources = ["*"]
  }
}

resource "aws_kms_key" "channel_tokens" {
  description             = "CMK for Meta Messenger per-tenant Page access tokens (staging twin of prod alias/picasso-channel-tokens)"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  policy                  = data.aws_iam_policy_document.channel_tokens_kms.json
}

resource "aws_kms_alias" "channel_tokens" {
  name          = "alias/picasso-channel-tokens"
  target_key_id = aws_kms_key.channel_tokens.key_id
}

output "key_arn" {
  value = aws_kms_key.channel_tokens.arn
}

# The Lambda code reads KMS_KEY_ID as the alias string (default
# `alias/picasso-channel-tokens`) — exposed so the lambda module sets env
# explicitly rather than relying on the code default.
output "key_alias" {
  value = aws_kms_alias.channel_tokens.name
}
