# M4-S Soak Kit — Messenger Channel Experience

> Everything the operator + testers need to run the 48-hour M4-S soak (plan
> §6/§8 — the hard go/no-go before M5+) with zero improvisation. Companion to
> [`MESSENGER_OPS.md`](MESSENGER_OPS.md). Target: staging tenant **MYR384719**
> (both channels connected), `feature_flags.MESSENGER_CHANNEL: true` on its
> staging config.

## 0. Preconditions (once, before the clock starts)

1. `aws sso login --profile myrecruiter-staging`.
2. Run §12 operator-checklist items 1–6 (plan doc) — the soak only starts
   after the pre-soak live checks pass.
3. **Tester roster (G7):** Standard Access means only app role-holders can DM
   the Page/IG account. List the roster in the soak report. Add role-holders
   in the Meta App Dashboard if more testers are needed (propagation is
   minutes). IG Self Messaging API is the synthetic fallback if the roster is
   thin.
4. Confirm `MESSENGER_CHANNEL: true` on MYR384719's staging config and the
   M-Ha alarms are green before starting.

## 1. Conversation script matrix (≥30 conversations, both channels)

Spread across testers and the 48h window; every row at least once per channel.
FB = Messenger app/web; IG = Instagram app (templates are EXPECTED invisible
on IG web — verify in-app, C5).

| # | Scenario | What to send | Expect |
|---|---|---|---|
| S1 | KB question | "what programs do you offer?" | ≤3 sentences, grounded, plausibly 1 LEARN quick reply |
| S2 | Small talk | "hey! how's it going?" | friendly, ZERO buttons/QRs |
| S3 | Thanks/wrap-up | after any answer: "thanks, that's all!" | warm close, no actions |
| S4 | Sustained interest | 3–4 turns staying on ONE program, answering the bot's questions tersely | by turn 3–4: concrete next step proposed + APPLY/commitment rendering; NO fourth exploration question |
| S5 | QR tap | tap a rendered quick reply | answer matches the CTA's intent (canonical query), NOT an echo of the tap label |
| S6 | Free-text fallback (C9) | TYPE the text of a QR you can see instead of tapping | same quality answer as tapping |
| S7 | URL button | tap a rendered button | link opens; thread shows the button persisting |
| S8 | Attachment | send a photo | polite fallback text ≤30s, no silence |
| S9 | Sticker/GIF | send one (FB; IG fires no webhook — note it) | FB: fallback text; IG: nothing (expected, log it) |
| S10 | Edit | edit a sent message | no duplicate reply; history row updated (spot-check item 12 below) |
| S11 | Delete | delete a sent message | no crash; history row gone (spot-check) |
| S12 | Rapid-fire | send 3 messages in <2s | ONE coherent combined reply (C7), not three interleaved |
| S13 | Session reset | first message after a >24h gap (schedule for day 2) | disclosure line appears again; funnel restarts cleanly |
| S14 | Long-answer bait | "explain everything about all programs and requirements" | still ≤3 sentences-ish, offers to narrow down |
| S15 | GET_STARTED | new tester's first contact / tap Get Started | welcome message |

## 2. Observation queries (CloudWatch Logs Insights, log group `/aws/lambda/Meta_Response_Processor`, region us-east-1, staging 525)

**Tail-leak audit (MUST be zero rows):**
```
fields @timestamp, @message
| filter @message like /<<<ACTIONS/
| filter @message like /Sending response|Sent message chunk|sendResponseMessages/
| sort @timestamp desc
```
(Belt-and-suspenders: testers also visually confirm no `<<<ACTIONS` ever
appears in a received message.)

**Tail-emission + validity rates (§12 DONE metric):**
```
fields @timestamp, @message
| filter @message like /Messenger V5 tail/
| stats count() by @message
```
`tail parsed` vs `missing/malformed - fail-soft` counts → emission rate;
compare with round-4 evidence (45/45).

**Silent-drop audit (MUST be zero unexplained):**
```
fields @timestamp, @message
| filter @message like /Event validation failed|dropping/
| sort @timestamp desc
```
Every hit must map to an intentional case (stale >24h event, malformed).
Webhook side (`/aws/lambda/Meta_Webhook_Handler`): `Intentional skip` lines
are fine; anything else that neither queued nor logged a skip is a FAIL.

**Send failures / channel health:**
```
fields @timestamp, @message
| filter @message like /META_SEND_FAILURE/
| stats count() by @message
```
Any `token_dead`/`page_restricted` during the soak = stop, fix, restart clock.

**Serialization (S12 verification):**
```
fields @timestamp, @message
| filter @message like /Coalesced onto the in-flight turn|Drain/
```

## 3. Data spot-checks (DynamoDB, after S10/S11 and day 2)

- `picasso-recent-messages`, key `meta:{pageId}:{psid}`: rows carry
  `expires_at` (epoch s, ≈ +7d) and user rows carry `mid`; the S11-deleted
  mid's rows are GONE; the S10-edited row's `content` + `text_en` both show
  the edited text.
- `picasso-conversation-state`: lock rows appear during S12 and are gone
  after; no orphaned `lock` rows older than ~3 minutes.

## 4. Go/no-go report template (paste into plan §12 under M4-S)

```
### M4-S — soak report <date range>
- Conversations: <n> (FB <n>/IG <n>), testers: <roster>
- Script coverage: S1–S15 × channel matrix — <gaps, if any, and why>
- Tail leaks: 0 required — <result> (query + visual)
- Silent drops: <result — every drop mapped to an intentional case?>
- Tail emission/validity: <x/y> (round-4 baseline 45/45)
- Rendering: QRs <ok?>, URL buttons <ok?>, IG in-app templates <ok?>
- C7 rapid-fire: <combined-reply observed?>; C8 session reset: <disclosure re-fired?>
- Hygiene: expires_at/mid <ok?>, edit/delete <ok?>
- Send failures: <none / classified + resolved>
- Deviations/surprises:
- **GO / NO-GO for M5+:** <decision + who>
```

## 5. If NO-GO

File the failing observation as a §12 deviation, fix forward on `main`
(staging-only, normal subphase discipline), and restart the 48h clock. The
gate is the point — do not soften it.
