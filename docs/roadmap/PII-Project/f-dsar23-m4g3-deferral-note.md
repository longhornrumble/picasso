# F-DSAR23 / M4.G3 — deferral note (proposed stopgaps rejected)

**Status:** Deferred-with-named-trigger. Authored 2026-06-07. **Owner:** Chris Miller.
**D5 row:** F-DSAR23 (consumer-facing trust; L/M). **Milestone:** M4.G3.

## Decision (operator, 2026-06-07)
The two quick dispositions previously proposed for M4.G3 were **reviewed and rejected** as inadequate
("poor and ill-informed"). Specifically:
- **(a) Widget bullet** — neither *qualify-the-bullet* nor *remove-the-bullet* was accepted as the right answer for
  the consumer-facing retention claim.
- **(b) Per-`form_type` TTL matrix** — the suggested windows (volunteer 180d / donor 90d / contact 60d / default 365d)
  were **not** adopted. Setting retention windows for donor/volunteer PII is a data-minimization **policy** decision
  (and a likely counsel input), **not** an engineering stopgap to be picked under a 30-day backstop.

**→ M4.G3 is NOT closed via either stopgap. It is deferred to a proper design** done at the right altitude
(retention policy first, then widget copy that reflects it), under the named triggers below. No code/widget change
is made now.

## What stands today (so the deferral is honest, not silent)
- **The misleading-by-omission risk is bounded by what's already shipped:** M4 #1 removed the false "No personal
  information stored permanently" claim; M4 #2 put a real 365d server-side TTL on form-submission rows (and the
  M4.G2 prod backfill stamped the historical rows). So the *substantive* retention posture is defensible; what
  remains is (i) the surviving browser-storage bullet's wording and (ii) per-`form_type` differentiation.
- **The privacy notice (M8.G1) is the canonical disclosure surface** — widget bullets are operator-facing settings
  panel detail. The right widget copy is the copy that points to / matches the published privacy notice.

## Named promotion triggers (carry M4.G3 forward)
- (a) **M8.G1 privacy-notice drafting starts** — do the retention policy + widget copy together, so the bullet
  reflects the published notice (the proper sequence the stopgaps skipped).
- (b) **Counsel-Q1 (G-I) response** if it imposes/【recommends】retention windows — counsel sets the policy, then
  engineering implements the matrix.
- (c) **Atlanta tenant-#2 LOI** (tenant-trust posture).
- (Original calendar backstop 2026-06-22 is **superseded** by this deliberate deferral; the item now rides the
  trigger list above rather than a fixed date.)

## Related (do not conflate)
The **recent-messages TTL-disabled** finding (master-plan rev 0.39; surfaced again in
[[f-dsar4-subject-linkage-design]] §2) is a *separate* clean fix (the writer already populates `expires_at`; the
table just lacks a `ttl{}` block) — it does **not** require the retention-policy decision above and can be done
independently whenever an M4 IaC pass happens.

## References
D5 row F-DSAR23 · `Picasso/src/components/chat/StateManagementPanel.jsx:535-538` (surviving bullet) ·
`Bedrock_Streaming_Handler_Staging/form_handler.js:574` (365d ttl) · M8.G1 (privacy notice) ·
[[f-dsar4-subject-linkage-design]] (recent-messages TTL caveat).
