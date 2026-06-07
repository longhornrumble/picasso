# F-DSAR3 — notification-sends/-events recipient writer-normalization (design-only closure)

**Status:** Design-only decision doc closing **M9 done-bar #3**. Authored 2026-06-07.
**D5 row:** F-DSAR3 (OPEN M/M). **Owner:** Chris Miller. **Disposition: DEFER durable fix with named triggers.**

> **Advisory, not legal advice.**

## §1 — The gap
The notification writers store `recipient` **verbatim** (no `.strip().lower()`):
- email — `Lambdas/lambda/Master_Function_Staging/form_handler.py:802`
- SMS — `Lambdas/lambda/SMS_Sender/index.mjs:127`

If a row was written `Person@Example.COM` and the operator's DSAR subject-identifier normalizes to
`person@example.com`, a naive equality match would false-negative. (Distinct from F-DSAR1: that's a *temporal*
attribute gap on form-submissions; this is a *normalization* gap on the notification surfaces.)

## §2 — Current mitigation (already live — the gap is bridged, not open)
The DSAR walker `_walk_notification_sends` does a tenant-scoped Query then a **case-insensitive Python post-filter**
(`.strip().lower()` on both sides) — lambda PR #136 ("audit fix-now-2", 2026-05-21). So **every row is reachable by
the DSAR walk today**, regardless of stored casing. New rows continue to be written un-normalized but remain
walker-reachable.

## §3 — The durable design (deferred)
Writer-side normalization at both sinks — `recipient = recipient.strip().lower()` (Python) /
`recipient.trim().toLowerCase()` (Node) — before the PutItem in `form_handler.py` (email) and `SMS_Sender/index.mjs`
(SMS). Effect: rows stored canonical → the walker's post-filter becomes belt-and-suspenders rather than load-bearing,
and any future *non-walker* consumer (analytics join, dedup) also benefits.

## §4 — Why deferred + named promotion triggers
Deferred from the fix-now bundle because the change touches **two additional Lambdas** with a different blast radius
than the walker, and the walker fully mitigates the DSAR-reachability risk today. **Promote to build when any:**
- (a) a Phase-1.5 / similar **MFS write-path normalization sweep** is scoped — **batch with F-DSAR4** (same
  writer-path class) and consider the recent-messages TTL fix (M4.G3 / rev 0.39) in the same sweep;
- (b) operator workflow surfaces a **real miss** the walker post-filter didn't catch;
- (c) **tenant-count growth** makes the walker's per-DSAR Query + post-filter RCU/bandwidth cost material.

Re-classify to L/L once writer normalization lands. **Severity holds M/M** today (low DSAR frequency; walker
mitigates).

## §5 — References
D5 row F-DSAR3 · lambda PR #136 (walker post-filter) · writers `form_handler.py:802` + `SMS_Sender/index.mjs:127` ·
sibling deferral [[f-dsar4-subject-linkage-design]] (batch the writer-path sweep).
