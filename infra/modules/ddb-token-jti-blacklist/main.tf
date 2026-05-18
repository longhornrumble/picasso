variable "env" {
  description = "Environment suffix (dev, staging, prod)."
  type        = string
}

# Scheduling JWT-revocation blacklist (impl plan A8c; R1 intent, R6 naming).
#
# Greenfield create in staging-525. R1's literal text said "terraform import
# the A6-shipped table" but that table (PR #52, 2026-05-02) was provisioned
# in the OLD prod-614 account under a staging name, pre-P0-account-split — it
# does NOT exist in staging-525. The prod-614 copy is a Q3-parked legacy
# artifact: account isolation + the "never touch prod in feature work" hard
# rule mean it is left alone, not imported. R1's intent (jti table
# Terraform-managed in staging, not hand-provisioned) is satisfied by
# creating it here.
#
# Schema (composite key (tenantId, jti), TTL on expires_at) follows the A6
# runbook design. PITR + tags match the ddb-token-blacklist precedent —
# appropriate for a security-relevant JWT-revocation table.
#
# Distinct from ddb-token-blacklist (the single-key session-token blacklist,
# different purpose).
resource "aws_dynamodb_table" "token_jti_blacklist" {
  name         = "picasso-token-jti-blacklist-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenantId"
  range_key    = "jti"

  attribute {
    name = "tenantId"
    type = "S"
  }

  attribute {
    name = "jti"
    type = "S"
  }

  # expires_at (epoch seconds) — DynamoDB auto-deletes the row when the
  # underlying token would expire. Only key attributes are declared as
  # attribute blocks; the TTL attribute is referenced here only.
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-token-jti-blacklist-${var.env}"
  }
}

output "table_name" {
  value = aws_dynamodb_table.token_jti_blacklist.name
}

output "table_arn" {
  value = aws_dynamodb_table.token_jti_blacklist.arn
}
