# Append-only audit table for the per-tenant offboarding purge Lambda
# (picasso-pii-tenant-purge-staging, lambda#214). P1 of the
# data-retention-strategy.md §9 "per-tenant offboarding purge"; design doc
# docs/roadmap/PII-Project/tenant-offboarding-purge-design.md (picasso#361).
#
# Dedicated audit table (NOT the DSAR audit table) per the design's clean-
# separation rationale + CLAUDE.md never-share-resources: the purge is a
# distinct capability with its own role; it writes its own audit trail and
# never reads or deletes it. Schema mirrors picasso-pii-dsar-audit:
# the Lambda's `_write_audit_event` writes PK=purge_id, SK=event_timestamp,
# plus `created_at_partition = event_timestamp[:7]` for a future counsel-
# determined retention purge by year-month partition.

resource "aws_dynamodb_table" "purge_audit" {
  name         = "picasso-pii-tenant-purge-audit"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "purge_id"
  range_key    = "event_timestamp"

  attribute {
    name = "purge_id"
    type = "S"
  }

  attribute {
    name = "event_timestamp"
    type = "S"
  }

  # ByCreatedAt GSI hash key. Defined on the empty table now (cheap) to avoid
  # an online index backfill once writes begin — same pattern as the DSAR
  # audit table's ByCreatedAt. Enables an eventual counsel-determined audit
  # purge to Query a YYYY-MM partition instead of a full-table Scan.
  attribute {
    name = "created_at_partition"
    type = "S"
  }

  global_secondary_index {
    name            = "ByCreatedAt"
    hash_key        = "created_at_partition"
    range_key       = "event_timestamp"
    projection_type = "ALL"
  }

  # No StatusIndex GSI: unlike the DSAR audit table (which feeds an SLA-monitor
  # Lambda that Queries by status), the purge has no SLA-monitor consumer.
  # Omitted per Simplicity-First; add only if a consumer materializes.

  # No ttl block: audit rows must outlive the purged subject data (Art 17(3)(b)
  # "legal claims" reasoning, mirroring the DSAR audit table). Retention is
  # counsel-pending; deletion-on-demand is not a property of this surface.

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-pii-tenant-purge-audit"
  }
}

# Immutability resource policy — Deny the row-mutation + table-destruction
# actions to ALL principals (including the purge Lambda's own execution role,
# which only ever PutItem-s). Mirrors the DSAR audit table's AuditDeleteDeny.
# Lifting this for an eventual counsel-determined purge is a deliberate IaC
# change (Deny lift -> purge -> re-apply). The 4 actions are exactly those the
# DynamoDB resource-policy supported-action list accepts (PartiQL
# ExecuteStatement/BatchExecuteStatement are NOT resource-policy-supported and
# are rejected by PutResourcePolicy with ValidationException — see the DSAR
# audit module note). PartiQL DELETE coverage relies on the IAM-level absence
# of those actions on the purge role (it has only Query/DeleteItem on data
# tables + PutItem here) plus operator-in-the-loop discipline.
resource "aws_dynamodb_resource_policy" "audit_immutability" {
  resource_arn = aws_dynamodb_table.purge_audit.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PurgeAuditMutationDeny"
        Effect    = "Deny"
        Principal = "*"
        Action = [
          "dynamodb:DeleteItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteTable",
        ]
        Resource = aws_dynamodb_table.purge_audit.arn
      },
    ]
  })
}

output "table_name" {
  value = aws_dynamodb_table.purge_audit.name
}

output "table_arn" {
  value = aws_dynamodb_table.purge_audit.arn
}
