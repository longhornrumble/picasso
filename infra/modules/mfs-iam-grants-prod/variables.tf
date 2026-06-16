# ─────────────────────────────────────────────────────────────────────────────
# mfs-iam-grants-prod: variables
#
# Mirrors bsh-iam-grants-prod convention: minimal variables (env gate + role
# name). All policy documents are hardcoded — a faithful byte-exact import
# of the live policies is the goal; parameterisation would risk value drift.
# ─────────────────────────────────────────────────────────────────────────────

variable "env" {
  description = "Deployment environment. Module resources are gated to production only."
  type        = string
}

variable "role_name" {
  description = "Name of the hand-managed prod MFS execution role whose inline policies this module adopts. The role itself is NOT managed here — only its 14 inline policies."
  type        = string
  default     = "Master_Function-role-zyux77wq"
}
