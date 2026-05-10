resource "aws_dynamodb_table" "notification_sends" {
  name         = "picasso-notification-sends-staging"
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
    Name = "picasso-notification-sends-staging"
  }
}

output "table_name" {
  value = aws_dynamodb_table.notification_sends.name
}

output "table_arn" {
  value = aws_dynamodb_table.notification_sends.arn
}
