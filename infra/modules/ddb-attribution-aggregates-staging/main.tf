# Monthly attribution rollup rows. Key patterns (C5 contract):
#   pk  TENANT#{tenant_id}
#   sk  METRIC#attribution_summary#{YYYY-MM}
#       METRIC#attribution_channel#{YYYY-MM}#{channel}
#       METRIC#attribution_entrypoint#{YYYY-MM}#{entry_point_id}
# TTL attribute `ttl`: writer sets ttl = now + 420 days.

resource "aws_dynamodb_table" "attribution_aggregates" {
  name         = "picasso-attribution-aggregates"
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
    Name = "picasso-attribution-aggregates"
  }
}

output "table_name" {
  value = aws_dynamodb_table.attribution_aggregates.name
}

output "table_arn" {
  value = aws_dynamodb_table.attribution_aggregates.arn
}
