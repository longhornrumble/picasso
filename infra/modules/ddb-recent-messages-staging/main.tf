resource "aws_dynamodb_table" "recent_messages" {
  name         = "staging-recent-messages"
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

  tags = {
    Name = "staging-recent-messages"
  }
}

output "table_name" {
  value = aws_dynamodb_table.recent_messages.name
}

output "table_arn" {
  value = aws_dynamodb_table.recent_messages.arn
}
