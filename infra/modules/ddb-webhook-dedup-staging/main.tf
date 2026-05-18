# Meta Messenger project — staging-account twin of picasso-webhook-dedup-staging.
#
# Webhook idempotency table: Meta_Webhook_Handler PutItem's the inbound message
# `mid` (with a short `ttl`) before async-invoking Meta_Response_Processor, and
# skips processing if the `mid` is already present. Meta retries failed webhook
# deliveries for up to 24h — this prevents double-processing.
#
# Schema dumped from prod-account (614056832592) original 2026-05-18:
#   - mid (S) HASH only
#   - TTL attribute `ttl` ENABLED
#   - PAY_PER_REQUEST
#
# Ephemeral high-churn table; PITR enabled to match the uniform staging-account
# DDB convention (cost is negligible at PAY_PER_REQUEST idle).

resource "aws_dynamodb_table" "webhook_dedup" {
  name         = "picasso-webhook-dedup-staging"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "mid"

  attribute {
    name = "mid"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-webhook-dedup-staging"
  }
}

output "table_name" {
  value = aws_dynamodb_table.webhook_dedup.name
}

output "table_arn" {
  value = aws_dynamodb_table.webhook_dedup.arn
}
