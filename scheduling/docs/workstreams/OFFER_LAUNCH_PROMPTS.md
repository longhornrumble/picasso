# Offer-presentation increment (§B18) — worker launch prompts

Two parallel lanes, fully file-disjoint (different repos). Launch both at once — no ordering dependency
(the FE renders absent-tolerant, so it does not need the BE merged first). The integrator weaves, audits
(FULL both lanes; FE includes the PII payload gate), merges, and updates the kanban.

---

## WS-OP-BE (lambda repo)

```
You are ONE workstream in a coordinated parallel build — you own a single, disjoint slice.
Your work-order is scheduling/docs/workstreams/WS-OP-BE.md in the PICASSO repo
(/Users/chrismiller/Desktop/Working_Folder, branch origin/staging) — but you BUILD in the LAMBDA repo.

Read, in order: (1) that work-order, (2) the contracts it cites in scheduling/docs/FROZEN_CONTRACTS.md
(picasso repo, origin/staging) — §B18 (your spec), §B16a as amended, §B17e rule 12 — § LOCKED: code to
them, never redefine them, (3) the current selection code it cites (pool.js / slots.js / scheduling-propose.js),
(4) CLAUDE.md repo conventions (schema discipline, verify-before-commit).

Then build it. HARD RULES:
- Create/edit ONLY the files in the work-order's "You OWN" list — nothing else, and NEVER a shared doc
  (FROZEN_CONTRACTS, kanban, pii-inventory) or another slice's files. slots.js is explicitly NOT yours.
- Build in your OWN ISOLATED worktree off the LAMBDA repo:
    cd /Users/chrismiller/Desktop/Working_Folder/Lambdas/lambda
    git fetch origin && git worktree add -b feat/ws-op-be /tmp/wt-ws-op-be origin/main
  and build THERE. npm ci in BOTH Bedrock_Streaming_Handler_Staging/ AND shared/scheduling/ (worktrees
  need both). After push, verify `git ls-remote origin refs/heads/feat/ws-op-be` shows your new SHA.
- Lambda repo, branch feat/ws-op-be, base main.
- Run verify-before-commit before committing (marker write in a SEPARATE bash call from the commit).
- Open the PR per the work-order's Report-back section (doc-snippet in the body).
- If a frozen contract looks wrong, STOP and flag it in the PR — do not fork it.
- BRANCH CLEANUP: once your PR is merged, `git worktree remove /tmp/wt-ws-op-be` and
  `git branch -d feat/ws-op-be`. Leave no stale branch or worktree behind.
```

---

## WS-OP-FE (picasso repo)

```
You are ONE workstream in a coordinated parallel build — you own a single, disjoint slice.
Your work-order is scheduling/docs/workstreams/WS-OP-FE.md (picasso repo, origin/staging).

Read, in order: (1) that work-order, (2) the contracts it cites in scheduling/docs/FROZEN_CONTRACTS.md —
§B18 (esp. B18b/c/d — exact microcopy string, exact payload keys) — § LOCKED: code to them, never redefine
them, (3) the existing emission pattern it cites (MessageBubble ACTION_CHIP_CLICKED + iframe-main
notifyParentEvent), (4) CLAUDE.md repo conventions.

Then build it. HARD RULES:
- Create/edit ONLY the files in the work-order's "You OWN" list — nothing else, and NEVER a shared doc
  (FROZEN_CONTRACTS, kanban, pii-inventory) or another slice's files. iframe-main.jsx is read-only for you.
- PII HARD GATE: no message text, no email, no name, no '@' in any analytics payload — with the jest
  assertion the work-order requires. This is a merge-blocking audit item.
- Build in your OWN ISOLATED worktree:
    cd /Users/chrismiller/Desktop/Working_Folder
    git fetch origin && git worktree add -b feat/ws-op-fe /tmp/wt-ws-op-fe origin/staging
  and build THERE (the primary checkout is parked on another branch — NEVER switch it). After push,
  verify `git ls-remote origin refs/heads/feat/ws-op-fe` shows your new SHA.
- Picasso repo, branch feat/ws-op-fe, base staging.
- Run verify-before-commit before committing (marker write in a SEPARATE bash call from the commit).
- Open the PR per the work-order's Report-back section (doc-snippet in the body).
- If a frozen contract looks wrong, STOP and flag it in the PR — do not fork it.
- BRANCH CLEANUP: once your PR is merged, `git worktree remove /tmp/wt-ws-op-fe` and
  `git branch -d feat/ws-op-fe`. Leave no stale branch or worktree behind.
```
