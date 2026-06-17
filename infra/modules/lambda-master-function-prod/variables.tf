# ─────────────────────────────────────────────────────────────────────────────
# lambda-master-function-prod: variables
#
# All prod-fixed values (function name, role ARN, all env vars) are hardcoded
# in main.tf, mirroring bsh-function-prod's convention — variables are kept
# minimal (just the env gate + any operator-overridable knobs).
# ─────────────────────────────────────────────────────────────────────────────

variable "env" {
  description = "Deployment environment. Module resources are gated to production only."
  type        = string
}
