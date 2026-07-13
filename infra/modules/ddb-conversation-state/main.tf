# Messenger Channel Experience M1c — per-conversation state table.
#
# Contract C4 (lambda repo docs/messenger/CONTRACTS.md): PK sessionId (S),
# SK stateType (S), TTL attribute `expires_at` (epoch SECONDS). Row shapes
# (lock / pause / form_session / scheduling_session / counters) are contract-
# defined; every row MUST set expires_at — TTL is the retention mechanism for
# the PII this table later carries (form answers M7a, scheduling contact M8a).
#
# The attribute name `expires_at` is deliberate and load-bearing: the
# picasso-recent-messages TTL bug (rows wrote `ttl`, table expired on
# `expires_at`, nothing ever expired) is the failure mode this kills.
#
# Bare name per the account-is-the-environment convention (CLAUDE.md hard
# rule); PITR enabled (uniform staging-account DDB rule).

resource "aws_dynamodb_table" "conversation_state" {
  name         = "picasso-conversation-state"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "sessionId"
  range_key    = "stateType"

  attribute {
    name = "sessionId"
    type = "S"
  }

  attribute {
    name = "stateType"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-conversation-state"
  }
}

output "table_name" {
  value = aws_dynamodb_table.conversation_state.name
}

output "table_arn" {
  value = aws_dynamodb_table.conversation_state.arn
}
