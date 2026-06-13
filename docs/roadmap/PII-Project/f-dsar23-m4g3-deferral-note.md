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

## F0 amendment (2026-06-13) — scheduling enablement re-triggers this

**Scheduling v1 changes the honesty basis of the 2026-06-07 deferral.** That deferral rested on "the *substantive*
retention posture is defensible; what remains is wording" (§"What stands today"). That is **no longer true for a
scheduling-enabled tenant**: bookings persist 365 days (`Bedrock_Streaming_Handler_Staging/form_handler.js` TTL is
form-only; the booking table has **no** TTL), so the surviving bullet `✅ Data retention: 30 minutes session storage`
(`StateManagementPanel.jsx`) is **affirmatively FALSE**, not merely misleading-by-omission. The F-DSAR23 deferral
did **not** cover an affirmatively-false claim.

**Operator decision (2026-06-13): apply the conservative scoped fix NOW.** Drop the false specific number; point to
the privacy notice / per-data-class retention. Implemented this PR in `StateManagementPanel.jsx` →
`✅ Data retention varies by data type; see our privacy notice for details`.

**Engineering note — applied UNCONDITIONALLY (not gated on scheduling-enabled):** the settings panel receives only
`isOpen`/`onClose` and has **no per-tenant scheduling signal in scope**; threading one would be disproportionate to a
one-line copy fix. More importantly, the "30 minutes" number was **already** misleading for non-scheduling retained
data (365d form-submission rows, notification rows), so removing the false specific number is strictly more honest for
**all** tenants — there is no tenant for whom "30 minutes session storage" was true. This is a deliberate broadening
of the operator's "for scheduling-enabled tenants" framing on the engineering judgment that the gated alternative
would perpetuate a false claim for non-scheduling tenants.

**What REMAINS deferred (unchanged):** the deeper M4.G3 work — the retention **policy** + per-`form_type` TTL matrix —
still rides the named triggers above. This fix removes the affirmatively-false *number*; it does **not** set the
retention policy. The booking/scheduling-session retention windows (and a scheduling-session TTL — the table has TTL
**DISABLED**, verified 2026-06-13) are a policy + counsel decision tracked in the F0 plan §12 item 2.

## Related (do not conflate)
The **recent-messages TTL-disabled** finding (master-plan rev 0.39; surfaced again in
[[f-dsar4-subject-linkage-design]] §2) is a *separate* clean fix (the writer already populates `expires_at`; the
table just lacks a `ttl{}` block) — it does **not** require the retention-policy decision above and can be done
independently whenever an M4 IaC pass happens.

## References
D5 row F-DSAR23 · `Picasso/src/components/chat/StateManagementPanel.jsx:535-538` (surviving bullet) ·
`Bedrock_Streaming_Handler_Staging/form_handler.js:574` (365d ttl) · M8.G1 (privacy notice) ·
[[f-dsar4-subject-linkage-design]] (recent-messages TTL caveat).
