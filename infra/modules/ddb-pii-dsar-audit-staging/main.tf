resource "aws_dynamodb_table" "pii_dsar_audit" {
  name         = "picasso-pii-dsar-audit-staging"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "dsar_id"
  range_key    = "event_timestamp"

  attribute {
    name = "dsar_id"
    type = "S"
  }

  attribute {
    name = "event_timestamp"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  # Item 3 (EventBridge SLA alarm) scans for open DSARs nearing SLA. Defining the
  # GSI now on an empty table avoids an online index backfill once writes begin
  # (same pattern as ddb-pii-subject-index-staging's PiiSubjectIdIndex).
  global_secondary_index {
    name            = "StatusIndex"
    hash_key        = "status"
    range_key       = "event_timestamp"
    projection_type = "ALL"
  }

  # No ttl block: DSAR audit rows must outlive the underlying subject data
  # (Art 17(3)(b) "legal claims" reasoning per D5 G-C). Retention policy is
  # counsel-pending; deletion-on-demand is not a property of this surface.

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-pii-dsar-audit-staging"
  }
}

output "table_name" {
  value = aws_dynamodb_table.pii_dsar_audit.name
}

output "table_arn" {
  value = aws_dynamodb_table.pii_dsar_audit.arn
}
