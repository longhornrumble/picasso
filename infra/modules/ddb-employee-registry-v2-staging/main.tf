resource "aws_dynamodb_table" "employee_registry_v2" {
  name         = "picasso-employee-registry-v2-staging"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenantId"
  range_key    = "employeeId"

  attribute {
    name = "tenantId"
    type = "S"
  }

  attribute {
    name = "employeeId"
    type = "S"
  }

  attribute {
    name = "email"
    type = "S"
  }

  attribute {
    name = "clerkUserId"
    type = "S"
  }

  global_secondary_index {
    name            = "EmailIndex"
    hash_key        = "email"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "ClerkUserIdIndex"
    hash_key        = "clerkUserId"
    projection_type = "ALL"
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-employee-registry-v2-staging"
  }
}

# Naming-parity migration (ENVIRONMENT_NAMING_PARITY_PLAN.md Phase 2): bare twin.
# Canonical name drops BOTH -v2 and -staging -> picasso-employee-registry (matches
# prod's existing identical-schema table). PR-A creates it; data copied out of band;
# PR-B switches outputs; legacy resource removed in the batched drop PR.
resource "aws_dynamodb_table" "employee_registry_v2_bare" {
  name         = "picasso-employee-registry"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenantId"
  range_key    = "employeeId"

  attribute {
    name = "tenantId"
    type = "S"
  }

  attribute {
    name = "employeeId"
    type = "S"
  }

  attribute {
    name = "email"
    type = "S"
  }

  attribute {
    name = "clerkUserId"
    type = "S"
  }

  global_secondary_index {
    name            = "EmailIndex"
    hash_key        = "email"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "ClerkUserIdIndex"
    hash_key        = "clerkUserId"
    projection_type = "ALL"
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-employee-registry"
  }
}

output "table_name" {
  value = aws_dynamodb_table.employee_registry_v2.name
}

output "table_arn" {
  value = aws_dynamodb_table.employee_registry_v2.arn
}
