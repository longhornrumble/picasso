# Production (account 614056832592). Phase 2 of P0.
# `env` value mirrors the live convention (staging / production) — NOT a translated
# "prod" — so default_tags `Environment = production` matches live, with zero translation.
# Resource names stay BARE (account = environment); env is carried only by this value.
#
# NOTE: nearly every module in main.tf is gated `count = var.env == "staging" ? 1 : 0`,
# so they do NOT instantiate in production. The currently-production-enabled modules are
# `picasso_form_tables` (un-gated, legacy `-${var.env}` names) and `ops_alarms_bsh_prod`
# (gated to production, bare names). Until the legacy suffix-named modules are made bare by
# the naming-alignment program, production applies are -target-scoped — see
# docs/runbooks/prod-iac-pilot-alarms.md.
env = "production"
