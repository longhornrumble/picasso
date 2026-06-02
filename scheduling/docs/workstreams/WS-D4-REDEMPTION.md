# WS-D4 — Redemption endpoint handler (§13.7/§13.8)

**Plan task:** D4 (+ the D1a tokenized-action middleware as a CONSUMER — the lib already shipped). [plan](../scheduling_implementation_plan.md) §6.
**Repo / branch / base:** `lambda` · `feature/scheduling-ws-d4-redemption` · base `main`.
**Quality gate:** `verify-before-commit` · weave audit = **FULL** (auth + one-time-use + commit-entry surface — mandatory Security review + operator go-ahead before merge).

## Goal / done-bar (verifiable)
A new Node Lambda **`Scheduling_Redemption_Handler/`** behind a Function URL (the WS-D3 CloudFront origin) that serves the six per-purpose paths and, for each request:
1. Parses the token from `?t=<jwt>` (§13.8) and maps the **URL slug → expected purpose** per the LOCKED §13.8 table (below). A path with no matching slug → 404.
2. Validates + **atomically one-time-redeems** the token by calling the shipped `shared/scheduling/tokens.js` `verify(token, { expectedPurpose, tenantId, ddb })` — which enforces HS256, `iss === 'myrecruiter-scheduling'`, required `iss/iat/exp/jti`, purpose match, and the conditional-PutItem jti claim (§13.7). Map its outcomes to HTTP: bad signature/expired/wrong-iss → **401**; purpose↔URL mismatch → **403**; already-redeemed (`ConditionalCheckFailed`) → **410 Gone**; tampered/garbage → generic **400** (no detail leak, §13.9).
3. On success, fetches the Booking (`tenant_id`+`booking_id`); if absent → render a friendly not-found page (do NOT call any execution module).
4. **Dispatches by purpose:**
   - `cancel` / `reschedule` / `post_application_recovery` → write the **§B10 session-binding row** to the EXISTING `picasso-conversation-scheduling-session-{env}` table (intent + booking_id + 30-min `expires_at`/ttl; recovery carries `form_submission_id` + uses the token exp) and **redirect the volunteer into chat** (`staging.chat.myrecruiter.ai` with the binding's session id). **Do NOT perform the calendar op here** — §13.4: the token authenticates ENTRY only; the calendar change runs in-chat after confirm (WS-D6/WS-D7 modules).
   - `attended_yes` / `no_show` / `didnt_connect` → security path is REAL (validate + redeem), but the disposition action is **`TODO(E6)`** — render a thin "got it" inline page; do not transition the booking yet (E6 owns interviewer disposition).

### §13.8 URL slug → purpose map (LOCKED — copy verbatim)
| URL path | expected `purpose` |
|---|---|
| `/cancel` | `cancel` |
| `/reschedule` | `reschedule` |
| `/resume` | `post_application_recovery` |
| `/attended/met` | `attended_yes` |
| `/attended/noshow` | `no_show` |
| `/attended/noconnect` | `didnt_connect` |

- **Done-bar:** unit tests per path for: valid→bind+redirect (or attendance stub), tampered→400, expired→401, wrong-purpose-for-slug→403, replay→410, cross-class chat-token→401 (`iss`), missing booking→not-found page. Failure pages are thin inline defaults (WS-D5 polishes the coordinator-contact embedding later — leave a `TODO(D5)` seam, render name/email **only if already present** on the booking, never phone).

## You OWN (create/edit ONLY these)
- `Scheduling_Redemption_Handler/` — `index.mjs` (router + per-purpose dispatch + thin failure pages), `package.json`, `esbuild.config.mjs` (mirror a sibling Node consumer — **bundle `@smithy/node-http-handler`, do NOT externalize it**, per the lambda#202 lesson), `__tests__/`.

## You CONSUME (frozen — never modify)
- **§B4 + `shared/scheduling/tokens.js`** (shipped, lambda#186/#192): `verify()` is the SoT validator + one-time-use. Import it; do NOT re-implement token validation or touch the jti table directly.
- **§B10 (LOCKED):** the session-binding row shape you WRITE. Honor it exactly.
- **§B11 (DEFERRED):** validate single-key against env `JWT_SECRET_KEY_NAME` (= `picasso/staging/jwt/signing-key`, the #343 fix). Reference `JWT_SECRET_KEY_NAME_PREV` as a future-reserved env but do NOT implement dual-key (WS-D2).
- **§A Booking** shape (read defensively — `?.` / defaults per schema discipline).

## You PRODUCE
- The redemption Function URL handler (the WS-D3 origin) + the §B10 binding writes the in-chat flow reads.

## OUT OF SCOPE / do NOT
- Do **NOT** build the calendar execution (`reschedule.js` = WS-D6, `cancel.js` = WS-D7) — the in-chat confirm step invokes those; you only set the binding + redirect.
- Do **NOT** build the dual-key validator (WS-D2) or the polished failure pages / coordinator-contact render (WS-D5).
- Do **NOT** write the Lambda's Terraform module, Function URL, or IAM — that is **integrator glue** (picasso→staging, mirror `lambda-booking-commit-staging`). Deliver code + a deploy note listing the env vars + IAM verbs you need (jti-blacklist PutItem on the composite-key table; Booking GetItem; conv-scheduling-session PutItem; `JWT_SECRET_KEY_NAME` GetSecretValue scoped to `picasso/staging/jwt/signing-key-*`).
- Do **NOT** add a 7th purpose or change the §13.8 map.

## References
- Canonical §13.3/§13.7/§13.8/§13.9, §9.4. Plan D4 + D1a. `CLAUDE.md` (never-share-IAM, credential-mutation gate, schema discipline). Lesson: esbuild must bundle `@smithy/node-http-handler` (lambda#202).

## Report-back (in your PR)
- PR `feat(scheduling): WS-D4 redemption endpoint handler (D4)` → **main**.
- Doc-snippet: plan D4 → 🟡 (code-complete, IaC+deploy = integrator); the deploy note (env + IAM verbs); confirm the §13.8 map + the §B10 writes match the locked contracts; flag the in-chat redirect target + chat-session bootstrap as an integration seam.
- Branch, PR#, done-bar status, any contract issue (STOP + flag, don't fork).
