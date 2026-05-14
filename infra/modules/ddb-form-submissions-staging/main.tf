resource "aws_dynamodb_table" "form_submissions" {
  name         = "picasso-form-submissions-staging"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenant_id"
  range_key    = "submission_id"

  attribute {
    name = "tenant_id"
    type = "S"
  }

  attribute {
    name = "submission_id"
    type = "S"
  }

  attribute {
    name = "form_type"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  attribute {
    name = "created_at"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "tenant_pipeline_key"
    type = "S"
  }

  attribute {
    name = "submitted_at"
    type = "S"
  }

  global_secondary_index {
    name            = "FormTypeIndex"
    hash_key        = "form_type"
    range_key       = "created_at"
    projection_type = "ALL"
  }

  global_secondary_index {
    name               = "StatusIndex"
    hash_key           = "status"
    range_key          = "created_at"
    projection_type    = "INCLUDE"
    non_key_attributes = ["tenant_id", "submission_id", "form_type"]
  }

  # Phase D gate G1 — additive GSIs matching prod schema (picasso_form_submissions).
  # Required by Analytics_Dashboard_API queries at lambda_function.py:3070 (tenant-timestamp-index)
  # and lambda_function.py:4892 (tenant-pipeline-index). Attributes already populated by
  # BSH form_handler.js:548-549 (submitted_at, timestamp) and :558 (tenant_pipeline_key).
  global_secondary_index {
    name            = "tenant-timestamp-index"
    hash_key        = "tenant_id"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "tenant-pipeline-index"
    hash_key        = "tenant_pipeline_key"
    range_key       = "submitted_at"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-form-submissions-staging"
  }
}

output "table_name" {
  value = aws_dynamodb_table.form_submissions.name
}

output "table_arn" {
  value = aws_dynamodb_table.form_submissions.arn
}
