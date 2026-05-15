variable "env" {
  description = "Environment suffix (dev, staging, prod)."
  type        = string
}

resource "aws_dynamodb_table" "token_blacklist" {
  name         = "picasso-token-blacklist-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "token_hash"

  attribute {
    name = "token_hash"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-token-blacklist-${var.env}"
  }
}

output "table_name" {
  value = aws_dynamodb_table.token_blacklist.name
}

output "table_arn" {
  value = aws_dynamodb_table.token_blacklist.arn
}
