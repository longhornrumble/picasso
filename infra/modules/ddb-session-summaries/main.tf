variable "env" {
  description = "Environment suffix (dev, staging, prod)."
  type        = string
}

resource "aws_dynamodb_table" "session_summaries" {
  name         = "picasso-session-summaries-${var.env}"
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
    Name = "picasso-session-summaries-${var.env}"
  }
}

output "table_name" {
  value = aws_dynamodb_table.session_summaries.name
}

output "table_arn" {
  value = aws_dynamodb_table.session_summaries.arn
}
