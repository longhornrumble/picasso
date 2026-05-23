resource "aws_dynamodb_table" "pii_dsar_audit" {
  name         = "picasso-pii-dsar-audit-staging"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "dsar_id"
  range_key    = "event_timestamp"

  attribute {
    name = "dsar_id"
    type = "S"
  }

  attribute {
    name = "event_timestamp"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  # H4 (PR1 fix-now-4 / 🟡 N-2 closure): the `created_at_partition` attribute
  # is the ByCreatedAt GSI's hash key. The DSAR Lambda's `_write_audit_event`
  # populates it as `event_timestamp[:7]` (ISO YYYY-MM). Added at table-creation
  # time so the eventual counsel-determined purge can Query a year-month
  # partition instead of full-table Scan. Cheap now at zero-DSAR scale;
  # expensive online backfill if added retroactively.
  attribute {
    name = "created_at_partition"
    type = "S"
  }

  # Item 3 (EventBridge SLA alarm) scans for open DSARs nearing SLA. Defining the
  # GSI now on an empty table avoids an online index backfill once writes begin
  # (same pattern as ddb-pii-subject-index-staging's PiiSubjectIdIndex).
  global_secondary_index {
    name            = "StatusIndex"
    hash_key        = "status"
    range_key       = "event_timestamp"
    projection_type = "ALL"
  }

  # H4 / 🟡 N-2: ByCreatedAt GSI for eventual counsel-determined retention purge.
  # See docs/roadmap/PII-Project/audit-table-retention-runbook.md §3.
  global_secondary_index {
    name            = "ByCreatedAt"
    hash_key        = "created_at_partition"
    range_key       = "event_timestamp"
    projection_type = "ALL"
  }

  # C2 SSE-KMS DEFERRED (fix-now-4 PR1 partial-apply): the kms-pii-staging
  # key policy lacks a Principal: Service = dynamodb.amazonaws.com Allow.
  # DDB UpdateTable SSE→KMS rejects with AccessDeniedException ("DynamoDB
  # service principal does not have access to the key"). This is Apply-2
  # precondition territory per the Apply-1 phase-completion-audit (2026-05-19)
  # "Apply-2 MUST NOT proceed until G-3/4/5/6/7 satisfied." Plan v2.5 missed
  # this — methodological finding captured in fix-now-4 follow-up.
  #
  # Audit table remains on default DDB SSE (AWS-owned key) until the CMK
  # policy gains a DynamoDB service-principal Allow (separate Apply-2-aligned
  # PR). DeleteItem-Deny via resource policy below ships in PR1 as planned
  # — no CMK dependency.

  # No ttl block: DSAR audit rows must outlive the underlying subject data
  # (Art 17(3)(b) "legal claims" reasoning per D5 G-C). Retention policy is
  # counsel-pending; deletion-on-demand is not a property of this surface.
  # See docs/roadmap/PII-Project/audit-table-retention-runbook.md.

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "picasso-pii-dsar-audit-staging"
  }
}

# C2 (PR1 fix-now-4): DDB resource policy explicitly denies DeleteItem to ALL
# principals (including the DSAR Lambda's own execution role). Structural
# enforcement of the Art 17(3)(b) audit-immutability posture. Lifting this
# Deny for an eventual counsel-determined purge is a deliberate IaC change —
# see audit-table-retention-runbook.md §4 for the lift+purge+re-apply sequence.
#
# Why DDB resource policy instead of KMS-policy-side Deny:
#   `dynamodb:DeleteItem` is a DDB API action; KMS key-policy SIDs that
#   reference `kms:Decrypt`/`kms:GenerateDataKey*` cannot directly Deny a DDB
#   data-plane API. Security-Reviewer SR-B caught this in the fix-now-4 audit;
#   the correct mechanism is the DynamoDB resource policy (Nov 2023 GA;
#   requires aws provider >= 5.27 — confirmed pinned via .terraform.lock.hcl
#   at 5.100.0).
#
# Why this action list:
#   M1 phase-completion-audit row 10 (Security SR1, 2026-05-23) found that
#   DeleteItem-only Deny does NOT block other tamper vectors. This statement
#   expands to the 4 actions that AWS DynamoDB resource policies SUPPORT:
#     - DeleteItem (row delete; primary protection)
#     - BatchWriteItem (separate API; can carry DeleteRequest entries —
#       DeleteItem Deny does NOT propagate)
#     - UpdateItem (effective tamper by overwriting status/details fields)
#     - DeleteTable (table-level destruction; resource policies attach to
#       the table ARN and CAN block this)
#
# What we tried and AWS rejected (fix-forward 2026-05-23 — original PR #169
# deploy failed with ValidationException):
#     - dynamodb:ExecuteStatement, dynamodb:BatchExecuteStatement (PartiQL)
#     ARE valid IAM actions but are NOT in the DynamoDB resource-policy
#     supported-action list. AWS PutResourcePolicy rejects them with
#     "ValidationException: The following action names are invalid".
#
# Residual gap (compensating controls; not preventable via DDB resource
# policy):
#     - PartiQL DELETE statements (via ExecuteStatement / BatchExecuteStatement)
#       MUST be Denied at the IAM policy level on every principal that has
#       access to this table. Today: the DSAR Lambda's execution role only has
#       scoped read/delete on the data-plane tables (per the M1 tenant-
#       isolation control plan); operator SSO has AdministratorAccess which
#       can issue PartiQL via console or CLI but is operator-in-the-loop
#       (Control 5). M1 audit row 10 closes for the 4 row-mutation actions
#       above; PartiQL coverage is filed as audit-finding-post-M1-row10 for
#       a future IAM-level Deny statement on the operator role (or for
#       move to a dedicated DSAR-operator role distinct from break-glass
#       admin).
#     - RestoreTableToPointInTime is NOT preventable via resource policy
#       (it's a create-not-delete action); compensating control = PITR
#       retention discipline + monitoring on RestoreTable API calls.
resource "aws_dynamodb_resource_policy" "audit_delete_deny" {
  resource_arn = aws_dynamodb_table.pii_dsar_audit.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AuditDeleteDeny"
        Effect    = "Deny"
        Principal = "*"
        Action = [
          "dynamodb:DeleteItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteTable",
        ]
        Resource = aws_dynamodb_table.pii_dsar_audit.arn
      },
    ]
  })
}

output "table_name" {
  value = aws_dynamodb_table.pii_dsar_audit.name
}

output "table_arn" {
  value = aws_dynamodb_table.pii_dsar_audit.arn
}
