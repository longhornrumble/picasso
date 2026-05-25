# Roadmap: `picasso-webscraping` submodule inconsistency

**Filed:** 2026-05-25 during the catch-up phase-completion-audit closeout.
**Severity:** 🟡 strong recommendation (pre-existing technical debt; benign failure mode but undermines repo cloneability).
**Owner:** unassigned (operator to triage).

## What is broken

`picasso-webscraping` is tracked in `origin/main` as a git submodule (gitlink, mode `160000`, commit `6cccec1f5549abd64f92f33fe8e281a8a07323ec`) but has **no corresponding entry in `.gitmodules`**.

Reproduction:

```bash
git ls-tree HEAD picasso-webscraping
# 160000 commit 6cccec1f5549abd64f92f33fe8e281a8a07323ec	picasso-webscraping
git ls-files --stage picasso-webscraping
# 160000 6cccec1f5549abd64f92f33fe8e281a8a07323ec 0	picasso-webscraping

cat .gitmodules
# [submodule "Lambdas/lambda"]
#   path = Lambdas/lambda
#   url = https://github.com/longhornrumble/lambda.git
#   branch = main
# [submodule "picasso-config-builder"]
#   path = picasso-config-builder
#   url = https://github.com/longhornrumble/picasso-config-builder.git
#   branch = main
# (no picasso-webscraping entry)

git submodule update --init -- picasso-webscraping
# fatal: No url found for submodule path 'picasso-webscraping' in .gitmodules
```

## Failure modes

| Scenario | Behavior today |
|---|---|
| Fresh `git clone` of picasso repo | `picasso-webscraping/` directory is empty after clone (no .git file inside; submodule contents not fetched) |
| `git submodule update --init` (all) | Updates `Lambdas/lambda` + `picasso-config-builder` successfully; **errors on picasso-webscraping** with `No url found for submodule path 'picasso-webscraping' in .gitmodules` |
| `git submodule update --init -- picasso-webscraping` | Same error |
| Working tree on a developer's machine (where `picasso-webscraping/` was populated by some past direct clone) | Shows as `M picasso-webscraping` in `git status` because the working-tree directory contents drift from the gitlink-recorded commit |
| CI builds that depend on `picasso-webscraping/` content | Silently miss content; may fail with cryptic file-not-found errors |

## Why this hasn't bitten yet

- `picasso-webscraping` is a Firecrawl Node.js SDK + RAG-scraper tooling — used by the operator for tenant-onboarding KB prep, not by automated CI or the deployed widget
- The legacy directory population (from a past direct `git clone https://github.com/longhornrumble/picasso-webscraping.git picasso-webscraping/`) was sufficient for the operator's local use
- New machines or fresh clones of picasso never need it, so the failure mode hasn't surfaced

## Path forward (options for triage)

**Option A — add `.gitmodules` entry (recommended)**

Make the submodule fully-formed by adding the missing `[submodule "picasso-webscraping"]` block to `.gitmodules` with the correct URL. Submodule then becomes cloneable + initializable like the other two.

```ini
[submodule "picasso-webscraping"]
	path = picasso-webscraping
	url = https://github.com/longhornrumble/picasso-webscraping.git
	branch = main
```

**Verify the URL is correct + the repo exists at that URL before committing.**

**Option B — remove the gitlink entirely**

If `picasso-webscraping` was never intended to be a submodule of picasso (just a sibling repo cloned next to it for convenience), remove the gitlink with:

```bash
git rm --cached picasso-webscraping
# commit the resulting .gitignore + tree update
```

Then add `picasso-webscraping/` to picasso's `.gitignore` so working trees can populate it however the operator chooses.

**Option C — leave as-is (status quo, indefinitely)**

Acceptable while picasso-webscraping is operator-only tooling. Document this roadmap stub as the "we know about it" artifact. Re-evaluate if CI ever needs the content.

## What this stub closes

Phase-completion-audit row 7 (catch-up audit 2026-05-25). The code-reviewer + tech-lead-reviewer + Security-Reviewer all flagged the inconsistency was punted with no filed tracking artifact. This file is the tracking artifact.
