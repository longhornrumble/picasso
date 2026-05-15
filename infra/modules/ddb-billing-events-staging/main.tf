resource "aws_dynamodb_table" "billing_events" {
  name         = "picasso-billing-events-staging"
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

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-billing-events-staging"
  }
}

output "table_name" {
  value = aws_dynamodb_table.billing_events.name
}

output "table_arn" {
  value = aws_dynamodb_table.billing_events.arn
}
