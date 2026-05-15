resource "aws_dynamodb_table" "session_events" {
  name         = "picasso-session-events-staging"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "tenant_hash"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  global_secondary_index {
    name            = "tenant-date-index"
    hash_key        = "tenant_hash"
    range_key       = "timestamp"
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
    Name = "picasso-session-events-staging"
  }
}

output "table_name" {
  value = aws_dynamodb_table.session_events.name
}

output "table_arn" {
  value = aws_dynamodb_table.session_events.arn
}
