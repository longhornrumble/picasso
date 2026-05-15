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

  # Phase 2 MFS cleanup B2/2.1: DDB Streams feed the picasso-session-archiver
  # Lambda. OLD_IMAGE so the archiver can serialize the row before TTL deletes
  # it. Hand-enabled during the audit project; codified here so terraform
  # apply doesn't disable it.
  stream_enabled   = true
  stream_view_type = "OLD_IMAGE"

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

output "stream_arn" {
  description = "Stream ARN for the picasso-session-archiver Lambda's Event Source Mapping."
  value       = aws_dynamodb_table.session_summaries.stream_arn
}
