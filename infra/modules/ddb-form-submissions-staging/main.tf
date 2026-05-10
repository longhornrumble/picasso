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
