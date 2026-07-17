# Prod tenant-creation checklist — demo zone (P4, gated)

**Status: DRAFT (P0 deliverable). Do not execute — P4 is gated on P1–P3 completing and on Chris's explicit go.**

Why manual: `promote-tenant-config.yml` is **existing-tenant-only** — its prod write-role deliberately lacks `dynamodb:PutItem` for registry rows. For the ≤2 tenants the demo zone needs, a one-time gated manual checklist beats building generalized new-tenant promotion. Generalizing that automation is a **separate backlog item** benefiting all onboarding; it is explicitly **not** a demo-zone gate (roadmap §9 note).

Every step is staging-first. Nothing here runs against prod (614) until the same step has been executed and verified in staging (525).

---

## Blockers — resolve before this checklist can be executed

| # | Blocker | Why it blocks | Owner |
|---|---|---|---|
| B1 | **Tenant-hash fork.** `deploy_tenant_stack:884` (RETIRED per `picasso-config-builder/CLAUDE.md:517`) → `de8bef17d2096b`. Live `Picasso_Config_Manager/index.mjs:240` → `8bef17d2096bd2`. Every existing tenant matches the *retired* shape. | The hash is the mapping-file key, the widget embed value, and the seeder's DDB key scope. Getting it wrong means the config is authored against one hash and the seeder writes another — silent empty dashboards. | Chris |
| B2 | **Website entry points can't be minted** (`validation.mjs:12` allows `standalone`/`campaign` only). | Determines whether the microsite carries per-page `?ep=` values. Entry-point ids must be minted BEFORE the microsite spec (roadmap §5). | Chris |
| B3 | **`self_booked_pct` / `median_first_response_minutes` are aggregator-nulled.** | Seeded history would show values the live current month cannot. Cosmetic but visible mid-demo. | Decide at P2 |

---

## Preconditions

- [ ] P1–P3 complete: staging demo tenant renders the full story, seeder covers all surfaces, reset proven idempotent, microsite live on staging.
- [ ] Full staging rehearsal passed end-to-end as the demo user.
- [ ] B1 resolved — the demo tenant's real hash is known and written down here: `________________`
- [ ] Chris's explicit go for prod. This is a **HARD STOP** gate, not a formality.

## Step 1 — Tenant config

- [ ] Author `DEMO-YS01` config in **staging** Config Builder from `demo-zone/personas/brightpath/` (persona.json + forms.json).
- [ ] Verify staging: all 6 CTAs `ai_available: true`, 4 forms enabled, `V4_ACTION_SELECTOR: true`, all `dashboard_*` flags on.
- [ ] Promote to prod via the existing gated promote workflow (config only — this part IS supported for an existing tenant, so create the tenant first, then promote config).
- [ ] Verify: `aws s3 cp s3://myrecruiter-picasso/tenants/DEMO-YS01/DEMO-YS01-config.json - | jq '.feature_flags'`

## Step 2 — Mapping file (mandatory glue)

- [ ] Write `s3://myrecruiter-picasso/mappings/{hash}.json` = `{tenant_id, tenant_hash}`.
- [ ] **Without this, hash↔id reverse lookup fails and every Conversations/Forms query silently returns empty.** This is the single most likely cause of a "why is it blank" moment.
- [ ] Verify: `aws s3 cp s3://myrecruiter-picasso/mappings/{hash}.json -`

## Step 3 — Registry row

- [ ] `picasso-tenant-registry` row mapping `tenantId` → `clerkOrgId`.
- [ ] Requires `dynamodb:PutItem` — **the promote workflow's role deliberately lacks this**. Use operator SSO credentials, not the CI role.
- [ ] Verify: `aws dynamodb get-item --table-name picasso-tenant-registry --key '{"tenantId":{"S":"DEMO-YS01"}}'`

## Step 4 — Clerk org + demo user

- [ ] Create the Clerk org for `DEMO-YS01`.
- [ ] Create a **dedicated demo user**, member of ONLY this org.
- [ ] **Do not demo as super-admin** — the tenant-switcher dropdown renders real customer names, one misclick from a prospect's screen (roadmap §2).
- [ ] Verify: log in as the demo user; confirm no tenant switcher, correct org.

## Step 5 — KB

- [ ] Author persona `.md` + `.md.metadata.json` (with `metadataAttributes.tenantId`) into `s3://kbragdocs/tenants/DEMO-YS01/`.
- [ ] `StartIngestionJob` (pattern: `kb_proposal_applier/bedrockSync.mjs`).
- [ ] **Confirm the job reaches COMPLETE — not merely "started."** Sync latency is minutes.
- [ ] Verify: ask the prod widget a question only the KB can answer.

## Step 6 — Seeder IAM role

- [ ] Terraform `picasso-demo-seeder` role into prod via **targeted** apply.
- [ ] **Never un-targeted `terraform apply` against prod** (CLAUDE.md hard rule).
- [ ] Confirm the inline policy's `dynamodb:LeadingKeys` conditions exact-match the demo tenant's keys, and that `picasso-session-events` is scoped by the reserved `SESSION#session_demo_*` prefix (that table is keyed by session, not tenant — it cannot be scoped any other way).
- [ ] Verify negative: attempt a write against a NON-demo tenant key and confirm `AccessDenied`. **An IAM guard that has never been proven to deny is not a guard.**

## Step 7 — Seeder run

- [ ] **Dry-run first and review the output in the same session** (CLAUDE.md hard rule; `--dry-run` is the seeder's default).
- [ ] Execute.
- [ ] Verify: log in as the demo user; every surface renders the arc; the six-month attribution history is present.
- [ ] **Key audit: confirm zero non-demo rows were touched.**

## Step 8 — Live-send hygiene

- [ ] Set the demo tenant's notification recipients to a **MyRecruiter-owned address** (`demo@myrecruiter.ai`).
- [ ] **Never `@example.org`** — real SES sends to fake domains bounce and damage sender reputation (roadmap §7).
- [ ] Verify: complete a form live; confirm the notification arrives at the owned address.

## Step 9 — PII inventory

- [ ] Add the demo tenant to `docs/roadmap/PII-Project/pii-inventory.md` and classify it against `data-classification.md`, **in the same PR** (CLAUDE.md Living-Inventory PR Rule).
- [ ] Synthetic data lowers the stakes but does not remove the surface.

## Step 10 — Prod rehearsal

- [ ] Live chat on the microsite → appears in Conversations.
- [ ] QR scan from a phone → appears in the dashboard (**depends on the `/go/` ep-forwarding fix having shipped**).
- [ ] Reset runs clean (dry-run purge reviewed → execute → reseed).
- [ ] Chris signs off demo-ready.

---

## Rollback

Data plane: run the guarded reset's purge step (allowlisted to demo tenant IDs) — dry-run first.

Identity/config plane: **reset never touches these by design** (roadmap §2/§4.4), so undoing Steps 1–5 is manual — delete the config, mapping, registry row, Clerk org/user, and KB docs by hand, in reverse order.

**No customer data is at risk in any step here** — every write is scoped to `DEMO-YS01`. The risk being managed is the *scoping itself* failing, which is why Step 6's negative test is not optional.
