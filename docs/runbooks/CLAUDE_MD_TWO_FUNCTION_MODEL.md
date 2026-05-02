# CLAUDE.md — Document the Two-Function Lambda Deployment Model

**Status:** DRAFT — placeholder. Update CLAUDE.md to match the deployment model that was clarified on 2026-05-02.

## What needs updating

`CLAUDE.md` files reference Master_Function and Master_Function_Staging without explicitly documenting the deployment model. As of 2026-05-02, the user has explicitly chosen the **two-function** pattern (separate Lambdas for staging and production, no aliases).

The relevant CLAUDE.md files in this repo:

- `/CLAUDE.md` (root) — references `Master_Function_Staging` in the function list
- `/Picasso/CLAUDE.md` — has a Lambda Functions section listing both
- `/picasso-config-builder/CLAUDE.md` — references the API Lambda but not Master_Function

## What to change

Add an explicit "Lambda deployment model" section to the root `CLAUDE.md` (and cross-reference from `Picasso/CLAUDE.md`). Suggested content:

```markdown
## Lambda Deployment Model

The Picasso Lambda functions follow a **two-function pattern** for environment isolation:

| Production function | Staging function | Pattern |
|---|---|---|
| `Master_Function` | `Master_Function_Staging` | Two separate Lambdas (no aliases) |
| `Bedrock_Streaming_Handler` | `Bedrock_Streaming_Handler_Staging` | Two separate Lambdas (no aliases) |
| `Picasso_Config_Manager` | (production-only — used by both prod and staging widgets via the picasso-config-api endpoint) | Single function |

### Why two-function instead of aliases

Aliases on a single Lambda (`Master_Function:staging`, `Master_Function:production`) were the original pattern but were abandoned because:

1. **Typo-proof production.** A typo in `--function-name` lands in "function not found," not in production. Aliases offered no such structural guardrail (`--name production` vs `--name prod` could match different things).
2. **Deploy isolation.** Two functions = two independent code packages, IAM roles, env vars, log groups. Easier to reason about.
3. **Solo + AI team safety.** No multi-engineer review on deploys; structural typo-prevention is more valuable than alias versioning automation.

### Native Lambda versioning still applies

Each function still publishes versions on every deploy:

\`\`\`bash
aws lambda update-function-code --function-name Master_Function_Staging --zip-file fileb://...
aws lambda publish-version --function-name Master_Function_Staging --description "..."
\`\`\`

Rollback is `update-function-code` against a previous artifact, or restore from version history via the Lambda console.

### Deploy promotion

Code flows staging → production via manual deploy:

1. Edit + test on `Master_Function_Staging`
2. Once verified, deploy same code to `Master_Function`
3. Each environment's deploy publishes its own version with descriptive notes

### Vestigial aliases (post-2026-05-02 cleanup pending)

`Master_Function` currently still has `staging` and `STAGING` aliases pointing at old test versions. These are vestigial and pending cleanup (see lambda repo PR #39). Do not use them.
```

Also update the Lambda Functions list in `Picasso/CLAUDE.md` to be explicit about which is staging and which is production for each pair.

## Acceptance criteria

- [ ] Root `CLAUDE.md` has a "Lambda Deployment Model" section
- [ ] `Picasso/CLAUDE.md` Lambda Functions list explicitly distinguishes staging and production
- [ ] No remaining ambiguity about whether `Master_Function:staging` is wired to anything (it's not, per the 2026-05-02 architecture migration)
- [ ] Cross-references to lambda repo PRs #37, #38, #39 for the underlying architecture work

## Why this is a tracker, not the actual fix

The actual edit is straightforward (~1 hour of careful writing). It's deferred because:
- It's lowest-priority of all the cleanup items
- CLAUDE.md updates should ideally happen alongside the actual architecture changes (post-promotion), so the doc reflects the final state
- A future session picks this up after PRs #37/#38/#39 in the lambda repo settle

## Links

- [lambda PR #37 — Promotion brief](https://github.com/longhornrumble/lambda/pull/37)
- [lambda PR #38 — Promotion event placeholder](https://github.com/longhornrumble/lambda/pull/38)
- [lambda PR #39 — Vestigial alias cleanup](https://github.com/longhornrumble/lambda/pull/39)
