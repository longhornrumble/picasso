# MyRecruiter Sub-Processor List

**Last updated:** 2026-05-20.
**Authoritative as of this date.** Material additions or removals are notified to tenants per the tenant DPA notice clause (drafted post-counsel response on Q1 of the input package).
**Scope:** the vendors MyRecruiter (as the SaaS processor) engages to deliver the Picasso platform service. **This list does NOT include tenant-configured downstream destinations** (n8n / Sheets / CRMs / custom webhooks / per-tenant fulfillment S3 buckets) — those are the tenant's (controller's) choices, outside MyRecruiter's sub-processor scope.

## Why this list exists

Under CCPA / CPRA service-provider obligations and standard SaaS DPA practice, MyRecruiter discloses its sub-processors so tenants (the businesses / controllers) can:
- Accept the list at onboarding.
- Receive notice of additions / removals (per tenant DPA notice clause).
- Object to a specific sub-processor if their own privacy program requires (with tenant termination right if MyRecruiter cannot accommodate).

The list also feeds the counsel input package (Q1 — controller/processor determination) and the tenant-#2 (Atlanta) DPA negotiation when triggered.

## Sub-processors (active as of 2026-05-20)

| Sub-processor | Purpose | Data categories processed | Region / jurisdiction | Notes |
|---|---|---|---|---|
| **Amazon Web Services, Inc.** | Compute (Lambda), storage (DynamoDB, S3), KMS, transactional email (SES), notification queueing (SQS / SNS), observability (CloudWatch), Bedrock model invocation infrastructure | All Tier 1–4 categories (per D4 classification) — incl. consumer PII, AI-inferred summaries, operator PII, Tier 4 secrets | US (`us-east-1` primary; cross-region inference profile pending verification per D2 Finding 13) | The primary cloud platform. Accounts: prod 614056832592 + staging 525409062831. AWS standard DPA / data processing addendum applies. |
| **Anthropic, PBC** (Claude model via AWS Bedrock) | LLM provider — generates chat responses + AI-inferred conversation summaries | Prompts (chat content; user message); KB-retrieved chunks; assistant responses | US (accessed via AWS Bedrock `us-east-1`; AWS Bedrock model-invocation logging account-level state unverified per D2 Finding 13) | Anthropic does not train on customer data routed via AWS Bedrock per AWS Bedrock terms. Verified on Anthropic's published policy. |
| **Telnyx LLC** | SMS sending + inbound (transactional notifications + opt-in / STOP handling) | Recipient phone (E.164); message body | US | Telnyx DPA in place; secret access scoped to two SMS-twin Lambdas via CMK + resource policy per Phase D audit. |
| **Stripe, Inc.** | Tenant billing (subscription / usage charges) | Tenant-level: stripe customer id, billing event metadata. **NO consumer PII.** | US | Tenant-level operations only. Stripe webhook handler is hand-managed (D2 Finding 6). |
| **Meta Platforms, Inc.** (Facebook / Messenger Graph API) | Channel integration — inbound chat from tenant Facebook Pages + outbound replies | Page-Scoped User IDs (PSIDs); inbound message text; outbound message text; tenant Facebook Page metadata | US (Meta Platforms Inc.) | Meta Platform Terms govern; encrypted page tokens stored at item-level CMK (`kms-channel-tokens-staging`) per D2 §B. |
| **Clerk Inc.** | Tenant-operator authentication (admin portal SSO) | Tenant operator email; Clerk user/org id | US | Operator-PII only (tenant-employee accounts); no consumer PII. CPRA-employee-rights treatment is a counsel-input question (Q2 in input package). |
| **Firecrawl** | Knowledge Base content scraping for tenants (Bedrock KB ingestion) | Tenant-curated nonprofit website content (no consumer PII under normal use; living-inventory PR rule fires if tenant ingest patterns change) | US | KB content is curated tenant-public content per the strategy doc; PII presence is a tenant-misconfiguration risk (D2 §C row). |

## Sub-processors explicitly NOT used (as of 2026-05-20)

Listed for clarity — if any of these change, the list above updates with a notice.

- No analytics / observability vendor beyond AWS CloudWatch (no Datadog, Sentry, New Relic, etc.).
- No customer-data platform (no Segment, Rudderstack, etc.).
- No email-marketing platform (transactional only, via AWS SES).
- No chat / support tool (no Zendesk, Intercom, etc.).
- No tag manager or marketing-tracking vendor on the widget.
- No payment-processor besides Stripe.
- No identity provider besides Clerk.

## What is NOT in this list (and why)

**Tenant-configured downstream destinations.** When a tenant configures their Picasso instance with `fulfillment_type: webhook | external | s3` and identifies their own n8n flow / CRM / Google Sheet / S3 bucket, that destination is **the tenant's choice** as the controller of their volunteer/donor/supporter data. MyRecruiter delivers the data per the tenant's instructions; the destination is not MyRecruiter's sub-processor. The tenant is responsible for the destination's privacy posture and for honoring data-subject rights at that destination. MyRecruiter coordinates by notifying the tenant when a DSAR arrives (per `templates/tenant-sink-deletion-request.md`).

**Development-only tooling** that does not enter the data plane (GitHub for source control; CI runners; etc.) — these are not sub-processors because no consumer or tenant data flows through them.

## Notice mechanism

When this list materially changes (new sub-processor; sub-processor removed; sub-processor scope materially expanded), MyRecruiter notifies tenants via the email address registered for privacy notices in the tenant DPA. Tenants have a notice period (specific number TBD by counsel per Q1) to object; if objection cannot be accommodated, tenant retains termination right per DPA.

Routine notice items (region change within the US; vendor name change without scope change) do not trigger notice.

## Audit trail

This file is the authoritative public record. Git history is the audit trail. When changes ship, the commit message describes the change + the notice that was sent.
