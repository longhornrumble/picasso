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

  # Sub-phase C Task C1 — session_id GSI key. Already written on every form
  # submission by BSH form_handler (`session_id`); the GSI provisions against the
  # current item shape with no write-path change. Old items without session_id
  # are simply not indexed (sparse GSI) — safe.
  attribute {
    name = "session_id"
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

  # Sub-phase C Task C1 — (tenant_id, session_id) GSI. C2 (Bedrock form-data
  # injection, §5.6) queries this to find any form submissions tied to the
  # current chat session and hydrate the prompt so the LLM can skip the
  # qualifier. projection ALL = the submission content is returned by the GSI
  # query with no second point-read. DynamoDB adds at most one GSI per
  # UpdateTable; this is the only GSI added in this change.
  global_secondary_index {
    name            = "tenant-session-index"
    hash_key        = "tenant_id"
    range_key       = "session_id"
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

# Environment naming-parity migration (Variant A) — bare-name twin.
# Drops the env suffix so staging (525) and prod (614) converge on one canonical
# `picasso-form-submissions` (account boundary = environment). Schema is an exact
# replica of the resource above (9 attrs, 5 GSIs incl the StatusIndex INCLUDE
# projection, TTL on `ttl`, PITR). PR-A creates the EMPTY bare table; outputs
# still point at the suffixed resource so no consumer moves. PR-B copies the
# data, switches the outputs, and var-wires the tenant-purge consumer (the only
# non-module-wired seam). The suffixed table drops in the batched cleanup PR.
# NOTE: prod `picasso_form_submissions` (underscore, single-key) divergence is a
# separate Phase-4 carve-out; the staging rename here does not touch prod.
resource "aws_dynamodb_table" "form_submissions_bare" {
  name         = "picasso-form-submissions"
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

  attribute {
    name = "session_id"
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

  global_secondary_index {
    name            = "tenant-session-index"
    hash_key        = "tenant_id"
    range_key       = "session_id"
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
    Name = "picasso-form-submissions"
  }
}

output "table_name" {
  value = aws_dynamodb_table.form_submissions.name
}

output "table_arn" {
  value = aws_dynamodb_table.form_submissions.arn
}
