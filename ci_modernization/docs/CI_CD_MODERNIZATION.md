# CI/CD Modernization — Platform-Wide

**Status:** Superseded for execution by [`MODERNIZATION_PLAN.md`](MODERNIZATION_PLAN.md) (approved 2026-06-09; live-verified state + phased plan). This doc remains the problem statement. · **Created:** 2026-06-07 · **Type:** Roadmap / new-agent kickoff

> ⚠️ 2026-06-09 correction: the "manual `aws s3 sync`" claims below are stale — analytics-dashboard has
> working CI; config-builder has CI but its prod gate queue is stuck. See the plan doc's verified-state table.

> This doc doubles as the **kickoff prompt** for the agent that picks up this project. It is a starting
> brief, not a spec — ground-truth every claim against the live repos/AWS before designing.

---

## Problem

Deploy automation is inconsistent and partial across the four products:

- **Lambdas** auto-deploy to *staging* on merge to `main`, but **prod CI covers only 1 function**
  (`Analytics_Dashboard_API`). `Master_Function` (MFS) / `Bedrock_Streaming_Handler` (BSH) and the rest are
  **hand-deployed** and drift weeks-stale (the §P5.1 prod promote on 2026-06-07 was a manual build → zip →
  `update-function-code` → publish-version → hand-grant slog as a result).
- The **dashboards/builders** deploy via **manual local commands** (`npm run deploy:production`,
  `aws s3 sync … --profile chris-admin` + hand CloudFront invalidation).
- There is **no uniform, gated path** from commit → staging → prod with versioning and rollback.

## Goal

One consistent, gated CI/CD model for **all four products**:

> **push to `main` → CI deploys staging → soak → gated approval → CI deploys prod**,
> with versioned artifacts, release notes, and one-step rollback.

No manual builds, no local `aws s3 sync`, no hand-`update-function-code`.

## Products & current state (per root `CLAUDE.md` — verify live)

| Product | Repo / target | Today |
|---|---|---|
| **Lambdas** | `longhornrumble/lambda` → 30+ funcs (614/525) | staging CI ✅; prod CI = only `Analytics_Dashboard_API`; MFS/BSH hand-deployed |
| **Picasso** (widget) | Picasso → S3/CloudFront | has a `deploy-production.yml`; confirm staging + gating actually exist |
| **Config Builder** | `picasso-config-builder` → S3 `picasso-config-builder-prod` + Lambda `picasso-config-api` | manual `npm run deploy:production` |
| **Analytics Dashboard** | `picasso-analytics-dashboard` → S3 `app-myrecruiter-ai`, CF `EJ0Y6ZUIUBSAT` | manual `aws s3 sync --profile chris-admin` + hand CF invalidation |

## Cross-cutting facts / landmines (verify live — don't trust this list)

- **Accounts = environments:** prod 614 (`myrecruiter-prod`), staging 525 (`myrecruiter-staging`).
  **HARD STOP at prod** — the agent stages/plans; the operator runs prod mutations and approves the gate
  (agents **cannot** self-approve the `production` GitHub-environment gate). Prod deploy auth: OIDC
  `AWS_DEPLOY_ROLE_ARN`.
- **Lambda build landmines:**
  - MFS zip uses an `include_globs` **allowlist** in `deploy-staging.yml` — new runtime `.py` are **silently
    dropped** if not added (cost §P5.1 twice). See memory `reference_lambda_deploy_include_globs_allowlist`.
  - BSH builds with **`npm ci` (FULL deps) && npm run package** — `npm ci --production` **fails** (esbuild is a
    devDependency). Its Function URL is `InvokeMode RESPONSE_STREAM` + `AuthType AWS_IAM` + cf-origin enforced —
    **don't disturb.** Use Lambda **versions/aliases** for atomic rollback (current scheme is messy: `$LATEST`
    drifted from the highest published version; the URL serves `$LATEST` with no alias).
- **Front-end deploys** must include **CloudFront invalidation** as a pipeline step (today done by hand).
- **Scope boundary:** a prod-Terraform / `*-staging`↔`*-prod` module convergence is a **separate in-flight
  project** (one-writer-per-module — coordinate). **This project is the app/artifact deploy layer, not infra.**
- **Code is identical across envs** (built from `main`); **config/secrets differ by design** — do **not** try to
  "mirror" env values across accounts.

## SOP

Branch from `main` (no direct commits to `main`); run `verify-before-commit` before commits;
run `phase-completion-audit` before declaring done; respect the staging↔main drift cap.

## Where to start

1. Inventory each product's **real** build+deploy mechanism (read each repo's existing workflows + the
   `Commands` section of the root `CLAUDE.md`).
2. Propose **one uniform pipeline shape** (staging-on-merge → gated prod with versioned rollback).
3. Sequence the rollout — likely **Lambdas first** (finish the prod matrix: add MFS + BSH to
   `deploy-production.yml`, mirroring the proven `deploy-staging.yml` build steps), then the two S3/CloudFront
   front-ends (Config Builder, Analytics Dashboard), then Picasso.

## Reference (from the 2026-06-07 §P5.1 prod promote that motivated this)

- The manual prod promote of MFS+BSH that exposed the gap: memory
  `project_pii_p51_prod_deploy_runbook_2026-06-06` (exact hand-deploy steps, build commands, rollback bundles,
  version-publish convention).
- The include_globs allowlist landmine: `reference_lambda_deploy_include_globs_allowlist`.
