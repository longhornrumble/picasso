# WS-WIDGET — widget `?session=` forward (B1-frontend, §B12 consumer side)

**Plan task:** B-minimal / Track B1 (frontend). [plan](../D_DEPLOY_AND_C_CHAT_INTEGRATION_PLAN.md).
**Repo / branch / base:** `picasso` · `feature/scheduling-ws-widget` · base `staging`.
**Quality gate:** `verify-before-commit` · weave audit = **LIGHT** (frontend param plumbing; no auth logic — the backend enforces).

## Goal / done-bar (verifiable)
When the redemption Lambda redirects a volunteer to the chat widget at `…/?session=<uuid>`, the widget must **read that `?session=` query param on load and forward it to the backend** (Master_Function / Bedrock handler) on the chat session-start request, alongside the `tenant_id` it already sends. The backend then resolves the §B10 binding via `(tenant_id from context, session_id=<uuid>)` (§B12) — **the widget passes ONLY the opaque `session` value; it does NOT read the binding or the tenant from the URL** (tenant comes from the widget's existing config).
- **FIRST — confirm the surface (Q-B1 residual):** locate where the widget reads URL params + constructs the backend request, and how `tenant_id` is already sent. If the widget does NOT currently forward arbitrary query params to the backend, that's the gap to close. **If the surface differs materially from this brief, STOP and flag it** (the frontend surface wasn't pre-mapped).
- **Done-bar:** a load with `?session=abc` results in the backend request carrying `session=abc` (assert via the existing request-construction test or a new one); a load WITHOUT `?session=` is unchanged (no regression to normal chat); the value is passed opaquely (no parsing/validation client-side).

## You OWN (create/edit ONLY these)
- The widget's URL-param/session-forwarding code + its test (the exact file(s) you confirm in step FIRST — e.g. under `Picasso/src/` widget bootstrap / request construction). List them in your PR. **Nothing outside that.**

## You CONSUME (frozen — never modify)
- **§B12** (the backend contract you feed — you supply `session_id`; the backend supplies `tenant_id`). The widget's existing tenant-config + backend-request path (extend minimally; match existing style).

## You PRODUCE
- The `?session=` → backend forward. (No JS contract others import — this is the widget edge.)

## OUT OF SCOPE / do NOT
- Do NOT resolve the binding, read the booking, or render any scheduling UI (that's WS-CONVO / B-remainder). Do NOT read tenant from the URL. Do NOT touch shared docs/IaC. Do NOT add token/JWT handling (the redemption Lambda already burned the token before redirect).

## References
- §B12, §13.4 (the binding is the enforcement; the widget just forwards the opaque session). `CLAUDE.md` (surgical changes, match existing style).

## Report-back
- PR `feat(scheduling): WS-WIDGET forward ?session= to backend (B1-fe)` → staging. Snippet: plan B1-fe → 🟢 + the file(s) you owned + the confirmed surface. Flag the surface if it differed.
