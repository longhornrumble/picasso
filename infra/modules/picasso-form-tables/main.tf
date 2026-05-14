variable "env" {
  description = "Environment suffix (dev, staging, prod)."
  type        = string
}

# Phase A note (2026-05-14): the BSH form_handler reads/writes 4 tables —
#   picasso-form-submissions-{env}, picasso-notification-sends-{env},
#   picasso-sms-consent-{env}, picasso-sms-usage-{env}.
# The first two already exist in the staging account (provisioned 2026-05-10 by the
# AWS-native versioning staging-twin Phase 4 effort) and are in active use by
# Master_Function_Staging + Analytics_Dashboard_API. They are intentionally NOT
# managed by this module to avoid disrupting in-use data. The form-submissions
# staging schema diverges from prod (composite key + FormType/Status GSIs vs
# prod's simple key + tenant-timestamp/tenant-pipeline GSIs); BSH PutItem still
# succeeds because the item attributes are a superset. That mismatch is a
# pre-existing staging gap, surfaced for follow-up but out of Phase A scope.

# SMS opt-in / consent records (staging-only twin of prod `picasso-sms-consent`).
resource "aws_dynamodb_table" "sms_consent" {
  name         = "picasso-sms-consent-${var.env}"
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

  attribute {
    name = "phone_e164"
    type = "S"
  }

  global_secondary_index {
    name            = "phone-lookup"
    hash_key        = "phone_e164"
    range_key       = "pk"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-sms-consent-${var.env}"
  }
}

# Monthly SMS usage counter per tenant.
# Prod equivalent: NONE — prod `picasso-sms-usage` does not exist; BSH form_handler.js
# would silently ResourceNotFoundException there. Staging twin provisions it correctly.
# Schema derived from BSH form_handler.js:891-960 (Key={tenant_id, month}, attrs count/updated_at).
resource "aws_dynamodb_table" "sms_usage" {
  name         = "picasso-sms-usage-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenant_id"
  range_key    = "month"

  attribute {
    name = "tenant_id"
    type = "S"
  }

  attribute {
    name = "month"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-sms-usage-${var.env}"
  }
}

output "sms_consent_table_name" {
  value = aws_dynamodb_table.sms_consent.name
}

output "sms_consent_table_arn" {
  value = aws_dynamodb_table.sms_consent.arn
}

output "sms_usage_table_name" {
  value = aws_dynamodb_table.sms_usage.name
}

output "sms_usage_table_arn" {
  value = aws_dynamodb_table.sms_usage.arn
}
