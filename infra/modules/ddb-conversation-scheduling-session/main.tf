variable "env" {
  description = "Environment suffix (dev, staging, prod)."
  type        = string
}

# Scheduling ConversationSchedulingSession table (impl plan C3; canonical §9.2, §18).
#
# Identity key: (tenantId, session_id). Per canonical §18 the sort key is
# `session_id`; tenantId PK per the platform multi-tenant convention. session_id
# is the same chat session id persisted on form submissions (form_handler.py) and
# carried through the C1 (tenant_id, session_id) GSI, so a conversation's
# scheduling state and its form data share a join key.
#
# Holds the eight-state machine state (§9.2: qualifying -> proposing ->
# confirming -> booked, plus pending_attendance / coordinator_no_show entered by
# E) as a non-key attribute; transitions are UpdateItem on this key.
#
# No DDB TTL in v1: the §9.2 30-minute suspended-session expiry is a CLIENT-side
# FormModeContext sessionStorage check (FormModeContext.jsx mount-time), not a
# server-side DynamoDB TTL. Server-side retention is sub-phase F (same stance as
# the Booking table). No GSI — sessions are read by (tenantId, session_id)
# point-read; canonical §18 places GSIs only on Booking.
resource "aws_dynamodb_table" "conversation_scheduling_session" {
  name         = "picasso-conversation-scheduling-session-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tenantId"
  range_key    = "session_id"

  attribute {
    name = "tenantId"
    type = "S"
  }

  attribute {
    name = "session_id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-conversation-scheduling-session-${var.env}"
  }
}

output "table_name" {
  value = aws_dynamodb_table.conversation_scheduling_session.name
}

output "table_arn" {
  value = aws_dynamodb_table.conversation_scheduling_session.arn
}
