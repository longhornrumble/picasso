variable "env" {
  description = "Environment suffix (dev, staging, prod)."
  type        = string
}

# Scheduling notification-template overrides (G2 / ui_plan §E14).
#
# Per-tenant overrides of the scheduling lifecycle-notice email copy
# (reschedule_link / reoffer / cancel_notice). Stored in DynamoDB — NOT tenant
# config S3 — because the config store is form-scoped AND staging config is a
# read-only prod replica (writes denied), so a config-backed editor could not be
# saved/tested on staging. Scheduling config lives in DDB per §E13b; this follows
# the same stance.
#
# Identity key: (tenantId, moment). moment ∈ {reschedule_link, reoffer,
# cancel_notice}. Non-key attributes: subject, body_text, body_html, modified_at.
# notify.js reads (tenantId, moment) point-reads at dispatch (override → else the
# local default); the STOP/unsubscribe footer is appended OUTSIDE the editable
# body and can never be removed by an override. No GSI (point-read only).
resource "aws_dynamodb_table" "scheduling_notif_template" {
  name         = "picasso-scheduling-notif-template"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenantId"
  range_key    = "moment"

  attribute {
    name = "tenantId"
    type = "S"
  }

  attribute {
    name = "moment"
    type = "S"
  }

  # Config records — not auto-expired (no TTL); same retention stance as the
  # appointment-type / routing-policy config tables.
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-scheduling-notif-template"
  }
}

output "table_name" {
  value = aws_dynamodb_table.scheduling_notif_template.name
}

output "table_arn" {
  value = aws_dynamodb_table.scheduling_notif_template.arn
}
