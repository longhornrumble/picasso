# Workload Blast-Radius Enforcement — Phase 2: Egress Containment (design + first increment)

**Status:** DESIGN (2026-06-16). Phase 1 (permission boundaries) shipped to all staging workload roles (picasso#582/#583); SR-1 grant cleanup (picasso#585). This doc designs Phase 2 and scopes the first staging increment.

## Why Phase 2 exists (the honest residual Phase 1 left open)

Phase 1's permission boundary is **anti-escalation / anti-tamper**: it caps what a compromised workload can *become* (no IAM escalation, no cross-account, no bulk export, no self-implant). It does **not** stop a compromised workload from `POST`-ing data it can *legitimately read* — OAuth refresh tokens, form submissions, PII, conversation content — to an **arbitrary external endpoint**, because:

- **All ~38 staging Lambdas run outside any VPC** → unrestricted outbound internet.
- **No VPC Flow Logs** → not even a network record tomorrow.

Phase 2 closes the read-then-`POST`-anywhere channel. This is "the change that most reduces real personal-data exposure" (the PII review's own conclusion).

## Threat closed

A compromised workload (stolen credential, dependency-injection, RCE in a handler) tries to exfiltrate the data it can read to `https://attacker.example`. Today that succeeds silently. After Phase 2: the `POST` to a non-allowlisted FQDN is **dropped at the network layer** and **logged** (Flow Logs + firewall alert).

## Egress inventory (what legitimately leaves the account)

Machine-derived from the Lambda source (`grep` for external HTTPS, node_modules excluded). **The only non-AWS destinations any workload needs:**

| External destination | Used by | Purpose |
|---|---|---|
| `oauth2.googleapis.com`, `www.googleapis.com`, `accounts.google.com` | calendar/scheduling cluster (Calendar_OAuth_Connect, Booking_Commit_Handler, Calendar_Watch_*, Reminder_Scheduler, Stranded_Booking_Remediator, DSAR calendar-delete, Scheduling_Synthetic_Monitor) | Google OAuth + Calendar API |
| `graph.facebook.com`, `www.facebook.com` | Meta_OAuth_Handler, Meta_Response_Processor | Meta Messenger Graph API |
| `api.dub.co` | Attribution_Mint_Service, Attribution_Aggregator, kb_proposal_applier | short-link mint / stats |

**Everything else is AWS** (DynamoDB, S3, Secrets Manager, KMS, Bedrock runtime, SES, SQS/SNS, CloudWatch Logs, STS, EventBridge Scheduler) → reachable via **VPC endpoints with no internet path at all**.

This is the allowlist. It is small, stable, and PR-reviewable — adding a destination is a deliberate change, exactly like the per-tenant secret grants in Phase 1.

## Architecture

```
                 ┌─────────────────────── VPC (10.x/16, us-east-1) ───────────────────────┐
                 │  private subnets (multi-AZ, no IGW route)                                │
                 │   ┌──────────────┐                                                       │
   Lambda ──────▶│   │ Lambda ENIs  │── AWS API calls ─▶ VPC ENDPOINTS (no internet):       │
   (in-VPC)      │   └──────┬───────┘     • Gateway (free): S3, DynamoDB                     │
                 │          │             • Interface: secretsmanager, kms, bedrock-runtime, │
                 │          │               bedrock-agent-runtime, ses, sqs, sns, logs,      │
                 │          │               sts, scheduler, monitoring                       │
                 │          │                                                                │
                 │          └── external HTTPS ─▶ AWS Network Firewall ─▶ NAT GW ─▶ internet │
                 │                                 (FQDN allowlist:                          │
                 │                                  *.googleapis.com, accounts.google.com,   │
                 │                                  graph.facebook.com, api.dub.co)          │
                 │                                                                           │
                 │  VPC Flow Logs ──▶ CloudWatch Logs / S3   (the network record)            │
                 └───────────────────────────────────────────────────────────────────────┘
```

**Components:**
1. **VPC + private subnets** (multi-AZ). No internet gateway route on the workload subnets.
2. **VPC endpoints** for every AWS service workloads use. Gateway endpoints (S3, DynamoDB) are free and route-table-based; interface endpoints (the rest) are ~$7/mo each + data. This removes the internet path for AWS calls entirely (and is faster + more reliable than NAT for AWS traffic).
3. **NAT Gateway** for the small set of external HTTPS destinations.
4. **AWS Network Firewall** (stateful, in front of NAT) with a **domain allowlist** (TLS SNI / HTTP Host) — only the four FQDN groups above egress; everything else is dropped + logged. (Alternative: a squid forward proxy on Fargate — cheaper but more ops; Network Firewall is managed + the right default.)
5. **VPC Flow Logs** → CloudWatch Logs (and/or S3) — the per-connection network record that's missing today. Add a metric filter + alarm on `REJECT` records to ops-alerts.

**Endpoint policies** double down on the boundary: each interface-endpoint policy can restrict to the account's own resources (defense-in-depth with the §2 cross-account Deny).

## Known hard parts (call them out, don't discover them)

- **Lambda-in-VPC cold start**: modern (Hyperplane ENI) VPC Lambdas no longer pay the old multi-second ENI penalty, but cold starts still rise slightly. The high-traffic, latency-sensitive path is **BSH streaming** — increment it LAST, after the pattern is proven on the calendar cluster, and measure p50/p99.
- **NAT + interface-endpoint cost**: ~11 interface endpoints (~$75/mo) + NAT (~$32/mo + data). Real but small; the gateway endpoints (S3/DynamoDB, the heavy traffic) are free.
- **Subnet/ENI capacity**: size subnets for peak concurrent ENIs (reserved-concurrency caps from Phase 1 help bound this).
- **Network Firewall FQDN filtering** works on TLS SNI — fine for these HTTPS destinations. Domain-fronting is out of scope (the boundary + Flow Logs detect anomalies).
- **The DSAR calendar-delete + the scheduling cluster share the Google allowlist** — one firewall rule group covers them.

## What this does NOT solve (deferred to later phases)

- **`bedrock:InvokeModel` as an output channel** (a compromised role asks the model to emit data) — model-layer concern, not network.
- **Exfil via the legit SES sender** to an attacker recipient — needs SES recipient/config-set controls (separate).
- **Org-level guardrails (SCPs)** + **detective layer** (GuardDuty/Config/CloudTrail data events + the `DeleteRolePermissionsBoundary` alarm, NTH-3) — Phase 3.

## First increment (the proof — staging, one Lambda group)

**Target: the calendar/scheduling cluster's narrowest member first — `Calendar_OAuth_Connect`** (calls Google OAuth + writes the coordinator token to Secrets Manager; self-contained; not latency-critical).

1. Stand up the VPC + private subnets + gateway endpoints (S3, DynamoDB) + interface endpoints (secretsmanager, kms, logs, sts) + NAT + Network Firewall (allowlist `accounts.google.com` + `oauth2.googleapis.com` + `www.googleapis.com`) + Flow Logs. **(Terraform module `vpc-egress-staging`.)**
2. Move `lambda-calendar-oauth-connect-staging` into the VPC (private subnets + the SG).
3. **Prove (the done-bar):**
   - **Reachability**: a live OAuth-connect flow still works (reaches Google + writes the secret via the endpoint).
   - **Containment**: from the Lambda, an outbound `POST` to a non-allowlisted domain (e.g. `https://example.com`) is **dropped** by Network Firewall (the exfil test).
   - **Observability**: the Flow Log shows the allowed Google connection AND the dropped exfil attempt; the `REJECT` alarm fires.
4. Then widen to the rest of the calendar cluster (same allowlist), then the meta cluster (Facebook allowlist), then attribution (Dub), then — last, with latency measurement — BSH/MFS.

**Increment is reversible**: removing the Lambda's `vpc_config` returns it to the current (open-egress) state.

## Sequencing vs Phase 1

Phase 1 (boundaries) is independent and already shipped. Phase 2 endpoint policies *reference* the boundary's account-scoping as defense-in-depth but don't depend on it. Build Phase 2 in staging, prove the increment, then promote the pattern to prod per the Deployment SOP (prod is the higher-value target — that's where customer PII lives — but prod VPC migration of BSH is the highest-risk step and goes last).
