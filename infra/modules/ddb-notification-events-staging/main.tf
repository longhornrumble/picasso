resource "aws_dynamodb_table" "notification_events" {
  name         = "picasso-notification-events-staging"
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
    name = "message_id"
    type = "S"
  }

  attribute {
    name = "event_type_timestamp"
    type = "S"
  }

  global_secondary_index {
    name            = "ByMessageId"
    hash_key        = "message_id"
    range_key       = "event_type_timestamp"
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
    Name = "picasso-notification-events-staging"
  }
}

output "table_name" {
  value = aws_dynamodb_table.notification_events.name
}

output "table_arn" {
  value = aws_dynamodb_table.notification_events.arn
}
