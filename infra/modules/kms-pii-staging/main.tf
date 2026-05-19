# Consumer PII Remediation Path A, Phase 2 — scoped CMK for the PII surface.
#
# Design: docs/roadmap/PII_DELETE_PIPELINE_DESIGN.md §6 (rev 3, gate-cleared).
# A SCOPED customer-managed key (NOT a platform-wide pass) encrypting the
# DELETE-scoped DynamoDB PII set. Follows the Q5 Row-7 precedent and the
# feedback_secret_admin_unread_antipattern lesson: general staging
# Admin/PowerUser must NOT be able to decrypt by default.
#
# DELIBERATE: this module creates ONLY the key + alias. The key POLICY is set
# at root level via `aws_kms_key_policy.pii_staging` in infra/main.tf — the
# exact same cycle-break the repo already uses for the JWT/Clerk/Meta/BSH
# `aws_secretsmanager_secret_policy` resources: the NB-A key policy must name
# the delete / back-fill / break-glass role ARNs, those roles are created in
# the lambda-pii-delete-staging module, and that module needs THIS key's ARN
# for its kms:Decrypt grant — a cycle if the policy lived here. Splitting the
# policy to root makes it a DAG (kms → roles → root key-policy).
#
# Until the root `aws_kms_key_policy` applies (same `terraform apply`), the key
# carries the AWS default policy (root full access). That transient is
# acceptable: it is within one apply, the table is not yet CMK-associated
# (Apply 2, design §13), and there is zero live-tenant traffic (verified).

resource "aws_kms_key" "pii" {
  description             = "Scoped CMK for Consumer PII Remediation Path A — DELETE-scoped DynamoDB PII tables (design PII_DELETE_PIPELINE_DESIGN.md §6). Policy set at root (aws_kms_key_policy.pii_staging)."
  enable_key_rotation     = true
  deletion_window_in_days = 7

  # policy intentionally omitted — owned by aws_kms_key_policy.pii_staging at
  # root (see header). Specifying it here too would perpetually diff against
  # that resource (provider: the two cannot both manage the policy).
}

resource "aws_kms_alias" "pii" {
  name          = "alias/picasso-pii-staging"
  target_key_id = aws_kms_key.pii.key_id
}

output "key_arn" {
  value = aws_kms_key.pii.arn
}

output "key_id" {
  value = aws_kms_key.pii.key_id
}

# Exposed so the DELETE-scoped DDB modules / lambda modules set the CMK by
# alias explicitly (Apply 2, design §13) rather than relying on a code default.
output "key_alias" {
  value = aws_kms_alias.pii.name
}
