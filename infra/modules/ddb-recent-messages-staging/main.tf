resource "aws_dynamodb_table" "recent_messages" {
  name         = "recent-messages"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "sessionId"
  range_key    = "messageTimestamp"

  attribute {
    name = "sessionId"
    type = "S"
  }

  attribute {
    name = "messageTimestamp"
    type = "N"
  }

  point_in_time_recovery {
    enabled = true
  }

  # Retention: the writer (Master_Function_Staging/conversation_handler.py) already sets
  # expires_at = now + 24h on every message row, but with no ttl block that attribute was
  # inert and rows accumulated unbounded (full message content). Enabling TTL on the
  # existing attribute purges the 24h buffer as intended; existing rows (expires_at already
  # in the past) auto-purge on enable. See docs/roadmap/PII-Project/data-retention-strategy.md §5 #1.
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  tags = {
    Name = "recent-messages"
  }
}

output "table_name" {
  value = aws_dynamodb_table.recent_messages.name
}

output "table_arn" {
  value = aws_dynamodb_table.recent_messages.arn
}
