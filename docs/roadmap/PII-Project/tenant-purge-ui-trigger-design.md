# Tenant-Purge UI Trigger — Design Doc

**Status:** v0.1 — **Sign-off complete 2026-06-03** (§9 decisions RESOLVED: type-tenant-id confirm, stateless backend); build = P1 staging slice per §8. Design-doc-first per operator decision 2026-06-03.
**Owner:** Chris Miller.
**Builds on:** the P1 purge Lambda — [`tenant-offboarding-purge-design.md`](./tenant-offboarding-purge-design.md) (deployed + soak-validated on staging 2026-06-03; lambda#214 / picasso#362). This doc adds the **super-admin UI trigger** for it, replacing the manual `aws lambda invoke` CLI step.
**Relates to:** [`../SUPER_ADMIN_PORTAL.md`](../SUPER_ADMIN_PORTAL.md) (the Admin panel this lives in).
**Citations:** `code:file:line` (repo) or `live:<acct>` (read-only AWS).

> **Advisory, not legal advice.** Exposes an irreversible whole-tenant deletion behind a UI button. The carve-outs + counsel-gated items inherit from the purge design §4/§5/§7.

---

## §1 — Purpose

Today the purge runs only via manual `aws lambda invoke` (purge design §2). The analytics dashboard already has a **super-admin Admin panel** with Tenant Management (`_require_super_admin` guard at code:`Analytics_Dashboard_API/lambda_function.py:326-327`; tenant endpoints at `:445,450`; UI `picasso-analytics-dashboard/src/pages/admin/TenantDetailPanel.tsx`). That panel is the natural home for a **"Delete tenant data"** action: an authenticated super-admin previews what will be deleted, confirms, and the dashboard backend invokes the purge Lambda — turning a CLI step into a governed, audited, identity-attributed workflow.

This is **v2 of the trigger** (purge design §2 named manual-invoke as v1; this is the UI wire-up). It is **not** the automated 30-day-post-churn trigger — that still needs a churn signal and stays deferred.

---

## §2 — The load-bearing constraint: the account boundary

The purge Lambda is **staging-only** — its account guard refuses to run outside acct **525** (code:`picasso_pii_tenant_purge_staging/lambda_function.py` `EXPECTED_ACCOUNT`). The dashboard backend is **environment-symmetric**: it resolves its registry table as `picasso-tenant-registry-{ENVIRONMENT}` (code:`tenant_registry_ops.py:19`), i.e. there is a **staging** dashboard API (acct 525) and a **prod** dashboard API (acct 614).

| Path | Account math | Status |
|---|---|---|
| **Staging dashboard (525) → staging purge Lambda (525)** | same account — IAM identity grant suffices; account guard passes | **buildable + validatable NOW** |
| **Prod dashboard (614) → purge Lambda** | needs the purge Lambda **promoted to prod (614)** with its account guard updated to allow 614 | **gated prod-cutover — deferred** |

Cross-account invoke (614 → 525) is **off the table** — it violates the CLAUDE.md account-isolation hard rules. So this doc builds + proves the trigger in **staging** (against the already-soak-validated Lambda); prod is its own gated promotion later. This matches the staging-first strategy exactly.

**Note on staging realism:** staging tenants are synthetic/demo, so a staging purge doesn't delete real-customer data — but it validates the *entire UI→endpoint→Lambda→audit path* end-to-end, which is the point of the staging slice.

---

## §3 — Architecture (data flow)

```
TenantDetailPanel.tsx  ──POST /admin/tenants/{id}/purge {dry_run:true}──►  Analytics_Dashboard_API
   (super-admin)                                                              _require_super_admin
   "Delete tenant data"                                                       operator := auth email
        │                                                                     purge_id := server uuid
        │  ◄──── preview: rows_touched + carve_outs_retained ────────────────  lambda.invoke(dry_run=true)
        │
   typed confirmation
        │
        └──POST .../purge {dry_run:false, grace_confirmed:true}──►  Analytics_Dashboard_API
                                                                     lambda.invoke(picasso-pii-tenant-purge-staging)
           ◄──── result: deleted + rows_touched + audit_row_pks ────  (the soak-validated Lambda)
```

No new persistence in the dashboard — the purge Lambda owns the deletion + its own immutable audit table. The dashboard is a thin, authenticated, identity-stamping proxy.

---

## §4 — Backend endpoint contract

New route in `Analytics_Dashboard_API/lambda_function.py`, mirroring the existing `/admin/tenants/{id}` dispatch (code:`:445,450`):

- **Route:** `POST /admin/tenants/{tenant_id}/purge`
- **Handler:** `handle_admin_tenant_purge(user_role, tenant_id, body)`
- **Auth:** first line is the existing `_require_super_admin(user_role)` guard (403 otherwise).
- **Server-stamped, NOT client-supplied:**
  - `operator` := `auth_result['email']` (the authed super-admin; code:`:326`). The client cannot spoof who ran it — the audit records the real actor.
  - `purge_id` := server-generated `uuid4()` (one per request; the ledger ref).
- **Client-supplied body (whitelisted):** `{ "dry_run": bool, "grace_confirmed": bool }` only. Any other field rejected.
- **Action:** `boto3.client('lambda').invoke(FunctionName='picasso-pii-tenant-purge-staging', Payload=...)`, synchronous (`RequestResponse`), pass `{tenant_id, operator, purge_id, grace_confirmed, dry_run}`.
- **Response:** return the Lambda's JSON verbatim (`status, deleted, rows_touched, carve_outs_retained, manual_followups, audit_row_pks`) + the server `purge_id`.
- **Forward-compat read:** the handler tolerates the Lambda response missing any field (`.get()` per the schema-discipline rule).

**Tenant existence check (recommended):** before invoking, confirm `tenant_id` exists in the registry (reuse the detail path) so a typo'd id returns a clean 404 instead of a silent zero-row purge.

---

## §5 — IAM wiring (staging, same-account)

The staging dashboard API exec role (code:`infra/modules/lambda-analytics-dashboard-api-staging/main.tf:143`, output `role_arn` at `:427`) currently has **no outbound `lambda:InvokeFunction`** grant. Add, scoped to exactly the purge function ARN:

```hcl
# in the dashboard module (or a small grant block referencing the purge module output)
statement {
  sid       = "InvokeTenantPurge"
  actions   = ["lambda:InvokeFunction"]
  resources = [module.lambda_pii_tenant_purge_staging[0].function_arn]  # output exists, main.tf:241
}
```

Same-account (525→525) ⇒ an **identity-based grant on the caller role is sufficient**; no `aws_lambda_permission` resource-policy entry on the purge function is required (the existing `operator_only` permission does not exclude same-account identity-granted principals). Least-privilege: scoped to the one function ARN, `InvokeFunction` only.

**Wire direction:** pass the purge module's `function_arn` output into the dashboard module via `infra/main.tf` (both are staging-gated modules already in `main.tf`). One new variable on the dashboard module.

---

## §6 — Frontend UX (preview → typed-confirm)

In `TenantDetailPanel.tsx`, a **"Delete tenant data"** action (visually destructive — red, separated from edit fields):

1. **Click → Preview modal.** Calls `purgeTenant(tenantId, {dryRun:true})` (new method in `analyticsApi.ts`, mirroring `fetchAdminTenantDetail` at code:`:665`). Renders the dry-run result: a per-surface `rows_touched` table + the `carve_outs_retained` list ("these will be KEPT: consent/STOP, suppression, audit"). Nothing deleted.
2. **Typed confirmation.** The operator must type the tenant id (or company name) to enable the red **Permanently delete** button — GitHub-style destructive-action guard. A short note states irreversibility + that carve-outs survive.
3. **Confirm → real purge.** Calls `purgeTenant(tenantId, {dryRun:false, confirm:true})` → backend sends `dry_run=false, grace_confirmed=true`. Renders the result (`deleted:true`, final `rows_touched`, `audit_row_pks`).
4. **Audit reference.** Show the returned `purge_id` + audit row count. (A full audit-history view is out of scope for v1 — §10.)

---

## §7 — Security model

- **Super-admin only** — `_require_super_admin` on the endpoint (the same guard protecting tenant edit).
- **Operator identity is server-derived** from the auth token (`auth_result['email']`), never the client body → the immutable audit always records the real actor.
- **`purge_id` server-generated** → no client control of the audit key.
- **Dual gate preserved end-to-end** — the UI preview = `dry_run=true`; the real delete requires the typed confirmation which drives `dry_run=false` + `grace_confirmed=true`. The Lambda still enforces both (the UI cannot bypass the Lambda's gate).
- **Single-flight** — the Lambda already has `reserved_concurrent_executions=1`; two super-admins can't race the same tenant.
- **Irreversibility guard** — typed confirmation in the UI; the dry-run preview makes the blast radius explicit before anyone confirms.
- **Carve-outs unchanged** — consent/STOP, suppression, audit survive (purge design §5); the Lambda's role can't reach them regardless of the trigger.

---

## §8 — Build phases

1. **P1 (staging slice — buildable now):** backend endpoint + `_require_super_admin` + server-stamped operator/purge_id + IAM invoke grant + `analyticsApi.purgeTenant` + `TenantDetailPanel` preview/confirm UI. Validate against the soak-validated staging Lambda (same account). Backend (lambda#) + IaC (picasso, base=staging) + frontend (picasso-analytics-dashboard).
2. **P2 (prod promotion — gated, deferred):** promote the purge Lambda to prod 614 (account guard updated to allow 614, prod IaC), grant the **prod** dashboard role invoke, and the prod Admin panel inherits the button. This is the deliberate prod-cutover decision per the Deployment SOP — not part of the staging slice.

---

## §9 — Sign-off decisions (RESOLVED 2026-06-03)

- **Q-A — DECIDED: type the tenant id** to enable the delete button (GitHub-style, unambiguous).
- **Q-B — DECIDED: stateless** — each call independent; the UI does preview→confirm but the backend does not enforce ordering. The Lambda's dual gate + the typed-confirm are the safety; no server state.
- **Q-C — DECIDED:** `grace_confirmed` in the UI is the super-admin's **manual attestation** (the typed confirm), same as the CLI — no system-tracked 30-day churn clock yet (that's the deferred automated trigger).
- **Q-D — DECIDED:** v1 shows the immediate response (`purge_id` + counts); a full purge-audit-history browser is deferred.

---

## §10 — Out of scope

- The **automated** 30-day-post-churn trigger (still needs a churn signal — purge design §2).
- **Prod** deployment of the purge Lambda or the prod dashboard endpoint (P2, gated).
- **P2 of the purge itself** (Class C session-summaries) — independent of the trigger.
- A full purge-audit-history browser in the Admin panel (v1 shows the immediate result only).
- Any change to the carve-out surfaces or the Lambda's deletion logic (the trigger is a thin proxy; the Lambda is unchanged).
