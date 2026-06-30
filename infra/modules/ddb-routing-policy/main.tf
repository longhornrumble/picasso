variable "env" {
  description = "Environment suffix (dev, staging, prod)."
  type        = string
}

# Scheduling RoutingPolicy table (impl plan C3; canonical §10.1/§10.2, §18).
#
# Identity key: (tenantId, routing_policy_id). Per canonical §18 the sort key is
# `routing_policy_id`; tenantId PK per the platform multi-tenant convention.
#
# Round-robin state lives HERE (`last_assigned_resource_id` + `last_assigned_at`,
# atomically advanced at booking commit and reverted by the compensating
# transaction per §10.1/§10.2) — these are non-key attributes. Tag-condition
# filtering for pool eligibility is also non-key config. No GSI needed: the
# policy is read by (tenantId, routing_policy_id) point-read during
# pool-at-commit (C5/C6), and the round-robin advance is an atomic UpdateItem
# on the same key. Canonical §18 places GSIs only on Booking.
resource "aws_dynamodb_table" "routing_policy" {
  name         = "picasso-routing-policy-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenantId"
  range_key    = "routing_policy_id"

  attribute {
    name = "tenantId"
    type = "S"
  }

  attribute {
    name = "routing_policy_id"
    type = "S"
  }

  # Config + round-robin state — not auto-expired (no TTL); retention is
  # sub-phase F, same stance as the Booking table.
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-routing-policy-${var.env}"
  }
}

# Naming-parity migration (ENVIRONMENT_NAMING_PARITY_PLAN.md Phase 2): bare twin.
# PR-A creates it (outputs stay on legacy = zero gap); data copied out of band;
# PR-B switches the outputs below; legacy resource removed in the batched drop PR.
resource "aws_dynamodb_table" "routing_policy_bare" {
  name         = "picasso-routing-policy"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenantId"
  range_key    = "routing_policy_id"

  attribute {
    name = "tenantId"
    type = "S"
  }

  attribute {
    name = "routing_policy_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-routing-policy"
  }
}

# PR-B cutover: outputs reference the bare table (data copied + parity-verified).
# Legacy resource retained until verified; removed in the batched drop PR.
output "table_name" {
  value = aws_dynamodb_table.routing_policy_bare.name
}

output "table_arn" {
  value = aws_dynamodb_table.routing_policy_bare.arn
}
