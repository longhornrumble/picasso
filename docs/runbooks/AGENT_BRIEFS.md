# Agent Briefs — 2026-05-02 Session Follow-up PRs

**How to use this file.** Each section below is a self-contained brief for one PR. To assign work to an agent, copy that PR's section and hand it to the agent — no other reading required. Each section repeats relevant context so it stands alone.

**Sequencing.** Some PRs have hard dependencies (P0a Phase 2 deploy must happen before #38 promotion; #38 must merge before #39 alias cleanup). The summary table at the top of each section names blocking conditions. **Do not assign a PR whose blocking conditions aren't met.**

---

## Quick reference table — which PRs are ready to assign now

| PR | Status | Ready to assign? |
|---|---|---|
| [#37](https://github.com/longhornrumble/lambda/pull/37) — promotion brief (lambda) | OPEN, ready to merge | ✅ Yes — merge directly, no agent needed |
| [#57](https://github.com/longhornrumble/picasso/pull/57) — orchestration map | OPEN, ready to merge | ✅ Yes — merge directly, no agent needed |
| [#55](https://github.com/longhornrumble/picasso/pull/55) — canonical adversarial review | DRAFT | ✅ Yes — see Brief A |
| [#56](https://github.com/longhornrumble/picasso/pull/56) — schema spec adversarial review | DRAFT | ✅ Yes — see Brief B |
| [#35](https://github.com/longhornrumble/lambda/pull/35) — Master_Function_Staging test debt | DRAFT | ✅ Yes — see Brief C |
| [#53](https://github.com/longhornrumble/picasso/pull/53) — CloudFront Origin forwarding | DRAFT | ⚠️ Yes, but production CloudFront needs user authorization — see Brief D |
| P0a Phase 2 deploy (not a PR) | scheduled | ⏳ Earliest 2026-05-03 ~20:35 UTC — see Brief E |
| [#38](https://github.com/longhornrumble/lambda/pull/38) — Master_Function staging→prod promotion | DRAFT | ❌ NOT yet — needs P0a Phase 2 + 1 week stable + pre-flight done. See Brief F |
| [#39](https://github.com/longhornrumble/lambda/pull/39) — vestigial alias cleanup | DRAFT | ❌ NOT yet — needs #38 merged + 7 days stable. See Brief G |
| [#54](https://github.com/longhornrumble/picasso/pull/54) — CLAUDE.md two-function model docs | DRAFT | ❌ NOT yet — ideally lands after #38. See Brief H |

---

## Brief A — Canonical adversarial review (PR #55)

### Assign to

`system-architect` (lead) plus `tech-lead-reviewer` and `Security-Reviewer` running in parallel as reviewer agents.

### Paste this to your agent

```
You are the lead reviewer on a 3-reviewer adversarial pass for the scheduling project's canonical design doc.

PR: https://github.com/longhornrumble/picasso/pull/55
Branch: docs/scheduling-canonical-adversarial-review

Why this exists: scheduling/docs/scheduling_design.md (1556 lines) is the source of truth for the scheduling v1 feature. During the 2026-05-02 session, three sibling docs (implementation plan, UI plan, CI strategy) each received 2-3 reviewer adversarial passes and ~50 findings were applied. The canonical was lightly amended in that session (§11 missed-event cadence, §2.3+§17 V4→V5 reframing, §8 permissions reference) but never independently adversarially reviewed. Inconsistencies likely lurk — both internal (between sections) and external (vs sibling docs).

Your task:
1. Checkout branch docs/scheduling-canonical-adversarial-review.
2. Read these files end-to-end:
   - docs/runbooks/SCHEDULING_CANONICAL_REVIEW.md (your protocol — follow it)
   - scheduling/docs/scheduling_design.md (the canonical, 1556 lines)
   - scheduling/docs/scheduling_implementation_plan.md
   - scheduling/docs/scheduling_ui_plan.md
   - scheduling/docs/scheduling_ci_strategy.md
   - scheduling/docs/scheduling_config_schema.md
3. Internal consistency audit: do §11, §9.2, §10.1, §10.2, §13, §5.7, §12 agree? Does §2.3 (post-2026-05-02 V4→V5 amendment) match §17?
4. Spawn in parallel: tech-lead-reviewer + Security-Reviewer agents. Each gets the canonical + sibling docs + a focused critique angle (tech-lead = scope/feasibility/coherence; Security-Reviewer = §13 unified token + §5.7 PII + §14 push notifications). Wait for their findings.
5. Consolidate all findings into Critical / Material / Minor tiers.
6. Apply Tier 1 (Critical) and Tier 2 (Material) edits to the canonical. Surface Tier 3 (Minor) and any strategic items to the user before applying.
7. Re-spawn the same three reviewers in proofing mode after edits to verify findings were applied correctly.
8. Update docs/runbooks/SCHEDULING_CANONICAL_REVIEW.md with the execution log + findings summary.
9. Promote PR #55 from draft → ready, request user merge.

Authorization checkpoint: STOP and ask user before applying any Critical finding that would materially change v1 scope or contradict an already-merged sibling doc.

Acceptance criteria:
- All internal inconsistencies resolved
- No contradictions vs implementation plan / UI plan / CI strategy / schema spec
- Reviewer findings applied or explicitly waived (with rationale, severity, date)
- Change log entry added to canonical
- Memory entry written: project_scheduling_canonical_review_complete_<date>.md

Effort estimate: 2-4 hours.
```

---

## Brief B — Schema spec adversarial review (PR #56)

### Assign to

`typescript-specialist` (single-reviewer pass).

### Paste this to your agent

```
You are reviewing the scheduling project's config schema spec.

PR: https://github.com/longhornrumble/picasso/pull/56
Branch: docs/scheduling-config-schema-adversarial-review

Why this exists: scheduling/docs/scheduling_config_schema.md (~298 lines) is the engineer-blocking artifact resolving §20 item 1 of the scheduling canonical. Tasks A3, A4, A5 (already merged) implemented this spec. The spec has never been adversarially reviewed; bugs in it become bugs in implementation.

Your task:
1. Checkout branch docs/scheduling-config-schema-adversarial-review.
2. Read these files:
   - docs/runbooks/SCHEDULING_CONFIG_SCHEMA_REVIEW.md (your protocol — follow it)
   - scheduling/docs/scheduling_config_schema.md (the schema spec)
   - scheduling/docs/scheduling_design.md (canonical, for cross-checking)
3. Internal consistency: verify every cross-section invariant in §10 references fields that exist in §3-§9; every Zod enum lists complete sets; every superRefine rule is implementable; defaults are sensible.
4. Cross-doc consistency: compare against the merged Zod implementations in:
   - picasso-config-builder/src/lib/schemas/scheduling.schema.ts (A3)
   - picasso-config-builder/src/lib/schemas/cta.schema.ts (A4)
   - picasso-config-builder/src/lib/schemas/tenant.schema.ts (A5)
5. Apply edits to the schema spec for any drift found.
6. If findings reveal a gap in the merged Zod code (not just the spec), file separate follow-up tasks — DO NOT conflate review fixes with code fixes.
7. Update docs/runbooks/SCHEDULING_CONFIG_SCHEMA_REVIEW.md with execution log.
8. Promote PR #56 draft → ready, request user merge.

Authorization checkpoint: STOP and ask user if you find that merged Zod code (A3/A4/A5) materially deviates from the schema spec — that's a real bug, not a doc issue.

Acceptance criteria:
- All §10 invariants traceable to specific superRefine rules in merged code
- No fields in spec that the implementation never uses
- No fields in merged Zod that the spec doesn't document
- Defaults documented + rationale captured

Effort estimate: ~1 hour.
```

---

## Brief C — Master_Function_Staging Python test debt (PR #35)

### Assign to

`Backend-Engineer` (or `test-engineer` for the test-specific work).

### Paste this to your agent

```
You are fixing 101 logic test failures in Master_Function_Staging.

PR: https://github.com/longhornrumble/lambda/pull/35
Branch: chore/master-function-test-debt-tracking

Why this exists: PR #34 (merged 2026-05-02) repaired the test infrastructure (installed moto, fixed syntax errors). That repair surfaced 101 pre-existing logic test failures that had been hidden behind import-time collection errors. The failures cluster into 8 root-cause categories — fixing them requires real engineering work, not just config changes.

Your task:
1. Checkout branch chore/master-function-test-debt-tracking in the lambda repo.
2. Read Master_Function_Staging/TEST_DEBT.md end-to-end. It enumerates:
   - All 8 failure clusters by root cause
   - Affected files per cluster
   - Fix pattern for each (with code examples)
   - Effort estimate per cluster (~4.5 hours total)
   - Per-cluster verification protocol
3. Resolve clusters in order (1 → 8). Some early fixes resolve later failures as side effects; recategorize after each cluster.
4. Per-cluster commit pattern: "fix(test-debt): Cluster N — [name]: X passing tests recovered"
5. After all clusters, run `python -m pytest -q` in Master_Function_Staging/. Confirm 273/273 passing.
6. Promote PR #35 draft → ready, request user merge.

CI behavior: PR #35 currently shows red CI on Master_Function_Staging Python tests — that's expected (it's the failures you're fixing). Other Lambda CI checks should be green.

Authorization checkpoint: STOP and ask user if any cluster reveals a real production code bug (not a test bug). File separate fix PR; do not fold into this debt cleanup.

Acceptance criteria:
- All 273 tests pass on CI runner (not just locally)
- No pytest.skip markers added (every fix is real)
- No tests deleted unless the validated behavior was deliberately removed (with explicit code-side justification)
- All Lambda Checks Passed CI gate green for Master_Function_Staging

Effort estimate: ~4.5 hours focused.
```

---

## Brief D — CloudFront Origin header forwarding (PR #53)

### Assign to

`DevOps` agent. `Security-Reviewer` for review-only role.

### Paste this to your agent

```
You are updating CloudFront distributions to forward the Origin header to Lambda origins.

PR: https://github.com/longhornrumble/picasso/pull/53
Branch: fix/cloudfront-origin-header-forwarding

Why this exists: during P0a Phase 1 verification on 2026-05-02, a curl request explicitly setting Origin: https://staging.chat.myrecruiter.ai resulted in CloudWatch logs that showed only the synthetic CloudFront `via` header — no Origin. The Lambda's CORS allowlist logic (validate_cors_origin in lambda_function.py, restored in PR #36) consequently can't differentiate origins and falls back to wildcard. Defense-in-depth concern, not active vulnerability.

Your task:
1. Checkout branch fix/cloudfront-origin-header-forwarding in the picasso parent repo.
2. Read docs/runbooks/CLOUDFRONT_ORIGIN_HEADER_FORWARDING.md end-to-end.
3. Identify the Origin Request Policy attached to each affected cache behavior on:
   - CloudFront E1CGYA1AJ9OYL0 (staging.chat.myrecruiter.ai)
   - CloudFront E3G0LSWB1AQ9LP (chat.myrecruiter.ai — production)
4. For Lambda-backed cache behaviors only (`/Master_Function*`, `/stream*`, etc. — NOT S3-backed `/tenants/*`, `/collateral/*`):
   - Either attach an Origin Request Policy that forwards the Origin header (recommended)
   - Or update the legacy ForwardedValues.Headers list
5. Verify with curl that the Origin header now reaches the Lambda (visible in CloudWatch logs under request headers).
6. Verify the response's Access-Control-Allow-Origin header reflects the actual request origin (not wildcard).
7. Update the runbook with execution log.
8. Promote PR #53 draft → ready, request user merge.

CRITICAL authorization checkpoint: BEFORE touching the production CloudFront distribution (E3G0LSWB1AQ9LP), STOP and request explicit user authorization. Production CloudFront is shared infrastructure and any policy change can affect live traffic. Verify on staging FIRST, then ask user before touching production.

Caching consideration: forwarding Origin adds it to the cache key, fragmenting the cache by origin. Verify the cache TTLs on affected behaviors are 0 (dynamic) before flipping the policy. If any behavior caches at all, evaluate whether per-origin cache entries are acceptable.

Acceptance criteria:
- After fix, curl with `-H "Origin: ..."` produces Lambda log showing the Origin header
- Response's Access-Control-Allow-Origin reflects the actual request origin
- Same verified on production with appropriate origin
- No caching regressions

Effort estimate: 1-2 hours.
```

---

## Brief E — P0a Phase 2 staging deploy (NOT a PR)

### Assign to

`Backend-Engineer`, but this is **user-driven**. Agent assists; user authorizes each step.

### Paste this to your agent

```
You are executing P0a Phase 2 (decoder hardening) on the staging Lambda. This is the second phase of a JWT iss-claim hardening rollout.

NO PR exists for this; the work is a deploy event. Phase 2 will likely produce a new PR for the decoder code change.

Why this exists: PR #33 (merged 2026-05-02) added 'iss': 'myrecruiter-chat' to all 5 chat-session JWT issuance points in Master_Function_Staging. That was Phase 1. Phase 2 hardens the decoders to require + validate the iss claim. The 25-hour gap between phases ensures all live tokens have been re-issued with iss before any decoder rejects tokens lacking it.

Pre-conditions (verify all true before proceeding):
- P0a Phase 1 prod deploy timestamp ≥25 hours ago. Phase 1 deployed 2026-05-02 ~19:35 UTC; earliest Phase 2 = 2026-05-03 20:35 UTC.
- Staging Master_Function_Staging has been running cleanly with Phase 1 code (no ImportError spikes, no auth failures).
- It is NOT a Friday or holiday (per feedback_deploy_timing.md).

Your task:
1. Branch off main in lambda repo: `git checkout -b security/jwt-iss-claim-decoder-phase2`
2. In Master_Function_Staging/, modify the two decoder calls:
   - lambda_function.py:913 — add options={"require": ["iss", "iat", "exp"]}, issuer="myrecruiter-chat"
   - conversation_handler.py:427 — same pattern
3. Run local pytest: ensure tests covering JWT round-trip still pass.
4. Test both backward and forward compatibility:
   - Token with iss → decodes successfully
   - Token without iss (legacy) → MissingRequiredClaim error
   - Token with wrong iss (e.g., "myrecruiter-scheduling") → InvalidIssuerError
5. Commit with clear message; push; open PR.
6. After CI green: deploy to staging Lambda:
   ```
   cd Lambdas/lambda/Master_Function_Staging
   zip -r deployment.zip . -x "*.pyc" "__pycache__/*" "test_*.py" "*.md" "TEST_DEBT.md"
   aws lambda update-function-code --function-name Master_Function_Staging --zip-file fileb://deployment.zip --profile chris-admin
   aws lambda publish-version --function-name Master_Function_Staging --description "P0a Phase 2: decoder hardening — require iss=myrecruiter-chat" --profile chris-admin
   ```
7. Tail CloudWatch on /aws/lambda/Master_Function_Staging.
8. User runs widget smoke test. Confirm chat works end-to-end.
9. If all green for 30+ minutes, declare Phase 2 staging complete.

Authorization checkpoints (must pause for user):
- BEFORE merging the PR (production-adjacent — same merge process as Phase 1)
- BEFORE running `aws lambda update-function-code` (modifying live staging Lambda)
- After deploy: user runs widget smoke test (you don't autonomously verify; you watch logs while user tests)

If smoke test fails: rollback via Lambda Console version history (or aws lambda update-function-code with prior zip). User decides whether to fix forward or roll back.

Acceptance criteria:
- Decoder enforcement live on Master_Function_Staging
- Widget smoke test produces clean turn-by-turn chat
- No spike in 401/JWT errors in CloudWatch
- Phase 2 commit timestamp recorded for use in future Master_Function staging→prod promotion

Effort estimate: ~1 hour (most of it is monitoring).
```

---

## Brief F — Master_Function staging→prod promotion (PR #38)

### DO NOT assign yet

This PR is gated on:
- P0a Phase 2 (Brief E) being live on staging ≥1 week with no incidents
- Pre-flight env-var audit complete per the brief
- All production-equivalent DDB tables confirmed to exist
- Production IAM role audited
- Maintenance window scheduled

When ready to assign, use the brief in `Lambdas/lambda/Master_Function_Staging/STAGING_TO_PROD_PROMOTION_BRIEF.md` (PR #37) and `Lambdas/lambda/Master_Function_Staging/PROMOTION_TRACKING.md` (PR #38). This is a multi-day, user-driven event with extensive pre-flight prep — not a single agent assignment. Treat as a coordinated event, not an autonomous task.

When you ARE ready, assign:

### Paste this to your agent

```
You are coordinating the Master_Function staging→production promotion event.

PR: https://github.com/longhornrumble/lambda/pull/38
Branch: chore/master-function-staging-to-prod-promotion
Companion: PR #37 (the brief, may already be merged)

Why this exists: production Master_Function has been frozen at version 14 (August 2025) while staging accumulated 9 months of work. PR #37's brief captures the full divergence + pre-flight checklist. This is the dedicated event to land all of staging on production.

Your task:
1. Checkout branch chore/master-function-staging-to-prod-promotion in lambda repo.
2. Read end-to-end:
   - Master_Function_Staging/PROMOTION_TRACKING.md (this PR)
   - Master_Function_Staging/STAGING_TO_PROD_PROMOTION_BRIEF.md (PR #37)
3. Execute the pre-flight checklist in §7 of the brief. This is multi-hour work — do NOT skip:
   - Env var audit: every os.environ reference in staging code must have a corresponding production env var
   - DynamoDB table audit: every table referenced (TENANT_REGISTRY_TABLE, MESSAGES_TABLE_NAME, etc.) must have a production-named equivalent
   - IAM role audit: production Lambda role must grant permissions for new tables/services
   - Tenant config audit: every prod tenant config must parse cleanly under new schemas
   - Bedrock compatibility: KB IDs and model configs match
4. Schedule the deploy maintenance window (avoid Friday/holiday per feedback_deploy_timing.md).
5. On the day:
   - Snapshot production tenant configs to S3 backup prefix
   - Verify v14 is queryable for emergency rollback: `aws lambda get-function --function-name Master_Function --qualifier 14`
   - Build deployment artifact: `cd Master_Function_Staging && zip ...`
   - Deploy: `aws lambda update-function-code --function-name Master_Function ...`
   - Wait for LastUpdateStatus: Successful
   - Publish version with note: "Promoted from staging — includes 9 months of accumulated work + P0a Phase 1 + Phase 2"
   - Update production alias to new version
   - Smoke test: open production widget; send 2-3 messages
6. Tail CloudWatch on /aws/lambda/Master_Function for 30 minutes.
7. Document outcome in the tracker file.
8. Promote PR #38 draft → ready, merge after stable.

CRITICAL authorization checkpoints (must pause for user):
- BEFORE running any aws lambda command against Master_Function (production)
- BEFORE updating the production alias
- If smoke test reveals ANY anomaly — stop, investigate, decide rollback vs fix-forward

Rollback path: `aws lambda update-alias --function-name Master_Function --name production --function-version 14`

Single biggest risk: production env vars are missing for half of what the new code references. Most likely failure mode is `KeyError: 'TENANT_REGISTRY_TABLE'` (or similar) on first invocation. Pre-flight env var audit is the highest-leverage prep task.

Acceptance criteria:
- Production widget runs new code; chat works end-to-end for ≥1 production tenant
- CloudWatch error rate stable for ≥30 minutes
- All sibling Lambdas unaffected (Bedrock_Streaming_Handler, etc.)
- Postmortem written if anything regressed

Effort estimate: 4-6 hours (most of it pre-flight; deploy itself is ~30 min).
```

---

## Brief G — Vestigial alias cleanup (PR #39)

### DO NOT assign until #38 is merged + 7 days production stability

When ready, this is a low-risk 30-minute task.

### Paste this to your agent (when ready)

```
You are deleting vestigial Lambda aliases that are no longer used.

PR: https://github.com/longhornrumble/lambda/pull/39
Branch: chore/master-function-clear-vestigial-aliases

Why this exists: after the Master_Function staging→prod promotion (PR #38), the `staging` and `STAGING` aliases on `Master_Function` are vestigial. They previously pointed at v11 / v6 (Aug 2025 test deploys) and were stale. API Gateway no longer routes to them.

Pre-conditions:
- PR #38 (promotion) is MERGED
- Production has been live ≥7 days with no incidents

Your task:
1. Checkout branch chore/master-function-clear-vestigial-aliases.
2. Read Master_Function_Staging/ALIAS_CLEANUP_TRACKING.md.
3. Run the verification commands in the tracker:
   - `aws apigatewayv2 get-integrations --api-id kgvc8xnewf --query "Items[?contains(IntegrationUri, 'Master_Function:staging') || contains(IntegrationUri, 'Master_Function:STAGING')]"` — expected: empty
   - `aws lambda get-function-url-config --function-name Master_Function --qualifier staging` — expected: ResourceNotFoundException
4. If verifications confirm no traffic, delete the aliases:
   - `aws lambda delete-alias --function-name Master_Function --name staging --profile chris-admin`
   - `aws lambda delete-alias --function-name Master_Function --name STAGING --profile chris-admin`
5. Confirm only `production` alias remains:
   - `aws lambda list-aliases --function-name Master_Function --profile chris-admin --query 'Aliases[*].Name'` → expected: ["production"]
6. Update the tracker with cleanup timestamp.
7. Promote PR #39 draft → ready, merge.

Authorization checkpoint: BEFORE running aws lambda delete-alias, request explicit user OK. Deletions are reversible via aws lambda create-alias but easier to skip than to redo.

Optional cleanup (recommend skipping): `aws lambda delete-function --function-name Master_Function --qualifier 11`. v11 deletion is irreversible and purely cosmetic. Recommend leaving v11 in place as historical archive.

Acceptance criteria:
- Only `production` alias remains on Master_Function
- No traffic regressions
- PR merged

Effort estimate: 30 minutes.
```

---

## Brief H — CLAUDE.md two-function model docs (PR #54)

### DO NOT assign until #38 is merged

When ready, this is a writing-only task.

### Paste this to your agent (when ready)

```
You are updating CLAUDE.md files to document the two-function Lambda deployment model.

PR: https://github.com/longhornrumble/picasso/pull/54
Branch: docs/claude-md-two-function-model

Why this exists: as of 2026-05-02, the user explicitly chose the two-function pattern (separate Lambdas for staging and production, no aliases) over the alias pattern. CLAUDE.md files in this repo don't yet document this clearly — readers may assume aliases are still in play.

Pre-conditions: PR #38 (promotion) merged, so the new architecture is live and CLAUDE.md will reflect actual state, not aspiration.

Your task:
1. Checkout branch docs/claude-md-two-function-model.
2. Read docs/runbooks/CLAUDE_MD_TWO_FUNCTION_MODEL.md for the proposed content + acceptance criteria.
3. Update these files:
   - /CLAUDE.md (root) — add a "Lambda Deployment Model" section per the proposed content
   - /Picasso/CLAUDE.md — update the Lambda Functions list to explicitly distinguish staging from production
   - /picasso-config-builder/CLAUDE.md — verify nothing needs updating; if it does, update
4. Cross-reference lambda PRs #37, #38, #39 in the new content.
5. Update the runbook tracker with execution log.
6. Promote PR #54 draft → ready, request user merge.

Authorization checkpoint: STOP and ask user if you find any existing CLAUDE.md content that conflicts with the new model — they may want different framing.

Acceptance criteria:
- All three CLAUDE.md files document the two-function model explicitly
- No remaining ambiguity about staging vs production routing
- Cross-references to lambda repo PRs #37, #38, #39 present

Effort estimate: 1-2 hours.
```

---

## Operator notes (read this once)

### Sequencing reminder

The order to assign these is:
1. **Right now (Tier 0):** Merge PR #37 (lambda) and PR #57 (this map's parent) — pure docs, no agent needed.
2. **Tier 1 (parallel):** Briefs A, B, C, D — assign all four to different agents simultaneously. ~4-6h wall-clock.
3. **2026-05-03 ≥20:35 UTC:** Brief E (P0a Phase 2 staging deploy).
4. **≥1 week after Brief E success:** Brief F (promotion event). User-driven.
5. **≥7 days after Brief F merged:** Brief G (alias cleanup).
6. **After Brief F merged (any time):** Brief H (CLAUDE.md docs).

### What NOT to delegate

- **F0 PII Remediation owner + start date** — this is project-management, not engineering. Surface it to a project-management track, not an agent.
- **Brief F authorization** — the actual production deploy must be operator-driven with agent assistance. Do not authorize an agent to autonomously deploy to production.

### Master orchestration map

If you want the long version with dependency graphs and rationale, see `docs/runbooks/PR_ORCHESTRATION_MAP.md` (PR #57). This file (`AGENT_BRIEFS.md`) is the practical hand-off-to-agent version of that map.

### Session context if an agent asks "why does any of this exist"

The 2026-05-02 session was a scheduling-project execution session that uncovered substantial out-of-scope security and infrastructure issues. The session-handoff at `~/.claude/projects/-Users-chrismiller-Desktop-Working-Folder/memory/project_scheduling_handoff_2026-05-02.md` captures full context. Most agents won't need it; if one asks "why are we doing this", point them at the handoff.

---

## Change log

| Date | Change | Author |
|---|---|---|
| 2026-05-02 | Initial briefs authored. | Chris + Claude |
