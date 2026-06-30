# Calendar watch channel ledger (canonical scheduling sub-phase B; runbook
# subphase_b1_calendar_watch_channels_runbook.md). Holds the Google Calendar
# push-notification channel registrations (channel_id, expiration, status) keyed
# per tenant.
#
# Environment naming-parity migration: this table was previously provisioned
# OUT OF BAND (runbook, PR#231) and only READ by Terraform via a `data` source
# under the env-suffixed name. This module brings it under management with the
# bare canonical name `picasso-calendar-watch-channels` (account boundary =
# environment), so staging (525) and prod (614) converge on one name. The
# pre-existing suffixed table is migrated (data copied) then dropped out of band
# (it was never in Terraform state).
#
# Schema is an exact replica of the live suffixed table: HASH channel_id; 2 GSIs
# tenant-expiration-index (tenant_id / expiration[N]) + tenant-status-index
# (tenant_id / status[S]); PITR on. The Renewer queries tenant-expiration-index;
# the Listener queries tenant-status-index.
resource "aws_dynamodb_table" "calendar_watch_channels" {
  name         = "picasso-calendar-watch-channels"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "channel_id"

  attribute {
    name = "channel_id"
    type = "S"
  }

  attribute {
    name = "tenant_id"
    type = "S"
  }

  attribute {
    name = "expiration"
    type = "N"
  }

  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name            = "tenant-expiration-index"
    hash_key        = "tenant_id"
    range_key       = "expiration"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "tenant-status-index"
    hash_key        = "tenant_id"
    range_key       = "status"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-calendar-watch-channels"
  }
}

output "table_name" {
  value = aws_dynamodb_table.calendar_watch_channels.name
}

output "table_arn" {
  value = aws_dynamodb_table.calendar_watch_channels.arn
}
