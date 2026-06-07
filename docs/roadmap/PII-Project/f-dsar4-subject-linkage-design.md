# F-DSAR4 — recent-messages subject-linkage (design-only closure)

**Status:** Design-only decision doc closing **M9 done-bar #4**. Authored 2026-06-07.
**D5 row:** F-DSAR4 (OPEN M/M today; H/H by impact). **Owner:** Chris Miller. **Disposition: DEFER durable fix with named triggers.**

> **Advisory, not legal advice.**

## §1 — The gap (structural, not temporal)
The `recent-messages` writer (`Lambdas/lambda/Master_Function_Staging/conversation_handler.py:762-770`) emits
`sessionId / messageTimestamp / role / content / messageId / expires_at` — **no `email`, no `pii_subject_id`, no
`tenantId`**. The DSAR walker `_walk_recent_messages` reaches sessions only via the chained walk from
form-submissions. So a subject who **chatted in the widget without ever submitting a form** has no durable subject
linkage on the message row and is structurally unreachable by the automatic walk. Free-text `content` may carry
user-typed PII (incl. third-party references). Distinct from F-DSAR1: an Apply-2 backfill **cannot** close F-DSAR4 —
there is no subject identifier on the row to backfill against.

## §2 — Current mitigation (compensating, NOT primary) — ⚠️ with a caveat
The D5 row frames the exposure as a bounded **0–72h window** (nominal 24h `MESSAGES_TTL_HOURS` +
≤48h DDB TTL eviction grace), plus a walker `manual_followup` (sessionId-direct query / last-resort content-substring
scan). **⚠️ CAVEAT discovered 2026-06-02 (master-plan rev 0.39):** `staging-recent-messages` has **no `ttl{}` block**
(DDB TTL is **DISABLED**, only PITR) even though the writer populates `expires_at`. So the 0–72h eviction bound the
compensating control relies on **is not actually operational today** — rows do not auto-expire → the structural
exposure window is currently **unbounded**, not 0–72h. This makes the recent-messages TTL remediation
(routed to **M4 / M4.G3**) a prerequisite for F-DSAR4's stated mitigation to hold.

## §3 — The durable design (deferred)
Writer-side **subject-linkage emission** in `conversation_handler.py`: when the subject is known from session context,
stamp `pii_subject_id` (or a `subject_email_hash`) on each message row — making recent-messages directly walkable like
form-submissions. **Alternative**: rotate `sessionId` on each new subject-context boundary. Either has cross-Lambda
blast radius (touches the `Master_Function_Staging` request path), so it was deferred from the walker bundle. The
access-export projection already drops internal identifiers (`sessionId/messageId/expires_at`) per Art-15
data-minimization.

## §4 — Why deferred + named promotion triggers
**Promote to build when any:**
- (a) a **Phase-1.5 MFS write-path sweep** is scoped — **batch with F-DSAR3** (same writer-path class);
- (b) operator workflow surfaces a **real chat-only-no-form DSAR miss**;
- (c) DSAR volume × the structural-exposure-window timing makes the gap material.
- **Prerequisite for the *interim* mitigation**: land the **recent-messages `ttl{attribute_name="expires_at"}`** fix
  (M4.G3 / rev 0.39) so the compensating eviction window is real while the durable writer fix stays deferred.

**Severity** holds M/M today (low DSAR frequency × narrow *intended* window); **H/H by impact** when a chat-only
subject DSARs — and currently elevated by the disabled-TTL caveat in §2 until the M4 TTL fix lands.

## §5 — References
D5 row F-DSAR4 · writer `conversation_handler.py:762-770` (+ `:44` `MESSAGES_TTL_HOURS`, `:769` `expires_at`) ·
TTL caveat: master-plan rev 0.39 + M4.G3 · sibling deferral [[f-dsar3-writer-normalization-design]] (batch the sweep).
