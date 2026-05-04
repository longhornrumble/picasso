resource "aws_dynamodb_table" "conversation_summaries" {
  name         = "staging-conversation-summaries"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "sessionId"

  attribute {
    name = "sessionId"
    type = "S"
  }

  attribute {
    name = "tenantId"
    type = "S"
  }

  global_secondary_index {
    name            = "tenantId-index"
    hash_key        = "tenantId"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "staging-conversation-summaries"
  }
}

output "table_name" {
  value = aws_dynamodb_table.conversation_summaries.name
}

output "table_arn" {
  value = aws_dynamodb_table.conversation_summaries.arn
}
