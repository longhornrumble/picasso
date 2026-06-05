resource "aws_dynamodb_table" "pii_subject_index" {
  name         = "picasso-pii-subject-index"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenant_id"
  range_key    = "normalized_email"

  attribute {
    name = "tenant_id"
    type = "S"
  }

  attribute {
    name = "normalized_email"
    type = "S"
  }

  attribute {
    name = "pii_subject_id"
    type = "S"
  }

  # Phase 2 (delete) purges a subject's index entries by pii_subject_id; Phase 4 (DSAR)
  # resolves subject -> all emails. Both are locked downstream requirements — defining the
  # GSI now on an empty table avoids an online index backfill on live data later.
  global_secondary_index {
    name            = "PiiSubjectIdIndex"
    hash_key        = "pii_subject_id"
    projection_type = "ALL"
  }

  # No ttl block: the index must outlive individual submissions so a DSAR can still
  # resolve email -> subject after form-submission rows age out under the Phase-3 TTL.
  # Lifecycle is owned by the Phase-2 delete pipeline, not housekeeping expiry.

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-pii-subject-index"
  }
}

output "table_name" {
  value = aws_dynamodb_table.pii_subject_index.name
}

output "table_arn" {
  value = aws_dynamodb_table.pii_subject_index.arn
}
