variable "env" {
  description = "Environment suffix (dev, staging, prod)."
  type        = string
}

# Scheduling AppointmentType table (impl plan C3; canonical §5.4, §18).
#
# Identity key: (tenantId, appointment_type_id). Per canonical §18 the sort key
# is `appointment_type_id`; tenantId PK matches the platform multi-tenant
# partition-isolation convention (no GSI exposes a cross-tenant query path).
#
# `format` (individual | group-reserved-for-v2) and the rest of the
# appointmentType config are non-key attributes (DynamoDB is schemaless on
# non-key attributes) — the format-scoped uniqueness rule from canonical §5.4 is
# a WRITE-time conditional-write constraint enforced in C6/C8, NOT a table key.
#
# No GSI in v1 — AppointmentType is read by (tenantId, appointment_type_id)
# point-read during pool-at-commit (C6); canonical §18 places GSIs only on Booking.
resource "aws_dynamodb_table" "appointment_type" {
  name         = "picasso-appointment-type-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenantId"
  range_key    = "appointment_type_id"

  attribute {
    name = "tenantId"
    type = "S"
  }

  attribute {
    name = "appointment_type_id"
    type = "S"
  }

  # Config records — not auto-expired (no TTL); retention is sub-phase F, same
  # stance as the Booking table.
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-appointment-type-${var.env}"
  }
}

# Naming-parity migration (ENVIRONMENT_NAMING_PARITY_PLAN.md Phase 2): bare-named
# twin created alongside the legacy -staging table. Data is copied old->new out of
# band, then the outputs below are switched to this resource (consumers repoint),
# then the legacy resource is removed in the batched drop PR. Identical schema.
resource "aws_dynamodb_table" "appointment_type_bare" {
  name         = "picasso-appointment-type"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenantId"
  range_key    = "appointment_type_id"

  attribute {
    name = "tenantId"
    type = "S"
  }

  attribute {
    name = "appointment_type_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-appointment-type"
  }
}

# Outputs still reference the LEGACY table in PR-A (consumers unchanged, zero gap).
# PR-B switches these to aws_dynamodb_table.appointment_type_bare after data copy.
output "table_name" {
  value = aws_dynamodb_table.appointment_type.name
}

output "table_arn" {
  value = aws_dynamodb_table.appointment_type.arn
}
