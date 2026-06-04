# Meta Messenger project — staging-account twin of picasso-channel-mappings.
#
# Source-of-truth schema dumped from the prod-account (614056832592) original
# 2026-05-18 via `aws dynamodb describe-table`:
#   - PK (S) HASH / SK (S) RANGE  e.g. PK=PAGE#<pageId>, SK=CHANNEL#<type>
#   - GSI TenantIndex: tenantId (S) HASH / channelType (S) RANGE, projection ALL
#     (Meta_OAuth_Handler "list channels for a tenant" route queries this)
#   - TTL attribute `ttl` ENABLED
#   - PAY_PER_REQUEST
#
# DEVIATION FROM 614 (intentional): PITR is ENABLED here. The 614 original had
# PITR DISABLED, but this is the one Meta table holding DURABLE data (per-tenant
# Page access tokens, KMS-encrypted). Every other staging-account DDB module
# enables PITR (uniform per-environment rule); standardising closes the 614 gap
# rather than faithfully reproducing it.

resource "aws_dynamodb_table" "channel_mappings" {
  name         = "picasso-channel-mappings"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "tenantId"
    type = "S"
  }

  attribute {
    name = "channelType"
    type = "S"
  }

  global_secondary_index {
    name            = "TenantIndex"
    hash_key        = "tenantId"
    range_key       = "channelType"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-channel-mappings"
  }
}

output "table_name" {
  value = aws_dynamodb_table.channel_mappings.name
}

output "table_arn" {
  value = aws_dynamodb_table.channel_mappings.arn
}

# TenantIndex ARN — Meta_OAuth_Handler IAM needs index-level Query grant.
output "tenant_index_arn" {
  value = "${aws_dynamodb_table.channel_mappings.arn}/index/TenantIndex"
}
