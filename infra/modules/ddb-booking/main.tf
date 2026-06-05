variable "env" {
  description = "Environment suffix (dev, staging, prod)."
  type        = string
}

# Scheduling Booking table (impl plan A8c, R1/R6; canonical §5.2).
#
# Identity key: (tenantId, booking_id). The (resource_id, start_at, end_at)
# uniqueness rule from canonical §5.2 is a write-time constraint enforced in
# C6 — it is NOT the table key.
#
# Round-robin needs no GSI — its state lives on RoutingPolicy, atomically
# updated at booking commit (canonical §10.1/§10.2).
#
# GSI 3 (external_event_id-index) was added 2026-06-04 to recover a booking from
# its Google Calendar event id on the deletion path: Google strips
# extendedProperties from cancelled-event delta items, so the Listener cannot read
# booking_id off a hard-deleted event and must query by event id instead. Adding a
# single GSI to the existing table is an online in-place UpdateTable (backfill), NOT
# a table rebuild — verify `terraform plan` shows update-in-place before applying.
#
# v1 hot-partition acceptance: tenantId is the PK on all scheduling tables.
# Fine at single-tenant pilot scale; the v2 mitigation (composite-PK shard
# suffix) is documented in docs/runbooks/SCHEDULING_DYNAMODB_TABLES.md and
# applies only when high-volume tenants land.
resource "aws_dynamodb_table" "booking" {
  name         = "picasso-booking-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenantId"
  range_key    = "booking_id"

  attribute {
    name = "tenantId"
    type = "S"
  }

  attribute {
    name = "booking_id"
    type = "S"
  }

  # GSI key attributes (must be declared).
  attribute {
    name = "start_at"
    type = "S"
  }

  attribute {
    name = "coordinator_email"
    type = "S"
  }

  # GSI 3 key attribute — the Google Calendar event id (C8 writes it on every booking).
  attribute {
    name = "external_event_id"
    type = "S"
  }

  # GSI 1 — (tenantId, start_at): tenant-scoped time-range queries.
  # B5 onboarding hook, B11 stranded-booking detection, E9 nightly
  # reconciliation, OOO-overlap detection (canonical §5.2 item 5 / §14.2).
  global_secondary_index {
    name            = "tenantId-start_at-index"
    hash_key        = "tenantId"
    range_key       = "start_at"
    projection_type = "ALL"
  }

  # GSI 2 — (tenantId, coordinator_email): B11 stranded-booking queries —
  # all bookings for a departed coordinator without a full-table scan
  # (canonical §16).
  global_secondary_index {
    name            = "tenantId-coordinator_email-index"
    hash_key        = "tenantId"
    range_key       = "coordinator_email"
    projection_type = "ALL"
  }

  # GSI 3 — (external_event_id): resolve a booking from its Google Calendar event
  # id on the §14.2 deletion path. The hash key has no tenant element, so the
  # Listener validates the resolved booking's tenantId against the channel tenant
  # (cross-tenant guard). HASH-only (no range key) — event ids are unique per event.
  global_secondary_index {
    name            = "external_event_id-index"
    hash_key        = "external_event_id"
    projection_type = "ALL"
  }

  # Bookings carry volunteer PII and are operational records (not
  # auto-expired — retention/PII deletion is sub-phase F, not a TTL).
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-booking-${var.env}"
  }
}

output "table_name" {
  value = aws_dynamodb_table.booking.name
}

output "table_arn" {
  value = aws_dynamodb_table.booking.arn
}

output "tenant_id_start_at_index_arn" {
  description = "ARN of the (tenantId, start_at) GSI. Used by B5 onboarding hook, B11 stranded-booking, E9 reconciliation, OOO-overlap detection."
  value       = "${aws_dynamodb_table.booking.arn}/index/tenantId-start_at-index"
}

output "tenant_id_coordinator_email_index_arn" {
  description = "ARN of the (tenantId, coordinator_email) GSI. Used by B2 Calendar_Watch_Listener to find bookings owned by a coordinator when a calendar push arrives, and by B11 stranded-booking queries."
  value       = "${aws_dynamodb_table.booking.arn}/index/tenantId-coordinator_email-index"
}

output "external_event_id_index_arn" {
  description = "ARN of the (external_event_id) GSI. Used by B2 Calendar_Watch_Listener to resolve a booking from its Google event id on the deletion path (Google strips extendedProperties from cancelled-event deltas)."
  value       = "${aws_dynamodb_table.booking.arn}/index/external_event_id-index"
}
