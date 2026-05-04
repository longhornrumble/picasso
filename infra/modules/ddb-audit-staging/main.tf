resource "aws_dynamodb_table" "audit" {
  name         = "picasso-audit-staging"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenant_hash"
  range_key    = "timestamp_event_id"

  attribute {
    name = "tenant_hash"
    type = "S"
  }

  attribute {
    name = "timestamp_event_id"
    type = "S"
  }

  attribute {
    name = "event_type"
    type = "S"
  }

  global_secondary_index {
    name            = "EventTypeIndex"
    hash_key        = "event_type"
    range_key       = "timestamp_event_id"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "retention_expires_at"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-audit-staging"
  }
}

output "table_name" {
  value = aws_dynamodb_table.audit.name
}

output "table_arn" {
  value = aws_dynamodb_table.audit.arn
}
