resource "aws_dynamodb_table" "entry_points" {
  name         = "picasso-entry-points"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenant_id"
  range_key    = "entry_point_id"

  attribute {
    name = "tenant_id"
    type = "S"
  }

  attribute {
    name = "entry_point_id"
    type = "S"
  }

  # No TTL block: this is config data (no expiry). C3 contract.

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-entry-points"
  }
}

output "table_name" {
  value = aws_dynamodb_table.entry_points.name
}

output "table_arn" {
  value = aws_dynamodb_table.entry_points.arn
}
