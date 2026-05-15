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

output "table_name" {
  value = aws_dynamodb_table.employee_registry_v2.name
}

output "table_arn" {
  value = aws_dynamodb_table.employee_registry_v2.arn
}
