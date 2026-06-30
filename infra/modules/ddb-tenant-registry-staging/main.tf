resource "aws_dynamodb_table" "tenant_registry" {
  name         = "picasso-tenant-registry-staging"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenantId"

  attribute {
    name = "tenantId"
    type = "S"
  }

  attribute {
    name = "tenantHash"
    type = "S"
  }

  attribute {
    name = "clerkOrgId"
    type = "S"
  }

  attribute {
    name = "stripeCustomerId"
    type = "S"
  }

  global_secondary_index {
    name            = "TenantHashIndex"
    hash_key        = "tenantHash"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "ClerkOrgIdIndex"
    hash_key        = "clerkOrgId"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "StripeCustomerIdIndex"
    hash_key        = "stripeCustomerId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-tenant-registry-staging"
  }
}

# Naming-parity migration (ENVIRONMENT_NAMING_PARITY_PLAN.md Phase 2): bare twin.
# PR-A creates it (outputs stay on legacy = zero gap); data copied out of band;
# PR-B switches the outputs below; legacy resource removed in the batched drop PR.
resource "aws_dynamodb_table" "tenant_registry_bare" {
  name         = "picasso-tenant-registry"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenantId"

  attribute {
    name = "tenantId"
    type = "S"
  }

  attribute {
    name = "tenantHash"
    type = "S"
  }

  attribute {
    name = "clerkOrgId"
    type = "S"
  }

  attribute {
    name = "stripeCustomerId"
    type = "S"
  }

  global_secondary_index {
    name            = "TenantHashIndex"
    hash_key        = "tenantHash"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "ClerkOrgIdIndex"
    hash_key        = "clerkOrgId"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "StripeCustomerIdIndex"
    hash_key        = "stripeCustomerId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-tenant-registry"
  }
}

output "table_name" {
  value = aws_dynamodb_table.tenant_registry.name
}

output "table_arn" {
  value = aws_dynamodb_table.tenant_registry.arn
}
