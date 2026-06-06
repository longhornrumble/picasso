# Prod-IaC Tier 4 — adopt the prod chat CloudFront distribution `E3G0LSWB1AQ9LP`

**Goal:** bring the live, hand-managed production distribution (alias `chat.myrecruiter.ai`,
account 614056832592) under Terraform via **import-in-place** — state-only, **zero live behavior
change** — so Remedy A (#435) can attach a `lambda` OAC + flip the BSH Function URL to `AWS_IAM`.

**Module:** `infra/modules/cloudfront-streaming-prod/` (one resource, `aws_cloudfront_distribution.streaming`).
**Gating:** `count = var.env == "production" ? 1 : 0` in `infra/main.tf`.
**Belt:** the existing prod belt (`infra-deploy-prod.yml`, `production.tfbackend`, `production.tfvars`,
`GitHubActionsDeployRole`, `production` approval gate). This tier adds NO new scaffolding.

> **Agent boundary:** the agent CANNOT mutate prod state (`terraform import`/`apply`) or self-approve
> the `production` gate (classifier hard-block). The **operator** runs the import + dispatches/approves
> the gated apply. The agent prepares the module, the import ID, and the acceptance checks below.

---

## The one delicate thing: the Remedy B `x-picasso-cf-origin` header

The streaming origin carries a live 64-char secret header that BSH validates — **stripping it 403s ALL
chat.** Tier 4 must not commit that value or let an apply remove it. Strategy (operator-chosen 2026-06-06):
the module **omits** `custom_header` from config and `lifecycle.ignore_changes = [origin]` suppresses
every origin diff, so the live hand-injected header is **untouched** by all applies. The secret is in
neither git nor state. Trade-off: TF does not reconcile any origin drift while this stands — **narrowed
in Remedy A** (which removes the ignore to attach the OAC, then strip-B deletes the redundant header).

---

## Phase A — Operator import (local, against the prod backend)

```bash
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
export AWS_PROFILE=chris-admin     # account 614056832592
cd infra
terraform init -reconfigure -backend-config=backend/production.tfbackend

# 1. PRE-IMPORT plan (scoped). Expect: 1 to add (the distribution), 0 change, 0 destroy.
terraform plan -var-file=envs/production.tfvars -target=module.cloudfront_streaming_prod

# 2. IMPORT the live distribution (import ID = the bare distribution ID).
terraform import -var-file=envs/production.tfvars \
  'module.cloudfront_streaming_prod[0].aws_cloudfront_distribution.streaming' \
  E3G0LSWB1AQ9LP
```

### Acceptance gate — the POST-IMPORT plan must be effectively zero-change

```bash
terraform plan -var-file=envs/production.tfvars -target=module.cloudfront_streaming_prod
```

**PASS = `0 to add, 1 to change (tags only), 0 to destroy`** — the only change is `default_tags`
adoption (`Environment=production` + `ManagedBy=terraform` + `Project=myrecruiter`), preserving the
existing `Name=PicassoTenants` tag. The distribution config itself shows **no diff**.

**If the plan shows ANY distribution-config change** (a behavior, origin, cert, WAF, policy-id diff),
**STOP — do not apply.** Fix the module to match live, re-plan to zero. Likely culprits if a diff appears:
- a behavior attribute (methods set, cache/ORP/RHP policy id, `compress`, `viewer_protocol_policy`),
- `origin_path = "/primary"` on `picasso-lambda-api`,
- the WAF must be the full ARN, the cert `sni-only`/`TLSv1.2_2021`.
Origin diffs should NOT appear (suppressed by `ignore_changes = [origin]`); if one does, the ignore
isn't taking — investigate before applying.

Back the import out safely if needed (nothing live changed yet):
```bash
terraform state rm 'module.cloudfront_streaming_prod[0].aws_cloudfront_distribution.streaming'
```

---

## Phase B — Gated apply (operator dispatches + approves)

Dispatch the prod belt, `-target`-scoped to this module only:

```bash
gh workflow run infra-deploy-prod.yml --repo longhornrumble/picasso --ref main \
  -f target=module.cloudfront_streaming_prod
```

Approve the run at the **`Production`** gate (NOT the `Deploy to Production` app-deploy — that one is
rejected on infra merges). **Expected apply: `0 add, 1 change (tags only), 0 destroy`.** Tag updates are
metadata-only — no distribution redeploy, no edge propagation of behavior.

### Live no-behavior-change verification (post-apply)

```bash
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
# 1. Chat still streams through CloudFront (header still injected) → 200 + SSE:
curl -s -o /dev/null -w '%{http_code}\n' -N https://chat.myrecruiter.ai/stream \
  -H 'content-type: application/json' -d '{"tenant_hash":"...","user_input":"hi"}'   # 200
# 2. Direct Function URL with no header still rejected (Remedy B intact) → 403:
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://xqc4wnxwia2nytjkbw6xasjd6q0jckgb.lambda-url.us-east-1.on.aws/ \
  -H 'content-type: application/json' -d '{"tenant_hash":"PROBE","user_input":"x"}'   # 403
# 3. Widget edge serves static + tenant config:
curl -s -o /dev/null -w '%{http_code}\n' https://chat.myrecruiter.ai/            # 200
aws cloudfront get-distribution --id E3G0LSWB1AQ9LP --profile chris-admin --query 'Distribution.Status'  # Deployed
```

---

## Rollback / break-glass

- **Pre-apply:** trivial — nothing live changed; `terraform state rm …` backs out the import.
- **Post-apply gone wrong (live mutated):** the canonical live config is captured immutable at
  `Sandbox/tier4-cf-recon/dist-config-1780775235.json` (ETag `EKLOTZYGLUMT1`). Restore by extracting its
  `.DistributionConfig` and:
  `aws cloudfront update-distribution --id E3G0LSWB1AQ9LP --distribution-config file://<cfg> --if-match <current-ETag> --profile chris-admin`
  then re-inject the `x-picasso-cf-origin` header on the streaming origin if it was stripped. Keep that
  JSON until Tier 4 is signed off.

---

## Remedy A readiness (the seams this tier leaves)

After Tier 4, Remedy A becomes small, two-module edits:
- **This module:** add an `aws_cloudfront_origin_access_control` (`origin_type = "lambda"`,
  `signing_behavior = "always"`, `signing_protocol = "sigv4"`), set `origin_access_control_id` on the
  streaming origin (the empty seam), and **narrow** `ignore_changes` off `origin`.
- **`bsh-function-prod`:** flip the Function URL `authorization_type` `NONE → AWS_IAM`; add a
  `lambda:InvokeFunctionUrl` grant to `cloudfront.amazonaws.com` with
  `aws:SourceArn = module.cloudfront_streaming_prod[0].distribution_arn` (this module already exports
  `distribution_arn`).
- **strip-B (last, after IAM signing proven):** delete the live `x-picasso-cf-origin` header + retire
  the Remedy B env/grant/secret.

Do NOT start Remedy A until Tier 4 is applied + the zero-change verification passes.
