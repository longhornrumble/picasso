# Track 1 S6 — picasso-scheduled-messages table.
#
# Stores the per-booking per-moment reminder rows that EventBridge Scheduler
# will invoke Scheduled_Message_Sender for. Each row represents a single
# outstanding scheduled message (48h / 24h / 1h reminder). The Booking_Commit_Handler
# writes rows via scheduleReminders(); the cal-lifecycle consumer deletes them on
# cancel; the Reminder_Scheduler (nightly reconciler) sweeps terminal rows.
#
# Table design (canonical §E1 / DEPLOY_NOTE.md §9):
#   pk  S  TENANT#{tenantId}
#   sk  S  SCHEDULED#{startAtIso}#{messageId}
# GSI "by-appointment":
#   hash  appointment_id  (S)
#   range pk
#   projection ALL
# TTL on ttl (epoch seconds) — additive self-clean field; harmless when 0 / absent.
# PITR on — reminder rows carry booking PII (attendee email / phone hash).
#
# OPERATOR NOTE: this table may already exist in staging if the out-of-band
# create-scheduled-messages-table.sh was run. Check before apply:
#   aws dynamodb describe-table --table-name picasso-scheduled-messages \
#     --profile myrecruiter-staging 2>&1 | head -5
# If it exists, run BEFORE apply:
#   terraform import \
#     module.ddb_scheduled_messages_staging[0].aws_dynamodb_table.scheduled_messages \
#     picasso-scheduled-messages

resource "aws_dynamodb_table" "scheduled_messages" {
  name         = "picasso-scheduled-messages"
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

  # GSI key attributes (must be declared top-level per DDB Terraform requirements).
  attribute {
    name = "appointment_id"
    type = "S"
  }

  # GSI "by-appointment": look up all reminders for a booking by appointment_id.
  # Present for TABLE-SHAPE PARITY with the out-of-band create-scheduled-messages-table.sh
  # (so `terraform import` of the pre-existing table shows no diff). NOTE: the CURRENT merged
  # code does NOT Query this GSI — deleteReminders()/rebindReminders() delete by the exact
  # SKs persisted in the booking's reminder_schedule_state (or by deterministic schedule name),
  # so NO caller needs a dynamodb:Query grant on this index. Kept for shape parity + future use.
  global_secondary_index {
    name            = "by-appointment"
    hash_key        = "appointment_id"
    range_key       = "pk"
    projection_type = "ALL"
  }

  # TTL: additive self-clean field. Harmless when the attribute is absent or zero;
  # the reconciler also sweeps terminal rows on a 14d lookback (belt-and-suspenders).
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  # PITR: reminder rows contain attendee_email / phone_hash from the booking row.
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name     = "picasso-scheduled-messages"
    Subphase = "S6"
  }
}

output "table_name" {
  value = aws_dynamodb_table.scheduled_messages.name
}

output "table_arn" {
  value = aws_dynamodb_table.scheduled_messages.arn
}
