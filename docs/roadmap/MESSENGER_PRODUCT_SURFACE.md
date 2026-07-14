# Messenger Product Surface — Program Plan

**Status:** 📋 PLAN APPROVED + tech-lead-reviewed 2026-07-13 (design-partner conversation, Chris-approved). **NOT yet executed** — no subphase below has started.
**Owner:** Chris Miller
**Vocabulary:** "Messenger" = **Facebook Messenger + Instagram DM together** (same standing vocabulary as the sibling program, Chris 2026-07-12).
**Repos:** `picasso-config-builder` (CB — code PRs to its own staging/CI, per that repo's SOP); `Lambdas/lambda` for `Picasso_Config_Manager` (PRs to `main`, auto-deploys touched staging functions) and `Analytics_Dashboard_API` (same repo, same deploy path); `picasso-analytics-dashboard` (the tenant portal — own repo/CI); picasso repo (`docs/roadmap/`, this doc — pure-docs PRs to `main` per the branch-routing table in root `CLAUDE.md`).
**Standing directive:** adversarial review of EVERY subphase before executing it (tech-lead-reviewer or self-adversarial minimum); `/verify-before-commit` before every code commit; base-branch routing per repo (see Repos line — there is no single base branch for this program, unlike the lambda-only sibling); re-verify recon facts against current code before trusting a file:line citation, this doc's recon is dated 2026-07-13.

---

## 1. The goal, in one paragraph

The lambda-side Meta Messenger pipeline (18 subphases, [`MESSENGER_CHANNEL_EXPERIENCE.md`](MESSENGER_CHANNEL_EXPERIENCE.md)) is code-complete and flag-gated behind `feature_flags.MESSENGER_CHANNEL` — but there is no product surface to manage it. The flag isn't in Config Builder, `messenger_behavior` (escalation recipient, tone override, disclosure line) can't be written by any UI, and tenants have no way to connect their FB/IG pages. Chris hit this concretely: an IG "speak with staff" test on MYR384719 produced no escalation email, because the flag was off and no UI could turn it on — the config bucket denies direct writes and Config Manager silently drops unknown config sections. A temporary `ESCALATION_EMAIL` env default was shipped as a bridge (lambda#454/#455 + picasso#775, defaulting to `notify@myrecruiter.ai` on staging); this program is the proper home — CB + Config Manager + a portal management surface, across Tiers 1–3, planned in full before any code lands.

## 2. Two clocks (framing)

This program runs on two independent clocks, and conflating them is the main design risk this plan avoids:

- **Clock 1 — P0 plumbing is correctness debt, not a timing choice.** The config-section pipeline bugs (CB's `getMergedConfig` allowlist silently dropping unlisted sections; Config Manager's wholesale-replace-per-section merge silently dropping unknown sections entirely; zero test coverage on Config Manager) are live defects today, independent of Messenger. They **must land before Tier 2 in every scenario** — there is no sequencing choice here, only the question of whether they're fixed before or after they bite (they already bit once, per §1). P0 is scheduled first because deferring it doesn't reduce its cost, it just moves the failure later and makes it Messenger-shaped instead of generic.
- **Clock 2 — the Config Builder IA reorganization (hybrid products-vs-services model, §3 decision 1) is a ceiling, cheap to defer.** CB settings components are self-contained (Zustand-wired, no props) and the tab layout is one file, so regrouping *existing* pages later is inexpensive. Building the new IA speculatively, before any real consumer exists, would be the framework-first trap. The strangler-fig sequencing (§3 decision 7) resolves this: T1 ships in the flat list now; T2c builds the new IA pattern scoped to Messenger only, at ~zero extra cost versus a flat build; Forms/Scheduling migrate later, in a follow-up project, once the pattern is proven.

Practical consequence: nothing in this plan should be re-sequenced to "do the IA work first" or "defer P0 plumbing until Messenger needs it" — both moves would invert what each clock actually costs.

## 3. Locked strategy decisions

All seven decided in the 2026-07-13 design-partner session; all Chris-approved; tech-lead review amended #4 and #5 (recorded inline).

1. **Hybrid IA for Config Builder.** Vertical **products** (Forms, Scheduling, Messenger — each = enable flag + rolled-up config + readiness checklist) vs horizontal **services** (Notifications, Branding, AI pipeline flags). Litmus test, verbatim: **"can this be ON and still do nothing useful without more setup?"** Yes → product (needs grouping + readiness). No → behavior flag (the flat toggle list remains correct for these). This program builds the pattern **with Messenger only**; regrouping the existing Forms/Scheduling pages is a named follow-up, not in scope (§9).
2. **Notifications model — Messenger-first, pattern-setting.** Notification = **event → recipients → content → surface**. The forms config already implements this shape per-form (`conversational_forms.<id>.notifications.{applicant_confirmation,internal}` with `recipients`, `subject`, `body_template`, `channels:{email,sms}`, `recipient_employee_ids`) — Messenger's escalation block adopts that shape verbatim; no new abstraction is invented. Resolution = AND across levels (global on ∧ product on ∧ event subscribed). SMS stays tabled (the `channels` surface slot is kept, the lane isn't built). A global Notifications service page + forms/scheduling retrofit is a separate follow-up program (§9).
3. **Delegation by blast radius** (Chris's governance rule — see §4 for the full table and quote).
4. **Portal in scope, with a tech-lead write-path amendment.** Three repos: `picasso-config-builder`, `Lambdas/lambda` (`Picasso_Config_Manager` + `Analytics_Dashboard_API`), `picasso-analytics-dashboard`. Portal gets the Meta connect card in the existing `IntegrationsTab.tsx` (next to `CalendarConnection.tsx` + `ZoomIntegrationCard.tsx`) + escalation-recipient editing. Works for Meta role-holders now; real tenants post-App-Review. **Amended by tech-lead review:** the portal's config writes route through `Analytics_Dashboard_API`'s existing deep-merge/ETag path (the `update_tenant_notifications` precedent), **not** Config Manager — so T3c extends that Lambda (a new `update_tenant_messenger_behavior`-style function + tests), and P0's Config-Manager plumbing fix does **not** cover the portal path. A pre-T3 spike (**P0c**) must first resolve the Clerk auth topology and confirm the write path before T3b/T3c are scoped further.
5. **Plumbing foundation first (before Tier 2).** Fix the config-section pipeline debt — CB `getMergedConfig` allowlist + Config Manager `EDITABLE_SECTIONS` + wholesale-replace semantics — with a **contract-file pattern** (precedent: `analytics_writer_contract.json`) pinning the section list, plus the **first-ever Config Manager test suite**. Keep wholesale-replace semantics (no deep-merge redesign); guard with tests + always-send-whole discipline. **Two-tier contract (tech-lead amendment):** CM-accepts (all `EDITABLE_SECTIONS`) vs CB-must-emit (the subset with UI) — the naive "CB emits every editable section" test fails today on `intent_definitions`/`monitor` (§5 Landmine 4). **Cross-repo caveat, stated plainly, not implied away:** unlike the same-repo `analytics_writer_contract.json` precedent, CB and Config Manager are separate repos with separate CI — each test only self-validates its own copy of the contract file; there is no CI check that the two copies match. Proportionate for a solo-operator tool. P0b pins the *current* (pre-Messenger) list; `messenger_behavior` is added to the contract in T2a/T2b, not P0b.
6. **Tier 1 (flag toggle) ships first, as its own PR.** The minimal legitimate unblock — zero backend change needed (`feature_flags` already round-trips whole + safe, per `getMergedConfig` line 391 and `EDITABLE_SECTIONS` already including it). Unblocks Chris activating Messenger on MYR384719 and testing escalation the day it ships.
7. **Sequencing of the CB reorg: neither pause nor build-then-reorg — strangler-fig.** T1 ships now in the existing flat flags list (trivial to relocate later). P0 plumbing (correctness debt, §2 Clock 1) is mandatory before Tier 2 in any scenario. T2c builds the Messenger page **as the first product grouping** — the new IA arrives with Messenger, scoped to Messenger only, at ~zero extra cost versus a flat build (the flat version is the only thing that would need a rebuild later). Forms/Scheduling migrate to the proven pattern in a follow-up project. Tradeoff acknowledged: Messenger's page defines the pattern others inherit, so its grouping/readiness design gets an explicit, named adversarial review step (T2c's DONE line, §6).

## 4. Delegation model

Chris's governance rule, verbatim: **tenant-safe + support-call-saving → portal; system-breaking → super-admin (CB).** Graduation is **one-way** (super-admin → tenant, never reverse) — a control never moves back to the more-restricted band once delegated.

| Band | Controls | Rationale |
|---|---|---|
| **Tenant (portal)** | Connect/disconnect FB & IG (Page-admin OAuth — inherently theirs); escalation recipients + email content (mirrors the portal's existing "create/edit notifications" delegation) | Tenant-safe, saves a support call, and the tenant is the one whose Page credential is actually being used |
| **Super-admin (CB)** | `MESSENGER_CHANNEL` flag; disclosure line; tone override; welcome surfaces (ice breakers, persistent menu); KB/CTAs (unchanged, already super-admin) | System-breaking if misconfigured (flag flips tenant-wide behavior; disclosure/tone are compliance- and brand-adjacent; welcome surfaces push to the Meta Profile API) |

**One-way graduation note:** if a control currently in the super-admin band later proves safe enough to delegate (e.g., tone override, once more tenants are live), that is an explicit, recorded graduation decision — never a silent UI change, and never reversed once made. R9 (§8) names the failure mode this guards against: delegation drift, where the portal quietly gains a super-admin-band control without anyone deciding it should.

## 5. Verified as-is facts (recon 2026-07-13)

> Re-verify before trusting — this recon is a point-in-time snapshot, same discipline as the sibling program's stale-checkout rule.

- CB settings components are self-wiring (no props; Zustand `useConfigStore`, lazy-init subsection, `isDirty`). Registration = component + barrel export + `SettingsPage.tsx` `TabsContent`. 5 tabs today: general, branding, features, ai-aws, channels.
- `FeatureFlagsSettings.tsx`: flat `FLAG_DEFINITIONS` (`{key: keyof FeatureFlags, label, description, legacy?}`); has `V5_SINGLE_PASS`, `V4_ACTION_SELECTOR`, `scheduling_enabled`; **NOT** `MESSENGER_CHANNEL`. A 4-assertion test template already exists at `__tests__/FeatureFlagsSettings.v5.test.tsx` — T1 follows it.
- **Landmine 1:** CB `getMergedConfig` (`src/store/slices/config.ts:341-397`) is an explicit allowlist — emits `feature_flags` (line 391) but would **not** emit `messenger_behavior` without a new line. UI edits silently never persist without it.
- **Landmine 2:** Config Manager `mergeStrategy.mjs` merge is **wholesale-replace per section** (`merged[section] = editedSections[section]`); partial sends wipe sibling keys. `EDITABLE_SECTIONS` (**19 entries**) includes `feature_flags`, **not** `messenger_behavior`; `validateEditedSections` only **WARNS** on unknown sections while the merge loop silently **DROPS** them.
- **Landmine 3:** `Picasso_Config_Manager` has **NO test suite at all** (no test script, no `__tests__`) — P0a is the first-ever one.
- **Landmine 4 (tech-lead review):** `getMergedConfig` does **not** emit two sections that ARE in `EDITABLE_SECTIONS` — `intent_definitions` and `monitor` (verified: neither appears in CB `config.ts`). A naive P0b contract test "CB emits every editable section" fails day one on this pre-existing, out-of-scope gap — hence the two-tier contract (CM-accepts vs CB-must-emit) in decision 5.
- **Portal has an INDEPENDENT config-write path (tech-lead review).** `Analytics_Dashboard_API/lambda_function.py` already read-modify-writes `tenants/{id}/{id}-config.json` directly via S3 ETag/If-Match + a targeted **deep-merge** (`update_tenant_notifications`, `update_tenant_scheduling_activation`; own tests) — **not** through Config Manager, and **not** subject to Landmine 2 or `EDITABLE_SECTIONS`. This is the real precedent T3b/T3c should mirror at the **backend** level, not just UI. **Auth topology is unverified:** Config Manager + Meta_OAuth_Handler validate the *Config Builder* Clerk instance (`clerk.config.myrecruiter.ai` / `present-skunk-55`), while the dashboard uses a *different* Clerk key (`clerk.myrecruiter.ai` / `divine-impala-48`) — possibly separate apps (tokens wouldn't cross-validate) or satellite domains (fine either way). Must be resolved before T3 executes — that's P0c's job.
- **G6:** `ChannelsSettings.tsx:54` hardcodes the **prod** OAuth Lambda URL as fallback; CB's staging build (`pr-checks.yml` build-staging) injects only `VITE_API_URL` + `VITE_S3_BUCKET`, so staging Messenger OAuth hits prod today.
- The dashboard already has `src/components/scheduling/IntegrationsTab.tsx` with `CalendarConnection.tsx` + `ZoomIntegrationCard.tsx` — the Meta connect card is the third tile; whether to promote the tab out of `scheduling/` to a top-level Integrations area is a placement decision T3b documents (not decided here).
- Forms notification shape (live on MYR384719): `conversational_forms.<id>.notifications.{applicant_confirmation,internal}` with `recipients`, `subject`, `body_template`, `channels:{email:true,sms:false}`, `recipient_employee_ids` — the shape decision 2 adopts verbatim for Messenger escalation.
- Meta OAuth/webhook/processor pipeline is live on staging (`Meta_OAuth_Handler` writes `picasso-channel-mappings`); escalation reads `config.messenger_behavior?.escalation_email || process.env.ESCALATION_EMAIL` (temp default `notify@myrecruiter.ai` on staging) — this is the bridge this program replaces with a real UI.
- External gates: **App Review / Advanced Access** (tenant self-serve connect; role-holders only until approved — operator milestone already pending, [`MESSENGER_APP_REVIEW_PACKAGE.md`](MESSENGER_APP_REVIEW_PACKAGE.md)); **G5** prod Meta-app topology (Live app webhook → staging Lambda URL — separate gated cutover, not this program).
- CB CI: PR to `main` → lint/typecheck/`test:run` (vitest)/security/builds → auto staging deploy (`picasso-config-builder-staging`). Lambda repo: merge to `main` auto-deploys touched functions to staging. Dashboard: own repo/CI (`test:scheduling` gates CI).

**Cross-repo contract caveat (stated honestly, once, here — applies throughout §6):** CB and the lambda repo are separate repos with separate CI pipelines. Every "contract" named in this doc (the section contract in P0b/T2a/T2b, the `messenger_behavior` shape in T2b vs. the lambda-side C2 contract already frozen in `Lambdas/lambda/docs/messenger/CONTRACTS.md`) is enforced by **tests within each repo**, not by any cross-repo CI check. There is no automated guarantee the two copies stay in sync — that's a manual discipline (re-diff on each PR touching the shared shape), proportionate for a solo-operator tool but worth stating plainly rather than implying enforcement that doesn't exist.

## 6. Phasing

| # | Name | Repo(s) | Scope (one line) | Hard deps |
|---|---|---|---|---|
| **T1** | MESSENGER_CHANNEL flag toggle | CB | Add flag to `FeatureFlags` type + `FLAG_DEFINITIONS` + 4-assertion test; ships alone, FIRST | none |
| **P0a** | Config Manager test harness | lambda | Net-new `mergeStrategy` test suite (node:test, .mjs): merge/replace/drop semantics pinned | none (parallel-safe w/ T1) |
| **P0b** | Section contract | CB + lambda | Contract file pinning section list both sides (`analytics_writer_contract.json` pattern); CB test asserts `getMergedConfig` emits every contract section; CM test asserts `EDITABLE_SECTIONS` matches | P0a |
| **T2a** | `messenger_behavior` editable (backend) | lambda | Add to `EDITABLE_SECTIONS` + contract + tests. **MUST be live on staging before T2c merges** (silent-drop gate) | P0a/P0b |
| **T2b** | CB type + merge wiring | CB | `MessengerBehavior` interface (escalation block in forms-notification shape; disclosure_line; tone_override; channel_overrides scaffold; all user-facing strings config-driven for i18n) + `TenantConfig.messenger_behavior?` + `getMergedConfig` emit line + forward-compat fixture | T2a live |
| **T2c** | Messenger product grouping (CB UI) | CB | First product page: flag at top + behavior fields + escalation notification block + **readiness checklist** (connected? recipient? flag?) reading channel-mappings state | T2a live, T2b |
| **P0c** | Portal write-path + auth spike | dashboard + lambda | Verify: (a) do dashboard Clerk JWTs validate against CM/Meta_OAuth_Handler JWKS (separate app vs satellite)? (b) confirm portal config writes go via `Analytics_Dashboard_API` deep-merge/ETag path. Output: named API path + auth decision. **Gates T3b/T3c** | none (can run early) |
| **T3a** | G6 fix | CB | Staging env injection `VITE_CHANNELS_API_URL` + fail-loud fallback (no prod URL). Staging Meta OAuth URL CONFIRMED to exist (`infra/main.tf:974`) — R4 downgraded | independent, fast-follow to T1 |
| **T3b** | Portal: Meta connect card | dashboard | Connect/disconnect/status card in IntegrationsTab (promote tab placement decision documented); role-holders can connect now. DONE names the concrete connect/status API endpoint it calls | T3a, **P0c** |
| **T3c** | Portal: escalation notification editing (via `Analytics_Dashboard_API`) | dashboard + lambda | Recipients + content editing mirroring the portal's existing notification UI; writes `messenger_behavior` via a NEW `Analytics_Dashboard_API` fn (deep-merge/ETag) + its tests. DONE names the endpoint + asserts round-trip. **PII gate (re-scope: new tenant-scoped write into a previously CB-only section — advisory may be more than "light")** | **P0c**, T2a, T2c |
| **T3d** | Welcome surfaces config (CB) | CB (+lambda if new section) | Ice breakers (≤4) + persistent menu editors; doc the operator M5 re-push step (CB does NOT push to Meta) | T2 chain |

**Dependency shape:** T1 and P0a run in parallel (disjoint files, no shared dep). P0b needs P0a. T2a needs P0a/P0b. T2b needs T2a live on staging (not just merged — the silent-drop gate, §7). T2c needs T2a live + T2b. P0c has no hard deps and can run any time before T3. T3a is independent, a fast-follow to T1. T3b needs T3a + P0c. T3c needs P0c + T2a + T2c. T3d needs the full T2 chain.

Each subphase below: Scope / OWN / CONSUME / PRODUCE / Deliverables (incl. tests) / DONE (falsifiable) / Adversarial focus / Agents — matching [`MESSENGER_CHANNEL_EXPERIENCE.md`](MESSENGER_CHANNEL_EXPERIENCE.md) §6's format. Agent names per [`AGENT_RESPONSIBILITY_MATRIX.md`](../../picasso-config-builder/docs/AGENT_RESPONSIBILITY_MATRIX.md).

---

### T1 — MESSENGER_CHANNEL flag toggle
- **Scope:** add the flag to the `FeatureFlags` type + `FLAG_DEFINITIONS` (flat list, Features tab) + a 4-assertion test following the existing `FeatureFlagsSettings.v5.test.tsx` template. Ships alone, first — zero backend change, `feature_flags` already round-trips whole via `getMergedConfig` (line 391) and is already in `EDITABLE_SECTIONS`.
- **OWN:** CB `src/types/config.ts` (`FeatureFlags` type), `src/components/settings/FeatureFlagsSettings.tsx` (`FLAG_DEFINITIONS` entry), new test file alongside `__tests__/FeatureFlagsSettings.v5.test.tsx`.
- **CONSUME:** nothing frozen — the flat flag list's existing round-trip path.
- **PRODUCE:** `MESSENGER_CHANNEL` as a real, deployable toggle in CB — the day-one unblock for MYR384719.
- **Deliverables/tests:** flag renders in the Feature Flags tab; toggling sets `feature_flags.MESSENGER_CHANNEL` in store state; 4-assertion test (renders, toggles, persists to store, **asserts the literal key string** `'MESSENGER_CHANNEL'` — not just "a boolean changed").
- **DONE:** flag round-trips through save → deploy → S3 on staging CB against a real tenant config; toggling ON + deploying MYR384719 shows `feature_flags.MESSENGER_CHANNEL: true` in the deployed config; Chris can flip it and get the IG escalation email via the existing env-default bridge the same day.
- *Adversarial focus:* the flag-key typo risk (`config.ts:572`'s string index signature makes `keyof FeatureFlags` = `string`, **zero compile-time protection** on a typo) — the test must assert the exact key string, not merely that some boolean flag round-trips.
- **Agents:** Frontend-Engineer, typescript-specialist, test-engineer.

### P0a — Config Manager test harness
- **Scope:** net-new `mergeStrategy` test suite (node:test, `.mjs`) pinning current merge/replace/drop semantics. `Picasso_Config_Manager` has **no test suite at all** (Landmine 3) — this is the first one, ever.
- **OWN:** `Lambdas/lambda/Picasso_Config_Manager/mergeStrategy.test.mjs` (new) + minimal test-runner scaffolding if none exists.
- **CONSUME:** current `mergeStrategy.mjs` behavior as ground truth to pin — **not** to redesign (decision 5: keep wholesale-replace).
- **PRODUCE:** the regression harness P0b and T2a build on.
- **Deliverables/tests:** (1) wholesale-replace overwrites a full section; (2) a partial send wipes sibling keys within that section (documents Landmine 2 as current, intentional-for-now behavior); (3) `validateEditedSections` WARNS-only on an unknown section while the merge loop DROPS it silently (documents the drop bug so T2a's fix is provably necessary, not aspirational); (4) `EDITABLE_SECTIONS` allowlist enforcement (an unlisted section is rejected/ignored per current behavior).
- **DONE:** all four pinned behaviors have a named test, green against unmodified `mergeStrategy.mjs`; each test is a regression pin (fails if the *current* behavior silently changes), not a spec for desired future behavior.
- *Adversarial focus:* are these tests genuinely pinning current behavior (including the bug), or accidentally asserting the fixed future behavior? Conflating "document a bug" with "fix a bug" here would make T2a's DONE line untestable.
- **Agents:** Backend-Engineer, test-engineer.

### P0b — Section contract
- **Scope:** a contract file pinning the section list on both sides (`analytics_writer_contract.json` pattern), CB-side test asserting `getMergedConfig` emits every section in its tier, CM-side test asserting `EDITABLE_SECTIONS` matches. Two-tier: **CM-accepts** (all 19 `EDITABLE_SECTIONS` entries) vs **CB-must-emit** (the subset CB actually has UI for — excludes `intent_definitions`/`monitor` per Landmine 4). Pins the *current* (pre-Messenger) list; `messenger_behavior` is added in T2a/T2b, not here.
- **OWN:** a new contract file (exact path decided in-session, following the `analytics_writer_contract.json` precedent — e.g. mirrored copies in CB `src/lib/contracts/` and lambda `Picasso_Config_Manager/`) + a CB test + a CM test.
- **CONSUME:** P0a's harness; Landmine 1 (`config.ts:341-397`); Landmine 2 (`EDITABLE_SECTIONS`, 19 entries); Landmine 4 (`intent_definitions`/`monitor` gap).
- **PRODUCE:** the two-tier contract T2a and T2b extend when `messenger_behavior` lands.
- **Deliverables/tests:** CB test asserts `getMergedConfig` emits every CB-must-emit section (passes today once `intent_definitions`/`monitor` are correctly excluded from that tier); CM test asserts `EDITABLE_SECTIONS` === the CM-accepts tier exactly (all 19); an explicit comment/assertion in both test files stating the cross-repo caveat (§5) — this test self-validates its own repo's copy only.
- **DONE:** both tests merged and green in their own repo's CI; the contract file's content is identical, byte-for-byte, in both repos as of this PR — verified by manual diff at merge time, **not** by any CI check (state this plainly, per the cross-repo caveat); the contract does **not** yet include `messenger_behavior`.
- *Adversarial focus:* prove the naive "CB emits every editable section" test actually fails on day one before the two-tier split is applied (red-then-green), so the split's necessity is demonstrated, not asserted; confirm the no-cross-repo-enforcement caveat is stated where a future reader will actually see it, not just in this doc.
- **Agents:** Backend-Engineer, typescript-specialist, test-engineer, tech-lead-reviewer.

### T2a — `messenger_behavior` editable (backend)
- **Scope:** add `messenger_behavior` to `EDITABLE_SECTIONS` + both contract tiers + tests. **Must be live on staging before T2c merges** — the silent-drop gate (§7).
- **OWN:** `Lambdas/lambda/Picasso_Config_Manager/mergeStrategy.mjs` (`EDITABLE_SECTIONS` array), the CM-accepts contract tier, tests.
- **CONSUME:** P0a's harness, P0b's contract (extending it).
- **PRODUCE:** backend acceptance of `messenger_behavior` writes — the hard dependency T2b/T2c/T3c all key off.
- **Deliverables/tests:** `EDITABLE_SECTIONS` includes `messenger_behavior`; a wholesale-replace test specific to this section (a full object round-trips; a partial send would wipe siblings — the test documents this so client-side always-send-whole discipline, decision 5, is provably necessary); contract file updated in the same PR.
- **DONE:** staging-deployed (lambda repo merge to `main` auto-deploys `Picasso_Config_Manager`); a manual PUT with a full `messenger_behavior` object round-trips through the **live staging** Config Manager and persists in S3 — verified before T2c's PR merges, not merely "tests green."
- *Adversarial focus:* is this actually live and independently verified on staging (not just merged/tests-green) before T2c starts consuming it? This is the named cross-repo gate (§7) — a passing test suite alone does not satisfy it.
- **Agents:** Backend-Engineer, test-engineer, deployment-specialist.

### T2b — CB type + merge wiring
- **Scope:** `MessengerBehavior` interface (escalation block in the forms-notification shape; `disclosure_line`; `tone_override`; `channel_overrides` scaffold; all user-facing strings config-driven for i18n per the sibling program's D10/G8 precedent) + `TenantConfig.messenger_behavior?` + `getMergedConfig` emit line + a forward-compatible fixture.
- **OWN:** CB `src/types/config.ts` (`MessengerBehavior` interface + `TenantConfig.messenger_behavior?`), `src/store/slices/config.ts` `getMergedConfig` (new emit line), fixture test (old-shape config without `messenger_behavior` must not crash any reader — Schema Discipline rule, root `CLAUDE.md`).
- **CONSUME:** T2a live on staging (hard dep — not just merged); the forms notification shape precedent as the field-for-field model for the escalation block; the lambda-side C2 `messenger_behavior` contract already frozen in `Lambdas/lambda/docs/messenger/CONTRACTS.md` — this is CB's independently-maintained mirror of that shape (same cross-repo caveat as P0b: reconcile field names by manual diff, no CI parity check).
- **PRODUCE:** the typed `messenger_behavior` section CB can read/write; the fixture T2c's readiness checklist inspects.
- **Deliverables/tests:** interface + Zod schema mirror compiles (repo convention, per the `channels` precedent); old-shape fixture test green (config without `messenger_behavior` doesn't crash); `getMergedConfig` emits `messenger_behavior` when present; escalation block fields match the forms notification precedent (`recipients`/`subject`/`body_template`/`channels`).
- **DONE:** `tsc --noEmit` clean; both fixture tests (old-shape, new-shape) green; a manually-constructed `messenger_behavior` object round-trips save → deploy → S3 on staging CB against T2a's live backend.
- *Adversarial focus:* does `getMergedConfig` actually include the new emit line — the test must fail without it (Landmine 1's exact failure mode), not merely pass with it present; does CB's `MessengerBehavior` shape actually match the lambda-side C2 contract already frozen — reconcile before treating either as final.
- **Agents:** Frontend-Engineer, typescript-specialist, test-engineer.

### T2c — Messenger product grouping (CB UI)
- **Scope:** the first product page under the hybrid IA (decision 1/7) — flag at top + behavior fields + escalation notification block + a **readiness checklist** (connected? recipient set? flag on?) reading channel-mappings connection state. This page's grouping/readiness shape is the pattern Forms/Scheduling inherit in a later, separate project (§9).
- **OWN:** a new CB page/component (exact path and nav placement decided in-session — e.g. a `products/` grouping distinct from the existing flat `settings/` tabs) + a readiness-checklist component + registration wiring.
- **CONSUME:** T2a live (hard dep), T2b's types (hard dep), the DDB `picasso-channel-mappings.enabled` connection state (read-only, for the readiness checklist display — per the sibling program's D1 authority rule, **CB must never read the S3 `channels.*` mirror for gating**, only DDB, and only for display here).
- **PRODUCE:** the product-grouping/readiness-checklist **pattern** — the reusable template Forms/Scheduling's later regrouping copies.
- **Deliverables/tests:** page renders flag toggle + escalation fields + readiness checklist; readiness checklist correctly reflects all 8 combinations of {connected/not, recipient-set/not, flag-on/off}; component tests per CB convention (self-wiring, Zustand-backed, no props).
- **DONE:** page live on staging CB; a full end-to-end edit (flag + escalation recipient) round-trips through T2a's live backend and appears in the deployed S3 config; the readiness checklist correctly reflects real staging channel-mappings state for MYR384719. **AND — the pattern-setting gate:** the grouping/readiness design has passed a **recorded tech-lead-reviewer adversarial pass** evaluating whether the abstraction generalizes to Forms/Scheduling (not just whether Messenger's instance is correct) — this review is a named, non-optional item on T2c's DONE line, because everything downstream inherits whatever shape ships here.
- *Adversarial focus:* **the pattern-setting review, by name** — does this grouping/readiness shape actually generalize, or does it bake in Messenger-specific assumptions that force a rewrite when Forms/Scheduling migrate? Also: does the readiness checklist accidentally read the S3 `channels.*` mirror instead of DDB for connected-state (the D1 authority violation)?
- **Agents:** Frontend-Engineer, typescript-specialist, test-engineer, tech-lead-reviewer.

### P0c — Portal write-path + auth spike
- **Scope:** resolve, with evidence: (a) do dashboard Clerk JWTs validate against the CM/Meta_OAuth_Handler JWKS (separate app vs. satellite domain)? (b) confirm portal config writes actually go via `Analytics_Dashboard_API`'s deep-merge/ETag path, not Config Manager. Output = a named API path + auth decision. **Gates T3b/T3c** — no hard deps of its own, can run early.
- **OWN:** a spike decision record (in-session; a short ADR or an appended section to this doc's execution log) — production code changes are not expected, though a throwaway JWT cross-validation test script is in scope.
- **CONSUME:** the Clerk-instance divergence recon (`clerk.config.myrecruiter.ai`/`present-skunk-55` for CB vs. `clerk.myrecruiter.ai`/`divine-impala-48` for the dashboard); `Analytics_Dashboard_API/lambda_function.py`'s existing `update_tenant_notifications`/`update_tenant_scheduling_activation` deep-merge/ETag precedent.
- **PRODUCE:** the named write-path + auth decision — a **hard, blocking input** to T3b/T3c's scope, not an advisory note.
- **Deliverables:** a decision record answering both questions with cited evidence (an actual token-validation test against both JWKS endpoints, not inference; confirmation of which Lambda owns the write for an existing equivalent feature).
- **DONE:** decision record committed; both questions answered with evidence; T3b/T3c's OWN/CONSUME sections below are confirmed accurate against the spike's findings, or explicitly amended if the spike contradicts them.
- *Adversarial focus:* don't let "probably a satellite domain" stand as the answer without an actual cross-validation test — this is exactly the class of claim the root `CLAUDE.md`'s "verify cloud provider behavior empirically" rule exists for.
- **Agents:** Backend-Engineer, Security-Reviewer, tech-lead-reviewer.

### T3a — G6 fix
- **Scope:** staging env injection `VITE_CHANNELS_API_URL` + a fail-loud fallback (never the prod URL). Staging Meta OAuth URL confirmed to exist (`infra/main.tf:974`) — R4 is downgraded accordingly (this is env-injection-only work, not infra creation). Independent; a fast-follow to T1.
- **OWN:** CB's staging build config (`pr-checks.yml` build-staging step — add `VITE_CHANNELS_API_URL` injection); `src/components/settings/ChannelsSettings.tsx:54` (replace the hardcoded prod fallback with fail-loud behavior — e.g. disable the connect action with a config-error message, never silently fall through to prod).
- **CONSUME:** `infra/main.tf:974` (the confirmed staging Meta OAuth Lambda URL) as the value to inject.
- **PRODUCE:** a staging CB build that can never silently reach the prod OAuth Lambda.
- **Deliverables/tests:** a test asserting `ChannelsSettings.tsx` fails loud (disables/errors) rather than falling back to the prod URL string when `VITE_CHANNELS_API_URL` is unset; staging build config confirmed to set the var.
- **DONE:** the staging CB build's Meta connect flow is network-verified to call the staging OAuth Lambda URL (not just code-read); a build with the var unset fails loudly in a test — the bug today is silent, so the fix must be demonstrably not-silent.
- *Adversarial focus:* does "fail loud" actually block the connect attempt, or just log a warning while still hitting the prod URL underneath?
- **Agents:** Frontend-Engineer, DevOps.

### T3b — Portal: Meta connect card
- **Scope:** a connect/disconnect/status card in `IntegrationsTab.tsx` (tab-placement decision documented — promote out of `scheduling/` or leave in place); role-holders can connect now regardless of App Review status. DONE names the concrete connect/status API endpoint it calls.
- **OWN:** picasso-analytics-dashboard `src/components/scheduling/IntegrationsTab.tsx` (or its promoted location, per the placement decision) + a new `MetaConnectionCard.tsx` alongside `CalendarConnection.tsx`/`ZoomIntegrationCard.tsx`.
- **CONSUME:** T3a (staging OAuth URL fixed — hard dep); **P0c** (write-path + auth decision — hard dep; this subphase is unscoped without it); `Meta_OAuth_Handler`'s existing connect/status/disconnect endpoints, as confirmed by P0c.
- **PRODUCE:** a role-holder-testable Meta connect in the portal — works independent of App Review (App Review gates real-tenant self-serve connect, not role-holder testing, per the App Review package).
- **Deliverables/tests:** card renders connected/disconnected state per channel-mappings status; connect initiates OAuth against the staging `Meta_OAuth_Handler` URL (per T3a); disconnect calls the corresponding endpoint; component tests per dashboard convention.
- **DONE:** **names the concrete connect/status API endpoint it calls** (recorded in the PR/doc, not left implicit); a role-holder completes a real connect and disconnect from the portal UI on staging.
- *Adversarial focus:* does the card silently rely on a CB-side Clerk token that doesn't actually validate against the dashboard's auth (the exact risk P0c exists to close)? Verify the request succeeds end-to-end on staging, not just that the UI renders a plausible state.
- **Agents:** Frontend-Engineer, Backend-Engineer, test-engineer.

### T3c — Portal: escalation notification editing (via `Analytics_Dashboard_API`)
- **Scope:** recipients + content editing mirroring the portal's existing notification UI; writes `messenger_behavior` via a **new** `Analytics_Dashboard_API` function (deep-merge/ETag), not Config Manager. DONE names the endpoint and asserts a round-trip.
- **OWN:** `Lambdas/lambda/Analytics_Dashboard_API/lambda_function.py` (a new `update_tenant_messenger_behavior`-style function, mirroring `update_tenant_notifications`) + its own tests; the picasso-analytics-dashboard portal UI for recipient/content editing.
- **CONSUME:** **P0c** (write-path + auth decision — hard dep); T2a (conceptually — though this path bypasses Config Manager entirely per the tech-lead amendment, the real hard dep is the config **shape** T2b defines, not Config Manager's acceptance of it); T2c (the CB-side shape/field precedent).
- **PRODUCE:** a second, independent write path into `messenger_behavior` — S3 ETag/If-Match deep-merge, deliberately **not** wholesale-replace, mirroring `update_tenant_notifications`'s existing precedent.
- **Deliverables/tests:** the new `Analytics_Dashboard_API` function has its own test suite — ETag conflict handling, and (deliberately the opposite discipline from Config Manager) tests asserting this function does **not** wipe sibling `messenger_behavior` keys on a partial write; portal UI component tests.
- **DONE:** **names the endpoint** (e.g. `update_tenant_messenger_behavior`) in the PR/doc; a portal-initiated recipient edit round-trips through this new Lambda function and is verified live in the S3 tenant config on staging.
- **PII gate (re-scoped from the sibling program's default):** this is a **new tenant-scoped write path** into a section previously CB-only (super-admin band) — portal (tenant-band) staff now write escalation recipient emails directly, through genuinely new infrastructure, not a reused audited path. Flag explicitly for **pii-data-lifecycle-advisor** review; the advisor decides whether this needs the sibling program's G-P2-equivalent rigor or more — do not default to "light" just because it mirrors an existing UI pattern.
- *Adversarial focus:* does the new deep-merge function actually avoid Config Manager's wholesale-replace failure mode (Landmine 2), or does it reintroduce sibling-key-wipe risk in its own code? Does the PII review actually happen, or does "mirrors an existing pattern" get used to wave it through?
- **Agents:** Backend-Engineer, Frontend-Engineer, test-engineer, pii-data-lifecycle-advisor, tech-lead-reviewer.

### T3d — Welcome surfaces config (CB)
- **Scope:** ice-breaker (≤4) + persistent-menu editors; document the operator M5 re-push step (CB does **not** push to Meta — that's the lambda program's M5 script).
- **OWN:** a new CB settings component (ice-breaker list editor + persistent-menu editor) under the T2c Messenger product page + a doc update pointing at the lambda program's M5 re-push script / `docs/runbooks/MESSENGER_OPS.md`.
- **CONSUME:** the T2 chain (T2a/T2b/T2c) — the `messenger_behavior.welcome` shape that the lambda-side M5 `push_welcome_surfaces` reads.
- **PRODUCE:** the CB-side config surface for ice breakers + persistent menu; the operator still runs the re-push script (a stated non-capability, not a bug).
- **Deliverables/tests:** ice-breaker editor enforces the ≤4 cap client-side (C5); persistent-menu editor; component/fixture tests; doc section stating explicitly "CB does not push to Meta — run the M5 re-push script after editing," cross-referenced to `docs/runbooks/MESSENGER_OPS.md` §2.
- **DONE:** an edited ice-breaker set saved via CB round-trips into `messenger_behavior.welcome` in the staging S3 config; the doc explicitly states the manual re-push step; if the operator runs the re-push script, the edited surfaces are visible in a real client.
- *Adversarial focus:* does the UI imply a live push happens when it doesn't? Copy must be honest about the manual step — the same discipline as the "mocks are aspirational, keep truthful state notices" rule.
- **Agents:** Frontend-Engineer, technical-writer, test-engineer.

## 7. Cross-repo gates

- **Backend-first (T2a live before T2c merges).** Same rule as the sibling program's "webhook deploys before processor" — the config-accepting side must be verified live on staging, not merely merged, before the config-editing UI ships. This is the silent-drop gate: without it, T2c's edits would appear to save and then vanish (Landmine 2's exact failure mode, now Messenger-shaped).
- **Wholesale-replace ⇒ always send the whole `messenger_behavior` object.** Baked into T2b's, T2c's, and T3c's tests — every writer of this section sends the complete object, never a partial patch, because Config Manager's merge (and, independently, `Analytics_Dashboard_API`'s deep-merge path in T3c) must never be asked to reconcile partial state.
- **App Review approval gates real-tenant connect; it does not gate role-holder testing.** T3b ships role-holder-testable regardless of App Review status — the milestone in the sibling program's App Review package is a separate, parallel gate for opening the connect flow to real (non-role-holder) tenants.
- **P0c gates T3b/T3c, unconditionally.** Neither subphase's OWN/CONSUME sections above are trustworthy until P0c's decision record exists — if P0c finds the auth topology doesn't bridge, or the write path isn't what's assumed here, T3b/T3c must be re-scoped before they start, not discovered mid-implementation.

## 8. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | T2c ships before T2a — silent drop of Messenger config edits | Backend-first cross-repo gate (§7); T2a's DONE line requires live staging verification, not just merged code |
| R2 | `getMergedConfig` emit line omitted for `messenger_behavior` | T2b's test must fail without the line present (Landmine 1's exact shape) |
| R3 | A partial `messenger_behavior` send wipes sibling keys | Always-send-whole discipline (§7), tested at T2b/T2c/T3c |
| R4 | **(downgraded)** staging Meta OAuth URL doesn't exist | Confirmed to exist (`infra/main.tf:974`) — T3a is env-injection-only, low risk |
| R5 | Operators expect CB to push welcome surfaces directly | It can't — T3d's doc explicitly names the M5 re-push script as the required manual step |
| R6 | Flag-key typo tolerated by the `FeatureFlags` string index signature (`config.ts:572` makes `keyof` = `string`, zero compile protection) | T1's test asserts the exact key string, not just "a flag changed" |
| R7 | The `ESCALATION_EMAIL` env default gets removed before a per-tenant value is proven in prod | Named as a non-goal-adjacent caution (§9) — removal is a decision for the lambda program, not this one, and not until T2/T3 prove the per-tenant path in staging |
| R8 | Config Manager test infra (P0a) is net-new and could itself have gaps | P0a's own DONE line requires 4 named pinned behaviors, not a vague "tests added" |
| R9 | Delegation drift — the portal gains a super-admin-band control without an explicit graduation decision | The blast-radius rule (§4) is the standing check; any future graduation must be recorded, never silent, never reversed |
| R10 | **(new, high)** Portal auth-bridge + write-path: the dashboard likely uses a separate Clerk instance from Config Manager, and writes config via `Analytics_Dashboard_API` (deep-merge/ETag), not Config Manager — T3b/T3c are unfalsifiable and unscoped until P0c resolves this | P0c is a hard, blocking gate on T3b/T3c (§6, §7) — do not treat the portal path as covered by P0's Config-Manager plumbing fix |

## 9. Non-goals

- **Forms/Scheduling page regrouping** into the hybrid products IA — a named follow-up project once T2c's pattern is proven (§3 decision 1/7, §2 Clock 2).
- **Global Notifications service page + forms/scheduling retrofit** — the event→recipients→content→surface model is adopted for Messenger only here; unifying it across products is a separate follow-up (§3 decision 2).
- **SMS lane for Messenger notifications** — the `channels` surface slot is kept, the lane isn't built (tabled, per the sibling program's non-goals and Chris's 2026-07-12 SES-only decision).
- **Deep-merge redesign of Config Manager** — wholesale-replace-per-section semantics are kept; guarded with tests + always-send-whole discipline, not replaced (§3 decision 5).
- **Config Builder auth changes** — P0c investigates the existing Clerk topology; it does not redesign it.

## 10. Relationship to existing docs

- [`MESSENGER_CHANNEL_EXPERIENCE.md`](MESSENGER_CHANNEL_EXPERIENCE.md) §12 — the lambda-side pipeline this program manages; its `feature_flags.MESSENGER_CHANNEL` gate, `messenger_behavior` config contract (C2), and operator checklist are the runtime this program's UI activates and edits. Its §12 execution-evidence log records M0–M8b's code-complete state as of 2026-07-13; the §12 operator checklist + M4-S soak are that program's own gate, independent of this one.
- [`MESSENGER_APP_REVIEW_PACKAGE.md`](MESSENGER_APP_REVIEW_PACKAGE.md) — the Advanced Access / real-tenant-connect gate T3b's role-holder path deliberately does not wait on.
- [`SOP_DEVELOPMENT_WORKFLOW.md`](../../picasso-config-builder/docs/SOP_DEVELOPMENT_WORKFLOW.md) + [`AGENT_RESPONSIBILITY_MATRIX.md`](../../picasso-config-builder/docs/AGENT_RESPONSIBILITY_MATRIX.md) — process + agent selection, applied per-subphase per §6.

## 11. P0c — portal auth topology & write-path (decision record, 2026-07-13)

Spike complete. Both P0c questions are answered against `origin/main` of both repos; **R10 is resolved (not blocking)** and T3b/T3c scopes below are confirmed. No architectural change or human decision was required.

**Clerk topology (verified):** there are two *separate* Clerk apps, and their tokens do **not** cross-validate:
- **`present-skunk-55`** (`present-skunk-55.clerk.accounts.dev`) — the Config Builder's instance. `Picasso_Config_Manager/auth.mjs:15-16` validates against its JWKS.
- **`divine-impala-48`** (`divine-impala-48.clerk.accounts.dev`) — the analytics **dashboard/portal's** instance (`picasso-analytics-dashboard/.env.staging`), and `Analytics_Dashboard_API/lambda_function.py:167-169` validates against **that same** JWKS.

**Why this is fine (the R10 fear was misframed):** the portal never calls Config Manager. Portal config writes go through **`Analytics_Dashboard_API`**, which shares the portal's own `divine-impala-48` instance — so no token ever has to cross the two apps.

**(a) Do dashboard Clerk JWTs validate against the backends the portal calls?**
- `Analytics_Dashboard_API` → **yes**, same instance (`divine-impala-48`). This is the portal's config-write backend for T3c.
- `Meta_OAuth_Handler` (Python) → **not applicable**: it uses **no Clerk**. The OAuth flow is gated by an HMAC-signed **state JWT** (`META_APP_SECRET`) carrying `tenant_id`; `GET /meta/oauth/url?tenant_id=X` takes `tenant_id` as a query param and returns a signed dialog URL. CORS is `Access-Control-Allow-Origin: *`, so the portal origin can call it directly (as CB's `ChannelsSettings` already does). T3b calls the same endpoint.
- `Picasso_Config_Manager` → validates `present-skunk-55`; the portal does **not** use it. (CB does, unchanged.)

**(b) Portal config-write path (confirmed):** `Analytics_Dashboard_API` read-modify-writes `tenants/{id}/{id}-config.json` with S3 `put_object(IfMatch=<etag>)` optimistic locking (`lambda_function.py:7845/7893`; `ConfigETagMismatchError:246`). The `/settings/notifications` PATCH (`handle_settings_notifications_patch:8062`) is the precedent T3c mirrors.

**Confirmed T3b/T3c scope:**
- **T3b** — portal Meta connect card calls `Meta_OAuth_Handler`'s `/meta/oauth/url?tenant_id=…` (staging URL, post-T3a env injection), popup flow mirroring `ChannelsSettings`. No Clerk-instance conflict (state-JWT + CORS `*`). Authz note: the connect endpoint trusts `tenant_id` from the caller + the signed state — the portal must pass the authenticated user's own tenant, not an arbitrary one.
- **T3c** — add a `/settings/messenger` PATCH to `Analytics_Dashboard_API` (a new `handle_settings_messenger_patch` mirroring the notifications handler): authenticate with the portal's `divine-impala-48` Clerk (existing), read-modify-write `messenger_behavior` via the ETag/deep-merge path, send the whole section (always-send-whole). PII gate still applies (new tenant-scoped write into a previously CB-only section).

## 12. Execution status (updated as subphases land)

- **T1** ✅ merged (config-builder#84) — `MESSENGER_CHANNEL` toggle; later relocated to the product page in T2c.
- **P0a** ✅ merged (lambda#456) — first Config Manager test suite + CI node:test job.
- **P0b** ✅ merged (config-builder#85 + lambda#457) — two-tier section contract, both sides.
- **T2a** ✅ merged (lambda#458) — `messenger_behavior` editable; **live on staging** (`Deploy Picasso_Config_Manager` ✓ on merge). Backend-first gate satisfied.
- **T2b** ✅ merged (config-builder#86) — `getMergedConfig` emit + contract sync (20/18) + forward-compat.
- **T2c** ✅ merged (config-builder#87) — Messenger product page + readiness checklist; named pattern-setting review passed (APPROVE WITH CHANGES, both fixes applied).
- **P0c** ✅ this doc §11 — auth topology + write-path resolved; R10 downgraded.
- **T3a / T3b / T3c / T3d** — pending.

> Live browser round-trips (saving via the Clerk-authed staging CB/portal) are operator-verified — a CLI agent cannot mint a browser Clerk session. Each merged PR notes this; the underlying logic is proven by unit/integration tests + red/green checks.
