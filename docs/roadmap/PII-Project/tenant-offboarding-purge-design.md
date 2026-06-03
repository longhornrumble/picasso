# Tenant-Offboarding Purge — Design Doc

**Status:** v0.1 — **Sign-off complete 2026-06-03** (§8 decisions RESOLVED); build follows P1-first per §7. Design-doc-first per operator decision 2026-06-03.
**Owner:** Chris Miller.
**Routes to:** the one genuine build in [`data-retention-strategy.md`](./data-retention-strategy.md) §9 ("Per-tenant offboarding purge"); master plan M9 "new capability".
**Scope:** delete a churned tenant's conversational PII across all surfaces after a 30-day grace, with documented carve-outs. Staging-first; prod is a later gated step.
**Citations:** `code:file:line` (repo) or `live:<acct>` (read-only AWS). Surfaces below were ground-truthed against the DSAR Lambda's existing walkers and `data-retention-strategy.md` v0.2.

> **Advisory, not legal advice.** Sets internal engineering policy for the offboarding purge. The consent/audit carve-outs (§5) and any processor-vs-controller deletion obligation remain counsel-gated per strategy §7.

---

## §1 — Why this is NOT a trivial DSAR extension

The instinct is "the DSAR Lambda already deletes PII — add a `request_type=tenant_purge`." That is the wrong shape, and the reason is architectural, not cosmetic:

**The DSAR Lambda is subject-scoped.** Every walk begins by resolving one `pii_subject_id` from `picasso-pii-subject-index-staging` (code:`picasso_pii_dsar_staging/lambda_function.py:443`), then filters each surface by that subject (`FilterExpression Attr("pii_subject_id").eq(...)`, or chains the subject's `session_id`s). Remove the subject and **every walker loses its filter predicate** — there is nothing left to scope the delete except the tenant partition, which the DSAR walkers do not use as a delete key.

**A tenant purge is partition-scoped.** It deletes *all* of a tenant's rows. The surfaces fall into four reachability classes (§3), and only some are cleanly tenant-partitioned. Bolting `tenant_purge` onto the DSAR Lambda would:
- broaden its IAM from per-subject DeleteItem to whole-partition delete (a materially larger blast radius on a Lambda whose safety model is "one subject at a time"),
- fork every walker into two code paths (subject-filter vs no-filter),
- and still not solve the hard surfaces (session-keyed enumeration, `tenant_hash` discovery, the Glacier archive) — those are the same gaps the DSAR Lambda already defers.

**Recommendation (carried from strategy §9):** a **new dedicated Lambda** (`picasso-pii-tenant-purge-staging`), own execution role, dry-run-default, manual operator-invoke. It *reuses the DSAR Lambda's hard-won patterns* (account guard, append-only audit, dry-run default, corrupted-row skip, bounded fan-out, redaction-in-logs) as a code template, but does **not** share its handler or IAM. This is recorded here for sign-off, not yet built.

---

## §2 — Inputs, trigger, and lifecycle

### Trigger (v1 = manual)

There is **no churn signal in the system today.** `Calendar_Watch_Offboarder` only stops Google Calendar watch channels (code:`Calendar_Watch_Offboarder/index.js`) — it is not a tenant-lifecycle event. So:

- **v1: manual operator invoke**, exactly like the DSAR Lambda. The operator decides a tenant has churned + the 30-day grace has elapsed, then invokes with `dry_run=true`, reviews the plan, then `dry_run=false`.
- **v2 (later, out of scope here):** wire an automated 30-day-post-churn trigger once a tenant-lifecycle/registry churn event exists. The scheduling project's offboarding flow is the likely event source (strategy §3/§4) — this Lambda is its eventual consumer.

### Invocation contract (proposed)

```json
{
  "tenant_id":     "<tenant_id>",
  "operator":      "<email of operator>",
  "purge_id":      "<uuid>",
  "grace_confirmed": true,
  "dry_run":       true
}
```

- `dry_run` defaults **true** (cannot delete by accident; mirrors DSAR `:18`).
- `grace_confirmed` is an explicit operator attestation that the 30-day grace has elapsed — a second deliberate gate distinct from `dry_run=false`. Both must be set to delete.
- `purge_id` is the audit ledger reference (operator-supplied uuid).

### Lifecycle

1. Account guard — refuse outside the expected account (DSAR pattern `:259`).
2. Validate input; default `dry_run=true`.
3. Resolve the tenant's `tenant_hash` (needed for session-summaries — §4).
4. Enumerate + delete per surface class (§3), dry-run-counting unless `dry_run=false AND grace_confirmed=true`.
5. Append-only audit: `purge_requested → surface_purged:<surface> (one per surface) → closed`, with per-surface counts + the carve-out list (DSAR audit pattern `:564`).
6. Return `{purge_id, status, rows_touched:{...}, manual_followups:[...], carve_outs_retained:[...]}`.

---

## §3 — Surface taxonomy (the core of the design)

Every PII-bearing surface from strategy §2, classified by **how a tenant purge reaches it.** Disposition differs by class.

### Class A — Tenant-partitioned (clean: Query by tenant key → DeleteItem)

| Surface | Tenant key | Notes |
|---|---|---|
| `picasso-form-submissions` | PK=`tenant_id` (code:`lambda_function.py:653`) | Query whole partition, delete all. The cleanest surface. |
| `picasso-notification-sends` | PK=`TENANT#<tenant_id>` (code:`:797`) | Whole-partition delete. Yields `message_id`s to chain into events. |
| `picasso-pii-subject-index` | PK=`tenant_id` | The re-identification key for this tenant's subjects — **delete** (no subject survives the tenant). |
| `picasso-sms-usage` | `tenant_id`+month | Already 30d TTL (strategy §2) → ages out; purge is belt-and-suspenders. |

**Disposition:** direct Query + DeleteItem per partition. Idempotent (re-running deletes nothing new). This is ~80% of the structured PII by surface count and is genuinely easy.

### Class B — Session-keyed (no tenant attribute; reachable only by enumerating the tenant's sessionIds)

| Surface | Key | Reachability problem |
|---|---|---|
| `recent-messages` (`staging-recent-messages`) | PK=`sessionId`, **no tenant attr** (code:`:1068` docstring) | Tenant purge has no single subject's session list. **But 24h TTL now enabled** (strategy §5 #1) → self-purges within 24h of the last turn, long before the 30-day grace ends. |
| `picasso-session-events` | PK=`SESSION#{sessionId}` (code:`:76`) | Same — no tenant attr. **90d TTL enabled** → ages out within 90d. |
| `picasso-archive-staging` | `sessions/{sessionId}/` S3 prefix (code:`:162`) | Staging-only (prod has no archive). Session-keyed. |
| `picasso-notification-events` | `message_id` (ByMessageId GSI, code:`:155`) | Reachable by chaining the `message_id`s from the Class-A notification-sends purge — **so this one IS reachable** for a tenant purge (delete every send row's events). |

**Disposition (recommended):**
- **`recent-messages` + `session-events`: rely on TTL age-out** (24h / 90d), do not enumerate. Rationale: by the time a 30-day grace elapses, recent-messages is already gone (24h) and session-events is ≤60 days from full age-out. Enumerating all of a tenant's sessions to force-delete a buffer that self-deletes in 24h is effort with near-zero marginal benefit. **Document this as a deliberate disposition, not a gap.** (If a tenant must be erased *faster* than TTL, that is a separate "expedited erasure" requirement — flag, don't build into v1.)
- **`notification-events`: chain off the notification-sends `message_id`s** (the purge already has them from Class A) and delete — reuse the DSAR `_walk_notification_events` pattern directly.
- **`picasso-archive-staging`: enumerate `sessions/` prefix.** This is the one Class-B surface worth an active walk in staging, *if* we can scope it to the tenant. **Open issue (§4):** the archive prefix is `sessions/{sessionId}/` with no tenant in the key — scoping a prefix-delete to one tenant requires the tenant's session list (same enumeration problem). Realistic v1 disposition: archive is staging-only + hand-managed bucket; let its (to-be-confirmed) lifecycle age it out, or accept a manual-followup. **Prod has no archive** so this surface does not exist in the surface that matters long-term.

### Class C — Tenant-partitioned but by `tenant_hash`, not `tenant_id`

| Surface | Key | Problem |
|---|---|---|
| `picasso-session-summaries` | PK=`TENANT#{tenant_hash}` (code:`:207` DEFERRED_SURFACES) | Pseudonymized summary, **now 365d TTL** (strategy §2). Tenant-partitioned, but by `tenant_hash` — requires `tenant_id → tenant_hash` discovery. This is the **same F-DSAR31 blocker** the DSAR Lambda defers. |
| `production-conversation-summaries` / `staging-conversation-summaries` | (operational summary) | **7d TTL** (strategy §2) — ages out fast; likely TTL-disposition. Confirm key shape during build. |

**Disposition:** session-summaries is the **one surface where the purge does real work the TTL won't do fast enough** (365d window). It needs `tenant_hash` discovery resolved — see §4. conversation-summaries (7d) → TTL age-out.

### Class D — Not tenant-partitioned at all (age-out only)

| Surface | Why unreachable per-tenant | Disposition |
|---|---|---|
| `myrecruiter-cloudwatch-logs` (Glacier log archive) | Partitioned by **log group, not tenant** (strategy §3 caveat, §4 gap) | **Age-out at 365d.** Per-tenant delete is itself a build (Glacier object enumeration + redaction is already applied). Strategy §3/§4 explicitly accept age-out here. Document, don't build. |
| CloudWatch live log groups | 7-day retention, by log group | Age-out (7d). |

---

## §4 — The three hard sub-problems (must resolve before/within build)

1. **`tenant_id → tenant_hash` discovery (Class C, session-summaries).** Same blocker as DSAR F-DSAR31. Options: (a) operator passes `tenant_hash` on the purge event; (b) look it up via tenant-registry; (c) derive it the same way the writer does (find + cite the hash function — `code:` lookup needed during build). **Recommend (a) for v1** (operator already knows the tenant; one explicit field; no new dependency), with (b)/(c) as the durable fix. Resolving this for the purge *also unblocks the DSAR session-summaries walker* — shared win.
2. **Session enumeration for Class B archive (staging-only).** No tenant key on `sessions/` prefix. v1 recommend: accept lifecycle/manual-followup (staging-only, prod has no archive). Revisit only if staging erasure-speed becomes a real requirement.
3. **Expedited-erasure vs TTL-age-out.** The §3 dispositions lean on TTL for Class B/D. That is correct for *retention hygiene* but is NOT instantaneous erasure. If a churn scenario ever needs "tenant gone in 24h, not 90d," that is a distinct requirement to flag — do not silently assume TTL covers it.

---

## §5 — Carve-outs that survive the purge (do NOT delete)

Per strategy §3 / §4 (counsel-gated):

| Surface | Why retained |
|---|---|
| `picasso-sms-consent` (opt-in proof + **STOP/opt-out rows**) | Legal floor (4–5yr) — affirmative-defense proof you had consent and proof they said STOP. STOP rows **never** expire (strategy §2). |
| SES account-level suppression list | Protective retention; never expires. |
| `picasso-pii-dsar-audit` / audit tables | Append-only by policy (Art 17(3)(b) carve-out, DSAR `:220`). The purge **writes** audit rows here; it never deletes them. |

The purge must **explicitly list retained carve-outs in its response + audit** so an operator/auditor sees they were intentionally kept, not missed.

---

## §6 — Safety model (reuse DSAR's, don't reinvent)

- **Account guard** — refuse outside the expected account; `tenant_purge` is far more destructive than a per-subject DSAR, so the guard is non-negotiable (DSAR `:259`).
- **Dual gate** — delete requires `dry_run=false` **AND** `grace_confirmed=true`. Either alone = dry-run count.
- **Dry-run default** — absent/typo'd fields can never delete (DSAR `:429`).
- **Append-only audit** — every invocation writes `purge_requested → surface_purged:<s> → closed`, idempotent on `(purge_id, event_timestamp)` (DSAR `:564`).
- **Corrupted-row skip + per-surface delete-failure counts** — one bad row never aborts the cascade (DSAR `:700`).
- **Bounded fan-out** — cap per-surface work to stay under the Lambda timeout; overflow → manual_followup (DSAR `:171`).
- **Redaction in logs** — never log raw `content`/email; key fields only (DSAR `:1120`).
- **Idempotent re-run** — re-invoking after a partial failure deletes only what remains.

---

## §7 — Proposed build phasing (after sign-off)

1. **P1 — Class A only** (form-submissions, notification-sends, subject-index, sms-usage) + notification-events chain + full safety model + audit. This is the high-value, low-risk core; ~80% of structured PII; no hard sub-problems. Staging-first, dry-run validated against the seeded fixture tenant, then a real churned-tenant dry-run.
2. **P2 — Class C session-summaries** once `tenant_hash` discovery is decided (§4.1). Shared with DSAR F-DSAR31.
3. **P3 — automated trigger** when a churn signal exists (scheduling offboarding). Out of scope until then.
4. Class B (recent-messages/session-events) + Class D (Glacier) are **TTL-age-out dispositions** — documented, not built, unless an expedited-erasure requirement appears.

Each phase: own PR, `verify-before-commit`, `pii-inventory.md` updated per the Living-Inventory Rule (this Lambda + its IAM are new PII-touching surfaces), staging-soak before any prod consideration.

---

## §8 — Sign-off decisions (RESOLVED 2026-06-03)

All five resolved by the operator 2026-06-03; the build follows these verbatim.

- **Q-A — DECIDED:** dual-gate (`dry_run=false` + `grace_confirmed=true`) + **manual-invoke v1** (no automated trigger until a churn signal exists).
- **Q-B — DECIDED: TTL-age-out is acceptable** for recent-messages (24h) + session-events (90d) + Glacier (365d). v1 does **NOT** promise sub-TTL erasure; the purge does not force-delete Class B/D. (Revisit only if a counsel/processor obligation requires faster.)
- **Q-C — DECIDED: operator passes `tenant_hash`** on the purge event (one explicit field; no new dependency). Also unblocks the DSAR session-summaries walker (F-DSAR31). Build P2.
- **Q-D — DECIDED: P1 Class A core first** (form-submissions + notification-sends/events + subject-index + sms-usage), then P2 session-summaries.
- **Q-E — DECIDED:** `picasso-archive-staging` is **not** actively walked in v1 — staging-only + lifecycle/manual-followup is acceptable (prod has no archive).

---

## §9 — Out of scope

- The automated churn trigger (no signal exists today).
- Prod deployment (staging-first; prod is a later gated decision per Deployment SOP).
- Per-tenant deletion inside the Glacier log archive (age-out at 365d per strategy §3/§4).
- Expedited/instant erasure faster than TTL (separate requirement if it ever arises).
- Any change to the carve-out surfaces (consent/suppression/audit) — those are counsel-gated.
